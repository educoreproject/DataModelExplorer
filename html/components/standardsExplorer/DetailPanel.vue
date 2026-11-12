<script setup>
// The detail panel: the selected row, or the focus node when nothing is selected. Kind, name, definition, how it
// maps to a hub (kind and confidence, or the mix of kinds for a standard group), the facts, the version badge, and
// either Open or "end of the line". Beneath it, one version tile per other version of the item's message, loaded
// lazily; their loading and error states stay inside the tile area. Last, the Companion pages and then the Downloads
// sections for the standard being visited (CompanionPagesSection.vue, DownloadsSection.vue).
// For a family, a release or a standard, the specification catalog's card for that family (SpecificationCard.vue);
// at the families catalog, the catalog's specifications the graph does not hold yet.
// ⟪explorerUris⟫ Beneath the definition, the Cite as line (CiteAs.vue) for a node the server sent a uri.
// ⟪meaningsExplorer⟫ A meaning (the Meanings explorer's kind) shows MeaningSection.vue in place of the facts and the Cite as line (it ends with its own); a hub
// element of the Standards Explorer links to its meaning there ("Open in Meanings"). The sections about one standard (its catalog card, version tiles,
// companion pages and downloads) show only in a walk whose profile has them (store.walkProfile.showsStandardSections).

import { computed, watch } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { useSpecificationMetadataStore } from '@/stores/specificationMetadataStore';
import meaningFactsWording from '@/components/standardsExplorer/meaningFactsWording.json';
import { FAMILY_CATALOG_STABLE_ID, meaningSubtitleOf, meaningTitleOf, counterpartPathOf, displayNameOf, meaningFactListOf, meaningsLinkOf, familyHoldingTextOf, familyStyleOf, homeStandardFamilyOf, hubMappedTextOf, hubNameTextOf, humanizeName, kindDisplayNameOf, pluralKindNameOf, explorerCommonWords, explorerComponentWords, wordingOf, isLeafMeaningRow, selectedLeafNodeOf, leafFactsStateNameOf } from '@/components/standardsExplorer/explorerVocabulary';

const store = useStandardsNeighbourhoodStore();
const panelWords = explorerComponentWords.detailPanel;
const specStore = useSpecificationMetadataStore();

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

// ⟪explorerTidy, supervisor's ruling⟫ a selected meaning that opens to nothing (no Open) shows its tuple and Expressed-in here, as its focus would: its own node, read
// once by the store with the request a drill sends
const isLeafMeaningSelected = computed(() => isLeafMeaningRow(store.selectedRow));
watch(
	() => (isLeafMeaningSelected.value ? store.selectedRow.stableId : ''),
	(leafStableId) => {
		if (leafStableId) store.loadLeafMeaning(leafStableId);
	},
	{ immediate: true },
);
const leafMeaningState = computed(() => (isLeafMeaningSelected.value ? store.leafMeaningStateByStableId[store.selectedRow.stableId] || null : null));
const leafFactsStateName = computed(() => leafFactsStateNameOf(leafMeaningState.value));

// ⟪meaningsClarity review S4⟫ the focus's meaning facts: carried by a meanings domain level's own answer, else asked for apart (store.loadMeaningFacts); null when the
// focus is no graph element (the server says notAGraphElement) or no answer is in yet
watch(
	() => store.focusNode?.stableId,
	(focusStableId) => {
		if (focusStableId && !store.focusNode.meaningFacts) store.loadMeaningFacts(focusStableId);
	},
	{ immediate: true },
);
const focusMeaningFactsState = computed(() => {
	const focusNode = store.focusNode;
	if (!focusNode) return null;
	if (focusNode.meaningFacts) return { loading: false, meaningFacts: focusNode.meaningFacts, failed: false };
	const factsState = store.meaningFactsStateByStableId[focusNode.stableId];
	return factsState && !factsState.meaningFactsAbsentName ? factsState : null;
});

// how many places the shown item occurs in its own version, for the tiles' "occurrences are not compared" note
const occurrenceCountOfMappingList = (mappingList) => Math.max(1, ...(mappingList || []).map((oneMapping) => oneMapping.occurrenceCount || 1));


const shownNode = computed(() => {
	const focusNode = store.focusNode;
	// a selected row of the focus's own standard inherits its release and version for the facts
	if (store.selectedRow) {
		const sameStandard = focusNode && store.selectedRow.standardFamily === focusNode.standardFamily && !store.selectedRow.version && focusNode.kind !== 'hubAnchor';
		const selectedLeafNode = selectedLeafNodeOf({ selectedRow: store.selectedRow, leafMeaningState: leafMeaningState.value });
		if (selectedLeafNode) return selectedLeafNode;
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

// a meaning's own section says what it is; the generic facts would only repeat it
const isMeaning = computed(() => shownNode.value?.kind === 'meaning');

const factList = computed(() => {
	const oneNode = shownNode.value;
	if (!oneNode || isMeaning.value) return [];
	const familyName = oneNode.standardFamily ? familyStyleOf(oneNode.standardFamily).displayName : '';
	const ancestorText = isFocus.value ? (store.neighbourhood.ancestorList || []).map((oneAncestor) => displayNameOf(store.nodeSummaryByStableId[oneAncestor.stableId] || oneAncestor)).join(' › ') : '';
	return [
		{
			factName: panelWords.factNameByName.standard,
			factText: [familyName, oneNode.releaseLabel && oneNode.releaseLabel !== oneNode.standardFamily && !/^[a-z]+\d+$/.test(oneNode.releaseLabel) ? humanizeName(oneNode.releaseLabel) : '', oneNode.version || ''].filter(Boolean).join(' '),
			// outside the family the walk began in, the standard is outlined in its family colour so a crossing is plain
			outlineColor: homeStandardFamily.value && oneNode.standardFamily && oneNode.standardFamily !== homeStandardFamily.value ? familyStyleOf(oneNode.standardFamily).color : '',
		},
		{ factName: panelWords.factNameByName.inside, factText: ancestorText },
		// a SIF field's path can run ten steps deep: it breaks after a '/', never inside a step, and copies whole
		{ factName: panelWords.factNameByName.path, factText: ['instance', 'property'].includes(oneNode.kind) && oneNode.path && !/^(type|element|group)\//.test(oneNode.path) ? oneNode.path : '', breaksAfterSlash: true },
		{ factName: panelWords.factNameByName.propertyOf, factText: oneNode.ownerName || '' },
		// a family's row carries its counts; an opened family's own node does not (the server sends none), so it says nothing
		{ factName: panelWords.factNameByName.holds, factText: oneNode.kind === 'family' && oneNode.standardCount !== undefined ? wordingOf(panelWords.holdsTemplate, { familyHoldingText: familyHoldingTextOf(oneNode), classCount: oneNode.classCount }) : '' },
		{ factName: panelWords.factNameByName.properties, factText: oneNode.propertyCount ? wordingOf(panelWords.propertiesTemplate, { propertyCount: oneNode.propertyCount, mappedPropertyCount: oneNode.mappedPropertyCount, mappedWords: panelWords.propertiesMappedWordsByKind[oneNode.kind] || panelWords.propertiesMappedOtherWords }) : '' },
		{ factName: humanizeKindName(pluralKindNameOf('hubAnchor', oneNode.hubName)), factText: oneNode.hubElementCount ? wordingOf(panelWords.hubElementsTemplate, { hubElementCount: oneNode.hubElementCount, hubMappedText: hubMappedTextOf(oneNode) }) : '' },
		{ factName: panelWords.factNameByName.occurrences, factText: oneNode.occurrenceCount > 1 ? String(oneNode.occurrenceCount) : '' },
		{ factName: panelWords.factNameByName.elements, factText: oneNode.elementCount ? String(oneNode.elementCount) : '' },
		{ factName: wordingOf(panelWords.tierFactTemplate, { hubText: hubNameTextOf(oneNode.hubName) }), factText: oneNode.referenceTier || '' },
		{ factName: kindDisplayNameOf('hubDomain', oneNode.hubName), factText: (oneNode.hubDomainList || []).map((oneDomain) => oneDomain.name).join(', ') || oneNode.hubDomainName || '' },
		// ⟪meaningsExplorer, meaningsPolish⟫ a group of meanings (a hub, a domain) says what its next level holds, in the meanings vocabulary's words
		...meaningFactListOf(oneNode),
		{ factName: panelWords.factNameByName.occurrencesShown, factText: isFocus.value && store.neighbourhood.instanceFolding && store.neighbourhood.instanceFolding.occurrenceCount > 1 ? (store.neighbourhood.instanceFolding.folded ? panelWords.occurrencesFoldedText : panelWords.occurrencesUnfoldedText) : '' },
	].filter((oneFact) => oneFact.factText);
});

// ================================================================================
// THE SPECIFICATION CATALOG — a family, release or standard shows its family's catalog card; deeper items do not (the
// card is about the whole specification, and it would repeat on every class and property)

const SPEC_CARD_KIND_LIST = ['family', 'release', 'standard'];
const shownSpec = computed(() => {
	const oneNode = shownNode.value;
	if (!oneNode || !SPEC_CARD_KIND_LIST.includes(oneNode.kind)) return null;
	return specStore.specByGraphFamily(oneNode.standardFamily || (oneNode.kind === 'family' ? oneNode.name : null)) || null;
});

// at the families catalog: the catalog's specifications no family row on this level stands for
const isFamilyCatalog = computed(() => isFocus.value && store.focusNode?.stableId === FAMILY_CATALOG_STABLE_ID);
const specNotInGraphList = computed(() => {
	if (!isFamilyCatalog.value) return [];
	const graphFamilySet = new Set(store.levelRowList.map((oneRow) => oneRow.standardFamily || oneRow.name));
	return specStore.specs.filter((oneSpec) => !oneSpec.graphFamily || !graphFamilySet.has(oneSpec.graphFamily));
});

// the hubs the shown mappings reach, as the server names them (each mapping's anchor.hubName)
const mappingHubText = computed(() => [...new Set(mappingList.value.map((oneMapping) => hubNameTextOf(oneMapping.anchor.hubName)))].join(', '));

// a plural kind name as a fact name, its first letter raised: 'hub elements' reads 'Hub elements'
const humanizeKindName = (kindNameText) => kindNameText.replace(/^([a-z])/, (initialLetter) => initialLetter.toUpperCase());

const definitionText = computed(() => {
	const oneNode = shownNode.value;
	if (!oneNode) return '';
	const hubPropertyText = (oneNode.hubPropertyList || []).map((oneProperty) => oneProperty.definition).filter(Boolean).join(' ');
	return oneNode.description || hubPropertyText || '';
});
</script>

<template>
	<aside v-if="shownNode" :aria-label="wordingOf(panelWords.panelLabelTemplate, { itemName: shownNode.displayName })" class="detail-panel" :class="{ 'detail-panel-wide': store.panelFullWidth }" data-testid="detail-panel">
		<div class="detail-head">
			<StandardsExplorerKindChip :node-kind="shownNode.kind" :standard-family="shownNode.standardFamily" :hub-name="shownNode.hubName || null" :is-unmapped="shownNode.kind === 'property' && mappingList.length === 0" />
			<span class="detail-role">{{ isFocus ? panelWords.focusRoleText : panelWords.selectedRoleText }}</span>
			<v-btn
				icon
				size="x-small"
				variant="text"
				class="detail-full-width"
				data-testid="detail-full-width"
				:title="store.panelFullWidth ? panelWords.exitFullWidthText : panelWords.fullWidthText"
				:aria-label="store.panelFullWidth ? panelWords.exitFullWidthText : panelWords.fullWidthText"
				:aria-pressed="store.panelFullWidth ? 'true' : 'false'"
				@click="store.togglePanelFullWidth()"
			>
				<v-icon size="small">{{ store.panelFullWidth ? panelWords.exitFullWidthIconName : panelWords.fullWidthIconName }}</v-icon>
			</v-btn>
		</div>
		<!-- ⟪meaningsClarity Addendum B⟫ a meaning is titled as one, with what it is underneath, in the words its /edc page uses -->
		<template v-if="isMeaning">
			<h2 class="detail-name" data-testid="detail-name" aria-live="polite">{{ meaningTitleOf({ meaningNode: shownNode, meaningFactsWording }) }}</h2>
			<p class="detail-subtitle" data-testid="detail-meaning-subtitle">{{ meaningSubtitleOf({ meaningNode: shownNode, meaningFactsWording }) }}</p>
		</template>
		<h2 v-else class="detail-name" data-testid="detail-name" aria-live="polite">{{ shownNode.displayName }}</h2>
		<p v-if="definitionText" class="detail-definition">{{ definitionText }}</p>
		<!-- ⟪explorerUris⟫ the node's EDUcore URI, as the /edc page cites it; none for a node the server sent no uri -->
		<StandardsExplorerMeaningSection v-if="isMeaning" :meaning-node="shownNode" :shows-full-facts="isFocus || Boolean(leafMeaningState && leafMeaningState.meaningNode)" :full-facts-state-name="leafFactsStateName" />
		<StandardsExplorerCiteAs v-if="shownNode.uri && !isMeaning" :uri="shownNode.uri" :uri-kind="shownNode.uriKind" :element-list-uri="shownNode.elementListUri || ''" :uri-is-the-link="store.walkProfile.citesUriAsLink" />

		<div v-if="mappingList.length" class="detail-box" data-testid="detail-mapping">
			<span class="detail-box-head">{{ wordingOf(panelWords.mapsToTemplate, { hubText: mappingHubText }) }}</span>
			<div v-for="oneMapping in mappingList" :key="`${oneMapping.matchKind}-${oneMapping.anchor.stableId}`" class="detail-mapping">
				<span class="detail-mapping-target">{{ oneMapping.anchor.name }}</span>
				<StandardsExplorerMatchSummary :match-kind="oneMapping.matchKind" :mapping-confidence="oneMapping.mappingConfidence" />
				<span v-if="oneMapping.occurrenceCount > 1" class="detail-note">{{ wordingOf(panelWords.onOccurrencesTemplate, { occurrenceCount: oneMapping.occurrenceCount }) }}</span>
			</div>
		</div>
		<div v-else-if="shownNode.matchKindCountList" class="detail-box" data-testid="detail-match-mix">
			<span class="detail-box-head">{{ panelWords.matchMixHeadText }}</span>
			<div v-for="oneCount in shownNode.matchKindCountList" :key="oneCount.matchKind" class="detail-mapping">
				<StandardsExplorerMatchSummary :match-kind="oneCount.matchKind" :show-confidence="false" />
				<span>{{ wordingOf(panelWords.matchMixCountTemplate, { elementCount: oneCount.elementCount }) }}</span>
			</div>
			<span class="detail-note">{{ panelWords.matchMixNoteText }}</span>
		</div>
		<p v-else-if="shownNode.kind === 'property' || shownNode.kind === 'instance'" class="detail-note">{{ explorerCommonWords.notMappedToHubText }}</p>

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

		<v-btn v-if="!isFocus && shownNode.hasChildren" color="primary" class="detail-open" data-testid="detail-open" :to="store.walkLinkOf(store.drillPathOf(shownNode.stableId))">{{ wordingOf(panelWords.openTemplate, { itemName: shownNode.displayName }) }}</v-btn>
		<!-- ⟪meaningsExplorer⟫ a hub element is a meaning: its own page in the Meanings explorer -->
		<v-btn v-if="shownNode.kind === 'hubAnchor'" variant="outlined" color="primary" class="detail-open" data-testid="detail-open-in-meanings" :to="meaningsLinkOf(shownNode.stableId)">{{ panelWords.openInMeaningsText }}</v-btn>
		<v-btn v-if="shownNode.kind === 'useCase'" color="primary" class="detail-open" data-testid="detail-open-use-case" :to="`/explore/use-cases/forged/${encodeURIComponent(shownNode.stableId)}`">{{ panelWords.useCaseStepsText }}</v-btn>
		<!-- the end of the line only when nothing is beneath (a selected item with children has its Open above, and is not
		     the end of the line); a focus with children is where the walk is -->
		<p v-else-if="!shownNode.hasChildren && !(isMeaning && isFocus)" class="detail-leaf" data-testid="detail-leaf">{{ panelWords.leafText }}</p>
		<p v-else-if="isFocus" class="detail-note">{{ panelWords.focusNoteText }}</p>

		<section v-if="shownSpec" class="detail-catalog" :aria-label="panelWords.specHeadText" data-testid="detail-spec">
			<span class="detail-box-head">{{ panelWords.specHeadText }}</span>
			<StandardsExplorerSpecificationCard :spec="shownSpec" compact :heading-level="3" />
		</section>
		<section v-else-if="isFamilyCatalog" class="detail-catalog" :aria-label="panelWords.catalogHeadText" data-testid="detail-spec-catalog">
			<span class="detail-box-head">{{ panelWords.catalogHeadText }}</span>
			<p class="detail-note">{{ panelWords.catalogNoteText }}</p>
			<template v-if="specNotInGraphList.length">
				<p class="detail-note" data-testid="detail-spec-not-in-graph">{{ panelWords.notInGraphText }}</p>
				<StandardsExplorerSpecificationCard v-for="oneSpec in specNotInGraphList" :key="oneSpec.id" :spec="oneSpec" compact :heading-level="3" />
			</template>
		</section>

		<section v-if="store.versionTileSubject" class="detail-versions" :aria-label="panelWords.versionsLabelText" data-testid="detail-versions">
			<span class="detail-box-head">{{ panelWords.versionsHeadText }}</span>
			<p v-if="!store.versionTileState || store.versionTileState.loading" class="detail-note" data-testid="version-tiles-loading">{{ panelWords.versionsLoadingText }}</p>
			<div v-else-if="store.versionTileState.statusMsg" class="detail-versions-error" data-testid="version-tiles-error">
				<span>{{ wordingOf(panelWords.versionsUnreadTemplate, { statusMsg: store.versionTileState.statusMsg }) }}</span>
				<v-btn size="small" variant="text" color="primary" @click="store.loadVersionCounterparts(store.versionTileSubject.stableId)">{{ explorerCommonWords.retryText }}</v-btn>
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

		<!-- ⟪meaningsClarity, Addendum A⟫ the meanings the element on screen takes part in, as its /edc page says them -->
		<StandardsExplorerMeaningFactsSection v-if="isFocus && focusMeaningFactsState" :facts-state="focusMeaningFactsState" />

		<template v-if="store.walkProfile.showsStandardSections">
			<StandardsExplorerCompanionPagesSection />
			<StandardsExplorerDownloadsSection />
		</template>
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
/* TQ 2026-11-12: given the page's width, the panel reads as a two-column sheet: its heading across the top, its sections in two columns beneath.
   The meaning section's own boxes take part in the grid as the panel's sections do. One column again below the wide-screen width. */
@media (min-width: 1100px) {
	.detail-panel.detail-panel-wide {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		grid-auto-flow: row dense;
		align-items: start;
		gap: 16px 28px;
		padding: 28px 32px;
	}
	.detail-panel-wide > .detail-head,
	.detail-panel-wide > .detail-name,
	.detail-panel-wide > .detail-subtitle,
	.detail-panel-wide > .detail-definition {
		grid-column: 1 / -1;
	}
	.detail-panel-wide > .detail-subtitle {
		margin-top: -10px;
	}
	.detail-panel-wide > .detail-definition {
		max-width: 80ch;
	}
	.detail-panel-wide > :deep(section.meaning) {
		display: contents;
	}
}
.detail-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.detail-full-width {
	margin-left: auto;
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
	/* ⟪meaningsClarity Addendum C #11⟫ a long "Open … ›" label wraps inside its button instead of spilling past it */
	max-width: 100%;
	height: auto !important;
	min-height: 36px;
	padding-top: 6px;
	padding-bottom: 6px;
}
.detail-open :deep(.v-btn__content) {
	white-space: normal;
	text-align: left;
	overflow-wrap: anywhere;
}
.detail-subtitle {
	margin: -8px 0 0;
	font-size: 14px;
	color: #4b5563;
}
.detail-catalog {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-top: 14px;
	border-top: 1px solid #e3e7ef;
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
