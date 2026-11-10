// @concept: [[JwtTokenManagement]]
// @concept: [[PiniaStorePattern]]
// @concept: [[AuthenticatedApiCall]]
import axios from 'axios';
import { postLogin } from '../composables/postLogin.js';
import { profileVocabulary } from '../components/profileVocabulary.js';

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
// What a profile save may send: MUST equal selfEditablePropertyList in server/lib/user-profile-rules.json
// (gate B1, server/test/user-sql-and-save-hole.test.js). The current password goes only beside a new password.

const SELF_EDITABLE_PROPERTY_LIST = ['first', 'last', 'emailAdr', 'phone', 'password'];
const CURRENT_PASSWORD_PROPERTY_NAME = 'currentPassword';
const PASSWORD_PROPERTY_NAME = 'password';

// -------------------------------------------------------------------------
// Define initial state for the login store

const loginStoreInitObject = {
	loggedInUser: userFields,
	statusMsg: '',
	validUser: false,
};

// -------------------------------------------------------------------------
// Function to reset user state on logout

const logoutUser = (store) => {
	Object.keys(loginStoreInitObject).forEach((name) => (store[name] = ''));
	store.validUser = false;
};

// -------------------------------------------------------------------------
// Function to log state details (for debugging)

const logDetails = (store) => {
	Object.keys(loginStoreInitObject).forEach(
		(name) => name != 'password' && console.log(`${name}=${store[name]}`),
	);
};

// =========================================================================
// Define the login store using Pinia

export const useLoginStore = defineStore('loginStore', {
	// =========================================================================
	// STATE

	state: () => ({ ...loginStoreInitObject }),

	// =========================================================================
	// ACTIONS

	// Actions (methods) of the store
	actions: {
		// Placeholder function (currently empty)
		setByDate: function () {},

		// ------------------------------------------------------------
		// Logout action

		logout: function () {
			// Note: Using console.log temporarily - should be replaced with proper logging
			console.log('Logging out');
			logoutUser(this);
		},

		// ------------------------------------------------------------
		// acceptLoginReply — take a /api/login reply as this site's login. login() uses it, and so does the CEDS Rater
		// sign-in at /rater when an admin signs in there (raterStore.signIn), so the admin lands in /admin already logged
		// in instead of signing in twice (WORKORDER-RATER6).

		acceptLoginReply(response) {
			// Get user data from response
			const userObject = response.data[0]; // API returns a list

			// Store authentication tokens from headers
			this.authtoken = response.headers?.authtoken;
			this.authclaims = response.headers?.authclaims;
			this.authsecondsexpirationseconds =
				response.headers?.authsecondsexpirationseconds;
			// Check if user is inactive
			if (userObject.inactive) {
				logoutUser(this);
				this.statusMsg = 'Invalid login request';
				return false;
			}

			// Update state with user data
			Object.keys(userObject).forEach((name) => {
				this.loggedInUser[name] = userObject[name];
			});

			// the password typed at login is not kept: it was shown back by the profile page and sent with every save (review SF-3)
			this.loggedInUser[PASSWORD_PROPERTY_NAME] = '';

			this.validUser = true;
			return true;
		},

		// ------------------------------------------------------------
		// Login action

		async login() {
			try {
				// POST, credentials in the body: a GET query string lands in the request and nginx logs (2026-10-08);
				// postLogin falls back to GET only when the backend has no POST route
				const response = await postLogin({
					username: this.loggedInUser.username,
					password: this.loggedInUser.password,
				});

				return this.acceptLoginReply(response);
			} catch (error) {
				// Improved error handling with fallback
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

		async updateUserInfo(userEditObject, { isChangingPassword } = {}) {
			let error;
			let response;

			// -------------------------------------------------------------
			// IMPORTANT:
			// The server refuses, by name, any property outside its self-editable list
			// (server/lib/user-profile-rules.json); SELF_EDITABLE_PROPERTY_LIST above must equal it.
			// The record saved is always the signed-in user's own: no refId, username or role is sent.
			// -------------------------------------------------------------

			const editedUser = userEditObject.value;

			// the store keeps the password typed at login, so the password goes only when the user is changing it,
			// and then with the current password, which the server verifies before saving the new one
			const sentPropertyList = SELF_EDITABLE_PROPERTY_LIST.filter(
				(propertyName) =>
					editedUser[propertyName] !== undefined &&
					(propertyName !== PASSWORD_PROPERTY_NAME || isChangingPassword),
			);
			const saveData = sentPropertyList.reduce(
				(result, propertyName) => ({ ...result, [propertyName]: editedUser[propertyName] }),
				{},
			);
			if (isChangingPassword) {
				saveData[CURRENT_PASSWORD_PROPERTY_NAME] = editedUser[CURRENT_PASSWORD_PROPERTY_NAME];
			}

			// Prepare API request to save user data
			const url = '/api/saveUserData';
			const axiosParms = {
				method: 'post',
				url,
				data: saveData,
				headers: {
					from: 'loginStore.updateUserInfo',
					...this.getAuthTokenProperty,
				},
			};

			// Send API request
			try {
				response = await axios(axiosParms);
			} catch (err) {
				error = err;
			}

			// Handle errors
			if (error) {
				// a refusal answers { refusalName, reason }; any other error answers text
				if (error.response?.data?.reason) {
					this.statusMsg = error.response.data.reason;
				} else if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Update failed - network or server error';
				}
				return false;
			}

			const saveReplyRefId = response.data[0].refID;

			// the reply carries a fresh token; after a password change every older token of this account is refused
			// (sessionRevoked), so the store must take it
			if (response.headers?.authtoken) {
				this.authtoken = response.headers.authtoken;
				this.authclaims = response.headers.authclaims;
				this.authsecondsexpirationseconds = response.headers.authsecondsexpirationseconds;
			}

			if (saveReplyRefId == this.loggedInUser.refId) {
				// Update state with what was saved (never a password)
				sentPropertyList
					.filter((propertyName) => propertyName !== PASSWORD_PROPERTY_NAME)
					.forEach((propertyName) => {
						this.loggedInUser[propertyName] = saveData[propertyName];
					});
			}
			this.statusMsg = isChangingPassword ? profileVocabulary.passwordChangedText : 'SAVED';

			return true;
		},
	},

	// =========================================================================
	// GETTERS

	getters: {
		// Test getter (appends 'HELLO' to username)
		testing: (state) => state.loggedInUser.username + 'HELLO',

		// ------------------------------------------------------------
		// Returns a simplified user object with fields from userFields

		userDataForEdit: (state) => {
			return Object.keys(userFields).reduce((result, name) => {
				result[name] = state.loggedInUser[name];
				return result;
			}, {});
		},

		// ------------------------------------------------------------
		// Getter for authentication token property

		getAuthTokenProperty: (state) => {
			return { Authorization: `Bearer ${state.authtoken}` };
		},
	},
});
