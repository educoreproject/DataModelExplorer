<script setup>
// Rosetta — paste your fields and ask for a judged draft: open to anyone, signed in or not (rosettaMeanings R3). Every word this page shows that is not the
// service's own answer comes from rosettaVocabulary (TQ's rule, no magic strings). Candidates are no longer shown here (R1); the API and MCP keep them.
//
// A RATIONALE CAN QUOTE A STRANGER'S TEXT, AND SO CAN A FIELD NAME, AND A PROMPT HOLDS BOTH. Everything from an answer is shown by {{ }}, which escapes it. This page
// must never use v-html: a gate (rosetta-page.test.js) reads this file and fails if it does.

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRosettaStore } from '@/stores/rosettaStore';
import { useLoginStore } from '@/stores/loginStore';
import { rosettaPageWords, wordsOf } from '@/components/rosetta/rosettaVocabulary';

const store = useRosettaStore();
const loginStore = useLoginStore();
const route = useRoute();
const router = useRouter();
const activeTab = ref('submit');
const isUndoConfirmOpen = ref(false);
const JOB_LINK_QUERY_NAME = 'job';

// a reading stops for review; only an answer moves the page on to its tab, and puts the job's link in the address bar
const askForDraft = () => store.submitJob().then((outcomeName) => {
	if (outcomeName === 'sent') {
		activeTab.value = 'job';
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

const OPEN_STATUS_LIST = ['queued', 'running', 'cancelling'];
const jobIsOpen = computed(() => store.jobStatus && OPEN_STATUS_LIST.includes(store.jobStatus.status));
const hubNameList = computed(() => (store.report ? store.report.job.hubList : []));
// the job's link is this page with the job named: an anonymous job is reached by it alone
const jobLink = computed(() => (store.jobRefId && import.meta.client ? `${window.location.origin}${route.path}?${JOB_LINK_QUERY_NAME}=${store.jobRefId}` : ''));
const copyJobLink = () => navigator.clipboard.writeText(jobLink.value);

// ⟪P7a⟫ a field's results are a list, each naming its hub
const resultFor = (oneField, hubName) => oneField.resultList.find((oneResult) => oneResult.hub === hubName);
const unitLine = (oneUnit) => (oneUnit.proposal ? `${oneUnit.proposal.category}: ${oneUnit.proposal.label}` : oneUnit.notJudgedReason ? `${oneUnit.status}: ${oneUnit.notJudgedReason}` : oneUnit.status);

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
		activeTab.value = 'job';
		store.openJob(linkedJobRefId);
	}
});
watch(currentUserRefId, (nextUserRefId) => {
	store.forgetIfAnotherPerson(nextUserRefId);
	activeTab.value = store.jobStatus ? activeTab.value : 'submit';
});
onUnmounted(() => store.stopPolling());
</script>

<template>
	<v-container>
		<h1 class="text-h4 mb-2">{{ rosettaPageWords.pageTitle }}</h1>
		<p class="mb-2">{{ rosettaPageWords.introText }}</p>
		<p class="mb-4 text-caption" data-testid="rosetta-vendor-notice">{{ rosettaPageWords.vendorNoticeText }}</p>

		<v-alert v-if="store.refusal" type="warning" class="mb-4" closable data-testid="rosetta-refusal">
			<strong>{{ store.refusal.refusalName }}</strong>: {{ store.refusal.reason }}
		</v-alert>

		<v-tabs v-model="activeTab" class="mb-4" show-arrows>
			<v-tab value="submit">{{ rosettaPageWords.tabYourFields }}</v-tab>
			<v-tab value="job" :disabled="!store.jobStatus">{{ rosettaPageWords.tabJob }}</v-tab>
			<v-tab value="report" :disabled="!store.report">{{ rosettaPageWords.tabReport }}</v-tab>
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
				<v-btn color="primary" :loading="store.isBusy" data-testid="rosetta-ask-draft" @click="askForDraft">{{ rosettaPageWords.askDraftButton }}</v-btn>
				<p v-if="!loginStore.validUser" class="mt-2 text-caption" data-testid="rosetta-anonymous-note">{{ rosettaPageWords.anonymousLimitsNote }}</p>
			</v-window-item>

			<v-window-item value="job">
				<template v-if="store.jobStatus">
					<p><strong>{{ rosettaPageWords.statusLabel }}</strong> {{ store.jobStatus.status }}<span v-if="store.jobStatus.stopReasonName"> ({{ store.jobStatus.stopReasonName }}: {{ store.jobStatus.stopReasonText }})</span></p>
					<p v-if="store.jobStatus.position">{{ wordsOf(rosettaPageWords.queuePlaceText, { position: store.jobStatus.position }) }}</p>
					<p v-if="store.jobStatus.unitsTotal">{{ wordsOf(rosettaPageWords.unitsFinishedText, { unitsFinished: store.jobStatus.unitsFinished, unitsTotal: store.jobStatus.unitsTotal }) }}</p>
					<p>{{ wordsOf(rosettaPageWords.estimateText, { estimateUsd: store.jobStatus.estimateUsd }) }}<span v-if="store.jobStatus.spentUsd !== undefined">{{ wordsOf(rosettaPageWords.spentText, { spentUsd: store.jobStatus.spentUsd }) }}</span></p>
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
					<p class="mb-1">{{ store.report.rationaleNote }}</p>
					<p v-if="store.report.isPartial" class="mb-2">{{ store.report.partialNote }}</p>
					<div class="rosettaTableFrame">
						<v-table density="compact">
							<thead><tr><th>{{ rosettaPageWords.reportFieldHeading }}</th><th>{{ rosettaPageWords.reportHubHeading }}</th><th>{{ rosettaPageWords.reportResultHeading }}</th><th>{{ rosettaPageWords.reportRationaleHeading }}</th></tr></thead>
							<tbody>
								<template v-for="oneField in store.report.fieldList" :key="oneField.requestName">
									<tr v-for="hubName in hubNameList" :key="hubName">
										<td>{{ oneField.requestName }}</td>
										<td>{{ hubName }}</td>
										<td>{{ unitLine(resultFor(oneField, hubName)) }}</td>
										<td class="rosettaRationale">{{ resultFor(oneField, hubName).judgesRationale }}</td>
									</tr>
								</template>
							</tbody>
						</v-table>
					</div>
					<v-pagination v-if="store.report.pageCount > 1" :model-value="store.report.page" :length="store.report.pageCount" @update:model-value="store.fetchReport($event)" />
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
</style>
