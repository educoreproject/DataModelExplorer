<script setup>
// Diagram / Table / Schema Viewer switch, filter, legend toggle and the level summary. The switch writes the store's view
// choice, which outlives drilling; a large level still opens in the table (the store's effectiveViewMode decides). Schema
// Viewer is offered once the walk is inside one standard (store.walkStandard); the filter, legend and summary are about the
// level's items, so they step aside while it shows.

import { computed } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { explorerComponentWords, wordingOf, kindDisplayNameOf, meaningCountTextOf, focusCountTextOf, pluralKindNameOf } from '@/components/standardsExplorer/explorerVocabulary';

const toolbarWords = explorerComponentWords.toolbar;
const summaryWords = explorerComponentWords.levelSummary;

const store = useStandardsNeighbourhoodStore();

const levelSummaryText = computed(() => {
	if (!store.neighbourhood) return '';
	const countByKind = {};
	const hubNameByKind = {};
	store.levelRowList.forEach((oneRow) => {
		countByKind[oneRow.kind] = (countByKind[oneRow.kind] || 0) + 1;
		hubNameByKind[oneRow.kind] ||= oneRow.hubName || null;
	});
	// ⟪meaningsPolish review B1⟫ a meanings hub or domain states what it holds exactly as the row that opened it does (meaningCountTextOf, from the node's own
	// counts), so its own term is never counted in among its meanings; any other level counts its rows by kind, as before
	// TQ 2026-11-12: a walk may say what a level's rows are from the focus node's own count ('16 values', not '16 EDC meanings')
	const focusCountNoun = store.walkProfile.focusCountNounByKind[store.focusNode?.kind];
	const focusCountValue = focusCountNoun ? store.focusNode[focusCountNoun.countFieldName] : undefined;
	const meaningLevelText = Number.isFinite(focusCountValue) ? focusCountTextOf(focusCountValue, focusCountNoun.nounEntry) : meaningCountTextOf(store.focusNode || {});
	const kindText = meaningLevelText || Object.entries(countByKind)
		.map(([nodeKind, itemCount]) => `${itemCount} ${itemCount === 1 ? kindDisplayNameOf(nodeKind, hubNameByKind[nodeKind]).replace(/^([A-Z])(?=[a-z])/, (initialLetter) => initialLetter.toLowerCase()) : pluralKindNameOf(nodeKind, hubNameByKind[nodeKind])}`)
		.join(', ');
	const versionComparison = store.neighbourhood.versionComparison;
	const badgeText = versionComparison
		? wordingOf(summaryWords.againstTemplate, { comparedVersion: versionComparison.comparedVersion, badgeCountText: versionComparison.badgeStateCountList.map((oneCount) => wordingOf(summaryWords.badgeCountTemplate, oneCount)).join(summaryWords.listDivider) })
		: '';
	// ⟪review S3⟫ how many rows a cut group shows is its own list's length, never a number typed here
	const truncatedText = store.truncatedGroupList.length
		? wordingOf(summaryWords.truncatedTemplate, { shownCountText: store.truncatedGroupList.map((oneGroup) => oneGroup.itemList.length).join(summaryWords.countDivider), countText: store.truncatedGroupList.map((oneGroup) => oneGroup.count).join(summaryWords.countDivider) })
		: '';
	return `${kindText || summaryWords.nothingBeneathText}${badgeText}${truncatedText}`;
});
</script>

<template>
	<div class="explorer-toolbar">
		<v-btn-toggle
			:model-value="store.effectiveViewMode"
			mandatory
			density="comfortable"
			color="primary"
			class="explorer-view-switch"
			data-testid="view-switch"
			@update:model-value="store.setViewModeChoice($event)"
		>
			<v-btn value="diagram" data-testid="view-diagram">{{ toolbarWords.diagramText }}</v-btn>
			<v-btn value="table" data-testid="view-table">{{ toolbarWords.tableText }}</v-btn>
			<!-- the standard being walked, in the Specification Viewer: only once the walk is inside one standard -->
			<v-btn v-if="store.walkStandard" value="schema" data-testid="view-schema">{{ toolbarWords.schemaText }}</v-btn>
		</v-btn-toggle>
		<template v-if="store.effectiveViewMode !== 'schema'">
		<v-text-field
			:model-value="store.filterText"
			:label="toolbarWords.filterLabelText"
			:placeholder="toolbarWords.filterPlaceholderText"
			density="compact"
			variant="outlined"
			hide-details
			clearable
			class="explorer-filter"
			data-testid="filter"
			@update:model-value="store.setFilterText($event)"
		/>
		<v-btn variant="outlined" color="primary" :aria-expanded="store.legendVisible" data-testid="legend-toggle" @click="store.toggleLegend()">
			{{ store.legendVisible ? toolbarWords.hideLegendText : toolbarWords.showLegendText }}
		</v-btn>
		<span class="explorer-level-summary" data-testid="level-summary">{{ levelSummaryText }}</span>
		</template>
	</div>
</template>

<style scoped>
.explorer-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
	margin-bottom: 12px;
}
.explorer-filter {
	max-width: 240px;
	min-width: 180px;
}
.explorer-level-summary {
	font-size: 13px;
	color: #6b7280;
}
</style>
