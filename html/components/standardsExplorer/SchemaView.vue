<script setup>
// @concept: [[DataModelExplorer]]
// The Standards Explorer's Schema Viewer view (BD 2026-11-04: "when I am looking at a specific standard, have [the schema
// viewer] become just another tab"): the Specification Viewer (components/SpecificationViewer.vue, embedded), opened on the
// standard the walk is in (store.walkStandard). The explorer names a standard by its family (CEDS, EdFi …) and the viewer by
// its graph source; they are matched here, most exact first: the standard's own key, its release, its family, then the one
// source that begins with the family. When none matches, it says so and the viewer's picker is left to choose.

import { computed } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { useSpecificationViewerStore } from '@/stores/specificationViewerStore';
import { explorerComponentWords, familyStyleOf, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const schemaWords = explorerComponentWords.schemaView;
import SpecificationViewer from '@/components/SpecificationViewer.vue';

const store = useStandardsNeighbourhoodStore();
const specViewerStore = useSpecificationViewerStore();

const walkStandard = computed(() => store.walkStandard);
const familyName = computed(() => (walkStandard.value ? familyStyleOf(walkStandard.value.standardFamily).displayName : ''));

const matchedSpecSource = computed(() => {
	const standard = walkStandard.value;
	if (!standard) return '';
	const sourceList = specViewerStore.specs.map((oneSpec) => oneSpec.source);
	const exactSource = [standard.standardKey, standard.releaseLabel, standard.standardFamily].find((candidateName) => candidateName && sourceList.includes(candidateName));
	if (exactSource) return exactSource;
	const prefixedSourceList = sourceList.filter((oneSource) => oneSource.toLowerCase().startsWith(standard.standardFamily.toLowerCase()));
	return prefixedSourceList.length === 1 ? prefixedSourceList[0] : '';
});
const isUnmatched = computed(() => specViewerStore.specs.length > 0 && !specViewerStore.specsLoading && !matchedSpecSource.value);
</script>

<template>
	<section class="schema-view" :aria-label="wordingOf(schemaWords.sectionLabelTemplate, { familyName })" data-testid="schema-view">
		<p class="schema-view-intro">
			{{ schemaWords.introLeadText }} <strong>{{ familyName }}</strong>{{ schemaWords.introDivider }}{{ schemaWords.introTailText }}
		</p>
		<v-alert v-if="isUnmatched" type="info" variant="tonal" density="compact" class="mb-4" data-testid="schema-view-unmatched">
			{{ wordingOf(schemaWords.unmatchedTemplate, { standardFamily: walkStandard.standardFamily }) }}
		</v-alert>
		<SpecificationViewer embedded :spec-source="matchedSpecSource" />
	</section>
</template>

<style scoped>
.schema-view-intro {
	margin: 0 0 14px;
	font-size: 14px;
	color: #4b5563;
}
</style>
