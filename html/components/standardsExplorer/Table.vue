<script setup>
// The level as a table: the same rows the diagram draws (store.filteredRowList), sortable, filterable, every row
// clickable. Single click selects (the detail panel follows), double click or Open drills.

import { computed, ref, watch } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { familyStyleOf, isOpenAtOnceClick } from '@/components/standardsExplorer/explorerVocabulary';

const store = useStandardsNeighbourhoodStore();
const emit = defineEmits(['drill']);

// the Info column says what it holds, from the kinds on this level
const infoTextOf = (oneRow) => {
	const infoByKind = {
		class: () => oneRow.description,
		property: () => (oneRow.mapping ? oneRow.mapping.anchor.name : oneRow.description),
		instance: () => oneRow.path || oneRow.description,
		standard: () => oneRow.description || (oneRow.version ? `version ${oneRow.version}` : ''),
		release: () => (oneRow.versionList ? `versions ${oneRow.versionList.map((oneVersion) => oneVersion.version).join(', ')}` : ''),
		standardGroup: () => (oneRow.matchKindCountList || []).map((oneCount) => `${oneCount.matchKind} ${oneCount.elementCount}`).join(', '),
		cedsAnchor: () => (oneRow.mapping && oneRow.mapping.occurrenceCount > 1 ? `from ${oneRow.mapping.occurrenceCount} occurrences` : oneRow.description),
	};
	const infoReader = infoByKind[oneRow.kind];
	const infoText = infoReader ? infoReader() : oneRow.description || oneRow.path;
	return oneRow.ownerName && oneRow.path ? `${oneRow.path}` : infoText || '';
};

// the Count column: what "how much" means for each kind, with a numeric value to sort by
const countOf = (oneRow) => {
	const countByKind = {
		class: () => ({ countValue: oneRow.mappedPropertyCount, countText: oneRow.propertyCount ? `${oneRow.mappedPropertyCount} of ${oneRow.propertyCount} mapped` : 'no properties' }),
		cedsDomain: () => ({ countValue: oneRow.propertyCount, countText: oneRow.propertyCount ? `${oneRow.propertyCount} properties` : '' }),
		standard: () => ({ countValue: oneRow.classCount, countText: oneRow.classCount !== undefined ? `${oneRow.classCount} classes` : '' }),
		release: () => ({ countValue: (oneRow.versionList || []).length, countText: `${(oneRow.versionList || []).length} versions` }),
		standardGroup: () => ({ countValue: oneRow.elementCount, countText: `${oneRow.elementCount} elements` }),
		property: () => ({ countValue: oneRow.occurrenceCount, countText: oneRow.occurrenceCount ? `${oneRow.occurrenceCount}` : '' }),
	};
	const countReader = countByKind[oneRow.kind];
	return countReader ? countReader() : { countValue: null, countText: '' };
};

const isAnchorLevel = computed(() => store.focusNode?.kind === 'cedsAnchor');
const homeStandardKey = computed(() => (isAnchorLevel.value && store.crossing ? store.crossing.homeStandardKey : null));

const tableRowList = computed(() =>
	store.filteredRowList.map((oneRow) => {
		const { countValue, countText } = countOf(oneRow);
		const matchKind = oneRow.mapping ? oneRow.mapping.matchKind : oneRow.strongestMatchKind;
		return {
			...oneRow,
			infoText: infoTextOf(oneRow),
			countValue: countValue ?? -1,
			countText,
			matchKind: matchKind || '',
			confidenceValue: oneRow.mapping ? oneRow.mapping.mappingConfidence : -1,
			badgeOrder: oneRow.versionBadge ? { new: 0, changed: 1, unchanged: 2 }[oneRow.versionBadge.badgeState] : 3,
			isHome: Boolean(homeStandardKey.value) && oneRow.standardKey === homeStandardKey.value,
		};
	}),
);

const versionComparison = computed(() => store.neighbourhood?.versionComparison || null);
const hasMatchColumn = computed(() => tableRowList.value.some((oneRow) => oneRow.matchKind || ['property', 'instance', 'cedsAnchor'].includes(oneRow.kind)));

const headerList = computed(() =>
	[
		{ title: 'Name', key: 'displayName', sortable: true },
		{ title: 'Kind', key: 'kind', sortable: true },
		{ title: 'Detail', key: 'infoText', sortable: false, minWidth: '160px' },
		{ title: 'Count', key: 'countValue', sortable: true },
		hasMatchColumn.value ? { title: 'Match · confidence', key: 'confidenceValue', sortable: true } : null,
		versionComparison.value ? { title: `vs ${versionComparison.value.comparedVersion}`, key: 'badgeOrder', sortable: true } : null,
		{ title: '', key: 'openAction', sortable: false, align: 'end' },
	].filter(Boolean),
);

// most-mapped first on a level of classes; the server's order otherwise
const sortByList = ref([]);
watch(
	() => store.focusNode?.stableId,
	() => {
		sortByList.value = store.levelRowList.some((oneRow) => oneRow.kind === 'class') ? [{ key: 'countValue', order: 'desc' }] : [];
	},
	{ immediate: true },
);

const rowPropsOf = ({ item }) => ({
	class: { 'explorer-row-selected': item.stableId === store.selectedStableId, 'explorer-row-home': item.isHome },
	'data-testid': `row-${item.name}`,
});

const selectRow = (clickEvent, { item }) => {
	if (isOpenAtOnceClick(clickEvent) && item.hasChildren) {
		emit('drill', item.stableId);
		return;
	}
	store.selectRow(item.stableId);
};
const drillRow = (clickEvent, { item }) => {
	if (item.hasChildren) emit('drill', item.stableId);
};
</script>

<template>
	<div class="explorer-table" data-testid="explorer-table">
		<v-data-table
			v-model:sort-by="sortByList"
			:headers="headerList"
			:items="tableRowList"
			item-value="stableId"
			:items-per-page="100"
			:items-per-page-options="[25, 50, 100, 500]"
			density="compact"
			hover
			:row-props="rowPropsOf"
			no-data-text="Nothing at this level matches the filter, or nothing is beneath this node."
			@click:row="selectRow"
			@dblclick:row="drillRow"
		>
			<template #item.displayName="{ item }">
				<span class="explorer-row-name">{{ item.displayName }}</span>
				<span v-if="item.isHome" class="explorer-home-chip" data-testid="home-chip">You started here</span>
				<span v-if="item.isSecondary" class="explorer-row-group">{{ item.groupName }}</span>
			</template>
			<template #item.kind="{ item }">
				<StandardsExplorerKindChip :node-kind="item.kind" :standard-family="item.standardFamily" :is-unmapped="item.kind === 'property' && !item.mapping" />
			</template>
			<template #item.infoText="{ item }">
				<span class="explorer-row-info">{{ item.infoText }}</span>
			</template>
			<template #item.countValue="{ item }">
				<span class="explorer-row-count">{{ item.countText }}</span>
			</template>
			<template #item.confidenceValue="{ item }">
				<StandardsExplorerMatchSummary v-if="item.mapping" :match-kind="item.mapping.matchKind" :mapping-confidence="item.mapping.mappingConfidence" />
				<StandardsExplorerMatchSummary v-else-if="item.strongestMatchKind" :match-kind="item.strongestMatchKind" :show-confidence="false" />
				<span v-else-if="['property', 'instance'].includes(item.kind)" class="explorer-unmapped">not mapped</span>
			</template>
			<template #item.badgeOrder="{ item }">
				<StandardsExplorerVersionBadge v-if="item.versionBadge" :version-badge="item.versionBadge" />
			</template>
			<template #item.openAction="{ item }">
				<v-btn v-if="item.hasChildren" size="small" variant="outlined" color="primary" :data-testid="`open-${item.name}`" @click.stop="emit('drill', item.stableId)">Open ›</v-btn>
			</template>
		</v-data-table>
	</div>
</template>

<style scoped>
.explorer-table {
	border: 1px solid #e3e7ef;
	border-radius: 10px;
	overflow-x: auto;
}
.explorer-row-name {
	font-weight: 700;
	color: #111827;
}
.explorer-row-group {
	margin-left: 8px;
	font-size: 12px;
	color: #6b7280;
}
.explorer-row-info {
	color: #374151;
	overflow-wrap: break-word;
}
.explorer-row-count {
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}
.explorer-unmapped {
	color: #6b7280;
}
.explorer-home-chip {
	margin-left: 8px;
	border-radius: 999px;
	padding: 1px 8px;
	font-size: 11px;
	font-weight: 700;
	background: #ffab40;
	color: #3b2300;
}
:deep(.explorer-row-selected) {
	background: #e7ecf6;
}
:deep(.explorer-row-home) {
	box-shadow: inset 4px 0 0 #ffab40;
}
:deep(tbody tr) {
	cursor: pointer;
}
</style>
