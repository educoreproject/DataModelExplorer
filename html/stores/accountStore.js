// @concept: [[PiniaStorePattern]]
// @concept: [[JwtTokenManagement]]
//
// accountStore — self-registration, email confirmation and password reset (WORKORDER-userRegistrationReset-112026).
// Every request here is PUBLIC: no Authorization header is sent. Where the server signs the user in (a completed reset,
// a confirmed registration, a registration that needs no confirmation), the reply is handed to loginStore's
// acceptLoginReply exactly as a /api/login reply is, so the rest of the site sees an ordinary sign-in.
//
// Actions return true or false; the page reads statusMsg (an error) or noticeMsg (the server's reply) and decides
// where to go. A refusal from the server answers { refusalName, reason }: reason is shown, refusalName is kept in
// refusalName so a page can offer the right next step.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const accountStoreInitObject = {
	loading: false,
	statusMsg: '',
	noticeMsg: '',
	refusalName: '',
	registrationOptions: { selfRegistrationEnabled: false, requireEmailConfirmation: true, isLoaded: false },
};

// the text to show for a failed request: a refusal's reason, a plain-text error, or the network's message
const failureTextOf = (error, alternativeText) => error.response?.data?.reason || (typeof error.response?.data === 'string' ? error.response.data : '') || error.message || alternativeText;

export const useAccountStore = defineStore('accountStore', {
	state: () => ({ ...accountStoreInitObject, registrationOptions: { ...accountStoreInitObject.registrationOptions } }),

	actions: {
		clearMessages() {
			this.statusMsg = '';
			this.noticeMsg = '';
			this.refusalName = '';
		},

		// one public request; the reply's first element, or false with statusMsg and refusalName set
		async postPublic(routePath, requestBody, alternativeFailureText) {
			this.loading = true;
			this.clearMessages();
			try {
				const response = await axios.post(routePath, requestBody, { headers: { 'Content-Type': 'application/json' } });
				return response;
			} catch (error) {
				this.statusMsg = failureTextOf(error, alternativeFailureText);
				this.refusalName = error.response?.data?.refusalName || '';
				return false;
			} finally {
				this.loading = false;
			}
		},

		// a reply that signs the user in: { message, user } plus the token headers
		acceptSignInReply(response) {
			const { message, user } = response.data[0] || {};
			this.noticeMsg = message || '';
			if (!user) {
				return false;
			}
			const loginStore = useLoginStore();
			return loginStore.acceptLoginReply({ data: [user], headers: response.headers });
		},

		async loadRegistrationOptions() {
			try {
				const response = await axios.get('/api/registrationOptions');
				this.registrationOptions = { ...(response.data[0] || {}), isLoaded: true };
				return true;
			} catch (error) {
				// no options means no register link: the login form simply does not offer it
				this.registrationOptions = { selfRegistrationEnabled: false, requireEmailConfirmation: true, isLoaded: true };
				return false;
			}
		},

		async requestPasswordReset(identifier) {
			const response = await this.postPublic('/api/requestPasswordReset', { identifier }, 'The request could not be sent - network or server error');
			if (!response) {
				return false;
			}
			this.noticeMsg = response.data[0]?.message || '';
			return true;
		},

		async completePasswordReset({ token, password }) {
			const response = await this.postPublic('/api/completePasswordReset', { token, password }, 'The password could not be saved - network or server error');
			return response ? this.acceptSignInReply(response) : false;
		},

		async registerUser({ username, password, first, last, emailAdr }) {
			const response = await this.postPublic('/api/registerUser', { username, password, first, last, emailAdr }, 'The account could not be created - network or server error');
			if (!response) {
				return false;
			}
			// signed in at once when no confirmation is required; otherwise the reply says to check email
			if (response.data[0]?.user) {
				return this.acceptSignInReply(response);
			}
			this.noticeMsg = response.data[0]?.message || '';
			return true;
		},

		async confirmRegistration(token) {
			const response = await this.postPublic('/api/confirmRegistration', { token }, 'The address could not be confirmed - network or server error');
			return response ? this.acceptSignInReply(response) : false;
		},

		async resendConfirmation(identifier) {
			const response = await this.postPublic('/api/resendConfirmation', { identifier }, 'The request could not be sent - network or server error');
			if (!response) {
				return false;
			}
			this.noticeMsg = response.data[0]?.message || '';
			return true;
		},
	},
});
