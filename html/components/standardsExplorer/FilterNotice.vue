<script setup>
// ⟪meaningsClarity, TQ 2026-11-11⟫ While the level's filter dims (diagram) or hides (table) anything, the level says so, with the text and a Clear button, so a faded
// bubble is never left unexplained. Words: walkFilterVocabulary. Shown by WalkView above the level's view, in both walks.

import { computed } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { walkFilterVocabulary, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const store = useStandardsNeighbourhoodStore();

const noticeText = computed(() => {
	const unmatchedTemplate = walkFilterVocabulary.unmatchedTemplateByViewMode[store.effectiveViewMode];
	if (!unmatchedTemplate) throw new Error(`FilterNotice: walkFilterVocabulary names no unmatched wording for the view '${store.effectiveViewMode}'`);
	return [
		wordingOf(walkFilterVocabulary.noticeTemplate, { filterText: store.filterText.trim() }),
		wordingOf(unmatchedTemplate, { unmatchedCountText: store.filterUnmatchedRowCount }),
	].join(walkFilterVocabulary.noticeDivider);
});
</script>

<template>
	<div class="filter-notice" role="status" data-testid="filter-notice">
		<span data-testid="filter-notice-text">{{ noticeText }}</span>
		<v-btn size="small" variant="text" color="primary" :aria-label="walkFilterVocabulary.clearLabelText" data-testid="filter-notice-clear" @click="store.setFilterText('')">
			{{ walkFilterVocabulary.clearText }}
		</v-btn>
	</div>
</template>

<style scoped>
.filter-notice {
	/* ⟪review N9⟫ a very long filter text wraps instead of pushing the page sideways */
	overflow-wrap: anywhere;
	min-width: 0;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 8px;
	margin-bottom: 8px;
	padding: 4px 4px 4px 12px;
	border-radius: 8px;
	background: #fff4e0;
	color: #5c3a00;
	font-size: 13px;
	font-weight: 600;
}
.filter-notice > span {
	min-width: 0;
}
</style>
