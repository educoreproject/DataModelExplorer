// searchStore.js — Pinia store for cross-domain search
//
// Builds a flat client-side index from 3 sources at granular level:
//   1. Standards (specificationMetadataStore — 12 specs)
//   2. Use Cases (github-use-cases.ts — ~40 use cases + taxonomy)
//   3. Implementation Burden (per-indicator from spec burdenRubric)
// Plus async ontology search via /api/lookupNodes (Neo4j).

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';
import { useSpecificationMetadataStore } from '@/stores/specificationMetadataStore';
import { githubUseCaseData } from '@/data/github-use-cases';

// ── Human-readable labels for burden indicator keys ──

const INDICATOR_LABELS = {
	dataFormat: 'Data Format',
	apiSurface: 'API Surface Area',
	dependencyChain: 'Dependency Chain',
	consumerProducerAsymmetry: 'Consumer vs. Producer Asymmetry',
	sdkTooling: 'SDK & Tooling Availability',
	specMaturity: 'Spec Maturity & Stability',
	hosting: 'Hosting / Servers',
	database: 'Database',
	middleware: 'Middleware',
	cryptographic: 'Cryptographic Infrastructure',
	managedServices: 'Managed Service Availability',
	operationalCost: 'Operational Cost & Maintenance',
	specAccess: 'Spec Access & Licensing',
	membership: 'Membership Requirements',
	dataSharingAgreements: 'Data Sharing Agreements',
	regulatoryCompliance: 'Regulatory Compliance',
	ipPatent: 'IP & Patent Considerations',
};

const DIMENSION_LABELS = {
	engineering: 'Engineering Complexity',
	infrastructure: 'Infrastructure Requirements',
	legal: 'Legal & Licensing',
};

// ── Scoring helper ──

function scoreDocument(doc, words) {
	let score = 0;
	const titleLower = doc.title.toLowerCase();
	const subtitleLower = doc.subtitle.toLowerCase();
	const tagsLower = doc.tags.map(t => t.toLowerCase());
	const descLower = doc.description.toLowerCase();

	for (const word of words) {
		if (titleLower.includes(word)) score += 10;
		if (subtitleLower.includes(word)) score += 3;
		if (tagsLower.some(t => t.includes(word))) score += 3;
		if (descLower.includes(word)) score += 1;
	}
	return score;
}

// ── Build taxonomy lookup for subcategory labels ──

const taxonomyLookup = (() => {
	const map = {};
	for (const topic of githubUseCaseData.taxonomy) {
		for (const sub of topic.children) {
			for (const ucId of sub.children) {
				map[ucId] = { topicLabel: topic.label, subcategoryLabel: sub.label, topicId: topic.id };
			}
		}
	}
	return map;
})();

// =========================================================================

export const useSearchStore = defineStore('searchStore', {
	state: () => ({
		query: '',
		clientResults: [],
		ontologyResults: [],
		ontologyLoading: false,
		ontologyError: '',
		_index: [],
		_indexBuilt: false,
	}),

	actions: {
		// ── Build the search index from client-side data ──

		buildIndex() {
			if (this._indexBuilt) return;

			const specStore = useSpecificationMetadataStore();
			const index = [];

			// ── 1. Standards ──
			for (const spec of specStore.specs) {
				index.push({
					id: `spec:${spec.id}`,
					type: 'standard',
					title: spec.title,
					subtitle: `${spec.category} — ${spec.owner}`,
					description: [
						spec.description, spec.aiSummary, spec.aiUnlocksSummary,
						spec.implementationGuidance, spec.implementationBurdenRationale,
						spec.compatibilityNotes,
						...(spec.requiredCapabilities || []),
						...(spec.knownAdopters || []),
						spec.equityConsiderations?.notes,
						spec.privacyConsiderations?.notes,
					].filter(Boolean).join(' '),
					tags: [...(spec.tags || []), spec.category, spec.implementationBurden],
					specId: spec.id,
					useCaseId: null,
					burdenDimension: null,
					burdenIndicatorKey: null,
				});
			}

			// ── 2. Use Cases ──
			for (const uc of githubUseCaseData.useCases) {
				const taxon = taxonomyLookup[uc.id] || {};
				index.push({
					id: `uc:${uc.id}`,
					type: 'use-case',
					title: uc.title,
					subtitle: `${taxon.topicLabel || uc.topic} → ${uc.subcategoryLabel}`,
					description: [
						uc.description, uc.objectives, uc.scenario,
						uc.keyConcepts, uc.outcomes, uc.dependencies,
						...(uc.actors || []).map(a => `${a.name} ${a.role}`),
						...(uc.steps || []).map(s => s.action),
						...(uc.data || []).map(d => `${d.name} ${d.def}`),
					].filter(Boolean).join(' '),
					tags: [...(uc.labels || []), ...(uc.cedsDomains || []), uc.status,
						...(uc.connectedStandards || []).map(s => s.standard)],
					specId: null,
					useCaseId: uc.id,
					burdenDimension: null,
					burdenIndicatorKey: null,
				});
			}

			// ── 3. Burden Indicators ──
			for (const spec of specStore.specs) {
				if (!spec.burdenRubric) continue;

				for (const [dim, rubric] of Object.entries(spec.burdenRubric)) {
					if (!rubric.scores) continue;

					for (const [key, scoreVal] of Object.entries(rubric.scores)) {
						const indicatorLabel = INDICATOR_LABELS[key] || key;
						const dimLabel = DIMENSION_LABELS[dim] || dim;

						index.push({
							id: `burden:${spec.id}:${dim}:${key}`,
							type: 'burden-indicator',
							title: indicatorLabel,
							subtitle: `${spec.title} → ${dimLabel}`,
							description: rubric.note || '',
							tags: [spec.id, spec.title, dim, dimLabel, indicatorLabel,
								scoreVal === 1 ? 'low' : scoreVal === 2 ? 'moderate' : 'high'],
							specId: spec.id,
							useCaseId: null,
							burdenDimension: dim,
							burdenIndicatorKey: key,
							burdenScore: scoreVal,
						});
					}
				}
			}

			this._index = index;
			this._indexBuilt = true;
		},

		// ── Search ──

		search(query) {
			this.query = query;
			const raw = (query || '').trim().toLowerCase();

			if (!raw) {
				this.clientResults = [];
				this.ontologyResults = [];
				this.ontologyError = '';
				return;
			}

			const words = raw.split(/\s+/);

			// Client-side scoring
			const scored = [];
			for (const doc of this._index) {
				const score = scoreDocument(doc, words);
				if (score > 0) scored.push({ ...doc, score });
			}
			scored.sort((a, b) => b.score - a.score);
			this.clientResults = scored;

			// Ontology search (async)
			const loginStore = useLoginStore();
			if (!loginStore.validUser) {
				this.ontologyResults = [];
				this.ontologyLoading = false;
				return;
			}

			this.ontologyLoading = true;
			this.ontologyError = '';
			this.ontologyResults = [];

			axios.get('/api/lookupNodes', {
				params: { model: 'ai', query },
				headers: { ...loginStore.getAuthTokenProperty },
			}).then(response => {
				this.ontologyResults = (response.data || []).map(item => ({
					id: `onto:${item.id || item.label}`,
					type: 'ontology',
					title: item.label || item.id,
					subtitle: `${(item.standard || '').toUpperCase()} ${item.nodeType || ''}`.trim(),
					description: item.description || '',
					tags: [item.standard, item.nodeType].filter(Boolean),
					nodeType: item.nodeType,
					standard: item.standard,
					hasChildren: item.hasChildren,
					path: item.path || item.id,
				}));
			}).catch(err => {
				this.ontologyError = err.response?.data || err.message || 'Ontology search failed';
			}).finally(() => {
				this.ontologyLoading = false;
			});
		},

		// ── Fetch detail for a single ontology node ──

		async fetchNodeDetail(nodeId) {
			const loginStore = useLoginStore();
			if (!loginStore.validUser) return null;

			try {
				const response = await axios.get('/api/lookupNodes', {
					params: { nodeId },
					headers: { ...loginStore.getAuthTokenProperty },
				});
				const data = response.data;
				if (Array.isArray(data) && data.length > 0) {
					return data[0];
				}
				return null;
			} catch {
				return null;
			}
		},

		clearSearch() {
			this.query = '';
			this.clientResults = [];
			this.ontologyResults = [];
			this.ontologyLoading = false;
			this.ontologyError = '';
		},
	},

	getters: {
		hasResults: (state) => state.clientResults.length > 0 || state.ontologyResults.length > 0,
		standardResults: (state) => state.clientResults.filter(d => d.type === 'standard'),
		useCaseResults: (state) => state.clientResults.filter(d => d.type === 'use-case'),
		burdenResults: (state) => state.clientResults.filter(d => d.type === 'burden-indicator'),
		resultCounts: (state) => ({
			standards: state.clientResults.filter(d => d.type === 'standard').length,
			useCases: state.clientResults.filter(d => d.type === 'use-case').length,
			burden: state.clientResults.filter(d => d.type === 'burden-indicator').length,
			ontology: state.ontologyResults.length,
		}),
	},
});
