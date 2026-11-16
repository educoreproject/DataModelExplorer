'use strict';
// rosetta-vocabulary.test.js — WORKORDER-P7b-rosettaVocabulary-110926, HERMETIC half: no graph, no vendor, no network. One vocabulary across the Rosetta family (TQ Q66, Q67).
//   1. Q66: using.promptVersion is the renderer version each judged unit recorded, its common prefix stripped; where it cannot be said, a declared name says why.
//   2. Q67a: a fetch field's place in a submitted document is requestPath.
//   3. Q67b: retrieval speaks fetch's words: requestName, requestPath, requestDefinition, requestType, and resultList[{ hub, ...pool }]; detail=lean|audit as fetch,
//      the whole-answer counts (fieldCount, poolCountList) only in audit (ROMANTIC_PARASOL rulings Q-A, Q-B, Q-C, 2026-11-09).
//   4. retrieval's detail=audit loses nothing the code at eb866fc answered (fixtures/rosettaRetrievalShape/before_eb866fc_*.json, captured from that tree by
//      runs/P7b/captureRetrieval.js), leaf by leaf, under the new names; and every lean leaf is in the audit answer.
//   5. the summary of retrieval: resultList naming each hub, no byHub.
//   6. the registry: retrieval declares detail and fetch's envelopeRule; the summary picks requestName; no description teaches byHub or using.judge.
//   node server/test/rosetta-vocabulary.test.js

const path = require('path');
const { reportOf, usingOf, promptVersionFieldsOf, PROMPT_VERSION_ABSENT_NAME_LIST } = require('../lib/standards-query/rosetta/rosettaReport');
const { retrievalAnswerOf } = require('../lib/standards-query/rosetta/rosettaRetrieval');
const { parseFieldList } = require('../lib/standards-query/rosetta/parsers/fieldListParser');
const { parseJsonSchema } = require('../lib/standards-query/rosetta/parsers/jsonSchemaParser');
const { SUMMARY_SHAPER_BY_NAME } = require('../lib/standards-query/answerSummaries');
const registry = require('../lib/standards-query/standardsQueryOperations.json');
const { searchDescriptionAbsentOf } = require('../lib/standards-query/rosetta/rosettaSearchDescriber');

const FETCH_FIXTURE_DIR_PATH = path.join(__dirname, 'fixtures', 'rosettaFetchShape');
const RETRIEVAL_FIXTURE_DIR_PATH = path.join(__dirname, 'fixtures', 'rosettaRetrievalShape');
const storedFixture = require(path.join(FETCH_FIXTURE_DIR_PATH, 'storedJobFixture.json'));

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${String(detailText).slice(0, 1500)}` : ''}`);
};
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const threwMatching = (work, pattern) => {
	try { work(); } catch (thrown) { return pattern.test(thrown.message); }
	return false;
};
const leafMapOf = (sourceObject, prefixText = '') => {
	if (sourceObject === null || typeof sourceObject !== 'object' || (Array.isArray(sourceObject) && sourceObject.length === 0) || (!Array.isArray(sourceObject) && Object.keys(sourceObject).length === 0)) {
		return new Map([[prefixText, JSON.stringify(sourceObject)]]);
	}
	return Object.keys(sourceObject).reduce((soFar, partName) => new Map([...soFar, ...leafMapOf(sourceObject[partName], prefixText ? `${prefixText}.${partName}` : partName)]), new Map());
};

console.log('\n=== P7b: one vocabulary across the Rosetta family ===\n');

// ---- 1. Q66: promptVersion
console.log('- 1. Q66: using.promptVersion');
{
	const judgedRowOf = (rendererVersion) => ({ promptHash: 'h', judgment: rendererVersion === undefined ? {} : { rendererVersion } });
	const unjudgedRow = { promptHash: null, judgment: {} };
	ok('one recorded version: the prefix stripped', sameJson(promptVersionFieldsOf({ judgmentRowList: [judgedRowOf('bridgeEvidenceRenderer-derivedJudgeSlot-v1'), judgedRowOf('bridgeEvidenceRenderer-derivedJudgeSlot-v1'), unjudgedRow] }), { promptVersion: 'derivedJudgeSlot-v1' }));
	ok('read from the rows, never a fixed string: another version reads as itself', sameJson(promptVersionFieldsOf({ judgmentRowList: [judgedRowOf('bridgeEvidenceRenderer-derived-v12')] }), { promptVersion: 'derived-v12' }));
	ok('nothing judged: promptVersionAbsentName nothingJudged', sameJson(promptVersionFieldsOf({ judgmentRowList: [unjudgedRow] }), { promptVersionAbsentName: 'nothingJudged' }));
	ok('a judged row with no recorded version: judgedBeforePromptVersionRecorded', sameJson(promptVersionFieldsOf({ judgmentRowList: [judgedRowOf('bridgeEvidenceRenderer-derivedJudgeSlot-v1'), judgedRowOf(undefined)] }), { promptVersionAbsentName: 'judgedBeforePromptVersionRecorded' }));
	ok('a version without the prefix is never shown raw: rendererVersionUnrecognised', sameJson(promptVersionFieldsOf({ judgmentRowList: [judgedRowOf('somethingElse-v1')] }), { promptVersionAbsentName: 'rendererVersionUnrecognised' }));
	ok('rows that disagree: promptVersionList, each stripped, sorted', sameJson(promptVersionFieldsOf({ judgmentRowList: [judgedRowOf('bridgeEvidenceRenderer-derivedJudgeSlot-v2'), judgedRowOf('bridgeEvidenceRenderer-derivedJudgeSlot-v1')] }), { promptVersionList: ['derivedJudgeSlot-v1', 'derivedJudgeSlot-v2'] }));
	ok('the absent names are declared', sameJson(PROMPT_VERSION_ABSENT_NAME_LIST, ['nothingJudged', 'judgedBeforePromptVersionRecorded', 'rendererVersionUnrecognised']));
	const recordedRowList = storedFixture.judgmentRowList.map((oneRow) => (oneRow.promptHash ? { ...oneRow, judgment: { ...oneRow.judgment, rendererVersion: 'bridgeEvidenceRenderer-derivedJudgeSlot-v1' } } : oneRow));
	const usingLean = usingOf({ job: storedFixture.job, spentUsd: 0, judgmentRowList: recordedRowList, judgeCallCount: 0, detail: 'lean' });
	ok('using: { promptVersion, provider, model, costUsd, cached }; no judge', sameJson(usingLean, { promptVersion: 'derivedJudgeSlot-v1', provider: 'anthropic', model: 'claude-opus-5', costUsd: 0, cached: true }), JSON.stringify(usingLean));
	const usingOld = usingOf({ job: storedFixture.job, spentUsd: 0, judgmentRowList: storedFixture.judgmentRowList, judgeCallCount: 0, detail: 'lean' });
	ok('a job judged before this ships says so by name in using', usingOld.promptVersionAbsentName === 'judgedBeforePromptVersionRecorded' && !('promptVersion' in usingOld) && !('judge' in usingOld), JSON.stringify(usingOld));
	const reportArguments = { job: storedFixture.job, submission: storedFixture.submission, describedList: null, judgmentRowList: recordedRowList, spentUsd: 0, answerNoteValues: storedFixture.answerNoteValues, pageNumber: 1, pageSize: 20, answeredFromNow: storedFixture.answeredFromNow, rowDetail: 'full' };
	const leanReport = reportOf({ ...reportArguments, detail: 'lean' });
	const auditReport = reportOf({ ...reportArguments, detail: 'audit' });
	ok('a unit\'s recorded rendererVersion stays out of the lean result', leanReport.fieldList.every((oneField) => oneField.resultList.every((oneResult) => !('rendererVersion' in oneResult))));
	ok('audit keeps each unit\'s rendererVersion and the whole judge block, promptVariant and all', auditReport.fieldList.some((oneField) => oneField.resultList.some((oneResult) => oneResult.rendererVersion === 'bridgeEvidenceRenderer-derivedJudgeSlot-v1')) && auditReport.judge.promptVariant === 'derivedJudgeSlot');
}

// ---- 2. Q67a: requestPath on fetch
console.log('- 2. Q67a: requestPath');
{
	const leanReport = reportOf({ job: storedFixture.job, submission: storedFixture.submission, describedList: null, judgmentRowList: storedFixture.judgmentRowList, spentUsd: 0, answerNoteValues: storedFixture.answerNoteValues, pageNumber: 1, pageSize: 20, answeredFromNow: storedFixture.answeredFromNow, rowDetail: 'full', detail: 'lean' });
	const pathField = leanReport.fieldList.find((oneField) => oneField.requestName === 'assessmentIdentifierType');
	ok('a field with a place in the document carries requestPath, and no path', pathField.requestPath === '$.assessment.identifierType' && !('path' in pathField), JSON.stringify(pathField && Object.keys(pathField)));
	ok('a fetch field reads requestName, requestPath, requestDefinition, in that order', sameJson(Object.keys(pathField).slice(0, 3), ['requestName', 'requestPath', 'requestDefinition']), JSON.stringify(Object.keys(pathField)));
	ok('no fetch field anywhere carries path', leanReport.fieldList.every((oneField) => !('path' in oneField)));
}

// ---- 3. Q67b: the retrieval answer in fetch's words
console.log('- 3. Q67b: retrieval');
const PARSER_LIMIT_VALUES = Object.freeze({ maxUnresolvedListLength: 50, maxFieldListLength: 200, maxFieldNameChars: 200, maxFieldDefinitionChars: 2000, maxFieldPathChars: 500, maxDocumentDepth: 32, maxRefExpansions: 1000 });
const PARSER_BY_FORMAT_NAME = Object.freeze({ fieldList: parseFieldList, jsonSchema: parseJsonSchema });
// a pre-P7b capture, turned back into the arguments its answer was made from: the real parser on the captured input, the captured pools, the captured notes and settings
const retrievalArgumentsOf = (capture, detail) => {
	const beforeAnswer = capture.body.answer;
	const formatName = beforeAnswer.submissionFormat;
	const parsed = PARSER_BY_FORMAT_NAME[formatName]({ submittedDocument: capture.input[formatName], parserLimitValues: PARSER_LIMIT_VALUES });
	const fieldVectorList = parsed.fieldList.map((unusedField, fieldIndex) => ({ fieldRefId: `field${fieldIndex}` }));
	const poolByTargetName = beforeAnswer.hubList.reduce((soFar, hubName) => ({ ...soFar, [hubName]: beforeAnswer.fieldList.reduce((poolsSoFar, oneField, fieldIndex) => ({ ...poolsSoFar, [`field${fieldIndex}`]: oneField.byHub[hubName] }), {}) }), {});
	return {
		submissionForm: { formatName },
		parsed,
		hubRowList: beforeAnswer.hubList.map((hubName) => ({ hubName })),
		poolByTargetName,
		fieldVectorList,
		// ⟪rosettaSearchDescription⟫ captured before search descriptions: each bare field as a describer that is off would answer it
		describedList: parsed.fieldList.map((oneField) => (oneField.definition ? undefined : searchDescriptionAbsentOf('describerOff'))),
		facts: { nothingJudgedNote: beforeAnswer.nothingJudgedNote, rankNote: beforeAnswer.rankNote, searchDescriptionNote: registry.rosettaAnswerNote.searchDescriptionNote },
		fuseValues: { hitsPerText: beforeAnswer.retrievalSetting.hitsPerText, minScore: beforeAnswer.retrievalSetting.minCosine, poolCap: beforeAnswer.retrievalSetting.poolCap },
		detail,
	};
};
const beforeFieldListFull = require(path.join(RETRIEVAL_FIXTURE_DIR_PATH, 'before_eb866fc_fieldList_full.json'));
const beforeSchemaFull = require(path.join(RETRIEVAL_FIXTURE_DIR_PATH, 'before_eb866fc_jsonSchema_full.json'));
const beforeFieldListSummary = require(path.join(RETRIEVAL_FIXTURE_DIR_PATH, 'before_eb866fc_fieldList_summary.json'));
const beforeSchemaSummary = require(path.join(RETRIEVAL_FIXTURE_DIR_PATH, 'before_eb866fc_jsonSchema_summary.json'));
{
	const leanList = retrievalAnswerOf(retrievalArgumentsOf(beforeFieldListFull, 'lean'));
	const leanSchema = retrievalAnswerOf(retrievalArgumentsOf(beforeSchemaFull, 'lean'));
	const field0 = leanList.fieldList[0];
	ok('a field sent with a definition and a type: requestName, requestDefinition, requestType, then resultList', sameJson(Object.keys(field0), ['requestName', 'requestDefinition', 'requestType', 'resultList']) && field0.requestName === beforeFieldListFull.input.fieldList[0].name && field0.requestDefinition === beforeFieldListFull.input.fieldList[0].definition.trim() && field0.requestType === 'string', JSON.stringify(Object.keys(field0)));
	ok('a field sent with a name alone: requestName, definitionAbsent, why it has no search description (rosettaSearchDescription), resultList', sameJson(Object.keys(leanList.fieldList[2]), ['requestName', 'definitionAbsent', 'searchDescriptionAbsent', 'searchDescriptionAbsentReason', 'resultList']), JSON.stringify(Object.keys(leanList.fieldList[2])));
	ok('a schema property: requestName, requestPath, requestDefinition, requestType', sameJson(Object.keys(leanSchema.fieldList[0]).slice(0, 4), ['requestName', 'requestPath', 'requestDefinition', 'requestType']) && leanSchema.fieldList[0].requestPath === beforeSchemaFull.body.answer.fieldList[0].path, JSON.stringify(leanSchema.fieldList[0] && Object.keys(leanSchema.fieldList[0])));
	ok('resultList: one item per hub, in hub order, each { hub, ...the pool }', sameJson(field0.resultList.map((oneResult) => oneResult.hub), ['CEDS', 'CTDL']) && sameJson(field0.resultList[0], { hub: 'CEDS', ...beforeFieldListFull.body.answer.fieldList[0].byHub.CEDS }));
	ok('no field carries name, path, type or byHub', [...leanList.fieldList, ...leanSchema.fieldList].every((oneField) => ['name', 'path', 'type', 'byHub'].every((fieldName) => !(fieldName in oneField))));
	ok('lean: no fieldCount, no poolCountByHub, no poolCountList', ['fieldCount', 'poolCountByHub', 'poolCountList'].every((fieldName) => !(fieldName in leanList)), JSON.stringify(Object.keys(leanList)));
	const auditList = retrievalAnswerOf(retrievalArgumentsOf(beforeFieldListFull, 'audit'));
	ok('audit: fieldCount and poolCountList [{ hub, fieldsWithCandidates, emptyPools }]', auditList.fieldCount === 3 && Array.isArray(auditList.poolCountList) && sameJson(auditList.poolCountList.map((oneCount) => Object.keys(oneCount)), [['hub', 'fieldsWithCandidates', 'emptyPools'], ['hub', 'fieldsWithCandidates', 'emptyPools']]) && !('poolCountByHub' in auditList), JSON.stringify(auditList.poolCountList));
	ok('detail must be lean or audit: anything else throws', threwMatching(() => retrievalAnswerOf(retrievalArgumentsOf(beforeFieldListFull, undefined)), /detail must be one of lean, audit/) && threwMatching(() => retrievalAnswerOf(retrievalArgumentsOf(beforeFieldListFull, 'full')), /detail must be one of/));
}

// ---- 4. retrieval's audit loses nothing eb866fc answered
console.log('- 4. retrieval: detail=audit loses nothing');
// the P7b renames, as path rewrites of an eb866fc answer: name, path, type, byHub.<hub> and poolCountByHub.<hub> (a hub is its place in hubList)
const renamedRetrievalPathOf = (oldPath, hubNameList) => oldPath
	.replace(/^fieldList\.(\d+)\.name$/, 'fieldList.$1.requestName')
	.replace(/^fieldList\.(\d+)\.path$/, 'fieldList.$1.requestPath')
	.replace(/^fieldList\.(\d+)\.type$/, 'fieldList.$1.requestType')
	.replace(/^fieldList\.(\d+)\.byHub\.([A-Za-z0-9]+)\./, (unusedMatch, fieldIndex, hubName) => `fieldList.${fieldIndex}.resultList.${hubNameList.indexOf(hubName)}.`)
	.replace(/^poolCountByHub\.([A-Za-z0-9]+)\./, (unusedMatch, hubName) => `poolCountList.${hubNameList.indexOf(hubName)}.`);
// what the audit answer has that eb866fc did not: each item's hub, and the definition as sent; ⟪rosettaSearchDescription⟫ and, for a field given no description,
// why it has no search description (these captures run as a describer that is off), with the note saying what one is
const ADDED_ON_PURPOSE_PATTERN = /\.resultList\.\d+\.hub$|^poolCountList\.\d+\.hub$|^fieldList\.\d+\.requestDefinition$|^fieldList\.\d+\.searchDescription(Absent|AbsentReason|\.descriptionText|\.writtenByModel)$|^searchDescriptionNote$/;
[[beforeFieldListFull, 'fieldList'], [beforeSchemaFull, 'jsonSchema']].forEach(([capture, formLabel]) => {
	const hubNameList = capture.body.answer.hubList;
	const auditLeafMap = leafMapOf(retrievalAnswerOf(retrievalArgumentsOf(capture, 'audit')));
	const beforeLeafMap = leafMapOf(capture.body.answer);
	const lostList = [...beforeLeafMap].filter(([oldPath, oldText]) => auditLeafMap.get(renamedRetrievalPathOf(oldPath, hubNameList)) !== oldText);
	ok(`${formLabel}: every one of the ${beforeLeafMap.size} leaves eb866fc answered is in the audit answer, under its new name, with its value`, lostList.length === 0, JSON.stringify(lostList.slice(0, 5)));
	const leanLeafMap = leafMapOf(retrievalAnswerOf(retrievalArgumentsOf(capture, 'lean')));
	const notInAuditList = [...leanLeafMap].filter(([leanPath, leanText]) => auditLeafMap.get(leanPath) !== leanText);
	ok(`${formLabel}: every lean leaf is in the audit answer`, notInAuditList.length === 0, JSON.stringify(notInAuditList.slice(0, 5)));
	const oldRenamedPathSet = new Set([...beforeLeafMap.keys()].map((oldPath) => renamedRetrievalPathOf(oldPath, hubNameList)));
	const addedList = [...auditLeafMap.keys()].filter((auditPath) => !oldRenamedPathSet.has(auditPath));
	ok(`${formLabel}: the audit answer adds only each item's hub and the definition as sent`, addedList.every((auditPath) => ADDED_ON_PURPOSE_PATTERN.test(auditPath)), JSON.stringify(addedList.filter((auditPath) => !ADDED_ON_PURPOSE_PATTERN.test(auditPath)).slice(0, 5)));
});

// ---- 5. the summary of retrieval
console.log('- 5. retrieval: the summary');
[[beforeFieldListFull, beforeFieldListSummary, 'fieldList'], [beforeSchemaFull, beforeSchemaSummary, 'jsonSchema']].forEach(([fullCapture, summaryCapture, formLabel]) => {
	const hubNameList = fullCapture.body.answer.hubList;
	const auditSummary = SUMMARY_SHAPER_BY_NAME.rosettaRetrieval({ answer: retrievalAnswerOf(retrievalArgumentsOf(fullCapture, 'audit')), summaryShape: registry.summaryShape });
	const leanSummary = SUMMARY_SHAPER_BY_NAME.rosettaRetrieval({ answer: retrievalAnswerOf(retrievalArgumentsOf(fullCapture, 'lean')), summaryShape: registry.summaryShape });
	ok(`${formLabel}: each summary field is requestName and resultList [{ hub, poolSize, topCandidateList }]`, leanSummary.fieldList.every((oneField) => 'requestName' in oneField && !('name' in oneField) && !('byHub' in oneField) && sameJson(oneField.resultList.map((oneResult) => Object.keys(oneResult)), hubNameList.map(() => ['hub', 'poolSize', 'topCandidateList']))), JSON.stringify(leanSummary.fieldList[0]));
	ok(`${formLabel}: leftOutOfSummary names the request fields it left out, never byHub`, !leanSummary.leftOutOfSummary.fieldFieldNameList.includes('byHub') && !leanSummary.leftOutOfSummary.fieldFieldNameList.includes('resultList'), JSON.stringify(leanSummary.leftOutOfSummary.fieldFieldNameList));
	// what changed in a summary on purpose: the renamed fields (as in the full answer), leftOutOfSummary.fieldFieldNameList, which names the new field names, and howToAsk, which now names detail=audit
	const auditSummaryLeafMap = leafMapOf(auditSummary);
	const CHANGED_ON_PURPOSE_PATTERN = /^leftOutOfSummary\.fieldFieldNameList\.|^leftOutOfSummary\.howToAsk$/;
	const lostList = [...leafMapOf(summaryCapture.body.answer)].filter(([oldPath, oldText]) => !CHANGED_ON_PURPOSE_PATTERN.test(oldPath) && auditSummaryLeafMap.get(renamedRetrievalPathOf(oldPath, hubNameList)) !== oldText);
	ok(`${formLabel}: every leaf of eb866fc's summary is in the audit summary, under its new name, but the left-out field names and howToAsk`, lostList.length === 0, JSON.stringify(lostList.slice(0, 5)));
	ok(`${formLabel}: howToAsk names detail=audit`, /detail=audit/.test(leanSummary.leftOutOfSummary.howToAsk));
});

// ---- 6. the registry
console.log('- 6. the registry');
{
	const retrievalRow = registry.operationList.find((oneRow) => oneRow.operationName === 'rosettaRetrieval');
	const fetchRow = registry.operationList.find((oneRow) => oneRow.operationName === 'rosettaFetch');
	const detailField = retrievalRow.inputFieldList.find((oneField) => oneField.name === 'detail');
	ok('rosettaRetrieval takes detail: lean or audit, default lean', detailField && sameJson(detailField.enum, ['lean', 'audit']) && detailField.defaultValue === 'lean');
	const { _comment: unusedRetrievalComment, ...retrievalRule } = retrievalRow.envelopeRule || {};
	const { _comment: unusedFetchComment, ...fetchRule } = fetchRow.envelopeRule;
	ok('its envelopeRule is fetch\'s: lean answeredFrom { graphName, manifest }, no uriNote', sameJson(retrievalRule, fetchRule), JSON.stringify(retrievalRule));
	ok('the retrieval summary picks requestName, not name', registry.summaryShape.retrievalFieldFieldList.includes('requestName') && !registry.summaryShape.retrievalFieldFieldList.includes('name'));
	ok('retrieval\'s about entry expects no poolCountByHub', !retrievalRow.aboutEntry.expectedAnswerFieldList.includes('poolCountByHub'));
	ok('retrieval\'s description teaches requestName and resultList, never byHub', /requestName/.test(retrievalRow.description) && /resultList/.test(retrievalRow.description) && !/byHub/.test(retrievalRow.description));
	ok('fetch\'s description names promptVersion, not "names the judge"', /promptVersion/.test(fetchRow.description) && !/names the judge/.test(fetchRow.description), fetchRow.description);
}

console.log(`\nrosetta-vocabulary: ${passedCount} passed, ${failedCount} failed`);
process.exit(failedCount === 0 ? 0 : 1);
