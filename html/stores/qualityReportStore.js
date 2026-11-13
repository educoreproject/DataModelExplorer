// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
//
// QUALITY REPORT STORE (Certification page, TQ 2026-11-08)
//
// Holds the catalog of published mapping-quality reports as POST /api/quality-report-catalog answered it (which one is the
// live graph's, the history, and any folder the server could not read), the pages already opened, by folder (POST
// /api/quality-report-page), and fetches one download at a time (POST /api/quality-report-file). The server files each
// report under the graph it measured by content identity; this store never decides which report is the live graph's, it
// reads liveReportFolderName. All three endpoints are public, so a visitor who is not signed in sends no Authorization
// header and a signed-in person sends their token. The page never touches axios.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const qualityReportStoreInitObject = {
	catalog: null,
	catalogLoading: false,
	catalogStatusMsg: '',
	pageByFolderName: {},
	pageLoadingFolderName: '',
	pageStatusMsg: '',
	downloadingDownloadName: '',
	downloadStatusMsg: '',
};

const authHeadersOf = (loginStore) => (loginStore.authtoken ? { ...loginStore.getAuthTokenProperty } : {});

const CATALOG_URL = '/api/quality-report-catalog';
const PAGE_URL = '/api/quality-report-page';
const FILE_URL = '/api/quality-report-file';

// a refusal arrives as text (or, for a file request made as a blob, as a Blob of text)
const refusalTextOf = async (error, operationName) => {
	const responseData = error.response?.data;
	if (typeof responseData === 'string' && responseData) return responseData;
	if (responseData instanceof Blob) return (await responseData.text()) || error.message;
	return error.message || `the ${operationName} request failed`;
};

export const useQualityReportStore = defineStore('qualityReportStore', {
	state: () => ({ ...qualityReportStoreInitObject, pageByFolderName: {} }),

	getters: {
		reportList: (state) => (state.catalog ? state.catalog.reportList : []),
		catalogEntryOf() {
			return (reportFolderName) => this.reportList.find((oneEntry) => oneEntry.folderName === reportFolderName) || null;
		},
	},

	actions: {
		// loads the catalog once; a second call answers from what is held unless reload is asked for
		async loadCatalog({ reload = false } = {}) {
			if (this.catalog && !reload) return true;
			const loginStore = useLoginStore();
			this.catalogLoading = true;
			this.catalogStatusMsg = '';
			try {
				const response = await axios.post(CATALOG_URL, {}, { headers: { ...authHeadersOf(loginStore), 'Content-Type': 'application/json' } });
				const catalog = Array.isArray(response.data) ? response.data[0] : null;
				if (!catalog || !Array.isArray(catalog.reportList)) {
					this.catalogStatusMsg = 'the server answered without a quality-report catalog';
					this.catalog = null;
					return false;
				}
				this.catalog = catalog;
				return true;
			} catch (error) {
				this.catalog = null;
				this.catalogStatusMsg = await refusalTextOf(error, 'quality-report catalog');
				return false;
			} finally {
				this.catalogLoading = false;
			}
		},

		// loads one report's page once (a report folder's page never changes under the same folder name in one visit)
		async loadPage(reportFolderName) {
			if (this.pageByFolderName[reportFolderName]) return true;
			const loginStore = useLoginStore();
			this.pageLoadingFolderName = reportFolderName;
			this.pageStatusMsg = '';
			try {
				const response = await axios.post(PAGE_URL, { reportFolderName }, { headers: { ...authHeadersOf(loginStore), 'Content-Type': 'application/json' } });
				const page = Array.isArray(response.data) ? response.data[0] : null;
				if (!page || !page.report || !Array.isArray(page.certificateList)) {
					this.pageStatusMsg = `the server answered without a report page for ${reportFolderName}`;
					return false;
				}
				this.pageByFolderName = { ...this.pageByFolderName, [reportFolderName]: page };
				return true;
			} catch (error) {
				this.pageStatusMsg = await refusalTextOf(error, 'report page');
				return false;
			} finally {
				this.pageLoadingFolderName = '';
			}
		},

		// fetches one download (the report or a certificate, by the server's download name) and hands it to the browser to save
		async downloadFile({ reportFolderName, downloadName, certificateStem }) {
			const loginStore = useLoginStore();
			this.downloadingDownloadName = downloadName;
			this.downloadStatusMsg = '';
			try {
				const response = await axios.post(FILE_URL, { reportFolderName, downloadName, certificateStem }, { headers: { ...authHeadersOf(loginStore), 'Content-Type': 'application/json' }, responseType: 'blob' });
				const dispositionText = response.headers['content-disposition'] || '';
				const fileNameMatch = /filename="([^"]+)"/.exec(dispositionText);
				if (!fileNameMatch) {
					this.downloadStatusMsg = `the server answered ${downloadName} without a file name; it was not saved`;
					return false;
				}
				const objectUrl = URL.createObjectURL(response.data);
				const saveLink = document.createElement('a');
				saveLink.href = objectUrl;
				saveLink.download = fileNameMatch[1];
				document.body.appendChild(saveLink);
				saveLink.click();
				saveLink.remove();
				setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
				return true;
			} catch (error) {
				this.downloadStatusMsg = await refusalTextOf(error, 'download');
				return false;
			} finally {
				this.downloadingDownloadName = '';
			}
		},
	},
});
