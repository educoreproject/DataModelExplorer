<script setup>
// @concept: [[DataModelExplorer]]
// ⟪meaningsExplorer, WORKORDER-meaningsExplorer-111026⟫ A meaning in the detail panel, in the order the work order sets: where it sits (its tier, and its
// domain as a link back up the walk); its tuple, each role-named slot linked to its EDUcore URI (a CTDL meaning's ranges are description, not identity, so
// they sit behind a disclosure, as on the /edc page); "Expressed in", every element mapped to it, one group per standard, each element a link into the
// Standards Explorer at the path to it. The tuple and "Expressed in" come with the meaning's own answer, so they show when the meaning is the focus; a
// meaning selected on a list says to open it.
// ⟪meaningsPolish, WORKORDER-meaningsPolish-111026⟫ Its EDC URI comes first, the URI itself the link to its page (one Open link in the panel: punch-list
// item 2); every tuple slot says its id in its hub's standard ("CEDS id P000043", item 8); the walk has no property level, so the place links only the
// domain. Every word is meaningsVocabulary's (meaningSection), filled by wordingOf.

import { computed } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { INCOMING_MEANING_RELATIONSHIP_TYPE, OWN_TERM_RELATIONSHIP_TYPE, incomingSlotTextOf, meaningExpressionTextOf, meaningValuesTextOf, displayNameOf, familyStyleOf, explorerLinkOf, kindDisplayNameOf, meaningElementCountTextOf, meaningTupleSlotListOf, meaningsVocabulary, wordingOf, tupleAbsentTextOf, uriAbsentTextOf } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	meaningNode: { type: Object, required: true },
	// ⟪explorerTidy⟫ its tuple and Expressed-in are shown when the meaning is the focus, or a selected meaning that opens to nothing whose own node has been read
	showsFullFacts: { type: Boolean, required: true },
	// a selected leaf meaning's read of its own node: 'loading', 'failed', 'read', or '' for none asked
	fullFactsStateName: { type: String, required: true },
});

const store = useStandardsNeighbourhoodStore();
const sectionWords = meaningsVocabulary.meaningSection;

const tierText = computed(() => {
	const tierWords = sectionWords.tierWordsByTier[props.meaningNode.referenceTier] || props.meaningNode.referenceTier;
	const tierValueByName = { referenceTier: props.meaningNode.referenceTier, tierWords, termKind: props.meaningNode.termKind };
	const tierWordText = wordingOf(props.meaningNode.termKind ? sectionWords.tierWithTermKindTemplate : sectionWords.tierTemplate, tierValueByName);
	// ⟪review N6⟫ a row listed as the domain's own term says so in its panel too
	return props.meaningNode.relationshipType === OWN_TERM_RELATIONSHIP_TYPE ? [meaningsVocabulary.domainOwnTermRowText, tierWordText].join(meaningsVocabulary.countPartDivider) : tierWordText;
});

// the tuple's slots in the server's order, each with its kind and its id in its hub's standard (⟪rosettaReportLegible⟫ explorerVocabulary's, shared with the Rosetta report)
const tupleSlotList = computed(() => meaningTupleSlotListOf({ tuple: props.meaningNode.tuple, hubName: props.meaningNode.hubName }));
// ⟪explorerTidy, Q97⟫ why there is no tuple, in the words the /edc page uses, never the server's name for it
const tupleAbsentText = computed(() => (props.meaningNode.tupleAbsentName ? tupleAbsentTextOf(props.meaningNode.tupleAbsentName) : ''));
const rangeDisclosureList = computed(() => (props.meaningNode.rangeIsIdentity === false ? props.meaningNode.rangePartList || [] : []));
const rangeDatatypeList = computed(() => props.meaningNode.rangeDatatypeList || []);
const datatypeText = computed(() => rangeDatatypeList.value.join(sectionWords.datatypeDivider));

// "Expressed in": one group per standard, its true count beside its (capped) list; each element links into the Standards Explorer at the path the server
// made for it, or, when no walk reaches it from its standard's root, is shown unlinked with the reason
const expressedInGroupList = computed(() =>
	(props.meaningNode.expressedInGroupList || []).map((oneGroup) => ({
		...oneGroup,
		familyColor: familyStyleOf(oneGroup.standardFamily).color,
		// ⟪meaningsPolish⟫ the standard's name as the Explorer names a standard group (the group carries no rootName; on main the summary was blank)
		groupDisplayName: displayNameOf(oneGroup),
		countText: oneGroup.elementsTruncated ? wordingOf(sectionWords.groupCappedTemplate, { elementCount: oneGroup.elementCount, shownCount: oneGroup.elementList.length }) : String(oneGroup.elementCount),
		elementList: oneGroup.elementList.map((oneElement) => ({
			...oneElement,
			explorerLink: oneElement.standardsWalkPathStableIdList ? explorerLinkOf(oneElement.standardsWalkPathStableIdList) : null,
			linkTitleText: wordingOf(sectionWords.elementLinkTitleTemplate, { elementName: oneElement.name }),
			ownerText: oneElement.ownerName && oneElement.ownerName !== oneElement.name ? wordingOf(sectionWords.elementOwnerTemplate, { ownerName: oneElement.ownerName }) : '',
			pathAbsentText: oneElement.standardsWalkPathAbsentName ? sectionWords.pathAbsentTextByName[oneElement.standardsWalkPathAbsentName] || sectionWords.pathAbsentOtherText : '',
		})),
	})),
);
// a short list opens its groups; a long one (375 elements for a CIP code) shows its standards closed, so the panel reads as a list of standards first
const GROUPS_OPEN_UP_TO_ELEMENT_COUNT = 24;
const shownExpressionCount = computed(() => expressedInGroupList.value.reduce((soFar, oneGroup) => soFar + oneGroup.elementList.length, 0));
const expressionsCappedText = computed(() => wordingOf(sectionWords.expressionsCappedTemplate, { shownCount: shownExpressionCount.value, expressionCount: props.meaningNode.expressionCount, groupItemCap: props.meaningNode.expressionGroupItemCap }));
const openNoteText = computed(() => (props.meaningNode.elementCount ? wordingOf(sectionWords.openNoteExpressedTemplate, { elementCountText: meaningElementCountTextOf(props.meaningNode.elementCount) }) : '') + sectionWords.openNoteText);

// ⟪meaningsClarity⟫ the values a property meaning holds ("48 values inside"; and, when nothing maps to it but something maps to its values, that); for a meaning of
// another domain listed here, why it is here ("names this as its range")
const valuesFactText = computed(() => {
	const valuesText = meaningValuesTextOf(props.meaningNode);
	if (!valuesText) return '';
	return [valuesText, !props.meaningNode.elementCount && props.meaningNode.valueElementCount ? meaningExpressionTextOf(props.meaningNode) : ''].filter(Boolean).join(meaningsVocabulary.countPartDivider);
});
const incomingFactText = computed(() => (props.meaningNode.relationshipType === INCOMING_MEANING_RELATIONSHIP_TYPE ? incomingSlotTextOf(props.meaningNode) : ''));

// its domain as the walk reaches it from the top: the catalog, the meaning's group, then the domain
const domainLink = computed(() => store.walkLinkOf([store.walkProfile.rootStableId, props.meaningNode.meaningGroup.stableId, props.meaningNode.meaningDomain.stableId]));
</script>

<template>
	<section class="meaning" :aria-label="sectionWords.sectionLabel" data-testid="meaning-section">
		<StandardsExplorerCiteAs v-if="meaningNode.uri" :uri="meaningNode.uri" :uri-kind="meaningNode.uriKind" :uri-is-the-link="store.walkProfile.citesUriAsLink" />
		<dl class="meaning-facts">
			<dt>{{ sectionWords.tierFactName }}</dt>
			<dd data-testid="meaning-tier">{{ tierText }}</dd>
			<template v-if="meaningNode.meaningDomain && meaningNode.meaningGroup">
				<dt>{{ kindDisplayNameOf('meaningDomain', meaningNode.hubName) }}</dt>
				<dd><NuxtLink :to="domainLink" data-testid="meaning-domain-link">{{ meaningNode.meaningDomain.name }}</NuxtLink></dd>
			</template>
			<template v-if="valuesFactText">
				<dt>{{ sectionWords.valuesFactName }}</dt>
				<dd data-testid="meaning-values">{{ valuesFactText }}</dd>
			</template>
			<template v-if="incomingFactText">
				<dt>{{ sectionWords.incomingFactName }}</dt>
				<dd data-testid="meaning-incoming">{{ incomingFactText }}</dd>
			</template>
		</dl>

		<p v-if="!showsFullFacts && fullFactsStateName === 'loading'" class="meaning-note" data-testid="meaning-leaf-loading">{{ sectionWords.leafLoadingText }}</p>
		<p v-else-if="!showsFullFacts && fullFactsStateName === 'failed'" class="meaning-note" data-testid="meaning-leaf-failed">{{ sectionWords.leafFailedText }}</p>
		<p v-else-if="!showsFullFacts" class="meaning-note" data-testid="meaning-open-note">{{ openNoteText }}</p>

		<template v-else>
			<div class="meaning-box" data-testid="meaning-tuple">
				<span class="meaning-box-head">{{ sectionWords.tupleHeadText }}</span>
				<p v-if="meaningNode.tupleAbsentName" class="meaning-note" data-testid="meaning-tuple-absent">{{ tupleAbsentText }}</p>
				<ul v-else class="meaning-slots">
					<li v-for="oneSlot in tupleSlotList" :key="oneSlot.slotName" class="meaning-slot" :data-testid="`meaning-slot-${oneSlot.slotName}`">
						<span class="meaning-slot-name">{{ oneSlot.slotLabel }}</span>
						<a v-if="oneSlot.uri" :href="oneSlot.uri" target="_blank" rel="noopener" class="meaning-slot-label">{{ oneSlot.label }}</a>
						<span v-else class="meaning-slot-label" :title="uriAbsentTextOf(oneSlot.uriAbsentReason)" :data-uri-absent-reason="oneSlot.uriAbsentReason">{{ oneSlot.label }}</span>
						<span class="meaning-slot-kind" data-testid="meaning-slot-detail">{{ oneSlot.detailText }}</span>
						<!-- ⟪meaningsClarity Addendum C #6⟫ the part's URI as visible text, as the Rosetta report prints it -->
						<span v-if="oneSlot.uri" class="meaning-slot-uri" data-testid="meaning-slot-uri">{{ oneSlot.uri }}</span>
					</li>
				</ul>
				<details v-if="rangeDisclosureList.length || (meaningNode.rangeIsIdentity === false && rangeDatatypeList.length)" class="meaning-ranges" data-testid="meaning-ranges">
					<summary>{{ sectionWords.rangesSummaryText }} <span class="meaning-count">{{ rangeDisclosureList.length + rangeDatatypeList.length }}</span> {{ sectionWords.rangesAsideText }}</summary>
					<p v-if="rangeDatatypeList.length" class="meaning-note" data-testid="meaning-datatypes">{{ wordingOf(sectionWords.datatypeTemplate, { datatypeText }) }}</p>
					<ul class="meaning-slots">
						<li v-for="onePart in rangeDisclosureList" :key="onePart.uri || onePart.label" class="meaning-slot">
							<a v-if="onePart.uri" :href="onePart.uri" target="_blank" rel="noopener" class="meaning-slot-label">{{ onePart.label }}</a>
							<span v-else class="meaning-slot-label">{{ onePart.label }}</span>
							<span class="meaning-slot-kind">{{ sectionWords.partKindLabelByKind[onePart.kind] || onePart.kind }}</span>
						</li>
					</ul>
				</details>
				<p v-if="rangeDatatypeList.length && meaningNode.rangeIsIdentity !== false" class="meaning-note" data-testid="meaning-datatypes">{{ wordingOf(sectionWords.datatypeRangeTemplate, { datatypeText }) }}</p>
			</div>

			<div class="meaning-box" data-testid="meaning-expressed-in">
				<span class="meaning-box-head">{{ sectionWords.expressedInHeadText }} <span class="meaning-count">{{ meaningElementCountTextOf(meaningNode.expressionCount) }}</span></span>
				<p v-if="!meaningNode.expressionCount" class="meaning-note">{{ sectionWords.unexpressedText }}</p>
				<p v-else-if="meaningNode.expressionsTruncated" class="meaning-note" data-testid="meaning-expressed-in-capped">{{ expressionsCappedText }}</p>
				<details v-for="oneGroup in expressedInGroupList" :key="oneGroup.standardKey" class="meaning-group" :open="shownExpressionCount <= GROUPS_OPEN_UP_TO_ELEMENT_COUNT" :data-testid="`meaning-group-${oneGroup.standardKey}`">
					<summary>
						<span aria-hidden="true" class="meaning-group-dot" :style="{ background: oneGroup.familyColor }" />
						<span class="meaning-group-name" data-testid="meaning-group-name">{{ oneGroup.groupDisplayName }}</span>
						<span class="meaning-count">{{ oneGroup.countText }}</span>
					</summary>
					<ul class="meaning-elements">
						<li v-for="oneElement in oneGroup.elementList" :key="oneElement.stableId" class="meaning-element">
							<NuxtLink v-if="oneElement.explorerLink" :to="oneElement.explorerLink" class="meaning-element-name" :title="oneElement.linkTitleText" data-testid="meaning-element-link">{{ oneElement.name }}</NuxtLink>
							<span v-else class="meaning-element-name" data-testid="meaning-element-unlinked">{{ oneElement.name }} <span class="meaning-element-basis">({{ oneElement.pathAbsentText }})</span></span>
							<span v-if="oneElement.ownerText" class="meaning-element-owner">{{ oneElement.ownerText }}</span>
							<StandardsExplorerMatchSummary :match-kind="oneElement.matchKind" :mapping-confidence="oneElement.mappingConfidence ?? null" />
							<span v-if="oneElement.matchBasis" class="meaning-element-basis">{{ oneElement.matchBasis }}</span>
						</li>
					</ul>
				</details>
			</div>
		</template>
	</section>
</template>

<style scoped>
.meaning {
	display: flex;
	flex-direction: column;
	gap: 12px;
}
.meaning-facts {
	margin: 0;
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 6px 12px;
	font-size: 14px;
}
.meaning-facts dt {
	color: #6b7280;
}
.meaning-facts dd {
	margin: 0;
	overflow-wrap: anywhere;
}
.meaning-box {
	border: 1px solid #e3e7ef;
	border-radius: 10px;
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	background: #fbfcfe;
	min-width: 0;
}
.meaning-box-head {
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
.meaning-count {
	font-weight: 400;
	color: #6b7280;
	text-transform: none;
	letter-spacing: 0;
}
.meaning-note {
	margin: 0;
	font-size: 13px;
	color: #6b7280;
}
.meaning-slots,
.meaning-elements {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.meaning-slot {
	display: grid;
	grid-template-columns: 6.5em 1fr;
	gap: 0 8px;
	font-size: 14px;
}
.meaning-slot-name {
	color: #6b7280;
	grid-row: span 2;
}
.meaning-slot-label {
	font-weight: 700;
	overflow-wrap: anywhere;
}
.meaning-slot-kind {
	font-size: 12px;
	color: #6b7280;
}
.meaning-slot-uri {
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 11px;
	color: #374151;
	overflow-wrap: anywhere;
}
.meaning-ranges summary,
.meaning-group summary {
	cursor: pointer;
	font-size: 14px;
	display: flex;
	align-items: center;
	gap: 8px;
}
.meaning-ranges .meaning-slot {
	grid-template-columns: 1fr;
	margin-top: 6px;
}
.meaning-group {
	border-top: 1px solid #e3e7ef;
	padding-top: 8px;
}
.meaning-group-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	flex: none;
}
.meaning-group-name {
	font-weight: 700;
	overflow-wrap: anywhere;
}
.meaning-elements {
	margin-top: 8px;
}
.meaning-element {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 8px;
	font-size: 14px;
}
.meaning-element-name {
	font-weight: 600;
	overflow-wrap: anywhere;
}
.meaning-element-owner,
.meaning-element-basis {
	font-size: 12px;
	color: #6b7280;
}
</style>
