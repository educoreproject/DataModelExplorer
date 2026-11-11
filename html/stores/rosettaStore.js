// rosettaStore — the Rosetta page's calls: a judged job, open to anyone (signed in, or a visitor within smaller limits), its status, report and the prompts it was
// judged with. Each action is a short, flat sequence with its error handling beside it. A refusal keeps the service's own name and reason, so the page says what the service said.
// What the person pasted goes down the input ladder in rosettaFreeText.js first: JSON goes on as it always did; name/description lines, or free text the AI interprets
// (rosetta/interpret), stop for review, with the original kept for Undo. A reading never goes on to a job by itself.
// ⟪rosettaMeanings R1⟫ the page no longer shows candidates; rosetta/retrieval and rosetta_retrieve keep every capability (TQ Q83). ⟪R3⟫ a job opens from its link (openJob).
// ⟪rosettaReportLegible⟫ how each proposed meaning links into the graph is the Meanings explorer's own answer ("Expressed in"), asked until counted (readExpressions);
// a job that ends done marks its report unseen until the Report tab is opened (markReportSeen).

import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';
import { ladderStepOf, reviewOf, undoPlanOf, ladderRefusalOf } from '@/stores/rosettaFreeText';
import { rosettaPageWords, wordsOf } from '@/components/rosetta/rosettaVocabulary';
import { proposedMeaningUriListOf, meaningReadPlanOf, meaningNodeStableIdOf, JOB_OPEN_STATUS_LIST, JOB_STATUS_DONE, BUSY_STEP_NAME } from '@/components/rosetta/rosettaReportBlocks';

const ROUTE_BASE_PATH = '/api/standards/v1/rosetta';
// the Meanings explorer's answer for one meaning (stores/standardsNeighbourhoodStore.js asks the same); the walk is public, so a visitor sends no token
const NEIGHBOURHOOD_URL = '/api/standards-neighbourhood';
const POLL_MILLISECONDS = 4000;
const OPEN_STATUS_LIST = JOB_OPEN_STATUS_LIST;

// what an action did, for the page to choose its tab by: only 'sent' means an answer came back
const OUTCOME = Object.freeze({ sent: 'sent', review: 'review', refused: 'refused' });

// ⟪review N2⟫ why a Meanings read failed: the server's refusal when it answered in plain words, its HTTP status when it answered with a page, else the request's own error
const HTML_BODY_PATTERN = /^\s*</;
const unreadReasonOf = (requestError) => {
	const response = requestError?.response;
	if (response && typeof response.data === 'string' && response.data !== '' && !HTML_BODY_PATTERN.test(response.data)) return response.data;
	if (response && response.status) return wordsOf(rosettaPageWords.reportExpressedHttpTemplate, { httpStatus: response.status, httpStatusText: response.statusText || '' });
	return requestError.message;
};

const refusalOf = (requestError) => {
	const answer = requestError?.response?.data?.answer;
	// ⟪rosettaLoginPolish #5⟫ no refusal from the service: the request's own error, inside a sentence from the vocabulary
	return answer?.refusalName ? { refusalName: answer.refusalName, reason: answer.reason } : { refusalName: 'requestFailed', reason: wordsOf(rosettaPageWords.requestFailedTemplate, { requestErrorText: requestError.message }) };
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
		// meaning URI → { expressionCount } from the Meanings answer, or { unreadReason } when it could not be read
		expressionByMeaningUri: {},
		reportUnseen: false,
		// ⟪review S4⟫ what the store is busy with before a status speaks (BUSY_STEP_NAME); ⟪review S2⟫ the last status check failed
		busyStepName: BUSY_STEP_NAME.none,
		isStatusCheckFailed: false,
		// ⟪review S1⟫ the page's open tab, so a return to the page (Back from Meanings) opens it again
		shownTabName: '',
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
			this.busyStepName = BUSY_STEP_NAME.interpreting;
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
				this.busyStepName = BUSY_STEP_NAME.none;
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
			this.busyStepName = BUSY_STEP_NAME.submittingJob;
			this.report = null;
			this.promptPage = null;
			this.reportUnseen = false;
			// ⟪review S4⟫ the job before this one says nothing while this one is sent
			this.jobStatus = null;
			this.isStatusCheckFailed = false;
			try {
				const reply = await axios.post(`${ROUTE_BASE_PATH}/jobs`, submission, { headers: this.headers() });
				this.jobRefId = reply.data.answer.jobRefId;
				this.jobStatus = reply.data.answer;
				this.busyStepName = BUSY_STEP_NAME.none;
				this.pollJob();
				return OUTCOME.sent;
			} catch (requestError) {
				this.refusal = refusalOf(requestError);
				return OUTCOME.refused;
			} finally {
				this.isBusy = false;
				this.busyStepName = BUSY_STEP_NAME.none;
			}
		},
		async pollJob() {
			try {
				const reply = await axios.get(`${ROUTE_BASE_PATH}/jobs/status`, { params: { jobRefId: this.jobRefId }, headers: this.headers() });
				this.jobStatus = reply.data.answer;
				this.isStatusCheckFailed = false;
			} catch (requestError) {
				// ⟪review S2⟫ polling stops here: the page says so and offers retryStatusCheck, never a spinner nobody is feeding
				this.refusal = refusalOf(requestError);
				this.isStatusCheckFailed = true;
				return;
			}
			if (OPEN_STATUS_LIST.includes(this.jobStatus.status)) {
				this.pollTimer = setTimeout(() => this.pollJob(), POLL_MILLISECONDS);
				return;
			}
			await this.fetchReport(1);
			// ⟪review N5⟫ the report is said ready before its meanings' counts are read
			this.reportUnseen = this.report !== null && this.jobStatus.status === JOB_STATUS_DONE;
			await this.readExpressions();
			await this.fetchPrompts(1);
		},
		retryStatusCheck() {
			clearTimeout(this.pollTimer);
			this.refusal = null;
			return this.pollJob();
		},
		// a report page and its meanings' counts (the page's pagination)
		async showReportPage(pageNumber) {
			await this.fetchReport(pageNumber);
			await this.readExpressions();
		},
		rememberTab(tabName) {
			this.shownTabName = tabName;
		},
		markReportSeen() {
			this.reportUnseen = false;
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
		// each proposed meaning on the shown page not yet counted, asked of the Meanings answer, up to the page's limit; a read that fails, or one past the limit, is
		// kept with its reason, never as a count, and is asked again next time (⟪review S3⟫: only a count is kept for good)
		async readExpressions() {
			if (!this.report) {
				return;
			}
			const isCounted = (meaningUri) => this.expressionByMeaningUri[meaningUri] && this.expressionByMeaningUri[meaningUri].expressionCount !== undefined;
			const { readMeaningUriList, unreadMeaningUriList, overLimitReason } = meaningReadPlanOf(proposedMeaningUriListOf(this.report).filter((meaningUri) => !isCounted(meaningUri)));
			const overLimitList = unreadMeaningUriList.map((meaningUri) => [meaningUri, { unreadReason: overLimitReason }]);
			const readList = await Promise.all(readMeaningUriList.map(async (meaningUri) => {
				try {
					const reply = await axios.post(NEIGHBOURHOOD_URL, { action: 'node', stableId: meaningNodeStableIdOf(meaningUri) });
					const meaningNode = Array.isArray(reply.data) && reply.data[0] ? reply.data[0].node : null;
					return [meaningUri, meaningNode && typeof meaningNode.expressionCount === 'number' ? { expressionCount: meaningNode.expressionCount } : { unreadReason: rosettaPageWords.reportExpressedNoCountText }];
				} catch (requestError) {
					return [meaningUri, { unreadReason: unreadReasonOf(requestError) }];
				}
			}));
			this.expressionByMeaningUri = { ...this.expressionByMeaningUri, ...Object.fromEntries([...readList, ...overLimitList]) };
		},
		// ⟪rosettaMeanings R3⟫ a job named by its link: whoever may read it (its owner, or anyone holding an anonymous job's link) sees it as its submitter did
		async openJob(jobRefId) {
			clearTimeout(this.pollTimer);
			this.jobRefId = jobRefId;
			this.jobStatus = null;
			this.report = null;
			this.promptPage = null;
			this.refusal = null;
			this.reportUnseen = false;
			this.isStatusCheckFailed = false;
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
