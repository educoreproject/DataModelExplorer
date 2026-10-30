<script setup>
// @concept: [[DataModelExplorer]]
// The Structure tab of a forged use case (PLAN-useCaseStructureTab-103026, TQ 2026-10-30: "show the structure of the use
// case ... an easily readable outline maybe with disclose triangles so people can understand how the graph works. It
// should have a button that goes to download the JSON ... both source and extracted, just as with the other standards").
// It teaches how a use case lives in the graph: the case node, one disclosure group per edge type, each part with its
// properties, and the edge into another standard at the end of a citation. Downloads: the case's source file and its
// extracted subgraph (both through the forged-use-cases store), and the whole standard's two zips (the standard-downloads
// store, as every other standard offers them). Which disclosures are open is this tab's own state.

import { computed, ref, watch } from 'vue';
import { useForgedUseCaseStore } from '@/stores/forgedUseCaseStore';
import { useStandardDownloadsStore } from '@/stores/standardDownloadsStore';
import { useLoginStore } from '@/stores/loginStore';
import CaseStructureNode from './CaseStructureNode.vue';
import DownloadEntryButton from '@/components/standardsExplorer/DownloadEntryButton.vue';

const props = defineProps({
	caseStableId: { type: String, required: true },
});

const store = useForgedUseCaseStore();
const downloadsStore = useStandardDownloadsStore();
const loginStore = useLoginStore();
const ROOT_PATH = 'case';

const openPathSet = ref(new Set());
const outline = computed(() => (store.caseStructure && store.caseStructure.caseStableId === props.caseStableId ? store.caseStructure.outline : null));

// every disclosure path of the outline, in the same form CaseStructureNode builds them
const disclosurePathListOf = (outlineNode, nodePath) => [
	...(outlineNode.propertyList.length ? [`${nodePath}>@properties`] : []),
	...outlineNode.groupList.flatMap((oneGroup) => [`${nodePath}>${oneGroup.edgeType}`, ...oneGroup.childList.flatMap((oneChild, childIndex) => disclosurePathListOf(oneChild.childNode, `${nodePath}>${oneGroup.edgeType}#${childIndex}`))]),
];
// the first level open: the case's own groups show their members, everything under them starts closed
const openFirstLevel = () => {
	openPathSet.value = new Set(outline.value ? outline.value.groupList.map((oneGroup) => `${ROOT_PATH}>${oneGroup.edgeType}`) : []);
};
const expandAll = () => {
	openPathSet.value = new Set(outline.value ? disclosurePathListOf(outline.value, ROOT_PATH) : []);
};
const collapseAll = () => {
	openPathSet.value = new Set();
};
const togglePath = (pathText) => {
	const nextPathSet = new Set(openPathSet.value);
	if (nextPathSet.has(pathText)) nextPathSet.delete(pathText);
	else nextPathSet.add(pathText);
	openPathSet.value = nextPathSet;
};

watch(
	() => props.caseStableId,
	async (caseStableId) => {
		if (await store.fetchCaseStructure(caseStableId)) openFirstLevel();
	},
	{ immediate: true },
);

// the whole standard's downloads, as the golden's manifest lists them for the case's own standard. They are served to a
// signed-in person only (as on the Downloads page), so a visitor is told so instead of being shown a token refusal.
const isSignedIn = computed(() => Boolean(loginStore.authtoken));
watch(isSignedIn, (signedIn) => { if (signedIn) downloadsStore.loadManifest(); }, { immediate: true });
const standardEntryList = computed(() => {
	if (!outline.value) return [];
	return downloadsStore.standardKeyListOfFamily(outline.value.standardSource).flatMap((standardKey) => downloadsStore.entryListOfStandardKey(standardKey));
});
</script>

<template>
	<div data-testid="panel-structure">
		<v-alert v-if="store.caseStructureStatusMsg" type="warning" variant="tonal" class="mb-4" data-testid="structure-status">{{ store.caseStructureStatusMsg }}</v-alert>
		<v-progress-linear v-if="store.caseStructureLoading" indeterminate color="primary" class="mb-4" />

		<template v-if="outline">
			<v-card variant="outlined" class="pa-4 mb-4" data-testid="structure-explainer">
				<div class="text-subtitle-2 font-weight-bold mb-1">How a use case lives in the graph</div>
				<p class="text-body-2 mb-2">
					A use case is a small web of <strong>nodes</strong> joined by named <strong>edges</strong>. The case node points to its parts (actors,
					conditions, steps, data references) by edges such as <code>HAS_ACTOR</code> and <code>HAS_STEP</code>, and each step points to the data it
					reads and produces (<code>CONSUMES</code>, <code>PRODUCES</code>).
				</p>
				<p class="text-body-2 mb-0">
					A data reference that cites another standard carries a <code>DECLARED_CORRESPONDENCE</code> edge to that standard's own element: that is
					where the use case reaches CEDS or any other standard. Open a group to see its members; each line shows the edge it came by, then the node.
				</p>
				<div class="text-caption text-medium-emphasis mt-2" data-testid="structure-exclusion-note">
					Every node's own properties are shown except {{ store.caseStructure.excludedPropertyNameList.join(', ') }}: they are search machinery, not
					meaning. Another case is a link and a part already open above in the same branch is not opened again, so the outline never loops.
				</div>
			</v-card>

			<div class="d-flex flex-wrap align-center ga-2 mb-2" data-testid="structure-downloads">
				<v-btn size="small" variant="outlined" color="primary" prepend-icon="mdi-download" :loading="store.structureDownloadingName === 'source'" data-testid="structure-download-source" @click="store.downloadCaseSourceFile(caseStableId)">Source JSON</v-btn>
				<v-btn size="small" variant="outlined" color="primary" prepend-icon="mdi-download" data-testid="structure-download-extracted" @click="store.downloadExtractedDocument()">Extracted JSON</v-btn>
				<span class="text-caption text-medium-emphasis">
					the case's file as its authors wrote it ({{ store.caseStructure.sourceFileName }}), and its {{ store.caseStructure.nodeCount }} nodes and
					{{ store.caseStructure.edgeCount }} edges as the graph {{ store.caseStructure.graphName }} holds them
				</span>
			</div>
			<v-alert v-if="store.structureDownloadStatusMsg" type="warning" variant="tonal" density="compact" class="mb-2" data-testid="structure-download-status">{{ store.structureDownloadStatusMsg }}</v-alert>

			<div class="d-flex flex-wrap align-center ga-2 mb-4" data-testid="structure-standard-downloads">
				<span class="text-caption font-weight-bold">The whole standard:</span>
				<span v-if="!isSignedIn" class="text-caption text-medium-emphasis" data-testid="structure-standard-downloads-signin">its source and graph zips are on the Downloads page once you sign in, as for every standard</span>
				<DownloadEntryButton v-for="oneEntry in standardEntryList" :key="oneEntry.downloadId" :download-entry="oneEntry" />
				<span v-if="isSignedIn && downloadsStore.statusMsg" class="text-caption text-medium-emphasis" data-testid="structure-standard-downloads-status">{{ downloadsStore.statusMsg }}</span>
				<span v-if="downloadsStore.downloadStatusMsg" class="text-caption text-error">{{ downloadsStore.downloadStatusMsg }}</span>
			</div>

			<div class="d-flex align-center ga-2 mb-2">
				<span class="text-caption text-medium-emphasis">{{ store.caseStructure.citationCount }} data references, {{ store.caseStructure.resolvedCitationCount }} of them citing an element in the graph</span>
				<v-spacer />
				<v-btn size="x-small" variant="text" prepend-icon="mdi-unfold-more-horizontal" data-testid="structure-expand-all" @click="expandAll">Expand all</v-btn>
				<v-btn size="x-small" variant="text" prepend-icon="mdi-unfold-less-horizontal" data-testid="structure-collapse-all" @click="collapseAll">Collapse all</v-btn>
			</div>
			<div class="structure-outline" data-testid="structure-outline">
				<CaseStructureNode :outline-node="outline" :node-path="ROOT_PATH" :open-path-set="openPathSet" @toggle-path="togglePath" />
			</div>
		</template>
	</div>
</template>

<style scoped>
.structure-outline { overflow-x: auto; padding: 8px 4px; }
</style>
