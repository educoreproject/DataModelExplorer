<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Meanings (WORKORDER-meaningsExplorer-111026; TQ: "show HubReferences analogous to the standards explorer", named Meanings, its own page).
// A meaning is a hub card: one idea the standards can express, named once with a permanent EDUcore URI. The page is the Standards Explorer's own walk
// (WalkView.vue and every component beneath it) drawing the 'meanings' walk profile: meanings:all → a hub → its domains → a domain's meanings → one
// meaning, whose detail shows its tuple, every element that expresses it, and how to cite it. Public, as the Standards Explorer is.
// ⟪meaningsPolish⟫ Beside the heading, the ⓘ "What is a meaning?" explainer (MeaningExplainer.vue). Its words, and the JSON-LD's, are meaningsVocabulary's.
// For agents, the page carries the meanings it shows as Schema.org: a DefinedTermSet of DefinedTerms, each @id its EDUcore URI.

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { useJsonLd, absoluteUrlOf } from '@/composables/useJsonLd';
import { displayNameOf, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';
import { meaningsVocabulary } from '@/components/standardsExplorer/explorerVocabulary';

const route = useRoute();
const store = useStandardsNeighbourhoodStore();

// a meaning as Schema.org: its EDUcore URI is its @id, so an agent can follow it to the meaning's own page
const jsonLdWords = meaningsVocabulary.jsonLd;
const definedTermOf = (meaningRow) => ({
	'@type': 'DefinedTerm',
	'@id': meaningRow.uri || undefined,
	name: meaningRow.displayName || meaningRow.name,
	description: meaningRow.description || undefined,
	termCode: meaningRow.referenceTier ? wordingOf(jsonLdWords.termCodeTemplate, { hubName: meaningRow.hubName, referenceTier: meaningRow.referenceTier }) : undefined,
	url: meaningRow.uri || undefined,
});

// the meanings on screen: the focus when it is one, and every meaning listed on this level
const shownMeaningList = computed(() => {
	if (!store.walkProfile || store.walkProfileName !== 'meanings' || !store.focusNode) return [];
	const focusMeaningList = store.focusNode.kind === 'meaning' ? [{ ...store.focusNode, displayName: displayNameOf(store.focusNode) }] : [];
	return focusMeaningList.concat(store.levelRowList.filter((oneRow) => oneRow.kind === 'meaning'));
});

useJsonLd('meanings', () => {
	if (!store.focusNode || store.walkProfileName !== 'meanings') return null;
	return {
		'@type': 'DefinedTermSet',
		'@id': absoluteUrlOf(route.fullPath),
		name: store.focusNode.kind === 'meaningCatalog' ? jsonLdWords.catalogName : wordingOf(jsonLdWords.focusNameTemplate, { focusName: displayNameOf(store.focusNode) }),
		description: jsonLdWords.description,
		hasDefinedTerm: shownMeaningList.value.map(definedTermOf),
	};
});
</script>

<template>
	<div class="meanings-view" data-testid="meanings-view">
		<ExploreViewBar :title-text="meaningsVocabulary.viewBarTitleText" />
		<StandardsExplorerWalkView walk-profile-name="meanings">
			<template #titleAside><StandardsExplorerMeaningExplainer /></template>
		</StandardsExplorerWalkView>
	</div>
</template>
