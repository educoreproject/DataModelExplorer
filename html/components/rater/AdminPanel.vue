<script setup>
// RaterAdminPanel — the CEDS Rater admin: raters and progress (design: Admin, practice column dropped). The raters table
// (survey, rated of 50, finished, last active; change survey, reset password, remove); add a rater with one survey ("Add
// and make a password": the server makes the password and shows it once); download every answer as JSON or CSV.
// Revision 4: a Results button. Revision 5: the Surveys section (components/rater/Surveys.vue) above the raters table,
// and a Copy button on the once-only password notice.
// Revision 6 (WORKORDER-RATER6): moved here from the /rater/admin page, which now redirects; its one host is the CEDS
// Rater tab of /admin (components/tools/ceds-rater-admin.vue). The HOST is the guard: it renders this panel only for a
// main-site admin, so the panel loads itself on mount, and every call it makes is signed with the main login.
// Emits 'open-results' (the host shows the Results view).
import { ref, computed, onMounted } from 'vue';
import { useRaterStore } from '@/stores/raterStore';

const emit = defineEmits(['open-results']);
const raterStore = useRaterStore();

const newRaterUserName = ref('');
const newWhoText = ref('');
const newEmailAdr = ref('');
const newSurveyName = ref('');
const issuedNotice = ref(null);
const actionNotice = ref('');
const surveyEditUserName = ref('');
const surveyEditName = ref('');
const surveysSection = ref(null);
const copyNotice = ref('');

const savedTotal = computed(() => raterStore.adminRaterList.reduce((soFar, rater) => soFar + rater.savedCount, 0));
const itemTotal = computed(() => raterStore.adminRaterList.reduce((soFar, rater) => soFar + rater.itemCount, 0));
const dateTextOf = (isoText) => (isoText ? new Date(isoText).toLocaleString() : 'never');

const refreshList = async () => {
	await raterStore.adminLoadList();
	if (surveysSection.value) {
		await surveysSection.value.loadSurveys();
	}
};

const showIssued = (issued) => {
	actionNotice.value = '';
	copyNotice.value = '';
	issuedNotice.value = issued;
};

const copyIssued = async () => {
	try {
		await navigator.clipboard.writeText(`Sign-in name: ${issuedNotice.value.raterUserName}\nPassword: ${issuedNotice.value.issuedPassword}`);
		copyNotice.value = 'Copied.';
	} catch (clipboardError) {
		copyNotice.value = 'The browser would not copy; select the password and copy it by hand.';
	}
};

const addRater = async () => {
	issuedNotice.value = null;
	actionNotice.value = '';
	const answer = await raterStore.adminAction({ adminAction: 'add', raterUserName: newRaterUserName.value, whoText: newWhoText.value, emailAdr: newEmailAdr.value, surveyName: newSurveyName.value });
	if (!answer) {
		return;
	}
	showIssued({ raterUserName: answer.raterUserName, issuedPassword: answer.issuedPassword, surveyName: answer.surveyName });
	newRaterUserName.value = '';
	newWhoText.value = '';
	newEmailAdr.value = '';
	await refreshList();
};

const resetPassword = async (rater) => {
	issuedNotice.value = null;
	const answer = await raterStore.adminAction({ adminAction: 'passwordReset', raterUserName: rater.raterUserName });
	if (answer) {
		showIssued({ raterUserName: answer.raterUserName, issuedPassword: answer.issuedPassword, surveyName: rater.surveyName });
	}
};

const startSurveyChange = (rater) => {
	surveyEditUserName.value = rater.raterUserName;
	surveyEditName.value = rater.surveyName;
};

const saveSurveyChange = async (forced) => {
	const answer = await raterStore.adminAction({ adminAction: 'surveyChange', raterUserName: surveyEditUserName.value, surveyName: surveyEditName.value, forced });
	if (answer) {
		actionNotice.value = `${answer.raterUserName} is now on survey ${answer.surveyName}${answer.keptAnswerCount ? ` (their ${answer.keptAnswerCount} earlier answers are kept in the download)` : ''}.`;
		surveyEditUserName.value = '';
		await refreshList();
	}
};

const removeRater = async (rater) => {
	if (!window.confirm(`Remove ${rater.raterUserName}, their sign-in and all ${rater.answerCount} of their answers? This cannot be undone.`)) {
		return;
	}
	const answer = await raterStore.adminAction({ adminAction: 'remove', raterUserName: rater.raterUserName });
	if (answer) {
		actionNotice.value = `${answer.raterUserName} was removed.`;
		await refreshList();
	}
};

const download = async (downloadFormat) => {
	const answer = await raterStore.adminAction({ adminAction: 'download', downloadFormat });
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
	actionNotice.value = `Downloaded ${answer.recordCount} answers as ${answer.fileName}.`;
};

// a child's onMounted runs before its parent's, so RaterSurveys is mounted (and its ref set) by the time this runs
onMounted(async () => {
	await refreshList();
	newSurveyName.value = raterStore.adminSurveyNameList[0] || '';
});
</script>

<template>
	<div class="rt-admin-main" data-testid="rater-admin-panel">
		<div class="rt-admin-top">
			<div>
				<h1 class="rt-serif rt-admin-title">Mapping Survey: raters and progress</h1>
				<p class="rt-admin-sub">CEDS copy in use: <b data-testid="rater-admin-gold">{{ raterStore.adminGoldenContainerName }}</b> (frozen for this round)</p>
			</div>
			<div class="rt-admin-top-right">
				<span class="rt-admin-sub">{{ raterStore.adminSurveyNameList.length }} surveys of 50 · {{ raterStore.adminRaterList.length }} raters · {{ savedTotal }} of {{ itemTotal }} items rated</span>
				<button type="button" class="rt-button" data-testid="rater-admin-results-link" @click="emit('open-results')">Results</button>
			</div>
		</div>

		<p v-if="raterStore.statusMsg" role="alert" class="rt-alert-error" data-testid="rater-admin-error">{{ raterStore.statusMsg }}</p>
		<p v-if="actionNotice" role="status" class="rt-alert-ok">{{ actionNotice }}</p>
		<div v-if="issuedNotice && issuedNotice.issuedPassword" role="status" class="rt-admin-issued" data-testid="rater-admin-issued">
			<b>{{ issuedNotice.raterUserName }}</b> (survey {{ issuedNotice.surveyName }}) can sign in with the password
			<code class="rt-mono" data-testid="rater-admin-issued-password">{{ issuedNotice.issuedPassword }}</code>
			. Copy it now and send it to them: it is not shown again.
			<button type="button" class="rt-admin-small" data-testid="rater-admin-issued-copy" @click="copyIssued">Copy</button>
			<span v-if="copyNotice" data-testid="rater-admin-issued-copied">{{ copyNotice }}</span>
		</div>

		<RaterRatingPages />

		<RaterSurveys ref="surveysSection" @issued="showIssued" @changed="raterStore.adminLoadList()" />

		<div class="rt-admin-columns">
			<section aria-labelledby="tblHead" class="rt-panel rt-admin-table-card">
				<h2 id="tblHead" class="rt-admin-h2">Raters</h2>
				<div class="rt-admin-table-wrap">
					<table class="rt-admin-table" data-testid="rater-admin-table">
						<thead>
							<tr>
								<th scope="col">Rater</th>
								<th scope="col">Survey</th>
								<th scope="col">Rated</th>
								<th scope="col">Finished</th>
								<th scope="col">Last active</th>
								<th scope="col"><span class="rt-sr">Actions</span></th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="rater in raterStore.adminRaterList" :key="rater.raterUserName" :data-testid="`rater-admin-row-${rater.raterUserName}`">
								<th scope="row">{{ rater.raterUserName }}<br /><span class="rt-admin-who">{{ rater.display.whoText || '' }}</span></th>
								<td>
									<template v-if="surveyEditUserName === rater.raterUserName">
										<select v-model="surveyEditName" class="rt-admin-select" aria-label="New survey">
											<option v-for="surveyName in raterStore.adminSurveyNameList" :key="surveyName" :value="surveyName">{{ surveyName }}</option>
										</select>
										<button type="button" class="rt-admin-small" @click="saveSurveyChange(false)">Save</button>
										<button v-if="raterStore.refusalName === 'surveyChangeWithAnswers'" type="button" class="rt-admin-small" @click="saveSurveyChange(true)">Change anyway</button>
										<button type="button" class="rt-admin-small" @click="surveyEditUserName = ''">Cancel</button>
									</template>
									<b v-else class="rt-admin-survey">Survey {{ rater.surveyName }}</b>
								</td>
								<td>
									<span class="rt-admin-count" data-testid="rater-admin-rated">{{ rater.savedCount }} / {{ rater.itemCount }}</span>
									<span aria-hidden="true" class="rt-admin-bar"><span :style="{ width: `${Math.round((100 * rater.savedCount) / (rater.itemCount || 1))}%` }"></span></span>
								</td>
								<td :data-testid="`rater-admin-finished-${rater.raterUserName}`">{{ rater.finishedAt ? `✓ Locked ${dateTextOf(rater.finishedAt)}` : 'not yet' }}</td>
								<td>{{ dateTextOf(rater.lastActiveAt) }}</td>
								<td class="rt-admin-actions">
									<button type="button" class="rt-admin-small" @click="startSurveyChange(rater)">Change survey</button>
									<button type="button" class="rt-admin-small" @click="resetPassword(rater)">Reset password</button>
									<button type="button" class="rt-admin-small rt-admin-danger" @click="removeRater(rater)">Remove</button>
								</td>
							</tr>
							<tr v-if="raterStore.adminRaterList.length === 0"><td colspan="6" class="rt-admin-empty">No raters yet. Add one on the right.</td></tr>
						</tbody>
					</table>
				</div>
				<p class="rt-admin-note">Each survey mixes Ed-Fi, SIF and PESC elements. A survey cannot be changed once a rater has saved answers, unless you say so; their earlier answers are kept.</p>
			</section>

			<div class="rt-admin-side">
				<section aria-labelledby="addHead" class="rt-panel rt-admin-form">
					<h2 id="addHead" class="rt-admin-h2">Add a rater</h2>
					<form class="rt-admin-form-fields" @submit.prevent="addRater">
						<label class="rt-field-label">Sign-in name
							<input v-model="newRaterUserName" type="text" placeholder="rater-06" class="rt-field" data-testid="rater-admin-new-name" />
						</label>
						<label class="rt-field-label">Who they are (only you see this)
							<input v-model="newWhoText" type="text" placeholder="[name, organization]" class="rt-field" data-testid="rater-admin-new-who" />
						</label>
						<label class="rt-field-label">Email (optional)
							<input v-model="newEmailAdr" type="email" class="rt-field" data-testid="rater-admin-new-email" />
						</label>
						<fieldset class="rt-admin-survey-pick">
							<legend>Survey (each is 50 mixed elements)</legend>
							<label v-for="surveyName in raterStore.adminSurveyNameList" :key="surveyName" class="rt-admin-survey-option">
								<input v-model="newSurveyName" type="radio" name="survey" :value="surveyName" :data-testid="`rater-admin-new-survey-${surveyName}`" />{{ surveyName }}
							</label>
						</fieldset>
						<button type="submit" class="rt-button" data-testid="rater-admin-add">Add and make a password</button>
					</form>
				</section>

				<section aria-labelledby="dlHead" class="rt-panel rt-admin-form">
					<h2 id="dlHead" class="rt-admin-h2">Download answers</h2>
					<p class="rt-admin-note">Every rater’s answers in one file, with each answer’s edit history and how each card was found.</p>
					<div class="rt-admin-download">
						<button type="button" class="rt-button" data-testid="rater-admin-download-json" @click="download('json')">Download JSON</button>
						<button type="button" class="rt-button-quiet" data-testid="rater-admin-download-csv" @click="download('csv')">Download CSV</button>
					</div>
				</section>
			</div>
		</div>
	</div>
</template>

<style scoped>
.rt-admin-main { max-width: 1400px; margin: 0 auto; padding: 28px clamp(16px, 3vw, 40px) 64px; box-sizing: border-box; display: flex; flex-direction: column; gap: 20px; font-size: 15px; }
.rt-admin-top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
.rt-admin-title { margin: 0; font-size: 34px; color: #072A6C; }
.rt-admin-sub { margin: 4px 0 0; color: #4B5563; font-size: 14px; }
.rt-admin-top-right { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.rt-admin-issued { background: #FFF6E8; border: 1px solid #F5C77E; border-radius: 8px; padding: 10px 12px; }
.rt-admin-issued code { font-size: 16px; background: #FFFFFF; padding: 2px 6px; border-radius: 4px; }
.rt-admin-columns { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
.rt-admin-table-card { flex: 999 1 840px; min-width: 0; padding: 16px; }
.rt-admin-h2 { margin: 0 0 12px; font-size: 18px; }
.rt-admin-table-wrap { overflow-x: auto; border: 1px solid #E3E7EF; border-radius: 10px; }
.rt-admin-table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 14px; }
.rt-admin-table thead tr { background: #F3F5FA; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #4B5563; }
.rt-admin-table th, .rt-admin-table td { padding: 10px 12px; vertical-align: middle; text-align: left; }
.rt-admin-table tbody tr { border-top: 1px solid #EEF0F4; }
.rt-admin-who { font-weight: 400; font-size: 13px; color: #4B5563; }
.rt-admin-survey { color: #072A6C; }
.rt-admin-count { font-variant-numeric: tabular-nums; display: block; }
.rt-admin-bar { position: relative; display: block; width: 120px; height: 6px; background: #E3E7EF; border-radius: 3px; overflow: hidden; margin-top: 4px; }
.rt-admin-bar span { position: absolute; left: 0; top: 0; bottom: 0; background: #072A6C; }
.rt-admin-actions { white-space: nowrap; }
.rt-admin-small { min-height: 36px; padding: 0 10px; margin: 2px; border: 1px solid #C9D3E8; background: #FFFFFF; color: #072A6C; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.rt-admin-danger { color: #9B1C1C; border-color: #E8B4B8; }
.rt-admin-select { min-height: 36px; border: 1px solid #C9D3E8; border-radius: 8px; padding: 0 6px; }
.rt-admin-empty { color: #4B5563; text-align: center; }
.rt-admin-note { margin: 10px 2px 0; font-size: 13px; color: #4B5563; line-height: 1.5; }
.rt-admin-side { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.rt-admin-form { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.rt-admin-form-fields { display: flex; flex-direction: column; gap: 12px; }
.rt-admin-survey-pick { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 18px; }
.rt-admin-survey-pick legend { font-weight: 600; color: #374151; margin-bottom: 6px; }
.rt-admin-survey-option { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; }
.rt-admin-download { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
