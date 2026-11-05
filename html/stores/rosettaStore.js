// rosettaStore — the Rosetta page's calls: retrieval (open), then a judged job (signed in). Each action is a short, flat sequence with its error handling beside it. A refusal keeps the service's own name and reason, so the page says what the service said.

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

const ROUTE_BASE_PATH = '/api/standards/v1/rosetta';
const POLL_MILLISECONDS = 4000;
const OPEN_STATUS_LIST = ['queued', 'running', 'cancelling'];

const refusalOf = (requestError) => {
	const answer = requestError?.response?.data?.answer;
	return answer?.refusalName ? { refusalName: answer.refusalName, reason: answer.reason } : { refusalName: 'requestFailed', reason: requestError.message };
};

// a pasted document names its own form: an object with @context, one with properties, or a list of fields
const submissionOfText = (pastedText) => {
	const parsedDocument = JSON.parse(pastedText);
	if (Array.isArray(parsedDocument)) {
		return { fieldList: parsedDocument };
	}
	if (parsedDocument.fieldList) {
		return { fieldList: parsedDocument.fieldList };
	}
	return parsedDocument['@context'] ? { jsonLdContext: parsedDocument } : { jsonSchema: parsedDocument };
};

export const useRosettaStore = defineStore('rosettaStore', {
	state: () => ({
		pastedText: '',
		isBusy: false,
		refusal: null,
		retrievalAnswer: null,
		jobRefId: '',
		jobStatus: null,
		report: null,
		reportPage: 1,
		pollTimer: null,
	}),
	actions: {
		headers() {
			return { ...useLoginStore().getAuthTokenProperty };
		},
		submission() {
			try {
				return submissionOfText(this.pastedText);
			} catch (parseError) {
				this.refusal = { refusalName: 'notJson', reason: parseError.message };
				return null;
			}
		},
		async retrieve() {
			const submission = this.submission();
			if (!submission) {
				return;
			}
			this.isBusy = true;
			this.refusal = null;
			try {
				const reply = await axios.post(`${ROUTE_BASE_PATH}/retrieval`, submission);
				this.retrievalAnswer = reply.data.answer;
			} catch (requestError) {
				this.refusal = refusalOf(requestError);
			} finally {
				this.isBusy = false;
			}
		},
		async submitJob() {
			const submission = this.submission();
			if (!submission) {
				return;
			}
			this.isBusy = true;
			this.refusal = null;
			this.report = null;
			try {
				const reply = await axios.post(`${ROUTE_BASE_PATH}/jobs`, submission, { headers: this.headers() });
				this.jobRefId = reply.data.answer.jobRefId;
				this.jobStatus = reply.data.answer;
				this.pollJob();
			} catch (requestError) {
				this.refusal = refusalOf(requestError);
			} finally {
				this.isBusy = false;
			}
		},
		async pollJob() {
			try {
				const reply = await axios.get(`${ROUTE_BASE_PATH}/jobs/status`, { params: { jobRefId: this.jobRefId }, headers: this.headers() });
				this.jobStatus = reply.data.answer;
			} catch (requestError) {
				this.refusal = refusalOf(requestError);
				return;
			}
			if (OPEN_STATUS_LIST.includes(this.jobStatus.status)) {
				this.pollTimer = setTimeout(() => this.pollJob(), POLL_MILLISECONDS);
				return;
			}
			await this.fetchReport(1);
		},
		async fetchReport(pageNumber) {
			try {
				const reply = await axios.get(`${ROUTE_BASE_PATH}/jobs/fetch`, { params: { jobRefId: this.jobRefId, rowDetail: 'full', page: String(pageNumber) }, headers: this.headers() });
				this.report = reply.data.answer;
				this.reportPage = pageNumber;
			} catch (requestError) {
				this.refusal = refusalOf(requestError);
			}
		},
		async cancelJob() {
			try {
				const reply = await axios.post(`${ROUTE_BASE_PATH}/jobs/cancel`, { jobRefId: this.jobRefId }, { headers: this.headers() });
				this.jobStatus = { ...this.jobStatus, status: reply.data.answer.status };
			} catch (requestError) {
				this.refusal = refusalOf(requestError);
			}
		},
		stopPolling() {
			clearTimeout(this.pollTimer);
		},
	},
});
