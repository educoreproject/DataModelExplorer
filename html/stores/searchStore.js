import { standards } from '@/data/standards';
import { topics } from '@/data/topics';
import { useCases } from '@/data/useCases';
import { libraryEntries } from '@/data/library-entries';
import { fieldMappings, specLabels } from '@/data/field-mappings';
import { stakeholderTaxonomy, technicalResourcesTaxonomy, useCasesCedsRdf } from '@/data/taxonomies';
import { useCaseTaxonomy } from '@/data/use-case-taxonomy';

// Map useCases (from useCases.ts) issueNumber → taxonomy id for deep linking
const ucTaxonomyIdLookup = (() => {
	const map = {};
	for (const topic of useCaseTaxonomy) {
		for (const driver of topic.children || []) {
			for (const uc of driver.children || []) {
				map[uc.githubIssue] = { topicId: topic.id, ucId: uc.id };
			}
		}
	}
	return map;
})();

const buildIndex = () => {
	const index = [];

	// ── Standards (from standards.ts) — no dedicated page renders these ──
	for (const s of standards) {
		index.push({
			type: 'standard',
			icon: 'mdi-certificate-outline',
			color: '#2c5f8a',
			label: s.name,
			category: s.category,
			description: s.description,
			detail: { organization: s.organization, status: s.status, burden: s.burden },
			haystack: [s.name, s.category, s.description, s.organization, s.status, s.burden].join(' '),
			link: null,
		});
	}

	// ── Topics (from topics.ts) — topics page uses useCaseTaxonomy, not this ──
	// Link to use-cases filtered by matching taxonomy topic if possible
	for (const t of topics) {
		const taxonomyMatch = useCaseTaxonomy.find(tax =>
			tax.id === t.id || tax.label.toLowerCase().includes(t.title.toLowerCase().split(' ')[0])
		);

		index.push({
			type: 'topic',
			icon: 'mdi-book-open-variant',
			color: t.color || '#5B3FD3',
			label: t.title,
			category: 'Topic',
			description: t.description,
			detail: { drivers: t.drivers, driverCount: t.driverCount, useCaseCount: t.useCaseCount },
			haystack: [t.title, t.description].join(' '),
			link: taxonomyMatch ? { path: '/explore/use-cases', query: { topic: taxonomyMatch.id } } : null,
		});

		for (const driver of t.drivers || []) {
			index.push({
				type: 'topic-driver',
				icon: 'mdi-arrow-right-circle-outline',
				color: t.color || '#5B3FD3',
				label: driver,
				category: t.title,
				description: `Driver under ${t.title}`,
				haystack: [driver, t.title].join(' '),
				link: taxonomyMatch ? { path: '/explore/use-cases', query: { topic: taxonomyMatch.id } } : null,
			});
		}
	}

	// ── Use Cases → detail page exists ──
	for (const uc of useCases) {
		const lookup = ucTaxonomyIdLookup[uc.issueNumber];
		const link = lookup
			? { path: `/explore/use-cases/${lookup.ucId}` }
			: null;

		index.push({
			type: 'use-case',
			icon: 'mdi-lightbulb-on-outline',
			color: '#EA580C',
			label: uc.title,
			category: uc.driverName,
			description: uc.description,
			detail: { labels: uc.labels, topicId: uc.topicId, issueNumber: uc.issueNumber },
			haystack: [uc.title, uc.description, uc.driverName, ...(uc.labels || []), uc.topicId].join(' '),
			link,
		});
	}

	// ── Library entries → rendered on /explore/standards ──
	for (const entry of libraryEntries) {
		index.push({
			type: 'library',
			icon: 'mdi-bookshelf',
			color: '#1E40AF',
			label: entry.title,
			category: entry.category || entry.type,
			description: entry.description,
			detail: { owner: entry.owner, version: entry.version, burden: entry.implementationBurden, access: entry.accessLevel, tags: entry.tags },
			haystack: [entry.title, entry.description, entry.category, entry.type, entry.owner, entry.aiSummary, ...(entry.tags || [])].join(' '),
			link: { path: '/explore/standards', query: { highlight: entry.title } },
		});
	}

	// ── Field mappings — no dedicated page ──
	for (const fm of fieldMappings) {
		const specEntries = Object.entries(fm.mappings || {}).map(([specKey, mapping]) => ({
			spec: specLabels?.[specKey] || specKey,
			field: mapping.field,
			path: mapping.path || '',
		}));

		index.push({
			type: 'field-mapping',
			icon: 'mdi-swap-horizontal',
			color: '#00B5B8',
			label: fm.concept,
			category: fm.entityType || 'Field Mapping',
			description: fm.notes || '',
			detail: { matchStrength: fm.matchStrength, specs: specEntries },
			haystack: [fm.concept, fm.entityType, fm.notes, fm.matchStrength].join(' '),
			link: null,
		});

		for (const [specKey, mapping] of Object.entries(fm.mappings || {})) {
			const specName = specLabels?.[specKey] || specKey;
			index.push({
				type: 'field-mapping-spec',
				icon: 'mdi-code-braces',
				color: '#00B5B8',
				label: `${mapping.field}`,
				category: `${fm.concept} → ${specName}`,
				description: mapping.path || '',
				detail: { concept: fm.concept, spec: specName, path: mapping.path },
				haystack: [mapping.field, mapping.path, specName, specKey, fm.concept].join(' '),
				link: null,
			});
		}
	}

	// ── Stakeholders — no dedicated page ──
	for (const group of stakeholderTaxonomy) {
		index.push({
			type: 'stakeholder-group',
			icon: 'mdi-account-group',
			color: '#7b1fa2',
			label: group.label,
			category: 'Stakeholder Group',
			description: (group.children || []).map(c => c.label).join(', '),
			haystack: [group.label].join(' '),
			link: null,
		});

		for (const child of group.children || []) {
			index.push({
				type: 'stakeholder',
				icon: 'mdi-account-outline',
				color: '#7b1fa2',
				label: child.label,
				category: group.label,
				description: (child.businessNeeds || []).slice(0, 2).join('; '),
				detail: { businessNeeds: child.businessNeeds },
				haystack: [child.label, group.label].join(' '),
				link: null,
			});

			for (const need of child.businessNeeds || []) {
				index.push({
					type: 'business-need',
					icon: 'mdi-target',
					color: '#9c27b0',
					label: need,
					category: child.label,
					description: `${group.label} → ${child.label}`,
					haystack: [need, child.label, group.label].join(' '),
					link: null,
				});
			}
		}
	}

	// ── Technical Resources — no dedicated page ──
	for (const group of technicalResourcesTaxonomy) {
		index.push({
			type: 'tech-resource-group',
			icon: 'mdi-folder-outline',
			color: '#37474f',
			label: group.label,
			category: 'Technical Resources',
			description: (group.children || []).map(c => c.label).join(', '),
			haystack: [group.label].join(' '),
			link: null,
		});

		for (const child of group.children || []) {
			index.push({
				type: 'tech-resource',
				icon: 'mdi-link-variant',
				color: '#37474f',
				label: child.label,
				category: group.label,
				description: child.description || '',
				detail: { scope: child.scope, url: child.url },
				haystack: [child.label, child.description, child.scope, group.label].join(' '),
				link: null,
			});
		}
	}

	// ── CEDS RDF Use Cases — no dedicated page ──
	for (const uc of useCasesCedsRdf) {
		index.push({
			type: 'ceds-use-case',
			icon: 'mdi-database-search',
			color: '#c17b3a',
			label: uc.label,
			category: 'CEDS Use Case',
			description: uc.description,
			detail: { domains: uc.cedsDomains, relatedStandards: uc.relatedStandards, stakeholders: uc.stakeholders, businessNeeds: uc.businessNeeds },
			haystack: [uc.label, uc.description, ...(uc.cedsDomains || []), ...(uc.relatedStandards || [])].join(' '),
			link: null,
		});

		for (const el of uc.cedsRdfElements || []) {
			index.push({
				type: 'ceds-element',
				icon: 'mdi-tag-outline',
				color: '#d4994d',
				label: el.element,
				category: uc.label,
				description: el.description,
				detail: { uri: el.uri, parentUseCase: uc.label },
				haystack: [el.element, el.description, el.uri, uc.label].join(' '),
				link: null,
			});
		}

		for (const need of uc.businessNeeds || []) {
			index.push({
				type: 'ceds-business-need',
				icon: 'mdi-target',
				color: '#e6a23c',
				label: need,
				category: uc.label,
				description: `CEDS use case: ${uc.label}`,
				haystack: [need, uc.label].join(' '),
				link: null,
			});
		}
	}

	return index;
};

const searchIndex = buildIndex();

export const useSearchStore = defineStore('searchStore', {
	state: () => ({
		query: '',
		results: [],
	}),

	actions: {
		search(query) {
			const raw = (query || '').trim().toLowerCase();
			this.query = query;

			if (!raw) {
				this.results = [];
				return;
			}

			const words = raw.split(/\s+/);

			this.results = searchIndex.filter(item => {
				const haystack = item.haystack.toLowerCase();
				return words.every(word => haystack.includes(word));
			});
		},

		reset() {
			this.query = '';
			this.results = [];
		},
	},

	getters: {
		hasResults: (state) => state.results.length > 0,
		resultCount: (state) => state.results.length,
	},
});
