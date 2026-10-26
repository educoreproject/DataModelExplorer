<script setup>
// @concept: [[DataModelExplorer]]
// PUBLICATIONS SECTION (educoreForge mappingLayers ML3.1 Part C): on the Downloads page, the gold's published MAPPING SETS (one
// SSSOM set per layer version, with each layer's registry, the site registry and a JSON-LD context per standard) and the CARD
// DOWNLOAD per hub release (CSV and JSON-LD). Everything shown is read from the publication listing the server proved the
// golden's own; nothing is composed here. A file is fetched through the store, which checks its sha256 before saving it.

import { computed, onMounted } from 'vue';
import { useStandardDownloadsStore } from '@/stores/standardDownloadsStore';

const downloadsStore = useStandardDownloadsStore();

onMounted(() => downloadsStore.loadPublication());

const byText = (leftText, rightText) => String(leftText).localeCompare(String(rightText), undefined, { numeric: true });
const entryOfKind = (kindName) => downloadsStore.publicationEntryList.filter((oneEntry) => oneEntry.kind === kindName);

// one row per layer: its registry, then one row per version holding its set and its contexts
const layerList = computed(() => {
	const layerByKey = {};
	downloadsStore.publicationEntryList
		.filter((oneEntry) => oneEntry.layerKey)
		.forEach((oneEntry) => {
			const layerRow = (layerByKey[oneEntry.layerKey] ||= { layerKey: oneEntry.layerKey, layerTitle: oneEntry.layerTitle, registryEntry: null, versionByTag: {} });
			if (oneEntry.kind === 'layerRegistry') {
				layerRow.registryEntry = oneEntry;
				return;
			}
			const versionRow = (layerRow.versionByTag[oneEntry.versionTag] ||= { versionTag: oneEntry.versionTag, registrationStatus: oneEntry.registrationStatus, setEntry: null, contextEntryList: [] });
			if (oneEntry.kind === 'mappingSet') versionRow.setEntry = oneEntry;
			if (oneEntry.kind === 'mappingContext') versionRow.contextEntryList.push(oneEntry);
		});
	return Object.values(layerByKey)
		.sort((left, right) => byText(left.layerKey, right.layerKey))
		.map((layerRow) => ({ ...layerRow, versionList: Object.values(layerRow.versionByTag).sort((left, right) => byText(left.versionTag, right.versionTag)) }));
});
const siteRegistryEntry = computed(() => entryOfKind('siteRegistry')[0] || null);

// one row per hub release, holding its CSV and its JSON-LD
const hubReleaseList = computed(() => {
	const releaseByName = {};
	downloadsStore.publicationEntryList
		.filter((oneEntry) => oneEntry.hubSegment)
		.forEach((oneEntry) => {
			const releaseRow = (releaseByName[`${oneEntry.hubSegment}/${oneEntry.hubReleaseSegment}`] ||= { releaseName: `${oneEntry.hubSegment}/${oneEntry.hubReleaseSegment}`, hubName: oneEntry.hubName, hubVersion: oneEntry.hubVersion, cardCount: oneEntry.cardCount, entryByKind: {} });
			releaseRow.entryByKind[oneEntry.kind] = oneEntry;
		});
	return Object.values(releaseByName).sort((left, right) => byText(left.releaseName, right.releaseName));
});

const sizeTextOf = (byteSize) => (byteSize >= 1048576 ? `${(byteSize / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(byteSize / 1024))} KB`);
</script>

<template>
	<section class="publications-section" data-testid="publications-section">
		<h2 class="publications-title">Mapping sets and hub cards</h2>
		<p class="publications-intro">
			The mappings in this graph, as SSSOM mapping sets: one set per mapping-layer version, each with its layer's registry and a JSON-LD context per standard; and every hub's cards (its meanings), one file per hub release. Mapping is not distribution: the sets name every standard's elements, including standards whose own files are held above.
		</p>
		<v-progress-linear v-if="downloadsStore.publicationLoading" indeterminate color="primary" />
		<v-alert v-else-if="downloadsStore.publicationStatusMsg" type="info" variant="tonal" density="compact" data-testid="publications-status">{{ downloadsStore.publicationStatusMsg }}</v-alert>
		<template v-else-if="downloadsStore.publication">
			<p class="publications-stamp" data-testid="publications-stamp">
				Manifest <code>{{ downloadsStore.publication.publicLabel }}</code> (<code>{{ downloadsStore.publication.manifestRefId.slice(0, 12) }}</code>) · published {{ downloadsStore.publication.generatedAt }}
				<v-btn v-if="siteRegistryEntry" size="small" variant="text" color="primary" :loading="downloadsStore.downloadingDownloadId === siteRegistryEntry.downloadId" data-testid="publications-site-registry" @click="downloadsStore.downloadPublicationEntry(siteRegistryEntry)">Site registry ({{ sizeTextOf(siteRegistryEntry.byteSize) }})</v-btn>
			</p>

			<h3 class="publications-subtitle">Mapping sets</h3>
			<table class="publications-table" data-testid="publications-mapping-sets">
				<thead>
					<tr><th scope="col">Layer</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Set</th><th scope="col">Contexts</th></tr>
				</thead>
				<tbody>
					<template v-for="layerRow in layerList" :key="layerRow.layerKey">
						<tr v-for="(versionRow, versionIndex) in layerRow.versionList" :key="versionRow.versionTag" :data-testid="`publications-layer-${layerRow.layerKey}-${versionRow.versionTag}`">
							<th v-if="versionIndex === 0" scope="rowgroup" :rowspan="layerRow.versionList.length" class="publications-layer">
								{{ layerRow.layerTitle }}
								<v-btn v-if="layerRow.registryEntry" size="x-small" variant="text" color="primary" :loading="downloadsStore.downloadingDownloadId === layerRow.registryEntry.downloadId" :data-testid="`publications-registry-${layerRow.layerKey}`" @click="downloadsStore.downloadPublicationEntry(layerRow.registryEntry)">registry</v-btn>
							</th>
							<td><code>{{ versionRow.versionTag }}</code></td>
							<td>{{ versionRow.registrationStatus }}</td>
							<td>
								<v-btn v-if="versionRow.setEntry" size="small" variant="tonal" color="primary" :loading="downloadsStore.downloadingDownloadId === versionRow.setEntry.downloadId" :data-testid="`publications-set-${layerRow.layerKey}-${versionRow.versionTag}`" @click="downloadsStore.downloadPublicationEntry(versionRow.setEntry)">SSSOM ({{ sizeTextOf(versionRow.setEntry.byteSize) }})</v-btn>
							</td>
							<td>
								<v-btn v-for="contextEntry in versionRow.contextEntryList" :key="contextEntry.downloadId" size="x-small" variant="text" color="primary" :loading="downloadsStore.downloadingDownloadId === contextEntry.downloadId" @click="downloadsStore.downloadPublicationEntry(contextEntry)">{{ contextEntry.standardKey }}</v-btn>
							</td>
						</tr>
					</template>
				</tbody>
			</table>

			<h3 class="publications-subtitle">Hub cards</h3>
			<table class="publications-table" data-testid="publications-hub-cards">
				<thead>
					<tr><th scope="col">Hub</th><th scope="col">Release</th><th scope="col">Cards</th><th scope="col">Download</th></tr>
				</thead>
				<tbody>
					<tr v-for="releaseRow in hubReleaseList" :key="releaseRow.releaseName" :data-testid="`publications-hub-${releaseRow.releaseName}`">
						<th scope="row">{{ releaseRow.hubName }}</th>
						<td>{{ releaseRow.hubVersion }}</td>
						<td>{{ releaseRow.cardCount }}</td>
						<td>
							<v-btn v-for="(cardEntry, kindName) in releaseRow.entryByKind" :key="kindName" size="small" variant="tonal" color="primary" class="mr-2" :loading="downloadsStore.downloadingDownloadId === cardEntry.downloadId" @click="downloadsStore.downloadPublicationEntry(cardEntry)">{{ kindName === 'hubCardsCsv' ? 'CSV' : 'JSON-LD' }} ({{ sizeTextOf(cardEntry.byteSize) }})</v-btn>
						</td>
					</tr>
				</tbody>
			</table>
		</template>
	</section>
</template>

<style scoped>
.publications-section {
	margin-top: 32px;
}
.publications-title {
	margin: 0 0 6px;
	font-family: 'DM Serif Display', Georgia, serif;
	font-weight: 400;
	font-size: 26px;
	color: #072a6c;
}
.publications-subtitle {
	margin: 18px 0 6px;
	font-size: 17px;
	color: #072a6c;
}
.publications-intro,
.publications-stamp {
	margin: 0 0 8px;
	max-width: 90ch;
	font-size: 14px;
	line-height: 1.5;
	color: #4b5563;
}
.publications-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 14px;
}
.publications-table th,
.publications-table td {
	padding: 6px 8px;
	border-bottom: 1px solid #e5e7eb;
	text-align: left;
	vertical-align: top;
}
.publications-layer {
	font-weight: 600;
}
</style>
