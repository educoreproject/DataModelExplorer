<script setup>
// Shown once the walk has passed through a hub element into another family: says so in that family's colour and
// offers the way back to the element the person started from.

import { computed } from 'vue';
import { explorerComponentWords, familyStyleOf, kindDisplayNameOf, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const crossingWords = explorerComponentWords.crossingBanner;
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';

const props = defineProps({
	crossing: { type: Object, required: true },
});
const store = useStandardsNeighbourhoodStore();

// the way back is a link to the walk as it stood at the home crumb
const homeLink = computed(() => store.walkLinkOf(store.pathStableIdList.slice(0, props.crossing.homeCrumb.pathIndex + 1)));

const crossedStyle = computed(() => familyStyleOf(props.crossing.crossedFamily));
const homeStyle = computed(() => familyStyleOf(props.crossing.homeCrumb.standardFamily));
</script>

<template>
	<div role="status" class="crossing-banner" :style="{ background: crossedStyle.tint, borderColor: crossedStyle.color }" data-testid="crossing-banner">
		<span>
			<b :style="{ color: crossedStyle.color }">{{ wordingOf(crossingWords.crossedTemplate, { crossedName: crossedStyle.displayName }) }}</b>
			{{ wordingOf(crossingWords.throughTemplate, { anchorKindName: kindDisplayNameOf('hubAnchor', crossing.anchorCrumb.hubName), anchorName: crossing.anchorCrumb.displayName, crossedName: crossedStyle.displayName, homeName: homeStyle.displayName }) }}
		</span>
		<v-btn size="small" variant="outlined" color="primary" data-testid="crossing-back" :to="homeLink">{{ wordingOf(crossingWords.backTemplate, { homeName: crossing.homeCrumb.displayName }) }}</v-btn>
	</div>
</template>

<style scoped>
.crossing-banner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
	justify-content: space-between;
	border: 1px solid;
	color: #111827;
	border-radius: 10px;
	padding: 10px 14px;
	margin-bottom: 12px;
	font-size: 14px;
}
</style>
