// @concept: [[CompanionPages]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
//
// COMPANION PAGES STORE (SPEC-companionPages-102826, Phase 2)
//
// The companion pages of the standards in the explorer's focus, as POST /api/companion-page-list answers them: one
// request per standardKey (with the focus's stableId, so a page pinned to that node is listed too), merged by pageSlug.
// The focus changes faster than the server answers, so an answer for a focus that is no longer in view is dropped.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const companionPagesStoreInitObject = {
	companionPageList: [],
	loading: false,
	statusMsg: '',
	requestedFocusText: '',
};

const PAGE_LIST_URL = '/api/companion-page-list';

export const useCompanionPagesStore = defineStore('companionPagesStore', {
	state: () => ({ ...companionPagesStoreInitObject }),

	actions: {
		async loadPageListOfFocus({ standardKeyList, subjectStableId }) {
			const focusText = JSON.stringify({ standardKeyList, subjectStableId });
			if (focusText === this.requestedFocusText) return true;
			this.requestedFocusText = focusText;
			this.companionPageList = [];
			this.statusMsg = '';
			this.loading = false;
			if (!standardKeyList.length) return true;
			const loginStore = useLoginStore();
			this.loading = true;
			try {
				const responseList = await Promise.all(
					standardKeyList.map((standardKey) =>
						axios.post(PAGE_LIST_URL, subjectStableId ? { standardKey, subjectStableId } : { standardKey }, { headers: { ...loginStore.getAuthTokenProperty, 'Content-Type': 'application/json' } }),
					),
				);
				if (focusText !== this.requestedFocusText) return true;
				const pageBySlug = new Map();
				responseList.forEach((response) => (Array.isArray(response.data) ? response.data : []).forEach((onePage) => pageBySlug.set(onePage.pageSlug, onePage)));
				this.companionPageList = [...pageBySlug.values()];
				return true;
			} catch (error) {
				if (focusText !== this.requestedFocusText) return true;
				this.statusMsg = error.response?.data || error.message || 'the companion page request failed';
				return false;
			} finally {
				if (focusText === this.requestedFocusText) this.loading = false;
			}
		},
	},
});
