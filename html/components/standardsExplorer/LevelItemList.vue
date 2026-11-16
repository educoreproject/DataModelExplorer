<script setup>
// @concept: [[DataModelExplorer]]
// The level's items as a row of named chips under the bubble diagram, for anything that cannot read a canvas: a screen
// reader, an AI agent reading the DOM or the accessibility tree, or one clicking by position. Visible (a 1px
// visually-hidden list cannot be clicked by an agent that clicks where it sees). Each chip is a Select button naming the
// item, its kind and its detail (the detail panel follows); beside it, an Open link to the walk one step further, so
// its href can be followed or read without clicking. The rows are the diagram's own store.filteredRowList.

import { computed } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { useSpecificationMetadataStore } from '@/stores/specificationMetadataStore';
import { explorerComponentWords, familyHoldingTextOf, kindDisplayNameOf, meaningCountTextOf, meaningRowSubTextOf, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const listWords = explorerComponentWords.levelItemList;
const selectLabelOf = (oneItem) => wordingOf(oneItem.detailText ? listWords.selectLabelWithDetailTemplate : listWords.selectLabelTemplate, { itemName: oneItem.displayName, kindText: oneItem.kindText, detailText: oneItem.detailText || '' });
const openLabelOf = (oneItem) => wordingOf(listWords.openLabelTemplate, { itemName: oneItem.displayName });

const store = useStandardsNeighbourhoodStore();
const specStore = useSpecificationMetadataStore();

const detailTextOf = (oneRow) => {
	if (oneRow.kind === 'family') return [specStore.specByGraphFamily(oneRow.standardFamily)?.title, familyHoldingTextOf(oneRow)].filter(Boolean).join(', ');
	if (oneRow.mapping) return wordingOf(explorerComponentWords.rowWords.mapsToTemplate, { anchorName: oneRow.mapping.anchor.name, matchKind: oneRow.mapping.matchKind });
	// ⟪meaningsPolish⟫ the meanings walk's counts, drawn under its bubbles, said here too (a reader of the DOM cannot read the canvas)
	if (oneRow.kind === 'meaning') return meaningRowSubTextOf(oneRow);
	const meaningCountText = meaningCountTextOf(oneRow);
	if (meaningCountText) return meaningCountText;
	return oneRow.description || (oneRow.version ? wordingOf(explorerComponentWords.rowWords.versionTemplate, { version: oneRow.version }) : '');
};

const itemList = computed(() =>
	store.filteredRowList.map((oneRow) => ({
		stableId: oneRow.stableId,
		displayName: oneRow.displayName,
		kindText: kindDisplayNameOf(oneRow.kind, oneRow.hubName),
		detailText: detailTextOf(oneRow),
		openLink: oneRow.hasChildren ? store.walkLinkOf(store.drillPathOf(oneRow.stableId)) : null,
		isSelected: oneRow.stableId === store.selectedStableId,
	})),
);
</script>

<template>
	<nav class="level-items" :aria-label="listWords.navLabelText" data-testid="level-item-list">
		<span class="level-items-head">{{ listWords.headText }}</span>
		<ul class="level-items-list">
			<li v-for="oneItem in itemList" :key="oneItem.stableId" class="level-item" :class="{ 'level-item-selected': oneItem.isSelected }" :data-testid="`level-item-${oneItem.stableId}`">
				<button
					type="button"
					class="level-item-select"
					:aria-label="selectLabelOf(oneItem)"
					:aria-pressed="oneItem.isSelected ? 'true' : 'false'"
					:title="oneItem.detailText || oneItem.kindText"
					@click="store.selectRow(oneItem.stableId)"
				>
					{{ oneItem.displayName }}
				</button>
				<NuxtLink v-if="oneItem.openLink" :to="oneItem.openLink" class="level-item-open" :aria-label="openLabelOf(oneItem)" :title="openLabelOf(oneItem)">›</NuxtLink>
			</li>
		</ul>
	</nav>
</template>

<style scoped>
.level-items {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 8px;
	margin-top: 10px;
}
.level-items-head {
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #4b5563;
}
.level-items-list {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.level-item {
	display: inline-flex;
	align-items: stretch;
	border: 1px solid #c9d1e0;
	border-radius: 999px;
	overflow: hidden;
	background: #ffffff;
	font-size: 13px;
}
.level-item-selected {
	border-color: #072a6c;
	background: #e7ecf6;
}
.level-item-select,
.level-item-open {
	font: inherit;
	color: #072a6c;
	background: none;
	border: none;
	padding: 2px 10px;
	cursor: pointer;
	text-decoration: none;
}
.level-item-open {
	border-left: 1px solid #c9d1e0;
	padding: 2px 8px;
	font-weight: 700;
}
.level-item-select:hover,
.level-item-open:hover {
	background: #f3f5fa;
}
.level-item-select:focus-visible,
.level-item-open:focus-visible {
	outline: 2px solid #072a6c;
	outline-offset: -2px;
}
</style>
