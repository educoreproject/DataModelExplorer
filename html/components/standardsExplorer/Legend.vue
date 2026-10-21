<script setup>
// The legend under the main card: bubbles, match kinds (colour and line), confidence tiers, and the marks.

import { computed } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { confidenceTierList, matchDescriptionOf, matchKindOrderList, matchStyleByKind, versionBadgeTextOf } from '@/components/standardsExplorer/explorerVocabulary';

const store = useStandardsNeighbourhoodStore();

const LEGEND_KIND_LIST = [
	{ nodeKind: 'family', standardFamily: 'PESC' },
	{ nodeKind: 'standard', standardFamily: 'PESC' },
	{ nodeKind: 'class', standardFamily: 'PESC' },
	{ nodeKind: 'property', standardFamily: 'PESC' },
	{ nodeKind: 'property', standardFamily: 'PESC', isUnmapped: true },
	{ nodeKind: 'standardGroup', standardFamily: 'SIF' },
	{ nodeKind: 'instance', standardFamily: 'PESC' },
	{ nodeKind: 'optionSet', standardFamily: 'PESC' },
	{ nodeKind: 'support', standardFamily: 'PESC' },
];
// ⟪lane R6⟫ a hub's own bubbles are shown for the hubs this page names (store.shownHubList, read from the rows), in
// each hub's family colours; a page naming no hub shows them once, unnamed and neutral
const legendKindList = computed(() => {
	const hubList = store.shownHubList.length ? store.shownHubList : [{ hubName: null, standardFamily: null }];
	const hubKindList = hubList.reduce((soFar, { hubName, standardFamily }) => soFar.concat([{ nodeKind: 'hubAnchor', hubName, standardFamily }, { nodeKind: 'hubDomain', hubName, standardFamily }]), []);
	return [...LEGEND_KIND_LIST.slice(0, 5), ...hubKindList, ...LEGEND_KIND_LIST.slice(5)];
});
// the match descriptions are said of the page's hub when it names exactly one
const legendHubName = computed(() => (store.shownHubList.length === 1 ? store.shownHubList[0].hubName : null));
// ⟪lane R6⟫ the version badges are explained only where the page compares two versions, in that comparison's own words
// (it was a fixed 'Different in 1.8 / New in 1.8', shown on every page, a CTDL anchor's included)
const versionLegend = computed(() => {
	const versionComparison = store.neighbourhood?.versionComparison;
	if (!versionComparison) return null;
	const versionPair = { thisVersion: versionComparison.thisVersion, comparedVersion: versionComparison.comparedVersion };
	return { changedText: versionBadgeTextOf({ ...versionPair, badgeState: 'changed' }), newText: versionBadgeTextOf({ ...versionPair, badgeState: 'new' }) };
});
</script>

<template>
	<div class="explorer-legend" data-testid="legend">
		<p class="legend-note" data-testid="legend-note">Cmd-Click to Navigate</p>
		<div class="legend-column">
			<span class="legend-head">Bubbles</span>
			<div class="legend-kinds">
				<span v-for="(oneKind, kindIndex) in legendKindList" :key="kindIndex">
					<StandardsExplorerKindChip :node-kind="oneKind.nodeKind" :standard-family="oneKind.standardFamily" :hub-name="oneKind.hubName || null" :is-unmapped="Boolean(oneKind.isUnmapped)" />
					<span v-if="oneKind.isUnmapped" class="legend-aside">(not mapped)</span>
				</span>
			</div>
		</div>
		<div class="legend-column">
			<span class="legend-head">Match to {{ legendHubName || 'a hub' }}</span>
			<span v-for="matchKind in matchKindOrderList" :key="matchKind" class="legend-row">
				<span aria-hidden="true" class="legend-line" :style="{ borderTop: `${matchKind === 'narrow' ? 4 : 3}px ${matchStyleByKind[matchKind].lineStyle} ${matchStyleByKind[matchKind].color}` }" />
				<b :style="{ color: matchStyleByKind[matchKind].color }">{{ matchKind }}</b> {{ matchDescriptionOf(matchKind, legendHubName) }}
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
			<span class="legend-row"><span aria-hidden="true" class="legend-ring" />Ring: share mapped to {{ legendHubName || 'a hub' }}</span>
			<span v-if="versionLegend" class="legend-row"><span class="legend-badge legend-badge-changed">{{ versionLegend.changedText }}</span><span class="legend-badge legend-badge-new">{{ versionLegend.newText }}</span> against the other version</span>
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
.legend-note {
	flex-basis: 100%;
	margin: 0;
	font-weight: 600;
	color: #072a6c;
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
