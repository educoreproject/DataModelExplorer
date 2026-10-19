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
//
// Revision 18 amendment (TQ: "yes, save work"): an answer the rater has not saved yet is kept as a draft, one per item,
// named by rater, item number and element (a survey change can put another element at the same number), in
// answerDraftByPlaceName and mirrored to sessionStorage so a reload of the tab keeps it. Never localStorage: a shared
// machine must not hand one rater's drafts to the next. Storage that refuses leaves the drafts in the store only.
// Signing in or out forgets every draft. The rating screen decides what is a draft (RatingScreen.vue).

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';
import { postLogin } from '../composables/postLogin.js';

const SESSION_STORAGE_NAME = 'cedsRaterSession';
const ANSWER_DRAFT_STORAGE_NAME = 'cedsRaterAnswerDrafts';

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
	// frozen: every change replaces the map, so a reset to this object can never carry an old draft
	answerDraftByPlaceName: Object.freeze({}),
};

const answerDraftPlaceNameOf = ({ raterUserName, itemNumber, elementStableId }) => [raterUserName, itemNumber, elementStableId].join('|');

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

// the drafts saved in this tab for one rater; any other rater's are not read
const readSavedAnswerDrafts = (raterUserName) => {
	try {
		const savedText = window.sessionStorage.getItem(ANSWER_DRAFT_STORAGE_NAME);
		const savedDraftByPlaceName = savedText ? JSON.parse(savedText) : {};
		return Object.freeze(Object.fromEntries(Object.entries(savedDraftByPlaceName).filter(([, answerDraft]) => answerDraft.raterUserName === raterUserName)));
	} catch (storageError) {
		return Object.freeze({});
	}
};

const writeSavedAnswerDrafts = (answerDraftByPlaceName) => {
	try {
		if (answerDraftByPlaceName && Object.keys(answerDraftByPlaceName).length > 0) {
			window.sessionStorage.setItem(ANSWER_DRAFT_STORAGE_NAME, JSON.stringify(answerDraftByPlaceName));
		} else {
			window.sessionStorage.removeItem(ANSWER_DRAFT_STORAGE_NAME);
		}
	} catch (storageError) {
		// storage refused: the drafts last until the tab reloads
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
				this.answerDraftByPlaceName = readSavedAnswerDrafts(this.raterUserName);
			}
			return this.isSignedIn;
		},

		signOut() {
			Object.keys(raterStoreInitObject).forEach((fieldName) => {
				this[fieldName] = raterStoreInitObject[fieldName];
			});
			writeSavedSession(null);
			writeSavedAnswerDrafts(null);
		},

		// revision 18 amendment: the signed-in rater's unsaved answer on one item (null when there is none)
		answerDraftOf({ itemNumber, elementStableId }) {
			return this.answerDraftByPlaceName[answerDraftPlaceNameOf({ raterUserName: this.raterUserName, itemNumber, elementStableId })] || null;
		},

		keepAnswerDraft({ itemNumber, elementStableId, answerDraft }) {
			if (!this.raterUserName) {
				throw new Error('raterStore.keepAnswerDraft: no rater is signed in, so a draft has no owner');
			}
			const draftPlaceName = answerDraftPlaceNameOf({ raterUserName: this.raterUserName, itemNumber, elementStableId });
			this.answerDraftByPlaceName = Object.freeze({ ...this.answerDraftByPlaceName, [draftPlaceName]: { ...answerDraft, raterUserName: this.raterUserName, itemNumber, elementStableId } });
			writeSavedAnswerDrafts(this.answerDraftByPlaceName);
		},

		dropAnswerDraft({ itemNumber, elementStableId }) {
			const draftPlaceName = answerDraftPlaceNameOf({ raterUserName: this.raterUserName, itemNumber, elementStableId });
			if (!this.answerDraftByPlaceName[draftPlaceName]) {
				return;
			}
			this.answerDraftByPlaceName = Object.freeze(Object.fromEntries(Object.entries(this.answerDraftByPlaceName).filter(([placeName]) => placeName !== draftPlaceName)));
			writeSavedAnswerDrafts(this.answerDraftByPlaceName);
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
				const response = await postLogin({ username: `${raterUserName}`.trim().toLowerCase(), password });
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
				// a fresh sign-in starts with no drafts, whoever signed in before in this tab
				this.answerDraftByPlaceName = raterStoreInitObject.answerDraftByPlaceName;
				writeSavedAnswerDrafts(null);
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
