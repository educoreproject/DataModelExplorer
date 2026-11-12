<script setup>
// Rosetta — paste your fields and ask for a judged draft: open to anyone, signed in or not (rosettaMeanings R3). Every word this page shows that is not the
// service's own answer comes from rosettaVocabulary (TQ's rule, no magic strings). Candidates are no longer shown here (R1); the API and MCP keep them.
//
// A RATIONALE CAN QUOTE A STRANGER'S TEXT, AND SO CAN A FIELD NAME, AND A PROMPT HOLDS BOTH. Everything from an answer is shown by {{ }}, which escapes it. This page
// must never use v-html: a gate (rosetta-page.test.js) reads this file and fails if it does.
// ⟪rosettaReportLegible⟫ the Report tab says what happened, field by field, from rosettaReportBlocks (the summary stays, below it); a job that is open shows a
// progress indicator above the tabs on every tab; a job that ends done says to open the Report tab, which is marked until opened; the button reads Submit the
// Request while the page's reading of the text is up for review (TQ).

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRosettaStore } from '@/stores/rosettaStore';
import { useLoginStore } from '@/stores/loginStore';
import { rosettaPageWords, wordsOf } from '@/components/rosetta/rosettaVocabulary';
import { fieldBlockListOf, countLineListOf, progressOf, askButtonWordsOf, jobStatusLineOf, spendLineOf, summaryResultTextOf, TAB_NAME, JOB_OPEN_STATUS_LIST } from '@/components/rosetta/rosettaReportBlocks';

const store = useRosettaStore();
const loginStore = useLoginStore();
const route = useRoute();
const router = useRouter();
const activeTab = ref(TAB_NAME.submit);
const isUndoConfirmOpen = ref(false);
const JOB_LINK_QUERY_NAME = 'job';

// a reading stops for review; only an answer moves the page on to its tab, and puts the job's link in the address bar
const askForDraft = () => store.submitJob().then((outcomeName) => {
	if (outcomeName === 'sent') {
		activeTab.value = TAB_NAME.job;
		router.replace({ query: { ...route.query, [JOB_LINK_QUERY_NAME]: store.jobRefId } });
	}
});
// Undo asks first only when the shown JSON was edited since it was read
const undo = () => {
	if (store.undoNeedsConfirmation) {
		isUndoConfirmOpen.value = true;
		return;
	}
	store.undoReview();
};
const confirmUndo = () => {
	isUndoConfirmOpen.value = false;
	store.undoReview();
};

const jobIsOpen = computed(() => store.jobStatus && JOB_OPEN_STATUS_LIST.includes(store.jobStatus.status));
const hubNameList = computed(() => (store.report ? store.report.job.hubList : []));
// the job's link is this page with the job named: an anonymous job is reached by it alone
const jobLink = computed(() => (store.jobRefId && import.meta.client ? `${window.location.origin}${route.path}?${JOB_LINK_QUERY_NAME}=${store.jobRefId}` : ''));
const copyJobLink = () => navigator.clipboard.writeText(jobLink.value);

// ⟪P7a⟫ a field's results are a list, each naming its hub
const resultFor = (oneField, hubName) => oneField.resultList.find((oneResult) => oneResult.hub === hubName);
const fieldBlockList = computed(() => (store.report ? fieldBlockListOf({ report: store.report, expressionByMeaningUri: store.expressionByMeaningUri }) : []));
const countLineList = computed(() => (store.report ? countLineListOf(store.report.counts) : []));
const progress = computed(() => progressOf({ jobStatus: store.jobStatus, busyStepName: store.busyStepName, isStatusCheckFailed: store.isStatusCheckFailed }));
const askButtonText = computed(() => askButtonWordsOf({ review: store.review }));
const openReport = () => {
	activeTab.value = TAB_NAME.report;
};
// the Report tab, once opened, is no longer new
watch(activeTab, (nextTabName) => {
	if (nextTabName === TAB_NAME.report) store.markReportSeen();
	store.rememberTab(nextTabName);
});

const downloadDraft = (hubName) => {
	const blob = new Blob([JSON.stringify(store.report.draftContextByHub[hubName], null, 2)], { type: 'application/ld+json;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `draft-${hubName}-${store.jobRefId.slice(0, 8)}.jsonld`;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const currentUserRefId = () => (loginStore.validUser ? loginStore.loggedInUser.refId || loginStore.loggedInUser.username : '');
onMounted(() => {
	store.forgetIfAnotherPerson(currentUserRefId());
	const linkedJobRefId = route.query[JOB_LINK_QUERY_NAME];
	if (typeof linkedJobRefId === 'string' && linkedJobRefId !== store.jobRefId) {
		activeTab.value = TAB_NAME.job;
		store.openJob(linkedJobRefId);
		return;
	}
	// ⟪review S1⟫ back on the same job (Back from Meanings): the tab it was on. The store remembers it; the address does not carry it, because a second
	// router.replace racing askForDraft's could drop the job from the link
	if (store.shownTabName) activeTab.value = store.shownTabName;
});
watch(currentUserRefId, (nextUserRefId) => {
	store.forgetIfAnotherPerson(nextUserRefId);
	activeTab.value = store.jobStatus ? activeTab.value : TAB_NAME.submit;
});
onUnmounted(() => store.stopPolling());
</script>

<template>
	<v-container>
		<h1 class="text-h4 mb-2">{{ rosettaPageWords.pageTitle }}</h1>
		<p class="mb-2">{{ rosettaPageWords.introText }}</p>
		<details class="mb-2" data-testid="rosetta-how-it-works">
			<summary>{{ rosettaPageWords.howItWorksHeading }}</summary>
			<ol class="mt-2 ml-6">
				<li v-for="oneStep in rosettaPageWords.howItWorksStepList" :key="oneStep.text">
					{{ oneStep.text }}
					<ol v-if="oneStep.subList.length" type="a" class="ml-6">
						<li v-for="oneSubStep in oneStep.subList" :key="oneSubStep">{{ oneSubStep }}</li>
					</ol>
				</li>
			</ol>
			<p class="mt-1">{{ rosettaPageWords.howItWorksPerHubText }}</p>
		</details>
		<p class="mb-4 text-caption" data-testid="rosetta-vendor-notice">{{ rosettaPageWords.vendorNoticeText }}</p>

		<v-alert v-if="store.refusal" type="warning" class="mb-4" closable data-testid="rosetta-refusal">
			{{ store.refusal.reason }}
		</v-alert>

		<div v-if="progress.isShown" class="mb-4" role="status" aria-live="polite" data-testid="rosetta-progress">
			<v-progress-linear indeterminate color="primary" class="mb-1" />
			<span class="text-body-2">{{ progress.progressText }}</span>
		</div>
		<v-alert v-if="progress.checkFailedText" type="warning" variant="tonal" class="mb-4" data-testid="rosetta-status-check-failed">
			<div class="d-flex flex-wrap align-center ga-2">
				<span class="flex-grow-1">{{ progress.checkFailedText }}</span>
				<v-btn size="small" variant="outlined" data-testid="rosetta-status-check-retry" @click="store.retryStatusCheck()">{{ rosettaPageWords.statusCheckRetryButton }}</v-btn>
			</div>
		</v-alert>
		<v-alert v-if="progress.endedText" type="warning" variant="tonal" class="mb-4" data-testid="rosetta-job-ended">{{ progress.endedText }}</v-alert>
		<v-alert v-if="store.reportUnseen" type="success" variant="tonal" class="mb-4" data-testid="rosetta-report-ready">
			<div class="d-flex flex-wrap align-center ga-2">
				<span class="flex-grow-1">{{ rosettaPageWords.reportReadyText }}</span>
				<v-btn size="small" color="primary" data-testid="rosetta-open-report" @click="openReport">{{ rosettaPageWords.reportReadyOpenButton }}</v-btn>
			</div>
		</v-alert>

		<v-tabs v-model="activeTab" class="mb-4" show-arrows>
			<v-tab value="submit">{{ rosettaPageWords.tabYourFields }}</v-tab>
			<v-tab value="job" :disabled="!store.jobStatus">{{ rosettaPageWords.tabJob }}</v-tab>
			<v-tab value="report" :disabled="!store.report" :class="{ rosettaTabUnseen: store.reportUnseen }" data-testid="rosetta-tab-report">
				<v-badge v-if="store.reportUnseen" :content="rosettaPageWords.reportTabNewBadgeLabel" color="success" inline data-testid="rosetta-report-badge">{{ rosettaPageWords.tabReport }}</v-badge>
				<template v-else>{{ rosettaPageWords.tabReport }}</template>
			</v-tab>
			<v-tab value="drafts" :disabled="!store.report">{{ rosettaPageWords.tabDrafts }}</v-tab>
			<v-tab value="prompt" :disabled="!store.promptPage" data-testid="rosetta-tab-prompt">{{ rosettaPageWords.tabPrompt }}</v-tab>
		</v-tabs>

		<v-window v-model="activeTab">
			<v-window-item value="submit">
				<v-alert v-if="store.review" type="info" variant="tonal" class="mb-3" data-testid="rosetta-review-status">
					<div class="d-flex flex-wrap align-center ga-2">
						<span class="flex-grow-1">{{ store.review.statusText }}</span>
						<v-btn size="small" variant="outlined" prepend-icon="mdi-undo" data-testid="rosetta-undo" @click="undo">{{ rosettaPageWords.undoButton }}</v-btn>
					</div>
				</v-alert>
				<SiteNoticePiiNotice class="mb-3" />
				<v-textarea v-model="store.pastedText" :label="rosettaPageWords.textareaLabel" :placeholder="rosettaPageWords.textareaPlaceholder" persistent-placeholder rows="12" data-testid="rosetta-text" />
				<v-btn color="primary" :loading="store.isBusy" data-testid="rosetta-ask-draft" @click="askForDraft">{{ askButtonText }}</v-btn>
				<p v-if="!loginStore.validUser" class="mt-2 text-caption" data-testid="rosetta-anonymous-note">{{ rosettaPageWords.anonymousLimitsNote }}</p>
			</v-window-item>

			<v-window-item value="job">
				<template v-if="store.jobStatus">
					<p data-testid="rosetta-job-status"><strong>{{ rosettaPageWords.statusLabel }}</strong> {{ jobStatusLineOf(store.jobStatus) }}</p>
					<p v-if="store.jobStatus.position">{{ wordsOf(rosettaPageWords.queuePlaceText, { position: store.jobStatus.position }) }}</p>
					<p v-if="store.jobStatus.unitsTotal">{{ wordsOf(rosettaPageWords.unitsFinishedText, { unitsFinished: store.jobStatus.unitsFinished, unitsTotal: store.jobStatus.unitsTotal }) }}</p>
					<p data-testid="rosetta-job-spend">{{ spendLineOf(store.jobStatus) }}</p>
					<div v-if="jobLink" class="d-flex flex-wrap align-center ga-2 mt-2" data-testid="rosetta-job-link">
						<span>{{ rosettaPageWords.jobLinkLabel }}</span>
						<code class="rosettaJobLink">{{ jobLink }}</code>
						<v-btn size="small" variant="outlined" @click="copyJobLink">{{ rosettaPageWords.copyJobLinkButton }}</v-btn>
					</div>
					<v-btn v-if="jobIsOpen" class="mt-2" @click="store.cancelJob()">{{ rosettaPageWords.cancelButton }}</v-btn>
				</template>
			</v-window-item>

			<v-window-item value="report">
				<template v-if="store.report">
					<p class="mb-1"><strong>{{ store.report.draftNote }}</strong></p>
					<p class="mb-1" data-testid="rosetta-rationale-caution">{{ rosettaPageWords.reportRationaleCautionText }}</p>
					<p v-if="store.report.isPartial" class="mb-2" data-testid="rosetta-partial-note">{{ rosettaPageWords.reportPartialText }}</p>
					<h2 class="text-h6 mt-4 mb-2">{{ rosettaPageWords.reportDetailHeading }}</h2>
					<v-card v-for="oneFieldBlock in fieldBlockList" :key="oneFieldBlock.requestName" class="mb-4 pa-3" variant="outlined" data-testid="rosetta-field-block">
						<h3 class="text-subtitle-1 font-weight-bold rosettaWrap" data-testid="rosetta-field-name">{{ oneFieldBlock.requestName }}</h3>
						<p class="text-body-2 mb-2 rosettaWrap" data-testid="rosetta-field-definition">{{ oneFieldBlock.definitionText }}</p>
						<v-sheet v-for="oneHubBlock in oneFieldBlock.hubBlockList" :key="oneHubBlock.hubName" class="pa-3 mb-2 rosettaHubBlock" border rounded data-testid="rosetta-hub-block">
							<p class="text-overline mb-1">{{ oneHubBlock.hubHeadingText }}</p>
							<dl v-if="oneHubBlock.hasProposal" class="rosettaFacts" data-testid="rosetta-proposal">
								<dt>{{ rosettaPageWords.reportMeaningLabel }}</dt>
								<dd>
									<strong data-testid="rosetta-meaning-name">{{ oneHubBlock.meaningName }}</strong>
									<span v-if="oneHubBlock.hubIdsText" class="ml-2 text-medium-emphasis" data-testid="rosetta-meaning-hub-ids">{{ oneHubBlock.hubIdsText }}</span>
									<NuxtLink :to="oneHubBlock.meaningsLink" class="ml-2" data-testid="rosetta-open-in-meanings">{{ rosettaPageWords.reportOpenInMeaningsLink }}</NuxtLink>
								</dd>
								<dt>{{ rosettaPageWords.reportMeaningUriLabel }}</dt>
								<dd>
									<a v-if="oneHubBlock.meaningHref" :href="oneHubBlock.meaningHref" target="_blank" rel="noopener" class="rosettaUri" data-testid="rosetta-meaning-uri">{{ oneHubBlock.meaningUri }}</a>
									<span v-else class="rosettaUri" data-testid="rosetta-meaning-uri">{{ oneHubBlock.meaningUri }}</span>
								</dd>
								<dt>{{ rosettaPageWords.reportSlotsLabel }}</dt>
								<dd>
									<p v-if="oneHubBlock.tupleAbsentText" class="mb-0">{{ oneHubBlock.tupleAbsentText }}</p>
									<ul v-else class="rosettaSlots">
										<li v-for="oneSlot in oneHubBlock.slotList" :key="oneSlot.slotName" :data-testid="`rosetta-slot-${oneSlot.slotName}`">
											<span class="font-weight-medium">{{ oneSlot.slotLabel }}</span>
											<span class="ml-1">{{ oneSlot.label }}</span>
											<span class="ml-1 text-medium-emphasis">({{ oneSlot.detailText }})</span>
											<a v-if="oneSlot.href" :href="oneSlot.href" target="_blank" rel="noopener" class="d-block rosettaUri">{{ oneSlot.uri }}</a>
											<span v-else-if="oneSlot.uri" class="d-block rosettaUri">{{ oneSlot.uri }}</span>
											<span v-else class="d-block text-medium-emphasis">{{ oneSlot.uriAbsentText }}</span>
										</li>
									</ul>
								</dd>
								<dt>{{ rosettaPageWords.reportStrengthLabel }}</dt>
								<dd data-testid="rosetta-strength"><strong>{{ oneHubBlock.strengthWords }}</strong>: {{ oneHubBlock.strengthExplanation }}</dd>
								<dt>{{ rosettaPageWords.reportRelationLabel }}</dt>
								<dd data-testid="rosetta-relation">{{ oneHubBlock.relationText }}</dd>
								<dt>{{ rosettaPageWords.reportRationaleLabel }}</dt>
								<dd class="rosettaWrap" data-testid="rosetta-rationale">{{ oneHubBlock.rationaleText }}</dd>
								<dt>{{ rosettaPageWords.reportGraphLabel }}</dt>
								<dd data-testid="rosetta-expressed-in">
									{{ oneHubBlock.expressedText }}
									<NuxtLink v-if="oneHubBlock.showsExpressedLink" :to="oneHubBlock.meaningsLink">{{ rosettaPageWords.reportExpressedLinkText }}</NuxtLink>
									<v-btn v-if="oneHubBlock.expressedReadFailed" size="x-small" variant="outlined" class="ml-1" data-testid="rosetta-expressed-retry" @click="store.readExpressions()">{{ rosettaPageWords.reportExpressedRetryButton }}</v-btn>
								</dd>
							</dl>
							<dl v-else class="rosettaFacts" data-testid="rosetta-no-proposal">
								<dt>{{ rosettaPageWords.reportMeaningLabel }}</dt>
								<dd data-testid="rosetta-no-proposal-meaning">{{ rosettaPageWords.reportNoProposalLabel }}</dd>
								<dt data-testid="rosetta-no-proposal-why-label">{{ rosettaPageWords.reportNoProposalReasonLabel }}</dt>
								<dd data-testid="rosetta-no-proposal-reason">{{ oneHubBlock.whyText }}</dd>
								<template v-if="oneHubBlock.rationaleText">
									<dt>{{ rosettaPageWords.reportRationaleLabel }}</dt>
									<dd class="rosettaWrap" data-testid="rosetta-rationale">{{ oneHubBlock.rationaleText }}</dd>
								</template>
							</dl>
						</v-sheet>
					</v-card>
					<h2 class="text-h6 mt-6 mb-2">{{ rosettaPageWords.reportSummaryHeading }}</h2>
					<p v-for="oneCountLine in countLineList" :key="oneCountLine" class="mb-1" data-testid="rosetta-count-line">{{ oneCountLine }}</p>
					<div class="rosettaTableFrame">
						<v-table density="compact">
							<thead><tr><th>{{ rosettaPageWords.reportFieldHeading }}</th><th>{{ rosettaPageWords.reportHubHeading }}</th><th>{{ rosettaPageWords.reportResultHeading }}</th><th>{{ rosettaPageWords.reportRationaleHeading }}</th></tr></thead>
							<tbody>
								<template v-for="oneField in store.report.fieldList" :key="oneField.requestName">
									<tr v-for="hubName in hubNameList" :key="hubName">
										<td>{{ oneField.requestName }}</td>
										<td>{{ hubName }}</td>
										<td>{{ summaryResultTextOf(resultFor(oneField, hubName)) }}</td>
										<td class="rosettaRationale">{{ resultFor(oneField, hubName).judgesRationale }}</td>
									</tr>
								</template>
							</tbody>
						</v-table>
					</div>
					<v-pagination v-if="store.report.pageCount > 1" :model-value="store.report.page" :length="store.report.pageCount" @update:model-value="store.showReportPage($event)" />
				</template>
			</v-window-item>

			<v-window-item value="drafts">
				<template v-if="store.report">
					<p class="mb-1"><strong>{{ store.report.draftNote }}</strong></p>
					<p class="mb-2">{{ store.report.strongOnlyNote }}</p>
					<p class="mb-2">{{ store.report.strongEvidenceNote }}</p>
					<v-card v-for="hubName in hubNameList" :key="hubName" class="mb-4 pa-3">
						<v-btn size="small" class="mb-2" @click="downloadDraft(hubName)">{{ wordsOf(rosettaPageWords.downloadDraftButton, { hubName }) }}</v-btn>
						<pre class="rosettaDraft">{{ JSON.stringify(store.report.draftContextByHub[hubName], null, 2) }}</pre>
					</v-card>
				</template>
			</v-window-item>

			<v-window-item value="prompt">
				<template v-if="store.promptPage">
					<p class="mb-3">{{ rosettaPageWords.promptIntroText }}</p>
					<p v-if="store.promptPage.promptList.length === 0" data-testid="rosetta-prompt-none">{{ rosettaPageWords.promptNoneText }}</p>
					<v-expansion-panels multiple data-testid="rosetta-prompt-list">
						<v-expansion-panel v-for="onePrompt in store.promptPage.promptList" :key="`${onePrompt.requestName}\u0000${onePrompt.hub}`">
							<v-expansion-panel-title>{{ wordsOf(rosettaPageWords.promptUserLabel, { requestName: onePrompt.requestName, hubName: onePrompt.hub }) }}</v-expansion-panel-title>
							<v-expansion-panel-text>
								<p class="text-caption mb-1">{{ rosettaPageWords.promptSystemLabel }}</p>
								<pre class="rosettaPrompt" data-testid="rosetta-prompt-system">{{ onePrompt.systemPrompt }}</pre>
								<p class="text-caption mt-3 mb-1">{{ rosettaPageWords.promptUserBodyLabel }}</p>
								<pre class="rosettaPrompt" data-testid="rosetta-prompt-user">{{ onePrompt.userPrompt }}</pre>
							</v-expansion-panel-text>
						</v-expansion-panel>
					</v-expansion-panels>
					<v-pagination v-if="store.promptPage.pageCount > 1" :model-value="store.promptPage.page" :length="store.promptPage.pageCount" @update:model-value="store.fetchPrompts($event)" />
				</template>
			</v-window-item>
		</v-window>

		<v-dialog v-model="isUndoConfirmOpen" max-width="420">
			<v-card data-testid="rosetta-undo-confirm">
				<v-card-title>{{ rosettaPageWords.undoConfirmTitle }}</v-card-title>
				<v-card-text>{{ rosettaPageWords.undoConfirmText }}</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn data-testid="rosetta-undo-keep" @click="isUndoConfirmOpen = false">{{ rosettaPageWords.undoKeepButton }}</v-btn>
					<v-btn color="primary" data-testid="rosetta-undo-discard" @click="confirmUndo">{{ rosettaPageWords.undoDiscardButton }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-container>
</template>

<style scoped>
.rosettaRationale { max-width: 40em; }
.rosettaDraft { overflow-x: auto; font-size: 0.8rem; }
.rosettaPrompt { overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-size: 0.8rem; }
.rosettaTableFrame { overflow-x: auto; }
.rosettaJobLink { word-break: break-all; }
.rosettaUri { word-break: break-all; font-size: 0.85rem; }
.rosettaWrap { overflow-wrap: anywhere; }
.rosettaFacts { display: grid; grid-template-columns: minmax(7em, max-content) 1fr; gap: 0.25rem 1rem; }
.rosettaFacts dt { font-weight: 600; }
.rosettaFacts dd { margin: 0; min-width: 0; }
.rosettaSlots { list-style: none; padding: 0; margin: 0; }
.rosettaSlots li { margin-bottom: 0.25rem; }
@media (max-width: 600px) {
	.rosettaFacts { grid-template-columns: 1fr; }
	.rosettaFacts dd { margin-bottom: 0.5rem; }
}
</style>
