<script setup>
// One download of the standard downloads (WORKORDER-standardDownloads-101526): a button that fetches the entry's zip
// through the downloads store, or, for an entry the manifest marks unavailable, the reason in plain words instead.

import { computed } from 'vue';
import { useStandardDownloadsStore } from '@/stores/standardDownloadsStore';

const props = defineProps({
	downloadEntry: { type: Object, required: true },
	showReason: { type: Boolean, default: true },
});

const downloadsStore = useStandardDownloadsStore();

const facetLabelByName = { source: 'Source', graph: 'From the graph' };
const facetLabel = computed(() => facetLabelByName[props.downloadEntry.facet] || props.downloadEntry.facet);
const sizeText = computed(() => {
	const byteSize = props.downloadEntry.byteSize;
	if (!byteSize) return '';
	return byteSize >= 1048576 ? `${(byteSize / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(byteSize / 1024))} KB`;
});
const isDownloading = computed(() => downloadsStore.downloadingDownloadId === props.downloadEntry.downloadId);
</script>

<template>
	<div class="download-entry" :data-testid="`download-entry-${downloadEntry.downloadId}`">
		<v-btn
			v-if="downloadEntry.available"
			size="small"
			variant="outlined"
			color="primary"
			prepend-icon="mdi-download"
			:loading="isDownloading"
			:disabled="Boolean(downloadsStore.downloadingDownloadId) && !isDownloading"
			:data-testid="`download-${downloadEntry.downloadId}`"
			@click="downloadsStore.downloadEntry(downloadEntry)"
		>
			{{ facetLabel }}<span class="download-entry-size">{{ sizeText }}</span>
		</v-btn>
		<template v-else>
			<v-btn size="small" variant="outlined" disabled :data-testid="`download-${downloadEntry.downloadId}`">{{ facetLabel }}</v-btn>
			<span v-if="showReason" class="download-entry-reason" :data-testid="`download-reason-${downloadEntry.downloadId}`">{{ facetLabel }} not available: {{ downloadEntry.unavailableReason }}</span>
		</template>
	</div>
</template>

<style scoped>
.download-entry {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}
.download-entry-size {
	margin-left: 6px;
	font-size: 11px;
	color: #6b7280;
	text-transform: none;
}
.download-entry-reason {
	font-size: 12px;
	line-height: 1.4;
	color: #4b5563;
	flex-basis: 100%;
}
</style>
