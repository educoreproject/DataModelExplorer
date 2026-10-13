<script setup>
// The legend under the main card: bubbles, match kinds (colour and line), confidence tiers, and the marks.

import { confidenceTierList, matchKindOrderList, matchStyleByKind } from '@/components/standardsExplorer/explorerVocabulary';

const LEGEND_KIND_LIST = [
	{ nodeKind: 'family', standardFamily: 'PESC' },
	{ nodeKind: 'standard', standardFamily: 'PESC' },
	{ nodeKind: 'class', standardFamily: 'PESC' },
	{ nodeKind: 'property', standardFamily: 'PESC' },
	{ nodeKind: 'property', standardFamily: 'PESC', isUnmapped: true },
	{ nodeKind: 'cedsAnchor', standardFamily: 'CEDS' },
	{ nodeKind: 'cedsDomain', standardFamily: 'CEDS' },
	{ nodeKind: 'standardGroup', standardFamily: 'SIF' },
	{ nodeKind: 'instance', standardFamily: 'PESC' },
	{ nodeKind: 'optionSet', standardFamily: 'PESC' },
	{ nodeKind: 'support', standardFamily: 'PESC' },
];
</script>

<template>
	<div class="explorer-legend" data-testid="legend">
		<div class="legend-column">
			<span class="legend-head">Bubbles</span>
			<div class="legend-kinds">
				<span v-for="(oneKind, kindIndex) in LEGEND_KIND_LIST" :key="kindIndex">
					<StandardsExplorerKindChip :node-kind="oneKind.nodeKind" :standard-family="oneKind.standardFamily" :is-unmapped="Boolean(oneKind.isUnmapped)" />
					<span v-if="oneKind.isUnmapped" class="legend-aside">(not mapped)</span>
				</span>
			</div>
		</div>
		<div class="legend-column">
			<span class="legend-head">Match to CEDS</span>
			<span v-for="matchKind in matchKindOrderList" :key="matchKind" class="legend-row">
				<span aria-hidden="true" class="legend-line" :style="{ borderTop: `${matchKind === 'narrow' ? 4 : 3}px ${matchStyleByKind[matchKind].lineStyle} ${matchStyleByKind[matchKind].color}` }" />
				<b :style="{ color: matchStyleByKind[matchKind].color }">{{ matchKind }}</b> {{ matchStyleByKind[matchKind].description }}
			</span>
		</div>
		<div class="legend-column">
			<span class="legend-head">Confidence</span>
			<span v-for="oneTier in confidenceTierList" :key="oneTier.tierName" class="legend-row">
				<span aria-hidden="true" class="legend-line" :style="{ borderTop: `${oneTier.edgeWidth}px solid #1F5FBF`, opacity: oneTier.edgeOpacity }" />
				{{ oneTier.tierName }}
			</span>
			<span class="legend-aside">Thicker and darker means surer. Every mapping is a judgment, not a fact.</span>
		</div>
		<div class="legend-column">
			<span class="legend-head">Marks</span>
			<span class="legend-row"><span aria-hidden="true" class="legend-more">›</span>Has more inside</span>
			<span class="legend-row"><span aria-hidden="true" class="legend-ring" />Ring: share mapped to CEDS</span>
			<span class="legend-row"><span class="legend-badge legend-badge-changed">Changed</span><span class="legend-badge legend-badge-new">New in 1.8</span> against the other version</span>
			<span class="legend-row"><span class="legend-badge legend-badge-home">You started here</span></span>
		</div>
	</div>
</template>

<style scoped>
.explorer-legend {
	margin-top: 16px;
	border-top: 1px solid #eef0f4;
	padding-top: 12px;
	display: flex;
	flex-wrap: wrap;
	gap: 20px 32px;
	font-size: 13px;
	color: #374151;
}
.legend-column {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.legend-head {
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
.legend-kinds {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 14px;
	max-width: 520px;
}
.legend-row {
	display: inline-flex;
	align-items: center;
	gap: 8px;
}
.legend-line {
	display: inline-block;
	width: 34px;
	height: 0;
}
.legend-aside {
	color: #6b7280;
}
.legend-more {
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: #072a6c;
	color: #ffffff;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-weight: 700;
}
.legend-ring {
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: radial-gradient(circle, #e7ecf6 58%, transparent 60%), conic-gradient(#00b5b8 70%, #c9d3e8 0);
}
.legend-badge {
	border-radius: 999px;
	padding: 1px 8px;
	font-size: 11px;
	font-weight: 700;
}
.legend-badge-changed {
	background: #ffffff;
	border: 1.5px solid #b26a00;
	color: #8a5200;
}
.legend-badge-new {
	background: #ddf5f5;
	color: #005e61;
}
.legend-badge-home {
	background: #ffab40;
	color: #3b2300;
}
</style>
