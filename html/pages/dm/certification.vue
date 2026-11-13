<script setup>
// @concept: [[DataModelExplorer]]
// certification.vue — the Certification page (TQ 2026-11-08): the mapping-quality report for the graph this site serves, a
// history of every published report with its dates and graph id, each report's per-standard certificates, and downloads.
// Mainly a web page: the report is drawn from the generator's own blocks (QualityReportDocument.vue); downloads are offered.
//
// Which report is the live graph's is the SERVER'S answer (the catalog's liveReportFolderName, by the graph's content
// identity). When the live build has no report yet, the page says so and opens nothing on its own; an earlier report is one
// click away in the history. The report and certificate being read are in the URL (?report=<folder>&certificate=<stem>), so
// a history row or a certificate can be linked to.
// Public, like the downloads: "certificates for everyone".

import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQualityReportStore } from '@/stores/qualityReportStore';
import { shortIdentityOf, dayTextOf } from '@/components/qualityReport/qualityReportText';

const route = useRoute();
const router = useRouter();
const qualityReportStore = useQualityReportStore();

// ================================================================================
// WHAT IS BEING READ — from the URL, or the live graph's report when the URL names none

const catalog = computed(() => qualityReportStore.catalog);
const selectedFolderName = computed(() => (typeof route.query.report === 'string' && route.query.report ? route.query.report : catalog.value ? catalog.value.liveReportFolderName : null));
const selectedEntry = computed(() => (selectedFolderName.value ? qualityReportStore.catalogEntryOf(selectedFolderName.value) : null));
const selectedPage = computed(() => (selectedFolderName.value ? qualityReportStore.pageByFolderName[selectedFolderName.value] || null : null));
const selectedCertificateStem = computed(() => (typeof route.query.certificate === 'string' ? route.query.certificate : ''));
const selectedCertificate = computed(() => (selectedPage.value && selectedCertificateStem.value ? selectedPage.value.certificateList.find((oneCertificate) => oneCertificate.certificateStem === selectedCertificateStem.value) || null : null));
const shownDocument = computed(() => selectedCertificate.value || (selectedPage.value ? selectedPage.value.report : null));

const certificateOptionList = computed(() => (selectedPage.value ? selectedPage.value.certificateList.map((oneCertificate) => ({ title: oneCertificate.standardName, value: oneCertificate.certificateStem })) : []));

const downloadOptionList = computed(() =>
	selectedCertificate.value
		? [
				{ downloadName: 'certificateHtml', titleText: 'Certificate (HTML)' },
				{ downloadName: 'certificateMarkdown', titleText: 'Certificate (Markdown)' },
			]
		: [
				{ downloadName: 'reportHtml', titleText: 'Report (HTML)' },
				{ downloadName: 'reportMarkdown', titleText: 'Report (Markdown)' },
				{ downloadName: 'reportData', titleText: 'Report figures (JSON)' },
			],
);

// ================================================================================
// LOADING

const loadSelectedPage = () => {
	if (selectedFolderName.value && qualityReportStore.catalogEntryOf(selectedFolderName.value)) {
		qualityReportStore.loadPage(selectedFolderName.value);
	}
};

onMounted(async () => {
	await qualityReportStore.loadCatalog({ reload: true });
	loadSelectedPage();
});
watch(selectedFolderName, loadSelectedPage);

// ================================================================================
// NAVIGATION — the URL holds the choice

const openReport = (reportFolderName) => router.push({ path: route.path, query: { report: reportFolderName } });
const openCertificate = (certificateStem) => router.push({ path: route.path, query: { ...route.query, report: selectedFolderName.value, certificate: certificateStem || undefined } });

const downloadShown = (downloadName) => qualityReportStore.downloadFile({ reportFolderName: selectedFolderName.value, downloadName, certificateStem: selectedCertificate.value ? selectedCertificate.value.certificateStem : undefined });

const historyHeaderList = [
	{ title: 'Graph built', key: 'builtAt' },
	{ title: 'Graph', key: 'graphName' },
	{ title: 'Manifest', key: 'manifestLabel' },
	{ title: 'Graph id', key: 'graphIdentitySha256' },
	{ title: 'Rater data through', key: 'raterDataLastSavedAt' },
	{ title: '', key: 'status', sortable: false },
];
</script>

<template>
	<div class="certification-page">
		<SubPageNav model-value="certification" :tabs="[{ label: 'Certification', value: 'certification', to: '/dm/certification' }]">
			<template #start><DataModelsMenu /></template>
		</SubPageNav>

		<v-container class="certification-content" fluid>
			<v-progress-linear v-if="qualityReportStore.catalogLoading" indeterminate color="primary" class="mb-4" />
			<v-alert v-if="qualityReportStore.catalogStatusMsg" type="error" variant="tonal" class="mb-4" data-testid="certification-catalog-error">
				{{ qualityReportStore.catalogStatusMsg }}
			</v-alert>

			<template v-if="catalog">
				<!-- THE LIVE GRAPH -->
				<v-alert v-if="catalog.liveGraph.unidentifiedReason" type="warning" variant="tonal" class="mb-4" data-testid="certification-live-unidentified">
					The graph this site serves could not be identified, so no report can be called its own: {{ catalog.liveGraph.unidentifiedReason }}
				</v-alert>
				<v-alert v-else-if="!catalog.liveReportFolderName" type="info" variant="tonal" class="mb-4" data-testid="certification-no-live-report">
					No quality report for this build yet. The graph this site serves is <strong>{{ catalog.liveGraph.graphName }}</strong> (graph id <code :title="catalog.liveGraph.graphIdentitySha256">{{ shortIdentityOf(catalog.liveGraph.graphIdentitySha256) }}</code>). Earlier reports are listed below.
				</v-alert>

				<!-- HISTORY -->
				<v-card variant="outlined" class="mb-6">
					<v-card-title class="text-subtitle-1 font-weight-bold">Quality reports</v-card-title>
					<v-card-subtitle>One per graph build measured, newest build first. The live graph's report is marked.</v-card-subtitle>
					<v-data-table
						:headers="historyHeaderList"
						:items="qualityReportStore.reportList"
						item-value="folderName"
						density="compact"
						hide-default-footer
						:items-per-page="-1"
						class="certification-history"
						data-testid="certification-history"
						@click:row="(clickEvent, { item }) => openReport(item.folderName)"
					>
						<template #item.builtAt="{ item }">{{ dayTextOf(item.builtAt) }}</template>
						<template #item.graphIdentitySha256="{ item }"><code :title="item.graphIdentitySha256">{{ shortIdentityOf(item.graphIdentitySha256) }}</code></template>
						<template #item.raterDataLastSavedAt="{ item }">{{ dayTextOf(item.raterDataLastSavedAt) }}</template>
						<template #item.status="{ item }">
							<v-chip v-if="item.isLiveGraph" size="x-small" color="success" variant="flat" class="mr-1">Live graph</v-chip>
							<v-chip v-if="item.folderName === selectedFolderName" size="x-small" color="primary" variant="outlined">Showing</v-chip>
						</template>
						<template #no-data>No quality report has been published.</template>
					</v-data-table>
					<v-alert v-if="catalog.unreadableFolderList.length" type="warning" variant="tonal" density="compact" class="ma-3" data-testid="certification-unreadable">
						<div v-for="unreadableFolder in catalog.unreadableFolderList" :key="unreadableFolder.folderName">
							<strong>{{ unreadableFolder.folderName }}</strong> could not be read: {{ unreadableFolder.unreadableReason }}
						</div>
					</v-alert>
				</v-card>

				<!-- THE REPORT OR CERTIFICATE BEING READ -->
				<v-alert v-if="selectedFolderName && !selectedEntry" type="error" variant="tonal" class="mb-4">
					'{{ selectedFolderName }}' is not a published report. Choose one from the list above.
				</v-alert>
				<template v-if="selectedEntry">
					<div class="d-flex flex-wrap align-center ga-3 mb-4">
						<v-btn-toggle :model-value="selectedCertificate ? 'certificate' : 'report'" density="compact" variant="outlined" color="primary" mandatory>
							<v-btn value="report" size="small" prepend-icon="mdi-file-document-outline" @click="openCertificate('')">Report</v-btn>
							<v-btn value="certificate" size="small" prepend-icon="mdi-certificate-outline" :disabled="!certificateOptionList.length" @click="!selectedCertificate && certificateOptionList.length && openCertificate(certificateOptionList[0].value)">Certificates</v-btn>
						</v-btn-toggle>
						<v-select
							v-if="selectedCertificate"
							:model-value="selectedCertificate.certificateStem"
							:items="certificateOptionList"
							label="Standard"
							density="compact"
							variant="outlined"
							hide-details
							class="certification-standard-select"
							data-testid="certification-standard-select"
							@update:model-value="openCertificate"
						/>
						<v-spacer />
						<v-menu location="bottom end">
							<template #activator="{ props: activatorProps }">
								<v-btn v-bind="activatorProps" size="small" variant="tonal" prepend-icon="mdi-download" :loading="!!qualityReportStore.downloadingDownloadName" data-testid="certification-download">Download</v-btn>
							</template>
							<v-list density="compact">
								<v-list-item v-for="downloadOption in downloadOptionList" :key="downloadOption.downloadName" :title="downloadOption.titleText" @click="downloadShown(downloadOption.downloadName)" />
							</v-list>
						</v-menu>
					</div>
					<v-alert v-if="qualityReportStore.downloadStatusMsg" type="error" variant="tonal" density="compact" class="mb-4">{{ qualityReportStore.downloadStatusMsg }}</v-alert>
					<v-alert v-if="selectedCertificateStem && selectedPage && !selectedCertificate" type="error" variant="tonal" density="compact" class="mb-4">
						'{{ selectedCertificateStem }}' is not a certificate in this report.
					</v-alert>

					<v-progress-linear v-if="qualityReportStore.pageLoadingFolderName" indeterminate color="primary" class="mb-4" />
					<v-alert v-if="qualityReportStore.pageStatusMsg" type="error" variant="tonal" class="mb-4">{{ qualityReportStore.pageStatusMsg }}</v-alert>
					<v-alert v-if="!selectedEntry.isLiveGraph" type="info" variant="tonal" density="compact" class="mb-4" data-testid="certification-not-live">
						This report measured {{ selectedEntry.graphName }} (built {{ dayTextOf(selectedEntry.builtAt) }}), which is not the graph this site serves now.
					</v-alert>

					<QualityReportDocument v-if="shownDocument" :title-text="shownDocument.titleText" :block-list="shownDocument.blockList" />
				</template>
			</template>
		</v-container>
	</div>
</template>

<style scoped>
.certification-page {
	display: flex;
	flex-direction: column;
	min-height: calc(100vh - 64px);
}
.certification-content {
	max-width: 1100px;
	margin: 0;
	padding: 16px 24px 64px;
}
.certification-history :deep(tbody tr) {
	cursor: pointer;
}
.certification-standard-select {
	max-width: 360px;
	min-width: 240px;
}
</style>
