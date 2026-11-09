'use strict';

// rosettaReport — what a job's rows become: the report across all hubs, and one draft @context per hub (design 4.4). Pure: rows in, answer out.
//
//   reportOf({ job, submission, judgmentRowList, spentUsd, answerNoteValues, pageNumber, pageSize, rowDetail, detail, answeredFromNow }) → the fetch answer. rowDetail full pages its fieldList; summary is shaped from the whole by answerSummaries.
//   usingOf({ job, spentUsd, judgmentRowList, judgeCallCount, detail }) → the answer's using block: which prompt version judged, the provider and model, what this job spent, and whether it came wholly from the cache.
//   promptVersionFieldsOf({ judgmentRowList }) → { promptVersion } | { promptVersionList } | { promptVersionAbsentName }: the renderer version the job's judged units recorded, its common prefix stripped (TQ Q66).
//   ownerJobFactsOf({ job, spentUsd, unitsFinished }) → what the owner is told of a job, in status and in the report.
//
// ⟪P7a, TQ Q61-Q64⟫ TWO FORMS, ONE ANSWER. detail 'lean' (the default, declared in the registry) is what a reader needs: each field by requestName and requestDefinition, its
// resultList naming each hub, and each proposal naming its card and the tuple of elements the card stands for. detail 'audit' is the same answer with everything the lean form
// leaves out put back (AUDIT_ONLY_..._NAME_LIST below): the job's clock and units, the notes, the zero counts, the pool sizes, the state of the graph at submit. Nothing is
// dropped from the store; the forms differ only in what they show. A graph that changed since submit is said in the lean form too (graphChangedSinceSubmit).
//
const { judgedSettings } = require('./rosettaJudgeEngine');
const { absentOf } = require('./hubElementIdentity');
const { tupleAbsentOf } = require('../hubCardTuple');
const { DETAIL_LEAN, DETAIL_AUDIT, DETAIL_LIST } = require('./rosettaAnswerDetail');

if (typeof judgedSettings.rendererVersionPrefix !== 'string' || judgedSettings.rendererVersionPrefix === '') {
	throw new Error('rosettaReport: rosettaJudgedSettings.json must give rendererVersionPrefix, the prefix every forge renderer version carries');
}
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

// ⟪P7⟫ a proposal judged before the runner recorded its hub element's identifier says so by name: a blank would read as an element with none
const IDENTITY_FIELD_NAME_LIST = Object.freeze(['hubElementNativeIdentifier', 'hubElementNativeIdentifierAbsentName']);
// ⟪P7a⟫ and one judged before the runner recorded its card's tuple says that, by name, never a partial tuple
const TUPLE_FIELD_NAME_LIST = Object.freeze(['tuple', 'tupleAbsentName']);
const proposalWithAbsencesNamed = (proposal) => ({
	...proposal,
	...(IDENTITY_FIELD_NAME_LIST.some((fieldName) => fieldName in proposal) ? {} : absentOf('judgedBeforeNativeIdentifierRecorded')),
	...(TUPLE_FIELD_NAME_LIST.some((fieldName) => fieldName in proposal) ? {} : tupleAbsentOf('judgedBeforeTupleRecorded')),
});

// ⟪P7a⟫ WHAT THE LEAN FORM LEAVES OUT. Each name here is shown again by detail=audit, so the two lists are the whole difference between the forms.
// ⟪P7b⟫ a unit's rendererVersion is said once for the job, in using.promptVersion; audit keeps each unit's own
const AUDIT_ONLY_RESULT_FIELD_NAME_LIST = Object.freeze(['poolSize', 'admittedCount', 'rendererVersion']);
// the card's domain label is the tuple's domain part; the P7 identifier fields are the tuple's property part; a hub's descriptive ranges and a datatype range ride beside the tuple
const AUDIT_ONLY_PROPOSAL_FIELD_NAME_LIST = Object.freeze(['domain', 'hubElementNativeIdentifier', 'hubElementNativeIdentifierPropertyName', 'hubElementNativeIdentifierAbsentName', 'rangeList', 'rangeDatatypeList']);
const UNIT_STATUS_PROPOSED = 'proposed';
// the answeredFrom fields that say WHICH graph answered: a difference in any of them between submit and now is a changed graph
const GRAPH_IDENTITY_FIELD_NAME_LIST = Object.freeze(['graphName', 'manifestRefId', 'graphContractSha256', 'builtAt']);
const omitFields = (sourceObject, fieldNameList) => Object.keys(sourceObject).filter((fieldName) => !fieldNameList.includes(fieldName)).reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: sourceObject[fieldName] }), {});
const nonZeroCountsOf = (countByName) => Object.keys(countByName).filter((countName) => countByName[countName] > 0).reduce((soFar, countName) => ({ ...soFar, [countName]: countByName[countName] }), {});

// one hub's result for one field. Lean: a proposal speaks for itself, so its unit carries no status; any other unit says its status.
// a proposal reads in the order TQ approved: what the card is, what it names, then how the judge related it
const PROPOSAL_FIELD_ORDER_LIST = Object.freeze(['uri', 'label', 'tuple', 'tupleAbsentName', 'predicate', 'category', 'confidence']);
const inProposalOrder = (proposal) => [...PROPOSAL_FIELD_ORDER_LIST.filter((fieldName) => fieldName in proposal), ...Object.keys(proposal).filter((fieldName) => !PROPOSAL_FIELD_ORDER_LIST.includes(fieldName))].reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: proposal[fieldName] }), {});

const resultOf = ({ hubName, oneRow, stoppedReason, isAudit }) => {
	if (!oneRow) {
		return { hub: hubName, status: STATUS_NOT_JUDGED, ...(stoppedReason === undefined ? {} : { notJudgedReason: stoppedReason }), runnerUpList: [] };
	}
	const { proposal, judgesRationale, ...judgmentFacts } = oneRow.judgment;
	const shownProposal = proposal ? inProposalOrder(proposalWithAbsencesNamed(proposal)) : undefined;
	const showsStatus = isAudit || oneRow.unitStatus !== UNIT_STATUS_PROPOSED || !proposal;
	return {
		hub: hubName,
		...(showsStatus ? { status: oneRow.unitStatus } : {}),
		...(shownProposal ? { proposal: isAudit ? shownProposal : omitFields(shownProposal, AUDIT_ONLY_PROPOSAL_FIELD_NAME_LIST) } : {}),
		...(judgesRationale === undefined ? {} : { judgesRationale }),
		...(isAudit ? judgmentFacts : omitFields(judgmentFacts, AUDIT_ONLY_RESULT_FIELD_NAME_LIST)),
	};
};

const graphChangedSince = ({ answeredFromAtSubmit, answeredFromNow }) => GRAPH_IDENTITY_FIELD_NAME_LIST.some((fieldName) => answeredFromAtSubmit[fieldName] !== answeredFromNow[fieldName]);

// ⟪P7b, TQ Q66⟫ WHICH PROMPT JUDGED: the renderer version each judged unit recorded from its own rendered question (the version that keys its promptHash), never the
// variant the engine was configured with. Every forge renderer version begins with one prefix (rosettaJudgedSettings.rendererVersionPrefix); the rest is the prompt version.
// Where it cannot be said, a declared name says why: a unit judged before units recorded it, a version without the prefix (never shown raw), or a job that judged nothing.
const PROMPT_VERSION_ABSENT_NAME_LIST = Object.freeze(['nothingJudged', 'judgedBeforePromptVersionRecorded', 'rendererVersionUnrecognised']);
const promptVersionAbsentOf = (absentName) => {
	if (!PROMPT_VERSION_ABSENT_NAME_LIST.includes(absentName)) {
		throw new Error(`rosettaReport: '${absentName}' is not a declared prompt version absence (${PROMPT_VERSION_ABSENT_NAME_LIST.join(', ')})`);
	}
	return { promptVersionAbsentName: absentName };
};
const promptVersionFieldsOf = ({ judgmentRowList }) => {
	const { rendererVersionPrefix } = judgedSettings;
	const judgedRowList = judgmentRowList.filter((oneRow) => oneRow.promptHash);
	if (judgedRowList.length === 0) {
		return promptVersionAbsentOf('nothingJudged');
	}
	const rendererVersionList = judgedRowList.map((oneRow) => oneRow.judgment.rendererVersion);
	if (rendererVersionList.some((rendererVersion) => typeof rendererVersion !== 'string')) {
		return promptVersionAbsentOf('judgedBeforePromptVersionRecorded');
	}
	if (rendererVersionList.some((rendererVersion) => !rendererVersion.startsWith(rendererVersionPrefix) || rendererVersion.length === rendererVersionPrefix.length)) {
		return promptVersionAbsentOf('rendererVersionUnrecognised');
	}
	const promptVersionList = [...new Set(rendererVersionList.map((rendererVersion) => rendererVersion.slice(rendererVersionPrefix.length)))].sort();
	return promptVersionList.length === 1 ? { promptVersion: promptVersionList[0] } : { promptVersionList };
};

const usingOf = ({ job, spentUsd, judgmentRowList, judgeCallCount, detail }) => {
	const judgedUnitCount = judgmentRowList.filter((oneRow) => oneRow.promptHash).length;
	return {
		...promptVersionFieldsOf({ judgmentRowList }),
		provider: job.judgeFacts.provider,
		model: job.judgeFacts.model,
		costUsd: roundedUsdOf(spentUsd),
		cached: judgedUnitCount > 0 && judgeCallCount === 0,
		...(detail === DETAIL_AUDIT ? { judgedUnitCount, judgeCallCount } : {}),
	};
};

const reportOf = ({ job, submission, judgmentRowList, spentUsd, answerNoteValues, pageNumber, pageSize, rowDetail, detail, answeredFromNow }) => {
	if (!DETAIL_LIST.includes(detail)) {
		throw new Error(`rosettaReport: detail must be one of ${DETAIL_LIST.join(', ')} (got ${JSON.stringify(detail)}); the registry row declares the default`);
	}
	const isAudit = detail === DETAIL_AUDIT;
	const { fieldList, submissionNote } = submission;
	const rowByUnitName = new Map(judgmentRowList.map((oneRow) => [`${oneRow.fieldIndex}\u0000${oneRow.hubName}`, oneRow]));
	const stoppedReason = job.stopReasonName || (OPEN_STATUS_LIST.includes(job.status) ? 'jobStillOpen' : undefined);
	const reportedFieldList = fieldList.map((oneField, fieldIndex) => ({
		requestName: oneField.name,
		...(oneField.path === undefined ? {} : { requestPath: oneField.path }),
		...(oneField.definition === undefined ? {} : { requestDefinition: oneField.definition }),
		...(oneField.definitionAbsent ? { definitionAbsent: true } : {}),
		...(oneField.valueTierNotOffered ? { valueTierNotOffered: true } : {}),
		resultList: job.hubNameList.map((hubName) => resultOf({ hubName, oneRow: rowByUnitName.get(`${fieldIndex}\u0000${hubName}`), stoppedReason, isAudit })),
	}));
	const { draftContextByHub, leftOutTermList } = draftsByHubOf({ job, fieldList, rowByUnitName });
	const counts = countsByHubOf({ job, fieldList, rowByUnitName });
	const hasUnitNotJudged = Object.values(counts).some((hubCounts) => STATUS_NAME_LIST_NOT_JUDGED.some((statusName) => hubCounts[statusName] > 0));
	const isFullDetail = rowDetail === 'full';
	const pageCount = Math.max(1, Math.ceil(reportedFieldList.length / pageSize));
	const isGraphChanged = graphChangedSince({ answeredFromAtSubmit: job.answeredFrom, answeredFromNow });
	return {
		jobRefId: job.jobRefId,
		status: job.status,
		...(job.stopReasonName ? { stopReasonName: job.stopReasonName, stopReasonText: job.stopReasonText } : {}),
		...(job.status === JOB_STATUS_DONE && !hasUnitNotJudged ? {} : { isPartial: true, partialNote: answerNoteValues.partialNote }),
		...(isAudit ? { job: ownerJobFactsOf({ job, spentUsd, unitsFinished: judgmentRowList.length }), judge: job.judgeFacts } : {}),
		fieldList: isFullDetail ? reportedFieldList.slice((pageNumber - 1) * pageSize, pageNumber * pageSize) : reportedFieldList,
		draftNote: answerNoteValues.draftNote,
		...(isAudit ? { strongOnlyNote: answerNoteValues.strongOnlyNote, strongEvidenceNote: answerNoteValues.strongEvidenceNote, rationaleNote: answerNoteValues.rationaleNote } : {}),
		draftContextByHub,
		...(leftOutTermList.length ? { leftOutOfDraftList: leftOutTermList } : {}),
		...submissionNote,
		counts: { byHub: isAudit ? counts : Object.keys(counts).reduce((soFar, hubName) => ({ ...soFar, [hubName]: nonZeroCountsOf(counts[hubName]) }), {}) },
		...(isAudit ? { answeredFromAtSubmit: job.answeredFrom } : {}),
		...(isGraphChanged ? { graphChangedSinceSubmit: job.answeredFrom } : {}),
		...(isFullDetail && (isAudit || pageCount > 1) ? { page: pageNumber, pageCount, totalFieldCount: reportedFieldList.length } : {}),
	};
};

module.exports = { reportOf, usingOf, promptVersionFieldsOf, ownerJobFactsOf, PROMPT_VERSION_ABSENT_NAME_LIST, DETAIL_LIST, DETAIL_LEAN, DETAIL_AUDIT, AUDIT_ONLY_RESULT_FIELD_NAME_LIST, AUDIT_ONLY_PROPOSAL_FIELD_NAME_LIST };
