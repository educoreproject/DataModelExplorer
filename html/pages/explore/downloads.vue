<script setup>
// @concept: [[DataModelExplorer]]
// Explore → Downloads (WORKORDER-standardDownloads-101526 §3c).
//
// Every standard's two downloads for the golden graph this site serves: its source as the forge ingested it, and the
// standard written back out of the graph with its round-trip validation files. Grouped by family, then group, then
// version. The filters (family, group, standard) live in the URL query, ?family=PESC&group=…&standardKey=…, so a
// filtered view is a link to share, and a later restriction (one family, one group) is a link, not a code change.
// An entry that cannot be downloaded shows why. Beside each source, where it came from (WORKORDER-sourceUrls-101526):
// SourceUrlNote, worded by the relation the manifest names. This page is the only thing that reads or writes its query.
// ⟪educoreForge ML3.1c⟫ Below the standards: the gold's published mapping sets and hub cards (PublicationsSection).

import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStandardDownloadsStore } from '@/stores/standardDownloadsStore';
import { familyStyleOf } from '@/components/standardsExplorer/explorerVocabulary';

// public (TQ, 2026-10-30: "all public"): no sign-in middleware, as for the Use Cases page

const route = useRoute();
const router = useRouter();
const downloadsStore = useStandardDownloadsStore();

onMounted(() => downloadsStore.loadManifest());

// ================================================================================
// FILTERS — the URL query is the only copy

const FILTER_FIELD_NAME_LIST = ['family', 'group', 'standardKey'];
const queryValueOf = (fieldName) => (typeof route.query[fieldName] === 'string' && route.query[fieldName] !== '' ? route.query[fieldName] : null);
const activeFilter = computed(() => Object.fromEntries(FILTER_FIELD_NAME_LIST.map((fieldName) => [fieldName, queryValueOf(fieldName)])));

// choosing a family clears a group and standard it no longer holds; choosing a group clears a standard outside it
const setFilter = (fieldName, fieldValue) => {
	const nextFilter = { ...activeFilter.value, [fieldName]: fieldValue || null };
	if (fieldName === 'family') {
		nextFilter.group = null;
		nextFilter.standardKey = null;
	}
	if (fieldName === 'group') nextFilter.standardKey = null;
	router.push({ path: route.path, query: Object.fromEntries(Object.entries(nextFilter).filter(([, oneValue]) => oneValue)) });
};
const clearFilters = () => router.push({ path: route.path, query: {} });

const entryMatches = (oneEntry, filter) => FILTER_FIELD_NAME_LIST.every((fieldName) => !filter[fieldName] || oneEntry[fieldName] === filter[fieldName]);

const familyOptionList = computed(() =>
	[...new Set(downloadsStore.entryList.map((oneEntry) => oneEntry.family))].sort().map((familyName) => ({ title: familyStyleOf(familyName).displayName, value: familyName })),
);
const groupOptionList = computed(() =>
	[...new Set(downloadsStore.entryList.filter((oneEntry) => entryMatches(oneEntry, { family: activeFilter.value.family })).map((oneEntry) => oneEntry.group))].sort().map((groupName) => ({ title: groupName, value: groupName })),
);
const standardOptionList = computed(() => {
	const seenStandardKeySet = new Set();
	return downloadsStore.entryList
		.filter((oneEntry) => entryMatches(oneEntry, { family: activeFilter.value.family, group: activeFilter.value.group }))
		.filter((oneEntry) => !seenStandardKeySet.has(oneEntry.standardKey) && seenStandardKeySet.add(oneEntry.standardKey))
		.map((oneEntry) => ({ title: `${oneEntry.group} ${oneEntry.version}`, value: oneEntry.standardKey }))
		.sort((left, right) => left.title.localeCompare(right.title, undefined, { numeric: true }));
});

// a filter value the manifest does not hold is said plainly, never quietly dropped
const unknownFilterList = computed(() => {
	if (!downloadsStore.manifest) return [];
	return FILTER_FIELD_NAME_LIST.filter((fieldName) => activeFilter.value[fieldName] && !downloadsStore.entryList.some((oneEntry) => oneEntry[fieldName] === activeFilter.value[fieldName])).map((fieldName) => `${fieldName} '${activeFilter.value[fieldName]}'`);
});

// ================================================================================
// THE TABLE — family, then group, then one row per standard (version) holding its two entries

const familyGroupList = computed(() => {
	const familyByName = {};
	downloadsStore.entryList
		.filter((oneEntry) => entryMatches(oneEntry, activeFilter.value))
		.forEach((oneEntry) => {
			const familyGroup = (familyByName[oneEntry.family] ||= { familyName: oneEntry.family, displayName: familyStyleOf(oneEntry.family).displayName, color: familyStyleOf(oneEntry.family).color, groupByName: {} });
			const groupRow = (familyGroup.groupByName[oneEntry.group] ||= { groupName: oneEntry.group, standardByKey: {} });
			const standardRow = (groupRow.standardByKey[oneEntry.standardKey] ||= { standardKey: oneEntry.standardKey, standardName: oneEntry.standardName, version: oneEntry.version, entryByFacet: {} });
			standardRow.entryByFacet[oneEntry.facet] = oneEntry;
		});
	const byText = (leftText, rightText) => String(leftText).localeCompare(String(rightText), undefined, { numeric: true });
	return Object.values(familyByName)
		.sort((left, right) => byText(left.displayName, right.displayName))
		.map((familyGroup) => ({
			...familyGroup,
			groupList: Object.values(familyGroup.groupByName)
				.sort((left, right) => byText(left.groupName, right.groupName))
				.map((groupRow) => ({ ...groupRow, standardList: Object.values(groupRow.standardByKey).sort((left, right) => byText(right.version, left.version)) })),
		}));
});

const roundTripTextOf = (roundTrip) => (roundTrip ? `invented ${roundTrip.inventedTotal} · lost ${roundTrip.lostTotal} · content gaps ${roundTrip.contentGapTotal} · omitted by declaration ${roundTrip.explicitlyOmittedTotal}` : '');
const shareUrlText = computed(() => (typeof window === 'undefined' ? route.fullPath : `${window.location.origin}${route.fullPath}`));
</script>

<template>
	<div class="downloads-page" data-testid="downloads-page">
		<div class="downloads-heading">
			<h1 class="downloads-title">Downloads</h1>
			<p class="downloads-intro">
				For each standard: its <strong>source</strong>, exactly as it was taken in, and the standard <strong>from the graph (experimental)</strong>, written back out of the graph with the files that check it. The check compares the two as statements: when its round trip is clean they are semantically equal, which is not a claim that the files match byte for byte. Each zip's README says what was compared.
				Beside each source is where it came from, worded by how the publisher's file relates to ours: <em>downloaded from</em> (the same bytes), <em>published on</em> (a publisher's page whose link serves the same bytes), <em>re-published</em> (the publisher now serves a changed file) or <em>derived from</em> (ours was made from it).
			</p>
			<p v-if="downloadsStore.manifest" class="downloads-stamp" data-testid="downloads-stamp">
				Graph <code>{{ downloadsStore.manifest.graphName }}</code> · generated {{ downloadsStore.manifest.generatedAt }} · graph contract <code>{{ downloadsStore.manifest.graphContractSha256.slice(0, 12) }}</code>
			</p>
		</div>

		<div class="downloads-filters" data-testid="downloads-filters">
			<v-select :model-value="activeFilter.family" :items="familyOptionList" label="Family" clearable density="compact" variant="outlined" hide-details data-testid="filter-family" @update:model-value="(chosenValue) => setFilter('family', chosenValue)" />
			<v-select :model-value="activeFilter.group" :items="groupOptionList" label="Group" clearable density="compact" variant="outlined" hide-details data-testid="filter-group" @update:model-value="(chosenValue) => setFilter('group', chosenValue)" />
			<v-select :model-value="activeFilter.standardKey" :items="standardOptionList" label="Standard" clearable density="compact" variant="outlined" hide-details data-testid="filter-standard" @update:model-value="(chosenValue) => setFilter('standardKey', chosenValue)" />
			<v-btn variant="text" color="primary" :disabled="!Object.values(activeFilter).some(Boolean)" data-testid="filter-clear" @click="clearFilters">Show all</v-btn>
		</div>
		<p class="downloads-share">Link to this view: <code data-testid="downloads-share-url">{{ shareUrlText }}</code></p>

		<v-progress-linear v-if="downloadsStore.manifestLoading" indeterminate color="primary" />
		<v-alert v-else-if="downloadsStore.statusMsg" type="error" variant="tonal" data-testid="downloads-error">The downloads could not be read: {{ downloadsStore.statusMsg }}</v-alert>
		<template v-else-if="downloadsStore.manifest">
			<v-alert v-if="unknownFilterList.length" type="warning" variant="tonal" density="compact" class="mb-3" data-testid="downloads-unknown-filter">No download has {{ unknownFilterList.join(' or ') }}.</v-alert>
			<v-alert v-if="downloadsStore.downloadStatusMsg" type="error" variant="tonal" density="compact" class="mb-3" data-testid="downloads-download-error">{{ downloadsStore.downloadStatusMsg }}</v-alert>
			<p v-if="familyGroupList.length === 0 && !unknownFilterList.length" class="downloads-empty" data-testid="downloads-empty">Nothing matches these filters.</p>

			<section v-for="familyGroup in familyGroupList" :key="familyGroup.familyName" class="downloads-family" :data-testid="`downloads-family-${familyGroup.familyName}`">
				<h2 class="downloads-family-name" :style="{ borderColor: familyGroup.color }">{{ familyGroup.displayName }}</h2>
				<table class="downloads-table">
					<colgroup><col class="downloads-col-group" /><col class="downloads-col-version" /><col class="downloads-col-entry" /><col class="downloads-col-entry" /><col /></colgroup>
					<thead>
						<tr>
							<th scope="col">Group</th>
							<th scope="col">Version</th>
							<th scope="col" data-testid="downloads-column-source">Source</th>
							<th scope="col" data-testid="downloads-column-graph">From the graph (experimental)</th>
							<th scope="col">Round trip</th>
						</tr>
					</thead>
					<tbody>
						<template v-for="groupRow in familyGroup.groupList" :key="groupRow.groupName">
							<tr v-for="(standardRow, standardIndex) in groupRow.standardList" :key="standardRow.standardKey" :data-testid="`downloads-row-${standardRow.standardKey}`">
								<th v-if="standardIndex === 0" scope="rowgroup" :rowspan="groupRow.standardList.length" class="downloads-group">{{ groupRow.groupName }}</th>
								<td class="downloads-version">{{ standardRow.version }}</td>
								<td>
									<StandardsExplorerDownloadEntryButton v-if="standardRow.entryByFacet.source" :download-entry="standardRow.entryByFacet.source" />
									<StandardsExplorerSourceUrlNote v-if="standardRow.entryByFacet.source" :download-entry="standardRow.entryByFacet.source" class="downloads-source-url" />
								</td>
								<td><StandardsExplorerDownloadEntryButton v-if="standardRow.entryByFacet.graph" :download-entry="standardRow.entryByFacet.graph" /></td>
								<td class="downloads-round-trip" :data-testid="`downloads-round-trip-${standardRow.standardKey}`">{{ roundTripTextOf(standardRow.entryByFacet.graph && standardRow.entryByFacet.graph.roundTrip) }}</td>
							</tr>
						</template>
					</tbody>
				</table>
			</section>
		</template>

		<StandardsExplorerPublicationsSection />
	</div>
</template>

<style scoped>
.downloads-page {
	max-width: 1400px;
	margin: 0 auto;
	padding: 24px clamp(16px, 3vw, 40px) 48px;
	color: #111827;
}
.downloads-title {
	margin: 0;
	font-family: 'DM Serif Display', Georgia, serif;
	font-weight: 400;
	font-size: 34px;
	color: #072a6c;
}
.downloads-intro {
	margin: 6px 0 0;
	max-width: 90ch;
	font-size: 15px;
	line-height: 1.5;
	color: #4b5563;
}
.downloads-stamp,
.downloads-share {
	margin: 8px 0 0;
	font-size: 13px;
	color: #6b7280;
	overflow-wrap: anywhere;
}
.downloads-filters {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
	margin-top: 20px;
}
.downloads-filters > .v-select {
	flex: 1 1 220px;
	max-width: 340px;
}
.downloads-empty {
	color: #4b5563;
}
.downloads-family {
	margin-top: 28px;
	background: #ffffff;
	border: 1px solid #e3e7ef;
	border-radius: 12px;
	padding: 16px;
	overflow-x: auto;
}
.downloads-family-name {
	margin: 0 0 12px;
	padding-left: 10px;
	border-left: 5px solid;
	font-size: 22px;
	font-weight: 700;
	color: #111827;
}
.downloads-table {
	width: 100%;
	min-width: 860px;
	table-layout: fixed;
	border-collapse: collapse;
	font-size: 14px;
}
/* the same column widths in every family's table, so the families line up */
.downloads-col-group {
	width: 20%;
}
.downloads-col-version {
	width: 13%;
}
.downloads-col-entry {
	width: 22%;
}
.downloads-table th,
.downloads-table td {
	text-align: left;
	vertical-align: top;
	padding: 10px 12px;
	border-top: 1px solid #eef1f6;
}
.downloads-table thead th {
	border-top: none;
	font-size: 12px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
.downloads-group {
	font-weight: 700;
	color: #072a6c;
}
.downloads-version {
	overflow-wrap: anywhere;
}
.downloads-source-url {
	margin-top: 6px;
}
.downloads-round-trip {
	font-size: 13px;
	color: #4b5563;
}
</style>
