<script setup>
// The explorer's Companion pages section (SPEC-companionPages-102826, Phase 2): a card for each companion page of the
// standard being visited, above Downloads. Which standards the focus names is the shared focus rule
// (focusStandardKeyList.js), the same function DownloadsSection.vue calls (gate G2.2). A focus with no pages renders
// nothing at all: no heading, no note (only a failed request shows the heading, with its reason). A card opens a
// compiled page served by this site (/explore/companion/<pageSlug>, built in Phase 4), or an outside URL.

import { computed, onMounted, watch } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { useStandardDownloadsStore } from '@/stores/standardDownloadsStore';
import { useCompanionPagesStore } from '@/stores/companionPagesStore';
import { standardKeyListOfFocus } from '@/components/standardsExplorer/focusStandardKeyList';

const neighbourhoodStore = useStandardsNeighbourhoodStore();
const downloadsStore = useStandardDownloadsStore();
const companionPagesStore = useCompanionPagesStore();

// a family's standards come from the downloads manifest, so the rule needs it loaded (loadManifest loads it once)
onMounted(() => downloadsStore.loadManifest());

const focusNode = computed(() => neighbourhoodStore.focusNode);

const standardKeyList = computed(() =>
	standardKeyListOfFocus({ focusNode: focusNode.value, levelRowList: neighbourhoodStore.levelRowList, standardKeyListOfFamily: downloadsStore.standardKeyListOfFamily }),
);

watch(
	() => ({ standardKeyList: standardKeyList.value, subjectStableId: focusNode.value?.stableId || null }),
	(focusRequest) => companionPagesStore.loadPageListOfFocus(focusRequest),
	{ immediate: true, deep: true },
);

const COMPILED_PAGE_PATH = '/explore/companion';

const cardTargetOf = (companionPage) =>
	companionPage.targetKind === 'externalUrl'
		? { href: companionPage.externalUrl, target: '_blank', rel: 'noopener' }
		: { to: `${COMPILED_PAGE_PATH}/${companionPage.pageSlug}` };
</script>

<template>
	<section v-if="companionPagesStore.companionPageList.length || companionPagesStore.statusMsg" class="companion-section" aria-label="Companion pages" data-testid="companion-section">
		<span class="companion-section-head">Companion pages</span>
		<p v-if="companionPagesStore.statusMsg" class="companion-section-error" data-testid="companion-section-error">The companion pages could not be read: {{ companionPagesStore.statusMsg }}</p>
		<NuxtLink v-for="companionPage in companionPagesStore.companionPageList" :key="companionPage.pageSlug" v-bind="cardTargetOf(companionPage)" class="companion-card" :data-testid="`companion-card-${companionPage.pageSlug}`">
			<span class="companion-card-title">{{ companionPage.title }} ›</span>
			<span v-if="companionPage.summary" class="companion-card-summary">{{ companionPage.summary }}</span>
			<span v-if="companionPage.audienceText" class="companion-card-audience">For {{ companionPage.audienceText }}</span>
		</NuxtLink>
	</section>
</template>

<style scoped>
.companion-section {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-top: 14px;
	border-top: 1px solid #e3e7ef;
}
.companion-section-head {
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
.companion-section-error {
	margin: 0;
	font-size: 13px;
	color: #9b1c1c;
}
.companion-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	border: 1px solid #e3e7ef;
	border-radius: 10px;
	padding: 12px;
	background: #fbfcfe;
	text-decoration: none;
	color: inherit;
}
.companion-card:hover {
	border-color: #072a6c;
}
.companion-card-title {
	font-size: 15px;
	font-weight: 700;
	color: #072a6c;
}
.companion-card-summary {
	font-size: 14px;
	line-height: 1.4;
}
.companion-card-audience {
	font-size: 12px;
	color: #6b7280;
}
</style>
