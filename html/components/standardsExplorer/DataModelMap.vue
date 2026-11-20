<script setup>
// @concept: [[DataModelExplorer]]
// The Diagram tab inside a standard (BD 2026-11-17): the data model map the SERVER draws from the graph (POST /api/standard-data-model,
// render-data-model-diagram.js), in the use case map's format. At a standard (or a family holding one), the whole standard's classes
// and the links between them; at a class, the class with its properties and its neighbours; at a property, its class's map with the
// property marked. Shown as an <img> of the server's SVG, so the browser treats it as a picture, never as markup in the page; the
// server's own summary is its text alternative and its caption. It can be opened full size or downloaded as an .svg. Where there is
// no map (a standard too large to draw whole, a family of several standards, a level with no data model) it says so in words, and
// the level's items can still be shown as bubbles. Every word is explorerVocabulary's.

import { computed, watch } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { useStandardDataModelStore } from '@/stores/standardDataModelStore';
import { explorerComponentWords, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const mapWords = explorerComponentWords.dataModelMap;

const emit = defineEmits(['show-bubbles']);

const neighbourhoodStore = useStandardsNeighbourhoodStore();
const dataModelStore = useStandardDataModelStore();

const focusStableId = computed(() => neighbourhoodStore.focusNode?.stableId || '');
watch(focusStableId, (stableId) => dataModelStore.fetchMap(stableId), { immediate: true });

const mapResult = computed(() => dataModelStore.mapOf(focusStableId.value));
const statusMsg = computed(() => dataModelStore.statusMsgOf(focusStableId.value));
const isLoading = computed(() => dataModelStore.isLoading(focusStableId.value) || (!mapResult.value && !statusMsg.value));
const isDrawn = computed(() => Boolean(mapResult.value) && (mapResult.value.mapKind === 'standard' || mapResult.value.mapKind === 'class'));

const mapNameText = computed(() => {
	if (!mapResult.value) return '';
	if (mapResult.value.mapKind === 'class') return mapResult.value.focusClass?.name || '';
	const standard = mapResult.value.standard || {};
	return [standard.name, standard.version].filter(Boolean).join(' ');
});
const imageSource = computed(() => (isDrawn.value ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mapResult.value.svgText)}` : ''));
const altText = computed(() => (isDrawn.value ? wordingOf(mapWords.altTemplate, { mapName: mapNameText.value, summaryText: mapResult.value.summary.summaryText }) : ''));
const fileName = computed(() => `${mapNameText.value.replace(/[^A-Za-z0-9._-]+/g, '-') || 'data-model'}-data-model.svg`);

const tooLargeText = computed(() => {
	if (mapResult.value?.mapKind !== 'standardTooLarge') return '';
	const standard = mapResult.value.standard || {};
	return wordingOf(mapWords.tooLargeTemplate, {
		standardName: [standard.name, standard.version].filter(Boolean).join(' '),
		classCount: mapResult.value.classCount,
		linkText: Number.isFinite(mapResult.value.linkCount) ? wordingOf(mapWords.tooLargeLinkTemplate, { linkCount: mapResult.value.linkCount }) : '',
	});
});

const svgBlobUrl = () => URL.createObjectURL(new Blob([mapResult.value.svgText], { type: 'image/svg+xml' }));

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
	<section class="data-model-map" :aria-label="mapWords.sectionLabelText" data-testid="data-model-map">
		<div class="data-model-map-head">
			<h3 class="data-model-map-heading">{{ mapWords.headText }}</h3>
			<template v-if="isDrawn">
				<v-btn size="small" variant="text" color="primary" prepend-icon="mdi-open-in-new" data-testid="data-model-map-open" @click="openFullSize">{{ mapWords.openFullSizeText }}</v-btn>
				<v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-download" data-testid="data-model-map-download" @click="downloadSvg">{{ mapWords.downloadText }}</v-btn>
			</template>
		</div>

		<div v-if="isLoading" class="data-model-map-loading" role="status" data-testid="data-model-map-loading">
			<v-progress-linear indeterminate color="primary" class="mb-2" />
			<span>{{ mapWords.loadingText }}</span>
		</div>
		<v-alert v-else-if="statusMsg" type="warning" variant="tonal" density="compact" data-testid="data-model-map-error">
			<div class="data-model-map-alert">
				<span>{{ dataModelStore.endpointAbsent ? mapWords.endpointAbsentText : wordingOf(mapWords.unreadTemplate, { statusMsg }) }}</span>
				<v-btn size="small" variant="outlined" @click="dataModelStore.fetchMap(focusStableId)">{{ mapWords.retryText }}</v-btn>
			</div>
		</v-alert>
		<figure v-else-if="isDrawn" class="data-model-map-figure">
			<div class="data-model-map-frame">
				<img :src="imageSource" :alt="altText" :width="mapResult.width" :height="mapResult.height" class="data-model-map-image" data-testid="data-model-map-image" />
			</div>
			<figcaption class="data-model-map-caption" data-testid="data-model-map-summary">{{ mapResult.summary.summaryText }}</figcaption>
		</figure>
		<div v-else class="data-model-map-notice" data-testid="data-model-map-notice">
			<p v-if="mapResult.mapKind === 'standardTooLarge'">{{ tooLargeText }}</p>
			<template v-else-if="mapResult.mapKind === 'chooseStandard'">
				<p>{{ mapWords.chooseStandardText }}</p>
				<ul class="data-model-map-standard-list">
					<li v-for="oneStandard in mapResult.standardList" :key="oneStandard.stableId">{{ [oneStandard.name, oneStandard.version].filter(Boolean).join(' ') }}</li>
				</ul>
			</template>
			<p v-else>{{ mapWords.noneText }}</p>
		</div>

		<v-btn variant="text" size="small" color="primary" class="data-model-map-bubbles" data-testid="data-model-map-show-bubbles" @click="emit('show-bubbles')">{{ mapWords.showBubblesText }}</v-btn>
	</section>
</template>

<style scoped>
.data-model-map-head {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 8px;
}
.data-model-map-heading {
	margin: 0 auto 0 0;
	font-size: 13px;
	font-weight: 600;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: #4b5563;
}
.data-model-map-figure {
	margin: 0;
}
/* the map is drawn 1100px wide or more: it scales down to the column, and a narrow screen scrolls it sideways rather than
   shrinking its text past reading */
.data-model-map-frame {
	border: 1px solid #e3e7ef;
	border-radius: 12px;
	background: #ffffff;
	padding: 8px;
	overflow-x: auto;
}
.data-model-map-image {
	display: block;
	width: 100%;
	min-width: 720px;
	height: auto;
}
.data-model-map-caption {
	margin-top: 8px;
	font-size: 13px;
	color: #4b5563;
}
.data-model-map-loading,
.data-model-map-notice {
	padding: 16px;
	border: 1px dashed #c9d1de;
	border-radius: 12px;
	color: #374151;
	font-size: 14px;
}
.data-model-map-alert {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	justify-content: space-between;
}
.data-model-map-standard-list {
	margin: 8px 0 0 20px;
}
.data-model-map-bubbles {
	margin-top: 8px;
}
</style>
