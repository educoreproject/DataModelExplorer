// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
//
// STANDARD DATA MODEL STORE (BD 2026-11-17)
//
// The Standards Explorer's Diagram tab, inside a standard: the data model map the SERVER draws from the graph
// (POST /api/standard-data-model { focusStableId }; server/data-model/lib/data-model-diagram/render-data-model-diagram.js).
// The answer's mapKind says what came back: 'standard' (a whole standard's map), 'class' (one class and its neighbours),
// 'standardTooLarge', 'chooseStandard' (a family of several standards) or 'none'. Answers are kept by focus for the visit, so
// moving between Table and Diagram does not ask twice; the graph is the source, and nothing outlives the page.

import { defineStore } from 'pinia';
import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const STANDARD_DATA_MODEL_URL = '/api/standard-data-model';
const MAP_KIND_LIST = Object.freeze(['standard', 'class', 'standardTooLarge', 'chooseStandard', 'none']);

const authHeadersOf = (loginStore) => (loginStore.authtoken ? { ...loginStore.getAuthTokenProperty } : {});

// a server answering with a web page (Express's "Cannot POST" for a route it does not have, a proxy's error page) is read as its
// words, never shown as markup
const plainTextOf = (bodyText) => bodyText.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const refusalTextOf = (error) => {
	const bodyText = typeof error.response?.data === 'string' ? error.response.data : '';
	return (/<[a-z!]/i.test(bodyText) ? plainTextOf(bodyText) : bodyText) || error.message || 'the data model map request failed';
};
// the backend answering has no data model map yet (its code predates the endpoint): a 404, or Express's own "Cannot POST"
const isEndpointAbsent = (error) => error.response?.status === 404 || /Cannot POST \/api\/standard-data-model/.test(String(error.response?.data || ''));

export const useStandardDataModelStore = defineStore('standardDataModelStore', {
	state: () => ({
		mapByFocusStableId: {},
		loadingFocusStableId: '',
		statusMsgByFocusStableId: {},
		// the backend has no data model map at all (its code predates the endpoint), so the page can say so in its own words
		endpointAbsent: false,
	}),

	getters: {
		mapOf: (state) => (focusStableId) => state.mapByFocusStableId[focusStableId] || null,
		statusMsgOf: (state) => (focusStableId) => state.statusMsgByFocusStableId[focusStableId] || '',
		isLoading: (state) => (focusStableId) => state.loadingFocusStableId === focusStableId,
	},

	actions: {
		async fetchMap(focusStableId) {
			if (!focusStableId || this.mapByFocusStableId[focusStableId] || this.loadingFocusStableId === focusStableId) return;
			const loginStore = useLoginStore();
			this.loadingFocusStableId = focusStableId;
			this.statusMsgByFocusStableId = { ...this.statusMsgByFocusStableId, [focusStableId]: '' };
			try {
				const response = await axios.post(STANDARD_DATA_MODEL_URL, { focusStableId }, { headers: authHeadersOf(loginStore) });
				const mapResult = Array.isArray(response.data) ? response.data[0] : null;
				const isDrawn = mapResult && (mapResult.mapKind === 'standard' || mapResult.mapKind === 'class');
				if (!mapResult || !MAP_KIND_LIST.includes(mapResult.mapKind) || (isDrawn && !(typeof mapResult.svgText === 'string' && mapResult.svgText.startsWith('<svg')))) {
					this.statusMsgByFocusStableId = { ...this.statusMsgByFocusStableId, [focusStableId]: 'the server answered without a data model map' };
					return;
				}
				this.endpointAbsent = false;
				this.mapByFocusStableId = { ...this.mapByFocusStableId, [focusStableId]: mapResult };
			} catch (error) {
				this.endpointAbsent = isEndpointAbsent(error);
				this.statusMsgByFocusStableId = { ...this.statusMsgByFocusStableId, [focusStableId]: refusalTextOf(error) };
			} finally {
				if (this.loadingFocusStableId === focusStableId) this.loadingFocusStableId = '';
			}
		},
	},
});
