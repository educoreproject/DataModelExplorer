<script setup>
// @concept: [[DataModelExplorer]]
// The specification catalog as a list, grouped by category: what the Standards view shows a visitor who has not signed
// in (the walkable explorer needs an account), one SpecificationCard per specification.

import { computed } from 'vue';
import { useSpecificationMetadataStore } from '@/stores/specificationMetadataStore';

const specStore = useSpecificationMetadataStore();

const categoryList = computed(() => Object.entries(specStore.specsByCategory).map(([category, specList]) => ({ category, specList })));
</script>

<template>
	<div class="spec-catalog" data-testid="spec-catalog">
		<p class="text-body-1 text-medium-emphasis mb-6">
			{{ specStore.specCount }} education data specifications with implementation guidance, equity considerations, and cross-spec relationships.
		</p>
		<section v-for="oneGroup in categoryList" :key="oneGroup.category" class="mb-8">
			<h3 class="text-h6 font-weight-bold mb-3">{{ oneGroup.category }}</h3>
			<StandardsExplorerSpecificationCard v-for="spec in oneGroup.specList" :key="spec.id" :spec="spec" class="mb-4" />
		</section>
	</div>
</template>
