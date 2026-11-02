// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
//
// FORGED USE CASE STORE (use-case forge Phase 5, 2026-10-30)
//
// The EDUcore use-case standard as the GOLD holds it: POST /api/forged-use-cases answers { action: 'list' } with every forged
// case, and { action: 'case', caseStableId } with one case's steps in reading order and its citations. Nothing here is
// remembered between pages; the graph is the source. (The older static catalogue it replaced, TQ 2026-10-30, is gone.)
// ⟪Structure tab, PLAN-useCaseStructureTab-103026⟫ { action: 'caseStructure', caseStableId } answers the case's subgraph as an
// outline and as one extracted JSON document; { action: 'caseSourceFile', caseStableId } answers the case's own source file
// as text with its sha256, which is checked here before the file is handed to the person (a mismatch is reported, never saved).

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const FORGED_USE_CASES_URL = '/api/forged-use-cases';

const forgedUseCaseStoreInitObject = {
	caseList: [],
	caseListLoading: false,
	caseListStatusMsg: '',
	citedStandardList: [],
	citedStandardListLoading: false,
	citedStandardListStatusMsg: '',
	caseDetail: null,
	caseLoading: false,
	caseStatusMsg: '',
	caseStructure: null,
	caseStructureLoading: false,
	caseStructureStatusMsg: '',
	structureDownloadingName: '',
	structureDownloadStatusMsg: '',
};

// the endpoint is public: a visitor without a token sends no Authorization header (a 'Bearer undefined' is refused as a
// malformed token), a logged-in one sends theirs
const authHeadersOf = (loginStore) => (loginStore.authtoken ? { ...loginStore.getAuthTokenProperty } : {});

const refusalTextOf = (error, operationName) =>
	(typeof error.response?.data === 'string' && error.response.data) || error.message || `the ${operationName} request failed`;

const sha256HexOf = async (arrayBuffer) => {
	const digestBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
	return Array.from(new Uint8Array(digestBuffer)).map((oneByte) => oneByte.toString(16).padStart(2, '0')).join('');
};

// hands bytes to the browser to save under a name
const saveBytesAs = (byteArray, saveFileName) => {
	const objectUrl = URL.createObjectURL(new Blob([byteArray], { type: 'application/json' }));
	const saveLink = document.createElement('a');
	saveLink.href = objectUrl;
	saveLink.download = saveFileName;
	document.body.appendChild(saveLink);
	saveLink.click();
	saveLink.remove();
	setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
};

export const useForgedUseCaseStore = defineStore('forgedUseCaseStore', {
	state: () => ({ ...forgedUseCaseStoreInitObject }),

	actions: {
		async fetchCaseList() {
			const loginStore = useLoginStore();
			this.caseListLoading = true;
			this.caseListStatusMsg = '';
			try {
				const response = await axios.post(FORGED_USE_CASES_URL, { action: 'list' }, { headers: authHeadersOf(loginStore) });
				const listResult = Array.isArray(response.data) ? response.data[0] : null;
				if (!listResult || !Array.isArray(listResult.caseList)) {
					this.caseListStatusMsg = 'the server answered without a use-case list';
					this.caseList = [];
					return false;
				}
				this.caseList = listResult.caseList;
				return true;
			} catch (error) {
				this.caseListStatusMsg = refusalTextOf(error, 'use-case list');
				this.caseList = [];
				return false;
			} finally {
				this.caseListLoading = false;
			}
		},

		// every standard the forged cases cite, each with the cases that cite it (derived from the graph's citations)
		async fetchCitedStandardList() {
			const loginStore = useLoginStore();
			this.citedStandardListLoading = true;
			this.citedStandardListStatusMsg = '';
			try {
				const response = await axios.post(FORGED_USE_CASES_URL, { action: 'byCitedStandard' }, { headers: authHeadersOf(loginStore) });
				const standardResult = Array.isArray(response.data) ? response.data[0] : null;
				if (!standardResult || !Array.isArray(standardResult.citedStandardList)) {
					this.citedStandardListStatusMsg = 'the server answered without a cited-standard list';
					this.citedStandardList = [];
					return false;
				}
				this.citedStandardList = standardResult.citedStandardList;
				return true;
			} catch (error) {
				this.citedStandardListStatusMsg = refusalTextOf(error, 'cited-standard list');
				this.citedStandardList = [];
				return false;
			} finally {
				this.citedStandardListLoading = false;
			}
		},

		async fetchCase(caseStableId) {
			const loginStore = useLoginStore();
			this.caseLoading = true;
			this.caseStatusMsg = '';
			this.caseDetail = null;
			try {
				const response = await axios.post(FORGED_USE_CASES_URL, { action: 'case', caseStableId }, { headers: authHeadersOf(loginStore) });
				const caseResult = Array.isArray(response.data) ? response.data[0] : null;
				if (!caseResult || !caseResult.useCase) {
					this.caseStatusMsg = `the server answered without use case ${caseStableId}`;
					return false;
				}
				this.caseDetail = caseResult;
				return true;
			} catch (error) {
				this.caseStatusMsg = refusalTextOf(error, 'use-case');
				return false;
			} finally {
				this.caseLoading = false;
			}
		},

		// ⟪Structure tab⟫ the case's subgraph as the outline and the extracted document
		async fetchCaseStructure(caseStableId) {
			const loginStore = useLoginStore();
			this.caseStructureLoading = true;
			this.caseStructureStatusMsg = '';
			this.caseStructure = null;
			try {
				const response = await axios.post(FORGED_USE_CASES_URL, { action: 'caseStructure', caseStableId }, { headers: authHeadersOf(loginStore) });
				const structureResult = Array.isArray(response.data) ? response.data[0] : null;
				if (!structureResult || !structureResult.outline) {
					this.caseStructureStatusMsg = `the server answered without the structure of ${caseStableId}`;
					return false;
				}
				this.caseStructure = structureResult;
				return true;
			} catch (error) {
				this.caseStructureStatusMsg = refusalTextOf(error, 'use-case structure');
				return false;
			} finally {
				this.caseStructureLoading = false;
			}
		},

		// the case's own source file, exactly as written: checked against the server's sha256 before it is saved
		async downloadCaseSourceFile(caseStableId) {
			const loginStore = useLoginStore();
			this.structureDownloadingName = 'source';
			this.structureDownloadStatusMsg = '';
			try {
				const response = await axios.post(FORGED_USE_CASES_URL, { action: 'caseSourceFile', caseStableId }, { headers: authHeadersOf(loginStore) });
				const sourceResult = Array.isArray(response.data) ? response.data[0] : null;
				if (!sourceResult || typeof sourceResult.sourceText !== 'string') {
					this.structureDownloadStatusMsg = `the server answered without the source file of ${caseStableId}`;
					return false;
				}
				const sourceByteArray = new TextEncoder().encode(sourceResult.sourceText);
				const receivedSha256 = await sha256HexOf(sourceByteArray);
				if (receivedSha256 !== sourceResult.sha256) {
					this.structureDownloadStatusMsg = `${sourceResult.fileName} arrived damaged (sha256 ${receivedSha256}, the server says ${sourceResult.sha256}); it was not saved`;
					return false;
				}
				saveBytesAs(sourceByteArray, sourceResult.fileName);
				return true;
			} catch (error) {
				this.structureDownloadStatusMsg = refusalTextOf(error, 'source file');
				return false;
			} finally {
				this.structureDownloadingName = '';
			}
		},

		// the extracted document the server answered with the structure, saved as JSON
		downloadExtractedDocument() {
			if (!this.caseStructure || !this.caseStructure.extractedDocument) {
				this.structureDownloadStatusMsg = 'the structure has not been loaded, so there is no extracted document to save';
				return false;
			}
			this.structureDownloadStatusMsg = '';
			saveBytesAs(new TextEncoder().encode(`${JSON.stringify(this.caseStructure.extractedDocument, null, '\t')}\n`), this.caseStructure.extractedFileName);
			return true;
		},
	},
});
