<script setup>
// Where a standard's source came from (WORKORDER-sourceUrls-101526), from one downloads.json entry: the address as a
// link that opens in a new tab, worded by its relation exactly as the manifest gives it (sourceUrlRelationText: "Downloaded
// from", "Published on", "Re-published by the publisher as", "Derived from"), the page it is linked from when there is one,
// and the caveat note. An entry that records no address says so; it is never given a publisher's home page instead.
// The wording comes from the forge (lib/snapshot-provenance/sourceUrlRelationTable.json), so nothing here maps relations.

import { computed } from 'vue';

const props = defineProps({
	downloadEntry: { type: Object, required: true },
});

const NOT_RECORDED_TEXT = 'Where this source was obtained is not recorded.';

const isRecorded = computed(() => typeof props.downloadEntry.sourceUrl === 'string' && props.downloadEntry.sourceUrl !== '');

// a long address reads better as its host and its last step; the full address is the link and its title
const shortAddressOf = (addressText) => {
	const parsedAddress = new URL(addressText);
	const stepList = parsedAddress.pathname.split('/').filter(Boolean);
	if (stepList.length === 0) return parsedAddress.host;
	return stepList.length === 1 ? `${parsedAddress.host}/${stepList[0]}` : `${parsedAddress.host}/…/${stepList[stepList.length - 1]}`;
};
</script>

<template>
	<div class="source-url-note" :data-testid="`source-url-${downloadEntry.standardKey}`" :data-source-url-relation="downloadEntry.sourceUrlRelation || 'notRecorded'">
		<template v-if="isRecorded">
			<span class="source-url-relation" :data-testid="`source-url-relation-${downloadEntry.standardKey}`">{{ downloadEntry.sourceUrlRelationText }}</span>
			{{ ' ' }}
			<a :href="downloadEntry.sourceUrl" :title="downloadEntry.sourceUrl" target="_blank" rel="noopener noreferrer" class="source-url-link" :data-testid="`source-url-link-${downloadEntry.standardKey}`">{{ shortAddressOf(downloadEntry.sourceUrl) }}</a>
			<template v-if="downloadEntry.sourceUrlPage">
				{{ ' ' }}<span class="source-url-page">(linked from <a :href="downloadEntry.sourceUrlPage" :title="downloadEntry.sourceUrlPage" target="_blank" rel="noopener noreferrer" class="source-url-link" :data-testid="`source-url-page-${downloadEntry.standardKey}`">{{ shortAddressOf(downloadEntry.sourceUrlPage) }}</a>)</span>
			</template>
			<span v-if="downloadEntry.sourceUrlNote" class="source-url-caveat" :data-testid="`source-url-note-${downloadEntry.standardKey}`">{{ downloadEntry.sourceUrlNote }}</span>
		</template>
		<span v-else class="source-url-unrecorded" :data-testid="`source-url-unrecorded-${downloadEntry.standardKey}`">{{ NOT_RECORDED_TEXT }}</span>
	</div>
</template>

<style scoped>
.source-url-note {
	font-size: 12.5px;
	line-height: 1.45;
	color: #4b5563;
	overflow-wrap: anywhere;
}
.source-url-relation {
	font-weight: 600;
	color: #374151;
}
.source-url-link {
	color: #072a6c;
}
.source-url-caveat {
	display: block;
	margin-top: 2px;
	font-style: italic;
	color: #6b7280;
}
.source-url-unrecorded {
	font-style: italic;
	color: #6b7280;
}
</style>
