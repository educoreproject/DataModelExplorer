<script setup>
// The level as a table: the same rows the diagram draws (store.filteredRowList), sortable, filterable, every row
// clickable. Single click selects (the detail panel follows), double click or Open drills.

import { computed, ref, watch } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { useSpecificationMetadataStore } from '@/stores/specificationMetadataStore';
import { familyHoldingTextOf, familyStyleOf, hubMappedTextOf, isOpenAtOnceClick, kindDisplayNameOf, meaningCountTextOf, meaningExpressionTextOf, meaningInfoTextOf, emptyLevelOf, walkFilterVocabulary, walkTableVocabulary, wordingOf, explorerCommonWords, explorerComponentWords } from '@/components/standardsExplorer/explorerVocabulary';

const store = useStandardsNeighbourhoodStore();
const specStore = useSpecificationMetadataStore();
const emit = defineEmits(['drill']);
const rowWords = explorerComponentWords.rowWords;

// the Info column says what it holds, from the kinds on this level
const infoTextOf = (oneRow) => {
	const infoByKind = {
		// a family the specification catalog describes leads with the catalog's full title
		family: () => [specStore.specByGraphFamily(oneRow.standardFamily)?.title, familyHoldingTextOf(oneRow)].filter(Boolean).join(' · '),
		class: () => oneRow.description,
		property: () => (oneRow.mapping ? oneRow.mapping.anchor.name : oneRow.description),
		instance: () => oneRow.path || oneRow.description,
		standard: () => oneRow.description || (oneRow.version ? wordingOf(rowWords.versionTemplate, { version: oneRow.version }) : ''),
		release: () => (oneRow.versionList ? wordingOf(rowWords.versionListTemplate, { versionListText: oneRow.versionList.map((oneVersion) => oneVersion.version).join(rowWords.versionListDivider) }) : ''),
		standardGroup: () => (oneRow.matchKindCountList || []).map((oneCount) => `${oneCount.matchKind} ${oneCount.elementCount}`).join(', '),
		hubAnchor: () => (oneRow.mapping && oneRow.mapping.occurrenceCount > 1 ? wordingOf(rowWords.fromOccurrencesTemplate, { occurrenceCount: oneRow.mapping.occurrenceCount }) : oneRow.hubDomainName ? wordingOf(rowWords.inDomainTemplate, { domainName: oneRow.hubDomainName }) : oneRow.description),
		// ⟪meaningsExplorer⟫
		meaning: () => meaningInfoTextOf(oneRow),
	};
	const infoReader = infoByKind[oneRow.kind];
	const infoText = infoReader ? infoReader() : oneRow.description || oneRow.path;
	return oneRow.ownerName && oneRow.path ? `${oneRow.path}` : infoText || '';
};

// the Count column: what "how much" means for each kind, with a numeric value to sort by
const countOf = (oneRow) => {
	const countByKind = {
		family: () => ({ countValue: oneRow.classCount, countText: wordingOf(rowWords.classCountTemplate, { classCount: oneRow.classCount }) }),
		class: () => ({ countValue: oneRow.mappedPropertyCount, countText: oneRow.propertyCount ? wordingOf(rowWords.mappedOfTemplate, { mappedCount: oneRow.mappedPropertyCount, propertyCount: oneRow.propertyCount }) : rowWords.noPropertiesText }),
		hubDomain: () => ({ countValue: oneRow.mappedPropertyCount, countText: oneRow.propertyCount ? wordingOf(rowWords.mappedToOfTemplate, { mappedCount: oneRow.mappedPropertyCount, propertyCount: oneRow.propertyCount }) : '' }),
		hubProperty: () => ({ countValue: oneRow.mappedElementCount ?? null, countText: hubMappedTextOf(oneRow) }),
		hubAnchor: () => ({ countValue: oneRow.elementCount ?? null, countText: hubMappedTextOf(oneRow) }),
		standard: () => ({ countValue: oneRow.classCount, countText: oneRow.classCount !== undefined ? wordingOf(rowWords.classCountTemplate, { classCount: oneRow.classCount }) : '' }),
		release: () => ({ countValue: (oneRow.versionList || []).length, countText: wordingOf(rowWords.versionCountTemplate, { versionCount: (oneRow.versionList || []).length }) }),
		standardGroup: () => ({ countValue: oneRow.elementCount, countText: wordingOf(rowWords.elementCountTemplate, { elementCount: oneRow.elementCount }) }),
		property: () => ({ countValue: oneRow.occurrenceCount, countText: oneRow.occurrenceCount ? `${oneRow.occurrenceCount}` : '' }),
		// ⟪meaningsExplorer⟫ a group of meanings counts its meanings; a meaning, the elements that express it
		meaningHub: () => ({ countValue: oneRow.meaningCount, countText: meaningCountTextOf(oneRow) }),
		meaningDomain: () => ({ countValue: oneRow.meaningCount, countText: meaningCountTextOf(oneRow) }),
		meaning: () => ({ countValue: oneRow.elementCount ?? null, countText: meaningExpressionTextOf(oneRow) }),
	};
	const countReader = countByKind[oneRow.kind];
	return countReader ? countReader() : { countValue: null, countText: '' };
};

const isAnchorLevel = computed(() => store.focusNode?.kind === 'hubAnchor');
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
const hasMatchColumn = computed(() => tableRowList.value.some((oneRow) => oneRow.matchKind || ['property', 'instance', 'hubAnchor'].includes(oneRow.kind)));

const columnTitleByName = walkTableVocabulary.columnTitleByName;
// TQ 2026-11-12: a walk may name, for the level on screen, columns it hides and the words of its Open button (the walk profile's levelTableByFocusKind)
const levelTable = computed(() => store.walkProfile.levelTableByFocusKind[store.focusNode?.kind] || {});
const hiddenColumnNameList = computed(() => levelTable.value.hiddenColumnNameList || []);
const openText = computed(() => levelTable.value.openText || walkTableVocabulary.openText);
const headerList = computed(() =>
	[
		{ title: columnTitleByName.displayName, key: 'displayName', sortable: true },
		{ title: columnTitleByName.kind, key: 'kind', sortable: true },
		{ title: columnTitleByName.infoText, key: 'infoText', sortable: false, minWidth: '160px' },
		{ title: columnTitleByName.countValue, key: 'countValue', sortable: true },
		hasMatchColumn.value ? { title: columnTitleByName.confidenceValue, key: 'confidenceValue', sortable: true } : null,
		versionComparison.value ? { title: wordingOf(walkTableVocabulary.comparedVersionColumnTemplate, { comparedVersion: versionComparison.value.comparedVersion }), key: 'badgeOrder', sortable: true } : null,
		{ title: columnTitleByName.openAction, key: 'openAction', sortable: false, align: 'end' },
	].filter((oneHeader) => oneHeader && !hiddenColumnNameList.value.includes(oneHeader.key)),
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
	'aria-selected': item.stableId === store.selectedStableId ? 'true' : 'false',
	'data-testid': `row-${item.name}`,
});

// a row's Open is a link to the walk one step further, so it has an href to follow, share or read
const openLinkOf = (item) => store.walkLinkOf(store.drillPathOf(item.stableId));

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

// ⟪explorerTidy⟫ an empty table says why: a filter that hides every row (with Clear), or a level with nothing beneath it
const emptyLevel = computed(() => emptyLevelOf({ levelRowCount: store.levelRowList.length, filterText: store.filterText }));
const selectLabelOf = (item) => wordingOf(walkTableVocabulary.selectLabelTemplate, { itemName: item.displayName, kindName: kindDisplayNameOf(item.kind, item.hubName) });
const openLabelOf = (item) => wordingOf(levelTable.value.openLabelTemplate || walkTableVocabulary.openLabelTemplate, { itemName: item.displayName });
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
			@click:row="selectRow"
			@dblclick:row="drillRow"
		>
			<template #no-data>
				<div v-if="emptyLevel.isEmptiedByFilter" class="explorer-empty" data-testid="table-empty-filtered">
					<span>{{ emptyLevel.emptyText }}</span>
					<v-btn size="small" variant="text" color="primary" :aria-label="walkFilterVocabulary.clearLabelText" data-testid="table-empty-clear" @click="store.setFilterText('')">{{ walkFilterVocabulary.clearText }}</v-btn>
				</div>
				<div v-else class="explorer-empty" data-testid="table-empty-level">{{ emptyLevel.emptyText }}</div>
			</template>
			<template #header.openAction>
				<span class="d-sr-only">{{ walkTableVocabulary.openColumnLabelText }}</span>
			</template>
			<template #item.displayName="{ item }">
				<!-- a named control per row, so the row's selection is reachable by keyboard and by an agent; its click
				     reaches the row's own click:row (select) -->
				<button type="button" class="explorer-row-name" :aria-label="selectLabelOf(item)" :aria-pressed="item.stableId === store.selectedStableId ? 'true' : 'false'" :data-testid="`select-${item.name}`">{{ item.displayName }}</button>
				<span v-if="item.isHome" class="explorer-home-chip" data-testid="home-chip">{{ explorerCommonWords.homeChipText }}</span>
				<span v-if="item.isSecondary" class="explorer-row-group">{{ item.groupName }}</span>
			</template>
			<template #item.kind="{ item }">
				<StandardsExplorerKindChip :node-kind="item.kind" :standard-family="item.standardFamily" :hub-name="item.hubName || null" :is-unmapped="item.kind === 'property' && !item.mapping" />
			</template>
			<template #item.infoText="{ item }">
				<span class="explorer-row-info">{{ item.infoText }}</span>
			</template>
			<template #item.countValue="{ item }">
				<span class="explorer-row-count" :class="{ 'explorer-row-count-wraps': store.walkProfile.countTextWraps }">{{ item.countText }}</span>
			</template>
			<template #item.confidenceValue="{ item }">
				<StandardsExplorerMatchSummary v-if="item.mapping" :match-kind="item.mapping.matchKind" :mapping-confidence="item.mapping.mappingConfidence" />
				<StandardsExplorerMatchSummary v-else-if="item.strongestMatchKind" :match-kind="item.strongestMatchKind" :show-confidence="false" />
				<span v-else-if="['property', 'instance'].includes(item.kind)" class="explorer-unmapped">{{ walkTableVocabulary.notMappedText }}</span>
			</template>
			<template #item.badgeOrder="{ item }">
				<StandardsExplorerVersionBadge v-if="item.versionBadge" :version-badge="item.versionBadge" />
			</template>
			<template #item.openAction="{ item }">
				<v-btn v-if="item.hasChildren" size="small" variant="outlined" color="primary" :to="openLinkOf(item)" :aria-label="openLabelOf(item)" :data-testid="`open-${item.name}`" @click.stop>{{ openText }}</v-btn>
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
	font: inherit;
	font-weight: 700;
	color: #111827;
	background: none;
	border: none;
	padding: 0;
	text-align: left;
	cursor: pointer;
}
.explorer-row-name:focus-visible {
	outline: 2px solid #072a6c;
	outline-offset: 2px;
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
/* ⟪meaningsPolish⟫ a walk whose counts are phrases (the meanings walk's "113 meanings + its own term · 3 expressed in other standards") wraps them */
.explorer-row-count-wraps {
	white-space: normal;
}
.explorer-unmapped {
	color: #6b7280;
}
.explorer-empty {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 4px 8px;
	overflow-wrap: anywhere;
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
/* ⟪meaningsClarity Addendum C #11⟫ the Open column stays in view at the table's right edge when the table scrolls sideways */
:deep(tbody td:last-child),
:deep(thead th:last-child) {
	/* Vuetify's own td rule sets position: relative with a more specific selector */
	position: sticky !important;
	right: 0;
	z-index: 1;
	background: #ffffff;
	box-shadow: -6px 0 6px -6px rgba(17, 24, 39, 0.25);
}
:deep(thead th:last-child) {
	background: inherit;
}
</style>
