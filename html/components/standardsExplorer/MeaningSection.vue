<script setup>
// @concept: [[DataModelExplorer]]
// ⟪meaningsExplorer, WORKORDER-meaningsExplorer-111026⟫ A meaning in the detail panel, in the order the work order sets: where it sits (its tier, and its
// domain and property as links back up the walk); its tuple, each role-named slot linked to its EDUcore URI (a CTDL meaning's ranges are description, not
// identity, so they sit behind a disclosure, as on the /edc page); "Expressed in", every element mapped to it, one group per standard, each element a link
// into the Standards Explorer at the path to it; last, its Cite as line and a link to its /edc meaning page. The tuple and "Expressed in" come with the
// meaning's own answer, so they show when the meaning is the focus; a meaning selected on a list says to open it.

import { computed } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { edcPagePathOf, familyStyleOf, explorerLinkOf, kindDisplayNameOf } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	meaningNode: { type: Object, required: true },
	isFocus: { type: Boolean, required: true },
});

const store = useStandardsNeighbourhoodStore();

// the words a reader sees for a slot and for a part's kind; a slot or kind not listed shows as the server named it
const SLOT_LABEL_BY_NAME = Object.freeze({ domain: 'Domain', property: 'Property', range: 'Range', value: 'Value', qualifier: 'Qualifier', term: 'Term' });
const PART_KIND_LABEL_BY_KIND = Object.freeze({ class: 'class', property: 'property', optionSet: 'code list', option: 'code' });
const TIER_TEXT_BY_TIER = Object.freeze({ property: 'a property in a domain', value: 'one code of a property in a domain', term: 'one term, meant on its own' });

const tierText = computed(() => {
	const tierWords = TIER_TEXT_BY_TIER[props.meaningNode.referenceTier] || props.meaningNode.referenceTier;
	return props.meaningNode.termKind ? `${props.meaningNode.referenceTier} tier (${tierWords}; a ${props.meaningNode.termKind})` : `${props.meaningNode.referenceTier} tier (${tierWords})`;
});

// the tuple's slots in the server's order (hubCardTuple answers them in its rules' slot order)
const tupleSlotList = computed(() => Object.entries(props.meaningNode.tuple || {}).map(([slotName, slotPart]) => ({ slotName, slotLabel: SLOT_LABEL_BY_NAME[slotName] || slotName, ...slotPart, kindText: PART_KIND_LABEL_BY_KIND[slotPart.kind] || slotPart.kind, nativeIdText: slotPart.nativeId ? Object.values(slotPart.nativeId)[0] : '' })));
const rangeDisclosureList = computed(() => (props.meaningNode.rangeIsIdentity === false ? props.meaningNode.rangePartList || [] : []));
const rangeDatatypeList = computed(() => props.meaningNode.rangeDatatypeList || []);

// "Expressed in": one group per standard, its true count beside its (capped) list; each element links into the Standards Explorer at the path the server
// made for it, or, when no walk reaches it from its standard's root, is shown unlinked with the reason
const PATH_ABSENT_TEXT_BY_NAME = Object.freeze({ noClimbFromRoot: 'no walk reaches it from its standard\'s root' });
const expressedInGroupList = computed(() =>
	(props.meaningNode.expressedInGroupList || []).map((oneGroup) => ({
		...oneGroup,
		familyColor: familyStyleOf(oneGroup.standardFamily).color,
		elementList: oneGroup.elementList.map((oneElement) => ({
			...oneElement,
			explorerLink: oneElement.standardsWalkPathStableIdList ? explorerLinkOf(oneElement.standardsWalkPathStableIdList) : null,
			pathAbsentText: oneElement.standardsWalkPathAbsentName ? PATH_ABSENT_TEXT_BY_NAME[oneElement.standardsWalkPathAbsentName] || oneElement.standardsWalkPathAbsentName : '',
		})),
	})),
);
// a short list opens its groups; a long one (375 elements for a CIP code) shows its standards closed, so the panel reads as a list of standards first
const GROUPS_OPEN_UP_TO_ELEMENT_COUNT = 24;
const shownExpressionCount = computed(() => expressedInGroupList.value.reduce((soFar, oneGroup) => soFar + oneGroup.elementList.length, 0));

const edcPagePath = computed(() => edcPagePathOf(props.meaningNode.uri));
// its domain and its property as the walk reaches them from the top: the catalog, the meaning's group, the domain, then the property
const domainPathStableIdList = computed(() => (props.meaningNode.meaningGroup && props.meaningNode.meaningDomain ? [store.walkProfile.rootStableId, props.meaningNode.meaningGroup.stableId, props.meaningNode.meaningDomain.stableId] : []));
const domainLink = computed(() => store.walkLinkOf(domainPathStableIdList.value));
const propertyLink = computed(() => store.walkLinkOf([...domainPathStableIdList.value, props.meaningNode.meaningProperty ? props.meaningNode.meaningProperty.stableId : '']));
</script>

<template>
	<section class="meaning" aria-label="What this meaning is" data-testid="meaning-section">
		<dl class="meaning-facts">
			<dt>Tier</dt>
			<dd data-testid="meaning-tier">{{ tierText }}</dd>
			<template v-if="meaningNode.meaningDomain && meaningNode.meaningGroup">
				<dt>{{ kindDisplayNameOf('meaningDomain', meaningNode.hubName) }}</dt>
				<dd><NuxtLink :to="domainLink" data-testid="meaning-domain-link">{{ meaningNode.meaningDomain.name }}</NuxtLink></dd>
			</template>
			<template v-if="meaningNode.meaningProperty && meaningNode.meaningGroup">
				<dt>{{ kindDisplayNameOf('meaningProperty', meaningNode.hubName) }}</dt>
				<dd><NuxtLink :to="propertyLink" data-testid="meaning-property-link">{{ meaningNode.meaningProperty.name }}</NuxtLink></dd>
			</template>
		</dl>

		<p v-if="!isFocus" class="meaning-note" data-testid="meaning-open-note">{{ meaningNode.elementCount ? `Expressed in ${meaningNode.elementCount} elements. ` : '' }}Open this meaning for its tuple and every element that expresses it.</p>

		<template v-else>
			<div class="meaning-box" data-testid="meaning-tuple">
				<span class="meaning-box-head">What it names</span>
				<p v-if="meaningNode.tupleAbsentName" class="meaning-note" data-testid="meaning-tuple-absent">No citable tuple: <code>{{ meaningNode.tupleAbsentName }}</code>.</p>
				<ul v-else class="meaning-slots">
					<li v-for="oneSlot in tupleSlotList" :key="oneSlot.slotName" class="meaning-slot" :data-testid="`meaning-slot-${oneSlot.slotName}`">
						<span class="meaning-slot-name">{{ oneSlot.slotLabel }}</span>
						<a v-if="oneSlot.uri" :href="oneSlot.uri" target="_blank" rel="noopener" class="meaning-slot-label">{{ oneSlot.label }}</a>
						<span v-else class="meaning-slot-label" :title="oneSlot.uriAbsentReason">{{ oneSlot.label }}</span>
						<span class="meaning-slot-kind">{{ oneSlot.kindText }}<template v-if="oneSlot.nativeIdText"> · {{ oneSlot.nativeIdText }}</template></span>
					</li>
				</ul>
				<details v-if="rangeDisclosureList.length || (meaningNode.rangeIsIdentity === false && rangeDatatypeList.length)" class="meaning-ranges" data-testid="meaning-ranges">
					<summary>Ranges <span class="meaning-count">{{ rangeDisclosureList.length + rangeDatatypeList.length }}</span> (description, not part of what it names)</summary>
					<p v-if="rangeDatatypeList.length" class="meaning-note" data-testid="meaning-datatypes">Datatype: {{ rangeDatatypeList.join(', ') }}</p>
					<ul class="meaning-slots">
						<li v-for="onePart in rangeDisclosureList" :key="onePart.uri || onePart.label" class="meaning-slot">
							<a v-if="onePart.uri" :href="onePart.uri" target="_blank" rel="noopener" class="meaning-slot-label">{{ onePart.label }}</a>
							<span v-else class="meaning-slot-label">{{ onePart.label }}</span>
							<span class="meaning-slot-kind">{{ PART_KIND_LABEL_BY_KIND[onePart.kind] || onePart.kind }}</span>
						</li>
					</ul>
				</details>
				<p v-if="rangeDatatypeList.length && meaningNode.rangeIsIdentity !== false" class="meaning-note" data-testid="meaning-datatypes">Datatype range: {{ rangeDatatypeList.join(', ') }}</p>
			</div>

			<div class="meaning-box" data-testid="meaning-expressed-in">
				<span class="meaning-box-head">Expressed in <span class="meaning-count">{{ meaningNode.expressionCount }} elements</span></span>
				<p v-if="!meaningNode.expressionCount" class="meaning-note">No element of any standard is mapped to this meaning.</p>
				<p v-else-if="meaningNode.expressionsTruncated" class="meaning-note" data-testid="meaning-expressed-in-capped">Showing {{ shownExpressionCount }} of {{ meaningNode.expressionCount }}: each standard lists at most its first 500, strongest first.</p>
				<details v-for="(oneGroup, groupIndex) in expressedInGroupList" :key="oneGroup.standardKey" class="meaning-group" :open="shownExpressionCount <= GROUPS_OPEN_UP_TO_ELEMENT_COUNT" :data-testid="`meaning-group-${oneGroup.standardKey}`">
					<summary>
						<span aria-hidden="true" class="meaning-group-dot" :style="{ background: oneGroup.familyColor }" />
						<span class="meaning-group-name">{{ oneGroup.rootName }}</span>
						<span class="meaning-count">{{ oneGroup.elementsTruncated ? `${oneGroup.elementCount}, showing ${oneGroup.elementList.length}` : oneGroup.elementCount }}</span>
					</summary>
					<ul class="meaning-elements">
						<li v-for="oneElement in oneGroup.elementList" :key="oneElement.stableId" class="meaning-element">
							<NuxtLink v-if="oneElement.explorerLink" :to="oneElement.explorerLink" class="meaning-element-name" :title="`Open ${oneElement.name} in the Standards Explorer`" data-testid="meaning-element-link">{{ oneElement.name }}</NuxtLink>
							<span v-else class="meaning-element-name" data-testid="meaning-element-unlinked">{{ oneElement.name }} <span class="meaning-element-basis">({{ oneElement.pathAbsentText }})</span></span>
							<span v-if="oneElement.ownerName && oneElement.ownerName !== oneElement.name" class="meaning-element-owner">of {{ oneElement.ownerName }}</span>
							<StandardsExplorerMatchSummary :match-kind="oneElement.matchKind" :mapping-confidence="oneElement.mappingConfidence ?? null" />
							<span v-if="oneElement.matchBasis" class="meaning-element-basis">{{ oneElement.matchBasis }}</span>
						</li>
					</ul>
				</details>
			</div>
		</template>

		<StandardsExplorerCiteAs v-if="meaningNode.uri" :uri="meaningNode.uri" :uri-kind="meaningNode.uriKind" />
		<a v-if="edcPagePath" :href="edcPagePath" class="meaning-edc-link" data-testid="meaning-edc-link">Its meaning page on EDUcore ›</a>
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
.meaning-edc-link {
	font-size: 14px;
	align-self: flex-start;
}
</style>
