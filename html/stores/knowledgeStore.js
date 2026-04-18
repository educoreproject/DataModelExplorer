// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
// @concept: [[KnowledgeStore]]
//
// knowledgeStore — Everything educore knows about education data interoperability.
// Consolidates the prior edMatrixStore, specificationMetadataStore, and utilityStore
// per SPEC-dataStoreArchitecture-041826.md §2.1.
//
// Live sources:
//   standards  → GET /api/standards            (Neo4j EdMatrix subgraph + graphStats)
//   dossiers   → GET /api/standards/dossiers   (SQLite, seeded from specificationMetadataStore)
//
// Matrix UI state (viewMode, activeFilter, etc.) lives here so /uc/matrix can
// consume it as a single store instead of the old edMatrixStore. The reactive
// standards slice is the same data once loaded; the rawData literal is retired.

import axios from 'axios';
import { useUserDataStore } from '@/stores/userDataStore';
import { useCaseTaxonomy as staticUseCaseTaxonomy, useCaseList as staticUseCaseList } from '@/stores/_useCaseData';

// -------------------------------------------------------------------------
// Static constants co-located with the store (exposed via the rubricDefinition
// getter for uniform access per spec §2.1 "Founding principle").

const burdenRubricDefinition = {
	engineering: {
		label: 'Engineering',
		dimensions: [
			{ key: 'dataFormat', label: 'Data Format Complexity' },
			{ key: 'apiSurface', label: 'API Surface Area' },
			{ key: 'dependencyChain', label: 'Dependency Chain Depth' },
			{ key: 'consumerProducerAsymmetry', label: 'Consumer/Producer Asymmetry' },
			{ key: 'sdkTooling', label: 'SDK / Tooling Availability' },
			{ key: 'specMaturity', label: 'Spec Maturity & Churn Rate' },
		],
	},
	infrastructure: {
		label: 'Infrastructure',
		dimensions: [
			{ key: 'hosting', label: 'Hosting Requirements' },
			{ key: 'database', label: 'Database Requirements' },
			{ key: 'middleware', label: 'Middleware Needs' },
			{ key: 'cryptographic', label: 'Cryptographic Infrastructure' },
			{ key: 'managedServices', label: 'Managed Service Dependencies' },
			{ key: 'operationalCost', label: 'Ongoing Operational Cost' },
		],
	},
	legal: {
		label: 'Legal / Compliance',
		dimensions: [
			{ key: 'specAccess', label: 'Spec Access Cost' },
			{ key: 'membership', label: 'Membership / Governance Fee' },
			{ key: 'dataSharingAgreements', label: 'Data-Sharing Agreements' },
			{ key: 'regulatoryCompliance', label: 'Regulatory Compliance' },
			{ key: 'ipPatent', label: 'IP / Patent Encumbrance' },
		],
	},
};

// Standard initial rows used by /uc/matrix. These are derived from the graph's
// DataCategory nodes in principle, but today the matrix view is hand-curated
// (limited to the 9 canonical data-category rows) and exists in UI config only.

const matrixDataCategories = [
	'Organizational',
	'Personal',
	'Event',
	'Achievement',
	'Credential',
	'Competency',
	'Content Metadata',
	'Content',
	'AI',
];

const matrixUseCaseCategories = ['AI-empowered Learning', 'All Learning Counts'];

const matrixLayerNames = ['Data Dictionary', 'Logical Model', 'Serialization', 'Protocol'];

// -------------------------------------------------------------------------
// Response adapter: map /api/standards rows into the shape the old UI consumed.
// - `organization` → `org`          (legacy property name in matrix cards)
// - `description`  → `excerpt`       (matrix cards do v-html, so wrap paragraph)
// - `formats`      → `uses`          (legacy property name)
// - add `dataLayers` indices computed from `layers` (1-based per matrixLayerNames)
// - add `useCaseCategories` synthesised from types (same rule as before)

const adaptApiStandard = (s) => {
	const dataLayers = (s.layers || [])
		.map((n) => matrixLayerNames.indexOf(n))
		.filter((i) => i >= 0)
		.map((i) => i + 1);

	const useCases = [];
	if ((s.types || []).includes('AI')) useCases.push('AI-empowered Learning');
	if ((s.types || []).some((t) => t === 'Achievement' || t === 'Credential')) {
		useCases.push('All Learning Counts');
	}

	return {
		...s,
		org: s.organization,
		excerpt: s.description ? `<p>${s.description}</p>` : '',
		uses: s.formats || [],
		dataLayers,
		useCaseCategories: useCases,
	};
};

// -------------------------------------------------------------------------

export const useKnowledgeStore = defineStore('knowledgeStore', {
	state: () => ({
		// Standards master list (from /api/standards — EdMatrix subgraph + graphStats)
		standards: [],
		standardsByName: {},
		standardsLoading: false,
		standardsLoaded: false,

		// Dossier overlay (from /api/standards/dossiers — SQLite)
		dossiers: [],
		dossiersByStandardId: {},
		dossiersLoading: false,
		dossiersLoaded: false,

		// Orgs/categories — lightweight subsets of /api/standards responses
		organizations: [],
		categories: [],
		selectedStandard: null,

		// Use cases (spec §2.1). See _useCaseData.js header for the Phase D
		// deviation note: slice is seeded from the inline snapshot today; the
		// graph-driven /api/useCases path remains a planned follow-up.
		useCases: staticUseCaseList,
		useCaseTaxonomy: staticUseCaseTaxonomy,
		useCasesLoading: false,
		useCasesLoaded: true,

		// Matrix UI state (absorbed from edMatrixStore)
		viewMode: 'dataCategory',
		activeFilter: { type: null, layer: null },

		// Rubric constants — also exposed via rubricDefinition getter
		_rubricDefinition: burdenRubricDefinition,
		_matrixDataCategories: matrixDataCategories,
		_matrixUseCaseCategories: matrixUseCaseCategories,
		_matrixLayerNames: matrixLayerNames,

		// Cross-slice error messaging
		statusMsg: '',
	}),

	actions: {
		// -----------------------------------------------------------------
		// Auth headers (conditional — /api/standards is public but auth is valid)

		_authHeaders() {
			const store = useUserDataStore();
			return store.validUser ? { ...store.getAuthTokenProperty } : {};
		},

		// -----------------------------------------------------------------
		// Hydration actions

		async loadStandards({ force = false } = {}) {
			if (this.standardsLoaded && !force) return true;
			this.standardsLoading = true;
			try {
				const response = await axios.get('/api/standards', {
					headers: this._authHeaders(),
				});
				const adapted = (response.data || []).map(adaptApiStandard);
				this.standards = adapted;
				this.standardsByName = adapted.reduce((acc, s) => {
					acc[s.name] = s;
					return acc;
				}, {});
				this.standardsLoaded = true;
				return true;
			} catch (err) {
				this.statusMsg = err?.response?.data || err?.message || 'Failed to load standards';
				return false;
			} finally {
				this.standardsLoading = false;
			}
		},

		async loadDossiers({ force = false } = {}) {
			if (this.dossiersLoaded && !force) return true;
			this.dossiersLoading = true;
			try {
				const response = await axios.get('/api/standards/dossiers', {
					headers: this._authHeaders(),
				});
				// Alias standardId as id so pages that still read spec.id keep working.
				const rows = (response.data || []).map((d) => ({ id: d.standardId, ...d }));
				this.dossiers = rows;
				this.dossiersByStandardId = rows.reduce((acc, d) => {
					acc[d.standardId] = d;
					return acc;
				}, {});
				this.dossiersLoaded = true;
				return true;
			} catch (err) {
				this.statusMsg = err?.response?.data || err?.message || 'Failed to load dossiers';
				return false;
			} finally {
				this.dossiersLoading = false;
			}
		},

		async loadOrganizations() {
			try {
				const response = await axios.get('/api/standards', {
					params: { action: 'organizations' },
					headers: this._authHeaders(),
				});
				this.organizations = response.data || [];
				return true;
			} catch (err) {
				this.organizations = [];
				return false;
			}
		},

		async loadCategories() {
			try {
				const response = await axios.get('/api/standards', {
					params: { action: 'categories' },
					headers: this._authHeaders(),
				});
				this.categories = response.data || [];
				return true;
			} catch (err) {
				this.categories = [];
				return false;
			}
		},

		async loadStandardDetail(standardName) {
			try {
				const response = await axios.get('/api/standards', {
					params: { action: 'detail', standardName },
					headers: this._authHeaders(),
				});
				this.selectedStandard = response.data?.[0] || null;
				return true;
			} catch (err) {
				this.selectedStandard = null;
				return false;
			}
		},

		clearSelection() {
			this.selectedStandard = null;
		},

		// Use cases: load and invalidation hooks (placeholder plumbing for the
		// future /api/useCases integration — see knowledgeStore header note).
		async loadUseCases({ force = false } = {}) {
			if (this.useCasesLoaded && !force) return true;
			this.useCasesLoading = true;
			// TODO: when /api/useCases returns graph-sourced data matching the
			// static shape (slug ids + subcategory mapping), fetch here.
			this.useCases = staticUseCaseList;
			this.useCaseTaxonomy = staticUseCaseTaxonomy;
			this.useCasesLoaded = true;
			this.useCasesLoading = false;
			return true;
		},

		// Called by editorStore.save() after a successful use-case edit.
		// Today this flips the loaded flag so the next loadUseCases reseeds;
		// once the live fetch lands, it will trigger a real refetch.
		invalidateUseCases() {
			this.useCasesLoaded = false;
		},

		async loadEverything() {
			const results = await Promise.allSettled([
				this.loadStandards(),
				this.loadDossiers(),
			]);
			const failed = results
				.map((r, i) => (r.status === 'rejected' ? ['standards', 'dossiers'][i] : null))
				.filter(Boolean);
			if (failed.length) this.statusMsg = `Failed slices: ${failed.join(', ')}`;
		},

		// -----------------------------------------------------------------
		// Matrix UI actions (absorbed from edMatrixStore)

		toggleFilter(type, layer) {
			if (this.activeFilter.type === type && this.activeFilter.layer === layer) {
				this.activeFilter = { type: null, layer: null };
			} else {
				this.activeFilter = { type, layer };
			}
		},

		resetFilter() {
			this.activeFilter = { type: null, layer: null };
		},

		countMatches(rowLabel, layer) {
			return this.standards.filter((s) => {
				const typeMatch =
					this.viewMode === 'dataCategory'
						? (s.types || []).includes(rowLabel)
						: (s.useCaseCategories || []).includes(rowLabel);
				return typeMatch && (s.layers || []).includes(layer);
			}).length;
		},

		getCellClass(rowLabel, layer) {
			if (this.activeFilter.type === rowLabel && this.activeFilter.layer === layer) {
				return 'active-cell';
			}
			return this.countMatches(rowLabel, layer) > 0 ? 'has-data' : 'empty-cell';
		},
	},

	getters: {
		// Standards lookups
		standardById: (state) => (name) => state.standardsByName[name],
		specsInGraph: (state) => state.standards.filter((s) => s.graphStats != null),
		standardCount: (state) => state.standards.length,
		organizationNames: (state) => (state.organizations || []).map((o) => o.name).sort(),

		// Dossier lookups
		dossierFor: (state) => (standardId) => state.dossiersByStandardId[standardId],
		dossierCount: (state) => state.dossiers.length,
		// Back-compat for callers (resolvers.ts, migrated pages) that read spec-by-id.
		specById: (state) => (standardId) => state.dossiersByStandardId[standardId],

		specsByCategory: (state) => {
			return state.dossiers.reduce((groups, spec) => {
				const cat = spec.category || 'Uncategorized';
				if (!groups[cat]) groups[cat] = [];
				groups[cat].push(spec);
				return groups;
			}, {});
		},

		specsByBurden: (state) => {
			return state.dossiers.reduce((groups, spec) => {
				const b = spec.implementationBurden || 'unknown';
				if (!groups[b]) groups[b] = [];
				groups[b].push(spec);
				return groups;
			}, {});
		},

		allTags: (state) => {
			const tagSet = new Set();
			state.dossiers.forEach((s) => (s.tags || []).forEach((t) => tagSet.add(t)));
			return [...tagSet].sort();
		},

		// Back-compat alias for pages that still read `specs`
		specs: (state) => state.dossiers,

		// Use case lookups (absorbed from the prior useCaseStore)
		useCaseById: (state) => (id) => state.useCases.find((uc) => uc.id === id),
		useCasesByCategory: (state) => {
			return state.useCases.reduce((groups, uc) => {
				const cat = uc.categoryId || 'uncategorized';
				if (!groups[cat]) groups[cat] = [];
				groups[cat].push(uc);
				return groups;
			}, {});
		},
		useCasesByTag: (state) => {
			return state.useCases.reduce((groups, uc) => {
				(uc.tags || []).forEach((tag) => {
					if (!groups[tag]) groups[tag] = [];
					groups[tag].push(uc);
				});
				return groups;
			}, {});
		},
		useCasesForCedsDomain: (state) => (domainId) =>
			state.useCases.filter((uc) => (uc.cedsDomains || []).includes(domainId)),
		useCaseCount: (state) => state.useCases.length,
		allLabels: (state) => {
			const tagSet = new Set();
			state.useCases.forEach((uc) => (uc.tags || []).forEach((t) => tagSet.add(t)));
			return [...tagSet].sort();
		},
		taxonomyFlat: (state) => {
			const flat = [];
			state.useCaseTaxonomy.forEach((topic) => {
				flat.push({ id: topic.id, label: topic.label, type: 'topic', parentId: null });
				(topic.children || []).forEach((driver) => {
					flat.push({ id: driver.id, label: driver.label, type: 'driver', parentId: topic.id });
					(driver.children || []).forEach((ucId) => {
						flat.push({ id: ucId, label: ucId, type: 'useCase', parentId: driver.id });
					});
				});
			});
			return flat;
		},
		// Back-compat alias: useCaseStore exposed a `taxonomy` prop directly.
		taxonomy: (state) => state.useCaseTaxonomy,

		// Convenience
		specCount: (state) => state.dossiers.length,

		// Rubric definition getter (reads the co-located const)
		rubricDefinition: (state) => state._rubricDefinition,

		// Matrix UI getters
		currentRows: (state) => {
			return state.viewMode === 'dataCategory'
				? state._matrixDataCategories
				: state._matrixUseCaseCategories;
		},

		layerNames: (state) => state._matrixLayerNames,

		filteredStandards(state) {
			if (!state.activeFilter.type) return state.standards;
			return state.standards.filter((s) => {
				const typeMatch =
					state.viewMode === 'dataCategory'
						? (s.types || []).includes(state.activeFilter.type)
						: (s.useCaseCategories || []).includes(state.activeFilter.type);
				return typeMatch && (s.layers || []).includes(state.activeFilter.layer);
			});
		},
	},
});
