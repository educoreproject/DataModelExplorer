// raterStore.js — the CEDS Rater's browser state and its calls to /api/rater* (lane RATER, 2026-10-14).
//
// The rater area has its OWN sign-in (it is not the main site's login), so this store keeps its own token. The token is
// kept in sessionStorage so a reload does not sign the rater out; every read and write of it is guarded, because
// storage can be absent (private windows, blocked site data) and the page must still work, just without surviving a reload.
//
// Revision 6 (WORKORDER-RATER6): the admin screens live in the main /admin page (components/tools/ceds-rater-admin.vue),
// so every admin call is signed with the MAIN SITE's login (loginStore), never with the rater token. Which login signs a
// call is data: CREDENTIAL_BY_SOURCE_NAME below, named by every caller of raterPost. An admin who signs in at /rater is
// handed to the main login (loginStore.acceptLoginReply) and keeps no rater session; raters are untouched.
//
// The server is the only judge of an answer (server/data-model/lib/rater-tool/rater-answer-rules.js). Refusals come
// back as HTTP 400 '<refusalName>: <text> (<errorId>)'; the store shows the text and keeps the name.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const SESSION_STORAGE_NAME = 'cedsRaterSession';

const raterStoreInitObject = {
	authtoken: '',
	raterUserName: '',
	raterRole: '',
	item: null,
	progress: null,
	loading: false,
	saving: false,
	statusMsg: '',
	refusalName: '',
	adminRaterList: [],
	adminSurveyNameList: [],
	resultsTargetList: [],
	resultsSurveyNameList: [],
	resultsStandardNameList: [],
	adminGoldenContainerName: '',
	adminSurveyList: [],
	adminNextSurveyName: '',
	adminNextRaterUserName: '',
	adminSurveyItemList: [],
	adminSurveyItemSurveyName: '',
};

const readSavedSession = () => {
	try {
		const savedText = window.sessionStorage.getItem(SESSION_STORAGE_NAME);
		return savedText ? JSON.parse(savedText) : null;
	} catch (storageError) {
		return null;
	}
};

const writeSavedSession = (sessionObject) => {
	try {
		if (sessionObject) {
			window.sessionStorage.setItem(SESSION_STORAGE_NAME, JSON.stringify(sessionObject));
		} else {
			window.sessionStorage.removeItem(SESSION_STORAGE_NAME);
		}
	} catch (storageError) {
		// storage unavailable: the session lasts until the tab reloads
	}
};

const ADMIN_ROLE_LIST = ['admin', 'super'];

// who signs a call. raterSignIn: the rater area's own token (a refusal signs the rater out, as before). mainLogin: the
// main site's login, for the admin tool inside /admin; a refusal there is shown, and the main login is left alone.
const CREDENTIAL_BY_SOURCE_NAME = Object.freeze({
	raterSignIn: {
		authHeaderOf: (raterStore) => raterStore.authHeaderProperty,
		keepRefreshedToken: (raterStore, response) => raterStore.keepRefreshedToken(response),
		forgetRefusedSession: (raterStore) => raterStore.signOut(),
	},
	mainLogin: {
		authHeaderOf: () => useLoginStore().getAuthTokenProperty,
		keepRefreshedToken: (raterStore, response) => {
			if (response.headers?.authtoken) {
				useLoginStore().authtoken = response.headers.authtoken;
			}
		},
		forgetRefusedSession: () => {},
	},
});

// a main-site role that may use the CEDS Rater admin tool; the server's own gate (/api/raterAdmin) is the judge
export const isRaterAdminRole = (roleText) => `${roleText || ''}`.split(',').some((roleName) => ADMIN_ROLE_LIST.includes(roleName.trim()));

// '<refusalName>: <text> (<errorId>)' -> { refusalName, refusalText }
const refusalOf = (error, operationText) => {
	const responseText = typeof error.response?.data === 'string' ? error.response.data : '';
	const matched = responseText.match(/^([A-Za-z]+): ([\s\S]*?)(?: \([A-Za-z0-9_-]{6,}\))?$/);
	if (matched) {
		return { refusalName: matched[1], refusalText: matched[2] };
	}
	return { refusalName: error.response?.status === 401 ? 'notPermitted' : 'requestFailed', refusalText: responseText || error.message || `${operationText} failed` };
};

export const useRaterStore = defineStore('raterStore', {
	state: () => ({ ...raterStoreInitObject }),

	getters: {
		isSignedIn: (state) => !!state.authtoken,
		isAdmin: (state) => ADMIN_ROLE_LIST.includes(state.raterRole),
		authHeaderProperty: (state) => ({ Authorization: `Bearer ${state.authtoken}` }),
	},

	actions: {
		restoreSession() {
			const savedSession = readSavedSession();
			if (savedSession && savedSession.authtoken) {
				this.authtoken = savedSession.authtoken;
				this.raterUserName = savedSession.raterUserName;
				this.raterRole = savedSession.raterRole;
			}
			return this.isSignedIn;
		},

		signOut() {
			Object.keys(raterStoreInitObject).forEach((fieldName) => {
				this[fieldName] = raterStoreInitObject[fieldName];
			});
			writeSavedSession(null);
		},

		clearMessage() {
			this.statusMsg = '';
			this.refusalName = '';
		},

		keepRefreshedToken(response) {
			if (response.headers?.authtoken) {
				this.authtoken = response.headers.authtoken;
				writeSavedSession({ authtoken: this.authtoken, raterUserName: this.raterUserName, raterRole: this.raterRole });
			}
		},

		async signIn({ raterUserName, password }) {
			this.loading = true;
			this.clearMessage();
			try {
				const response = await axios.post('/api/login', { username: `${raterUserName}`.trim().toLowerCase(), password });
				const signedInUser = response.data[0];
				const signedInRole = signedInUser.role || '';
				if (!['rater', 'admin', 'super'].includes(signedInRole)) {
					this.statusMsg = 'This account is not a rater account.';
					this.refusalName = 'notARaterAccount';
					return false;
				}
				this.raterUserName = signedInUser.username;
				this.raterRole = signedInRole;
				this.authtoken = response.headers?.authtoken || '';
				if (this.isAdmin) {
					// revision 6: an admin works in /admin, signed in with the main login; no rater session is kept
					writeSavedSession(null);
					return useLoginStore().acceptLoginReply(response);
				}
				writeSavedSession({ authtoken: this.authtoken, raterUserName: this.raterUserName, raterRole: this.raterRole });
				return true;
			} catch (error) {
				this.statusMsg = error.response?.status === 401 ? 'That name and password do not match. Check them and try again.' : error.message || 'Sign-in failed';
				this.refusalName = 'signInFailed';
				return false;
			} finally {
				this.loading = false;
			}
		},

		// raterPost — every rater call: POST signed by the named credential source, the token refreshed from the reply,
		// refusals kept by name
		async raterPost(routeName, requestBody, operationText, credentialSourceName) {
			const credential = CREDENTIAL_BY_SOURCE_NAME[credentialSourceName];
			if (!credential) {
				return { refusal: { refusalName: 'credentialSourceInvalid', refusalText: `${operationText}: no credential source '${credentialSourceName}' (known: ${Object.keys(CREDENTIAL_BY_SOURCE_NAME).join(', ')})` } };
			}
			try {
				const response = await axios.post(`/api/${routeName}`, requestBody, { headers: { 'Content-Type': 'application/json', ...credential.authHeaderOf(this) } });
				credential.keepRefreshedToken(this, response);
				return { answer: response.data[0] };
			} catch (error) {
				const refusal = refusalOf(error, operationText);
				if (refusal.refusalName === 'notPermitted' || /token error/i.test(refusal.refusalText)) {
					credential.forgetRefusedSession(this);
				}
				return { refusal };
			}
		},

		async loadProgress() {
			this.loading = true;
			this.clearMessage();
			try {
				const { answer, refusal } = await this.raterPost('raterProgress', {}, 'Reading your progress', 'raterSignIn');
				if (refusal) {
					this.statusMsg = refusal.refusalText;
					this.refusalName = refusal.refusalName;
					return false;
				}
				this.progress = answer;
				return true;
			} finally {
				this.loading = false;
			}
		},

		async loadItem(itemNumber) {
			this.loading = true;
			this.clearMessage();
			try {
				const { answer, refusal } = await this.raterPost('raterItemGet', { itemNumber }, 'Reading the item', 'raterSignIn');
				if (refusal) {
					this.statusMsg = refusal.refusalText;
					this.refusalName = refusal.refusalName;
					return false;
				}
				this.item = answer;
				this.progress = answer.progress;
				return true;
			} finally {
				this.loading = false;
			}
		},

		async saveAnswer(answerSubmission) {
			this.saving = true;
			this.clearMessage();
			try {
				const { answer, refusal } = await this.raterPost('raterAnswerSave', answerSubmission, 'Saving', 'raterSignIn');
				if (refusal) {
					this.statusMsg = refusal.refusalText;
					this.refusalName = refusal.refusalName;
					return false;
				}
				this.progress = answer.progress;
				return true;
			} finally {
				this.saving = false;
			}
		},

		// search and browse answer to the finder, which keeps its own loading / empty / error state
		async search({ elementStableId, searchMode, queryText }) {
			return this.raterPost('raterSearch', { elementStableId, searchMode, queryText }, 'Searching CEDS', 'raterSignIn');
		},

		async browse({ browseMode, conceptName, classCedsId }) {
			return this.raterPost('raterBrowse', { browseMode, conceptName, classCedsId }, 'Browsing CEDS', 'raterSignIn');
		},

		async finish() {
			this.saving = true;
			this.clearMessage();
			try {
				const { answer, refusal } = await this.raterPost('raterFinish', {}, 'Finishing', 'raterSignIn');
				if (refusal) {
					this.statusMsg = refusal.refusalText;
					this.refusalName = refusal.refusalName;
					return false;
				}
				this.progress = answer;
				return true;
			} finally {
				this.saving = false;
			}
		},

		// every admin call (the CEDS Rater tool inside /admin) is signed with the main site's login
		async adminAction(adminRequest) {
			this.clearMessage();
			const { answer, refusal } = await this.raterPost('raterAdmin', adminRequest, 'The admin action', 'mainLogin');
			if (refusal) {
				this.statusMsg = refusal.refusalText;
				this.refusalName = refusal.refusalName;
				return null;
			}
			return answer;
		},

		// revision 4: the admin Results page — per target, answered of assigned and the votes per distinct answer
		async adminLoadResults() {
			this.loading = true;
			try {
				const answer = await this.adminAction({ adminAction: 'results', resultsFormat: 'json' });
				if (!answer) {
					return false;
				}
				this.resultsTargetList = Array.isArray(answer.targetList) ? answer.targetList : [];
				this.resultsSurveyNameList = answer.surveyNameList;
				this.resultsStandardNameList = answer.standardNameList;
				return true;
			} finally {
				this.loading = false;
			}
		},

		// revision 5: the admin screen's Surveys section — one card per survey, the next survey to fill, the next free name
		async adminLoadSurveys() {
			this.loading = true;
			try {
				const answer = await this.adminAction({ adminAction: 'surveys' });
				if (!answer) {
					return false;
				}
				this.adminSurveyList = answer.surveyList;
				this.adminNextSurveyName = answer.nextSurveyName;
				this.adminNextRaterUserName = answer.nextRaterUserName;
				return true;
			} finally {
				this.loading = false;
			}
		},

		// revision 5: a survey's targets, read-only, as a rater sees them (no candidates, no gold)
		async adminLoadSurveyItems(surveyName) {
			this.loading = true;
			try {
				const answer = await this.adminAction({ adminAction: 'surveyItems', surveyName });
				if (!answer) {
					return false;
				}
				this.adminSurveyItemList = answer.itemList;
				this.adminSurveyItemSurveyName = surveyName;
				return true;
			} finally {
				this.loading = false;
			}
		},

		// revision 8: the admin's preview of the real rating page. A READ: the item lands where a rater's does (item,
		// progress), so the one rating screen shows it; search and browse answer to the finder like the rater's. Nothing
		// here can write: the server's preview actions are reads, and the rater write endpoints refuse an admin token.
		async adminPreviewItem({ surveyName, itemNumber }) {
			this.loading = true;
			try {
				const answer = await this.adminAction({ adminAction: 'previewItem', surveyName, itemNumber });
				if (!answer) {
					this.item = null;
					this.progress = null;
					return false;
				}
				this.item = answer;
				this.progress = answer.progress;
				return true;
			} finally {
				this.loading = false;
			}
		},

		async adminPreviewSearch({ surveyName, elementStableId, searchMode, queryText }) {
			return this.raterPost('raterAdmin', { adminAction: 'previewSearch', surveyName, elementStableId, searchMode, queryText }, 'Searching CEDS', 'mainLogin');
		},

		async adminPreviewBrowse({ browseMode, conceptName, classCedsId }) {
			return this.raterPost('raterAdmin', { adminAction: 'previewBrowse', browseMode, conceptName, classCedsId }, 'Browsing CEDS', 'mainLogin');
		},

		adminCloseSurveyItems() {
			this.adminSurveyItemList = [];
			this.adminSurveyItemSurveyName = '';
		},

		async adminLoadList() {
			this.loading = true;
			try {
				const answer = await this.adminAction({ adminAction: 'list' });
				if (!answer) {
					return false;
				}
				this.adminRaterList = answer.raterList;
				this.adminSurveyNameList = answer.surveyNameList;
				this.adminGoldenContainerName = answer.goldenContainerName;
				return true;
			} finally {
				this.loading = false;
			}
		},
	},
});
