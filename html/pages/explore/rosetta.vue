<script setup>
// Rosetta — paste your fields, see the candidate cards, and, signed in, ask for a judged draft.
//
// A RATIONALE CAN QUOTE A STRANGER'S TEXT, AND SO CAN A FIELD NAME. Everything from an answer is shown by {{ }}, which escapes it. This page must never use v-html: a gate (rosetta-page.test.js) reads this file and fails if it does.

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRosettaStore } from '@/stores/rosettaStore';
import { useLoginStore } from '@/stores/loginStore';

const store = useRosettaStore();
const loginStore = useLoginStore();
const activeTab = ref('submit');
const isUndoConfirmOpen = ref(false);

const TEXTAREA_LABEL = 'Your fields: plain lines, a table, a field list, a JSON Schema or a @context';
const TEXTAREA_PLACEHOLDER = 'One field a line, with or without a description, for example:\nbirthDate: the date the person was born\nschoolName - the name of the school';

// a reading stops for review; only an answer moves the page on to its tab
const showCandidates = () => store.retrieve().then((outcomeName) => { if (outcomeName === 'sent') activeTab.value = 'pools'; });
const askForDraft = () => store.submitJob().then((outcomeName) => { if (outcomeName === 'sent') activeTab.value = 'job'; });
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
onMounted(() => store.forgetIfAnotherPerson(currentUserRefId()));
watch(currentUserRefId, (nextUserRefId) => {
	store.forgetIfAnotherPerson(nextUserRefId);
	activeTab.value = store.jobStatus ? activeTab.value : 'submit';
});
onUnmounted(() => store.stopPolling());
</script>

<template>
	<v-container>
		<h1 class="text-h4 mb-2">Rosetta</h1>
		<p class="mb-2">Paste your fields: plain lines (a name, or a name and its description), a table copied from a spreadsheet, a field list, a JSON Schema or a JSON-LD @context. Candidates are open to anyone. A judged draft needs you to be signed in.</p>
		<p class="mb-4 text-caption" data-testid="rosetta-vendor-notice">Where your text goes: showing candidates sends your fields to Voyage AI, to turn them into vectors. If your text is neither JSON nor plain lines, pressing Show candidates or Ask for a judged draft first sends it to Anthropic, whose AI lays it out as fields for you to check; nothing is looked up until you press again. A judged draft sends your fields to Anthropic, the judge's vendor.</p>

		<v-alert v-if="store.refusal" type="warning" class="mb-4" closable data-testid="rosetta-refusal">
			<strong>{{ store.refusal.refusalName }}</strong>: {{ store.refusal.reason }}
		</v-alert>

		<v-tabs v-model="activeTab" class="mb-4">
			<v-tab value="submit">Your fields</v-tab>
			<v-tab value="pools" :disabled="!store.retrievalAnswer">Candidates</v-tab>
			<v-tab value="job" :disabled="!store.jobStatus">Job</v-tab>
			<v-tab value="report" :disabled="!store.report">Report</v-tab>
			<v-tab value="drafts" :disabled="!store.report">Drafts</v-tab>
		</v-tabs>

		<v-window v-model="activeTab">
			<v-window-item value="submit">
				<v-alert v-if="store.review" type="info" variant="tonal" class="mb-3" data-testid="rosetta-review-status">
					<div class="d-flex flex-wrap align-center ga-2">
						<span class="flex-grow-1">{{ store.review.statusText }}</span>
						<v-btn size="small" variant="outlined" prepend-icon="mdi-undo" data-testid="rosetta-undo" @click="undo">Undo</v-btn>
					</div>
				</v-alert>
				<v-textarea v-model="store.pastedText" :label="TEXTAREA_LABEL" :placeholder="TEXTAREA_PLACEHOLDER" persistent-placeholder rows="12" data-testid="rosetta-text" />
				<v-btn class="mr-2" :loading="store.isBusy" data-testid="rosetta-show-candidates" @click="showCandidates">Show candidates</v-btn>
				<v-btn color="primary" :disabled="!loginStore.validUser" :loading="store.isBusy" data-testid="rosetta-ask-draft" @click="askForDraft">Ask for a judged draft</v-btn>
				<p v-if="!loginStore.validUser" class="mt-2 text-caption">Sign in to ask for a judged draft. Candidates need no account.</p>
			</v-window-item>

			<v-window-item value="pools">
				<template v-if="store.retrievalAnswer">
					<p class="mb-2">{{ store.retrievalAnswer.nothingJudgedNote }}</p>
					<v-table density="compact">
						<thead><tr><th>Field</th><th>Hub</th><th>Pool</th><th>Top candidates</th></tr></thead>
						<tbody>
							<template v-for="oneField in store.retrievalAnswer.fieldList" :key="oneField.requestName">
								<tr v-for="onePool in oneField.resultList" :key="onePool.hub">
									<td>{{ oneField.requestName }}</td>
									<td>{{ onePool.hub }}</td>
									<td>{{ onePool.poolSize }}</td>
									<td>{{ (onePool.topCandidateList || []).map((oneCandidate) => oneCandidate.label).join('; ') }}</td>
								</tr>
							</template>
						</tbody>
					</v-table>
				</template>
			</v-window-item>

			<v-window-item value="job">
				<template v-if="store.jobStatus">
					<p><strong>Status:</strong> {{ store.jobStatus.status }}<span v-if="store.jobStatus.stopReasonName"> ({{ store.jobStatus.stopReasonName }}: {{ store.jobStatus.stopReasonText }})</span></p>
					<p v-if="store.jobStatus.position">Place in the queue: {{ store.jobStatus.position }}</p>
					<p v-if="store.jobStatus.unitsTotal">Finished {{ store.jobStatus.unitsFinished }} of {{ store.jobStatus.unitsTotal }} (one is one field against one hub)</p>
					<p>Estimate ${{ store.jobStatus.estimateUsd }}<span v-if="store.jobStatus.spentUsd !== undefined">; spent ${{ store.jobStatus.spentUsd }}</span></p>
					<v-btn v-if="jobIsOpen" class="mt-2" @click="store.cancelJob()">Cancel</v-btn>
				</template>
			</v-window-item>

			<v-window-item value="report">
				<template v-if="store.report">
					<p class="mb-1"><strong>{{ store.report.draftNote }}</strong></p>
					<p class="mb-1">{{ store.report.rationaleNote }}</p>
					<p v-if="store.report.isPartial" class="mb-2">{{ store.report.partialNote }}</p>
					<v-table density="compact">
						<thead><tr><th>Field</th><th>Hub</th><th>Result</th><th>The judge's words</th></tr></thead>
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
					<v-pagination v-if="store.report.pageCount > 1" :model-value="store.report.page" :length="store.report.pageCount" @update:model-value="store.fetchReport($event)" />
				</template>
			</v-window-item>

			<v-window-item value="drafts">
				<template v-if="store.report">
					<p class="mb-1"><strong>{{ store.report.draftNote }}</strong></p>
					<p class="mb-2">{{ store.report.strongOnlyNote }}</p>
					<p class="mb-2">{{ store.report.strongEvidenceNote }}</p>
					<v-card v-for="hubName in hubNameList" :key="hubName" class="mb-4 pa-3">
						<v-btn size="small" class="mb-2" @click="downloadDraft(hubName)">Download the {{ hubName }} draft</v-btn>
						<pre class="rosettaDraft">{{ JSON.stringify(store.report.draftContextByHub[hubName], null, 2) }}</pre>
					</v-card>
				</template>
			</v-window-item>
		</v-window>

		<v-dialog v-model="isUndoConfirmOpen" max-width="420">
			<v-card data-testid="rosetta-undo-confirm">
				<v-card-title>Undo your edits too?</v-card-title>
				<v-card-text>You have changed the fields since they were read. Undo puts back the text you pasted, and your changes are lost.</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn data-testid="rosetta-undo-keep" @click="isUndoConfirmOpen = false">Keep my edits</v-btn>
					<v-btn color="primary" data-testid="rosetta-undo-discard" @click="confirmUndo">Undo</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-container>
</template>

<style scoped>
.rosettaRationale { max-width: 40em; }
.rosettaDraft { overflow-x: auto; font-size: 0.8rem; }
</style>
