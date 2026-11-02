<script setup>
// The JEDx page's Arkansas pilot panel (SPEC-companionPages-102826): which dictionary elements the pilot sheet marks,
// against which programs. What each column group MEANS is not confirmed (STANDDOWN-p2p3-VIOLET_MARBLE-102826), so this
// panel shows the sheet's own title, group labels and column headers as the sheet gives them, and every cell's text
// exactly as it is (an X in some columns, an element ID in others), and says nothing about what the columns mean. The
// one thing added is whether the element ID is in the current dictionary, which the compile worked out.

import { computed, ref } from 'vue';

const props = defineProps({
	arkansasPilot: { type: Object, required: true },
});

const searchText = ref('');

// adjacent columns with the same group label share one header cell; a column with no group label gets an empty one
const groupHeaderList = computed(() =>
	props.arkansasPilot.programColumnList.reduce((headerList, programColumn) => {
		const lastHeader = headerList[headerList.length - 1];
		if (lastHeader && lastHeader.groupLabel === programColumn.groupLabel) {
			lastHeader.columnSpan += 1;
			return headerList;
		}
		return [...headerList, { groupLabel: programColumn.groupLabel, columnSpan: 1, firstColumnIndex: programColumn.columnIndex }];
	}, []),
);

const cellTextOf = (elementMark, columnIndex) => {
	const cellMark = elementMark.markList.find((oneMark) => oneMark.columnIndex === columnIndex);
	return cellMark ? cellMark.cellText : '';
};

const shownElementMarkList = computed(() => {
	const searchPattern = searchText.value.trim().toLowerCase();
	return props.arkansasPilot.elementMarkList.filter((elementMark) => !searchPattern || `${elementMark.elementId} ${elementMark.elementName}`.toLowerCase().includes(searchPattern));
});

const inDictionaryCount = computed(() => props.arkansasPilot.elementMarkList.filter((elementMark) => elementMark.inDictionary).length);
</script>

<template>
	<div class="arkansas-panel">
		<p class="arkansas-title" data-testid="arkansas-title">{{ arkansasPilot.titleText }}</p>
		<p class="arkansas-note">
			From <strong>{{ arkansasPilot.fileName }}</strong>, dated {{ arkansasPilot.documentDate }}: {{ arkansasPilot.elementMarkList.length }} element rows, {{ inDictionaryCount }} of them elements of the current dictionary.
			The headings below are the sheet's own, and every cell is shown as the sheet has it. What each group of columns means has not been confirmed with the sheet's authors, so this page does not interpret them.
		</p>
		<v-text-field v-model="searchText" label="Search element ID or name" density="compact" variant="outlined" hide-details clearable class="arkansas-search" data-testid="arkansas-search" />
		<div class="arkansas-scroll">
			<table class="companion-table arkansas-table">
				<thead>
					<tr>
						<th scope="col" rowspan="2" class="arkansas-sticky-column">Element</th>
						<th scope="col" rowspan="2">In the dictionary</th>
						<th v-for="groupHeader in groupHeaderList" :key="groupHeader.firstColumnIndex" scope="colgroup" :colspan="groupHeader.columnSpan" class="arkansas-group" :data-testid="`arkansas-group-${groupHeader.firstColumnIndex}`">{{ groupHeader.groupLabel }}</th>
					</tr>
					<tr>
						<th v-for="programColumn in arkansasPilot.programColumnList" :key="programColumn.columnIndex" scope="col" class="arkansas-program" :title="`sheet column ${programColumn.columnIndex}`" :data-testid="`arkansas-column-${programColumn.columnIndex}`">{{ programColumn.programName }}</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="elementMark in shownElementMarkList" :key="`${elementMark.elementId}-${elementMark.elementName}`">
						<th scope="row" class="arkansas-sticky-column"><strong>{{ elementMark.elementId }}</strong> {{ elementMark.elementName }}</th>
						<td>{{ elementMark.inDictionary ? 'yes' : 'no' }}</td>
						<td v-for="programColumn in arkansasPilot.programColumnList" :key="programColumn.columnIndex" class="arkansas-cell">{{ cellTextOf(elementMark, programColumn.columnIndex) }}</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<style scoped>
.arkansas-title {
	margin: 0;
	font-weight: 700;
	white-space: pre-line;
}
.arkansas-note {
	margin: 6px 0 10px;
	max-width: 100ch;
	font-size: 13.5px;
	color: #4b5563;
}
.arkansas-search {
	max-width: 420px;
}
.arkansas-scroll {
	margin-top: 10px;
	max-height: 640px;
	overflow: auto;
	border: 1px solid #eef1f6;
	border-radius: 8px;
}
.arkansas-table {
	font-size: 12.5px;
}
.arkansas-table thead th {
	position: sticky;
	background: #ffffff;
	z-index: 1;
}
.arkansas-table thead tr:first-child th {
	top: 0;
}
.arkansas-table thead tr:last-child th {
	top: 34px;
}
/* the sheet's own words, so none of the table's usual upper-casing */
.arkansas-group {
	text-transform: none;
	letter-spacing: 0;
	text-align: center;
	border-bottom: 2px solid #d7deea;
}
.arkansas-program {
	min-width: 110px;
	white-space: pre-line;
	font-weight: 600;
	text-transform: none;
	letter-spacing: 0;
}
.arkansas-sticky-column {
	position: sticky;
	left: 0;
	background: #ffffff;
	min-width: 220px;
	text-align: left;
	font-weight: 400;
	z-index: 2;
}
.arkansas-cell {
	text-align: center;
	white-space: nowrap;
}
</style>
