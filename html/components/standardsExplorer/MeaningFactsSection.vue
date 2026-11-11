<script setup>
// ⟪meaningsClarity, Addendum A; TQ 2026-11-11: "each element's page should match the info on its URI page"⟫ "Meanings it takes part in" for the element the walk is on:
// exactly the lines its /edc page shows (the server's one reader, elementMeaningFacts.js, builds them in the shared words, meaningFactsWording.json), each with its
// count and a link to its place in the Meanings explorer. The total is the sum of the section lines. ⟪review S4⟫ The facts may arrive after the node (factsState);
// ⟪review N6, N7⟫ a failed read is said in the shared words, never the server's error text, and every count is written as the /edc page writes it.

import { computed } from 'vue';
import { walkLinkOf } from '@/components/standardsExplorer/explorerVocabulary';
import { countTextOf } from '@/components/standardsExplorer/sharedWording.js';
import meaningFactsWording from '@/components/standardsExplorer/meaningFactsWording.json';

const props = defineProps({
	// { loading, meaningFacts, failed }: the focus's facts as its answer carried them, or as the store asked for them
	factsState: { type: Object, required: true },
});

const meaningFacts = computed(() => props.factsState.meaningFacts || null);
const countTextOfFacts = (countValue) => countTextOf(countValue, meaningFactsWording.numberLocaleName);
const lineList = computed(() =>
	(meaningFacts.value ? meaningFacts.value.lineList : []).map((oneLine, lineIndex) => ({
		...oneLine,
		lineIndex,
		countText: countTextOfFacts(oneLine.meaningCount),
		meaningsLink: oneLine.meaningsWalkPathStableIdList ? walkLinkOf('meanings', oneLine.meaningsWalkPathStableIdList) : null,
	})),
);
</script>

<template>
	<section class="meaning-facts" :aria-label="meaningFactsWording.sectionHeadText" data-testid="meaning-facts">
		<span class="detail-box-head">
			{{ meaningFactsWording.sectionHeadText }}
			<span v-if="meaningFacts" class="meaning-facts-total" data-testid="meaning-facts-total" :data-count="meaningFacts.takesPartCount">{{ countTextOfFacts(meaningFacts.takesPartCount) }}</span>
		</span>
		<p v-if="factsState.loading" class="meaning-facts-note" data-testid="meaning-facts-loading">{{ meaningFactsWording.loadingText }}</p>
		<p v-else-if="factsState.failed" class="meaning-facts-note" data-testid="meaning-facts-absent">{{ meaningFactsWording.unreadableText }}</p>
		<p v-else-if="meaningFacts && !lineList.length" class="meaning-facts-note">{{ meaningFactsWording.noMeaningText }}</p>
		<ul v-else-if="meaningFacts" class="meaning-facts-lines" data-testid="meaning-facts-lines">
			<li
				v-for="oneLine in lineList"
				:key="oneLine.lineIndex"
				:class="`meaning-facts-depth-${oneLine.depth}`"
				:data-meaning-line="oneLine.lineName"
				:data-depth="oneLine.depth"
				:data-count="oneLine.meaningCount"
			>
				<span>{{ oneLine.lineText }}</span>
				<span class="meaning-facts-count">{{ oneLine.countText }}</span>
				<NuxtLink v-if="oneLine.meaningsLink" :to="oneLine.meaningsLink" class="meaning-facts-open" data-testid="meaning-facts-open">{{ meaningFactsWording.openInMeaningsText }}</NuxtLink>
			</li>
		</ul>
	</section>
</template>

<style scoped>
.meaning-facts {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.detail-box-head {
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
.meaning-facts-total {
	margin-left: 6px;
	color: #072a6c;
}
.meaning-facts-note {
	margin: 0;
	font-size: 13px;
	color: #6b7280;
}
.meaning-facts-lines {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 13px;
	color: #111827;
}
.meaning-facts-lines li {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 4px 8px;
	overflow-wrap: anywhere;
}
.meaning-facts-depth-1 {
	padding-left: 16px;
	color: #374151;
}
.meaning-facts-count {
	font-weight: 700;
	color: #072a6c;
}
.meaning-facts-open {
	font-size: 12px;
	color: #1f5fbf;
}
</style>
