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

// Phase F: the ambient ts files (ceds-alignment, taxonomies, field-mappings)
// were migrated to SQLite and served by /api/standards/alignment,
// /api/taxonomies, /api/fieldMappings. The store hydrates them on demand via
// the load* actions defined below.

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

		// Personas (spec §2.1 — 8 static entries as inline initial state).
		// Source used to be html/data/personas.ts; moved here in Phase H so
		// html/data/ can be deleted wholesale in Phase I.
		personas: [
			{ id: 'school-admin', title: 'School / District Admin', description: 'I manage student data and need systems to talk to each other', icon: 'mdi-school' },
			{ id: 'developer', title: 'Developer / Implementer', description: 'I build integrations and need to know which specs and APIs to use', icon: 'mdi-code-braces' },
			{ id: 'vendor', title: 'EdTech Vendor', description: 'My product needs to interoperate with district and credential systems', icon: 'mdi-store' },
			{ id: 'researcher', title: 'Researcher / Policy', description: 'I study education data systems, standards, or policy', icon: 'mdi-flask' },
			{ id: 'employer', title: 'Employer / Workforce', description: 'I want to verify credentials and hire based on demonstrated skills', icon: 'mdi-briefcase' },
			{ id: 'standards-body', title: 'Standards Body', description: 'I work on education data standards, governance, or alignment', icon: 'mdi-gavel' },
		],

		// Resolver-derived slices. These hold the cross-slice join inputs.
		// Phase F moved the data into SQLite; slices start empty and hydrate
		// via loadAlignment / loadTaxonomies / loadFieldMappings. Consumers
		// must call them in onMounted.
		cedsDomains: [],
		alignmentMatrix: [],
		stakeholderTaxonomy: [],
		useCasesCedsRdf: [],
		fieldMappings: [],
		specLabels: {},
		alignmentLoading: false,
		alignmentLoaded: false,
		taxonomiesLoading: false,
		taxonomiesLoaded: false,
		fieldMappingsLoading: false,
		fieldMappingsLoaded: false,

		// Compute-action caches (Phase E). Each expensive join caches its
		// result by a stringified input key. Cleared whenever an upstream
		// slice reloads (loadStandards/loadDossiers/loadUseCases/loadAlignment).
		_standardsForUseCaseCache: {},
		_standardsForDomainsCache: {},
		_objectsForStandardCache: {},
		_objectDetailCache: {},
		_alignmentForDomainCache: {},
		_useCasesForStandardCache: {},
		_useCasesFlatCache: null,

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
		// Compute-cache invalidation. Called whenever an upstream slice
		// reloads (standards, dossiers, useCases, alignment). Keeping it in
		// one place means each load action has a single line to call.

		_invalidateComputeCaches() {
			this._standardsForUseCaseCache = {};
			this._standardsForDomainsCache = {};
			this._objectsForStandardCache = {};
			this._objectDetailCache = {};
			this._alignmentForDomainCache = {};
			this._useCasesForStandardCache = {};
			this._useCasesFlatCache = null;
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
				this._invalidateComputeCaches();
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
				this._invalidateComputeCaches();
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
			this._invalidateComputeCaches();
			return true;
		},

		// Called by editorStore.save() after a successful use-case edit.
		// Today this flips the loaded flag so the next loadUseCases reseeds;
		// once the live fetch lands, it will trigger a real refetch.
		invalidateUseCases() {
			this.useCasesLoaded = false;
			this._invalidateComputeCaches();
		},

		async loadAlignment({ force = false } = {}) {
			if (this.alignmentLoaded && !force) return true;
			this.alignmentLoading = true;
			try {
				const response = await axios.get('/api/standards/alignment', {
					headers: this._authHeaders(),
				});
				const payload = response.data?.[0] || {};
				this.cedsDomains = payload.cedsDomains || [];
				this.alignmentMatrix = payload.alignmentMatrix || [];
				this.alignmentLoaded = true;
				this._invalidateComputeCaches();
				return true;
			} catch (err) {
				this.statusMsg = err?.response?.data || err?.message || 'Failed to load alignment';
				return false;
			} finally {
				this.alignmentLoading = false;
			}
		},

		async loadTaxonomies({ force = false } = {}) {
			if (this.taxonomiesLoaded && !force) return true;
			this.taxonomiesLoading = true;
			try {
				const response = await axios.get('/api/taxonomies', {
					headers: this._authHeaders(),
				});
				const payload = response.data?.[0] || {};
				this.stakeholderTaxonomy = payload.stakeholderTaxonomy || [];
				this.useCasesCedsRdf = payload.useCasesCedsRdf || [];
				this.taxonomiesLoaded = true;
				this._invalidateComputeCaches();
				return true;
			} catch (err) {
				this.statusMsg = err?.response?.data || err?.message || 'Failed to load taxonomies';
				return false;
			} finally {
				this.taxonomiesLoading = false;
			}
		},

		async loadFieldMappings({ force = false } = {}) {
			if (this.fieldMappingsLoaded && !force) return true;
			this.fieldMappingsLoading = true;
			try {
				const response = await axios.get('/api/fieldMappings', {
					headers: this._authHeaders(),
				});
				const payload = response.data?.[0] || {};
				this.fieldMappings = payload.fieldMappings || [];
				this.specLabels = payload.specLabels || {};
				this.fieldMappingsLoaded = true;
				this._invalidateComputeCaches();
				return true;
			} catch (err) {
				this.statusMsg = err?.response?.data || err?.message || 'Failed to load field mappings';
				return false;
			} finally {
				this.fieldMappingsLoading = false;
			}
		},

		async loadEverything() {
			const results = await Promise.allSettled([
				this.loadStandards(),
				this.loadDossiers(),
				this.loadAlignment(),
				this.loadTaxonomies(),
				this.loadFieldMappings(),
			]);
			const labels = ['standards', 'dossiers', 'alignment', 'taxonomies', 'fieldMappings'];
			const failed = results
				.map((r, i) => (r.status === 'rejected' ? labels[i] : null))
				.filter(Boolean);
			if (failed.length) this.statusMsg = `Failed slices: ${failed.join(', ')}`;
		},

		// -----------------------------------------------------------------
		// Resolver-derived compute actions (absorbed from html/data/resolvers.ts
		// in Phase E). Each action returns synchronously, caching by input
		// key into an internal state slice so repeated calls are O(1). Caches
		// are cleared whenever any upstream slice reloads.

		computeStandardsForUseCase(useCaseId) {
			if (this._standardsForUseCaseCache[useCaseId]) {
				return this._standardsForUseCaseCache[useCaseId];
			}
			const uc = this.useCaseById(useCaseId);
			const domains = uc?.cedsDomains;
			if (!domains || domains.length === 0) {
				this._standardsForUseCaseCache[useCaseId] = [];
				return [];
			}
			const scored = this.computeStandardsForDomains(domains);
			this._standardsForUseCaseCache[useCaseId] = scored;
			return scored;
		},

		computeStandardsForDomains(domainIds) {
			const key = [...domainIds].sort().join('|');
			if (this._standardsForDomainsCache[key]) {
				return this._standardsForDomainsCache[key];
			}
			const relevantDomains = new Set(domainIds);
			const burdenOrder = { low: 0, medium: 1, high: 2 };
			const scored = [];

			for (const entry of this.specs) {
				const alignment = this.alignmentMatrix.find((a) => a.entryId === entry.id);
				if (!alignment) continue;

				let fullCount = 0;
				let partialCount = 0;
				const matchedDomains = [];

				for (const domain of relevantDomains) {
					const domainData = alignment.domains[domain];
					if (domainData) {
						if (domainData.status === 'full') {
							fullCount++;
							matchedDomains.push({ domain, status: 'full' });
						} else if (domainData.status === 'partial') {
							partialCount++;
							matchedDomains.push({ domain, status: 'partial' });
						}
					}
				}

				const score = fullCount * 2 + partialCount;
				if (score === 0) continue;

				scored.push({ entry, score, fullCount, partialCount, matchedDomains });
			}

			scored.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return (burdenOrder[a.entry.implementationBurden] || 0) - (burdenOrder[b.entry.implementationBurden] || 0);
			});

			this._standardsForDomainsCache[key] = scored;
			return scored;
		},

		computeObjectsForStandard(standardId) {
			if (this._objectsForStandardCache[standardId]) {
				return this._objectsForStandardCache[standardId];
			}
			const alignment = this.alignmentMatrix.find((a) => a.entryId === standardId);
			if (!alignment) {
				this._objectsForStandardCache[standardId] = [];
				return [];
			}

			const objects = [];
			const seen = new Set();
			for (const [domainId, data] of Object.entries(alignment.domains)) {
				if (data.status === 'gap') continue;
				for (const element of data.cedsElements || []) {
					if (!seen.has(element)) {
						seen.add(element);
						objects.push({
							element,
							domain: domainId,
							domainLabel: this.getDomainLabel(domainId),
							status: data.status,
							notes: data.notes,
							gapNotes: data.gapNotes,
						});
					}
				}
			}
			const sorted = objects.sort((a, b) => a.element.localeCompare(b.element));
			this._objectsForStandardCache[standardId] = sorted;
			return sorted;
		},

		computeObjectDetail(standardId, objectId) {
			const key = `${standardId}||${objectId}`;
			if (this._objectDetailCache[key]) {
				return this._objectDetailCache[key];
			}
			const alignment = this.alignmentMatrix.find((a) => a.entryId === standardId);
			if (!alignment) {
				this._objectDetailCache[key] = null;
				return null;
			}

			const appearances = [];
			for (const [domainId, data] of Object.entries(alignment.domains)) {
				if (data.cedsElements?.includes(objectId)) {
					appearances.push({
						domain: domainId,
						domainLabel: this.getDomainLabel(domainId),
						status: data.status,
						notes: data.notes,
						gapNotes: data.gapNotes,
					});
				}
			}

			if (appearances.length === 0) {
				this._objectDetailCache[key] = null;
				return null;
			}

			let rdfDetail = null;
			for (const uc of this.useCasesCedsRdf) {
				const el = uc.cedsRdfElements?.find((e) => e.element === objectId);
				if (el) {
					rdfDetail = el;
					break;
				}
			}

			const relatedMappings = this.fieldMappings.filter((fm) => {
				const conceptLower = fm.concept.toLowerCase();
				const objectLower = objectId.toLowerCase().replace(/([A-Z])/g, ' $1').trim().toLowerCase();
				return conceptLower.includes(objectLower) || objectLower.includes(conceptLower);
			});

			const otherStandards = [];
			for (const a of this.alignmentMatrix) {
				if (a.entryId === standardId) continue;
				for (const [domainId, data] of Object.entries(a.domains)) {
					if (data.cedsElements?.includes(objectId)) {
						const entry = this.specById(a.entryId);
						otherStandards.push({
							standardId: a.entryId,
							standardName: entry?.title || a.entryShortName,
							domain: domainId,
							status: data.status,
						});
					}
				}
			}

			const result = {
				element: objectId,
				rdfDetail,
				appearances,
				relatedMappings,
				otherStandards,
			};
			this._objectDetailCache[key] = result;
			return result;
		},

		computeAlignmentForDomain(domainId) {
			if (this._alignmentForDomainCache[domainId]) {
				return this._alignmentForDomainCache[domainId];
			}
			const result = this.alignmentMatrix
				.map((a) => {
					const domainData = a.domains[domainId];
					if (!domainData) return null;
					const entry = this.specById(a.entryId);
					return {
						entryId: a.entryId,
						entryName: entry?.title || a.entryShortName,
						...domainData,
					};
				})
				.filter(Boolean);
			this._alignmentForDomainCache[domainId] = result;
			return result;
		},

		computeUseCasesForStandard(standardId) {
			if (this._useCasesForStandardCache[standardId]) {
				return this._useCasesForStandardCache[standardId];
			}
			const alignment = this.alignmentMatrix.find((a) => a.entryId === standardId);
			if (!alignment) {
				this._useCasesForStandardCache[standardId] = [];
				return [];
			}

			const standardDomains = new Set();
			for (const [domainId, data] of Object.entries(alignment.domains)) {
				if (data.status === 'full' || data.status === 'partial') {
					standardDomains.add(domainId);
				}
			}

			const fromRdf = this.useCasesCedsRdf
				.filter((uc) =>
					uc.relatedStandards?.includes(
						standardId
							.replace('lrw-competency-framework', 'ler-framework')
							.replace('case-v1', 'case-framework')
							.replace('open-badges-v3', 'open-badges')
							.replace('clr-v2', 'clr'),
					),
				)
				.map((uc) => ({
					id: uc.id,
					label: uc.label,
					icon: uc.icon,
					description: uc.description,
				}));

			const fromStore = this.useCases.filter((uc) => {
				if (!uc.cedsDomains?.length) return false;
				return uc.cedsDomains.some((d) => standardDomains.has(d));
			});

			const seen = new Set();
			const result = [];
			for (const uc of fromRdf) {
				if (!seen.has(uc.id)) {
					seen.add(uc.id);
					result.push({ ...uc, source: 'rdf' });
				}
			}
			for (const uc of fromStore) {
				if (!seen.has(uc.id)) {
					seen.add(uc.id);
					result.push({ id: uc.id, label: uc.title, source: 'store' });
				}
			}

			this._useCasesForStandardCache[standardId] = result;
			return result;
		},

		computeAllUseCasesFlat() {
			if (this._useCasesFlatCache) return this._useCasesFlatCache;
			const out = this.useCases.map((uc) => {
				for (const topic of this.useCaseTaxonomy) {
					for (const driver of topic.children) {
						if (driver.children.includes(uc.id)) {
							return {
								...uc,
								label: uc.title,
								categoryId: topic.id,
								categoryLabel: topic.label,
								categoryIcon: topic.icon,
								categoryColor: topic.color,
								subcategoryId: driver.id,
								subcategoryLabel: driver.label,
							};
						}
					}
				}
				return { ...uc, label: uc.title };
			});
			this._useCasesFlatCache = out;
			return out;
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
		personaById: (state) => (id) => state.personas.find((p) => p.id === id) || null,
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

		// Resolver-derived cheap lookups (absorbed from html/data/resolvers.ts
		// in Phase E). These are pure indexed reads against the loaded slices.
		getDomainLabel: (state) => (domainId) => {
			const d = state.cedsDomains.find((x) => x.id === domainId);
			return d ? d.label : domainId;
		},
		getDomainIcon: (state) => (domainId) => {
			const d = state.cedsDomains.find((x) => x.id === domainId);
			return d ? d.icon : '';
		},
		getAllDomains: (state) => state.cedsDomains,

		getDriverById: (state) => (driverId) =>
			state.stakeholderTaxonomy.find((g) => g.id === driverId) || null,

		getStakeholderById: (state) => (stakeholderId) => {
			for (const group of state.stakeholderTaxonomy) {
				for (const child of group.children) {
					if (child.id === stakeholderId) {
						return { ...child, groupId: group.id, groupLabel: group.label, groupIcon: group.icon };
					}
				}
			}
			return null;
		},

		getUseCasesForDriver: (state) => (driverId) => {
			const group = state.stakeholderTaxonomy.find((g) => g.id === driverId);
			if (!group) return [];
			const stakeholderIds = group.children.map((c) => c.id);
			return state.useCasesCedsRdf.filter((uc) =>
				uc.stakeholders.some((s) => stakeholderIds.includes(s)),
			);
		},

		// Taxonomy-enriched use-case lookup. Replaces resolvers.getUseCaseById.
		useCaseByIdEnriched() {
			return (useCaseId) => {
				const uc = this.useCaseById(useCaseId);
				if (!uc) return null;
				for (const topic of this.useCaseTaxonomy) {
					for (const driver of topic.children) {
						if (driver.children.includes(uc.id)) {
							return {
								...uc,
								label: uc.title,
								categoryId: topic.id,
								categoryLabel: topic.label,
								categoryIcon: topic.icon,
								categoryColor: topic.color,
								subcategoryId: driver.id,
								subcategoryLabel: driver.label,
								cedsDomains: uc.cedsDomains || [],
							};
						}
					}
				}
				return { ...uc, label: uc.title, cedsDomains: uc.cedsDomains || [] };
			};
		},
	},
});
