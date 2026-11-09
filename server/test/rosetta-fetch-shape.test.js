'use strict';
// rosetta-fetch-shape.test.js — WORKORDER-P7a-rosettaPayloadShape-110926, HERMETIC half: no graph, no vendor, no network. The Rosetta fetch answer in the shape TQ approved (Q61-Q64):
// fields by requestName and requestDefinition, resultList naming each hub, every proposal naming its card's TUPLE, and detail=audit giving back everything the lean form leaves out.
//   1. hubCardTuple: every branch of the pure reader (cardTupleFactsOf) on stub rows; the bracket text; the refusals.
//   2. the lean full answer: the exact shape for a property, value, qualified, term and CTDL card (fixtures/rosettaFetchShape/tupledJobFixture.json, read from GOLD_261030_useCases
//      by runs/P7a/makeTupledFixture.js; rosetta-fetch-shape-live.test.js re-reads the golden and checks this fixture still matches it).
//   3. detail=audit loses nothing: every leaf the code at 0c1f86f answered (fixtures/rosettaFetchShape/before_0c1f86f_*.json, captured from that tree) is in the audit answer, under
//      its new name; and every lean leaf is in the audit answer.
//   4. the summary: the tuple bracket, the lean summary has no job or judge block, and the bracket survives a 1-byte budget.
//   5. the registry: rosettaFetch declares detail (lean | audit, default lean) and an envelopeRule; no other row does.
//   node server/test/rosetta-fetch-shape.test.js

const path = require('path');
const { cardTupleFactsOf, tupleAbsentOf, tupleBracketTextOf, hubCardTupleFor, TUPLE_ABSENT_NAME_LIST } = require('../lib/standards-query/hubCardTuple');
const { reportOf, usingOf } = require('../lib/standards-query/rosetta/rosettaReport');
const { cardTupleFieldsOf } = require('../lib/standards-query/rosetta/rosettaJobRunner');
const { SUMMARY_SHAPER_BY_NAME } = require('../lib/standards-query/answerSummaries');
const { rangeFieldsOf, withMeaningRangeList, rangeListAbsentOf } = require('../lib/edc-resolver/meaningRangeList');
const registry = require('../lib/standards-query/standardsQueryOperations.json');

const FIXTURE_DIR_PATH = path.join(__dirname, 'fixtures', 'rosettaFetchShape');
const tupledFixture = require(path.join(FIXTURE_DIR_PATH, 'tupledJobFixture.json'));
const storedFixture = require(path.join(FIXTURE_DIR_PATH, 'storedJobFixture.json'));
const beforeFullPage1 = require(path.join(FIXTURE_DIR_PATH, 'before_0c1f86f_fullPage1.json'));
const beforeFullPage2 = require(path.join(FIXTURE_DIR_PATH, 'before_0c1f86f_fullPage2.json'));
const beforeSummary = require(path.join(FIXTURE_DIR_PATH, 'before_0c1f86f_summary.json'));

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

// ---- 1. hubCardTuple on stub rows
const CEDS_PROFILE_TEXT = JSON.stringify({ fieldList: [{ fieldName: 'rangeOptionSetId', hashSlot: 'range' }, { fieldName: 'rangeDatatype', hashSlot: 'range' }] });
const CTDL_PROFILE_TEXT = JSON.stringify({ fieldList: [{ fieldName: 'rangeClassIdList', rangeAddressing: 'rangeAsMeaning' }, { fieldName: 'rangeDatatypeList', rangeAddressing: 'rangeAsMeaning' }] });
const DECLARED = { declarationList: [{ sourceKey: 'CEDS', nativeIdentifierPropertyName: 'cedsId' }, { sourceKey: 'CTDL', nativeIdentifierPropertyName: 'uri' }] };
const mintAll = ({ stableId, standardName }) => ({ uri: `https://w3id.org/EDUcore/${standardName}/v/${stableId.split('/').pop()}` });
const slotRowOf = (edgeType, graphLabel, stableId, nativeIdentifier, standardName = 'CEDS') => ({ edgeType, graphLabelList: ['ForgedNode', graphLabel], stableId, standardName, label: `label of ${stableId}`, nativeIdentifier });
const cedsRowsOf = (slotRowList, datatypeWritten = null, slotProfileText = CEDS_PROFILE_TEXT) => [{ slotProfileText, datatypeFieldList: [{ fieldName: 'rangeDatatype', written: datatypeWritten }, { fieldName: 'rangeDatatypeList', written: null }], slotRowList }];
const DOMAIN_ROW = slotRowOf('HAS_CEDS_DOMAIN', 'DmeClass', 'ceds/C200296', 'C200296');
const PROPERTY_ROW = slotRowOf('HAS_CEDS_PROPERTY', 'DmeProperty', 'ceds/P002040', 'P002040');

console.log('\n=== P7a: the Rosetta fetch answer in the shape TQ chose ===\n');
console.log('- 1. hubCardTuple');
{
	const facts = cardTupleFactsOf({ cardRowList: cedsRowsOf([PROPERTY_ROW, DOMAIN_ROW], 'dateTime'), declarationVerdict: DECLARED, uriForElement: mintAll });
	ok('a property card: domain then property, whatever order the graph returned them', sameJson(Object.keys(facts.tuple), ['domain', 'property']), JSON.stringify(facts));
	ok('each part is { kind, nativeId, label, uri }, kind from the graph label, nativeId keyed by the declared name', sameJson(facts.tuple.domain, { kind: 'class', nativeId: { cedsId: 'C200296' }, label: 'label of ceds/C200296', uri: 'https://w3id.org/EDUcore/CEDS/v/C200296' }), JSON.stringify(facts.tuple.domain));
	ok('a datatype range the profile declares is kept as written; the card has no range part', sameJson(facts.rangeDatatypeList, ['dateTime']) && facts.rangePartList.length === 0 && facts.rangeIsIdentity === true);
	ok('the bracket lists the native ids in slot order', tupleBracketTextOf(facts) === '[C200296 · P002040]', tupleBracketTextOf(facts));
}
{
	const rowList = [DOMAIN_ROW, PROPERTY_ROW, slotRowOf('HAS_CEDS_RANGE', 'DmeOptionSet', 'ceds/C000258', 'OS000258'), slotRowOf('HAS_CEDS_VALUE', 'DmeOptionValue', 'ceds/NI000258115741', 'OV000258115741')];
	const facts = cardTupleFactsOf({ cardRowList: cedsRowsOf(rowList), declarationVerdict: DECLARED, uriForElement: mintAll });
	ok('a value card: domain, property, range, value; range optionSet, value option', sameJson(Object.keys(facts.tuple), ['domain', 'property', 'range', 'value']) && facts.tuple.range.kind === 'optionSet' && facts.tuple.value.kind === 'option', JSON.stringify(facts.tuple));
	ok('an addressed range is in the tuple AND in rangePartList', facts.rangePartList.length === 1 && sameJson(facts.rangePartList[0], facts.tuple.range));
	ok('the bracket: [C200296 · P002040 · OS000258 · OV000258115741]', tupleBracketTextOf(facts) === '[C200296 · P002040 · OS000258 · OV000258115741]', tupleBracketTextOf(facts));
}
{
	const facts = cardTupleFactsOf({ cardRowList: cedsRowsOf([DOMAIN_ROW, PROPERTY_ROW, slotRowOf('HAS_CEDS_QUALIFIER', 'DmeOptionValue', 'ceds/NI001199115956', 'OV001199115956')], 'string'), declarationVerdict: DECLARED, uriForElement: mintAll });
	ok('a qualified card: domain, property, qualifier (kind option)', sameJson(Object.keys(facts.tuple), ['domain', 'property', 'qualifier']) && facts.tuple.qualifier.kind === 'option', JSON.stringify(facts.tuple));
}
{
	const facts = cardTupleFactsOf({ cardRowList: cedsRowsOf([slotRowOf('HAS_CEDS_TERM', 'DmeOptionValue', 'ceds/NI001637173741', 'OV001637173741')]), declarationVerdict: DECLARED, uriForElement: mintAll });
	ok('a term card: a single term slot', sameJson(Object.keys(facts.tuple), ['term']) && tupleBracketTextOf(facts) === '[OV001637173741]', JSON.stringify(facts));
}
{
	const ctdlRow = (edgeType, graphLabel, curie) => slotRowOf(edgeType, graphLabel, curie, curie, 'CTDL');
	const rowList = [ctdlRow('HAS_CTDL_DOMAIN', 'DmeClass', 'ceterms:Diploma'), ctdlRow('HAS_CTDL_PROPERTY', 'DmeProperty', 'ceterms:hasProxy'), ctdlRow('HAS_CTDL_RANGE', 'DmeClass', 'ceterms:JobComponent'), ctdlRow('HAS_CTDL_RANGE', 'DmeClass', 'ceterms:BasicComponent'), ctdlRow('HAS_CTDL_RANGE', 'DmeOptionSet', 'ceterms:Audience')];
	const facts = cardTupleFactsOf({ cardRowList: [{ slotProfileText: CTDL_PROFILE_TEXT, datatypeFieldList: [{ fieldName: 'rangeDatatype', written: null }, { fieldName: 'rangeDatatypeList', written: 'xsd:string' }], slotRowList: rowList }], declarationVerdict: DECLARED, uriForElement: mintAll });
	ok('a hub whose profile addresses range as meaning: three RANGE edges do not make the tuple ambiguous; the tuple is domain and property', facts.tuple && sameJson(Object.keys(facts.tuple), ['domain', 'property']) && facts.rangeIsIdentity === false, JSON.stringify(facts));
	ok('its ranges are all in rangePartList, in stableId order, each with its kind', sameJson(facts.rangePartList.map((onePart) => onePart.nativeId.uri), ['ceterms:Audience', 'ceterms:BasicComponent', 'ceterms:JobComponent']) && facts.rangePartList[0].kind === 'optionSet', JSON.stringify(facts.rangePartList));
	ok('CTDL\'s nativeId is keyed by its declared name, uri', sameJson(facts.tuple.property.nativeId, { uri: 'ceterms:hasProxy' }));
	ok('a datatype list written as one string is one item', sameJson(facts.rangeDatatypeList, ['xsd:string']));
	ok('the runner stores rangeList for such a hub, and the tuple without a range', sameJson(Object.keys(cardTupleFieldsOf(facts)), ['tuple', 'rangeList', 'rangeDatatypeList']) && cardTupleFieldsOf(facts).rangeList.length === 3);
}
{
	const twoDomainList = [DOMAIN_ROW, slotRowOf('HAS_CEDS_DOMAIN', 'DmeClass', 'ceds/C200297', 'C200297'), PROPERTY_ROW];
	ok('two elements in a tuple slot: hubCardSlotAmbiguous, never one picked', cardTupleFactsOf({ cardRowList: cedsRowsOf(twoDomainList), declarationVerdict: DECLARED, uriForElement: mintAll }).tupleAbsentName === 'hubCardSlotAmbiguous');
	ok('an element with no known kind label: hubElementKindUnknown', cardTupleFactsOf({ cardRowList: cedsRowsOf([slotRowOf('HAS_CEDS_DOMAIN', 'CedsClass', 'ceds/C1', 'C1')]), declarationVerdict: DECLARED, uriForElement: mintAll }).tupleAbsentName === 'hubElementKindUnknown');
	ok('no card: hubCardNotFound', cardTupleFactsOf({ cardRowList: [], declarationVerdict: DECLARED, uriForElement: mintAll }).tupleAbsentName === 'hubCardNotFound');
	ok('a card reaching no element: hubCardHasNoSlot', cardTupleFactsOf({ cardRowList: cedsRowsOf([]), declarationVerdict: DECLARED, uriForElement: mintAll }).tupleAbsentName === 'hubCardHasNoSlot');
	ok('a slotProfile that is not JSON: hubSlotProfileUnreadable', cardTupleFactsOf({ cardRowList: cedsRowsOf([DOMAIN_ROW], null, '{not json'), declarationVerdict: DECLARED, uriForElement: mintAll }).tupleAbsentName === 'hubSlotProfileUnreadable');
	ok('an absent slotProfile: hubSlotProfileUnreadable', cardTupleFactsOf({ cardRowList: cedsRowsOf([DOMAIN_ROW], null, null), declarationVerdict: DECLARED, uriForElement: mintAll }).tupleAbsentName === 'hubSlotProfileUnreadable');
	const refusedFacts = cardTupleFactsOf({ cardRowList: cedsRowsOf([DOMAIN_ROW, PROPERTY_ROW]), declarationVerdict: { refusalName: 'nativeIdentifierUnstamped' }, uriForElement: mintAll });
	ok('declarations refused: every part says so by the P7 name, never a blank', refusedFacts.tuple.domain.nativeIdAbsentName === 'nativeIdentifierUnstamped' && !('nativeId' in refusedFacts.tuple.domain));
	ok('the bracket names a part\'s absence by slot', tupleBracketTextOf(refusedFacts) === '[domain: nativeIdentifierUnstamped · property: nativeIdentifierUnstamped]', tupleBracketTextOf(refusedFacts));
	const undeclaredFacts = cardTupleFactsOf({ cardRowList: cedsRowsOf([slotRowOf('HAS_CEDS_DOMAIN', 'DmeClass', 'x/C1', 'C1', 'JEDx'), slotRowOf('HAS_CEDS_PROPERTY', 'DmeProperty', 'ceds/P1', null)]), declarationVerdict: DECLARED, uriForElement: mintAll });
	ok('a standard that declares none, and an element that lacks it, each named', undeclaredFacts.tuple.domain.nativeIdAbsentName === 'hubStandardDeclaresNoNativeIdentifier' && undeclaredFacts.tuple.property.nativeIdAbsentName === 'hubElementCarriesNoNativeIdentifier', JSON.stringify(undeclaredFacts.tuple));
	const unmintedFacts = cardTupleFactsOf({ cardRowList: cedsRowsOf([DOMAIN_ROW]), declarationVerdict: DECLARED, uriForElement: () => ({ absentReason: 'notInManifestStore' }) });
	ok('an element the store does not hold: uriAbsentReason, never a uri composed by hand', unmintedFacts.tuple.domain.uriAbsentReason === 'notInManifestStore' && !('uri' in unmintedFacts.tuple.domain));
	const numericFacts = cardTupleFactsOf({ cardRowList: cedsRowsOf([slotRowOf('HAS_CEDS_DOMAIN', 'DmeClass', 'ceds/C9', 2040)]), declarationVerdict: DECLARED, uriForElement: mintAll });
	ok('a numeric identifier is carried as its text', numericFacts.tuple.domain.nativeId.cedsId === '2040');
	ok('a datatype field the profile does not declare is not read', cardTupleFactsOf({ cardRowList: [{ slotProfileText: JSON.stringify({ fieldList: [] }), datatypeFieldList: [{ fieldName: 'rangeDatatype', written: 'string' }], slotRowList: [DOMAIN_ROW] }], declarationVerdict: DECLARED, uriForElement: mintAll }).rangeDatatypeList.length === 0);
	ok('tupleAbsentOf refuses an undeclared name', threwMatching(() => tupleAbsentOf('somethingInvented'), /not a declared tuple absent name/) && TUPLE_ABSENT_NAME_LIST.every((absentName) => tupleAbsentOf(absentName).tupleAbsentName === absentName));
	ok('a tuple that is absent brackets as [no tuple: <name>]', tupleBracketTextOf({ tupleAbsentName: 'judgedBeforeTupleRecorded' }) === '[no tuple: judgedBeforeTupleRecorded]');
	hubCardTupleFor({ runCypher: () => {}, session: {}, hubName: 'CEDS', cardStableId: '', uriForElement: mintAll }, (refusalText) => ok('an empty cardStableId is refused by name', /cardStableId must be a stableId/.test(refusalText)));
	hubCardTupleFor({ runCypher: () => {}, session: {}, hubName: 'CEDS', cardStableId: 'c' }, (refusalText) => ok('no minter is refused by name: a part with no uri would be a blank', /uriForElement must be/.test(refusalText)));
	const queryLog = [];
	const stubRunCypher = (unusedSession, cypherText, parameters, done) => {
		queryLog.push({ cypherText, parameters });
		done('', { records: /StandardDefinition/.test(cypherText) ? [{ get: (fieldName) => ({ sourceKey: 'CEDS', nativeIdentifierPropertyName: 'cedsId' })[fieldName] }] : [] });
	};
	hubCardTupleFor({ runCypher: stubRunCypher, session: {}, hubName: 'CTDL', cardStableId: 'c', uriForElement: mintAll }, (readError, facts) => {
		ok('two reads in all: the declarations, then the card with every slot in one query', queryLog.length === 2 && facts.tupleAbsentName === 'hubCardNotFound', `${queryLog.length} ${JSON.stringify(facts)}`);
		ok('the slot edges are the hub\'s own, read from the rules (HAS_CTDL_DOMAIN ... HAS_CTDL_TERM)', sameJson(queryLog[1].parameters.slotEdgeTypeList, ['HAS_CTDL_DOMAIN', 'HAS_CTDL_PROPERTY', 'HAS_CTDL_RANGE', 'HAS_CTDL_VALUE', 'HAS_CTDL_QUALIFIER', 'HAS_CTDL_TERM']));
	});
}

// ---- 2. the lean full answer, five kinds of card
console.log('- 2. the lean full answer');
const reportArgumentsOf = (fixture, extraArguments) => ({ job: fixture.job, submission: fixture.submission, judgmentRowList: fixture.judgmentRowList, spentUsd: 0, answerNoteValues: fixture.answerNoteValues, pageNumber: 1, pageSize: fixture.pageSize, answeredFromNow: fixture.answeredFromNow, ...extraArguments });
const leanTupled = reportOf(reportArgumentsOf(tupledFixture, { rowDetail: 'full', detail: 'lean' }));
const auditTupled = reportOf(reportArgumentsOf(tupledFixture, { rowDetail: 'full', detail: 'audit' }));
const resultOfHub = (oneField, hubName) => oneField.resultList.find((oneResult) => oneResult.hub === hubName);
{
	const expectedPropertyResult = {
		hub: 'CEDS',
		proposal: {
			uri: 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/ab39501d8fb28c316fc72ba39c1658cc369796ffd35ec2a4a446e5eb0e0c013d',
			label: 'Military Discharge Date',
			tuple: {
				domain: { kind: 'class', nativeId: { cedsId: 'C200296' }, label: 'Person Military', uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:C200296' },
				property: { kind: 'property', nativeId: { cedsId: 'P002040' }, label: 'Military Discharge Date', uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P002040' },
			},
			predicate: 'closeMatch',
			category: 'moderate',
			confidence: 0.7,
		},
		judgesRationale: 'property rationale',
		runnerUpList: [],
		alreadyMappedFrom: [],
	};
	const field0 = leanTupled.fieldList[0];
	ok('a field is { requestName, requestDefinition, resultList }', sameJson(Object.keys(field0), ['requestName', 'requestDefinition', 'resultList']) && field0.requestName === 'dischargeDate', JSON.stringify(Object.keys(field0)));
	ok('PROPERTY CARD: exactly the approved shape (work order, "The shape")', sameJson(resultOfHub(field0, 'CEDS'), expectedPropertyResult), JSON.stringify(resultOfHub(field0, 'CEDS')));
	const ctdlResult = resultOfHub(field0, 'CTDL');
	ok('CTDL CARD: tuple domain + property, nativeId { uri }, no range in the tuple, no rangeList in the lean form', sameJson(Object.keys(ctdlResult.proposal.tuple), ['domain', 'property']) && sameJson(ctdlResult.proposal.tuple.property.nativeId, { uri: 'ceterms:hasProxy' }) && !('rangeList' in ctdlResult.proposal) && /CTDL\/Release%2020260927\/ceterms:hasProxy$/.test(ctdlResult.proposal.tuple.property.uri), JSON.stringify(ctdlResult.proposal));
	ok('CTDL CARD: detail=audit gives its 12 ranges as rangeList, each a part', resultOfHub(auditTupled.fieldList[0], 'CTDL').proposal.rangeList.length === 12 && resultOfHub(auditTupled.fieldList[0], 'CTDL').proposal.rangeList.every((onePart) => sameJson(Object.keys(onePart), ['kind', 'nativeId', 'label', 'uri'])));
	const valueTuple = resultOfHub(leanTupled.fieldList[1], 'CEDS').proposal.tuple;
	ok('VALUE CARD: domain, property, range (optionSet), value (option)', sameJson(Object.keys(valueTuple), ['domain', 'property', 'range', 'value']) && sameJson([valueTuple.range.kind, valueTuple.value.kind], ['optionSet', 'option']) && valueTuple.value.nativeId.cedsId === 'OV000258115741' && /ceds:NI000258115741$/.test(valueTuple.value.uri), JSON.stringify(valueTuple));
	const qualifiedTuple = resultOfHub(leanTupled.fieldList[2], 'CEDS').proposal.tuple;
	ok('QUALIFIED CARD: domain, property, qualifier (option, OV001199115956, uri spelled by stableId NI001199115956)', sameJson(Object.keys(qualifiedTuple), ['domain', 'property', 'qualifier']) && qualifiedTuple.qualifier.kind === 'option' && qualifiedTuple.qualifier.nativeId.cedsId === 'OV001199115956' && /ceds:NI001199115956$/.test(qualifiedTuple.qualifier.uri), JSON.stringify(qualifiedTuple));
	const termTuple = resultOfHub(leanTupled.fieldList[3], 'CEDS').proposal.tuple;
	ok('TERM CARD: a single term part', sameJson(Object.keys(termTuple), ['term']) && termTuple.term.label === 'Bondo', JSON.stringify(termTuple));
	ok('every part of every tuple has its four fields, a kind from the vocabulary and an edc uri', leanTupled.fieldList.flatMap((oneField) => oneField.resultList).filter((oneResult) => oneResult.proposal).every((oneResult) => Object.values(oneResult.proposal.tuple).every((onePart) => sameJson(Object.keys(onePart), ['kind', 'nativeId', 'label', 'uri']) && ['class', 'property', 'optionSet', 'option'].includes(onePart.kind) && /^https:\/\/w3id\.org\/EDUcore\//.test(onePart.uri))));
	ok('the answer leads with jobRefId and status, then fieldList and draftNote', sameJson(Object.keys(leanTupled).slice(0, 2), ['jobRefId', 'status']) && Object.keys(leanTupled).indexOf('fieldList') < Object.keys(leanTupled).indexOf('draftNote'));
}
{
	const leanStored = reportOf(reportArgumentsOf(storedFixture, { rowDetail: 'full', detail: 'lean' }));
	const leanFieldList = leanStored.fieldList;
	const absentFromLeanList = ['job', 'judge', 'strongOnlyNote', 'strongEvidenceNote', 'rationaleNote', 'answeredFromAtSubmit'];
	ok('lean leaves out job, judge, the three notes and answeredFromAtSubmit', absentFromLeanList.every((fieldName) => !(fieldName in leanStored)), JSON.stringify(Object.keys(leanStored)));
	ok('lean leaves out poolSize and admittedCount', leanFieldList.every((oneField) => oneField.resultList.every((oneResult) => !('poolSize' in oneResult) && !('admittedCount' in oneResult))));
	ok('lean shows only non-zero counts', Object.values(leanStored.counts.byHub).every((hubCounts) => Object.values(hubCounts).every((countNumber) => countNumber > 0)) && leanStored.counts.byHub.CEDS.proposedStrong === 9, JSON.stringify(leanStored.counts));
	ok('a proposed result carries no status; any other says its status', !('status' in resultOfHub(leanFieldList[0], 'CEDS')) && resultOfHub(leanFieldList[1], 'CTDL').status === 'abstained' && resultOfHub(leanFieldList[3], 'CTDL').status === 'notJudged');
	ok('a proposal judged before P7a names judgedBeforeTupleRecorded, never a partial tuple', resultOfHub(leanFieldList[0], 'CEDS').proposal.tupleAbsentName === 'judgedBeforeTupleRecorded' && !('tuple' in resultOfHub(leanFieldList[0], 'CEDS').proposal));
	ok('lean leaves out the P7 identifier fields and the domain label (the tuple holds them)', leanFieldList.every((oneField) => oneField.resultList.every((oneResult) => !oneResult.proposal || ['domain', 'hubElementNativeIdentifier', 'hubElementNativeIdentifierPropertyName', 'hubElementNativeIdentifierAbsentName'].every((fieldName) => !(fieldName in oneResult.proposal)))));
	ok('two pages: page, pageCount and totalFieldCount stay in the lean form', leanStored.page === 1 && leanStored.pageCount === 2 && leanStored.totalFieldCount === 12);
	ok('one page: lean leaves page, pageCount and totalFieldCount out', !('page' in leanTupled) && !('pageCount' in leanTupled) && auditTupled.pageCount === 1);
	ok('the graph unchanged since submit: no graphChangedSinceSubmit', !('graphChangedSinceSubmit' in leanStored));
	const changedGraph = reportOf(reportArgumentsOf(storedFixture, { rowDetail: 'full', detail: 'lean', answeredFromNow: { ...storedFixture.answeredFromNow, manifestRefId: 'another' } }));
	ok('the graph changed since submit: graphChangedSinceSubmit holds the graph the job was submitted on', sameJson(changedGraph.graphChangedSinceSubmit, storedFixture.job.answeredFrom));
	ok('detail must be lean or audit: anything else throws, never read as the default', threwMatching(() => reportOf(reportArgumentsOf(storedFixture, { rowDetail: 'full', detail: undefined })), /detail must be one of lean, audit/) && threwMatching(() => reportOf(reportArgumentsOf(storedFixture, { rowDetail: 'full', detail: 'full' })), /detail must be one of/));
	const usingLean = usingOf({ job: storedFixture.job, spentUsd: 0, judgmentRowList: storedFixture.judgmentRowList, judgeCallCount: 0, detail: 'lean' });
	ok('using names the judge by promptVariant, the provider, the model, what it cost and that it came from the cache', sameJson(usingLean, { judge: 'derivedJudgeSlot', provider: 'anthropic', model: 'claude-opus-5', costUsd: 0, cached: true }), JSON.stringify(usingLean));
	ok('one vendor call makes cached false', usingOf({ job: storedFixture.job, spentUsd: 0.07, judgmentRowList: storedFixture.judgmentRowList, judgeCallCount: 1, detail: 'lean' }).cached === false);
	ok('a job that judged nothing is not cached', usingOf({ job: storedFixture.job, spentUsd: 0, judgmentRowList: [], judgeCallCount: 0, detail: 'lean' }).cached === false);
	ok('audit adds the counts behind cached', sameJson(Object.keys(usingOf({ job: storedFixture.job, spentUsd: 0, judgmentRowList: storedFixture.judgmentRowList, judgeCallCount: 0, detail: 'audit' })).slice(5), ['judgedUnitCount', 'judgeCallCount']));
}

// ---- 3. detail=audit loses nothing the code at 0c1f86f answered
console.log('- 3. detail=audit loses nothing');
const leafMapOf = (sourceObject, prefixText = '') => {
	if (sourceObject === null || typeof sourceObject !== 'object' || (Array.isArray(sourceObject) && sourceObject.length === 0) || (!Array.isArray(sourceObject) && Object.keys(sourceObject).length === 0)) {
		return new Map([[prefixText, JSON.stringify(sourceObject)]]);
	}
	return Object.keys(sourceObject).reduce((soFar, partName) => new Map([...soFar, ...leafMapOf(sourceObject[partName], prefixText ? `${prefixText}.${partName}` : partName)]), new Map());
};
// the renames P7a made, as path rewrites of a 0c1f86f answer: name, definition and byHub.<hub> (a hub is its place in job.hubList)
const renamedPathOf = (oldPath, hubNameList) => oldPath
	.replace(/^fieldList\.(\d+)\.name$/, 'fieldList.$1.requestName')
	.replace(/^fieldList\.(\d+)\.definition$/, 'fieldList.$1.requestDefinition')
	.replace(/^fieldList\.(\d+)\.byHub\.([A-Za-z0-9]+)\./, (unusedMatch, fieldIndex, hubName) => `fieldList.${fieldIndex}.resultList.${hubNameList.indexOf(hubName)}.`);
[[beforeFullPage1, 1], [beforeFullPage2, 2]].forEach(([beforeEnvelope, pageNumber]) => {
	const auditAnswer = reportOf(reportArgumentsOf(storedFixture, { rowDetail: 'full', detail: 'audit', pageNumber }));
	const leanAnswer = reportOf(reportArgumentsOf(storedFixture, { rowDetail: 'full', detail: 'lean', pageNumber }));
	const auditLeafMap = leafMapOf(auditAnswer);
	const hubNameList = beforeEnvelope.answer.job.hubList;
	const lostList = [...leafMapOf(beforeEnvelope.answer)].filter(([oldPath, oldText]) => auditLeafMap.get(renamedPathOf(oldPath, hubNameList)) !== oldText);
	ok(`page ${pageNumber}: every one of the ${leafMapOf(beforeEnvelope.answer).size} leaves 0c1f86f answered is in the audit answer, under its new name, with its value`, lostList.length === 0, JSON.stringify(lostList.slice(0, 5)));
	const notInAuditList = [...leafMapOf(leanAnswer)].filter(([leanPath, leanText]) => auditLeafMap.get(leanPath) !== leanText && !/\.resultList\.\d+\.status$/.test(leanPath));
	ok(`page ${pageNumber}: every lean leaf is in the audit answer`, notInAuditList.length === 0, JSON.stringify(notInAuditList.slice(0, 5)));
	const oldRenamedPathSet = new Set([...leafMapOf(beforeEnvelope.answer).keys()].map((oldPath) => renamedPathOf(oldPath, hubNameList)));
	const addedList = [...auditLeafMap.keys()].filter((auditPath) => !oldRenamedPathSet.has(auditPath));
	// what the audit answer has that 0c1f86f did not: jobRefId and status lifted to the top (they are also in job), each result's hub, and the named tuple absence
	const ADDED_ON_PURPOSE_PATTERN = /^jobRefId$|^status$|\.resultList\.\d+\.hub$|\.proposal\.tupleAbsentName$/;
	ok(`page ${pageNumber}: the audit answer adds only jobRefId and status at the top, each result's hub, and the named tuple absence`, addedList.every((auditPath) => ADDED_ON_PURPOSE_PATTERN.test(auditPath)), JSON.stringify(addedList.filter((auditPath) => !ADDED_ON_PURPOSE_PATTERN.test(auditPath)).slice(0, 5)));
});
{
	const auditSummary = SUMMARY_SHAPER_BY_NAME.rosettaFetch({ answer: reportOf(reportArgumentsOf(storedFixture, { rowDetail: 'summary', detail: 'audit' })), summaryShape: registry.summaryShape });
	const auditSummaryLeafMap = leafMapOf(auditSummary);
	// what changed in a summary on purpose: the bracket in each line, the note saying what the bracket holds, and how to ask for more
	const CHANGED_ON_PURPOSE_PATTERN = /^fieldLineList\.\d+\.\d+$|^fieldLineNote$|^leftOutOfSummary\.howToAsk$/;
	const lostList = [...leafMapOf(beforeSummary.answer)].filter(([oldPath, oldText]) => !CHANGED_ON_PURPOSE_PATTERN.test(oldPath) && auditSummaryLeafMap.get(oldPath) !== oldText);
	ok(`summary: every leaf 0c1f86f answered is in the audit summary with its value, but the lines, the line note and howToAsk (${leafMapOf(beforeSummary.answer).size} leaves)`, lostList.length === 0, JSON.stringify(lostList.slice(0, 5)));
	ok('summary: the lines keep their place and their status text; only a proposal\'s bracket changed', beforeSummary.answer.fieldLineList.every((oldLine, lineIndex) => oldLine.every((oldText, memberIndex) => oldText.replace(/\[[^\]]*\]/, '[]') === auditSummary.fieldLineList[lineIndex][memberIndex].replace(/\[[^\]]*\]/, '[]'))), JSON.stringify(auditSummary.fieldLineList.slice(0, 2)));
}

// ---- 4. the summary
console.log('- 4. the summary');
{
	const leanSummary = SUMMARY_SHAPER_BY_NAME.rosettaFetch({ answer: reportOf(reportArgumentsOf(tupledFixture, { rowDetail: 'summary', detail: 'lean' })), summaryShape: registry.summaryShape });
	console.log(`  lines: ${JSON.stringify(leanSummary.fieldLineList)}`);
	ok('CEDS moderate [C200296 · P002040]: Military Discharge Date', leanSummary.fieldLineList[0][1] === 'CEDS moderate [C200296 · P002040]: Military Discharge Date', leanSummary.fieldLineList[0][1]);
	ok('CTDL: identity slots only, [ceterms:CertificateOfCompletion · ceterms:hasProxy]', leanSummary.fieldLineList[0][2] === 'CTDL weakButReal [ceterms:CertificateOfCompletion · ceterms:hasProxy]: Has Proxy', leanSummary.fieldLineList[0][2]);
	ok('value, qualified and term brackets', leanSummary.fieldLineList[1][1] === 'CEDS strong [C200074 · P000258 · OS000258 · OV000258115741]: Female-only' && leanSummary.fieldLineList[2][1] === 'CEDS strong [C200015 · P001198 · OV001199115956]: Assessment Asset Identifier' && leanSummary.fieldLineList[3][1] === 'CEDS strong [OV001637173741]: Bondo', JSON.stringify(leanSummary.fieldLineList));
	ok('the lean summary has no job or judge block', !('job' in leanSummary) && !('judge' in leanSummary));
	const tightSummary = SUMMARY_SHAPER_BY_NAME.rosettaFetch({ answer: reportOf(reportArgumentsOf(tupledFixture, { rowDetail: 'summary', detail: 'lean' })), summaryShape: { ...registry.summaryShape, judgedAnswerByteBudget: 1 } });
	ok('a 1-byte budget drops the labels; the bracket stays', tightSummary.fieldLineList[0][1] === 'CEDS moderate [C200296 · P002040]', tightSummary.fieldLineList[0][1]);
}

// ---- 5. the meaning answer's ranges (Addendum 1)
console.log('- 5. the meaning answer\'s ranges');
{
	const hasProxyResult = resultOfHub(auditTupled.fieldList[0], 'CTDL');
	const ctdlFacts = { tuple: hasProxyResult.proposal.tuple, rangePartList: hasProxyResult.proposal.rangeList, rangeIsIdentity: false, rangeDatatypeList: [] };
	ok('a card with ranges: rangeList holds every RANGE part', sameJson(rangeFieldsOf(ctdlFacts), { rangeList: hasProxyResult.proposal.rangeList }));
	ok('a card with a datatype range only: an empty rangeList and the datatype as written, never cardHasNoRange', sameJson(rangeFieldsOf({ tuple: {}, rangePartList: [], rangeIsIdentity: true, rangeDatatypeList: ['dateTime'] }), { rangeList: [], rangeDatatypeList: ['dateTime'] }));
	ok('a card with neither: cardHasNoRange', sameJson(rangeFieldsOf({ tuple: {}, rangePartList: [], rangeIsIdentity: true, rangeDatatypeList: [] }), { rangeListAbsentName: 'cardHasNoRange' }));
	ok('a card the live graph does not hold: cardNotInLiveGraph', sameJson(rangeFieldsOf({ tupleAbsentName: 'hubCardNotFound' }), { rangeListAbsentName: 'cardNotInLiveGraph' }));
	ok('an undeclared absent name is refused', threwMatching(() => rangeListAbsentOf('invented'), /not a declared range list absent name/));
	ok('the range fields sit after the domain', sameJson(Object.keys(withMeaningRangeList({ kind: 'meaning', domain: {}, manifestList: [] }, { rangeList: [] })), ['kind', 'domain', 'rangeList', 'manifestList']));
	ok('a meaning answer with no domain field gets them at the end', sameJson(Object.keys(withMeaningRangeList({ kind: 'meaning', manifestList: [] }, { rangeListAbsentName: 'cardHasNoRange' })), ['kind', 'manifestList', 'rangeListAbsentName']));
}

// ---- 6. the registry
console.log('- 6. the registry');
{
	const fetchRow = registry.operationList.find((oneRow) => oneRow.operationName === 'rosettaFetch');
	const detailField = fetchRow.inputFieldList.find((oneField) => oneField.name === 'detail');
	ok('rosettaFetch takes detail: lean or audit, default lean', detailField && sameJson(detailField.enum, ['lean', 'audit']) && detailField.defaultValue === 'lean');
	ok('its envelopeRule keeps graphName and manifest in the lean answeredFrom and drops the uriNote', fetchRow.envelopeRule && sameJson(fetchRow.envelopeRule.leanAnsweredFromFieldNameList, ['graphName', 'manifest']) && fetchRow.envelopeRule.omitsUriNote === true && fetchRow.envelopeRule.detailInputName === 'detail');
	ok('no other operation has an envelopeRule or a detail input', registry.operationList.filter((oneRow) => oneRow.envelopeRule || oneRow.inputFieldList.some((oneField) => oneField.name === 'detail')).map((oneRow) => oneRow.operationName).join() === 'rosettaFetch');
	ok('the description tells a reader to cite the tuple', /cite the tuple/.test(fetchRow.description) && /requestName/.test(fetchRow.description) && /resultList/.test(fetchRow.description));
}

console.log(`\nrosetta-fetch-shape: ${passedCount} passed, ${failedCount} failed`);
process.exit(failedCount === 0 ? 0 : 1);
