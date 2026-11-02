// @concept: [[CompanionPages]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
//
// COMPANION PAGE STORE (SPEC-companionPages-102826, Phase 4)
//
// One compiled companion page, as /explore/companion/<pageSlug> shows it: its registry record (POST /api/companion-page-get)
// and its current compile (POST /api/companion-compile-current). The compile answer says whether it is current; when it
// is not, it is the last good compile, with the stale stamps and the reason, and the page says so. A compile refusal
// whose text begins 'compileUnavailable:' means there is no compile at all, which the page shows as such. Downloading a
// source's bytes (POST /api/companion-source-file) lives here too, since everyone who may read the page may download.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const companionPageStoreInitObject = {
	pageSlug: '',
	pageRecord: null,
	compileAnswer: null,
	compileUnavailableText: '',
	loading: false,
	statusMsg: '',
	downloadStatusMsg: '',
};

const PAGE_GET_URL = '/api/companion-page-get';
const COMPILE_CURRENT_URL = '/api/companion-compile-current';
const SOURCE_FILE_URL = '/api/companion-source-file';
const COMPILE_UNAVAILABLE_PREFIX = 'compileUnavailable:';

const jsonHeadersOf = (loginStore) => ({ ...loginStore.getAuthTokenProperty, 'Content-Type': 'application/json' });

export const useCompanionPageStore = defineStore('companionPageStore', {
	state: () => ({ ...companionPageStoreInitObject }),

	getters: {
		payload: (state) => (state.compileAnswer ? state.compileAnswer.payload : null),
	},

	actions: {
		async loadPage(pageSlug) {
			const loginStore = useLoginStore();
			// a re-read of the same page (after an upload) keeps what is shown until the new answer arrives, so the page and
			// its admin panel stay in place; another page starts clean
			const isReread = pageSlug === this.pageSlug && Boolean(this.pageRecord);
			Object.assign(this, isReread ? { compileUnavailableText: '', statusMsg: '', downloadStatusMsg: '', loading: true } : { ...companionPageStoreInitObject, pageSlug, loading: true });
			try {
				const pageResponse = await axios.post(PAGE_GET_URL, { pageSlug }, { headers: jsonHeadersOf(loginStore) });
				if (pageSlug !== this.pageSlug) return true;
				this.pageRecord = pageResponse.data[0];
				if (this.pageRecord.targetKind !== 'compiled') return true;
				const compileResponse = await axios.post(COMPILE_CURRENT_URL, { pageSlug }, { headers: jsonHeadersOf(loginStore) });
				if (pageSlug !== this.pageSlug) return true;
				this.compileAnswer = compileResponse.data[0];
				return true;
			} catch (error) {
				if (pageSlug !== this.pageSlug) return true;
				const errorText = String(error.response?.data || error.message || 'the companion page request failed - network or server error');
				if (errorText.startsWith(COMPILE_UNAVAILABLE_PREFIX)) {
					this.compileUnavailableText = errorText.slice(COMPILE_UNAVAILABLE_PREFIX.length).trim();
					return false;
				}
				this.statusMsg = errorText;
				return false;
			} finally {
				if (pageSlug === this.pageSlug) this.loading = false;
			}
		},

		// the browser saves the bytes under the source's own file name
		async downloadSource(sourceRecord) {
			const loginStore = useLoginStore();
			this.downloadStatusMsg = '';
			try {
				const response = await axios.post(SOURCE_FILE_URL, { sourceRefId: sourceRecord.refId }, { headers: jsonHeadersOf(loginStore), responseType: 'blob' });
				const objectUrl = URL.createObjectURL(response.data);
				const anchorElement = document.createElement('a');
				anchorElement.href = objectUrl;
				anchorElement.download = sourceRecord.fileName;
				anchorElement.click();
				URL.revokeObjectURL(objectUrl);
				return true;
			} catch (error) {
				const errorData = error.response?.data;
				this.downloadStatusMsg = `${sourceRecord.fileName} could not be downloaded: ${errorData instanceof Blob ? await errorData.text() : errorData || error.message || 'network or server error'}`;
				return false;
			}
		},
	},
});
