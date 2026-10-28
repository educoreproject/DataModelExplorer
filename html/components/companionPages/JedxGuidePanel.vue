<script setup>
// The JEDx page's Guide panel (SPEC-companionPages-102826): a summary of the Guide and a download of the current Guide
// file. The summary (data/jedxCompanionGuideSummary.ts) names the sha256 of the file it was written from; when the
// current guide source is another file, the panel says the summary was written for an earlier version.

import { computed } from 'vue';
import { jedxCompanionGuideSummary } from '@/data/jedxCompanionGuideSummary';
import { useCompanionPageStore } from '@/stores/companionPageStore';

const props = defineProps({
	payload: { type: Object, required: true },
});

const companionPageStore = useCompanionPageStore();

const guideSource = computed(() => props.payload.sourceList.find((sourceRecord) => sourceRecord.sourceRole === 'guide') || null);
const isSummaryOfCurrentGuide = computed(() => Boolean(guideSource.value) && guideSource.value.sha256 === jedxCompanionGuideSummary.writtenForSha256);
</script>

<template>
	<div class="guide-panel">
		<p v-if="!guideSource" class="guide-absent" data-testid="guide-absent">No Guide is on file for this page.</p>
		<template v-else>
			<v-alert v-if="!isSummaryOfCurrentGuide" type="info" variant="tonal" density="compact" class="mb-3" data-testid="guide-summary-earlier">
				This summary was written for an earlier version of the Guide ({{ jedxCompanionGuideSummary.writtenForFileName }}). The current file is {{ guideSource.fileName }}, dated {{ guideSource.documentDate }}.
			</v-alert>
			<p class="guide-meta">{{ jedxCompanionGuideSummary.publisherText }} · the document is marked <strong>{{ jedxCompanionGuideSummary.markingText }}</strong></p>
			<p v-for="(summaryParagraph, paragraphIndex) in jedxCompanionGuideSummary.summaryParagraphList" :key="paragraphIndex" class="guide-paragraph">{{ summaryParagraph }}</p>
			<p class="guide-paragraph"><strong>What is in it:</strong></p>
			<ul class="guide-section-list">
				<li v-for="sectionTitle in jedxCompanionGuideSummary.sectionTitleList" :key="sectionTitle">{{ sectionTitle }}</li>
			</ul>
			<div class="guide-download">
				<v-btn color="primary" variant="tonal" prepend-icon="mdi-download" data-testid="guide-download" @click="companionPageStore.downloadSource(guideSource)">Download the Guide</v-btn>
				<span class="guide-file">{{ guideSource.fileName }} · dated {{ guideSource.documentDate }} · {{ guideSource.originNote }}</span>
			</div>
			<p v-if="companionPageStore.downloadStatusMsg" class="guide-error" data-testid="guide-download-error">{{ companionPageStore.downloadStatusMsg }}</p>
		</template>
	</div>
</template>

<style scoped>
.guide-meta {
	margin: 0 0 8px;
	font-size: 13px;
	color: #6b7280;
}
.guide-paragraph {
	margin: 0 0 8px;
	max-width: 95ch;
	font-size: 14.5px;
	line-height: 1.5;
}
.guide-section-list {
	margin: 0 0 12px 1.4em;
	font-size: 14px;
}
.guide-download {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
}
.guide-file {
	font-size: 12.5px;
	color: #6b7280;
	max-width: 90ch;
}
.guide-error,
.guide-absent {
	margin: 8px 0 0;
	color: #9b1c1c;
}
</style>
