// @concept: [[PiniaStorePattern]]
// @concept: [[SecurityFirstPattern]]
//
// accountApprovalStore — the approval page's data (WORKORDER-adminApproval-112126): one applicant, the decision on it,
// and the list of accounts waiting. Every request carries the signed-in admin's token; the server decides from the
// admin's STORED role whether they may see or decide anything, and refuses by name (notAnApprover) otherwise.
//
// Actions return true or false; the page shows statusMsg (an error, a refusal's reason) or noticeMsg (the server's reply).

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const accountApprovalStoreInitObject = {
	loading: false,
	statusMsg: '',
	noticeMsg: '',
	refusalName: '',
	applicant: null,
	latestDecision: null,
	adminApprovalEmailSuppress: false,
	pendingApplicantList: [],
};

// the text to show for a failed request: a refusal's reason, a plain-text error, or the network's message
const failureTextOf = (error, alternativeText) => error.response?.data?.reason || (typeof error.response?.data === 'string' ? error.response.data : '') || error.message || alternativeText;

export const useAccountApprovalStore = defineStore('accountApprovalStore', {
	state: () => ({ ...accountApprovalStoreInitObject, pendingApplicantList: [] }),

	actions: {
		clearMessages() {
			this.statusMsg = '';
			this.noticeMsg = '';
			this.refusalName = '';
		},

		// one authenticated request; the response, or false with statusMsg and refusalName set
		async postSignedIn(routePath, requestBody, alternativeFailureText) {
			const loginStore = useLoginStore();
			this.loading = true;
			this.clearMessages();
			try {
				return await axios.post(routePath, requestBody, { headers: { 'Content-Type': 'application/json', ...loginStore.getAuthTokenProperty } });
			} catch (error) {
				this.statusMsg = failureTextOf(error, alternativeFailureText);
				this.refusalName = error.response?.data?.refusalName || '';
				return false;
			} finally {
				this.loading = false;
			}
		},

		async loadApplicant(userRefId) {
			this.applicant = null;
			this.latestDecision = null;
			const response = await this.postSignedIn('/api/accountApprovalDetail', { userRefId }, 'The application could not be read - network or server error');
			if (!response) {
				return false;
			}
			const detail = response.data[0] || {};
			this.applicant = detail.applicant || null;
			this.latestDecision = detail.latestDecision || null;
			this.adminApprovalEmailSuppress = detail.adminApprovalEmailSuppress === true;
			return !!this.applicant;
		},

		async decide({ userRefId, decisionName, sendDeclineEmail }) {
			const response = await this.postSignedIn('/api/decideAccountApproval', { userRefId, decisionName, sendDeclineEmail }, 'The decision could not be recorded - network or server error');
			if (!response) {
				return false;
			}
			const result = response.data[0] || {};
			this.applicant = result.applicant || this.applicant;
			this.latestDecision = result.latestDecision || this.latestDecision;
			this.noticeMsg = result.message || '';
			return true;
		},

		async loadPendingList() {
			const loginStore = useLoginStore();
			try {
				const response = await axios.post('/api/listPendingApprovals', {}, { headers: { 'Content-Type': 'application/json', ...loginStore.getAuthTokenProperty } });
				this.pendingApplicantList = Array.isArray(response.data) ? response.data : [];
				return true;
			} catch (error) {
				// the page's own detail request reports a refusal; an empty list here says nothing more
				this.pendingApplicantList = [];
				return false;
			}
		},
	},
});
