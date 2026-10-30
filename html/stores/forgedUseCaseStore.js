// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
//
// FORGED USE CASE STORE (use-case forge Phase 5, 2026-10-30)
//
// The EDUcore use-case standard as the GOLD holds it: POST /api/forged-use-cases answers { action: 'list' } with every forged
// case, and { action: 'case', caseStableId } with one case's steps in reading order and its citations. Nothing here is
// remembered between pages; the graph is the source. (The older static catalogue it replaced, TQ 2026-10-30, is gone.)

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
};

// the endpoint is public: a visitor without a token sends no Authorization header (a 'Bearer undefined' is refused as a
// malformed token), a logged-in one sends theirs
const authHeadersOf = (loginStore) => (loginStore.authtoken ? { ...loginStore.getAuthTokenProperty } : {});

const refusalTextOf = (error, operationName) =>
	(typeof error.response?.data === 'string' && error.response.data) || error.message || `the ${operationName} request failed`;

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
	},
});
