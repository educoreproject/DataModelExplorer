<script setup>
// The detail panel: the selected row, or the focus node when nothing is selected. Kind, name, definition, how it
// maps to CEDS (kind and confidence, or the mix of kinds for a standard group), the facts, the version badge, and
// either Open or "end of the line". Beneath it, one version tile per other version of the item's message, loaded
// lazily; their loading and error states stay inside the tile area. Last, the Downloads section for the standard being
// visited (DownloadsSection.vue).

import { computed, watch } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { cedsMappedTextOf, counterpartPathOf, displayNameOf, familyHoldingTextOf, familyStyleOf, homeStandardFamilyOf, humanizeName } from '@/components/standardsExplorer/explorerVocabulary';

const store = useStandardsNeighbourhoodStore();

// the family the walk began in (the first family: crumb, eg family:PESC); other families get the outlined Standard
// fact. At the families catalog no walk has begun, so nothing is outlined there
const homeStandardFamily = computed(() => homeStandardFamilyOf(store.pathStableIdList));
const emit = defineEmits(['drill', 'go-to-path']);

watch(
	() => store.versionTileSubject?.stableId,
	(subjectStableId) => {
		if (subjectStableId) store.loadVersionCounterparts(subjectStableId);
	},
	{ immediate: true },
);

const openCounterpart = (versionEntry) => {
	const tileSubject = store.versionTileSubject;
	emit('go-to-path', counterpartPathOf({ standardFamily: tileSubject.standardFamily, releaseLabel: tileSubject.releaseLabel, counterpart: versionEntry.counterpart }));
};

const isFocus = computed(() => !store.selectedRow);

// how many places the shown item occurs in its own version, for the tiles' "occurrences are not compared" note
const occurrenceCountOfMappingList = (mappingList) => Math.max(1, ...(mappingList || []).map((oneMapping) => oneMapping.occurrenceCount || 1));


const shownNode = computed(() => {
	const focusNode = store.focusNode;
	// a selected row of the focus's own standard inherits its release and version for the facts
	if (store.selectedRow) {
		const sameStandard = focusNode && store.selectedRow.standardFamily === focusNode.standardFamily && !store.selectedRow.version && focusNode.kind !== 'cedsAnchor';
		return sameStandard ? { ...store.selectedRow, releaseLabel: focusNode.releaseLabel, version: focusNode.version } : store.selectedRow;
	}
	if (!focusNode) return null;
	return { ...focusNode, displayName: displayNameOf(focusNode), hasChildren: store.levelRowList.length > 0 };
});

const mappingList = computed(() => {
	if (!shownNode.value) return [];
	if (isFocus.value) return store.neighbourhood.mappingList || [];
	return shownNode.value.mapping ? [shownNode.value.mapping] : [];
});

const shownOccurrenceCount = computed(() => Math.max(shownNode.value?.occurrenceCount || 1, occurrenceCountOfMappingList(mappingList.value)));

const factList = computed(() => {
	const oneNode = shownNode.value;
	if (!oneNode) return [];
	const familyName = oneNode.standardFamily ? familyStyleOf(oneNode.standardFamily).displayName : '';
	const ancestorText = isFocus.value ? (store.neighbourhood.ancestorList || []).map((oneAncestor) => displayNameOf(store.nodeSummaryByStableId[oneAncestor.stableId] || oneAncestor)).join(' › ') : '';
	return [
		{
			factName: 'Standard',
			factText: [familyName, oneNode.releaseLabel && oneNode.releaseLabel !== oneNode.standardFamily && !/^[a-z]+\d+$/.test(oneNode.releaseLabel) ? humanizeName(oneNode.releaseLabel) : '', oneNode.version || ''].filter(Boolean).join(' '),
			// outside the family the walk began in, the standard is outlined in its family colour so a crossing is plain
			outlineColor: homeStandardFamily.value && oneNode.standardFamily && oneNode.standardFamily !== homeStandardFamily.value ? familyStyleOf(oneNode.standardFamily).color : '',
		},
		{ factName: 'Inside', factText: ancestorText },
		// a SIF field's path can run ten steps deep: it breaks after a '/', never inside a step, and copies whole
		{ factName: 'Path', factText: ['instance', 'property'].includes(oneNode.kind) && oneNode.path && !/^(type|element|group)\//.test(oneNode.path) ? oneNode.path : '', breaksAfterSlash: true },
		{ factName: 'Property of', factText: oneNode.ownerName || '' },
		{ factName: 'Holds', factText: oneNode.kind === 'family' ? `${familyHoldingTextOf(oneNode)}, ${oneNode.classCount} classes` : '' },
		{ factName: 'Properties', factText: oneNode.propertyCount ? `${oneNode.propertyCount}, ${oneNode.mappedPropertyCount} ${oneNode.kind === 'cedsDomain' ? 'mapped to by a standard' : 'mapped to CEDS'}` : '' },
		{ factName: 'CEDS elements', factText: oneNode.cedsElementCount ? `${oneNode.cedsElementCount}; ${cedsMappedTextOf(oneNode)}` : '' },
		{ factName: 'Occurrences', factText: oneNode.occurrenceCount > 1 ? String(oneNode.occurrenceCount) : '' },
		{ factName: 'Elements', factText: oneNode.elementCount ? String(oneNode.elementCount) : '' },
		{ factName: 'CEDS tier', factText: oneNode.referenceTier || '' },
		{ factName: 'CEDS domain', factText: (oneNode.cedsDomainList || []).map((oneDomain) => oneDomain.name).join(', ') || oneNode.cedsDomainName || '' },
		{ factName: 'Occurrences shown', factText: isFocus.value && store.neighbourhood.instanceFolding && store.neighbourhood.instanceFolding.occurrenceCount > 1 ? (store.neighbourhood.instanceFolding.folded ? 'folded: they all map the same way' : 'yes: they map differently') : '' },
	].filter((oneFact) => oneFact.factText);
});

const definitionText = computed(() => {
	const oneNode = shownNode.value;
	if (!oneNode) return '';
	const cedsPropertyText = (oneNode.cedsPropertyList || []).map((oneProperty) => oneProperty.definition).filter(Boolean).join(' ');
	return oneNode.description || cedsPropertyText || '';
});
</script>

<template>
	<aside v-if="shownNode" aria-label="Details" class="detail-panel" data-testid="detail-panel">
		<div class="detail-head">
			<StandardsExplorerKindChip :node-kind="shownNode.kind" :standard-family="shownNode.standardFamily" :is-unmapped="shownNode.kind === 'property' && mappingList.length === 0" />
			<span class="detail-role">{{ isFocus ? 'Focus' : 'Selected' }}</span>
		</div>
		<h2 class="detail-name" data-testid="detail-name">{{ shownNode.displayName }}</h2>
		<p v-if="definitionText" class="detail-definition">{{ definitionText }}</p>

		<div v-if="mappingList.length" class="detail-box" data-testid="detail-mapping">
			<span class="detail-box-head">Maps to CEDS</span>
			<div v-for="oneMapping in mappingList" :key="`${oneMapping.matchKind}-${oneMapping.anchor.stableId}`" class="detail-mapping">
				<span class="detail-mapping-target">{{ oneMapping.anchor.name }}</span>
				<StandardsExplorerMatchSummary :match-kind="oneMapping.matchKind" :mapping-confidence="oneMapping.mappingConfidence" />
				<span v-if="oneMapping.occurrenceCount > 1" class="detail-note">on {{ oneMapping.occurrenceCount }} occurrences</span>
			</div>
		</div>
		<div v-else-if="shownNode.matchKindCountList" class="detail-box" data-testid="detail-match-mix">
			<span class="detail-box-head">How these elements match</span>
			<div v-for="oneCount in shownNode.matchKindCountList" :key="oneCount.matchKind" class="detail-mapping">
				<StandardsExplorerMatchSummary :match-kind="oneCount.matchKind" :show-confidence="false" />
				<span>{{ oneCount.elementCount }} elements</span>
			</div>
			<span class="detail-note">Each element carries its own confidence. Open this group to see them.</span>
		</div>
		<p v-else-if="shownNode.kind === 'property' || shownNode.kind === 'instance'" class="detail-note">Not mapped to CEDS.</p>

		<dl v-if="factList.length" class="detail-facts">
			<template v-for="oneFact in factList" :key="oneFact.factName">
				<div v-if="oneFact.outlineColor" class="detail-fact-outlined" :style="{ borderColor: oneFact.outlineColor }" data-testid="detail-standard-outlined">
					<dt>{{ oneFact.factName }}</dt>
					<dd>{{ oneFact.factText }}</dd>
				</div>
				<template v-else>
					<dt>{{ oneFact.factName }}</dt>
					<dd v-if="oneFact.breaksAfterSlash" class="detail-fact-path" data-testid="detail-path"><template v-for="(pathStep, stepIndex) in oneFact.factText.split('/')" :key="stepIndex"><template v-if="stepIndex">/<wbr v-if="stepIndex > 1" /></template>{{ pathStep }}</template></dd>
					<dd v-else>{{ oneFact.factText }}</dd>
				</template>
			</template>
		</dl>

		<StandardsExplorerVersionBadge v-if="shownNode.versionBadge" :version-badge="shownNode.versionBadge" class="detail-badge" />

		<v-btn v-if="!isFocus && shownNode.hasChildren" color="primary" class="detail-open" data-testid="detail-open" @click="emit('drill', shownNode.stableId)">Open {{ shownNode.displayName }} ›</v-btn>
		<p v-else-if="!isFocus" class="detail-leaf" data-testid="detail-leaf">Nothing beneath this one. This is the end of the line.</p>
		<p v-else-if="!shownNode.hasChildren" class="detail-leaf" data-testid="detail-leaf">Nothing beneath this one. This is the end of the line.</p>
		<p v-else class="detail-note">You are here. Click anything on this level for its details.</p>

		<section v-if="store.versionTileSubject" class="detail-versions" aria-label="Other versions" data-testid="detail-versions">
			<span class="detail-box-head">In other versions</span>
			<p v-if="!store.versionTileState || store.versionTileState.loading" class="detail-note" data-testid="version-tiles-loading">Looking in the other versions…</p>
			<div v-else-if="store.versionTileState.statusMsg" class="detail-versions-error" data-testid="version-tiles-error">
				<span>The other versions could not be read: {{ store.versionTileState.statusMsg }}</span>
				<v-btn size="small" variant="text" color="primary" @click="store.loadVersionCounterparts(store.versionTileSubject.stableId)">Try again</v-btn>
			</div>
			<template v-else>
				<StandardsExplorerVersionTile
					v-for="versionEntry in store.versionTileState.versionCounterparts.counterpartList"
					:key="versionEntry.standardKey"
					:version-entry="versionEntry"
					:this-version="store.versionTileSubject.version"
					:this-occurrence-count="shownOccurrenceCount"
					@open-counterpart="openCounterpart"
				/>
			</template>
		</section>

		<StandardsExplorerDownloadsSection />
	</aside>
</template>

<style scoped>
.detail-panel {
	background: #ffffff;
	border: 1px solid #e3e7ef;
	border-radius: 12px;
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 14px;
}
.detail-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.detail-role {
	font-size: 12px;
	color: #6b7280;
}
.detail-name {
	margin: 0;
	font-family: 'DM Serif Display', Georgia, serif;
	font-weight: 400;
	font-size: 28px;
	line-height: 1.15;
	color: #072a6c;
	overflow-wrap: anywhere;
}
.detail-definition {
	margin: 0;
	font-size: 15px;
	line-height: 1.5;
}
.detail-box {
	border: 1px solid #e3e7ef;
	border-radius: 10px;
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	background: #fbfcfe;
}
.detail-box-head {
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
.detail-mapping {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.detail-mapping-target {
	font-size: 16px;
	font-weight: 700;
}
.detail-note {
	margin: 0;
	font-size: 13px;
	color: #6b7280;
}
.detail-facts {
	margin: 0;
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 6px 12px;
	font-size: 14px;
}
.detail-facts dt {
	color: #6b7280;
}
.detail-facts dd {
	margin: 0;
	overflow-wrap: anywhere;
}
.detail-facts dd.detail-fact-path {
	overflow-wrap: break-word;
}
.detail-fact-outlined {
	grid-column: 1 / -1;
	display: grid;
	grid-template-columns: subgrid;
	border: 2px solid;
	border-radius: 6px;
	padding: 4px 8px;
	margin: 0 -10px;
	font-weight: 700;
}
.detail-fact-outlined dt {
	font-weight: 400;
}
.detail-badge {
	align-self: flex-start;
}
.detail-open {
	align-self: flex-start;
}
.detail-versions {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-top: 14px;
	border-top: 1px solid #e3e7ef;
}
.detail-versions-error {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	color: #4b5563;
}
.detail-leaf {
	margin: 0;
	font-size: 14px;
	color: #4b5563;
	background: #f3f4f6;
	border-radius: 8px;
	padding: 10px 12px;
}
</style>
