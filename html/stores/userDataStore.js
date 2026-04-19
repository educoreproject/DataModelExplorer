// @concept: [[JwtTokenManagement]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
// @concept: [[SessionPersistence]]
//
// userDataStore — everything about the logged-in user.
// Consolidates the prior loginStore (identity, auth tokens, profile edits) with
// the prior sessionStore (saved explorer conversations — renamed from
// "sessions" to "savedConversations"). See SPEC-dataStoreArchitecture-041826.md
// §2.3 for the design.
//
// Endpoints /api/dmeSession* keep their legacy names (see spec §6 non-changes).
import axios from 'axios';

// -------------------------------------------------------------------------
// Define initial user fields

const userFields = {
	refId: '',
	username: '',
	password: '',
	first: '',
	last: '',
	emailAdr: '',
	role: '',
};

// -------------------------------------------------------------------------
// Define initial state

const userDataStoreInitObject = {
	loggedInUser: userFields,
	authtoken: '',
	authclaims: '',
	authsecondsexpirationseconds: '',
	statusMsg: '',
	validUser: false,

	// Saved explorer conversations (absorbed from prior sessionStore)
	savedConversations: [],
	savedConversationsLoading: false,
	savedConversationsStatusMsg: '',
};

// -------------------------------------------------------------------------
// Function to reset user state on logout

const logoutUser = (store) => {
	Object.keys(userDataStoreInitObject).forEach((name) => (store[name] = ''));
	store.validUser = false;
	store.savedConversations = [];
};

// =========================================================================
// Define the userData store using Pinia

export const useUserDataStore = defineStore('userDataStore', {
	// =========================================================================
	// STATE

	state: () => ({ ...userDataStoreInitObject }),

	// =========================================================================
	// ACTIONS

	actions: {
		// Placeholder function (currently empty)
		setByDate: function () {},

		// ------------------------------------------------------------
		// Logout action

		logout: function () {
			console.log('Logging out');
			logoutUser(this);
		},

		// ------------------------------------------------------------
		// Login action

		async login() {
			const url = '/api/login';

			try {
				const response = await axios.get(url, {
					params: {
						username: this.loggedInUser.username,
						password: this.loggedInUser.password,
					},
				});

				const userObject = response.data[0];

				this.authtoken = response.headers?.authtoken;
				this.authclaims = response.headers?.authclaims;
				this.authsecondsexpirationseconds =
					response.headers?.authsecondsexpirationseconds;

				if (userObject.inactive) {
					logoutUser(this);
					this.statusMsg = 'Invalid login request';
					return false;
				}

				Object.keys(userObject).forEach((name) => {
					this.loggedInUser[name] = userObject[name];
				});

				this.validUser = true;
				return true;
			} catch (error) {
				if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Login failed - network or server error';
				}
				return false;
			}

			return;
		},

		// ------------------------------------------------------------
		// Update user information

		async updateUserInfo(userEditObject) {
			let error;
			let response;

			// -------------------------------------------------------------
			// IMPORTANT:
			// If you add fields here, you need to add them in the mapper/profile-user
			// -------------------------------------------------------------

			const saveData = { ...this.userSimpleObject, ...userEditObject.value };

			if (saveData.legacy === true) {
				saveData.role = saveData.role || '';
				const tmp = saveData.role.split(',');
				tmp.push('client');
				saveData.role = tmp.join(',').replace(/^,/, '');
			}

			const url = '/api/saveUserData';
			const axiosParms = {
				method: 'post',
				url,
				data: saveData,
				headers: {
					from: 'userDataStore.updateUserInfo',
					...this.getAuthTokenProperty,
				},
			};

			try {
				response = await axios(axiosParms);
			} catch (err) {
				error = err;
			}

			if (error) {
				if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Update failed - network or server error';
				}
				return false;
			}

			const saveReplyRefId = response.data[0].refID;

			if (saveReplyRefId == this.loggedInUser.refId) {
				Object.keys(userFields).forEach((name) => {
					if (name !== 'legacy') {
						this.loggedInUser[name] = saveData[name];
					}
				});
			}
			this.statusMsg = 'SAVED';

			return true;
		},

		// ------------------------------------------------------------
		// Saved explorer conversations (absorbed from prior sessionStore)

		async fetchSavedConversations() {
			this.savedConversationsLoading = true;
			this.savedConversationsStatusMsg = '';
			try {
				const response = await fetch('/api/dmeSessionList', {
					headers: { ...this.getAuthTokenProperty },
				});
				if (!response.ok) {
					this.savedConversationsStatusMsg = `Failed to load saved conversations (${response.status})`;
					this.savedConversations = [];
					return;
				}
				this.savedConversations = await response.json();
			} catch (err) {
				this.savedConversationsStatusMsg = err.message || 'Failed to load saved conversations';
				this.savedConversations = [];
			} finally {
				this.savedConversationsLoading = false;
			}
		},

		async deleteSavedConversation(refId) {
			try {
				const response = await fetch(
					`/api/dmeSessionDelete?refId=${encodeURIComponent(refId)}`,
					{
						method: 'DELETE',
						headers: { ...this.getAuthTokenProperty },
					},
				);
				if (!response.ok) {
					this.savedConversationsStatusMsg = `Delete failed (${response.status})`;
					return false;
				}
				await this.fetchSavedConversations();
				return true;
			} catch (err) {
				this.savedConversationsStatusMsg = err.message || 'Delete failed';
				return false;
			}
		},

		async saveSavedConversation(payload) {
			try {
				const response = await fetch('/api/dmeSessionSave', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...this.getAuthTokenProperty,
					},
					body: JSON.stringify(payload),
				});
				const result = await response.json();
				return (result && result[0]) ? result[0] : null;
			} catch (err) {
				this.savedConversationsStatusMsg = err.message || 'Save failed';
				return null;
			}
		},

		async loadSavedConversation(refId) {
			try {
				const response = await fetch(
					`/api/dmeSessionLoad?refId=${encodeURIComponent(refId)}`,
					{ headers: { ...this.getAuthTokenProperty } },
				);
				const result = await response.json();
				return (result && result[0]) ? result[0] : null;
			} catch (err) {
				this.savedConversationsStatusMsg = err.message || 'Load failed';
				return null;
			}
		},
	},

	// =========================================================================
	// GETTERS

	getters: {
		testing: (state) => state.loggedInUser.username + 'HELLO',

		userDataForEdit: (state) => {
			return Object.keys(userFields).reduce((result, name) => {
				result[name] = state.loggedInUser[name];
				return result;
			}, {});
		},

		getAuthTokenProperty: (state) => {
			return { Authorization: `Bearer ${state.authtoken}` };
		},

		savedConversationCount: (state) => state.savedConversations.length,
	},
});
