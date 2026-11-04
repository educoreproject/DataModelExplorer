<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Standards → Explorer tab: the Standards Explorer (WalkView.vue), open to everyone (BD 2026-11-04: "let people
// view the standards explorer without logging in"; until then a visitor who had not signed in got the catalog under a
// sign-in prompt). The specification catalog lives inside it: each family's catalog card in the detail panel, its catalog
// title in the table, and the whole catalog in this page's JSON-LD.

import { useSpecificationMetadataStore } from '@/stores/specificationMetadataStore';
import { useJsonLd, absoluteUrlOf } from '@/composables/useJsonLd';
import { explorerLinkOf, FAMILY_CATALOG_STABLE_ID } from '@/components/standardsExplorer/explorerVocabulary';

const specStore = useSpecificationMetadataStore();


// the specification catalog as Schema.org, signed in or not: one CreativeWork per specification, with its owner, version,
// licence, keywords and where to read it, and (for one the graph holds) where to walk it in the Standards Explorer
const routerResolveText = (routeLocation) => `${routeLocation.path}?path=${encodeURIComponent(routeLocation.query.path)}`;
useJsonLd('specification-catalog', () => ({
	'@type': 'ItemList',
	name: 'Education data specifications described by EDUcore',
	numberOfItems: specStore.specs.length,
	itemListElement: specStore.specs.map((oneSpec, specIndex) => ({
		'@type': 'ListItem',
		position: specIndex + 1,
		item: {
			'@type': 'CreativeWork',
			'@id': absoluteUrlOf(`/explore/standards#spec-${oneSpec.id}`),
			name: oneSpec.title,
			description: oneSpec.description,
			version: oneSpec.version,
			genre: oneSpec.category,
			keywords: (oneSpec.tags || []).join(', '),
			publisher: oneSpec.owner ? { '@type': 'Organization', name: oneSpec.owner } : undefined,
			dateModified: oneSpec.lastUpdated || undefined,
			conditionsOfAccess: oneSpec.license || undefined,
			isAccessibleForFree: oneSpec.accessLevel === 'open',
			url: oneSpec.accessUrl || undefined,
			subjectOf: oneSpec.graphFamily ? { '@type': 'WebPage', name: `${oneSpec.title} in the Standards Explorer`, url: absoluteUrlOf(routerResolveText(explorerLinkOf([FAMILY_CATALOG_STABLE_ID, `family:${oneSpec.graphFamily}`]))) } : undefined,
		},
	})),
}));

// the walk names the page itself (WalkView.vue)
</script>

<template>
	<StandardsExplorerWalkView />
</template>
