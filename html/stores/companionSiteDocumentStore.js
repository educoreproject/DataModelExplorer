// @concept: [[CompanionPages]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
//
// COMPANION SITE DOCUMENT STORE (SPEC-companionPages-102826, "Site documents")
//
// The current sources of a companion page that holds site documents rather than a compiled page, such as educore-papers,
// whose two PDFs the DME welcome panel offers (POST /api/companion-source-list). Kept apart from companionPageStore,
// which holds the one compiled page being viewed and resets when another page opens. Downloading uses
// companionPageStore.downloadSource, the one download path for companion sources.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const SOURCE_LIST_URL = '/api/companion-source-list';

export const useCompanionSiteDocumentStore = defineStore('companionSiteDocumentStore', {
	state: () => ({
		sourceListByPageSlug: {},
		statusMsgByPageSlug: {},
	}),

	actions: {
		async loadSourceList(pageSlug) {
			const loginStore = useLoginStore();
			this.statusMsgByPageSlug = { ...this.statusMsgByPageSlug, [pageSlug]: '' };
			try {
				const response = await axios.post(SOURCE_LIST_URL, { pageSlug }, { headers: { ...loginStore.getAuthTokenProperty, 'Content-Type': 'application/json' } });
				this.sourceListByPageSlug = { ...this.sourceListByPageSlug, [pageSlug]: response.data };
				return true;
			} catch (error) {
				this.statusMsgByPageSlug = { ...this.statusMsgByPageSlug, [pageSlug]: String(error.response?.data || error.message || 'the document list could not be read - network or server error') };
				return false;
			}
		},
	},
});
