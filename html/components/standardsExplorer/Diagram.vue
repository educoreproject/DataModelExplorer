<script setup>
// The level as a Cytoscape bubble diagram: the focus in the centre, the level's rows (store.levelRowList, the same
// rows the table lists) on an ellipse around it, labels below. One Cytoscape instance, owned here, created on mount
// and destroyed on unmount; a new level replaces its elements. Single click selects, double click drills.
// A level too large to draw shows a sample plus a dashed "+N more" bubble that switches to the table.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import cytoscape from 'cytoscape';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import {
	LARGE_LEVEL_ITEM_COUNT,
	confidenceTierOf,
	displayNameOf,
	familyStyleOf,
	matchStyleByKind,
	versionBadgeTextOf,
} from '@/components/standardsExplorer/explorerVocabulary';

const store = useStandardsNeighbourhoodStore();
const emit = defineEmits(['drill']);

const canvasElement = ref(null);
let cyInstance = null;

const SAMPLE_ITEM_COUNT = 24;
const MAXIMUM_FIT_ZOOM = 1.15;
const STRUCTURAL_EDGE_COLOR = '#A3ACBD';
const MORE_NODE_ID = 'explorer-more';
const DRILL_BADGE_SUFFIX = '::drill';

const shortText = (rawText, maximumLength) => (rawText && rawText.length > maximumLength ? `${rawText.slice(0, maximumLength - 1)}…` : rawText || '');
const confidenceText = (mappingConfidence) => (typeof mappingConfidence === 'number' ? String(Math.round(mappingConfidence * 100) / 100) : '');

// ================================================================================
// WHICH ROWS ARE DRAWN — all of them, or for a large level a sample: the most-mapped classes, else mapped rows first

const drawnRowList = computed(() => {
	const levelRowList = store.levelRowList;
	if (levelRowList.length <= LARGE_LEVEL_ITEM_COUNT) return levelRowList;
	const rankOf = (oneRow) => (oneRow.kind === 'class' ? oneRow.mappedPropertyCount || 0 : oneRow.mapping ? 1 : 0);
	return [...levelRowList].sort((left, right) => rankOf(right) - rankOf(left)).slice(0, SAMPLE_ITEM_COUNT);
});
const hiddenRowCount = computed(() => store.levelRowList.length - drawnRowList.value.length);

const homeStandardKey = computed(() => (store.focusNode?.kind === 'cedsAnchor' && store.crossing ? store.crossing.homeStandardKey : null));

// ================================================================================
// THE LABEL UNDER A BUBBLE — name, then what matters about it, then its badge

const subTextOf = (oneRow) => {
	const subByKind = {
		class: () => (oneRow.propertyCount ? `${oneRow.mappedPropertyCount} of ${oneRow.propertyCount} mapped` : ''),
		property: () => (oneRow.mapping ? `${oneRow.mapping.matchKind} · ${confidenceText(oneRow.mapping.mappingConfidence)}` : 'not mapped'),
		instance: () => (oneRow.mapping ? `${oneRow.mapping.matchKind} · ${confidenceText(oneRow.mapping.mappingConfidence)}` : shortText(oneRow.path, 40)),
		standard: () => (oneRow.classCount !== undefined ? `${oneRow.classCount} classes` : ''),
		release: () => (oneRow.versionList ? `versions ${oneRow.versionList.map((oneVersion) => oneVersion.version).join(', ')}` : ''),
		standardGroup: () => `${oneRow.elementCount} elements`,
	};
	const subReader = subByKind[oneRow.kind];
	return subReader ? subReader() : '';
};

const labelOf = (oneRow) => {
	const badgeText = oneRow.versionBadge && oneRow.versionBadge.badgeState !== 'unchanged' ? versionBadgeTextOf(oneRow.versionBadge) : '';
	const homeText = homeStandardKey.value && oneRow.standardKey === homeStandardKey.value ? 'You started here' : '';
	return [shortText(oneRow.displayName, 40), oneRow.relationshipType === 'MAPS_TO_CEDS' ? '' : subTextOf(oneRow), badgeText, homeText].filter(Boolean).join('\n');
};

// ================================================================================
// ELEMENTS

const nodeDataOf = (oneRow, { isFocus }) => {
	const familyStyle = familyStyleOf(oneRow.standardFamily);
	const mapping = oneRow.mapping;
	const matchStyle = mapping ? matchStyleByKind[mapping.matchKind] : null;
	const confidenceTier = mapping ? confidenceTierOf(mapping.mappingConfidence) : null;
	const mappedFraction = oneRow.propertyCount ? (oneRow.mappedPropertyCount || 0) / oneRow.propertyCount : 0;
	const groupSize = oneRow.kind === 'standardGroup' ? Math.min(120, 40 + 12 * Math.sqrt(oneRow.elementCount || 1)) : 0;
	return {
		id: oneRow.stableId,
		label: isFocus ? shortText(oneRow.displayName, 40) : labelOf(oneRow),
		kind: oneRow.kind,
		familyColor: familyStyle.color,
		familyTint: familyStyle.tint,
		matchColor: matchStyle ? matchStyle.color : familyStyle.color,
		matchBorderStyle: matchStyle ? matchStyle.lineStyle : 'solid',
		matchBorderWidth: confidenceTier ? confidenceTier.edgeWidth - 1 : 2,
		matchBorderOpacity: confidenceTier ? confidenceTier.edgeOpacity : 1,
		mappedPercent: Math.round(mappedFraction * 100),
		unmappedPercent: 100 - Math.round(mappedFraction * 100),
		groupSize,
		isMapped: Boolean(mapping),
		isFocus,
		hasChildren: Boolean(oneRow.hasChildren),
		isHome: Boolean(homeStandardKey.value) && oneRow.standardKey === homeStandardKey.value,
		isMatching: store.rowMatchesFilter(oneRow),
	};
};

// mapping edges carry the match kind's colour and line style and the confidence's width and opacity; narrow is a
// double line, drawn as two thin parallel edges because Cytoscape edges have no double style
const edgeDataListOf = ({ focusStableId, oneRow }) => {
	const edgeIdText = `${focusStableId}->${oneRow.stableId}`;
	const isMappingEdge = oneRow.relationshipType === 'MAPS_TO_CEDS' || oneRow.relationshipType === 'MAPPED_TO_ANCHOR' || oneRow.relationshipType === 'MAPPED_FROM_STANDARD';
	const matchKind = oneRow.mapping ? oneRow.mapping.matchKind : oneRow.strongestMatchKind;
	if (!isMappingEdge || !matchKind) {
		return [{ id: edgeIdText, source: focusStableId, target: oneRow.stableId, edgeKind: 'structural', isMatching: store.rowMatchesFilter(oneRow) }];
	}
	const matchStyle = matchStyleByKind[matchKind];
	const confidenceTier = oneRow.mapping ? confidenceTierOf(oneRow.mapping.mappingConfidence) : { edgeWidth: 4, edgeOpacity: 1 };
	const chipText = oneRow.relationshipType === 'MAPS_TO_CEDS' ? `${matchKind} · ${confidenceText(oneRow.mapping.mappingConfidence)}` : '';
	const baseEdgeData = { source: focusStableId, target: oneRow.stableId, edgeKind: 'mapping', matchColor: matchStyle.color, lineStyle: matchStyle.lineStyle, chipText, isMatching: store.rowMatchesFilter(oneRow) };
	if (matchKind !== 'narrow') {
		return [{ ...baseEdgeData, id: edgeIdText, edgeWidth: confidenceTier.edgeWidth, edgeOpacity: confidenceTier.edgeOpacity, controlDistance: 0 }];
	}
	return [-3, 3].map((controlDistance, lineIndex) => ({ ...baseEdgeData, id: `${edgeIdText}#${lineIndex}`, lineStyle: 'solid', chipText: lineIndex ? '' : chipText, edgeWidth: Math.max(1.5, confidenceTier.edgeWidth / 2.5), edgeOpacity: confidenceTier.edgeOpacity, controlDistance }));
};

// focus in the centre, rows on an ellipse; the ellipse grows with the number of rows
const positionByIndexOf = (rowCount) => {
	const radiusX = Math.min(480, 200 + rowCount * 8);
	const radiusY = radiusX * 0.6;
	return (rowIndex) => {
		const angle = -Math.PI / 2 + (2 * Math.PI * rowIndex) / Math.max(rowCount, 1);
		return { x: radiusX * Math.cos(angle), y: radiusY * Math.sin(angle) };
	};
};

const elementListOf = () => {
	const focusNode = store.focusNode;
	if (!focusNode) return [];
	// a mapped focus wears its strongest mapping, as it did as a bubble one level up
	const focusRow = { ...focusNode, displayName: displayNameOf(focusNode), hasChildren: true, mapping: (store.neighbourhood.mappingList || [])[0] || null };
	const rowList = drawnRowList.value;
	const slotCount = rowList.length + (hiddenRowCount.value > 0 ? 1 : 0);
	const positionOf = positionByIndexOf(slotCount);
	const elementList = [{ group: 'nodes', data: nodeDataOf(focusRow, { isFocus: true }), position: { x: 0, y: 0 }, selectable: false }];
	rowList.forEach((oneRow, rowIndex) => {
		const nodePosition = positionOf(rowIndex);
		elementList.push({ group: 'nodes', data: nodeDataOf(oneRow, { isFocus: false }), position: nodePosition });
		if (oneRow.hasChildren) {
			elementList.push({ group: 'nodes', data: { id: `${oneRow.stableId}${DRILL_BADGE_SUFFIX}`, kind: 'drillBadge', label: '›', ownerStableId: oneRow.stableId, familyColor: '#FFFFFF', isMatching: store.rowMatchesFilter(oneRow) }, position: { x: nodePosition.x + 22, y: nodePosition.y + 20 }, selectable: false });
		}
		edgeDataListOf({ focusStableId: focusNode.stableId, oneRow }).forEach((edgeData) => elementList.push({ group: 'edges', data: edgeData }));
	});
	if (hiddenRowCount.value > 0) {
		const familyStyle = familyStyleOf(focusNode.standardFamily);
		elementList.push({ group: 'nodes', data: { id: MORE_NODE_ID, kind: 'more', label: `+${hiddenRowCount.value} more`, familyColor: familyStyle.color, isMatching: true }, position: positionOf(rowList.length) });
		elementList.push({ group: 'edges', data: { id: `${focusNode.stableId}->${MORE_NODE_ID}`, source: focusNode.stableId, target: MORE_NODE_ID, edgeKind: 'structural', isMatching: true } });
	}
	return elementList;
};

// ================================================================================
// STYLE — design/HANDOFF.md's tables

const styleList = [
	{
		selector: 'node',
		style: {
			label: 'data(label)',
			'text-valign': 'bottom',
			'text-halign': 'center',
			'text-margin-y': 6,
			'text-wrap': 'wrap',
			'text-max-width': 150,
			'font-family': 'Open Sans, system-ui, sans-serif',
			'font-size': 12,
			'font-weight': 600,
			color: '#111827',
			'text-background-color': '#F8F9FC',
			'text-background-opacity': 0.9,
			'text-background-padding': 2,
			'text-background-shape': 'roundrectangle',
			width: 60,
			height: 60,
			'background-color': '#FFFFFF',
			'border-width': 2,
			'border-color': 'data(familyColor)',
		},
	},
	{ selector: 'node[kind = "family"]', style: { 'background-color': 'data(familyColor)', color: '#FFFFFF', 'text-valign': 'center', 'text-margin-y': 0, 'text-background-opacity': 0 } },
	{ selector: 'node[kind = "standard"], node[kind = "release"]', style: { 'border-width': 3 } },
	{ selector: 'node[kind = "class"]', style: { 'background-color': 'data(familyTint)', 'pie-size': '100%', 'pie-hole': '78%', 'pie-1-background-color': '#00B5B8', 'pie-1-background-size': 'data(mappedPercent)', 'pie-2-background-color': '#C9D3E8', 'pie-2-background-size': 'data(unmappedPercent)', 'border-width': 0 } },
	{ selector: 'node[kind = "property"][?isMapped], node[kind = "instance"][?isMapped]', style: { 'background-color': '#FFFFFF', 'border-color': 'data(matchColor)', 'border-style': 'data(matchBorderStyle)', 'border-width': 'data(matchBorderWidth)', 'border-opacity': 'data(matchBorderOpacity)' } },
	{ selector: 'node[kind = "property"][!isMapped]', style: { 'background-color': '#EEF0F3', 'border-width': 0 } },
	{ selector: 'node[kind = "instance"]', style: { width: 36, height: 36 } },
	{ selector: 'node[kind = "instance"][!isMapped]', style: { 'background-color': '#EEF0F4', 'border-color': '#9CA3AF', 'border-width': 1 } },
	{ selector: 'node[kind = "optionSet"], node[kind = "optionValue"]', style: { shape: 'tag', 'background-color': '#FFF4E0', 'border-color': '#B26A00', 'border-width': 1, width: 54, height: 36 } },
	{ selector: 'node[kind = "cedsAnchor"]', style: { shape: 'hexagon', 'background-color': '#00B5B8', 'border-width': 0, color: '#072A6C', width: 70, height: 62 } },
	{ selector: 'node[kind = "cedsAnchor"][?isFocus]', style: { width: 120, height: 104 } },
	{ selector: 'node[kind = "cedsProperty"]', style: { 'background-color': '#E0F6F6', 'border-color': '#00797C', 'border-width': 1 } },
	{ selector: 'node[kind = "cedsDomain"]', style: { shape: 'round-rectangle', 'background-color': '#E0F6F6', 'border-color': '#00797C', 'border-width': 1.5, width: 74, height: 44 } },
	{ selector: 'node[kind = "standardGroup"]', style: { 'background-color': 'data(familyTint)', 'border-width': 3, width: 'data(groupSize)', height: 'data(groupSize)' } },
	{ selector: 'node[kind = "standardGroup"][?isFocus]', style: { width: 110, height: 110 } },
	{ selector: 'node[kind = "support"], node[kind = "unclassified"]', style: { shape: 'round-rectangle', 'background-color': '#F3F4F6', 'border-color': '#D1D5DB', 'border-width': 1, width: 50, height: 30, 'font-size': 11, 'font-weight': 400 } },
	{ selector: 'node[kind = "more"]', style: { 'background-color': '#FFFFFF', 'border-style': 'dashed', 'border-width': 2, 'border-color': 'data(familyColor)', 'text-valign': 'center', 'text-margin-y': 0, 'text-background-opacity': 0, 'font-weight': 700 } },
	{ selector: 'node[kind = "drillBadge"]', style: { width: 18, height: 18, 'background-color': '#072A6C', 'border-color': '#FFFFFF', 'border-width': 2, color: '#FFFFFF', 'text-valign': 'center', 'text-margin-y': -1, 'text-background-opacity': 0, 'font-size': 13, 'font-weight': 700, 'z-index': 20 } },
	// the focus is always the big bubble in the middle, whatever its kind (after the kind rules, so it wins)
	{ selector: 'node[?isFocus][kind != "cedsAnchor"][kind != "standardGroup"]', style: { width: 110, height: 110, 'font-size': 15, 'font-weight': 700 } },
	{ selector: 'node[?isFocus]', style: { 'font-size': 15, 'font-weight': 700 } },
	{ selector: 'node[?isHome]', style: { 'underlay-color': '#FFAB40', 'underlay-opacity': 0.65, 'underlay-padding': 10, 'underlay-shape': 'ellipse' } },
	{ selector: 'node:selected', style: { 'overlay-color': '#072A6C', 'overlay-opacity': 0.12, 'overlay-padding': 8, 'overlay-shape': 'ellipse' } },
	{ selector: 'node[!isMatching]', style: { opacity: 0.2 } },
	{
		selector: 'edge',
		style: { width: 2, 'line-color': STRUCTURAL_EDGE_COLOR, 'curve-style': 'straight', 'target-arrow-shape': 'none', 'z-index': 1 },
	},
	{
		selector: 'edge[edgeKind = "mapping"]',
		style: {
			'curve-style': 'unbundled-bezier',
			'control-point-distances': 'data(controlDistance)',
			'control-point-weights': 0.5,
			'line-color': 'data(matchColor)',
			'line-style': 'data(lineStyle)',
			width: 'data(edgeWidth)',
			opacity: 'data(edgeOpacity)',
			label: 'data(chipText)',
			'font-size': 12,
			'font-weight': 700,
			color: 'data(matchColor)',
			'text-background-color': '#FFFFFF',
			'text-background-opacity': 1,
			'text-background-padding': 3,
			'text-background-shape': 'roundrectangle',
		},
	},
	{ selector: 'edge[!isMatching]', style: { opacity: 0.12 } },
];

// ================================================================================
// LIFECYCLE

const ownerStableIdOf = (tappedNode) => tappedNode.data('ownerStableId') || tappedNode.id();

const drawLevel = () => {
	if (!cyInstance) return;
	cyInstance.elements().remove();
	cyInstance.add(elementListOf());
	cyInstance.fit(undefined, 40);
	// a level of two or three bubbles must not be blown up to fill the canvas
	if (cyInstance.zoom() > MAXIMUM_FIT_ZOOM) {
		cyInstance.zoom(MAXIMUM_FIT_ZOOM);
		cyInstance.center();
	}
	if (store.selectedStableId) cyInstance.getElementById(store.selectedStableId).select();
};

onMounted(() => {
	cyInstance = cytoscape({
		container: canvasElement.value,
		style: styleList,
		layout: { name: 'preset' },
		autoungrabify: true,
		boxSelectionEnabled: false,
		wheelSensitivity: 0.3,
		minZoom: 0.2,
		maxZoom: 3,
	});
	cyInstance.on('tap', 'node', (tapEvent) => {
		const tappedNode = tapEvent.target;
		if (tappedNode.id() === MORE_NODE_ID) {
			store.setViewModeChoice('table');
			store.diagramRequestedForStableId = '';
			return;
		}
		if (tappedNode.data('isFocus')) {
			store.selectRow('');
			return;
		}
		store.selectRow(ownerStableIdOf(tappedNode));
	});
	cyInstance.on('dbltap', 'node', (tapEvent) => {
		const tappedNode = tapEvent.target;
		if (tappedNode.data('isFocus') || tappedNode.id() === MORE_NODE_ID) return;
		const ownerNode = cyInstance.getElementById(ownerStableIdOf(tappedNode));
		if (ownerNode.data('hasChildren')) emit('drill', ownerNode.id());
	});
	cyInstance.on('tap', (tapEvent) => {
		if (tapEvent.target === cyInstance) store.selectRow('');
	});
	drawLevel();
});

onBeforeUnmount(() => {
	if (cyInstance) cyInstance.destroy();
	cyInstance = null;
});

watch(() => [store.neighbourhood, store.filterText, homeStandardKey.value], drawLevel);
watch(
	() => store.selectedStableId,
	(selectedStableId) => {
		if (!cyInstance) return;
		cyInstance.elements(':selected').unselect();
		if (selectedStableId) cyInstance.getElementById(selectedStableId).select();
	},
);

// the test hook: what the diagram drew, read from the Cytoscape instance itself
onMounted(() => {
	if (canvasElement.value) canvasElement.value.explorerDiagramSnapshot = () => (cyInstance ? cyInstance.nodes().map((oneNode) => ({ id: oneNode.id(), kind: oneNode.data('kind'), label: oneNode.data('label'), isHome: Boolean(oneNode.data('isHome')), isMatching: oneNode.data('isMatching') !== false, renderedPosition: oneNode.renderedPosition() })) : []);
	if (canvasElement.value) canvasElement.value.explorerDiagramEdgeSnapshot = () => (cyInstance ? cyInstance.edges().map((oneEdge) => ({ id: oneEdge.id(), edgeKind: oneEdge.data('edgeKind'), lineStyle: oneEdge.data('lineStyle'), width: oneEdge.data('edgeWidth'), opacity: oneEdge.data('edgeOpacity'), chipText: oneEdge.data('chipText') })) : []);
});
</script>

<template>
	<div class="diagram-frame">
		<div ref="canvasElement" class="diagram-canvas" data-testid="explorer-diagram" />
		<p v-if="hiddenRowCount > 0" class="diagram-note" data-testid="diagram-sample-note">
			Showing {{ drawnRowList.length }} of {{ store.levelRowList.length }}. The dashed bubble opens the full list in the table.
		</p>
		<p v-if="store.levelRowList.length === 0" class="diagram-note" data-testid="diagram-empty">Nothing beneath this node. This is the end of the line.</p>
	</div>
</template>

<style scoped>
.diagram-canvas {
	width: 100%;
	aspect-ratio: 1000 / 620;
	background: radial-gradient(#e3e7ef 1px, transparent 1px) 0 0 / 20px 20px;
	border-radius: 8px;
}
.diagram-note {
	margin: 8px 2px 0;
	font-size: 13px;
	color: #6b7280;
}
</style>
