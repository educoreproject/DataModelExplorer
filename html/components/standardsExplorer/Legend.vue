<script setup>
// The legend under the main card: bubbles, match kinds (colour and line), confidence tiers, and the marks.

import { computed } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { INCOMING_MEANING_RELATIONSHIP_TYPE, MEANING_RELATIONSHIP_TYPE, OWN_TERM_RELATIONSHIP_TYPE, confidenceTierList, familyStyleOf, matchDescriptionOf, matchKindOrderList, matchStyleByKind, versionBadgeTextOf, explorerComponentWords, explorerCommonWords, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const legendWords = explorerComponentWords.legend;

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
	// ⟪meaningsExplorer⟫ a walk with its own bubbles (its profile's legendNodeKindList) shows those, in each named hub's colours
	const walkLegendNodeKindList = store.walkProfile.legendNodeKindList;
	// ⟪meaningsPolish review N2⟫ and its shared bubbles (legendSharedNodeKindList) once, in the first named hub's colours
	const sharedNodeKindList = store.walkProfile.legendSharedNodeKindList || [];
	if (walkLegendNodeKindList)
		return [
			...hubList.flatMap(({ hubName, standardFamily }) => walkLegendNodeKindList.map((nodeKind) => ({ nodeKind, hubName, standardFamily }))),
			...sharedNodeKindList.map((nodeKind) => ({ nodeKind, hubName: hubList[0].hubName, standardFamily: hubList[0].standardFamily })),
		];
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

// ⟪meaningsClarity, TQ 2026-11-11: "Add those (a diagram key)"⟫ a walk with a diagram key (its profile's diagramKey) shows it, each mark drawn as the diagram draws it, in
// the first named hub's colours. A mark the key names that this legend cannot draw is refused by name.
// ⟪review N8⟫ each mark this legend can draw, and whether the diagram on screen draws it: the key lists only the marks of this level, and only while the diagram is shown
const rowsHave = (rowIsMarked) => store.levelRowList.some(rowIsMarked);
const markIsDrawnByName = {
	domainSquare: () => store.focusNode?.kind === 'meaningDomain' || rowsHave((oneRow) => oneRow.kind === 'meaningDomain'),
	meaningHexagon: () => store.focusNode?.kind === 'meaning' || rowsHave((oneRow) => oneRow.kind === 'meaning' && oneRow.relationshipType === MEANING_RELATIONSHIP_TYPE),
	ownTermHexagon: () => rowsHave((oneRow) => oneRow.relationshipType === OWN_TERM_RELATIONSHIP_TYPE),
	incomingMeaning: () => rowsHave((oneRow) => oneRow.relationshipType === INCOMING_MEANING_RELATIONSHIP_TYPE),
	moreInside: () => rowsHave((oneRow) => oneRow.hasChildren),
	expressedCount: () => rowsHave((oneRow) => oneRow.kind === 'meaning'),
	dimmed: () => store.filterUnmatchedRowCount > 0,
};
const diagramKey = computed(() => (store.walkProfile.diagramKey && store.effectiveViewMode === 'diagram' ? store.walkProfile.diagramKey : null));
const diagramKeyEntryList = computed(() =>
	(diagramKey.value ? diagramKey.value.entryList : []).filter((oneEntry) => {
		const markIsDrawn = markIsDrawnByName[oneEntry.markName];
		if (!markIsDrawn) throw new Error(`Legend: the diagram key names a mark it cannot draw, '${oneEntry.markName}' (${Object.keys(markIsDrawnByName).join(', ')})`);
		return markIsDrawn();
	}),
);
const diagramKeyFamilyStyle = computed(() => familyStyleOf((store.shownHubList[0] || {}).standardFamily || null));
const diagramKeySwatchStyle = computed(() => ({ '--diagram-key-color': diagramKeyFamilyStyle.value.color, '--diagram-key-tint': diagramKeyFamilyStyle.value.tint, '--diagram-key-fill': diagramKeyFamilyStyle.value.fill || diagramKeyFamilyStyle.value.color }));
</script>

<template>
	<div class="explorer-legend" data-testid="legend">
		<p class="legend-note" data-testid="legend-note">{{ legendWords.navigateNoteText }}</p>
		<div class="legend-column">
			<span class="legend-head">{{ legendWords.bubblesHeadText }}</span>
			<div class="legend-kinds">
				<span v-for="(oneKind, kindIndex) in legendKindList" :key="kindIndex">
					<StandardsExplorerKindChip :node-kind="oneKind.nodeKind" :standard-family="oneKind.standardFamily" :hub-name="oneKind.hubName || null" :is-unmapped="Boolean(oneKind.isUnmapped)" />
					<span v-if="oneKind.isUnmapped" class="legend-aside">{{ legendWords.notMappedAsideText }}</span>
				</span>
			</div>
		</div>
		<div v-if="diagramKey && diagramKeyEntryList.length" class="legend-column" :style="diagramKeySwatchStyle" data-testid="diagram-key">
			<span class="legend-head">{{ diagramKey.headText }}</span>
			<span v-for="oneEntry in diagramKeyEntryList" :key="oneEntry.markName" class="legend-row" :data-testid="`diagram-key-${oneEntry.markName}`">
				<span v-if="oneEntry.sampleText" class="key-sample">{{ oneEntry.sampleText }}</span>
				<span v-else-if="oneEntry.markName === 'moreInside'" aria-hidden="true" class="legend-more">›</span>
				<span v-else-if="oneEntry.markName === 'incomingMeaning'" aria-hidden="true" class="key-incoming"><span class="key-mark key-mark-incomingMeaning" /><span class="key-arrow" /></span>
				<span v-else aria-hidden="true" class="key-mark" :class="`key-mark-${oneEntry.markName}`" />
				{{ oneEntry.entryText }}
			</span>
		</div>
		<div v-if="store.walkProfile.legendShowsMatchColumns" class="legend-column">
			<span class="legend-head">{{ wordingOf(legendWords.matchHeadTemplate, { hubText: legendHubName || legendWords.anyHubText }) }}</span>
			<span v-for="matchKind in matchKindOrderList" :key="matchKind" class="legend-row">
				<span aria-hidden="true" class="legend-line" :style="{ borderTop: `${matchKind === 'narrow' ? 4 : 3}px ${matchStyleByKind[matchKind].lineStyle} ${matchStyleByKind[matchKind].color}` }" />
				<b :style="{ color: matchStyleByKind[matchKind].color }">{{ matchKind }}</b> {{ matchDescriptionOf(matchKind, legendHubName) }}
			</span>
		</div>
		<div v-if="store.walkProfile.legendShowsMatchColumns" class="legend-column">
			<span class="legend-head">{{ legendWords.confidenceHeadText }}</span>
			<span v-for="oneTier in confidenceTierList" :key="oneTier.tierName" class="legend-row">
				<span aria-hidden="true" class="legend-line" :style="{ borderTop: `${oneTier.edgeWidth}px solid #1F5FBF`, opacity: oneTier.edgeOpacity }" />
				{{ oneTier.tierName }}
			</span>
			<span class="legend-aside">{{ legendWords.confidenceAsideText }}</span>
		</div>
		<div v-if="store.walkProfile.legendShowsMatchColumns" class="legend-column">
			<span class="legend-head">{{ legendWords.marksHeadText }}</span>
			<span class="legend-row"><span aria-hidden="true" class="legend-more">›</span>{{ legendWords.moreInsideText }}</span>
			<span class="legend-row"><span aria-hidden="true" class="legend-ring" />{{ wordingOf(legendWords.ringTemplate, { hubText: legendHubName || legendWords.anyHubText }) }}</span>
			<span v-if="versionLegend" class="legend-row"><span class="legend-badge legend-badge-changed">{{ versionLegend.changedText }}</span><span class="legend-badge legend-badge-new">{{ versionLegend.newText }}</span> {{ legendWords.versionBadgeAsideText }}</span>
			<span class="legend-row"><span class="legend-badge legend-badge-home">{{ explorerCommonWords.homeChipText }}</span></span>
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
.key-mark {
	display: inline-block;
	width: 20px;
	height: 18px;
	flex: none;
}
.key-mark-domainSquare {
	width: 22px;
	height: 14px;
	border-radius: 3px;
	background: var(--diagram-key-tint);
	border: 1.5px solid var(--diagram-key-color);
}
.key-mark-meaningHexagon,
.key-mark-dimmed {
	background: var(--diagram-key-fill);
	clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%);
}
.key-mark-dimmed {
	opacity: 0.2;
}
/* an outline on a clipped hexagon: the outline colour behind, the fill inset over it */
.key-mark-ownTermHexagon,
.key-mark-incomingMeaning {
	position: relative;
	background: var(--diagram-key-color);
	clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%);
}
.key-mark-ownTermHexagon::after,
.key-mark-incomingMeaning::after {
	content: '';
	position: absolute;
	inset: 2.5px;
	clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%);
}
.key-mark-ownTermHexagon {
	background: repeating-linear-gradient(90deg, var(--diagram-key-color) 0 3px, transparent 3px 5px);
}
.key-mark-ownTermHexagon::after {
	background: var(--diagram-key-tint);
}
.key-mark-incomingMeaning::after {
	background: #ffffff;
}
.key-incoming {
	display: inline-flex;
	align-items: center;
	gap: 2px;
}
.key-arrow {
	width: 18px;
	height: 0;
	border-top: 2px dashed #a3acbd;
	position: relative;
}
.key-arrow::after {
	content: '';
	position: absolute;
	right: -4px;
	top: -5px;
	border-left: 6px solid #a3acbd;
	border-top: 4px solid transparent;
	border-bottom: 4px solid transparent;
}
.key-sample {
	font-size: 12px;
	font-weight: 600;
	color: #111827;
	background: #f8f9fc;
	border-radius: 4px;
	padding: 0 4px;
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
