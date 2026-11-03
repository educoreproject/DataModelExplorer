<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Standards → Explorer tab: the specification catalog and the Standards Explorer as one view.
// Signed in, it is the walk (WalkView.vue), with each family's catalog card in the detail panel and its catalog title in
// the table. Signed out, the walk's endpoint would refuse, so the page is public by showing the catalog itself
// (SpecificationCatalog.vue) under a prompt to sign in for the walk; the sign-in comes back here with the same ?path=.

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useLoginStore } from '@/stores/loginStore';

const route = useRoute();
const loginStore = useLoginStore();

const signInTarget = computed(() => ({ path: '/login', query: { redirect: route.fullPath } }));
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
