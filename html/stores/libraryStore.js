// @concept: [[DocumentLibrary]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

// -------------------------------------------------------------------------
// Define initial state for the library store

const libraryStoreInitObject = {
	catalog: [],
	currentPage: null,
	currentFilename: '',
	loading: false,
	statusMsg: '',
};

// =========================================================================
// Define the library store using Pinia

export const useLibraryStore = defineStore('libraryStore', {
	// =========================================================================
	// STATE

	state: () => ({ ...libraryStoreInitObject }),

	// =========================================================================
	// ACTIONS

	actions: {
		// ------------------------------------------------------------
		// Fetch the catalog of available library documents

		async fetchCatalog() {
			this.loading = true;
			try {
				const response = await axios.get('/api/getLibraryCatalog', {
					headers: {
						...useLoginStore().getAuthTokenProperty,
					},
				});
				this.catalog = response.data;
				return true;
			} catch (error) {
				if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Failed to load library catalog';
				}
				return false;
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// Fetch a single page's HTML content

		async fetchPage(filename) {
			this.loading = true;
			this.currentFilename = filename;
			try {
				const response = await axios.get('/api/getLibraryPage', {
					params: { filename },
					headers: {
						...useLoginStore().getAuthTokenProperty,
					},
				});
				this.currentPage = response.data[0];
				return true;
			} catch (error) {
				if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Failed to load page';
				}
				return false;
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// Open a document in a new browser window via Blob URL
		// Fetches HTML through authenticated store -- no token-in-URL needed

		async openInNewWindow(filename) {
			const success = await this.fetchPage(filename);
			if (success && this.currentPage) {
				const blob = new Blob([this.currentPage.content], { type: 'text/html' });
				const url = URL.createObjectURL(blob);
				window.open(url, '_blank');
				// Clean up blob URL after a delay to allow the window to load
				setTimeout(() => URL.revokeObjectURL(url), 5000);
			}
		},
	},

	// =========================================================================
	// GETTERS

	getters: {
		// Returns catalog sorted alphabetically by displayName
		sortedCatalog: (state) => {
			return [...state.catalog].sort((a, b) =>
				a.displayName.localeCompare(b.displayName),
			);
		},
	},
});
