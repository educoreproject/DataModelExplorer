<script setup>
// The JEDx page's dictionary panel (SPEC-companionPages-102826): Steve Saxton's data dictionary as one searchable table,
// every element of the current compile: element ID, element, definition, HR Open property and its filter condition, and
// whether the property path reached a JEDx graph node. The search matches any of those texts; the section filter is the
// dictionary tab (the source's sourcePart).

import { computed, ref } from 'vue';

const props = defineProps({
	payload: { type: Object, required: true },
});

const STATUS_TEXT_BY_STATUS = { resolved: 'in the graph', unresolved: 'path does not resolve', pathAbsent: 'no HR Open path yet', unknownRoot: 'path names no known root', rootOnly: 'root only' };
const SEARCHED_FIELD_NAME_LIST = ['elementId', 'elementName', 'definition', 'hrOpenPath', 'hrOpenFilterCondition'];

const searchText = ref('');
const chosenSourcePart = ref(null);

const sourcePartOptionList = computed(() => [...new Set(props.payload.elementList.map((dictionaryElement) => dictionaryElement.sourcePart))]);

const shownElementList = computed(() => {
	const searchPattern = searchText.value.trim().toLowerCase();
	return props.payload.elementList.filter(
		(dictionaryElement) =>
			(!chosenSourcePart.value || dictionaryElement.sourcePart === chosenSourcePart.value) &&
			(!searchPattern || SEARCHED_FIELD_NAME_LIST.some((fieldName) => String(dictionaryElement[fieldName] || '').toLowerCase().includes(searchPattern))),
	);
});
</script>

<template>
	<div class="dictionary-panel">
		<div class="dictionary-filters">
			<v-text-field v-model="searchText" label="Search elements, definitions and HR Open paths" density="compact" variant="outlined" hide-details clearable data-testid="dictionary-search" />
			<v-select v-model="chosenSourcePart" :items="sourcePartOptionList" label="Dictionary section" density="compact" variant="outlined" hide-details clearable data-testid="dictionary-section" />
		</div>
		<p class="dictionary-count" data-testid="dictionary-count">{{ shownElementList.length }} of {{ payload.elementList.length }} elements</p>
		<div class="dictionary-scroll">
			<table class="companion-table">
				<thead>
					<tr>
						<th scope="col">Element ID</th>
						<th scope="col">Element</th>
						<th scope="col">Definition</th>
						<th scope="col">HR Open property</th>
						<th scope="col">Filter condition</th>
						<th scope="col">JEDx graph</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="dictionaryElement in shownElementList" :key="dictionaryElement.elementRowId" :data-testid="`dictionary-row-${dictionaryElement.elementRowId}`">
						<td class="dictionary-element-id">{{ dictionaryElement.elementId }}</td>
						<td class="dictionary-element-name">{{ dictionaryElement.elementName }}</td>
						<td class="dictionary-definition">{{ dictionaryElement.definition }}</td>
						<td class="companion-path-text dictionary-path">{{ dictionaryElement.hrOpenPath }}</td>
						<td class="companion-path-text dictionary-path">{{ dictionaryElement.hrOpenFilterCondition }}</td>
						<td class="dictionary-status" :data-status="dictionaryElement.status">
							{{ STATUS_TEXT_BY_STATUS[dictionaryElement.status] || dictionaryElement.status }}
							<code v-if="dictionaryElement.jedxStableId">{{ dictionaryElement.jedxSchemaName }}.{{ dictionaryElement.jedxPropertyName }}</code>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<style scoped>
.dictionary-filters {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
}
.dictionary-filters > .v-text-field {
	flex: 2 1 320px;
}
.dictionary-filters > .v-select {
	flex: 1 1 180px;
	max-width: 240px;
}
.dictionary-count {
	margin: 8px 0 4px;
	font-size: 13px;
	color: #6b7280;
}
.dictionary-scroll {
	max-height: 640px;
	overflow: auto;
	border: 1px solid #eef1f6;
	border-radius: 8px;
}
.dictionary-scroll thead th {
	position: sticky;
	top: 0;
	background: #ffffff;
	z-index: 1;
}
.dictionary-element-id {
	white-space: nowrap;
	font-weight: 700;
	color: #072a6c;
}
.dictionary-element-name {
	font-weight: 600;
	min-width: 160px;
}
.dictionary-definition {
	min-width: 260px;
}
.dictionary-path {
	min-width: 190px;
}
.dictionary-status {
	font-size: 12.5px;
	min-width: 150px;
}
.dictionary-status code {
	display: block;
	overflow-wrap: anywhere;
}
.dictionary-status[data-status='resolved'] {
	color: #0b6b4e;
}
.dictionary-status:not([data-status='resolved']) {
	color: #9b1c1c;
}
</style>
