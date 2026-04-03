// @concept: [[EdMatrixReport]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

// =========================================================================
// UTILITY STORE — Utilities section state management
//
// Manages EdMatrix Standards Report data including standards list,
// organizations, categories, and detail views.
// Conditionally includes auth headers for forward compatibility.

// -------------------------------------------------------------------------
// Initial state

const utilityStoreInitObject = {
	edmatrixStandards: [],
	edmatrixOrganizations: [],
	edmatrixCategories: [],
	edmatrixSelectedStandard: null,
	loading: false,
	statusMsg: '',
};

// =========================================================================
// Define the utility store using Pinia

export const useUtilityStore = defineStore('utilityStore', {
	// =========================================================================
	// STATE

	state: () => ({ ...utilityStoreInitObject }),

	// =========================================================================
	// ACTIONS

	actions: {
		// ------------------------------------------------------------
		// _getHeaders - conditionally include auth headers

		_getHeaders() {
			const headers = {};
			const loginStore = useLoginStore();
			if (loginStore.validUser) {
				Object.assign(headers, loginStore.getAuthTokenProperty);
			}
			return headers;
		},

		// ------------------------------------------------------------
		// fetchEdmatrixStandards - load standards, optionally filtered by org

		async fetchEdmatrixStandards(org) {
			this.loading = true;
			this.statusMsg = '';

			const params = {};
			if (org) params.org = org;

			try {
				const response = await axios.get('/api/util/edmatrix-report', {
					params,
					headers: this._getHeaders(),
				});

				this.edmatrixStandards = response.data;
				return true;
			} catch (error) {
				if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Failed to load EdMatrix standards';
				}
				this.edmatrixStandards = [];
				return false;
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// fetchEdmatrixOrganizations - load distinct organizations

		async fetchEdmatrixOrganizations() {
			try {
				const response = await axios.get('/api/util/edmatrix-report', {
					params: { action: 'organizations' },
					headers: this._getHeaders(),
				});

				this.edmatrixOrganizations = response.data;
				return true;
			} catch (error) {
				this.edmatrixOrganizations = [];
				return false;
			}
		},

		// ------------------------------------------------------------
		// fetchEdmatrixCategories - load data categories

		async fetchEdmatrixCategories() {
			try {
				const response = await axios.get('/api/util/edmatrix-report', {
					params: { action: 'categories' },
					headers: this._getHeaders(),
				});

				this.edmatrixCategories = response.data;
				return true;
			} catch (error) {
				this.edmatrixCategories = [];
				return false;
			}
		},

		// ------------------------------------------------------------
		// fetchEdmatrixStandardDetail - load single standard with full relationships

		async fetchEdmatrixStandardDetail(standardName) {
			this.loading = true;
			this.statusMsg = '';

			try {
				const response = await axios.get('/api/util/edmatrix-report', {
					params: { action: 'detail', standardName },
					headers: this._getHeaders(),
				});

				this.edmatrixSelectedStandard = response.data[0] || null;
				return true;
			} catch (error) {
				if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Failed to load standard detail';
				}
				this.edmatrixSelectedStandard = null;
				return false;
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// clearSelection - reset selected standard

		clearSelection() {
			this.edmatrixSelectedStandard = null;
		},
	},

	// =========================================================================
	// GETTERS

	getters: {
		standardCount: (state) => state.edmatrixStandards.length,

		organizationNames: (state) => {
			return state.edmatrixOrganizations.map((org) => org.name).sort();
		},
	},
});
