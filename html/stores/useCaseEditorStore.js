// @concept: [[UseCaseEditor]]
// @concept: [[PiniaStorePattern]]

// State for the /uc/editor page. Loads schema + list once, then loads and
// edits one UseCase aggregate at a time. Dirty state is per-session.

import axios from 'axios';
import { useUserDataStore } from '@/stores/userDataStore';

const API_BASE = '/api/useCaseEditor';

export const useUseCaseEditorStore = defineStore('useCaseEditorStore', {
	state: () => ({
		schema: null,
		list: [],
		current: null,       // the full aggregate in its editable shape
		original: null,      // frozen copy so we can detect dirty and revert
		dirty: false,
		loading: false,
		saving: false,
		error: '',
		statusMsg: '',
		lastSavedAt: null
	}),

	actions: {
		// ------------------------------------------------------------
		_auth() {
			return useUserDataStore().getAuthTokenProperty;
		},

		_clearError() {
			this.error = '';
			this.statusMsg = '';
		},

		async loadSchema() {
			if (this.schema) { return true; }
			this._clearError();
			try {
				const response = await axios.get(`${API_BASE}?action=schema`, {
					headers: { ...this._auth() }
				});
				this.schema = response.data[0];
				return true;
			} catch (err) {
				this.error = err?.response?.data || err?.message || 'Could not load schema';
				return false;
			}
		},

		async loadList() {
			this._clearError();
			this.loading = true;
			try {
				const response = await axios.get(`${API_BASE}?action=list`, {
					headers: { ...this._auth() }
				});
				this.list = response.data || [];
				return true;
			} catch (err) {
				this.error = err?.response?.data || err?.message || 'Could not load use case list';
				return false;
			} finally {
				this.loading = false;
			}
		},

		async loadUseCase(id) {
			this._clearError();
			this.loading = true;
			this.current = null;
			this.original = null;
			this.dirty = false;
			try {
				const response = await axios.get(`${API_BASE}?action=get&id=${encodeURIComponent(id)}`, {
					headers: { ...this._auth() }
				});
				const uc = response.data[0];
				this.current = this._toEditable(uc);
				this.original = JSON.parse(JSON.stringify(this.current));
				return true;
			} catch (err) {
				this.error = err?.response?.data || err?.message || `Could not load ${id}`;
				return false;
			} finally {
				this.loading = false;
			}
		},

		// Translate the server aggregate into the editor's working shape. The
		// server already nests properties/systemProperties/extraProperties; we
		// keep that nesting so DynamicField can bind directly to `properties`.
		_toEditable(uc) {
			return {
				id: uc.id,
				issueNumber: uc.issueNumber,
				properties: { ...uc.properties },
				systemProperties: { ...uc.systemProperties },
				extraProperties: { ...uc.extraProperties },
				steps: (uc.steps || []).map((s) => ({
					id: s.id,
					properties: { ...s.properties }
				})),
				actors: (uc.actors || []).map((a) => ({
					id: a.id,
					properties: { ...a.properties },
					shareCount: a.shareCount || 0
				})),
				dataRefs: (uc.dataRefs || []).map((d) => ({
					id: d.id,
					properties: { ...d.properties },
					shareCount: d.shareCount || 0
				})),
				externalRefs: (uc.externalRefs || []).map((e) => ({
					id: e.id,
					properties: { ...e.properties },
					shareCount: e.shareCount || 0
				})),
				categories: (uc.categories || []).map((c) => ({
					id: c.id,
					name: c.name,
					isPrimary: c.isPrimary === true
				}))
			};
		},

		markDirty() {
			this.dirty = true;
		},

		revert() {
			if (!this.original) { return; }
			this.current = JSON.parse(JSON.stringify(this.original));
			this.dirty = false;
		},

		// Produce the wire payload the server's save action expects. We only send
		// editable properties for the root — the server re-filters anyway but this
		// keeps the network shape tight.
		_toWirePayload() {
			const uc = this.current;
			if (!uc || !this.schema) { return null; }

			const editableNames = new Set(
				this.schema.properties
					.filter((p) => !p.system && !p.readOnly && !p.derived)
					.map((p) => p.name),
			);
			const rootProps = {};
			for (const key of Object.keys(uc.properties || {})) {
				if (!editableNames.has(key)) { continue; }
				const v = uc.properties[key];
				if (v === null || v === undefined) { continue; }
				rootProps[key] = v;
			}

			return {
				action: 'save',
				id: uc.id,
				properties: rootProps,
				steps: uc.steps.map((s) => ({ id: s.id, properties: s.properties })),
				actors: uc.actors.map((a) => ({ id: a.id, properties: a.properties })),
				dataRefs: uc.dataRefs.map((d) => ({ id: d.id, properties: d.properties })),
				externalRefs: uc.externalRefs.map((e) => ({ id: e.id, properties: e.properties })),
				categories: uc.categories.map((c) => ({ name: c.name, isPrimary: c.isPrimary }))
			};
		},

		async saveCurrent() {
			if (!this.current) { return false; }
			this._clearError();
			this.saving = true;
			try {
				const payload = this._toWirePayload();
				const response = await axios.post(API_BASE, payload, {
					headers: {
						'Content-Type': 'application/json',
						...this._auth()
					}
				});
				const result = response.data[0];
				this.lastSavedAt = result.savedAt;
				this.statusMsg = `Saved. ${this.schema.label} updated at ${result.savedAt}.`;
				// Reload from server so we see recomputed counts and server-normalized values.
				await this.loadUseCase(this.current.id);
				return true;
			} catch (err) {
				this.error = err?.response?.data || err?.message || 'Save failed';
				return false;
			} finally {
				this.saving = false;
			}
		}
	},

	getters: {
		// Editable (non-system, non-readOnly, non-derived) root properties, in manifest order.
		editableRootProperties: (state) => {
			if (!state.schema) { return []; }
			return state.schema.properties.filter((p) => !p.system && !p.readOnly && !p.derived);
		},

		// Read-only declared properties (shown, not edited).
		readOnlyRootProperties: (state) => {
			if (!state.schema) { return []; }
			return state.schema.properties.filter((p) => !p.system && p.readOnly);
		},

		listGroupedByCategory: (state) => {
			const groups = {};
			for (const item of state.list) {
				const key = item.primaryCategory || 'Uncategorized';
				if (!groups[key]) { groups[key] = []; }
				groups[key].push(item);
			}
			return Object.keys(groups).sort().map((name) => ({
				name,
				items: groups[name].slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
			}));
		}
	}
});
