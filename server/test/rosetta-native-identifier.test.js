'use strict';
// rosetta-native-identifier.test.js — WORKORDER-P7-apiAnswerFixes-110726 fix 1, HERMETIC half: no graph, no vendor. A Rosetta proposal names its hub element by the element's OWN
// identifier (CEDS cedsId P002040) or says by name why it has none; it is never blank and never the stableId. The live half (a judged job on the real golden, through the core
// both doors call) is gate P7nativeIdentifier in rosetta-judged-live.test.js.
//   1. hubElementIdentityFor on a stub graph: the identifier, a number carried as text, and every named absence; a bad tier or a failed read is an error, not an absence.
//   2. absentOf refuses a name it does not declare.
//   3. rosettaReport (detail=audit, where P7a moved these fields): a proposal recorded before P7 reads judgedBeforeNativeIdentifierRecorded; one recorded after keeps its identifier.
//   4. the fetch summary's line: ⟪P7a⟫ the bracket now holds the card's tuple (rosetta-fetch-shape.test.js); a row with none names that absence, and the P7 identifier alone no longer prints.
//   node server/test/rosetta-native-identifier.test.js

const { hubElementIdentityFor, absentOf, HUB_ELEMENT_NATIVE_IDENTIFIER_ABSENT_NAME_LIST } = require('../lib/standards-query/rosetta/hubElementIdentity');
const { reportOf } = require('../lib/standards-query/rosetta/rosettaReport');
const { SUMMARY_SHAPER_BY_NAME } = require('../lib/standards-query/answerSummaries');
const registry = require('../lib/standards-query/standardsQueryOperations.json');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

// ---- the stub graph: the declarations query and the element query, each answered from the case
const recordOf = (fieldByName) => ({ get: (fieldName) => fieldByName[fieldName] });
const DECLARED_ROW_LIST = [{ sourceKey: 'CEDS', nativeIdentifierPropertyName: 'cedsId' }, { sourceKey: 'CTDL', nativeIdentifierPropertyName: 'uri' }, { sourceKey: 'JEDx', nativeIdentifierPropertyName: null }];
const stubRunCypherFor = ({ declarationRowList = DECLARED_ROW_LIST, elementRowList = [], elementError = '' }) => {
	const queryLog = [];
	const runCypher = (unusedSession, cypherText, parameters, done) => {
		queryLog.push({ cypherText, parameters });
		if (/StandardDefinition/.test(cypherText)) {
			done('', { records: declarationRowList.map(recordOf) });
			return;
		}
		if (elementError) {
			done(elementError);
			return;
		}
		done('', { records: elementRowList.map(recordOf) });
	};
	return { runCypher, queryLog };
};
const identityCaseList = [
	{ caseName: 'the element carries its identifier', stub: { elementRowList: [{ elementSource: 'CEDS', nativeIdentifier: 'P002040' }] }, expected: { hubElementNativeIdentifier: 'P002040', hubElementNativeIdentifierPropertyName: 'cedsId' } },
	{ caseName: 'a numeric identifier is carried as its text', stub: { elementRowList: [{ elementSource: 'CEDS', nativeIdentifier: 2040 }] }, expected: { hubElementNativeIdentifier: '2040', hubElementNativeIdentifierPropertyName: 'cedsId' } },
	{ caseName: 'CTDL: its declared identifier (uri)', hubName: 'CTDL', stub: { elementRowList: [{ elementSource: 'CTDL', nativeIdentifier: 'ceterms:dateEffective' }] }, expected: { hubElementNativeIdentifier: 'ceterms:dateEffective', hubElementNativeIdentifierPropertyName: 'uri' } },
	{ caseName: 'no StandardDefinition declares one: nativeIdentifierUnstamped', stub: { declarationRowList: [{ sourceKey: 'CEDS', nativeIdentifierPropertyName: null }] }, expected: { hubElementNativeIdentifierAbsentName: 'nativeIdentifierUnstamped' } },
	{ caseName: 'a declaration outside the grammar: nativeIdentifierDeclarationInvalid', stub: { declarationRowList: [{ sourceKey: 'CEDS', nativeIdentifierPropertyName: 'ceds id' }] }, expected: { hubElementNativeIdentifierAbsentName: 'nativeIdentifierDeclarationInvalid' } },
	{ caseName: 'the card reaches no element: hubElementNotFound', stub: { elementRowList: [] }, expected: { hubElementNativeIdentifierAbsentName: 'hubElementNotFound' } },
	{ caseName: 'the card reaches two: hubElementAmbiguous', stub: { elementRowList: [{ elementSource: 'CEDS', nativeIdentifier: 'P1' }, { elementSource: 'CEDS', nativeIdentifier: 'P2' }] }, expected: { hubElementNativeIdentifierAbsentName: 'hubElementAmbiguous' } },
	{ caseName: 'the element\'s standard declares none: hubStandardDeclaresNoNativeIdentifier', stub: { elementRowList: [{ elementSource: 'JEDx', nativeIdentifier: null }] }, expected: { hubElementNativeIdentifierAbsentName: 'hubStandardDeclaresNoNativeIdentifier' } },
	{ caseName: 'the element lacks it: hubElementCarriesNoNativeIdentifier', stub: { elementRowList: [{ elementSource: 'CEDS', nativeIdentifier: null }] }, expected: { hubElementNativeIdentifierAbsentName: 'hubElementCarriesNoNativeIdentifier' } },
];

console.log('\n=== P7 fix 1: a Rosetta proposal names its hub element by its own identifier ===\n');
console.log('- 1. hubElementIdentityFor');
identityCaseList.forEach(({ caseName, hubName = 'CEDS', stub, expected }) => {
	const { runCypher, queryLog } = stubRunCypherFor(stub);
	hubElementIdentityFor({ runCypher, session: {}, cardStableId: 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/ab39', hubName, tierName: 'property' }, (identityError, identityFields) => {
		ok(`${caseName}`, !identityError && JSON.stringify(identityFields) === JSON.stringify(expected), identityError || JSON.stringify(identityFields));
		const elementQuery = queryLog.find((oneQuery) => !/StandardDefinition/.test(oneQuery.cypherText));
		if (elementQuery) {
			ok(`  ${caseName}: the element is read through the card's own PROPERTY slot (HAS_${hubName.toUpperCase()}_PROPERTY), with no stand-in identifier`, elementQuery.parameters.elementSlotEdgeType === `HAS_${hubName.toUpperCase()}_PROPERTY` && !/stableId, |persistentId/.test(elementQuery.cypherText.split('AS nativeIdentifier')[0].split('RETURN')[1]), elementQuery.cypherText);
		}
	});
});
{
	const { runCypher } = stubRunCypherFor({ elementError: 'the bolt went away' });
	hubElementIdentityFor({ runCypher, session: {}, cardStableId: 'c', hubName: 'CEDS', tierName: 'property' }, (identityError) => ok('a failed read is an error the runner names, not an absence', /would not read: the bolt went away/.test(identityError || ''), identityError));
	hubElementIdentityFor({ runCypher, session: {}, cardStableId: 'c', hubName: 'CEDS', tierName: 'value' }, (identityError) => ok('a tier with no element slot is refused by name', /tier 'value' names no element slot/.test(identityError || ''), identityError));
	hubElementIdentityFor({ runCypher, session: {}, cardStableId: '', hubName: 'CEDS', tierName: 'property' }, (identityError) => ok('an absent cardStableId is refused by name', /cardStableId must be a stableId/.test(identityError || ''), identityError));
}

console.log('- 2. absentOf');
{
	let undeclaredThrew = false;
	try { absentOf('somethingInvented'); } catch (absentError) { undeclaredThrew = /not a declared absent name/.test(absentError.message); }
	ok('an undeclared absent name is refused', undeclaredThrew);
	ok('every declared name builds its field', HUB_ELEMENT_NATIVE_IDENTIFIER_ABSENT_NAME_LIST.every((absentName) => absentOf(absentName).hubElementNativeIdentifierAbsentName === absentName));
}

console.log('- 3. rosettaReport');
const JOB = Object.freeze({ jobRefId: 'a'.repeat(32), status: 'done', fieldCount: 2, hubNameList: ['CEDS', 'CTDL'], embeddingTokens: 10, estimateUsd: 0.1, submittedAtMs: 1, startedAtMs: 2, finishedAtMs: 3, expiresAtMs: 4, judgeFacts: { promptVariant: 'derivedJudgeSlot', model: 'fixture' }, answeredFrom: { manifestRefId: 'm' } });
const proposalOf = (label, identityFields) => ({ uri: `https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/${label.length}`, label, domain: 'Person Military', category: 'strong', confidence: 0.9, predicate: 'exactMatch', ...identityFields });
const judgmentRowList = [
	{ fieldIndex: 0, hubName: 'CEDS', unitStatus: 'proposed', judgment: { poolSize: 3, admittedCount: 3, runnerUpList: [], judgesRationale: 'same', proposal: proposalOf('Military Discharge Date', { hubElementNativeIdentifier: 'P002040', hubElementNativeIdentifierPropertyName: 'cedsId' }) } },
	{ fieldIndex: 0, hubName: 'CTDL', unitStatus: 'proposed', judgment: { poolSize: 3, admittedCount: 3, runnerUpList: [], judgesRationale: 'same', proposal: proposalOf('Date Effective', {}) } },
	{ fieldIndex: 1, hubName: 'CEDS', unitStatus: 'proposed', judgment: { poolSize: 3, admittedCount: 3, runnerUpList: [], judgesRationale: 'same', proposal: proposalOf('Birthdate', absentOf('hubElementCarriesNoNativeIdentifier')) } },
	{ fieldIndex: 1, hubName: 'CTDL', unitStatus: 'abstained', judgment: { poolSize: 3, admittedCount: 3, runnerUpList: [], judgesRationale: 'none' } },
];
const submission = { fieldList: [{ name: 'Military Discharge Date' }, { name: 'Birth Date' }], submissionNote: {} };
const answerNoteValues = { draftNote: 'd', strongOnlyNote: 's', strongEvidenceNote: 'e', rationaleNote: 'r', partialNote: 'p' };
const fullReport = reportOf({ job: JOB, submission, describedList: null, judgmentRowList, spentUsd: 0.01, answerNoteValues, pageNumber: 1, pageSize: 10, rowDetail: 'full', detail: 'audit', answeredFromNow: JOB.answeredFrom });
const resultOfHub = (oneField, hubName) => oneField.resultList.find((oneResult) => oneResult.hub === hubName);
ok('a proposal recorded with its identifier keeps it', resultOfHub(fullReport.fieldList[0], 'CEDS').proposal.hubElementNativeIdentifier === 'P002040' && !('hubElementNativeIdentifierAbsentName' in resultOfHub(fullReport.fieldList[0], 'CEDS').proposal));
ok('a proposal recorded before P7 says judgedBeforeNativeIdentifierRecorded, never a blank', resultOfHub(fullReport.fieldList[0], 'CTDL').proposal.hubElementNativeIdentifierAbsentName === 'judgedBeforeNativeIdentifierRecorded', JSON.stringify(resultOfHub(fullReport.fieldList[0], 'CTDL').proposal));
ok('a recorded absence is kept as recorded', resultOfHub(fullReport.fieldList[1], 'CEDS').proposal.hubElementNativeIdentifierAbsentName === 'hubElementCarriesNoNativeIdentifier');
ok('a unit with no proposal gains no identity field', !('proposal' in resultOfHub(fullReport.fieldList[1], 'CTDL')));
ok('the stored row is not changed by the report', !('hubElementNativeIdentifierAbsentName' in judgmentRowList[1].judgment.proposal));

console.log('- 4. the fetch summary line');
const summaryAnswer = reportOf({ job: JOB, submission, describedList: null, judgmentRowList, spentUsd: 0.01, answerNoteValues, pageNumber: 1, pageSize: 10, rowDetail: 'summary', detail: 'lean', answeredFromNow: JOB.answeredFrom });
const summary = SUMMARY_SHAPER_BY_NAME.rosettaFetch({ answer: summaryAnswer, summaryShape: registry.summaryShape });
console.log(`  lines: ${JSON.stringify(summary.fieldLineList)}`);
ok('⟪P7a⟫ a proposal recorded before its tuple names that absence in the bracket', summary.fieldLineList[0][1] === 'CEDS strong [no tuple: judgedBeforeTupleRecorded]: Military Discharge Date', summary.fieldLineList[0][1]);
ok('⟪P7a⟫ the P7 identifier alone no longer prints: the tuple bracket replaced it', !/cedsId P002040|no native identifier/.test(JSON.stringify(summary.fieldLineList)), JSON.stringify(summary.fieldLineList));
ok('a unit with no proposal reads its status as before', summary.fieldLineList[1][2] === 'CTDL abstained');
ok('the line note says what the brackets hold', /tuple in brackets/.test(summary.fieldLineNote || ''), summary.fieldLineNote);
const tightSummary = SUMMARY_SHAPER_BY_NAME.rosettaFetch({ answer: summaryAnswer, summaryShape: { ...registry.summaryShape, judgedAnswerByteBudget: 1 } });
ok('when the budget drops the labels the bracket stays', tightSummary.fieldLineList[0][1] === 'CEDS strong [no tuple: judgedBeforeTupleRecorded]', tightSummary.fieldLineList[0][1]);

console.log(`\nrosetta-native-identifier: ${passedCount} passed, ${failedCount} failed`);
process.exit(failedCount === 0 ? 0 : 1);
