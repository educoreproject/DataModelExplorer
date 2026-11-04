<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Standards → Explorer tab: the specification catalog and the Standards Explorer as one view.
// Signed in, it is the walk (WalkView.vue), with each family's catalog card in the detail panel and its catalog title in
// the table. Signed out, the walk's endpoint would refuse, so the page is public by showing the catalog itself
// (SpecificationCatalog.vue) under a prompt to sign in for the walk; the sign-in comes back here with the same ?path=.

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useLoginStore } from '@/stores/loginStore';
import { useSpecificationMetadataStore } from '@/stores/specificationMetadataStore';
import { useJsonLd, absoluteUrlOf } from '@/composables/useJsonLd';
import { explorerLinkOf, FAMILY_CATALOG_STABLE_ID } from '@/components/standardsExplorer/explorerVocabulary';

const route = useRoute();
const loginStore = useLoginStore();
const specStore = useSpecificationMetadataStore();

const signInTarget = computed(() => ({ path: '/login', query: { redirect: route.fullPath } }));

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

// signed in, the walk names the page itself (WalkView.vue)
useHead(() => (loginStore.validUser ? {} : {
	title: 'Standards',
	meta: [{ name: 'description', content: 'The education data specifications EDUcore describes: owner, version, governance, implementation burden, access, privacy and equity notes for each. Sign in to walk them in the Standards Explorer.' }],
}));
</script>

<template>
	<StandardsExplorerWalkView v-if="loginStore.validUser" />
	<v-container v-else class="py-8" style="max-width: 1100px;" data-testid="standards-signed-out">
		<v-alert type="info" variant="tonal" class="mb-6" data-testid="standards-signin-prompt">
			<div class="d-flex align-center flex-wrap ga-3">
				<span style="flex: 1; min-width: 240px;">
					Sign in to walk these standards in the <strong>Standards Explorer</strong>: their classes and properties as
					diagrams and tables, and how each maps across to the others.
				</span>
				<v-btn color="primary" variant="flat" :to="signInTarget" data-testid="standards-signin">Sign in</v-btn>
			</div>
		</v-alert>
		<h2 class="text-h5 font-weight-bold text-primary mb-2">Interoperability Specifications</h2>
		<StandardsExplorerSpecificationCatalog />
	</v-container>
</template>
