// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
//
// STANDARD DOWNLOADS STORE (WORKORDER-standardDownloads-101526)
//
// Holds the golden's downloads manifest as POST /api/standard-downloads-manifest answered it (every entry, unfiltered:
// the Downloads page and the explorer's Downloads section filter it themselves, so a filter change costs no request),
// and fetches one zip at a time from POST /api/standard-downloads-file. A fetched zip is checked against the manifest's
// sha256 in the browser before it is handed to the person, and a mismatch is reported, never saved. Neither the page
// nor the explorer touches axios.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const standardDownloadsStoreInitObject = {
	manifest: null,
	manifestLoading: false,
	statusMsg: '',
	downloadingDownloadId: '',
	downloadStatusMsg: '',
	lastSavedDownloadId: '',
};

const MANIFEST_URL = '/api/standard-downloads-manifest';
const FILE_URL = '/api/standard-downloads-file';

// a refusal arrives as text (or, for a file request made as a blob, as a Blob of text)
const refusalTextOf = async (error, operationName) => {
	const responseData = error.response?.data;
	if (typeof responseData === 'string' && responseData) return responseData;
	if (responseData instanceof Blob) return (await responseData.text()) || error.message;
	return error.message || `the ${operationName} request failed`;
};

const sha256HexOf = async (arrayBuffer) => {
	const digestBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
	return Array.from(new Uint8Array(digestBuffer)).map((oneByte) => oneByte.toString(16).padStart(2, '0')).join('');
};

export const useStandardDownloadsStore = defineStore('standardDownloadsStore', {
	state: () => ({ ...standardDownloadsStoreInitObject }),

	getters: {
		entryList: (state) => (state.manifest ? state.manifest.entryList : []),
		// the entries of one standard, source first
		entryListOfStandardKey() {
			return (standardKey) => this.entryList.filter((oneEntry) => oneEntry.standardKey === standardKey).sort((left, right) => (left.facet === 'source' ? -1 : 1) - (right.facet === 'source' ? -1 : 1));
		},
		standardKeyListOfFamily() {
			return (standardFamily) => [...new Set(this.entryList.filter((oneEntry) => oneEntry.family === standardFamily).map((oneEntry) => oneEntry.standardKey))];
		},
	},

	actions: {
		// loads the manifest once; a second call answers from what is held unless reload is asked for
		async loadManifest({ reload = false } = {}) {
			if (this.manifest && !reload) return true;
			const loginStore = useLoginStore();
			this.manifestLoading = true;
			this.statusMsg = '';
			try {
				const response = await axios.post(MANIFEST_URL, {}, { headers: { ...loginStore.getAuthTokenProperty, 'Content-Type': 'application/json' } });
				const manifest = Array.isArray(response.data) ? response.data[0] : null;
				if (!manifest || !Array.isArray(manifest.entryList)) {
					this.statusMsg = 'the server answered without a downloads manifest';
					this.manifest = null;
					return false;
				}
				this.manifest = manifest;
				return true;
			} catch (error) {
				this.manifest = null;
				this.statusMsg = await refusalTextOf(error, 'downloads manifest');
				return false;
			} finally {
				this.manifestLoading = false;
			}
		},

		// fetches one zip, checks it against the manifest's sha256, and hands it to the browser to save
		async downloadEntry(entry) {
			const loginStore = useLoginStore();
			this.downloadingDownloadId = entry.downloadId;
			this.downloadStatusMsg = '';
			try {
				const response = await axios.post(FILE_URL, { downloadId: entry.downloadId }, { headers: { ...loginStore.getAuthTokenProperty, 'Content-Type': 'application/json' }, responseType: 'blob' });
				const zipArrayBuffer = await response.data.arrayBuffer();
				const receivedSha256 = await sha256HexOf(zipArrayBuffer);
				if (receivedSha256 !== entry.sha256) {
					this.downloadStatusMsg = `${entry.fileName} arrived damaged (sha256 ${receivedSha256}, the manifest says ${entry.sha256}); it was not saved`;
					return false;
				}
				const objectUrl = URL.createObjectURL(new Blob([zipArrayBuffer], { type: 'application/zip' }));
				const saveLink = document.createElement('a');
				saveLink.href = objectUrl;
				saveLink.download = entry.fileName;
				document.body.appendChild(saveLink);
				saveLink.click();
				saveLink.remove();
				setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
				this.lastSavedDownloadId = entry.downloadId;
				return true;
			} catch (error) {
				this.downloadStatusMsg = await refusalTextOf(error, 'download');
				return false;
			} finally {
				this.downloadingDownloadId = '';
			}
		},
	},
});
