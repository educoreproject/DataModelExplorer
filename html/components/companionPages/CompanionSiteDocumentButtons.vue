<script setup>
// The EDUcore papers as download buttons on the DME welcome panel (SPEC-companionPages-102826, "Site documents", GS.2):
// one button per paper in educorePaperList that has a current source, showing its title and version. A paper with no
// current source shows no button, and with none at all the component renders nothing; a failed list read is said in one
// line rather than left blank.
import { computed, onMounted } from 'vue';
import { useCompanionSiteDocumentStore } from '@/stores/companionSiteDocumentStore';
import { useCompanionPageStore } from '@/stores/companionPageStore';
import { EDUCORE_PAPER_PAGE_SLUG, educorePaperList } from '@/data/educorePaperList';

const siteDocumentStore = useCompanionSiteDocumentStore();
const companionPageStore = useCompanionPageStore();

onMounted(() => siteDocumentStore.loadSourceList(EDUCORE_PAPER_PAGE_SLUG));

const VERSION_PATTERN = /^Version ([^;]+);/;

const paperButtonList = computed(() => {
	const currentSourceList = siteDocumentStore.sourceListByPageSlug[EDUCORE_PAPER_PAGE_SLUG] || [];
	return educorePaperList
		.map((paperEntry) => ({ ...paperEntry, sourceRecord: currentSourceList.find((sourceRecord) => sourceRecord.sourceRole === paperEntry.sourceRole) || null }))
		.filter((paperButton) => paperButton.sourceRecord)
		.map((paperButton) => ({ ...paperButton, versionLabel: (String(paperButton.sourceRecord.originNote || '').match(VERSION_PATTERN) || [])[1] || '' }));
});
const listErrorText = computed(() => siteDocumentStore.statusMsgByPageSlug[EDUCORE_PAPER_PAGE_SLUG] || '');
</script>

<template>
	<div v-if="paperButtonList.length || listErrorText" class="paper-buttons" data-testid="educore-paper-buttons">
		<v-btn v-for="paperButton in paperButtonList" :key="paperButton.sourceRole" variant="outlined" color="primary" prepend-icon="mdi-file-pdf-box" class="paper-button" :data-testid="`educore-paper-${paperButton.sourceRole}`" @click="companionPageStore.downloadSource(paperButton.sourceRecord)">
			<span class="paper-button-label">{{ paperButton.paperTitle }}<span class="paper-button-version">{{ paperButton.versionLabel ? `${paperButton.versionLabel} · ` : '' }}{{ paperButton.sourceRecord.documentDate }}</span></span>
		</v-btn>
		<p v-if="listErrorText" class="paper-note" data-testid="educore-paper-error">The EDUcore papers could not be listed: {{ listErrorText }}</p>
		<p v-if="companionPageStore.downloadStatusMsg" class="paper-note" data-testid="educore-paper-download-error">{{ companionPageStore.downloadStatusMsg }}</p>
	</div>
</template>

<style scoped>
.paper-buttons {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	margin: 0 0 0.8em;
}
.paper-button {
	height: auto !important;
	padding: 6px 14px;
	text-transform: none;
	letter-spacing: normal;
}
.paper-button-label {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	font-weight: 600;
}
.paper-button-version {
	font-weight: 400;
	font-size: 12px;
	color: #6b7280;
}
.paper-note {
	flex-basis: 100%;
	margin: 0;
	font-size: 13px;
	color: #9b1c1c;
}
</style>
