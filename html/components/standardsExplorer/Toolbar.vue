<script setup>
// Diagram / Table switch, filter, legend toggle and the level summary. The switch writes the store's view choice,
// which outlives drilling; a large level still opens in the table (the store's effectiveViewMode decides).

import { computed } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { kindDisplayNameOf, pluralKindNameOf } from '@/components/standardsExplorer/explorerVocabulary';

const store = useStandardsNeighbourhoodStore();

const levelSummaryText = computed(() => {
	if (!store.neighbourhood) return '';
	const countByKind = {};
	const hubNameByKind = {};
	store.levelRowList.forEach((oneRow) => {
		countByKind[oneRow.kind] = (countByKind[oneRow.kind] || 0) + 1;
		hubNameByKind[oneRow.kind] ||= oneRow.hubName || null;
	});
	const kindText = Object.entries(countByKind)
		.map(([nodeKind, itemCount]) => `${itemCount} ${itemCount === 1 ? kindDisplayNameOf(nodeKind, hubNameByKind[nodeKind]).replace(/^([A-Z])(?=[a-z])/, (initialLetter) => initialLetter.toLowerCase()) : pluralKindNameOf(nodeKind, hubNameByKind[nodeKind])}`)
		.join(', ');
	const versionComparison = store.neighbourhood.versionComparison;
	const badgeText = versionComparison
		? ` · against ${versionComparison.comparedVersion}: ${versionComparison.badgeStateCountList.map((oneCount) => `${oneCount.itemCount} ${oneCount.badgeState}`).join(', ')}`
		: '';
	const truncatedText = store.truncatedGroupList.length ? ` · showing the first 500 of ${store.truncatedGroupList.map((oneGroup) => oneGroup.count).join(' / ')}` : '';
	return `${kindText || 'nothing beneath this'}${badgeText}${truncatedText}`;
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
			<v-btn value="diagram" data-testid="view-diagram">Diagram</v-btn>
			<v-btn value="table" data-testid="view-table">Table</v-btn>
		</v-btn-toggle>
		<v-text-field
			:model-value="store.filterText"
			label="Filter"
			placeholder="Type a name"
			density="compact"
			variant="outlined"
			hide-details
			clearable
			class="explorer-filter"
			data-testid="filter"
			@update:model-value="store.setFilterText($event)"
		/>
		<v-btn variant="outlined" color="primary" :aria-expanded="store.legendVisible" data-testid="legend-toggle" @click="store.toggleLegend()">
			{{ store.legendVisible ? 'Hide legend' : 'Show legend' }}
		</v-btn>
		<span class="explorer-level-summary" data-testid="level-summary">{{ levelSummaryText }}</span>
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
