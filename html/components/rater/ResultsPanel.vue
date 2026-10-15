<script setup>
// RaterResultsPanel — revision 4 (WORKORDER-RATER4): the admin Results view, separate from the surveys. One block per
// target (all 150): answered of assigned, then one row per distinct answer (a card, No match, Unsure) with its Best votes
// and, for cards, how many raters ticked it Same. Rater-added cards carry an "added" mark. Filters by standard and survey;
// sort with disagreement first (the server's order) or alphabetically; download the summary CSV. The server refuses
// the data to anyone but an admin. Never shows rater names, notes, the gold or how a card was found.
// Revision 6 (WORKORDER-RATER6): moved here from the /rater/admin/results page, which now redirects; its one host is the
// CEDS Rater tab of /admin (components/tools/ceds-rater-admin.vue), which is the guard and renders this only for a
// main-site admin. Emits 'back' (the host returns to the raters view).
import { ref, computed, onMounted } from 'vue';
import { useRaterStore } from '@/stores/raterStore';

const emit = defineEmits(['back']);
const raterStore = useRaterStore();

const ALL_CHOICE = 'all';
// the two orders the page offers; the server already sends disagreement first
const SORT_BY_NAME = {
	disagreement: { sortLabel: 'Disagreement first', orderOf: (targetList) => targetList },
	alphabetical: { sortLabel: 'Alphabetical', orderOf: (targetList) => targetList.slice().sort((targetA, targetB) => targetA.targetLabel.localeCompare(targetB.targetLabel)) },
};

const standardChoice = ref(ALL_CHOICE);
const surveyChoice = ref(ALL_CHOICE);
const sortChoice = ref('disagreement');
const actionNotice = ref('');

const shownTargetList = computed(() =>
	SORT_BY_NAME[sortChoice.value].orderOf(
		raterStore.resultsTargetList.filter((target) => (standardChoice.value === ALL_CHOICE || target.standard === standardChoice.value) && (surveyChoice.value === ALL_CHOICE || target.surveyName === surveyChoice.value)),
	),
);
const disagreementCount = computed(() => shownTargetList.value.filter((target) => target.distinctBestCount > 1).length);

const downloadSummary = async () => {
	actionNotice.value = '';
	const answer = await raterStore.adminAction({ adminAction: 'results', resultsFormat: 'csv' });
	if (!answer) {
		return;
	}
	const downloadUrl = URL.createObjectURL(new Blob([answer.contentText], { type: answer.contentType }));
	const downloadLink = document.createElement('a');
	downloadLink.href = downloadUrl;
	downloadLink.download = answer.fileName;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	downloadLink.remove();
	URL.revokeObjectURL(downloadUrl);
	actionNotice.value = `Downloaded the summary of ${answer.targetCount} targets as ${answer.fileName}.`;
};

onMounted(async () => {
	await raterStore.adminLoadResults();
});
</script>

<template>
	<div class="rt-results-main" data-testid="rater-results-panel">
		<div class="rt-results-top">
			<div>
				<h1 class="rt-serif rt-results-title">Results</h1>
				<p class="rt-results-sub">Every saved answer counts, finished or not; each rater's current answer only. "Same" is a count of raters, nothing more.</p>
			</div>
			<button type="button" class="rt-button-quiet rt-results-back" data-testid="rater-results-back" @click="emit('back')">Back to raters</button>
		</div>

		<p v-if="raterStore.statusMsg" role="alert" class="rt-alert-error" data-testid="rater-results-error">{{ raterStore.statusMsg }}</p>
		<p v-if="actionNotice" role="status" class="rt-alert-ok">{{ actionNotice }}</p>

		<section class="rt-panel rt-results-controls" aria-label="Filter, sort and download">
			<label class="rt-field-label">Standard
				<select v-model="standardChoice" class="rt-results-select" data-testid="rater-results-standard">
					<option :value="ALL_CHOICE">All standards</option>
					<option v-for="standardName in raterStore.resultsStandardNameList" :key="standardName" :value="standardName">{{ standardName }}</option>
				</select>
			</label>
			<label class="rt-field-label">Survey
				<select v-model="surveyChoice" class="rt-results-select" data-testid="rater-results-survey">
					<option :value="ALL_CHOICE">All surveys</option>
					<option v-for="surveyName in raterStore.resultsSurveyNameList" :key="surveyName" :value="surveyName">{{ surveyName }}</option>
				</select>
			</label>
			<label class="rt-field-label">Sort
				<select v-model="sortChoice" class="rt-results-select" data-testid="rater-results-sort">
					<option v-for="(sortEntry, sortName) in SORT_BY_NAME" :key="sortName" :value="sortName">{{ sortEntry.sortLabel }}</option>
				</select>
			</label>
			<span class="rt-results-count" data-testid="rater-results-count">{{ shownTargetList.length }} targets · {{ disagreementCount }} with more than one Best answer</span>
			<button type="button" class="rt-button" data-testid="rater-results-download" @click="downloadSummary">Download summary CSV</button>
		</section>

		<p v-if="raterStore.loading" role="status" class="rt-results-sub">Loading the results…</p>
		<div v-else class="rt-results-table-wrap">
			<table class="rt-results-table" data-testid="rater-results-table">
				<thead>
					<tr>
						<th scope="col">Target</th>
						<th scope="col">Answered</th>
						<th scope="col">Chosen</th>
						<th scope="col" class="rt-results-num">Best</th>
						<th scope="col" class="rt-results-num">Same</th>
					</tr>
				</thead>
				<tbody v-for="target in shownTargetList" :key="target.targetStableId" class="rt-results-target" data-testid="rater-results-target" :data-target-stable-id="target.targetStableId">
					<tr v-if="target.rowList.length === 0">
						<th scope="row" class="rt-results-target-cell">{{ target.targetLabel }}</th>
						<td class="rt-results-answered">{{ target.answeredCount }} of {{ target.assignedCount }}</td>
						<td colspan="3" class="rt-results-none">No answers yet</td>
					</tr>
					<tr v-for="(row, rowPosition) in target.rowList" v-else :key="row.cedsTupleId || row.rowKind" data-testid="rater-results-row">
						<th v-if="rowPosition === 0" scope="rowgroup" :rowspan="target.rowList.length" class="rt-results-target-cell">
							{{ target.targetLabel }}
							<span v-if="target.distinctBestCount > 1" class="rt-results-split" data-testid="rater-results-split">split</span>
						</th>
						<td v-if="rowPosition === 0" :rowspan="target.rowList.length" class="rt-results-answered" data-testid="rater-results-answered">{{ target.answeredCount }} of {{ target.assignedCount }}</td>
						<td :class="row.rowKind === 'card' ? 'rt-results-card' : 'rt-results-plain'">
							{{ row.candidateTitle }}
							<span v-if="row.isAdded" class="rt-results-added" data-testid="rater-results-added">added</span>
						</td>
						<td class="rt-results-num" data-testid="rater-results-best">{{ row.bestCount }}</td>
						<td class="rt-results-num" data-testid="rater-results-same">{{ row.sameCount === null ? '–' : row.sameCount }}</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<style scoped>
.rt-results-main { max-width: 1400px; margin: 0 auto; padding: 28px clamp(16px, 3vw, 40px) 64px; box-sizing: border-box; display: flex; flex-direction: column; gap: 18px; font-size: 15px; }
.rt-results-top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
.rt-results-title { margin: 0; font-size: 34px; color: #072A6C; }
.rt-results-sub { margin: 4px 0 0; color: #4B5563; font-size: 14px; }
.rt-results-back { text-decoration: none; display: inline-flex; align-items: center; }
.rt-results-controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 20px; padding: 14px 16px; }
.rt-results-select { display: block; min-height: 40px; border: 1px solid #C9D3E8; border-radius: 8px; padding: 0 8px; margin-top: 4px; font: inherit; background: #FFFFFF; }
.rt-results-count { color: #4B5563; font-size: 14px; flex: 1 1 auto; }
.rt-results-table-wrap { overflow-x: auto; border: 1px solid #E3E7EF; border-radius: 10px; background: #FFFFFF; }
.rt-results-table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 14px; }
.rt-results-table thead tr { background: #F3F5FA; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #4B5563; }
.rt-results-table th, .rt-results-table td { padding: 8px 12px; vertical-align: top; text-align: left; }
.rt-results-target { border-top: 1px solid #DCE2EC; }
.rt-results-target-cell { font-weight: 600; color: #072A6C; max-width: 360px; }
.rt-results-answered { white-space: nowrap; font-variant-numeric: tabular-nums; }
.rt-results-card { color: #00797C; }
.rt-results-plain { color: #374151; font-style: italic; }
.rt-results-num, .rt-results-table th.rt-results-num { text-align: right; font-variant-numeric: tabular-nums; width: 64px; }
.rt-results-none { color: #6B7280; }
.rt-results-added { margin-left: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #B26A00; border: 1px solid #F5C77E; border-radius: 4px; padding: 0 4px; }
.rt-results-split { margin-left: 6px; font-size: 11px; font-weight: 700; color: #9B1C1C; }
</style>
