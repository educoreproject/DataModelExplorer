<script setup>
// Shown once the walk has passed through a hub element into another family: says so in that family's colour and
// offers the way back to the element the person started from.

import { computed } from 'vue';
import { explorerLinkOf, familyStyleOf, kindDisplayNameOf } from '@/components/standardsExplorer/explorerVocabulary';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';

const props = defineProps({
	crossing: { type: Object, required: true },
});
const store = useStandardsNeighbourhoodStore();

// the way back is a link to the walk as it stood at the home crumb
const homeLink = computed(() => explorerLinkOf(store.pathStableIdList.slice(0, props.crossing.homeCrumb.pathIndex + 1)));

const crossedStyle = computed(() => familyStyleOf(props.crossing.crossedFamily));
const homeStyle = computed(() => familyStyleOf(props.crossing.homeCrumb.standardFamily));
</script>

<template>
	<div role="status" class="crossing-banner" :style="{ background: crossedStyle.tint, borderColor: crossedStyle.color }" data-testid="crossing-banner">
		<span>
			<b :style="{ color: crossedStyle.color }">You have crossed into {{ crossedStyle.displayName }}</b>
			through the {{ kindDisplayNameOf('hubAnchor', crossing.anchorCrumb.hubName) }} {{ crossing.anchorCrumb.displayName }}. Everything below is {{ crossedStyle.displayName }}, not {{ homeStyle.displayName }}.
		</span>
		<v-btn size="small" variant="outlined" color="primary" data-testid="crossing-back" :to="homeLink">Back to {{ crossing.homeCrumb.displayName }}</v-btn>
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
