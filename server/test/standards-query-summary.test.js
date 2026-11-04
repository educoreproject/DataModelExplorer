'use strict';
// standards-query-summary.test.js — what a summary keeps, and that nothing vanishes silently (standardsQueryService P2.1, G3 in small). Pure: a small answer built here, the real shapers and the real
// summaryShape from the registry. The live gate on the real answers is runs/P2.1/runNoSilentLoss.js.
// Run: node server/test/standards-query-summary.test.js

const registry = require('../lib/standards-query/standardsQueryOperations.json');
const { SUMMARY_SHAPER_BY_NAME } = require('../lib/standards-query/answerSummaries');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	passedCount += condition ? 1 : 0;
	failedCount += condition ? 0 : 1;
	console.log(`  ${condition ? 'PASS' : 'FAIL'}: ${testName}${!condition && detailText ? ` — ${detailText}` : ''}`);
};
const summaryShape = registry.summaryShape;
const CARD_A = 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/cardA';
const CARD_B1 = 'https://w3id.org/CTDL/hub/cardB1';
const CARD_B2 = 'https://w3id.org/CTDL/hub/cardB2';
const CARD_PAST_CAP = 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/cardPastTheCap';
const rowOf = (fieldValues) => ({ fromUri: `https://w3id.org/EDUcore/${fieldValues.fromSource}/1/${fieldValues.fromName}`, mappingRationale: 'a judge chose it', assertion: 'https://w3id.org/EDUcore/assertion/a/b', question: 'https://w3id.org/EDUcore/manifest/m/q/x', viaMatchType: 'EXACT_MATCH', ...fieldValues });
const mappingsAnswer = {
	mappingRowList: [
		rowOf({ direction: 'outgoing', fromSource: 'LIF', fromName: 'own', hubName: 'CEDS', toId: 'P1', mappingType: 'EXACT_MATCH', uri: CARD_A }),
		rowOf({ direction: 'equivalent', fromSource: 'EdFi', fromName: 'first', hubName: 'CEDS', toId: 'P1', mappingType: 'EXACT_MATCH', uri: CARD_A }),
		rowOf({ direction: 'equivalent', fromSource: 'EdFi', fromName: 'second', hubName: 'CEDS', toId: 'P1', mappingType: 'EXACT_MATCH', uri: CARD_A }),
		rowOf({ direction: 'related', fromSource: 'SIF', fromName: 'third', hubName: 'CTDL', toId: 'shared', mappingType: 'CLOSE_MATCH', uri: CARD_B1 }),
		rowOf({ direction: 'related', fromSource: 'SIF', fromName: 'fourth', hubName: 'CTDL', toId: 'shared', mappingType: 'CLOSE_MATCH', uri: CARD_B2 }),
		rowOf({ direction: 'related', fromSource: 'SIF', fromName: 'fifth', hubName: 'CEDS', toId: 'PastCap', mappingType: 'CLOSE_MATCH', uri: CARD_PAST_CAP }),
	],
	totalRowCount: 9, returnedRowCount: 6, truncatedRowCount: 3,
	rowUnit: 'a long unit', countUnitByField: { totalRowCount: 'rows' },
	totalRowCountByHub: { CEDS: 5, CTDL: 4 }, totalRowCountByDirection: { outgoing: 1, equivalent: 4, related: 4 },
	totalRowCountByHubRelationAndStandard: { CEDS: { EXACT_MATCH: { LIF: 1, EdFi: 3 }, CLOSE_MATCH: { SIF: 1 } }, CTDL: { CLOSE_MATCH: { SIF: 3, PESC: 1 } } },
	hubTupleCount: 3,
	hubTupleSummaryList: [{ toId: 'P1', toName: 'one', hubName: 'CEDS', edgeCount: 4, cardUriList: [CARD_A] }, { toId: 'shared', toName: 'shared', hubName: 'CTDL', edgeCount: 2, cardUriList: [CARD_B1, CARD_B2] }],
	matchedNodeCount: 3, instancePathMatchedNodeCount: 0,
	matchedElementList: [{ stableId: 'a', name: 'own', standard: 'LIF', role: 'DmeProperty', uri: 'https://w3id.org/EDUcore/LIF/1/own', uriKind: 'edc', resolvesHere: true }, { stableId: 'http://www.w3.org/2002/07/owl#Class', name: 'Class', standard: 'CEDS', role: 'DmeClass', uri: 'http://www.w3.org/2002/07/owl#Class', uriKind: 'ownIri', resolvesHere: false }, { stableId: 'z', name: 'absent', standard: 'LIF', role: 'DmeProperty', uriAbsentReason: 'notInManifestStore' }],
	mappingStatusByHub: { CEDS: 'mapped', CTDL: 'judgedAbstained' }, hubList: [{ hubName: 'CEDS' }, { hubName: 'CTDL' }],
	declaredCorrespondenceList: [{ subjectUri: 'one' }, { subjectUri: 'two' }, { subjectUri: 'three' }, { subjectUri: 'four' }], declaredCorrespondenceCount: 4, declaredCorrespondenceRowUnit: 'not a mapping',
	standardElementListByName: { LIF: 'https://w3id.org/EDUcore/manifest/m/standards/LIF/1/elements' },
};
const inputCopyText = JSON.stringify(mappingsAnswer);
const mappingsSummary = SUMMARY_SHAPER_BY_NAME.mappings({ answer: mappingsAnswer, summaryShape });
const summaryText = JSON.stringify(mappingsSummary);
const leftOut = mappingsSummary.leftOutOfSummary;
ok('mappings: the shaper leaves the full answer as it found it', JSON.stringify(mappingsAnswer) === inputCopyText);
ok('mappings: says it is a summary', mappingsSummary.rowDetail === 'summary');
ok('mappings: keeps mappingStatusByHub', JSON.stringify(mappingsSummary.mappingStatusByHub) === JSON.stringify(mappingsAnswer.mappingStatusByHub));
ok('mappings: the element\'s own row keeps relation, judge, rationale and its assertion', mappingsSummary.ownMappingRowList[0].mappingType === 'EXACT_MATCH' && mappingsSummary.ownMappingRowList[0].mappingRationale && mappingsSummary.ownMappingRowList[0].assertion);
ok('mappings: every standard holding equivalents has a row with its count, shown or not', JSON.stringify(mappingsSummary.standardCountList.map(({ hubName, standard, rowCount }) => `${hubName} ${standard} ${rowCount}`)) === JSON.stringify(['CEDS EdFi 3', 'CEDS LIF 1', 'CEDS SIF 1', 'CTDL PESC 1', 'CTDL SIF 3']), JSON.stringify(mappingsSummary.standardCountList));
ok('mappings: every card uri in a row is in the summary', [CARD_A, CARD_B1, CARD_B2, CARD_PAST_CAP].every((cardUri) => summaryText.includes(cardUri)));
ok('mappings: a card past the verb\'s cap joins the card list, so its row is not left pointing at nothing', mappingsSummary.hubTupleSummaryList.some((oneTuple) => oneTuple.toId === 'PastCap' && oneTuple.cardUriList[0] === CARD_PAST_CAP));
ok('mappings: where one identifier stands for several cards, the row keeps its own uri', mappingsSummary.standardCountList.find((one) => one.hubName === 'CTDL' && one.standard === 'SIF').shownRowList.every((oneRow) => oneRow.uri));
ok('mappings: where it stands for one, the row leaves it to the card list', mappingsSummary.standardCountList.find((one) => one.standard === 'EdFi').shownRowList.every((oneRow) => oneRow.uri === undefined));
ok('mappings: the usual uri facts go, an exception stays on its row, an absence is still said', mappingsSummary.matchedElementList.find((one) => one.name === 'own').uriKind === undefined && mappingsSummary.matchedElementList.find((one) => one.name === 'Class').uriKind === 'ownIri' && mappingsSummary.matchedElementList.find((one) => one.name === 'absent').uriAbsentReason === 'notInManifestStore');
ok('left out: says how to ask', /rowDetail=full/.test(leftOut.howToAsk));
ok('left out: rationales, by count', leftOut.rationalesNotShown === 5, `${leftOut.rationalesNotShown}`);
ok('left out: assertion uris, by count', leftOut.assertionUrisNotShown === 5, `${leftOut.assertionUrisNotShown}`);
ok('left out: question uris, by count', leftOut.questionUrisNotShown === 6, `${leftOut.questionUrisNotShown}`);
ok('left out: declared correspondences past the cap, by count', leftOut.declaredCorrespondencesNotListed === 4 - summaryShape.declaredCorrespondenceListCap);
ok('left out: the rows the full answer omits too', leftOut.rowsTheFullAnswerAlsoOmits === 3);
ok('left out: a field in no list is named, so a field added later cannot vanish silently', SUMMARY_SHAPER_BY_NAME.mappings({ answer: { ...mappingsAnswer, aFieldAddedNextYear: 1, mappingRowList: mappingsAnswer.mappingRowList.map((oneRow) => ({ ...oneRow, aRowFieldAddedNextYear: 1 })) }, summaryShape }).leftOutOfSummary.answerFieldNameList.includes('aFieldAddedNextYear') && SUMMARY_SHAPER_BY_NAME.mappings({ answer: { ...mappingsAnswer, mappingRowList: mappingsAnswer.mappingRowList.map((oneRow) => ({ ...oneRow, aRowFieldAddedNextYear: 1 })) }, summaryShape }).leftOutOfSummary.rowFieldNameList.includes('aRowFieldAddedNextYear'));

const manyMatchedSummary = SUMMARY_SHAPER_BY_NAME.mappings({ answer: { ...mappingsAnswer, matchedNodeCount: 300, matchedElementList: Array.from({ length: 200 }, (unused, elementIndex) => ({ name: `n${elementIndex}`, standard: elementIndex < 190 ? 'SIF' : 'LIF', uri: `u${elementIndex}` })) }, summaryShape });
ok('a long matched list: capped, every standard still represented, and counted', manyMatchedSummary.matchedElementList.length === summaryShape.matchedElementListCap && manyMatchedSummary.matchedElementList.some((one) => one.standard === 'LIF') && manyMatchedSummary.matchedElementCountByStandard.SIF === 190 && manyMatchedSummary.leftOutOfSummary.matchedElementsNotListed === 300 - summaryShape.matchedElementListCap && manyMatchedSummary.leftOutOfSummary.matchedElementsTheFullAnswerAlsoOmits === 100);

const entryOf = (entryIndex) => ({
	stableId: `s${entryIndex}`, uri: `https://w3id.org/EDUcore/SIF/1/s${entryIndex}`, uriKind: 'edc', resolvesHere: true, outgoingTotal: 2, incomingTotal: 1, edgesTruncated: false,
	node: { name: 'BirthDate', _source: entryIndex % 2 ? 'SIF' : 'EdFi', description: 'what it is', role: 'DmeProperty', searchText: 'long' },
	outgoing: [{ type: 'EXACT_MATCH', targetSource: 'CEDS', target: 'Birthdate', targetUri: CARD_A, targetStableId: CARD_A }, { type: 'HAS_INSTANCE', target: 'x', targetUri: 'y' }],
	incoming: [{ type: 'HAS_PROPERTY', source: 'z', sourceUri: 'w' }],
});
const elementAnswerOf = (entryCount) => ({ entryList: Array.from({ length: entryCount }, (unused, entryIndex) => entryOf(entryIndex)), totalRowCount: entryCount, returnedRowCount: entryCount, truncatedRowCount: 0, rowUnit: 'a node', matchedNodeCount: entryCount, nameMatchMode: 'exact', caseVariantNodeCount: 1, caseVariantNameList: ['birthDate'], declaredCorrespondenceList: [], declaredCorrespondenceCount: 0, declaredCorrespondenceRowUnit: 'not a mapping', standardElementListByName: {} });
const fewSummary = SUMMARY_SHAPER_BY_NAME.element({ answer: elementAnswerOf(2), summaryShape });
const manySummary = SUMMARY_SHAPER_BY_NAME.element({ answer: elementAnswerOf(summaryShape.detailedEntryCap + 1), summaryShape });
ok('element: few entries say what each is and which cards it reaches', fewSummary.entryList[0].description === 'what it is' && fewSummary.entryList[0].mappingEdgeList[0].targetUri === CARD_A && fewSummary.leftOutOfSummary.edgesNotListed === 4, JSON.stringify(fewSummary.leftOutOfSummary));
ok('element: many entries keep every uri and name, and hubCardList says which cards they reach between them', manySummary.entryList.length === summaryShape.detailedEntryCap + 1 && manySummary.entryList.every((one) => one.uri && one.name) && manySummary.hubCardList[0].uri === CARD_A && manySummary.hubCardList[0].entryEdgeCountByType.EXACT_MATCH === summaryShape.detailedEntryCap + 1);
ok('element: many entries count what they left out', manySummary.leftOutOfSummary.edgesNotListed === 3 * (summaryShape.detailedEntryCap + 1) && manySummary.leftOutOfSummary.descriptionsNotShown === summaryShape.detailedEntryCap + 1);
ok('element: the case variants are still said: a reader must be told an exact lookup missed some', manySummary.caseVariantNodeCount === 1 && manySummary.caseVariantNameList[0] === 'birthDate');
ok('element: the count per standard is over every entry', manySummary.entryCountByStandard.EdFi + manySummary.entryCountByStandard.SIF === summaryShape.detailedEntryCap + 1);

const graphAnswer = {
	passport: { graphName: 'g', builtAt: 'b', contentNodeCount: 5, engineVersions: { huge: 1 } }, recipe: { recipeName: 'r', description: 'what it holds', _id: 'x' }, lineage: { basedOnManifestRefId: null },
	blocks: [{ kind: 'standardBase' }, { kind: 'relationship' }, { kind: 'relationship' }], blockTotal: 3, blocksTruncated: false,
	standards: [{ sourceKey: 'CEDS', standardKind: 'hub', version: '14', standardUsageTips: 'long' }], attestations: [{ gate: 'embeddingCoverage', verdict: 'pass', detail: 'long', labelList: [] }], card: 'x'.repeat(50), readerContractSha256: 'y',
};
const graphSummary = SUMMARY_SHAPER_BY_NAME.graph({ answer: graphAnswer, summaryShape });
ok('graph: says what the graph is, how it was built, from what, and what it can do', graphSummary.passport.graphName === 'g' && graphSummary.recipe.description === 'what it holds' && graphSummary.standards[0].sourceKey === 'CEDS' && graphSummary.attestations[0].verdict === 'pass' && graphSummary.whatThisGraphCanDo.length > 0);
ok('graph: the blocks are counted by kind', JSON.stringify(graphSummary.blockCountByKind) === '{"standardBase":1,"relationship":2}' && graphSummary.blockTotal === 3);
const graphLeftOut = graphSummary.leftOutOfSummary;
ok('graph: left out, by count and by name, with how to ask', /rowDetail=full/.test(graphLeftOut.howToAsk) && graphLeftOut.blocksNotListed === 3 && graphLeftOut.standardUsageTipsNotShown === 1 && graphLeftOut.cardCharacterCount === 50 && graphLeftOut.passportFieldNameList.includes('engineVersions') && graphLeftOut.answerFieldNameList.includes('card') && graphLeftOut.attestationFieldNameList.includes('detail'));

console.log(`\nstandards-query-summary: ${passedCount} passed, ${failedCount} failed`);
process.exit(failedCount === 0 ? 0 : 1);
