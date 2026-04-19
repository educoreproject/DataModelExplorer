// @concept: [[DataModelExplorer]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
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
	aiResults: [],
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

		async fetchChildren({ model, nodeId, level }) {
			this.loading = true;
			this.leafDetail = null;
			this.statusMsg = '';

			// Handle backward compat: level='standards' maps to model='standards'
			if (level === 'standards') {
				model = 'standards';
			}

			// Standards root is a hardcoded local list — no server call needed
			if (model === 'standards') {
				this.children = [
					{ id: 'sif', label: 'SIF', nodeType: 'standard', hasChildren: true, childCount: 0 },
					{ id: 'ceds', label: 'CEDS v14', nodeType: 'standard', hasChildren: true, childCount: 0 },
					{ id: 'ai', label: 'AI Search', nodeType: 'ai', hasChildren: true, childCount: 0 },
				];
				this.loading = false;
				return true;
			}

			const loginStore = useLoginStore();

			const params = {};
			if (model) params.model = model;
			if (nodeId) params.nodeId = nodeId;

			try {
				const response = await axios.get('/api/lookupNodes', {
					params,
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				// If backend returned a detail result (leaf node), show as detail
				if (response.data.length === 1 && response.data[0].isDetail) {
					this.leafDetail = response.data[0];
					return true;
				}

				this.children = response.data;
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

		async fetchLeafDetail({ nodeId }) {
			this.loading = true;
			this.statusMsg = '';

			const loginStore = useLoginStore();

			try {
				const response = await axios.get('/api/lookupNodes', {
					params: { nodeId },
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				this.leafDetail = response.data[0] || null;
				if (!this.leafDetail) {
					this.statusMsg = 'No matching element found in the graph. The AI may have suggested a non-existent element.';
					this.path.pop(); // remove the dead-end from breadcrumbs
				}
				return !!this.leafDetail;
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
				this.fetchChildren({ model: 'standards' });
				return;
			}

			this.path = this.path.slice(0, pathIndex + 1);
			const current = this.path[pathIndex];

			if (current.level === 'standards') {
				this.fetchChildren({ model: 'standards' });
			} else if (current.level === 'topLevel') {
				this.fetchChildren({ model: current.standard });
			} else {
				this.fetchChildren({ nodeId: current.nodeId });
			}
		},

		// ------------------------------------------------------------
		// selectItem - push item to path and fetch its children or detail

		selectItem(item) {
			// Prevent cycles — don't navigate to a node already in the path
			const itemKey = item.path || item.id;
			if (this.path.some(seg => (seg.nodeId || seg.id) === itemKey && seg.nodeType === item.nodeType)) {
				return;
			}

			const currentStandard = this.path.length > 0
				? this.path[this.path.length - 1].standard || item.standard || item.id
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
				this.fetchChildren({ model: item.id });
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
			this.fetchChildren({ nodeId: item.path || item.id });
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
		// aiSearch - use the new lookupNodes endpoint with model=ai

		async aiSearch(query) {
			if (!query.trim()) return;

			this.loading = true;
			this.statusMsg = '';
			this.aiQuery = query;

			const loginStore = useLoginStore();

			try {
				const response = await axios.get('/api/lookupNodes', {
					params: { model: 'ai', query },
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				this.children = response.data;
				this.aiResults = response.data;
				return true;
			} catch (error) {
				if (error.response?.data) {
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
			this.aiResults = [];
			this.fetchChildren({ model: 'standards' });
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
