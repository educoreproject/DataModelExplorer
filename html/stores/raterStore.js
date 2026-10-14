// raterStore.js — the CEDS Rater's browser state and its calls to /api/rater* (lane RATER, 2026-10-14).
//
// The rater area has its OWN sign-in (it is not the main site's login), so this store keeps its own token. The token is
// kept in sessionStorage so a reload does not sign the rater out; every read and write of it is guarded, because
// storage can be absent (private windows, blocked site data) and the page must still work, just without surviving a reload.
//
// The server is the only judge of an answer (server/data-model/lib/rater-tool/rater-answer-rules.js). Refusals come
// back as HTTP 400 '<refusalName>: <text> (<errorId>)'; the store shows the text and keeps the name.

import axios from 'axios';

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
	adminGoldenContainerName: '',
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
		isAdmin: (state) => ['admin', 'super'].includes(state.raterRole),
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

		// raterPost — every rater call: POST with the token, the token refreshed from the reply, refusals kept by name
		async raterPost(routeName, requestBody, operationText) {
			try {
				const response = await axios.post(`/api/${routeName}`, requestBody, { headers: { 'Content-Type': 'application/json', ...this.authHeaderProperty } });
				this.keepRefreshedToken(response);
				return { answer: response.data[0] };
			} catch (error) {
				const refusal = refusalOf(error, operationText);
				if (refusal.refusalName === 'notPermitted' || /token error/i.test(refusal.refusalText)) {
					this.signOut();
				}
				return { refusal };
			}
		},

		async loadProgress() {
			this.loading = true;
			this.clearMessage();
			try {
				const { answer, refusal } = await this.raterPost('raterProgress', {}, 'Reading your progress');
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
				const { answer, refusal } = await this.raterPost('raterItemGet', { itemNumber }, 'Reading the item');
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
				const { answer, refusal } = await this.raterPost('raterAnswerSave', answerSubmission, 'Saving');
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
			return this.raterPost('raterSearch', { elementStableId, searchMode, queryText }, 'Searching CEDS');
		},

		async browse({ browseMode, conceptName, classCedsId }) {
			return this.raterPost('raterBrowse', { browseMode, conceptName, classCedsId }, 'Browsing CEDS');
		},

		async finish() {
			this.saving = true;
			this.clearMessage();
			try {
				const { answer, refusal } = await this.raterPost('raterFinish', {}, 'Finishing');
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

		async adminAction(adminRequest) {
			this.clearMessage();
			const { answer, refusal } = await this.raterPost('raterAdmin', adminRequest, 'The admin action');
			if (refusal) {
				this.statusMsg = refusal.refusalText;
				this.refusalName = refusal.refusalName;
				return null;
			}
			return answer;
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
