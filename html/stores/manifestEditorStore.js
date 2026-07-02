// @concept: [[ManifestEditor]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

/**
 * MANIFEST EDITOR STORE
 *
 * Admin-only tool for CRUD on graph manifests. Read paths: list manifests, list the
 * schema-block catalog, show one manifest's membership. Write paths: combine (derive a
 * new immutable manifest), validate, diff, build-graph, and the educore-side
 * manifest->users collaboration assignment. All requests carry the admin auth header.
 *   Component -> store action -> /api/manifest* endpoint -> access point ->
 *   educoreForge CLI verb (via the server-side bridge) OR the local assignment table.
 *
 * Blocks are opaque: only metadata is ever handled here, never block content.
 * Manifests are immutable: "editing" means deriving a NEW manifest via combine.
 */

// -------------------------------------------------------------------------
// Initial state

const manifestEditorStoreInitObject = {
	statusMsg: '',
	loading: false,
	manifests: [],
	blocks: [],
	currentManifest: null,
	// write-path state
	validation: null, // { wellFormed, violations?, reason? }
	assignments: [], // collaborators on the current manifest
	users: [], // educore users, for the collaborator picker
	lastCombine: null, // result of the most recent combine (carries new manifestKey)
};

// =========================================================================
// Store definition

export const useManifestEditorStore = defineStore('manifestEditorStore', {
	// =========================================================================
	// STATE

	state: () => ({ ...manifestEditorStoreInitObject }),

	// =========================================================================
	// ACTIONS

	actions: {
		// ------------------------------------------------------------
		// Clear status messages

		clearStatus() {
			this.statusMsg = '';
		},

		// ------------------------------------------------------------
		// READ: list all manifests

		async listManifests() {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();

				const response = await axios.get('/api/manifestListManifests', {
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				this.manifests = Array.isArray(response.data) ? response.data : [];
				return { success: true };
			} catch (error) {
				this.manifests = [];
				this.statusMsg = this.describeError(
					error,
					'Failed to load manifests',
				);
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// READ: list the schema-block catalog (for the picker)

		async listBlocks() {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();

				const response = await axios.get('/api/manifestListBlocks', {
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				this.blocks = Array.isArray(response.data) ? response.data : [];
				return { success: true };
			} catch (error) {
				this.blocks = [];
				this.statusMsg = this.describeError(
					error,
					'Failed to load block catalog',
				);
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// READ: show one manifest's membership (derived build order)

		async showManifest(manifestKey) {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();

				const response = await axios.get('/api/manifestShow', {
					params: { manifest: manifestKey },
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				const manifest = Array.isArray(response.data)
					? response.data[0]
					: response.data;

				if (manifest && manifest.manifestKey) {
					this.currentManifest = manifest;
					return { success: true, manifest };
				}

				this.currentManifest = null;
				this.statusMsg = 'Manifest not found or empty response';
				return { success: false };
			} catch (error) {
				this.currentManifest = null;
				this.statusMsg = this.describeError(
					error,
					'Failed to load manifest',
				);
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// WRITE: derive a NEW immutable manifest from a block set (+ optional base)

		async combineManifest({ base, set, label, note }) {
			this.loading = true;
			this.statusMsg = '';
			this.lastCombine = null;

			try {
				const loginStore = useLoginStore();

				const response = await axios.post(
					'/api/manifestCombine',
					{ base, set, label, note },
					{
						headers: {
							'Content-Type': 'application/json',
							...loginStore.getAuthTokenProperty,
						},
					},
				);

				const result = Array.isArray(response.data)
					? response.data[0]
					: response.data;

				this.lastCombine = result;
				this.statusMsg = 'Manifest created';
				// Refresh the manifest list so the new derivation appears.
				await this.listManifests();
				return { success: true, result };
			} catch (error) {
				// combine's missing-block error text carries the FULL missing-blockId list.
				this.statusMsg = this.describeError(error, 'Combine failed');
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// WRITE-adjacent: validate a manifest (verdict is data, incl. legacy)

		async validateManifest(manifestKey) {
			this.loading = true;
			this.statusMsg = '';
			this.validation = null;

			try {
				const loginStore = useLoginStore();

				const response = await axios.get('/api/manifestValidate', {
					params: { manifest: manifestKey },
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				const verdict = Array.isArray(response.data)
					? response.data[0]
					: response.data;

				this.validation = verdict || null;
				return { success: true, verdict };
			} catch (error) {
				this.validation = null;
				this.statusMsg = this.describeError(error, 'Validate failed');
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// READ: diff two manifests (block-id level)

		async diffManifests(from, to) {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();

				const response = await axios.get('/api/manifestDiff', {
					params: { from, to },
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				const delta = Array.isArray(response.data)
					? response.data[0]
					: response.data;
				return { success: true, delta };
			} catch (error) {
				this.statusMsg = this.describeError(error, 'Diff failed');
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// WRITE: build (replay) a graph from a manifest into a named destination

		async buildGraph({ manifest, destination, owner }) {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();

				const response = await axios.post(
					'/api/manifestBuildGraph',
					{ manifest, destination, owner },
					{
						headers: {
							'Content-Type': 'application/json',
							...loginStore.getAuthTokenProperty,
						},
					},
				);

				const result = Array.isArray(response.data)
					? response.data[0]
					: response.data;

				this.statusMsg = 'Graph build requested';
				return { success: true, result };
			} catch (error) {
				this.statusMsg = this.describeError(error, 'Build graph failed');
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// COLLABORATORS: list assignments for a manifest

		async listAssignments(manifestKey) {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();

				const response = await axios.get('/api/manifestAssignments', {
					params: { manifest: manifestKey },
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				this.assignments = Array.isArray(response.data) ? response.data : [];
				return { success: true };
			} catch (error) {
				this.assignments = [];
				this.statusMsg = this.describeError(
					error,
					'Failed to load collaborators',
				);
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// COLLABORATORS: add one user to a manifest

		async assignUser(manifestKey, userId) {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();

				await axios.post(
					'/api/manifestAssign',
					{ manifestKey, userId },
					{
						headers: {
							'Content-Type': 'application/json',
							...loginStore.getAuthTokenProperty,
						},
					},
				);

				await this.listAssignments(manifestKey);
				return { success: true };
			} catch (error) {
				this.statusMsg = this.describeError(error, 'Assign failed');
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// COLLABORATORS: remove one user from a manifest

		async unassignUser(manifestKey, userId) {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();

				await axios.post(
					'/api/manifestUnassign',
					{ manifestKey, userId },
					{
						headers: {
							'Content-Type': 'application/json',
							...loginStore.getAuthTokenProperty,
						},
					},
				);

				await this.listAssignments(manifestKey);
				return { success: true };
			} catch (error) {
				this.statusMsg = this.describeError(error, 'Unassign failed');
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// Load educore users for the collaborator picker (reuses the admin list)

		async loadUsers() {
			try {
				const loginStore = useLoginStore();

				const response = await axios.get('/api/adminListUsers', {
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});

				const result = Array.isArray(response.data)
					? response.data[0]
					: response.data;
				this.users =
					result && Array.isArray(result.users) ? result.users : [];
				return { success: true };
			} catch (error) {
				this.users = [];
				return { success: false };
			}
		},

		// ------------------------------------------------------------
		// Shared error-message shaping

		describeError(error, fallback) {
			if (error.response?.status === 401) {
				return 'Unauthorized: Admin access required';
			}
			if (error.response?.data) {
				return error.response.data.toString();
			}
			if (error.message) {
				return error.message;
			}
			return `${fallback} - network or server error`;
		},
	},

	// =========================================================================
	// GETTERS

	getters: {
		isLoading: (state) => state.loading,
		getStatusMsg: (state) => state.statusMsg,

		// Blocks grouped by type for the picker's dynamic selectors
		blocksByType: (state) => (type) =>
			state.blocks.filter((block) => block.type === type),

		// Fast blockId -> block lookup, for resolving requires[] against the catalog
		blockById: (state) => {
			const index = {};
			state.blocks.forEach((block) => {
				index[block.blockId] = block;
			});
			return index;
		},
	},
});
