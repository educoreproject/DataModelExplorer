<script setup>
// @concept: [[DataModelExplorer]]
// The Overview tab's use case map (BD 2026-11-04): the case drawn by the SERVER from the graph (forged-use-cases
// caseDiagram, server/data-model/lib/use-case-diagram/render-use-case-diagram.js): its context, the actors who perform
// each step, the steps in reading order, and the CEDS (and other standards') elements each step reads or writes.
// Shown as an <img> of the server's SVG, so the browser treats it as a picture, never as markup in the page; the server's
// own summary is its text alternative and its caption. It can be opened full size or downloaded as an .svg.

import { computed, watch } from 'vue';
import { useForgedUseCaseStore } from '@/stores/forgedUseCaseStore';

const props = defineProps({
	caseStableId: { type: String, required: true },
});

const store = useForgedUseCaseStore();

watch(
	() => props.caseStableId,
	(caseStableId) => {
		if (caseStableId) store.fetchCaseDiagram(caseStableId);
	},
	{ immediate: true },
);

// only the diagram of THIS case (a quick move between cases must not show the last one's)
const diagram = computed(() => (store.caseDiagram && store.caseDiagram.caseStableId === props.caseStableId ? store.caseDiagram : null));
const imageSource = computed(() => (diagram.value ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(diagram.value.svgText)}` : ''));
const altText = computed(() => (diagram.value ? `Use case map of ${props.caseStableId}: ${diagram.value.summary.summaryText}` : ''));
const fileName = computed(() => `${props.caseStableId.replace(/[^A-Za-z0-9._-]+/g, '-')}-use-case-map.svg`);

const svgBlobUrl = () => URL.createObjectURL(new Blob([diagram.value.svgText], { type: 'image/svg+xml' }));

const openFullSize = () => {
	const objectUrl = svgBlobUrl();
	window.open(objectUrl, '_blank', 'noopener');
	setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
};

const downloadSvg = () => {
	const objectUrl = svgBlobUrl();
	const anchorElement = document.createElement('a');
	anchorElement.href = objectUrl;
	anchorElement.download = fileName.value;
	document.body.appendChild(anchorElement);
	anchorElement.click();
	anchorElement.remove();
	setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
};
</script>

<template>
	<section class="case-diagram mb-6" aria-labelledby="case-diagram-heading" data-testid="case-diagram">
		<div class="d-flex align-center flex-wrap ga-2 mb-2">
			<h3 id="case-diagram-heading" class="text-overline text-medium-emphasis case-diagram-heading">USE CASE MAP</h3>
			<v-spacer />
			<template v-if="diagram">
				<v-btn size="small" variant="text" color="primary" prepend-icon="mdi-open-in-new" data-testid="case-diagram-open" @click="openFullSize">Open full size</v-btn>
				<v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-download" data-testid="case-diagram-download" @click="downloadSvg">Download SVG</v-btn>
			</template>
		</div>
		<p class="text-body-2 text-medium-emphasis mb-3">
			Generated from the EDUcore graph: who performs each step, and the CEDS and other standards' elements each step reads or writes.
		</p>

		<v-skeleton-loader v-if="store.caseDiagramLoading" type="image" height="320" data-testid="case-diagram-loading" />
		<v-alert v-else-if="store.caseDiagramStatusMsg" type="warning" variant="tonal" density="compact" data-testid="case-diagram-error">
			<div class="d-flex align-center flex-wrap ga-2">
				<span style="flex: 1; min-width: 200px;">The use case map could not be drawn: {{ store.caseDiagramStatusMsg }}</span>
				<v-btn size="small" variant="outlined" @click="store.fetchCaseDiagram(caseStableId)">Try again</v-btn>
			</div>
		</v-alert>
		<figure v-else-if="diagram" class="case-diagram-figure">
			<div class="case-diagram-frame">
				<img :src="imageSource" :alt="altText" :width="diagram.width" :height="diagram.height" class="case-diagram-image" data-testid="case-diagram-image" />
			</div>
			<figcaption class="text-caption text-medium-emphasis mt-2" data-testid="case-diagram-summary">{{ diagram.summary.summaryText }}</figcaption>
		</figure>
	</section>
</template>

<style scoped>
.case-diagram-heading {
	margin: 0;
	line-height: 1.6;
}
.case-diagram-figure {
	margin: 0;
}
/* the map is 1100px wide: it scales down to the column, and a narrow screen scrolls it sideways rather than shrinking
   its text past reading */
.case-diagram-frame {
	border: 1px solid #e3e7ef;
	border-radius: 12px;
	background: #ffffff;
	padding: 8px;
	overflow-x: auto;
}
.case-diagram-image {
	display: block;
	width: 100%;
	min-width: 720px;
	height: auto;
}
</style>
