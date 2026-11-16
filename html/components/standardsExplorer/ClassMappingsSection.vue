<script setup>
// ClassMappingsSection — a class's panel lists what is mapped to its meanings (TQ 2026-11-12: "The thing I like is actually listing the mappings it takes part
// in. The categorization and need to click to see them is too abstract"). One MeaningMappedHere box per meaning of the class that has mappings, most mapped
// first, each meaning's node read once by the store with the request a drill sends (loadLeafMeaning). Its own meanings and its own term only: the meanings of
// other classes that name it are theirs, and the class's row in its hub counts the same (mappingCount).
import { computed, watch } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { MEANING_RELATIONSHIP_TYPE, OWN_TERM_RELATIONSHIP_TYPE, meaningElementCountTextOf, meaningsVocabulary, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const store = useStandardsNeighbourhoodStore();
const sectionWords = meaningsVocabulary.classMappings;

const mappedRowList = computed(() =>
	store.levelRowList
		.filter((oneRow) => oneRow.kind === 'meaning' && [MEANING_RELATIONSHIP_TYPE, OWN_TERM_RELATIONSHIP_TYPE].includes(oneRow.relationshipType) && oneRow.elementCount > 0)
		.slice()
		.sort((leftRow, rightRow) => rightRow.elementCount - leftRow.elementCount || String(leftRow.displayName || leftRow.name).localeCompare(String(rightRow.displayName || rightRow.name))),
);
const shownRowList = computed(() => mappedRowList.value.slice(0, sectionWords.shownMeaningCap));
const totalElementCount = computed(() => mappedRowList.value.reduce((soFar, oneRow) => soFar + oneRow.elementCount, 0));
const moreText = computed(() => (mappedRowList.value.length > shownRowList.value.length ? wordingOf(sectionWords.moreTemplate, { moreCount: mappedRowList.value.length - shownRowList.value.length }) : ''));

watch(
	() => shownRowList.value.map((oneRow) => oneRow.stableId).join(' '),
	() => shownRowList.value.forEach((oneRow) => store.loadLeafMeaning(oneRow.stableId)),
	{ immediate: true },
);
const meaningStateOf = (oneRow) => store.leafMeaningStateByStableId[oneRow.stableId] || null;
</script>

<template>
	<div class="meaning-box class-mappings" data-testid="class-mappings">
		<span class="meaning-box-head">{{ sectionWords.headText }} <span class="meaning-count">{{ meaningElementCountTextOf(totalElementCount) }}</span></span>
		<p v-if="!mappedRowList.length" class="meaning-note">{{ sectionWords.noneText }}</p>
		<template v-for="oneRow in shownRowList" :key="oneRow.stableId">
			<StandardsExplorerMeaningMappedHere v-if="meaningStateOf(oneRow) && meaningStateOf(oneRow).meaningNode" :meaning-node="meaningStateOf(oneRow).meaningNode" :head-text="oneRow.displayName || oneRow.name" />
			<p v-else-if="meaningStateOf(oneRow) && meaningStateOf(oneRow).failed" class="meaning-note">{{ oneRow.displayName || oneRow.name }}: {{ sectionWords.unreadableText }}</p>
			<p v-else class="meaning-note">{{ oneRow.displayName || oneRow.name }}: {{ sectionWords.readingText }}</p>
		</template>
		<p v-if="moreText" class="meaning-note" data-testid="class-mappings-more">{{ moreText }}</p>
	</div>
</template>

<style scoped src="./meaningBoxes.css"></style>
