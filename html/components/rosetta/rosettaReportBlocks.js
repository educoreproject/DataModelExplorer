// rosettaReportBlocks — what the Rosetta page shows of a job, made from the service's answers and nothing else (WORKORDER-rosettaReportLegible-111026). Pure: answers in,
// words and links out, every word from rosettaVocabulary or from the Meanings explorer's own vocabulary (the tuple's slot names, kinds and hub ids, the count of
// elements, the link to a meaning), so the two pages say a meaning's parts the same way.
//
//   fieldBlockListOf({ report, expressionByMeaningUri }) → one block per field sent: its name, its definition, and one hub block per hub (a proposal, or why none)
//   countLineListOf(counts) → the summary's count lines, one per hub, in words
//   proposedMeaningUriListOf(report) → the distinct meanings the shown page proposes (each is asked of the Meanings answer until it is counted, for its expressed-in count)
//   meaningReadPlanOf(meaningUriList) → which of them one read asks, within rosettaPageSettings' limit, and the reason the rest give
//   meaningNodeStableIdOf(meaningUri) → the Meanings walk's id for that meaning (a hub card's stableId IS its meaning URI: server/lib/standards-query/uriMinter.js)
//   progressOf({ jobStatus, busyStepName, isStatusCheckFailed }) → { isShown, progressText, endedText, checkFailedText }: the indicator while the AI reads the text,
//     a job is sent or a job is open; what an unfinished end says; and that a status check failed
//   jobStatusLineOf(jobStatus) → the Job tab's status line: the status in words and, when the job stopped, the service's reason; never a status or reason name
//   spendLineOf(jobStatus) → the Job tab's money line: the estimate, what is billed (it never falls) and, while calls are out, what they may cost at most
//   askButtonWordsOf({ review }) → the job button's words: Submit the Request while the page's reading of the text is up for review (TQ), else the first wording
//   JOB_OPEN_STATUS_LIST, JOB_STATUS_DONE, TAB_NAME, BUSY_STEP_NAME: the job statuses, tab names and busy steps the page, the store and this module share
//
// A RATIONALE, A FIELD NAME AND A LABEL CAN BE HOSTILE. Every text here stays text: nothing is built as HTML, and the page shows it all by {{ }}, which escapes it.

import { rosettaPageWords, wordsOf } from './rosettaVocabulary.js';
import { meaningsLinkOf, meaningElementCountTextOf, meaningTupleSlotListOf, meaningsVocabulary, MEANING_ID_PREFIX, absentReasonTextOf, uriAbsentTextOf } from '../standardsExplorer/explorerVocabulary.js';
import { rosettaPageSettings } from './rosettaPageSettings.js';

const sectionWords = meaningsVocabulary.meaningSection;
// the job statuses that are still open, and the one that ends well (the service's rosettaJobStore OPEN_STATUS_LIST and rosettaJobRunner JOB_STATUS.done)
export const JOB_OPEN_STATUS_LIST = Object.freeze(['queued', 'running', 'cancelling']);
export const JOB_STATUS_DONE = 'done';
// the page's tabs (rosetta.vue's v-tab values) and what the store is busy with
export const TAB_NAME = Object.freeze({ submit: 'submit', job: 'job', report: 'report', drafts: 'drafts', prompt: 'prompt' });
export const BUSY_STEP_NAME = Object.freeze({ none: '', interpreting: 'interpreting', submittingJob: 'submittingJob' });
// ⟪review N7⟫ a URI becomes a link only when it is https; the text is shown either way
const HREF_SCHEME_PREFIX = 'https://';
const hrefOf = (uri) => (typeof uri === 'string' && uri.startsWith(HREF_SCHEME_PREFIX) ? uri : '');

export const meaningNodeStableIdOf = (meaningUri) => `${MEANING_ID_PREFIX}${meaningUri}`;

// a slot's id in its hub's standard (hubCardTuple's nativeId: { <declared identifier name>: text }); none when the slot has none
const nativeIdTextOf = (slotPart) => (slotPart.nativeId ? Object.values(slotPart.nativeId)[0] : '');
// the Meanings panel's slots, each with what the report says of a slot with no URI
const slotListOf = ({ tuple, hubName }) =>
	meaningTupleSlotListOf({ tuple, hubName }).map((oneSlot) => (oneSlot.uri ? { ...oneSlot, href: hrefOf(oneSlot.uri) } : { ...oneSlot, href: '', uriAbsentText: wordsOf(rosettaPageWords.reportSlotUriAbsentTemplate, { uriAbsentText: uriAbsentTextOf(oneSlot.uriAbsentReason) }) }));

const strengthOf = (category) => {
	const strengthWords = rosettaPageWords.strengthByCategory[category];
	return strengthWords
		? { strengthWords: strengthWords.words, strengthExplanation: strengthWords.explanation }
		: { strengthWords: String(category), strengthExplanation: wordsOf(rosettaPageWords.strengthOtherTemplate, { category: String(category) }) };
};
const relationTextOf = (predicate) => {
	if (predicate === undefined) return rosettaPageWords.relationAbsentText;
	return rosettaPageWords.relationByPredicate[predicate] || wordsOf(rosettaPageWords.relationOtherTemplate, { predicate });
};

// how a meaning links into the graph: the count the Meanings answer gave ("Expressed in"), or that it is still being read, or why it could not be
const expressedTextOf = (expression) => {
	if (!expression) return rosettaPageWords.reportExpressedReadingText;
	if (expression.unreadReason !== undefined) return wordsOf(rosettaPageWords.reportExpressedUnreadTemplate, { reasonText: expression.unreadReason });
	if (!expression.expressionCount) return rosettaPageWords.reportExpressedNoneText;
	return wordsOf(rosettaPageWords.reportExpressedTemplate, { elementCountText: meaningElementCountTextOf(expression.expressionCount) });
};

const proposalBlockOf = ({ hubName, oneResult, expressionByMeaningUri }) => {
	const { proposal } = oneResult;
	const slotList = slotListOf({ tuple: proposal.tuple, hubName });
	const nativeIdList = Object.values(proposal.tuple || {}).map(nativeIdTextOf).filter(Boolean);
	return {
		hubName,
		hubHeadingText: wordsOf(rosettaPageWords.reportHubTemplate, { hubName }),
		hasProposal: true,
		meaningName: proposal.label,
		meaningUri: proposal.uri,
		meaningHref: hrefOf(proposal.uri),
		meaningsLink: meaningsLinkOf(proposal.uri),
		hubIdsText: nativeIdList.length ? wordsOf(rosettaPageWords.reportHubIdsTemplate, { hubName, nativeIdListText: nativeIdList.join(sectionWords.partDivider) }) : '',
		slotList,
		tupleAbsentText: proposal.tupleAbsentName ? wordsOf(rosettaPageWords.reportTupleAbsentTemplate, { reasonText: absentReasonTextOf(proposal.tupleAbsentName) }) : '',
		...strengthOf(proposal.category),
		relationText: relationTextOf(proposal.predicate),
		rationaleText: oneResult.judgesRationale || '',
		expressedText: expressedTextOf(expressionByMeaningUri[proposal.uri]),
		// ⟪review N3, S3⟫ the link to the elements only where some map; a failed read offers to try again
		showsExpressedLink: Boolean(expressionByMeaningUri[proposal.uri] && expressionByMeaningUri[proposal.uri].expressionCount),
		expressedReadFailed: Boolean(expressionByMeaningUri[proposal.uri] && expressionByMeaningUri[proposal.uri].unreadReason !== undefined),
	};
};

// ⟪rosettaLoginPolish #5⟫ a unit's notJudgedReason is a machine name (the job's stopReasonName, answerRefused, lostAtRestart). When it is the job's own stop, the
// job's reason in words says why (the audit report's job block carries it); the other names are already said by the unit's status
const noProposalStatusTextOf = (oneResult) => rosettaPageWords.noProposalTextByStatus[oneResult.status] || rosettaPageWords.noProposalOtherText;
const notJudgedReasonTextOf = ({ oneResult, reportJob }) =>
	oneResult.notJudgedReason && reportJob && reportJob.stopReasonName === oneResult.notJudgedReason && reportJob.stopReasonText
		? wordsOf(rosettaPageWords.notJudgedJobStoppedTemplate, { stopReasonText: reportJob.stopReasonText })
		: '';
// whyText: the two joined here, with the vocabulary's divider, because a template's space before a {{ }} inside a span is condensed away (the live run read
// "hub.The job ended first")
const noProposalBlockOf = ({ hubName, oneResult, reportJob }) => {
	const statusText = noProposalStatusTextOf(oneResult);
	const notJudgedReasonText = notJudgedReasonTextOf({ oneResult, reportJob });
	return {
		hubName,
		hubHeadingText: wordsOf(rosettaPageWords.reportHubTemplate, { hubName }),
		hasProposal: false,
		statusText,
		notJudgedReasonText,
		whyText: [statusText, notJudgedReasonText].filter(Boolean).join(rosettaPageWords.endedPartDivider),
		rationaleText: oneResult.judgesRationale || '',
	};
};

// ⟪P7a⟫ a field's results are a resultList, each naming its hub, in the job's hub order
export const fieldBlockListOf = ({ report, expressionByMeaningUri }) =>
	report.fieldList.map((oneField) => ({
		requestName: oneField.requestName,
		definitionText: oneField.requestDefinition || rosettaPageWords.reportFieldDefinitionAbsentText,
		hubBlockList: oneField.resultList.map((oneResult) =>
			oneResult.proposal ? proposalBlockOf({ hubName: oneResult.hub, oneResult, expressionByMeaningUri }) : noProposalBlockOf({ hubName: oneResult.hub, oneResult, reportJob: report.job }),
		),
	}));

// ⟪rosettaLoginPolish #5⟫ the summary table's result cell: the strength and the meaning, or why there is none, in the same words as the blocks above it
export const summaryResultTextOf = (oneResult) => (oneResult.proposal ? `${strengthOf(oneResult.proposal.category).strengthWords}${rosettaPageWords.summaryResultDivider}${oneResult.proposal.label}` : noProposalStatusTextOf(oneResult));

export const proposedMeaningUriListOf = (report) => [...new Set(report.fieldList.flatMap((oneField) => oneField.resultList.filter((oneResult) => oneResult.proposal).map((oneResult) => oneResult.proposal.uri)))];
// ⟪ROMANTIC_PARASOL⟫ the Meanings answers one shown page may ask, at most (rosettaPageSettings); the rest of the page's meanings say so, by the limit, never a count
export const meaningReadPlanOf = (meaningUriList) => ({
	readMeaningUriList: meaningUriList.slice(0, rosettaPageSettings.meaningReadsPerPageLimit),
	unreadMeaningUriList: meaningUriList.slice(rosettaPageSettings.meaningReadsPerPageLimit),
	overLimitReason: wordsOf(rosettaPageWords.reportExpressedOverLimitTemplate, { meaningReadsPerPageLimit: rosettaPageSettings.meaningReadsPerPageLimit }),
});

// the summary: each hub's non-zero counts, by the vocabulary's words for the service's count names (a name it does not know is shown as the name)
export const countLineListOf = (counts) =>
	Object.entries(counts.byHub).map(([hubName, countByName]) =>
		wordsOf(rosettaPageWords.reportCountsTemplate, {
			hubName,
			countListText: Object.entries(countByName)
				.filter(([, count]) => count > 0)
				.map(([countName, count]) => wordsOf(rosettaPageWords.reportCountPartTemplate, { countWords: rosettaPageWords.countWordsByName[countName] || countName, count }))
				.join(rosettaPageWords.reportCountDivider),
		}),
	);

const NOTHING_SHOWN = Object.freeze({ isShown: false, progressText: '', endedText: '', checkFailedText: '' });
const shownWith = (progressText) => ({ isShown: true, progressText, endedText: '', checkFailedText: '' });
const openProgressTextOf = (jobStatus) => {
	if (jobStatus.status === 'queued') return jobStatus.position ? wordsOf(rosettaPageWords.progressQueuedPlaceText, { position: jobStatus.position }) : rosettaPageWords.progressQueuedText;
	if (jobStatus.status === 'cancelling') return rosettaPageWords.progressCancellingText;
	return jobStatus.unitsTotal ? wordsOf(rosettaPageWords.progressRunningUnitsText, { unitsFinished: jobStatus.unitsFinished, unitsTotal: jobStatus.unitsTotal }) : rosettaPageWords.progressRunningText;
};
// ⟪review B1, rosettaLoginPolish #5⟫ the reason: the service's text when it gave text; its words when it gave a name alone (a job cancelled before the service
// stored text for it); else that it gave none. The name itself is never shown: it is in the answer for a program, not for a person.
const stopReasonTextOf = ({ stopReasonName, stopReasonText }) => {
	if (!stopReasonName) return '';
	if (stopReasonText) return stopReasonText;
	return rosettaPageWords.stopReasonWordsByName[stopReasonName] || rosettaPageWords.stopReasonUnwordedText;
};
const endedTextOf = (jobStatus) => {
	const statusText = rosettaPageWords.endedTextByStatus[jobStatus.status] || rosettaPageWords.endedOtherText;
	return [statusText, stopReasonTextOf(jobStatus)].filter(Boolean).join(rosettaPageWords.endedPartDivider);
};
// busyStepName: what the store is doing before a job's status speaks (BUSY_STEP_NAME); isStatusCheckFailed: the last status check failed (⟪review S2⟫)
export const progressOf = ({ jobStatus, busyStepName, isStatusCheckFailed }) => {
	if (busyStepName === BUSY_STEP_NAME.interpreting) return shownWith(rosettaPageWords.progressInterpretingText);
	if (busyStepName === BUSY_STEP_NAME.submittingJob) return shownWith(rosettaPageWords.progressSendingText);
	const isOpenOrUnknown = !jobStatus || JOB_OPEN_STATUS_LIST.includes(jobStatus.status);
	if (isStatusCheckFailed && isOpenOrUnknown) return { ...NOTHING_SHOWN, checkFailedText: rosettaPageWords.statusCheckFailedText };
	if (!jobStatus) return NOTHING_SHOWN;
	if (JOB_OPEN_STATUS_LIST.includes(jobStatus.status)) return shownWith(openProgressTextOf(jobStatus));
	if (jobStatus.status === JOB_STATUS_DONE) return NOTHING_SHOWN;
	return { ...NOTHING_SHOWN, endedText: endedTextOf(jobStatus) };
};

// ⟪review S4⟫ a job that ended done says so alone: a cancel that landed while its last unit was out leaves the cancel's name and words stored on a finished job
export const jobStatusLineOf = (jobStatus) =>
	[rosettaPageWords.jobStatusWordsByStatus[jobStatus.status] || rosettaPageWords.jobStatusOtherText, jobStatus.status === JOB_STATUS_DONE ? '' : stopReasonTextOf(jobStatus)].filter(Boolean).join(rosettaPageWords.endedPartDivider);

// ⟪rosettaLoginPolish #4⟫ never spentUsd: it holds each call still out at its estimate and falls when the bill corrects it. billedUsd only rises; an answer without
// it (a service from before) says the estimate alone rather than a figure that can go backwards
export const spendLineOf = (jobStatus) => {
	const estimateText = wordsOf(rosettaPageWords.estimateText, { estimateUsd: jobStatus.estimateUsd });
	if (jobStatus.billedUsd === undefined) return estimateText;
	const billedText = wordsOf(rosettaPageWords.billedText, { billedUsd: jobStatus.billedUsd });
	const inFlightTemplate = jobStatus.inFlightCallCount === 1 ? rosettaPageWords.inFlightOneCallText : rosettaPageWords.inFlightCallsText;
	// ⟪review N4⟫ only an open job has calls running: a call row a store fault left inFlight on an ended job is not one
	const inFlightText = jobStatus.inFlightCallCount > 0 && JOB_OPEN_STATUS_LIST.includes(jobStatus.status) ? wordsOf(inFlightTemplate, { inFlightUsd: jobStatus.inFlightUsd, inFlightCallCount: jobStatus.inFlightCallCount }) : '';
	return `${estimateText}${billedText}${inFlightText}`;
};

export const askButtonWordsOf = ({ review }) => (review ? rosettaPageWords.submitRequestButton : rosettaPageWords.askDraftButton);
