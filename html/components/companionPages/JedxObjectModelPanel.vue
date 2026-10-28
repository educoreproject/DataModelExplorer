<script setup>
// The JEDx page's Object model panel (SPEC-companionPages-102826): for developers, the way to HR Open's JEDx model.
//   - Where HR Open publishes it: the JEDx source entry of this golden's downloads manifest, with the address the forge
//     recorded (SourceUrlNote), and the downloads themselves. Nothing here types in a publisher's address.
//   - The model in this graph: the JEDx root in the Standards Explorer, and the JEDx objects (schemas) the dictionary's
//     HR Open paths land on in this compile, each opening in the explorer.

import { computed, onMounted } from 'vue';
import { useStandardDownloadsStore } from '@/stores/standardDownloadsStore';
import { pathTextOf } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	payload: { type: Object, required: true },
});

const JEDX_STANDARD_KEY = 'jedx';
const JEDX_ROOT_PATH_STABLE_ID_LIST = ['families:all', 'family:JEDx', 'jedx:root'];

const downloadsStore = useStandardDownloadsStore();
onMounted(() => downloadsStore.loadManifest());

const jedxEntryList = computed(() => downloadsStore.entryListOfStandardKey(JEDX_STANDARD_KEY));
const jedxSourceEntry = computed(() => jedxEntryList.value.find((downloadEntry) => downloadEntry.facet === 'source') || null);

const explorerRootLink = { path: '/explore/graphicModelExplorer', query: { path: pathTextOf(JEDX_ROOT_PATH_STABLE_ID_LIST) } };

const landedSchemaList = computed(() => {
	const elementCountBySchemaName = {};
	props.payload.elementList
		.filter((dictionaryElement) => dictionaryElement.jedxSchemaName)
		.forEach((dictionaryElement) => {
			elementCountBySchemaName[dictionaryElement.jedxSchemaName] = (elementCountBySchemaName[dictionaryElement.jedxSchemaName] || 0) + 1;
		});
	return Object.entries(elementCountBySchemaName)
		.map(([jedxSchemaName, elementCount]) => ({ jedxSchemaName, elementCount, explorerLink: { path: '/explore/graphicModelExplorer', query: { path: pathTextOf([...JEDX_ROOT_PATH_STABLE_ID_LIST, `jedx:${jedxSchemaName}`]) } } }))
		.sort((left, right) => right.elementCount - left.elementCount || left.jedxSchemaName.localeCompare(right.jedxSchemaName));
});
</script>

<template>
	<div class="object-model-panel">
		<h3 class="object-model-subhead">JEDx {{ payload.jedxVersion }} as HR Open publishes it</h3>
		<p v-if="downloadsStore.manifestLoading" class="object-model-note">Reading the downloads manifest…</p>
		<p v-else-if="downloadsStore.statusMsg" class="object-model-error" data-testid="object-model-manifest-error">The downloads manifest could not be read: {{ downloadsStore.statusMsg }}</p>
		<p v-else-if="!jedxEntryList.length" class="object-model-note" data-testid="object-model-no-entry">This golden's downloads manifest has no JEDx entry.</p>
		<template v-else>
			<StandardsExplorerSourceUrlNote v-if="jedxSourceEntry" :download-entry="jedxSourceEntry" class="object-model-source" />
			<div class="object-model-downloads" data-testid="object-model-downloads">
				<StandardsExplorerDownloadEntryButton v-for="downloadEntry in jedxEntryList" :key="downloadEntry.facet" :download-entry="downloadEntry" />
			</div>
		</template>

		<h3 class="object-model-subhead">The model in this graph</h3>
		<p class="object-model-note">
			<NuxtLink :to="explorerRootLink" data-testid="object-model-explorer-root">Open JEDx in the Standards Explorer ›</NuxtLink>
			Below, the JEDx objects the dictionary's HR Open paths reach, with how many dictionary elements land on each.
		</p>
		<ul class="object-model-schema-list" data-testid="object-model-schemas">
			<li v-for="landedSchema in landedSchemaList" :key="landedSchema.jedxSchemaName">
				<NuxtLink :to="landedSchema.explorerLink"><code>{{ landedSchema.jedxSchemaName }}</code></NuxtLink> <span class="object-model-count">{{ landedSchema.elementCount }}</span>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.object-model-subhead {
	margin: 12px 0 6px;
	font-size: 16px;
	font-weight: 700;
	color: #072a6c;
}
.object-model-note {
	margin: 0 0 8px;
	font-size: 14px;
	color: #4b5563;
}
.object-model-error {
	color: #9b1c1c;
}
.object-model-source {
	margin-bottom: 8px;
}
.object-model-downloads {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}
.object-model-schema-list {
	margin: 0;
	padding: 0;
	list-style: none;
	columns: 3 220px;
	column-gap: 24px;
	font-size: 13.5px;
}
.object-model-count {
	color: #6b7280;
}
</style>
