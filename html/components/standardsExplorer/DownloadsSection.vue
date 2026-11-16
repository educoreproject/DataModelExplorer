<script setup>
// The explorer's Downloads section (WORKORDER-standardDownloads-101526 §3c): the downloads of the standard being
// visited, read from the focus (never the selected row). Which standards the focus names is the shared focus rule,
// focusStandardKeyList.js; at the families catalog there is none, and the section shows one "All downloads" link.
// Always, below a family, the link to the Downloads page filtered to that family. Under each standard's title, where
// its source came from (SourceUrlNote; WORKORDER-sourceUrls-101526).

import { computed, onMounted } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { useStandardDownloadsStore } from '@/stores/standardDownloadsStore';
import { explorerComponentWords, familyStyleOf, wordingOf } from '@/components/standardsExplorer/explorerVocabulary';
import { standardKeyListOfFocus } from '@/components/standardsExplorer/focusStandardKeyList';

const downloadsWords = explorerComponentWords.downloadsSection;

const neighbourhoodStore = useStandardsNeighbourhoodStore();
const downloadsStore = useStandardDownloadsStore();

onMounted(() => downloadsStore.loadManifest());

const focusNode = computed(() => neighbourhoodStore.focusNode);
const isCatalog = computed(() => focusNode.value?.kind === 'familyCatalog');
const standardFamily = computed(() => focusNode.value?.standardFamily || '');

const standardKeyList = computed(() =>
	standardKeyListOfFocus({ focusNode: focusNode.value, levelRowList: neighbourhoodStore.levelRowList, standardKeyListOfFamily: downloadsStore.standardKeyListOfFamily }),
);

const standardDownloadList = computed(() =>
	standardKeyList.value.map((standardKey) => {
		const entryList = downloadsStore.entryListOfStandardKey(standardKey);
		const firstEntry = entryList[0];
		return { standardKey, entryList, titleText: firstEntry ? `${firstEntry.group} ${firstEntry.version}` : standardKey };
	}),
);

const familyLinkText = computed(() => wordingOf(downloadsWords.familyAllTemplate, { familyName: familyStyleOf(standardFamily.value).displayName }));
const familyLinkTarget = computed(() => ({ path: '/explore/standards/downloads', query: { family: standardFamily.value } }));
</script>

<template>
	<section v-if="focusNode" class="downloads-section" :aria-label="downloadsWords.headText" data-testid="downloads-section">
		<span class="downloads-section-head">{{ downloadsWords.headText }}</span>
		<template v-if="isCatalog">
			<p class="downloads-section-note">{{ downloadsWords.catalogNoteText }}</p>
			<NuxtLink to="/explore/standards/downloads" class="downloads-section-link" data-testid="downloads-all-link">{{ downloadsWords.allDownloadsText }}</NuxtLink>
		</template>
		<template v-else>
			<p v-if="downloadsStore.manifestLoading" class="downloads-section-note">{{ downloadsWords.loadingText }}</p>
			<p v-else-if="downloadsStore.statusMsg" class="downloads-section-error" data-testid="downloads-section-error">{{ wordingOf(downloadsWords.unreadTemplate, { statusMsg: downloadsStore.statusMsg }) }}</p>
			<template v-else>
				<div v-for="oneStandard in standardDownloadList" :key="oneStandard.standardKey" class="downloads-section-standard" :data-testid="`downloads-standard-${oneStandard.standardKey}`">
					<span class="downloads-section-title">{{ oneStandard.titleText }}</span>
					<StandardsExplorerSourceUrlNote v-if="oneStandard.entryList.length" :download-entry="oneStandard.entryList[0]" />
					<p v-if="oneStandard.entryList.length === 0" class="downloads-section-note">{{ downloadsWords.noneText }}</p>
					<StandardsExplorerDownloadEntryButton v-for="oneEntry in oneStandard.entryList" :key="oneEntry.downloadId" :download-entry="oneEntry" />
				</div>
				<p v-if="downloadsStore.downloadStatusMsg" class="downloads-section-error" data-testid="downloads-download-error">{{ downloadsStore.downloadStatusMsg }}</p>
			</template>
			<NuxtLink v-if="standardFamily" :to="familyLinkTarget" class="downloads-section-link" data-testid="downloads-family-link">{{ wordingOf(downloadsWords.familyLinkTemplate, { familyLinkText }) }}</NuxtLink>
		</template>
	</section>
</template>

<style scoped>
.downloads-section {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-top: 14px;
	border-top: 1px solid #e3e7ef;
}
.downloads-section-head {
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
.downloads-section-standard {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.downloads-section-title {
	font-size: 14px;
	font-weight: 700;
	color: #072a6c;
}
.downloads-section-note {
	margin: 0;
	font-size: 13px;
	color: #6b7280;
}
.downloads-section-error {
	margin: 0;
	font-size: 13px;
	color: #9b1c1c;
}
.downloads-section-link {
	font-size: 14px;
	color: #072a6c;
	font-weight: 600;
}
</style>
