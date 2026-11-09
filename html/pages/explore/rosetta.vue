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

const OPEN_STATUS_LIST = ['queued', 'running', 'cancelling'];
const jobIsOpen = computed(() => store.jobStatus && OPEN_STATUS_LIST.includes(store.jobStatus.status));
const hubNameList = computed(() => (store.report ? store.report.job.hubList : []));

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
		<p class="mb-4">Paste a field list, a JSON Schema or a JSON-LD @context. Candidates are open to anyone. A judged draft needs you to be signed in, and sends your text to the judge's vendor.</p>

		<v-alert v-if="store.refusal" type="warning" class="mb-4" closable>
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
				<v-textarea v-model="store.pastedText" label='[{ "name": "...", "definition": "..." }], a JSON Schema, or a @context' rows="12" />
				<v-btn class="mr-2" :loading="store.isBusy" @click="store.retrieve().then(() => { if (store.retrievalAnswer) activeTab = 'pools'; })">Show candidates</v-btn>
				<v-btn color="primary" :disabled="!loginStore.validUser" :loading="store.isBusy" @click="store.submitJob().then(() => { if (store.jobStatus) activeTab = 'job'; })">Ask for a judged draft</v-btn>
				<p v-if="!loginStore.validUser" class="mt-2 text-caption">Sign in to ask for a judged draft. Candidates need no account.</p>
			</v-window-item>

			<v-window-item value="pools">
				<template v-if="store.retrievalAnswer">
					<p class="mb-2">{{ store.retrievalAnswer.nothingJudgedNote }}</p>
					<v-table density="compact">
						<thead><tr><th>Field</th><th>Hub</th><th>Pool</th><th>Top candidates</th></tr></thead>
						<tbody>
							<template v-for="oneField in store.retrievalAnswer.fieldList" :key="oneField.name">
								<tr v-for="(onePool, hubName) in oneField.byHub" :key="hubName">
									<td>{{ oneField.name }}</td>
									<td>{{ hubName }}</td>
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
							<template v-for="oneField in store.report.fieldList" :key="oneField.name">
								<tr v-for="hubName in hubNameList" :key="hubName">
									<td>{{ oneField.name }}</td>
									<td>{{ hubName }}</td>
									<td>{{ unitLine(oneField.byHub[hubName]) }}</td>
									<td class="rosettaRationale">{{ oneField.byHub[hubName].judgesRationale }}</td>
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
	</v-container>
</template>

<style scoped>
.rosettaRationale { max-width: 40em; }
.rosettaDraft { overflow-x: auto; font-size: 0.8rem; }
</style>
