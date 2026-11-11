// rosettaStore — the Rosetta page's calls: a judged job, open to anyone (signed in, or a visitor within smaller limits), its status, report and the prompts it was
// judged with. Each action is a short, flat sequence with its error handling beside it. A refusal keeps the service's own name and reason, so the page says what the service said.
// What the person pasted goes down the input ladder in rosettaFreeText.js first: JSON goes on as it always did; name/description lines, or free text the AI interprets
// (rosetta/interpret), stop for review, with the original kept for Undo. A reading never goes on to a job by itself.
// ⟪rosettaMeanings R1⟫ the page no longer shows candidates; rosetta/retrieval and rosetta_retrieve keep every capability (TQ Q83). ⟪R3⟫ a job opens from its link (openJob).

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';
import { ladderStepOf, reviewOf, undoPlanOf, ladderRefusalOf } from '@/stores/rosettaFreeText';
import { rosettaPageWords } from '@/components/rosetta/rosettaVocabulary';

const ROUTE_BASE_PATH = '/api/standards/v1/rosetta';
const POLL_MILLISECONDS = 4000;
const OPEN_STATUS_LIST = ['queued', 'running', 'cancelling'];

// what an action did, for the page to choose its tab by: only 'sent' means an answer came back
const OUTCOME = Object.freeze({ sent: 'sent', review: 'review', refused: 'refused' });

const refusalOf = (requestError) => {
	const answer = requestError?.response?.data?.answer;
	return answer?.refusalName ? { refusalName: answer.refusalName, reason: answer.reason } : { refusalName: 'requestFailed', reason: requestError.message };
};

export const useRosettaStore = defineStore('rosettaStore', {
	state: () => ({
		pastedText: '',
		isBusy: false,
		refusal: null,
		review: null,
		jobRefId: '',
		jobStatus: null,
		report: null,
		reportPage: 1,
		promptPage: null,
		pollTimer: null,
		lastSeenUserRefId: '',
	}),
	getters: {
		undoNeedsConfirmation: (state) => (state.review ? undoPlanOf({ pastedText: state.pastedText, review: state.review }).needsConfirmation : false),
	},
	actions: {
		// what one person pasted and read must not be there for the next: a sign-out in this tab leaves the store as it was, so the page asks when the person changes and whenever it opens
		forgetIfAnotherPerson(currentUserRefId) {
			if (this.lastSeenUserRefId && this.lastSeenUserRefId !== currentUserRefId) {
				clearTimeout(this.pollTimer);
				this.$reset();
			}
			this.lastSeenUserRefId = currentUserRefId || '';
		},
		headers() {
			return { ...useLoginStore().getAuthTokenProperty };
		},
		enterReview(review) {
			this.review = review;
			this.pastedText = review.interpretedText;
			this.refusal = null;
		},
		// Undo puts back exactly what was typed; the page asks first when undoNeedsConfirmation says the shown JSON was edited
		undoReview() {
			if (!this.review) {
				return;
			}
			this.pastedText = undoPlanOf({ pastedText: this.pastedText, review: this.review }).restoreText;
			this.review = null;
		},
		// rung 3: the server's AI reads the text; whatever it answers, the page stops for review or shows the refusal
		async interpret() {
			const originalText = this.pastedText;
			this.isBusy = true;
			try {
				const reply = await axios.post(`${ROUTE_BASE_PATH}/interpret`, { text: originalText });
				const { fieldList, droppedFieldCount, unusedLineCount } = reply.data;
				this.enterReview(reviewOf({ originalText, fieldList, readingKind: 'aiInterpretation', droppedFieldCount, unusedLineCount, nextStepText: rosettaPageWords.reviewNextStepText }));
				return OUTCOME.review;
			} catch (requestError) {
				this.refusal = ladderRefusalOf(refusalOf(requestError));
				return OUTCOME.refused;
			} finally {
				this.isBusy = false;
			}
		},
		// the ladder: { submission } to send, or { outcomeName } ('review' or 'refused') when the text stopped for review or was refused
		async submissionFromLadder() {
			this.refusal = null;
			const ladderStep = ladderStepOf(this.pastedText);
			if (ladderStep.refusal) {
				this.refusal = ladderStep.refusal;
				return { outcomeName: OUTCOME.refused };
			}
			if (ladderStep.lineReading) {
				this.enterReview(reviewOf({ originalText: this.pastedText, fieldList: ladderStep.lineReading.fieldList, readingKind: 'lineFormat', nextStepText: rosettaPageWords.reviewNextStepText }));
				return { outcomeName: OUTCOME.review };
			}
			if (ladderStep.needsInterpretation) {
				return { outcomeName: await this.interpret() };
			}
			this.review = null;
			return { submission: ladderStep.submission };
		},
		async submitJob() {
			const { submission, outcomeName } = await this.submissionFromLadder();
			if (!submission) {
				return outcomeName;
			}
			this.isBusy = true;
			this.report = null;
			this.promptPage = null;
			try {
				const reply = await axios.post(`${ROUTE_BASE_PATH}/jobs`, submission, { headers: this.headers() });
				this.jobRefId = reply.data.answer.jobRefId;
				this.jobStatus = reply.data.answer;
				this.pollJob();
				return OUTCOME.sent;
			} catch (requestError) {
				this.refusal = refusalOf(requestError);
				return OUTCOME.refused;
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
			await this.fetchPrompts(1);
		},
		// detail=audit: the page shows the judge's notes and reads the job's hub list, which the lean answer leaves out (P7a)
		async fetchReport(pageNumber) {
			try {
				const reply = await axios.get(`${ROUTE_BASE_PATH}/jobs/fetch`, { params: { jobRefId: this.jobRefId, rowDetail: 'full', detail: 'audit', page: String(pageNumber) }, headers: this.headers() });
				this.report = reply.data.answer;
				this.reportPage = pageNumber;
			} catch (requestError) {
				this.refusal = refusalOf(requestError);
			}
		},
		// ⟪rosettaMeanings R3⟫ a job named by its link: whoever may read it (its owner, or anyone holding an anonymous job's link) sees it as its submitter did
		async openJob(jobRefId) {
			clearTimeout(this.pollTimer);
			this.jobRefId = jobRefId;
			this.jobStatus = null;
			this.report = null;
			this.promptPage = null;
			this.refusal = null;
			await this.pollJob();
		},
		// ⟪rosettaMeanings R2⟫ the exact prompts the job was judged with, a page at a time (rosetta/jobs/prompts, the page's own API operation)
		async fetchPrompts(pageNumber) {
			try {
				const reply = await axios.get(`${ROUTE_BASE_PATH}/jobs/prompts`, { params: { jobRefId: this.jobRefId, page: String(pageNumber) }, headers: this.headers() });
				this.promptPage = reply.data.answer;
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
