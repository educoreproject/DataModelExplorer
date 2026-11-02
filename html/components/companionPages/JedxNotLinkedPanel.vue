<script setup>
// The JEDx page's "Not yet linked" panel (SPEC-companionPages-102826): for Steve Saxton and the working group, every
// dictionary element whose HR Open path does not reach a JEDx graph node, with the reason as the compile found it:
//   pathAbsent   the dictionary gives no usable path ("TBD", "To be determined", or empty)
//   unknownRoot  the path begins with no root the JEDx schemas know
//   unresolved   the walk stopped at a segment (shown) that the current schema and its references do not hold
//   rootOnly     the path names only a root
// The lists are the compile's (pathAbsentElementRowIdList, notLinkedElementRowIdList). An element whose path reaches a
// JEDx property with no hub match is not listed here; the Linkage and dictionary panels show it.

import { computed } from 'vue';

const props = defineProps({
	payload: { type: Object, required: true },
});

const REASON_TEXT_BY_STATUS = {
	pathAbsent: 'No HR Open path yet',
	unknownRoot: 'The path begins with no known JEDx root',
	unresolved: 'The path does not resolve',
	rootOnly: 'The path names only a root',
};
const REASON_ORDER_LIST = ['pathAbsent', 'unknownRoot', 'unresolved', 'rootOnly'];

const elementByRowId = computed(() => Object.fromEntries(props.payload.elementList.map((dictionaryElement) => [dictionaryElement.elementRowId, dictionaryElement])));

const reasonGroupList = computed(() => {
	const rowIdList = [...new Set([...props.payload.pathAbsentElementRowIdList, ...props.payload.notLinkedElementRowIdList])];
	const elementList = rowIdList.map((elementRowId) => elementByRowId.value[elementRowId]).filter(Boolean);
	return REASON_ORDER_LIST.map((status) => ({ status, reasonText: REASON_TEXT_BY_STATUS[status], elementList: elementList.filter((dictionaryElement) => dictionaryElement.status === status) })).filter((reasonGroup) => reasonGroup.elementList.length);
});
</script>

<template>
	<div class="not-linked-panel">
		<details v-for="reasonGroup in reasonGroupList" :key="reasonGroup.status" class="not-linked-group" :data-testid="`not-linked-${reasonGroup.status}`">
			<summary><strong>{{ reasonGroup.reasonText }}</strong> · {{ reasonGroup.elementList.length }} elements</summary>
			<table class="companion-table">
				<thead>
					<tr>
						<th scope="col">Element</th>
						<th scope="col">HR Open path as the dictionary gives it</th>
						<th v-if="reasonGroup.status === 'unresolved'" scope="col">Stopped at</th>
						<th scope="col">Revision notes</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="dictionaryElement in reasonGroup.elementList" :key="dictionaryElement.elementRowId">
						<td><strong>{{ dictionaryElement.elementId }}</strong> {{ dictionaryElement.elementName }}</td>
						<td class="companion-path-text">{{ dictionaryElement.hrOpenPath || '(empty)' }}</td>
						<td v-if="reasonGroup.status === 'unresolved'"><code>{{ dictionaryElement.unresolvedSegment }}</code></td>
						<td class="not-linked-notes">{{ dictionaryElement.revisionNotes }}</td>
					</tr>
				</tbody>
			</table>
		</details>
	</div>
</template>

<style scoped>
.not-linked-group {
	margin-top: 8px;
	border: 1px solid #eef1f6;
	border-radius: 8px;
	padding: 8px 10px;
}
.not-linked-group summary {
	cursor: pointer;
	color: #111827;
}
.not-linked-notes {
	font-size: 12.5px;
	color: #4b5563;
}
</style>
