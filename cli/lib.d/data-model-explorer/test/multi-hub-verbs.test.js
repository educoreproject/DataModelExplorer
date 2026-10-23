#!/usr/bin/env node
'use strict';

// multi-hub-verbs.test.js — ctdlHub P7 (DME reads a multi-hub graph; rulings SCARLET_ARROW 2026-10-21). HERMETIC: every verb
// runs through QUERY_HANDLER_BY_QUERY_TYPE on a STUB session that answers each query by its text, as a graph holding TWO
// hubs (CEDS and CTDL) would. Asserts what a two-hub graph needs and the live two-hub graph cannot yet show (it holds no
// match edges, measured, DEVLOG-P7 checkpoint 1):
//   1. the hub list: no verb refuses because a graph holds two hubs; a graph holding none, or a hub lacking its name, is
//      an error by name;
//   2. findMappings: every row names its hub (hubName, and toSource is that hub); the rows are contiguous per hub in
//      hubName order; each hub is allocated the row cap on its own (one hub never crowds out the other);
//      totalRowCountByHub and hubList; the legacy ceds* fields are absent; the card decomposition reads each slot through
//      BOTH hubs' edge types, and the incoming arm every hub's every slot;
//   3. compareCodesets, unmappedFields, stats, listStandards exclude / name EVERY hub standard, and carry no single-hub
//      string field (hubStandard, totals.hubSource) a two-hub graph cannot fill;
//   4. the contract's term slot (hubTermSlotList) on a FIXTURE contract carrying it (until educoreForge's contract does):
//      HAS_CTDL_TERM joins the incoming arm; a contract without the field declares none; a malformed one throws;
//   5. RED TWINS (moduleTwin): the legacy ceds* fields kept on a two-hub graph, and one shared row cap across hubs, each
//      turn an assertion red.
//
//   node cli/lib.d/data-model-explorer/test/multi-hub-verbs.test.js

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

// ---- the stub graph: each query answered by the FIRST responder whose pattern its text matches; every query is kept

const stubRecordOf = (fieldByName) => ({ keys: Object.keys(fieldByName), get: (fieldName) => fieldByName[fieldName] });
// ⟪lane zbE, E1-1⟫ findMappings first reads which property carries each standard's own identifier (the graph's
// StandardDefinitions); every stub graph answers it, after the test's own responders
const NATIVE_IDENTIFIER_RESPONDER = { pattern: /MATCH \(d:StandardDefinition\) RETURN d\.sourceKey AS sourceKey, d\.nativeIdentifierPropertyName/, rowList: [{ sourceKey: 'CEDS', nativeIdentifierPropertyName: 'cedsId' }, { sourceKey: 'CTDL', nativeIdentifierPropertyName: 'uri' }, { sourceKey: 'EdFi', nativeIdentifierPropertyName: 'metaEdId' }] };
const stubSessionOf = (responderList, queryLog) => ({
	run: (cypherText, cypherParameters) => {
		queryLog.push({ cypherText, cypherParameters });
		const responder = responderList.concat([NATIVE_IDENTIFIER_RESPONDER]).find((oneResponder) => oneResponder.pattern.test(cypherText));
		if (!responder) {
			return Promise.reject(new Error(`stub graph: no responder for query ${cypherText.replace(/\s+/g, ' ').slice(0, 140)}`));
		}
		return Promise.resolve({ records: responder.rowList.map(stubRecordOf) });
	},
});

const TWO_HUB_ROW_LIST = [
	{ hubName: 'CEDS', hubSource: 'CEDS', hubVersion: '14.0.0.0', canonicalKeyName: 'CEDS Global ID' },
	{ hubName: 'CTDL', hubSource: 'CTDL', hubVersion: 'Release 20260327', canonicalKeyName: 'CTDL term CURIE' },
];
const HUB_LIST_RESPONDER = { pattern: /MATCH \(h:HubDefinition\) RETURN h\.hubName AS hubName/, rowList: TWO_HUB_ROW_LIST };

// 40 incoming EXACT rows per hub: more than the row cap (30), so a shared cap would crowd one hub out
const mappingRowOf = (hubName, rowIndex) => ({
	direction: 'incoming', fromSource: hubName === 'CEDS' ? 'EdFi' : 'CTDLASN', fromName: `element${rowIndex}`, fromStableId: `${hubName}-element-${rowIndex}`,
	toSource: hubName, hubName, toName: `card${rowIndex}`, toId: `${hubName}-card-${rowIndex}`, mappingType: 'EXACT_MATCH', confidence: 0.9 - rowIndex / 1000,
	matchPredicate: 'skos:exactMatch', viaMatchType: null, viaConfidence: null, viaPredicate: null,
	hubDomain: `${hubName} domain`, hubProperty: `${hubName} property`, hubRange: null, hubValue: null, hubQualifier: null,
	mappingConfidence: 0.9, mappingKind: 'inferred', mappingSource: 'bridge-test', mappingRationale: null,
	viaMappingConfidence: null, viaMappingKind: null, viaMappingSource: null, viaMappingRationale: null,
	fromElementId: null, instanceOf: null, instanceGroupList: null, instanceCount: null, viaInstanceGroupList: null, viaInstanceCount: null,
});
const findMappingsRecordOf = (hubName) => {
	const rowList = Array.from({ length: 40 }, (unused, rowIndex) => mappingRowOf(hubName, rowIndex));
	return { rowHub: hubName, rowRelation: 'EXACT_MATCH', rowStandard: rowList[0].fromSource, topRowList: rowList.slice(0, 30), standardRowCount: 40, directionList: rowList.map((oneRow) => oneRow.direction), toIdList: rowList.map((oneRow) => oneRow.toId) };
};
const FIND_MAPPINGS_RESPONDER_LIST = [
	HUB_LIST_RESPONDER,
	{ pattern: /AS matchedNodeCount/, rowList: [{ matchedNodeCount: 80, instancePathMatchedNodeCount: 0 }] },
	{ pattern: /RETURN rowHub, rowRelation, rowStandard/, rowList: [findMappingsRecordOf('CTDL'), findMappingsRecordOf('CEDS')] },
	{ pattern: /AS matchedInstanceCount/, rowList: [] },
	{ pattern: /hub\.canonicalKey IN \$toIdList/, rowList: [] },
	// ⟪ruling 2026-10-21⟫ one published assertion touches a matched node: it must be listed APART, never as a mapping row
	{ pattern: /AS declaredCorrespondenceList/, rowList: [{ declaredCorrespondenceList: [{ sourceStandard: 'CTDL', subjectName: 'Federal Grant', subjectStableId: 'financialAid:FederalGrant', sourcePredicate: 'owl:equivalentClass', declaredBy: 'CTDL', targetStandard: 'CEDS', objectName: 'Other federal grants', objectStableId: 'ceds:x', objectKind: 'DmeOptionValue' }], declaredCorrespondenceCount: 1 }] },
];

const searchModulePath = path.join(dmeDirPath, 'dataModelExplorerSearch.js');
const runVerbOn = (searchModule, verbName, params, responderList, callback) => {
	const queryLog = [];
	searchModule.QUERY_HANDLER_BY_QUERY_TYPE[verbName](stubSessionOf(responderList, queryLog), params, {}, (verbError, verbResult) => callback(verbError, verbResult, queryLog));
};
const realSearchModule = require(searchModulePath);
const contract = require(path.join(dmeDirPath, 'lib', 'toolPayloadContract'));

console.log('\n=== ctdlHub P7: the DME verbs on a two-hub graph (stub session) ===\n');
const taskList = new taskListPlus();

// ---- 1. the hub list
taskList.push((args, next) => {
	console.log('- 1. the hub list');
	const { resolveHubList } = require(path.join(dmeDirPath, 'lib', 'liveInventory'));
	resolveHubList(stubSessionOf([{ pattern: /HubDefinition/, rowList: [] }], []), (noHubError) => {
		assert('a graph holding no :HubDefinition is an error by name', /holds no :HubDefinition node/.test(noHubError || ''), noHubError);
		resolveHubList(stubSessionOf([{ pattern: /HubDefinition/, rowList: [{ hubName: 'CTDL', hubSource: null, hubVersion: 'x', canonicalKeyName: null }] }], []), (incompleteError) => {
			assert('a :HubDefinition lacking _source is an error by name', /lacks _source or hubName/.test(incompleteError || ''), incompleteError);
			resolveHubList(stubSessionOf([HUB_LIST_RESPONDER], []), (twoHubError, hubInventory) => {
				assert('two hubs answer a two-entry hub list, no refusal', !twoHubError && hubInventory.hubList.length === 2 && hubInventory.hubList[1].hubVersion === 'Release 20260327', twoHubError || JSON.stringify(hubInventory));
				next('', args);
			});
		});
	});
});

// ---- 2. findMappings
const findMappingsAssertions = (answerLabel, verbError, payload, queryLog) => {
	const rowList = (payload && payload.mappingRowList) || [];
	const hubSequenceText = rowList.map((oneRow) => oneRow.hubName).join(',');
	assert(`${answerLabel}: answers rows, no refusal`, !verbError && rowList.length > 0, verbError || JSON.stringify(payload).slice(0, 200));
	assert(`${answerLabel}: every row names its hub, and toSource is that hub`, rowList.every((oneRow) => ['CEDS', 'CTDL'].includes(oneRow.hubName) && oneRow.toSource === oneRow.hubName));
	assert(`${answerLabel}: rows are contiguous per hub, in hubName order (CEDS then CTDL)`, /^(CEDS,)*CEDS(,CTDL)+$/.test(hubSequenceText), hubSequenceText.slice(0, 120));
	assert(`${answerLabel}: each hub is allocated the row cap on its own (30 + 30 shown of 40 + 40)`, rowList.filter((oneRow) => oneRow.hubName === 'CEDS').length === 30 && rowList.filter((oneRow) => oneRow.hubName === 'CTDL').length === 30, `${rowList.length} rows`);
	assert(`${answerLabel}: totalRowCountByHub and the envelope total`, JSON.stringify(payload.totalRowCountByHub) === '{"CEDS":40,"CTDL":40}' && payload.totalRowCount === 80, JSON.stringify(payload.totalRowCountByHub));
	assert(`${answerLabel}: hubList names both hubs`, payload.hubList && payload.hubList.map((oneHub) => oneHub.hubName).join() === 'CEDS,CTDL');
	assert(`${answerLabel}: the legacy ceds* row fields are absent on a two-hub graph; hubTuple is present`, rowList.every((oneRow) => !('cedsDomain' in oneRow) && !('cedsTuple' in oneRow) && typeof oneRow.hubTuple === 'string'));
	const mappingQueryText = ((queryLog || []).find((oneQuery) => /RETURN rowHub, rowRelation, rowStandard/.test(oneQuery.cypherText)) || {}).cypherText || '';
	assert(`${answerLabel}: a card decomposes through BOTH hubs' edge types per slot`, mappingQueryText.includes('OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN|HAS_CTDL_DOMAIN]->(cd:ForgedNode)') && mappingQueryText.includes('[:HAS_CEDS_QUALIFIER|HAS_CTDL_QUALIFIER]->(cq:ForgedNode)'));
	assert(`${answerLabel}: the incoming arm reads every hub's every slot`, mappingQueryText.includes(`MATCH (n)<-[:${contract.allHubDecompositionEdgeTypeList(['CEDS', 'CTDL']).join('|')}]-(hub:HubReference)`));
	assert(`${answerLabel}: a declared correspondence is listed APART (sourcePredicate verbatim), in no mapping row or total`, payload.declaredCorrespondenceCount === 1 && payload.declaredCorrespondenceList[0].sourcePredicate === 'owl:equivalentClass' && /NOT a mapping/.test(payload.declaredCorrespondenceRowUnit) && rowList.every((oneRow) => oneRow.mappingType === 'EXACT_MATCH') && payload.totalRowCount === 80, JSON.stringify(payload.declaredCorrespondenceList));
	assert(`${answerLabel}: no literal hub source in the query (toSource is read from the card)`, !/\$hubSource|'CEDS'/.test(mappingQueryText) && /hub\.hubName AS toSource/.test(mappingQueryText));
};
taskList.push((args, next) => {
	console.log('- 2. findMappings on two hubs');
	runVerbOn(realSearchModule, 'findMappings', { name: 'Birthdate' }, FIND_MAPPINGS_RESPONDER_LIST, (verbError, payload, queryLog) => {
		findMappingsAssertions('findMappings', verbError, payload, queryLog);
		// ⟪lane R6⟫ each hub's identifier example is read from its own cards (the lowest canonicalKey per tier)
		const refusalReasonResponderList = [HUB_LIST_RESPONDER, { pattern: /AS matchedNodeCount/, rowList: [{ matchedNodeCount: 0, instancePathMatchedNodeCount: 0 }] },
			{ pattern: /AS exampleCanonicalKey/, rowList: [{ hubName: 'CEDS', referenceTier: 'property', exampleCanonicalKey: 'P000001' }, { hubName: 'CTDL', referenceTier: 'property', exampleCanonicalKey: 'ceterms:accommodationType' }] }];
		runVerbOn(realSearchModule, 'findMappings', { name: 'zzNothing' }, refusalReasonResponderList, (refusalError, refusal) => {
			assert('nothingMatched names each hub\'s identifier from its canonicalKeyName', !refusalError && refusal.refusalName === 'nothingMatched' && refusal.reason.includes('a CEDS Global ID looks like P000001 (property)') && refusal.reason.includes('a CTDL term CURIE looks like ceterms:accommodationType (property)'), refusalError || (refusal && refusal.reason));
			next('', args);
		});
	});
});

// ---- 3. the other hub-reading verbs
taskList.push((args, next) => {
	console.log('- 3. compareCodesets, unmappedFields, stats, listStandards on two hubs');
	const compareResponderList = [
		HUB_LIST_RESPONDER,
		{ pattern: /RETURN count\(os\) AS matchedOptionSetCount/, rowList: [{ matchedOptionSetCount: 1 }] },
		{ pattern: /AS valueTierJudgmentCount/, rowList: [{ valueTierJudgmentCount: 3 }] },
		{ pattern: /AS valueRowList/, rowList: [{ valueRowList: [{ sourceStandard: 'CTDLASN', optionSetName: 'Sex', sourceValue: 'F', matchType: 'EXACT_MATCH', confidence: 0.9, mappingConfidence: 0.9, mappingKind: 'inferred', mappingSource: 'bridge-test', hubName: 'CTDL', hubValue: 'Female', hubValueKey: 'x:F', crossStandardEquivalents: [] }], totalRowCount: 1 }] },
	];
	runVerbOn(realSearchModule, 'compareCodesets', { name: 'Sex' }, compareResponderList, (compareError, comparePayload, compareQueryLog) => {
		const valueQuery = compareQueryLog.find((oneQuery) => /AS valueRowList/.test(oneQuery.cypherText)) || { cypherText: '', cypherParameters: {} };
		assert('compareCodesets: every hub standard is excluded ($hubSourceList = CEDS, CTDL)', JSON.stringify(valueQuery.cypherParameters.hubSourceList) === '["CEDS","CTDL"]' && /NOT os\._source IN \$hubSourceList/.test(valueQuery.cypherText));
		assert('compareCodesets: the value card decomposes through both hubs\' VALUE edges', valueQuery.cypherText.includes('[:HAS_CEDS_VALUE|HAS_CTDL_VALUE]->(cv:ForgedNode)'));
		const valueRow = ((comparePayload || {}).valueRowList || [])[0] || {};
		assert('compareCodesets: the row names its hub; no legacy cedsValue on two hubs', !compareError && valueRow.hubName === 'CTDL' && valueRow.hubValue === 'Female' && !('cedsValue' in valueRow), compareError || JSON.stringify(valueRow));
		const unmappedResponderList = [HUB_LIST_RESPONDER, { pattern: /AS unmappedRowList/, rowList: [{ unmappedRowList: [], totalRowCount: 0 }] }];
		runVerbOn(realSearchModule, 'unmappedFields', { limit: '5' }, unmappedResponderList, (unmappedError, unmappedPayload, unmappedQueryLog) => {
			const unmappedQuery = unmappedQueryLog.find((oneQuery) => /AS unmappedRowList/.test(oneQuery.cypherText)) || { cypherParameters: {} };
			assert('unmappedFields: excludes every hub standard; names them in hubStandardList; no single hubStandard string', !unmappedError && JSON.stringify(unmappedQuery.cypherParameters.hubSourceList) === '["CEDS","CTDL"]' && JSON.stringify(unmappedPayload.hubStandardList) === '["CEDS","CTDL"]' && !('hubStandard' in unmappedPayload), unmappedError || JSON.stringify(unmappedPayload));
			const statsResponderList = [
				HUB_LIST_RESPONDER,
				{ pattern: /AS mappedPropertyCount/, rowList: [{ hubName: 'CEDS', mappedPropertyCount: 4 }] },
				{ pattern: /AS totalProperties/, rowList: [{ totalProperties: 10, mappedProperties: 4, hubPropertyCount: 3 }] },
				{ pattern: /./, rowList: [] },
			];
			runVerbOn(realSearchModule, 'stats', {}, statsResponderList, (statsError, statsPayload) => {
				const coverage = (statsPayload || {}).coverage || {};
				assert('stats: per-hub mapped properties, every hub listed with zero stated; no single hubStandard string', !statsError && JSON.stringify(coverage.mappedPropertyCountByHub) === '{"CEDS":4,"CTDL":0}' && JSON.stringify(coverage.hubStandardList) === '["CEDS","CTDL"]' && !('hubStandard' in coverage), statsError || JSON.stringify(coverage));
				const listResponderList = [
					HUB_LIST_RESPONDER,
					{ pattern: /RETURN r\._source AS source,\s+r\.standardKey/, rowList: ['CEDS', 'CTDL', 'CTDLASN'].map((sourceName) => ({ source: sourceName, standardKey: sourceName.toLowerCase(), name: sourceName, standardName: sourceName, description: '', version: '1', sourceUrl: '', standardFamily: null, releaseLabel: null, descriptionSource: null, nodeCount: 5 })) },
					{ pattern: /AS standardCount/, rowList: [{ standardCount: 3 }] },
					{ pattern: /RETURN n\._source AS source, hub\.hubName AS hubName/, rowList: [{ source: 'CTDLASN', hubName: 'CTDL', hubMatchEdgeCount: 7 }] },
					{ pattern: /RETURN r\._source AS source, count\(m\) AS hubMatchEdgeCount/, rowList: [{ source: 'CEDS', hubMatchEdgeCount: 0 }, { source: 'CTDL', hubMatchEdgeCount: 0 }, { source: 'CTDLASN', hubMatchEdgeCount: 7 }] },
					{ pattern: /AS releaseCount/, rowList: [] },
				];
				runVerbOn(realSearchModule, 'listStandards', {}, listResponderList, (listError, listPayload) => {
					const standardBySource = Object.fromEntries(((listPayload || {}).standards || []).map((oneStandard) => [oneStandard.source, oneStandard]));
					assert('listStandards: both hubs are isHub; a spoke is not', !listError && standardBySource.CEDS.isHub && standardBySource.CTDL.isHub && !standardBySource.CTDLASN.isHub, listError);
					assert('listStandards: hubMatchEdgeCountByHub per standard, every hub listed', standardBySource.CTDLASN && JSON.stringify(standardBySource.CTDLASN.hubMatchEdgeCountByHub) === '{"CEDS":0,"CTDL":7}');
					assert('listStandards: totals name both hubs; no single totals.hubSource string', listPayload && JSON.stringify(listPayload.totals.hubStandardList) === '["CEDS","CTDL"]' && !('hubSource' in listPayload.totals) && listPayload.totals.hubList.length === 2);
					next('', args);
				});
			});
		});
	});
});

// ---- 4. the term slot, on a fixture contract
taskList.push((args, next) => {
	console.log('- 4. the term slot (fixture contract carrying hubTermSlotList)');
	const contractModulePath = path.join(dmeDirPath, 'lib', 'toolPayloadContract.js');
	const fixtureContract = loadWithMutations({ modulePath: contractModulePath, mutationList: [{ find: "const HUB_TERM_SLOT_LIST = hubTermSlotListOf(require('../contract/graphContract.json'));", replace: "const HUB_TERM_SLOT_LIST = hubTermSlotListOf({ ...require('../contract/graphContract.json'), hubTermSlotList: ['TERM'] });" }] });
	assert('fixture: the incoming arm gains HAS_CTDL_TERM (and HAS_CEDS_TERM, absent from a graph whose CEDS mints no term tier)', fixtureContract.allHubDecompositionEdgeTypeList(['CEDS', 'CTDL']).includes('HAS_CTDL_TERM') && fixtureContract.hubSlotEdgeTypeList(['CTDL'], 'TERM')[0] === 'HAS_CTDL_TERM');
	assert('a contract without hubTermSlotList declares no term slot (the era rule)', contract.hubTermSlotListOf({ hubSlotList: ['DOMAIN'] }).length === 0);
	let malformedError = '';
	try { contract.hubTermSlotListOf({ hubTermSlotList: 'TERM' }); } catch (thrownError) { malformedError = thrownError.message; } // the refusal under test IS a throw
	assert('a malformed hubTermSlotList throws by name', /hubTermSlotList must be a list of upper-case slot names/.test(malformedError), malformedError);
	let unknownSlotError = '';
	try { contract.hubSlotEdgeTypeList(['CEDS'], 'TERM_X'); } catch (thrownError) { unknownSlotError = thrownError.message; }
	assert('an undeclared slot name throws by name', /'TERM_X' is not a declared hub slot/.test(unknownSlotError), unknownSlotError);
	next('', args);
});

// ---- 5. red twins
taskList.push((args, next) => {
	console.log('- 5. red twins (each must turn an assertion red)');
	// the CLI's shebang line is not JavaScript the twin compiler accepts: it is dropped first
	const twinOf = (find, replace) => loadWithMutations({ modulePath: searchModulePath, mutationList: [{ find: '#!/usr/bin/env node\n', replace: '' }, { find, replace }] });
	// ⟪lane R6⟫ the legacy fields are gone on every graph; the twin restores one
	const legacyKeptTwin = twinOf('\t\t\thubName: rec.get(\'hubName\'),\n\t\t\thubDomain: rec.get(\'hubDomain\'),', '\t\t\tcedsDomain: rec.get(\'hubDomain\'),\n\t\t\thubName: rec.get(\'hubName\'),\n\t\t\thubDomain: rec.get(\'hubDomain\'),');
	const sharedCapTwin = twinOf('shownRowList.push(...hubAllocation.shownRowList);', 'shownRowList.push(...hubAllocation.shownRowList.slice(0, Math.max(0, 30 - shownRowList.length)));');
	runVerbOn(legacyKeptTwin, 'findMappings', { name: 'Birthdate' }, FIND_MAPPINGS_RESPONDER_LIST, (legacyError, legacyPayload) => {
		const legacyRowList = (legacyPayload && legacyPayload.mappingRowList) || [];
		assert('red twin (ceds* kept on two hubs): the legacy-field assertion would fail', legacyRowList.some((oneRow) => 'cedsDomain' in oneRow));
		runVerbOn(sharedCapTwin, 'findMappings', { name: 'Birthdate' }, FIND_MAPPINGS_RESPONDER_LIST, (sharedError, sharedPayload) => {
			const sharedRowList = (sharedPayload && sharedPayload.mappingRowList) || [];
			assert('red twin (one cap shared across hubs): CTDL is crowded out, so the per-hub cap assertion would fail', sharedRowList.filter((oneRow) => oneRow.hubName === 'CTDL').length === 0 && sharedRowList.length === 30, `${sharedRowList.length} rows`);
			const droppedCorrespondenceTwin = twinOf('...declaredCorrespondenceFieldsOf(args.declaredCorrespondenceResult.records[0]),\n\t\t});\n\t});\n};', '});\n\t});\n};');
			runVerbOn(droppedCorrespondenceTwin, 'findMappings', { name: 'Birthdate' }, FIND_MAPPINGS_RESPONDER_LIST, (droppedError, droppedPayload) => {
				assert('red twin (declared correspondences not listed): the declared-correspondence assertion would fail', droppedPayload && !('declaredCorrespondenceList' in droppedPayload));
				next('', args);
			});
		});
	});
});

pipeRunner(taskList.getList(), {}, (pipeError) => {
	if (pipeError) { failed++; console.log(`  FAIL: ${pipeError}`); }
	console.log(`\n=== ctdlHub P7 multi-hub verbs — Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed > 0 ? 1 : 0);
});
