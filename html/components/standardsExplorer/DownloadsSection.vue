<script setup>
// The explorer's Downloads section (WORKORDER-standardDownloads-101526 §3c): the downloads of the standard being
// visited, read from the focus (never the selected row). How the focus names its standard:
//   the families catalog   no standard: one "All downloads" link
//   a family               its standard when the family holds exactly one (SIF, Ed-Fi, CEDS), else none
//   a release              the standards listed on this level (one per version)
//   anything else          the focus's own standardKey (a standard root, a class, a field, a CEDS element, a group)
// and always, below a family, the link to the Downloads page filtered to that family.

import { computed, onMounted } from 'vue';
import { useStandardsNeighbourhoodStore } from '@/stores/standardsNeighbourhoodStore';
import { useStandardDownloadsStore } from '@/stores/standardDownloadsStore';
import { familyStyleOf } from '@/components/standardsExplorer/explorerVocabulary';

const neighbourhoodStore = useStandardsNeighbourhoodStore();
const downloadsStore = useStandardDownloadsStore();

onMounted(() => downloadsStore.loadManifest());

const focusNode = computed(() => neighbourhoodStore.focusNode);
const isCatalog = computed(() => focusNode.value?.kind === 'familyCatalog');
const standardFamily = computed(() => focusNode.value?.standardFamily || '');

const standardKeyListByKind = {
	family: () => {
		const familyStandardKeyList = downloadsStore.standardKeyListOfFamily(standardFamily.value);
		return familyStandardKeyList.length === 1 ? familyStandardKeyList : [];
	},
	release: () => [...new Set(neighbourhoodStore.levelRowList.filter((oneRow) => oneRow.kind === 'standard' && oneRow.standardKey).map((oneRow) => oneRow.standardKey))],
};

const standardKeyList = computed(() => {
	if (!focusNode.value || isCatalog.value) return [];
	const listOfKind = standardKeyListByKind[focusNode.value.kind];
	if (listOfKind) return listOfKind();
	return focusNode.value.standardKey ? [focusNode.value.standardKey] : [];
});

const standardDownloadList = computed(() =>
	standardKeyList.value.map((standardKey) => {
		const entryList = downloadsStore.entryListOfStandardKey(standardKey);
		const firstEntry = entryList[0];
		return { standardKey, entryList, titleText: firstEntry ? `${firstEntry.group} ${firstEntry.version}` : standardKey };
	}),
);

const familyLinkText = computed(() => `All downloads for ${familyStyleOf(standardFamily.value).displayName}`);
const familyLinkTarget = computed(() => ({ path: '/explore/downloads', query: { family: standardFamily.value } }));
</script>

<template>
	<section v-if="focusNode" class="downloads-section" aria-label="Downloads" data-testid="downloads-section">
		<span class="downloads-section-head">Downloads</span>
		<template v-if="isCatalog">
			<p class="downloads-section-note">The source of every standard, and each written back out of this graph.</p>
			<NuxtLink to="/explore/downloads" class="downloads-section-link" data-testid="downloads-all-link">All downloads ›</NuxtLink>
		</template>
		<template v-else>
			<p v-if="downloadsStore.manifestLoading" class="downloads-section-note">Looking for downloads…</p>
			<p v-else-if="downloadsStore.statusMsg" class="downloads-section-error" data-testid="downloads-section-error">The downloads could not be read: {{ downloadsStore.statusMsg }}</p>
			<template v-else>
				<div v-for="oneStandard in standardDownloadList" :key="oneStandard.standardKey" class="downloads-section-standard" :data-testid="`downloads-standard-${oneStandard.standardKey}`">
					<span class="downloads-section-title">{{ oneStandard.titleText }}</span>
					<p v-if="oneStandard.entryList.length === 0" class="downloads-section-note">No downloads for this standard in this graph.</p>
					<StandardsExplorerDownloadEntryButton v-for="oneEntry in oneStandard.entryList" :key="oneEntry.downloadId" :download-entry="oneEntry" />
				</div>
				<p v-if="downloadsStore.downloadStatusMsg" class="downloads-section-error" data-testid="downloads-download-error">{{ downloadsStore.downloadStatusMsg }}</p>
			</template>
			<NuxtLink v-if="standardFamily" :to="familyLinkTarget" class="downloads-section-link" data-testid="downloads-family-link">{{ familyLinkText }} ›</NuxtLink>
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
