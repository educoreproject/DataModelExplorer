<script setup>
// RaterSurveys — revision 5: the admin screen's Surveys section (WORKORDER-RATER5). One card per survey from the frozen
// sample (items and their split by standard, the raters on it with progress and "finished", a coverage marker against
// the design target), View items (the survey's targets, read-only, as a rater sees them), and Assign a person: a new
// rater through the existing add action with the survey preset, or an existing rater moved here through the existing
// surveyChange action. The rules stay on the server: a rater with saved answers is shown in the picker but disabled with
// the server's own refusal text (moveRefusal), and the server refuses the move by name if it is tried anyway. A hint
// names the survey with the fewest raters (ties to the earlier survey); its button opens that survey's Assign form.
// Emits 'issued' { raterUserName, issuedPassword, surveyName } (the page shows the password once) and 'changed' (the
// panel reloads its raters table). Revision 8: Preview survey S on each card and a Preview link on every View items row
// open the raters' real rating page, read-only, in this tab (view=preview; previewRouteOf).
// RaterAdminPanel loads it (loadSurveys, exposed); since revision 6 the panel's host,
// the CEDS Rater tab of /admin, renders it only for a main-site admin, so a rater never calls the Surveys API.
import { ref, computed } from 'vue';
import { useRaterStore } from '@/stores/raterStore';

const emit = defineEmits(['issued', 'changed']);
const raterStore = useRaterStore();

// the server sends the colour; the words for it are here
const COVERAGE_LABEL_BY_COLOUR = Object.freeze({
	red: 'under the minimum',
	amber: 'minimum met',
	green: 'preferred met',
});

const assignSurveyName = ref('');
const assignWhoText = ref('');
const assignEmailAdr = ref('');
const assignRaterUserName = ref('');
const moveRaterUserName = ref('');

const moveCandidateListOf = (surveyName) => raterStore.adminSurveyList.filter((survey) => survey.surveyName !== surveyName).reduce((soFar, survey) => soFar.concat(survey.raterList), []);
const standardSplitTextOf = (survey) => survey.itemCountByStandardList.map((entry) => `${entry.standard} ${entry.itemCount}`).join(' · ');
const isViewingItems = computed(() => !!raterStore.adminSurveyItemSurveyName);

const loadSurveys = async () => {
	await raterStore.adminLoadSurveys();
};

const openAssign = (surveyName) => {
	assignSurveyName.value = surveyName;
	assignWhoText.value = '';
	assignEmailAdr.value = '';
	assignRaterUserName.value = raterStore.adminNextRaterUserName;
	moveRaterUserName.value = '';
};

const closeAssign = () => {
	assignSurveyName.value = '';
};

const assignNewRater = async () => {
	const surveyName = assignSurveyName.value;
	const answer = await raterStore.adminAction({ adminAction: 'add', raterUserName: assignRaterUserName.value, whoText: assignWhoText.value, emailAdr: assignEmailAdr.value, surveyName });
	if (!answer) {
		return;
	}
	emit('issued', { raterUserName: answer.raterUserName, issuedPassword: answer.issuedPassword, surveyName: answer.surveyName });
	closeAssign();
	await loadSurveys();
	emit('changed');
};

const moveRaterHere = async () => {
	const answer = await raterStore.adminAction({ adminAction: 'surveyChange', raterUserName: moveRaterUserName.value, surveyName: assignSurveyName.value });
	if (!answer) {
		return;
	}
	closeAssign();
	await loadSurveys();
	emit('changed');
};

// the preview of item N of a survey: the same /admin page, so the main login comes along
const previewRouteOf = (surveyName, itemNumber) => ({ path: '/admin', query: { tool: 'ceds-rater', view: 'preview', survey: surveyName, item: itemNumber } });

const viewItems = async (surveyName) => {
	await raterStore.adminLoadSurveyItems(surveyName);
};

defineExpose({ loadSurveys });
</script>

<template>
	<section aria-labelledby="surveysHead" class="rt-panel rt-surveys" data-testid="rater-surveys">
		<div class="rt-surveys-top">
			<h2 id="surveysHead" class="rt-surveys-h2">Surveys</h2>
			<p v-if="raterStore.adminNextSurveyName" class="rt-surveys-hint" data-testid="rater-surveys-hint" :data-next-survey="raterStore.adminNextSurveyName">
				Next survey to fill: <b>Survey {{ raterStore.adminNextSurveyName }}</b> (fewest raters)
				<button type="button" class="rt-surveys-small" data-testid="rater-surveys-hint-assign" @click="openAssign(raterStore.adminNextSurveyName)">Assign a person to {{ raterStore.adminNextSurveyName }}</button>
			</p>
		</div>
		<p class="rt-surveys-note">Two raters per survey at least, three preferred.</p>

		<div class="rt-surveys-cards">
			<article v-for="survey in raterStore.adminSurveyList" :key="survey.surveyName" class="rt-surveys-card" :data-testid="`rater-surveys-card-${survey.surveyName}`" :data-coverage-colour="survey.coverageColour">
				<header class="rt-surveys-card-head">
					<h3 class="rt-serif rt-surveys-card-title">Survey {{ survey.surveyName }}</h3>
					<span :class="['rt-surveys-coverage', `rt-surveys-coverage-${survey.coverageColour}`]" :data-testid="`rater-surveys-coverage-${survey.surveyName}`">
						<span aria-hidden="true" class="rt-surveys-dot"></span>{{ survey.raterCount }} {{ survey.raterCount === 1 ? 'rater' : 'raters' }} · {{ COVERAGE_LABEL_BY_COLOUR[survey.coverageColour] }}
					</span>
				</header>
				<p class="rt-surveys-items" :data-testid="`rater-surveys-split-${survey.surveyName}`">{{ survey.itemCount }} items: {{ standardSplitTextOf(survey) }}</p>

				<ul class="rt-surveys-raters" :data-testid="`rater-surveys-raters-${survey.surveyName}`">
					<li v-for="rater in survey.raterList" :key="rater.raterUserName" :data-testid="`rater-surveys-rater-${rater.raterUserName}`">
						<span class="rt-surveys-rater-name">{{ rater.raterUserName }}</span>
						<span class="rt-surveys-rater-who">{{ rater.whoText }}</span>
						<span class="rt-surveys-rater-progress" data-testid="rater-surveys-progress">{{ rater.savedCount }} of {{ rater.itemCount }}</span>
						<span v-if="rater.finishedAt" class="rt-surveys-finished" data-testid="rater-surveys-finished">finished</span>
					</li>
					<li v-if="survey.raterList.length === 0" class="rt-surveys-empty">Nobody yet.</li>
				</ul>

				<div class="rt-surveys-actions">
					<NuxtLink :to="previewRouteOf(survey.surveyName, 1)" class="rt-surveys-small rt-surveys-link" :data-testid="`rater-surveys-preview-${survey.surveyName}`">Preview survey {{ survey.surveyName }}</NuxtLink>
					<button type="button" class="rt-surveys-small" :data-testid="`rater-surveys-view-${survey.surveyName}`" @click="viewItems(survey.surveyName)">View items</button>
					<button type="button" class="rt-surveys-small" :data-testid="`rater-surveys-assign-${survey.surveyName}`" @click="openAssign(survey.surveyName)">Assign a person</button>
				</div>

				<div v-if="assignSurveyName === survey.surveyName" class="rt-surveys-assign" :data-testid="`rater-surveys-assign-form-${survey.surveyName}`">
					<form class="rt-surveys-form" @submit.prevent="assignNewRater">
						<h4 class="rt-surveys-h4">A new person on survey {{ survey.surveyName }}</h4>
						<label class="rt-field-label">Who they are (only you see this)
							<input v-model="assignWhoText" type="text" required placeholder="[name, organization]" class="rt-field" data-testid="rater-surveys-assign-who" />
						</label>
						<label class="rt-field-label">Email (optional)
							<input v-model="assignEmailAdr" type="email" class="rt-field" data-testid="rater-surveys-assign-email" />
						</label>
						<label class="rt-field-label">Sign-in name
							<input v-model="assignRaterUserName" type="text" required class="rt-field" data-testid="rater-surveys-assign-name" />
						</label>
						<div class="rt-surveys-actions">
							<button type="submit" class="rt-button" :disabled="!assignWhoText.trim()" data-testid="rater-surveys-assign-submit">Add and make a password</button>
							<button type="button" class="rt-button-quiet" data-testid="rater-surveys-assign-cancel" @click="closeAssign">Cancel</button>
						</div>
					</form>
					<form class="rt-surveys-form" @submit.prevent="moveRaterHere">
						<h4 class="rt-surveys-h4">Or move an existing rater here</h4>
						<select v-model="moveRaterUserName" class="rt-surveys-select" aria-label="Rater to move" data-testid="rater-surveys-move-pick">
							<option value="" disabled>Choose a rater on another survey</option>
							<option v-for="rater in moveCandidateListOf(survey.surveyName)" :key="rater.raterUserName" :value="rater.raterUserName" :disabled="!!rater.moveRefusal" :title="rater.moveRefusal ? rater.moveRefusal.refusalText : ''" :data-testid="`rater-surveys-move-option-${rater.raterUserName}`">
								{{ rater.raterUserName }} (survey {{ rater.surveyName }}){{ rater.moveRefusal ? ` — cannot move: ${rater.moveRefusal.refusalText}` : '' }}
							</option>
						</select>
						<button type="submit" class="rt-button-quiet" :disabled="!moveRaterUserName" data-testid="rater-surveys-move-submit">Move to survey {{ survey.surveyName }}</button>
					</form>
				</div>
			</article>
		</div>

		<div v-if="isViewingItems" class="rt-surveys-overlay" role="dialog" aria-modal="true" aria-labelledby="surveyItemsHead" data-testid="rater-surveys-items" @click.self="raterStore.adminCloseSurveyItems()">
			<div class="rt-panel rt-surveys-dialog">
				<header class="rt-surveys-dialog-head">
					<h3 id="surveyItemsHead" class="rt-serif rt-surveys-card-title">Survey {{ raterStore.adminSurveyItemSurveyName }}: {{ raterStore.adminSurveyItemList.length }} items, read-only</h3>
					<button type="button" class="rt-button-quiet" data-testid="rater-surveys-items-close" @click="raterStore.adminCloseSurveyItems()">Close</button>
				</header>
				<p class="rt-surveys-note">Each rater sees these in their own shuffled order, with suggested CEDS cards; the cards are not shown here. Preview opens the rating page a rater sees for that item.</p>
				<ol class="rt-surveys-item-list">
					<li v-for="item in raterStore.adminSurveyItemList" :key="item.elementStableId" data-testid="rater-surveys-item">
						<span class="rt-surveys-item-standard">{{ item.standard }}</span>
						<NuxtLink :to="previewRouteOf(raterStore.adminSurveyItemSurveyName, item.itemNumber)" class="rt-surveys-item-preview" :data-testid="`rater-surveys-item-preview-${item.itemNumber}`" @click="raterStore.adminCloseSurveyItems()">Preview</NuxtLink>
						<b class="rt-mono">{{ item.ownerName ? `${item.ownerName}/${item.name}` : item.name }}</b>
						<p class="rt-surveys-item-definition">{{ item.definition || item.definitionAbsentReason || 'No definition in the standard.' }}</p>
					</li>
				</ol>
			</div>
		</div>
	</section>
</template>

<style scoped>
.rt-surveys { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.rt-surveys-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.rt-surveys-h2 { margin: 0; font-size: 18px; }
.rt-surveys-h4 { margin: 0; font-size: 14px; color: #374151; }
.rt-surveys-hint { margin: 0; background: #EEF3FC; border: 1px solid #C9D3E8; border-radius: 8px; padding: 6px 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.rt-surveys-note { margin: 0; font-size: 13px; color: #4B5563; }
.rt-surveys-cards { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.rt-surveys-card { flex: 1 1 300px; min-width: 0; border: 1px solid #E3E7EF; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 8px; background: #FFFFFF; }
.rt-surveys-card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.rt-surveys-card-title { margin: 0; font-size: 20px; color: #072A6C; }
.rt-surveys-coverage { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; border-radius: 999px; padding: 3px 10px; }
.rt-surveys-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.rt-surveys-coverage-red { background: #FDECEC; color: #9B1C1C; }
.rt-surveys-coverage-red .rt-surveys-dot { background: #C62828; }
.rt-surveys-coverage-amber { background: #FFF6E8; color: #8A5300; }
.rt-surveys-coverage-amber .rt-surveys-dot { background: #E69B00; }
.rt-surveys-coverage-green { background: #EAF6EC; color: #1E6B2E; }
.rt-surveys-coverage-green .rt-surveys-dot { background: #2E8B47; }
.rt-surveys-items { margin: 0; font-size: 14px; color: #374151; }
.rt-surveys-raters { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.rt-surveys-raters li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; border-top: 1px solid #EEF0F4; padding-top: 6px; }
.rt-surveys-rater-name { font-weight: 700; }
.rt-surveys-rater-who { color: #4B5563; font-size: 13px; flex: 1 1 120px; min-width: 0; }
.rt-surveys-rater-progress { font-variant-numeric: tabular-nums; }
.rt-surveys-finished { font-size: 12px; font-weight: 700; color: #1E6B2E; background: #EAF6EC; border-radius: 999px; padding: 1px 8px; }
.rt-surveys-empty { color: #4B5563; }
.rt-surveys-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.rt-surveys-small { min-height: 36px; padding: 0 10px; border: 1px solid #C9D3E8; background: #FFFFFF; color: #072A6C; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.rt-surveys-link { display: inline-flex; align-items: center; text-decoration: none; }
.rt-surveys-item-preview { font-size: 13px; font-weight: 700; color: #072A6C; margin-right: 8px; }
.rt-surveys-assign { border-top: 1px dashed #C9D3E8; padding-top: 10px; display: flex; flex-direction: column; gap: 14px; }
.rt-surveys-form { display: flex; flex-direction: column; gap: 10px; }
.rt-surveys-select { min-height: 36px; border: 1px solid #C9D3E8; border-radius: 8px; padding: 0 6px; max-width: 100%; }
.rt-surveys-overlay { position: fixed; inset: 0; background: rgba(7, 42, 108, 0.35); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; z-index: 50; overflow-y: auto; }
.rt-surveys-dialog { width: min(900px, 100%); padding: 18px; display: flex; flex-direction: column; gap: 10px; background: #FFFFFF; }
.rt-surveys-dialog-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.rt-surveys-item-list { margin: 0; padding-left: 28px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
.rt-surveys-item-standard { display: inline-block; min-width: 48px; font-size: 12px; font-weight: 700; color: #4B5563; margin-right: 6px; }
.rt-surveys-item-definition { margin: 2px 0 0; color: #374151; line-height: 1.45; }
</style>
