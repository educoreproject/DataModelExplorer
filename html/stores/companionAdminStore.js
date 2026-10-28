// @concept: [[CompanionPages]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
//
// COMPANION ADMIN STORE (SPEC-companionPages-102826, Phase 4, "Administration")
//
// What an admin or super user does on a compiled companion page. The endpoints refuse every other role; the page also
// hides these controls from them.
//   - the source history (POST /api/companion-source-history): every upload, newest first, with its provenance;
//   - the compile history (POST /api/companion-compile-history): every compile, with the source rows each was built from;
//   - upload a new document for a sourceRole and sourcePart (POST /api/companion-source-upload, the file as base64);
//     the server computes size and sha256, stores the file and makes the row current; the next view recompiles;
//   - restore an earlier version: its bytes (POST /api/companion-source-file) and provenance uploaded again, so it
//     becomes current as a NEW row and every earlier row stays on record;
//   - add or edit a page (POST /api/companion-page-save, always a whole record).

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const companionAdminStoreInitObject = {
	pageSlug: '',
	sourceHistoryList: [],
	compileHistoryList: [],
	loading: false,
	statusMsg: '',
	uploading: false,
	uploadStatusMsg: '',
	lastUploadedSource: null,
	saving: false,
	saveStatusMsg: '',
	lastSavedPage: null,
};

const SOURCE_HISTORY_URL = '/api/companion-source-history';
const COMPILE_HISTORY_URL = '/api/companion-compile-history';
const SOURCE_UPLOAD_URL = '/api/companion-source-upload';
const SOURCE_FILE_URL = '/api/companion-source-file';
const PAGE_SAVE_URL = '/api/companion-page-save';

const jsonHeadersOf = (loginStore) => ({ ...loginStore.getAuthTokenProperty, 'Content-Type': 'application/json' });

const errorTextOf = async (error, operationText) => {
	const errorData = error.response?.data;
	if (errorData instanceof Blob) return errorData.text();
	return String(errorData || error.message || `${operationText} failed - network or server error`);
};

// base64 of a Blob or File, without the data: URL prefix
const base64Of = (fileBlob) =>
	new Promise((resolve, reject) => {
		const fileReader = new FileReader();
		fileReader.onload = () => resolve(String(fileReader.result).replace(/^data:[^,]*,/, ''));
		fileReader.onerror = () => reject(fileReader.error);
		fileReader.readAsDataURL(fileBlob);
	});

export const useCompanionAdminStore = defineStore('companionAdminStore', {
	state: () => ({ ...companionAdminStoreInitObject }),

	actions: {
		async loadHistory(pageSlug) {
			const loginStore = useLoginStore();
			if (pageSlug !== this.pageSlug) Object.assign(this, { ...companionAdminStoreInitObject, pageSlug });
			this.loading = true;
			this.statusMsg = '';
			try {
				const [sourceResponse, compileResponse] = await Promise.all([
					axios.post(SOURCE_HISTORY_URL, { pageSlug }, { headers: jsonHeadersOf(loginStore) }),
					axios.post(COMPILE_HISTORY_URL, { pageSlug }, { headers: jsonHeadersOf(loginStore) }),
				]);
				if (pageSlug !== this.pageSlug) return true;
				this.sourceHistoryList = Array.isArray(sourceResponse.data) ? sourceResponse.data : [];
				this.compileHistoryList = Array.isArray(compileResponse.data) ? compileResponse.data : [];
				return true;
			} catch (error) {
				if (pageSlug === this.pageSlug) this.statusMsg = await errorTextOf(error, 'reading the history');
				return false;
			} finally {
				if (pageSlug === this.pageSlug) this.loading = false;
			}
		},

		// uploadForm: { pageSlug, sourceRole, sourcePart, fileBlob, fileName, originUrl, originNote, documentDate }
		async uploadSource(uploadForm) {
			const loginStore = useLoginStore();
			this.uploading = true;
			this.uploadStatusMsg = '';
			this.lastUploadedSource = null;
			try {
				const { fileBlob, ...provenance } = uploadForm;
				const fileBase64 = await base64Of(fileBlob);
				const response = await axios.post(SOURCE_UPLOAD_URL, { ...provenance, fileBase64 }, { headers: jsonHeadersOf(loginStore) });
				this.lastUploadedSource = response.data[0];
				return true;
			} catch (error) {
				this.uploadStatusMsg = await errorTextOf(error, 'the upload');
				return false;
			} finally {
				this.uploading = false;
			}
		},

		async restoreSource(sourceRecord) {
			const loginStore = useLoginStore();
			this.uploadStatusMsg = '';
			try {
				const fileResponse = await axios.post(SOURCE_FILE_URL, { sourceRefId: sourceRecord.refId }, { headers: jsonHeadersOf(loginStore), responseType: 'blob' });
				return this.uploadSource({
					pageSlug: sourceRecord.pageSlug,
					sourceRole: sourceRecord.sourceRole,
					sourcePart: sourceRecord.sourcePart,
					fileBlob: fileResponse.data,
					fileName: sourceRecord.fileName,
					originUrl: sourceRecord.originUrl,
					originNote: `${sourceRecord.originNote} [restored from source ${sourceRecord.refId}]`,
					documentDate: sourceRecord.documentDate,
				});
			} catch (error) {
				this.uploadStatusMsg = await errorTextOf(error, `reading ${sourceRecord.fileName} to restore it`);
				return false;
			}
		},

		async savePage(pageRecord) {
			const loginStore = useLoginStore();
			this.saving = true;
			this.saveStatusMsg = '';
			this.lastSavedPage = null;
			try {
				const response = await axios.post(PAGE_SAVE_URL, { pageRecord }, { headers: jsonHeadersOf(loginStore) });
				this.lastSavedPage = response.data[0];
				return true;
			} catch (error) {
				this.saveStatusMsg = await errorTextOf(error, 'saving the page');
				return false;
			} finally {
				this.saving = false;
			}
		},
	},
});
