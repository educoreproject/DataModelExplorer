<script setup>
// One CEDS or CTDL match of a JEDx property as the companion page shows it: its tier (EXACT_MATCH, CLOSE_MATCH,
// NARROW_MATCH, BROAD_MATCH, coloured as the Standards Explorer colours the relation), the hub and the hub term, and the
// judgment's provenance: confidence, method and source. The judge's rationale opens below on request. Every figure is
// the compile's, read from the golden.

import { computed } from 'vue';
import { matchStyleByKind, matchDescriptionOf, confidenceTierOf } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	hubMatch: { type: Object, required: true },
	isRationaleShown: { type: Boolean, default: false },
});

const tierText = computed(() => `${props.hubMatch.matchKind.toUpperCase()}_MATCH`);
const tierColor = computed(() => matchStyleByKind[props.hubMatch.matchKind].color);
const confidenceText = computed(() => (typeof props.hubMatch.mappingConfidence === 'number' ? props.hubMatch.mappingConfidence.toFixed(2) : 'not recorded'));
</script>

<template>
	<div class="match-tier" :data-match-kind="hubMatch.matchKind">
		<div class="match-tier-line">
			<span class="match-tier-chip" :style="{ color: tierColor, borderColor: tierColor }" :title="matchDescriptionOf(hubMatch.matchKind, hubMatch.hubName)">{{ tierText }}</span>
			<span class="match-tier-hub">{{ hubMatch.hubName }}</span>
			<span class="match-tier-name">{{ hubMatch.matchName }}</span>
		</div>
		<div class="match-tier-provenance">
			confidence {{ confidenceText }}<template v-if="typeof hubMatch.mappingConfidence === 'number'"> ({{ confidenceTierOf(hubMatch.mappingConfidence).tierName }})</template> · {{ hubMatch.mappingMethod }} · {{ hubMatch.mappingSource }}
		</div>
		<p v-if="isRationaleShown" class="match-tier-rationale">{{ hubMatch.mappingRationale }}</p>
		<details v-else-if="hubMatch.mappingRationale" class="match-tier-details">
			<summary>The judge's rationale</summary>
			<p class="match-tier-rationale">{{ hubMatch.mappingRationale }}</p>
		</details>
	</div>
</template>

<style scoped>
.match-tier {
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.match-tier-line {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px;
}
.match-tier-chip {
	border: 1px solid;
	border-radius: 4px;
	padding: 0 5px;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.03em;
}
.match-tier-hub {
	font-size: 12px;
	font-weight: 700;
	color: #4b5563;
}
.match-tier-name {
	font-weight: 600;
	color: #111827;
}
.match-tier-provenance {
	font-size: 12px;
	color: #6b7280;
	overflow-wrap: anywhere;
}
.match-tier-details summary {
	cursor: pointer;
	font-size: 12px;
	color: #072a6c;
}
.match-tier-rationale {
	margin: 4px 0 0;
	font-size: 12.5px;
	line-height: 1.45;
	color: #374151;
}
</style>
