import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

// =========================================================================
// LOOKUP STORE — Data Model Explorer tree browser state
//
// Manages path (breadcrumbs), children (current level items),
// leafDetail (detail data for leaf nodes), and loading state.
// Does NOT handle routing — components decide navigation.

// -------------------------------------------------------------------------
// Initial state

const lookupStoreInitObject = {
	path: [],
	children: [],
	leafDetail: null,
	loading: false,
	statusMsg: '',
	aiMode: false,
	aiQuery: '',
};

// =========================================================================
// Define the lookup store using Pinia

export const useLookupStore = defineStore('lookupStore', {
	// =========================================================================
	// STATE

	state: () => ({ ...lookupStoreInitObject }),

	// =========================================================================
	// ACTIONS

	actions: {
		// ------------------------------------------------------------
		// fetchChildren - load children for a given level

		async fetchChildren({ level, standard, nodeType, nodeId }) {
			this.loading = true;
			this.leafDetail = null;
			this.statusMsg = '';

			const loginStore = useLoginStore();

			const params = { level };
			if (standard) params.standard = standard;
			if (nodeType) params.nodeType = nodeType;
			if (nodeId) params.nodeId = nodeId;

			try {
				const response = await axios.get('/api/dme-lookup', {
					params,
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				this.children = response.data;
				// Inject AI Search option at root level
				if (level === 'standards') {
					this.children.push({
						id: 'ai',
						label: 'AI Search',
						nodeType: 'ai',
						hasChildren: true,
						childCount: 0,
					});
				}
				return true;
			} catch (error) {
				if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Failed to load data';
				}
				this.children = [];
				return false;
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// fetchLeafDetail - load detail for a leaf node

		async fetchLeafDetail({ standard, nodeType, nodeId }) {
			this.loading = true;
			this.statusMsg = '';

			const loginStore = useLoginStore();

			try {
				const response = await axios.get('/api/dme-lookup', {
					params: {
						level: 'detail',
						standard,
						nodeType,
						nodeId,
					},
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				this.leafDetail = response.data[0] || null;
				return true;
			} catch (error) {
				if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Failed to load detail';
				}
				this.leafDetail = null;
				return false;
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// navigateTo - truncate path to index and reload children

		navigateTo(pathIndex) {
			if (pathIndex < 0) {
				this.path = [];
				this.children = [];
				this.leafDetail = null;
				this.aiMode = false;
				this.aiQuery = '';
				this.fetchChildren({ level: 'standards' });
				return;
			}

			this.path = this.path.slice(0, pathIndex + 1);
			const current = this.path[pathIndex];

			if (current.level === 'standards') {
				this.fetchChildren({ level: 'standards' });
			} else if (current.level === 'topLevel') {
				this.fetchChildren({
					level: 'topLevel',
					standard: current.standard,
				});
			} else {
				this.fetchChildren({
					level: 'children',
					standard: current.standard,
					nodeType: current.nodeType,
					nodeId: current.nodeId,
				});
			}
		},

		// ------------------------------------------------------------
		// selectItem - push item to path and fetch its children or detail

		selectItem(item) {
			// AI mode results carry their own standard — go straight to detail
			if (this.aiMode && item.standard) {
				const pathEntry = {
					id: item.id,
					label: item.label,
					level: 'detail',
					standard: item.standard,
					nodeType: item.nodeType,
					nodeId: item.path || item.id,
				};
				this.path.push(pathEntry);
				this.fetchLeafDetail({
					standard: item.standard,
					nodeType: item.nodeType,
					nodeId: item.path || item.id,
				});
				return;
			}

			const currentStandard = this.path.length > 0
				? this.path[this.path.length - 1].standard || item.id
				: null;

			if (this.path.length === 0) {
				// AI Search entry
				if (item.id === 'ai') {
					this.enterAiMode();
					return;
				}

				const pathEntry = {
					id: item.id,
					label: item.label,
					level: 'topLevel',
					standard: item.id,
					nodeType: item.nodeType,
				};
				this.path.push(pathEntry);
				this.fetchChildren({
					level: 'topLevel',
					standard: item.id,
				});
				return;
			}

			if (!item.hasChildren) {
				const pathEntry = {
					id: item.id,
					label: item.label,
					level: 'detail',
					standard: currentStandard,
					nodeType: item.nodeType,
					nodeId: item.path || item.id,
				};
				this.path.push(pathEntry);
				this.fetchLeafDetail({
					standard: currentStandard,
					nodeType: item.nodeType,
					nodeId: item.path || item.id,
				});
				return;
			}

			const pathEntry = {
				id: item.id,
				label: item.label,
				level: 'children',
				standard: currentStandard,
				nodeType: item.nodeType,
				nodeId: item.path || item.id,
			};
			this.path.push(pathEntry);
			this.fetchChildren({
				level: 'children',
				standard: currentStandard,
				nodeType: item.nodeType,
				nodeId: item.path || item.id,
			});
		},

		// ------------------------------------------------------------
		// enterAiMode - user clicked AI Search from root

		enterAiMode() {
			this.path = [{ id: 'ai', label: 'AI Search', level: 'ai', standard: null, nodeType: 'ai' }];
			this.children = [];
			this.leafDetail = null;
			this.aiMode = true;
			this.aiQuery = '';
		},

		// ------------------------------------------------------------
		// aiSearch - ask askMilo to find relevant elements

		async aiSearch(query) {
			if (!query.trim()) return;

			this.loading = true;
			this.statusMsg = '';
			this.aiQuery = query;

			const loginStore = useLoginStore();

			const prompt = `You are a data standards lookup assistant. The user wants to find education data elements matching their query.

Search the Data Model Explorer graph (CEDS + SIF) for elements matching: "${query}"

Return ONLY a valid JSON array of objects. No other text, no markdown, no explanation. Each object must have exactly these fields:
- "id": the element identifier (cedsId for CEDS, xpath or name for SIF)
- "label": human-readable display name
- "nodeType": one of "CedsProperty", "CedsClass", "SifField", "SifObject"
- "standard": "ceds" or "sif"
- "hasChildren": false
- "description": one-sentence description of what this element represents

Return 10-20 of the most relevant results, mixing both standards where applicable.`;

			try {
				const response = await axios.post(
					'/api/askmilo-utility',
					{ prompt, model: 'sonnet' },
					{ headers: { ...loginStore.getAuthTokenProperty } },
				);

				const raw = response.data.response.trim();
				// Parse JSON — handle potential markdown code fences
				const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
				const items = JSON.parse(jsonStr);

				this.children = items.map(item => ({
					...item,
					childCount: 0,
					path: item.id,
				}));

				return true;
			} catch (error) {
				if (error instanceof SyntaxError) {
					this.statusMsg = 'AI returned invalid data format. Try a different query.';
				} else if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else {
					this.statusMsg = error.message || 'AI search failed';
				}
				this.children = [];
				return false;
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// reset - return to root

		reset() {
			this.path = [];
			this.children = [];
			this.leafDetail = null;
			this.statusMsg = '';
			this.aiMode = false;
			this.aiQuery = '';
			this.fetchChildren({ level: 'standards' });
		},
	},

	// =========================================================================
	// GETTERS

	getters: {
		isAtRoot: (state) => state.path.length === 0,

		currentStandard: (state) => {
			if (state.path.length === 0) return null;
			return state.path[0].standard || null;
		},

		isShowingDetail: (state) => state.leafDetail !== null,
	},
});
