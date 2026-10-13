<script setup>
// One mapping, read at a glance: a line sample in the match kind's colour AND style, the kind's name, and the
// confidence as a bar plus the printed number. A 0.5 close match must never look as solid as a 0.9 exact one.

import { computed } from 'vue';
import { confidenceTierOf, matchStyleByKind } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	matchKind: { type: String, required: true },
	mappingConfidence: { type: Number, default: null },
	showConfidence: { type: Boolean, default: true },
});

const matchStyle = computed(() => matchStyleByKind[props.matchKind]);
const confidenceTier = computed(() => confidenceTierOf(props.mappingConfidence));
const lineStyle = computed(() => ({
	borderTop: `${props.matchKind === 'narrow' ? 4 : confidenceTier.value.edgeWidth - 1}px ${matchStyle.value.lineStyle} ${matchStyle.value.color}`,
	opacity: confidenceTier.value.edgeOpacity,
}));
const confidenceText = computed(() => (typeof props.mappingConfidence === 'number' ? props.mappingConfidence.toFixed(2).replace(/0$/, '') : '–'));
</script>

<template>
	<span class="match-summary" :data-match-kind="matchKind">
		<span aria-hidden="true" class="match-line" :style="lineStyle" />
		<span class="match-kind" :style="{ color: matchStyle.color }">{{ matchKind }}</span>
		<template v-if="showConfidence">
			<span aria-hidden="true" class="match-bar"><span class="match-bar-fill" :style="{ width: `${Math.round((mappingConfidence || 0) * 100)}%`, background: matchStyle.color, opacity: confidenceTier.edgeOpacity }" /></span>
			<span class="match-confidence" :aria-label="`confidence ${confidenceText}`">{{ confidenceText }}</span>
		</template>
	</span>
</template>

<style scoped>
.match-summary {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	white-space: nowrap;
}
.match-line {
	display: inline-block;
	width: 30px;
	height: 0;
}
.match-kind {
	font-weight: 600;
}
.match-bar {
	position: relative;
	display: inline-block;
	width: 56px;
	height: 8px;
	background: #e5e7eb;
	border-radius: 4px;
	overflow: hidden;
}
.match-bar-fill {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
}
.match-confidence {
	font-variant-numeric: tabular-nums;
	font-weight: 600;
}
</style>
