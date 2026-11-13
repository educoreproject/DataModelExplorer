<script setup>
// MeaningMappedHere — the elements of other standards mapped to one meaning, one group per standard, each element linked into the Standards Explorer.
// Shown in a meaning's panel (MeaningSection) and, one box per mapped meaning, in a class's panel (ClassMappingsSection), so the two read alike (TQ 2026-11-12).
//   meaningNode: the meaning's own node (expressedInGroupList, expressionCount, expressionsTruncated, expressionGroupItemCap)
//   headText: the box's heading; the vocabulary's 'Mapped here' when not given (a class names each box by its meaning)
import { computed } from 'vue';
import { displayNameOf, familyStyleOf, explorerLinkOf, meaningElementCountTextOf, meaningsVocabulary, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	meaningNode: { type: Object, required: true },
	headText: { type: String, default: '' },
});

const sectionWords = meaningsVocabulary.meaningSection;

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
</script>

<template>
	<div class="meaning-box" data-testid="meaning-expressed-in">
		<span class="meaning-box-head">{{ headText || sectionWords.expressedInHeadText }} <span class="meaning-count">{{ meaningElementCountTextOf(meaningNode.expressionCount) }}</span></span>
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

<style scoped src="./meaningBoxes.css"></style>
