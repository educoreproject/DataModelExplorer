'use strict';

// rosettaReport — what a job's rows become: the report across all hubs, and one draft @context per hub (design 4.4). Pure: rows in, answer out.
//
//   reportOf({ job, submission, judgmentRowList, spentUsd, answerNoteValues, pageNumber, pageSize, rowDetail }) → the fetch answer. rowDetail full pages its fieldList; summary is shaped from the whole by answerSummaries.
//   ownerJobFactsOf({ job, spentUsd, unitsFinished }) → what the owner is told of a job, in status and in the report.
//
// ONLY strong ENTERS A DRAFT (R2; judgedSettings.draftCategoryList). Everything else is in the report. A term a draft cannot hold twice is left out and named, never overwritten.
// A UNIT WITH NO ROW SAYS WHY. notJudged carries notJudgedReason, the job's stop reason when it has one, so a dead credential reads as that and never as an abstention. judgesRationale is the judge's own words, which can quote a stranger's text: it is a labelled field, and a reader must treat it as data.

const { judgedSettings } = require('./rosettaJudgeEngine');

const STATUS_NOT_JUDGED = 'notJudged';
const JOB_STATUS_DONE = 'done';
const OPEN_STATUS_LIST = Object.freeze(['queued', 'running', 'cancelling']);
const STATUS_COUNT_NAME_LIST = Object.freeze(['abstained', 'abstainedOnCutAnswer', 'noCandidate', 'notJudged', 'lostAtRestart', 'judgeRefused', 'identifierInSourceText', 'identifierInCandidateText']);
const STATUS_NAME_LIST_NOT_JUDGED = Object.freeze(['notJudged', 'lostAtRestart', 'judgeRefused']);
const COUNT_NAME_ANSWERS_CUT = 'answersCut';
const DRAFT_REFUSED_TERM_ROW_LIST = judgedSettings.draftRefusedTermPatternList.map((oneRow) => ({ ...oneRow, compiledPattern: new RegExp(oneRow.pattern) }));
const roundedUsdOf = (usd) => Number(usd.toFixed(4));
const isoOf = (timeMs) => (timeMs ? new Date(timeMs).toISOString() : null);

const ownerJobFactsOf = ({ job, spentUsd, unitsFinished }) => ({
	jobRefId: job.jobRefId,
	status: job.status,
	...(job.stopReasonName ? { stopReasonName: job.stopReasonName, stopReasonText: job.stopReasonText } : {}),
	fieldCount: job.fieldCount,
	hubList: job.hubNameList,
	unitsFinished,
	unitsTotal: job.fieldCount * job.hubNameList.length,
	unitNote: 'one unit is one field against one hub',
	embeddingTokensEstimate: job.embeddingTokens,
	spentUsd: roundedUsdOf(spentUsd),
	estimateUsd: job.estimateUsd,
	submittedAt: isoOf(job.submittedAtMs),
	startedAt: isoOf(job.startedAtMs),
	finishedAt: isoOf(job.finishedAtMs),
	expiresAt: isoOf(job.expiresAtMs),
});

const countsByHubOf = ({ job, fieldList, rowByUnitName }) => job.hubNameList.reduce((soFar, hubName) => {
	const zeroCounts = [...Object.values(judgedSettings.proposalCategoryCountNameByCategory), ...STATUS_COUNT_NAME_LIST, COUNT_NAME_ANSWERS_CUT].reduce((zeroSoFar, countName) => ({ ...zeroSoFar, [countName]: 0 }), {});
	const hubCounts = fieldList.reduce((countsSoFar, unusedField, fieldIndex) => {
		const oneRow = rowByUnitName.get(`${fieldIndex}\u0000${hubName}`);
		const countName = !oneRow ? STATUS_NOT_JUDGED : (oneRow.unitStatus === 'proposed' ? judgedSettings.proposalCategoryCountNameByCategory[oneRow.judgment.proposal.category] : oneRow.unitStatus);
		const withStatus = { ...countsSoFar, [countName]: (countsSoFar[countName] || 0) + 1 };
		return oneRow && oneRow.judgment.answerWasCut ? { ...withStatus, [COUNT_NAME_ANSWERS_CUT]: withStatus[COUNT_NAME_ANSWERS_CUT] + 1 } : withStatus;
	}, zeroCounts);
	return { ...soFar, [hubName]: hubCounts };
}, {});

// a @context maps a term to an IRI, and some names mean something else there or to whatever reads the JSON: each stays out, named with the true reason. A Map, so a name like constructor is only a name.
const draftsByHubOf = ({ job, fieldList, rowByUnitName }) => {
	const leftOutTermList = [];
	const draftContextByHub = job.hubNameList.reduce((soFar, hubName) => {
		const termUriByName = new Map();
		fieldList.forEach((oneField, fieldIndex) => {
			const oneRow = rowByUnitName.get(`${fieldIndex}\u0000${hubName}`);
			if (!oneRow || oneRow.unitStatus !== 'proposed' || !judgedSettings.draftCategoryList.includes(oneRow.judgment.proposal.category)) {
				return;
			}
			const refusedRow = DRAFT_REFUSED_TERM_ROW_LIST.find((oneTermRow) => oneTermRow.compiledPattern.test(oneField.name));
			if (refusedRow) {
				leftOutTermList.push({ term: oneField.name, hubName, reason: refusedRow.reason });
				return;
			}
			if (termUriByName.has(oneField.name)) {
				leftOutTermList.push({ term: oneField.name, hubName, reason: 'two fields share this name, and a @context holds a term once' });
				return;
			}
			termUriByName.set(oneField.name, oneRow.judgment.proposal.uri);
		});
		return { ...soFar, [hubName]: { '@context': Object.fromEntries(termUriByName) } };
	}, {});
	return { draftContextByHub, leftOutTermList };
};

const reportOf = ({ job, submission, judgmentRowList, spentUsd, answerNoteValues, pageNumber, pageSize, rowDetail }) => {
	const { fieldList, submissionNote } = submission;
	const rowByUnitName = new Map(judgmentRowList.map((oneRow) => [`${oneRow.fieldIndex}\u0000${oneRow.hubName}`, oneRow]));
	const stoppedReason = job.stopReasonName || (OPEN_STATUS_LIST.includes(job.status) ? 'jobStillOpen' : undefined);
	const reportedFieldList = fieldList.map((oneField, fieldIndex) => ({
		name: oneField.name,
		...(oneField.path === undefined ? {} : { path: oneField.path }),
		...(oneField.definition === undefined ? {} : { definition: oneField.definition }),
		...(oneField.definitionAbsent ? { definitionAbsent: true } : {}),
		...(oneField.valueTierNotOffered ? { valueTierNotOffered: true } : {}),
		byHub: job.hubNameList.reduce((soFar, hubName) => {
			const oneRow = rowByUnitName.get(`${fieldIndex}\u0000${hubName}`);
			return { ...soFar, [hubName]: oneRow ? { status: oneRow.unitStatus, ...oneRow.judgment } : { status: STATUS_NOT_JUDGED, notJudgedReason: stoppedReason, runnerUpList: [] } };
		}, {}),
	}));
	const { draftContextByHub, leftOutTermList } = draftsByHubOf({ job, fieldList, rowByUnitName });
	const counts = countsByHubOf({ job, fieldList, rowByUnitName });
	const hasUnitNotJudged = Object.values(counts).some((hubCounts) => STATUS_NAME_LIST_NOT_JUDGED.some((statusName) => hubCounts[statusName] > 0));
	const isFullDetail = rowDetail === 'full';
	const pageCount = Math.max(1, Math.ceil(reportedFieldList.length / pageSize));
	return {
		job: ownerJobFactsOf({ job, spentUsd, unitsFinished: judgmentRowList.length }),
		judge: job.judgeFacts,
		draftNote: answerNoteValues.draftNote,
		strongOnlyNote: answerNoteValues.strongOnlyNote,
		strongEvidenceNote: answerNoteValues.strongEvidenceNote,
		rationaleNote: answerNoteValues.rationaleNote,
		...(job.status === JOB_STATUS_DONE && !hasUnitNotJudged ? {} : { isPartial: true, partialNote: answerNoteValues.partialNote }),
		answeredFromAtSubmit: job.answeredFrom,
		counts: { byHub: counts },
		draftContextByHub,
		...(leftOutTermList.length ? { leftOutOfDraftList: leftOutTermList } : {}),
		...submissionNote,
		fieldList: isFullDetail ? reportedFieldList.slice((pageNumber - 1) * pageSize, pageNumber * pageSize) : reportedFieldList,
		...(isFullDetail ? { page: pageNumber, pageCount, totalFieldCount: reportedFieldList.length } : {}),
	};
};

module.exports = { reportOf, ownerJobFactsOf };
