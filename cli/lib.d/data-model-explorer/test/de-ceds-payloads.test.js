#!/usr/bin/env node
'use strict';

// de-ceds-payloads.test.js — deCeds R6 (educoreForge WORKORDER-R6-dmeDeCeds-102126, census clusters 1, 3, 4, 20). HERMETIC:
// the verbs run through QUERY_HANDLER_BY_QUERY_TYPE on a STUB session holding ONE hub, the case P7 kept the legacy names for.
// Asserts that no payload names one hub in its field names or wording:
//   1. findMappings on a one-hub graph: no ceds* row field; the hub* fields and hubTuple carry the card;
//   2. compareCodesets on a one-hub graph: no cedsValue / cedsValueKey;
//   3. the tool payload contract's model-read text (row units, count units) names no hub;
//   4. findMappings nothingMatched quotes each hub's identifier example READ FROM ITS OWN CARDS (lowest canonicalKey per
//      tier), not from a table in code; a hub whose cards carry no canonicalKey is said to have no example;
//   5. RED TWINS (moduleTwin): the legacy fields restored, and the example table restored, each turn an assertion red.
//
//   node cli/lib.d/data-model-explorer/test/de-ceds-payloads.test.js

const path = require('path');
const dmeDirPath = path.join(__dirname, '..');
const { loadWithMutations } = require('./lib/moduleTwin');
const { pipeRunner, taskListPlus } = new (require(path.join(dmeDirPath, '..', '..', 'node_modules', 'qtools-asynchronous-pipe-plus')))();

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const stubRecordOf = (fieldByName) => ({ keys: Object.keys(fieldByName), get: (fieldName) => fieldByName[fieldName] });
const stubSessionOf = (responderList, queryLog) => ({
	run: (cypherText, cypherParameters) => {
		queryLog.push({ cypherText, cypherParameters });
		const responder = responderList.find((oneResponder) => oneResponder.pattern.test(cypherText));
		if (!responder) {
			return Promise.reject(new Error(`stub graph: no responder for query ${cypherText.replace(/\s+/g, ' ').slice(0, 140)}`));
		}
		return Promise.resolve({ records: responder.rowList.map(stubRecordOf) });
	},
});

const ONE_HUB_RESPONDER = { pattern: /MATCH \(h:HubDefinition\) RETURN h\.hubName AS hubName/, rowList: [{ hubName: 'HUBX', hubSource: 'HUBX', hubVersion: '1', canonicalKeyName: 'HUBX Global ID' }] };

const mappingRowOf = (rowIndex) => ({
	direction: 'incoming', fromSource: 'EdFi', fromName: `element${rowIndex}`, fromStableId: `element-${rowIndex}`,
	toSource: 'HUBX', hubName: 'HUBX', toName: `card${rowIndex}`, toId: `HX${rowIndex}`, mappingType: 'EXACT_MATCH', confidence: 0.9,
	matchPredicate: 'skos:exactMatch', viaMatchType: null, viaConfidence: null, viaPredicate: null,
	hubDomain: 'HUBX domain', hubProperty: 'HUBX property', hubRange: 'HUBX range', hubValue: null, hubQualifier: null,
	mappingConfidence: 0.9, mappingKind: 'inferred', mappingSource: 'bridge-test', mappingRationale: null,
	viaMappingConfidence: null, viaMappingKind: null, viaMappingSource: null, viaMappingRationale: null,
	fromElementId: null, instanceOf: null, instanceGroupList: null, instanceCount: null, viaInstanceGroupList: null, viaInstanceCount: null,
});
const FIND_MAPPINGS_RESPONDER_LIST = [
	ONE_HUB_RESPONDER,
	{ pattern: /AS matchedNodeCount/, rowList: [{ matchedNodeCount: 2, instancePathMatchedNodeCount: 0 }] },
	{ pattern: /RETURN rowHub, rowRelation, rowStandard/, rowList: [{ rowHub: 'HUBX', rowRelation: 'EXACT_MATCH', rowStandard: 'EdFi', topRowList: [mappingRowOf(0), mappingRowOf(1)], standardRowCount: 2, directionList: ['incoming', 'incoming'], toIdList: ['HX0', 'HX1'] }] },
	{ pattern: /AS matchedInstanceCount/, rowList: [] },
	{ pattern: /hub\.canonicalKey IN \$toIdList/, rowList: [] },
	{ pattern: /AS declaredCorrespondenceList/, rowList: [{ declaredCorrespondenceList: [], declaredCorrespondenceCount: 0 }] },
];
const LEGACY_ROW_FIELD_NAME_LIST = ['cedsDomain', 'cedsProperty', 'cedsRange', 'cedsValue', 'cedsQualifier', 'cedsTuple', 'cedsValueKey'];
const legacyFieldNamesIn = (rowObject) => LEGACY_ROW_FIELD_NAME_LIST.filter((fieldName) => fieldName in rowObject);

const searchModulePath = path.join(dmeDirPath, 'dataModelExplorerSearch.js');
const runVerbOn = (searchModule, verbName, params, responderList, callback) => {
	const queryLog = [];
	searchModule.QUERY_HANDLER_BY_QUERY_TYPE[verbName](stubSessionOf(responderList, queryLog), params, {}, (verbError, verbResult) => callback(verbError, verbResult, queryLog));
};
const realSearchModule = require(searchModulePath);
const contract = require(path.join(dmeDirPath, 'lib', 'toolPayloadContract'));
// the shebang line is not JavaScript the twin compiler accepts: it is dropped first
const twinOf = (modulePath, mutationList) => loadWithMutations({ modulePath, mutationList: [{ find: '#!/usr/bin/env node\n', replace: '' }, ...mutationList] });

console.log('\n=== deCeds R6: DME payloads name no one hub ===\n');
const taskList = new taskListPlus();

// ---- 1. findMappings on a one-hub graph
const findMappingsLegacyAssertion = (answerLabel, verbError, payload) => {
	const rowList = (payload && payload.mappingRowList) || [];
	const legacyNameList = rowList.reduce((soFar, oneRow) => soFar.concat(legacyFieldNamesIn(oneRow)), []);
	assert(`${answerLabel}: no ceds* row field on a ONE-hub graph; hubTuple and hubDomain carry the card`, !verbError && rowList.length === 2 && legacyNameList.length === 0 && rowList[0].hubTuple === 'HUBX domain · HUBX property · HUBX range (HX0)' && rowList[0].hubDomain === 'HUBX domain', verbError || legacyNameList.join(','));
};
taskList.push((args, next) => {
	console.log('- 1. findMappings on a one-hub graph');
	runVerbOn(realSearchModule, 'findMappings', { name: 'Birthdate' }, FIND_MAPPINGS_RESPONDER_LIST, (verbError, payload) => {
		findMappingsLegacyAssertion('findMappings', verbError, payload);
		next('', args);
	});
});

// ---- 2. compareCodesets on a one-hub graph
const COMPARE_RESPONDER_LIST = [
	ONE_HUB_RESPONDER,
	{ pattern: /RETURN count\(os\) AS matchedOptionSetCount/, rowList: [{ matchedOptionSetCount: 1 }] },
	{ pattern: /AS valueTierJudgmentCount/, rowList: [{ valueTierJudgmentCount: 1 }] },
	{ pattern: /AS valueRowList/, rowList: [{ valueRowList: [{ sourceStandard: 'EdFi', optionSetName: 'Sex', sourceValue: 'F', matchType: 'EXACT_MATCH', confidence: 0.9, hubName: 'HUBX', hubValue: 'Female', hubValueKey: 'HXV1', crossStandardEquivalents: [] }], totalRowCount: 1 }] },
];
taskList.push((args, next) => {
	console.log('- 2. compareCodesets on a one-hub graph');
	runVerbOn(realSearchModule, 'compareCodesets', { name: 'Sex' }, COMPARE_RESPONDER_LIST, (compareError, comparePayload) => {
		const valueRow = ((comparePayload || {}).valueRowList || [])[0] || {};
		assert('compareCodesets: no cedsValue / cedsValueKey on a ONE-hub graph; hubValue and hubValueKey carry it', !compareError && legacyFieldNamesIn(valueRow).length === 0 && valueRow.hubValue === 'Female' && valueRow.hubValueKey === 'HXV1', compareError || JSON.stringify(valueRow));
		next('', args);
	});
});

// ---- 3. the contract's model-read text names no hub
taskList.push((args, next) => {
	console.log('- 3. the tool payload contract\'s model-read text');
	const textList = [];
	const collectText = (oneValue, pathText) => {
		if (typeof oneValue === 'string') { textList.push({ pathText, oneValue }); return; }
		if (oneValue && typeof oneValue === 'object') { Object.keys(oneValue).forEach((fieldName) => collectText(oneValue[fieldName], `${pathText}.${fieldName}`)); }
	};
	['VERB_PAYLOAD_CONTRACT', 'FIND_MAPPINGS_COUNT_UNIT_BY_FIELD'].forEach((exportName) => collectText(contract[exportName], exportName));
	const hubNamingList = textList.filter(({ oneValue }) => /\bCEDS\b/i.test(oneValue)).map(({ pathText }) => pathText);
	assert('row-unit and count-unit text read by the model names no hub (\'hub tuple\', never \'CEDS tuple\')', textList.length > 10 && hubNamingList.length === 0, `${textList.length} texts; naming CEDS: ${hubNamingList.join(', ')}`);
	assert('the per-hub identifier example table is gone from code (the examples are read from the graph)', !('HUB_IDENTIFIER_EXAMPLE_TEXT_BY_CANONICAL_KEY_NAME' in contract));
	next('', args);
});

// ---- 4. nothingMatched reads each hub's identifier example from its cards
const NOTHING_MATCHED_RESPONDER_LIST = [
	{ pattern: /MATCH \(h:HubDefinition\) RETURN h\.hubName AS hubName/, rowList: [
		{ hubName: 'HUBX', hubSource: 'HUBX', hubVersion: '1', canonicalKeyName: 'HUBX Global ID' },
		{ hubName: 'HUBY', hubSource: 'HUBY', hubVersion: '2', canonicalKeyName: 'HUBY term CURIE' },
		{ hubName: 'HUBZ', hubSource: 'HUBZ', hubVersion: '3', canonicalKeyName: null },
	] },
	{ pattern: /AS matchedNodeCount/, rowList: [{ matchedNodeCount: 0, instancePathMatchedNodeCount: 0 }] },
	{ pattern: /AS exampleCanonicalKey/, rowList: [
		{ hubName: 'HUBX', referenceTier: 'property', exampleCanonicalKey: 'P000001' },
		{ hubName: 'HUBX', referenceTier: 'value', exampleCanonicalKey: 'OV000002' },
	] },
];
taskList.push((args, next) => {
	console.log('- 4. findMappings nothingMatched');
	runVerbOn(realSearchModule, 'findMappings', { name: 'zzNothing' }, NOTHING_MATCHED_RESPONDER_LIST, (refusalError, refusal, queryLog) => {
		const reasonText = (refusal && refusal.reason) || '';
		const exampleQuery = queryLog.find((oneQuery) => /AS exampleCanonicalKey/.test(oneQuery.cypherText)) || { cypherParameters: {} };
		assert('nothingMatched: the example is the hub\'s own lowest canonicalKey per tier', !refusalError && refusal.refusalName === 'nothingMatched' && reasonText.includes('a HUBX Global ID looks like P000001 (property) or OV000002 (value)'), refusalError || reasonText);
		assert('nothingMatched: a hub with a canonicalKeyName but no keyed card is said to have no example, by name', reasonText.includes('a HUBY card identifier is its HUBY term CURIE (its cards carry none to show)'), reasonText);
		assert('nothingMatched: a hub with no canonicalKeyName is said so, never given a stand-in name', reasonText.includes('HUBZ\'s HubDefinition names no canonicalKeyName'), reasonText);
		assert('nothingMatched: the example query is asked for exactly the graph\'s hubs', JSON.stringify(exampleQuery.cypherParameters.hubNameList) === '["HUBX","HUBY","HUBZ"]', JSON.stringify(exampleQuery.cypherParameters));
		next('', args);
	});
});

// ---- 5. red twins
taskList.push((args, next) => {
	console.log('- 5. red twins (each must turn an assertion red)');
	const legacyTwin = twinOf(searchModulePath, [{ find: '\t\t\thubName: rec.get(\'hubName\'),\n\t\t\thubDomain: rec.get(\'hubDomain\'),', replace: '\t\t\tcedsDomain: rec.get(\'hubDomain\'),\n\t\t\thubName: rec.get(\'hubName\'),\n\t\t\thubDomain: rec.get(\'hubDomain\'),' }]);
	runVerbOn(legacyTwin, 'findMappings', { name: 'Birthdate' }, FIND_MAPPINGS_RESPONDER_LIST, (legacyError, legacyPayload) => {
		const legacyRowList = (legacyPayload && legacyPayload.mappingRowList) || [];
		assert('red twin (a ceds* field restored on one hub): the legacy-field assertion would fail', !legacyError && legacyRowList.some((oneRow) => legacyFieldNamesIn(oneRow).length > 0), legacyError);
		const fixedExampleTwin = twinOf(searchModulePath, [{ find: 'const exampleText = exampleTextByHubName[hubName];', replace: 'const exampleText = ({ HUBX: \'P000033 (property)\' })[hubName];' }]);
		runVerbOn(fixedExampleTwin, 'findMappings', { name: 'zzNothing' }, NOTHING_MATCHED_RESPONDER_LIST, (twinError, twinRefusal) => {
			assert('red twin (an example fixed in code): the read-from-the-graph assertion would fail', !twinError && !((twinRefusal && twinRefusal.reason) || '').includes('looks like P000001'), twinError);
			next('', args);
		});
	});
});

pipeRunner(taskList.getList(), {}, (pipeError) => {
	if (pipeError) { failed++; console.log(`  FAIL: ${pipeError}`); }
	console.log(`\n=== deCeds R6 payloads — Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed > 0 ? 1 : 0);
});
