#!/usr/bin/env node
'use strict';

// native-identifier.test.js — ⟪lane zbE, E1-1⟫ HERMETIC gate for lib/nativeIdentifier.js: each standard's own identifier is
// read from the graph's StandardDefinitions, never assumed (R6-1). The rows below are the values lane A2 stamps (BRONZE_CROWN
// FYI 2026-10-23: CEDS cedsId, the CTDL family uri, Ed-Fi metaEdId, PESC none).
//   (a) a graph declaring some standards -> its declarations; a standard with no field is simply absent from them
//   (b) a graph whose StandardDefinitions carry NO declaration (built before A2) -> refused by name, nativeIdentifierUnstamped
//   (c) a declaration outside the identifier grammar -> refused by name, nativeIdentifierDeclarationInvalid
//   (d) the sourceId Cypher: the node's OWN standard's property, then stableId, persistentId, ''; exact text
//   (e) the lookup names: the distinct declared names, sorted
//   (f) findMappings (real handler, stub graph): refuses an unstamped graph before searching; looks up every declared name
// RED TWINS (test/lib/moduleTwin.js): unstampedCheckRemoved -> (b); grammarCheckRemoved -> (c); perStandardCaseRemoved -> (d)
//
//   node cli/lib.d/data-model-explorer/test/native-identifier.test.js

const path = require('path');
const { loadWithMutations } = require('./lib/moduleTwin');

const MODULE_PATH = path.join(__dirname, '..', 'lib', 'nativeIdentifier.js');

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const A2_ROW_LIST = [
	{ sourceKey: 'CEDS', nativeIdentifierPropertyName: 'cedsId' },
	{ sourceKey: 'CTDL', nativeIdentifierPropertyName: 'uri' },
	{ sourceKey: 'EdFi', nativeIdentifierPropertyName: 'metaEdId' },
	{ sourceKey: 'PESC-CollegeTranscript-1.8.0', nativeIdentifierPropertyName: null },
];
const PRE_A2_ROW_LIST = A2_ROW_LIST.map((oneRow) => ({ sourceKey: oneRow.sourceKey, nativeIdentifierPropertyName: null }));

const conjunctByName = {
	a_declarationsRead: (moduleExports) => {
		const verdict = moduleExports.nativeIdentifierDeclarationVerdictFor(A2_ROW_LIST);
		const declaredText = JSON.stringify((verdict.declarationList || []).map((oneDeclaration) => `${oneDeclaration.sourceKey}:${oneDeclaration.nativeIdentifierPropertyName}`));
		return { pass: !verdict.refusalName && declaredText === JSON.stringify(['CEDS:cedsId', 'CTDL:uri', 'EdFi:metaEdId']), detail: verdict.reason || declaredText };
	},
	b_unstampedRefused: (moduleExports) => {
		const verdict = moduleExports.nativeIdentifierDeclarationVerdictFor(PRE_A2_ROW_LIST);
		return { pass: verdict.refusalName === 'nativeIdentifierUnstamped' && /built before the forges stamped it/.test(verdict.reason || ''), detail: JSON.stringify(verdict).slice(0, 160) };
	},
	c_grammarRefused: (moduleExports) => {
		const verdict = moduleExports.nativeIdentifierDeclarationVerdictFor([{ sourceKey: 'CEDS', nativeIdentifierPropertyName: 'cedsId} DETACH DELETE n //' }]);
		return { pass: verdict.refusalName === 'nativeIdentifierDeclarationInvalid', detail: JSON.stringify(verdict).slice(0, 160) };
	},
	d_sourceIdentifierCypher: (moduleExports) => {
		const { declarationList } = moduleExports.nativeIdentifierDeclarationVerdictFor(A2_ROW_LIST);
		const cypherText = moduleExports.sourceIdentifierCypherTextFor('n', declarationList);
		const expectedText = "coalesce(CASE n._source WHEN 'CEDS' THEN n.cedsId WHEN 'CTDL' THEN n.uri WHEN 'EdFi' THEN n.metaEdId END, n.stableId, n.persistentId, '')";
		let refusedWithoutList = false;
		try { moduleExports.sourceIdentifierCypherTextFor('n', []); } catch (absentListError) { refusedWithoutList = /needs the graph's declarationList/.test(absentListError.message); }
		return { pass: cypherText === expectedText && refusedWithoutList, detail: cypherText };
	},
	e_lookupNames: (moduleExports) => {
		const { declarationList } = moduleExports.nativeIdentifierDeclarationVerdictFor([...A2_ROW_LIST, { sourceKey: 'CTDLASN', nativeIdentifierPropertyName: 'uri' }]);
		const nameText = JSON.stringify(moduleExports.nativeIdentifierPropertyNameListOf(declarationList));
		return { pass: nameText === JSON.stringify(['cedsId', 'metaEdId', 'uri']), detail: nameText };
	},
};

const TWIN_LIST = [
	{ conjunctName: 'b_unstampedRefused', twinName: 'unstampedCheckRemoved', mutationList: [{ find: '	if (declaredRowList.length === 0) {', replace: '	if (false) {' }] },
	{ conjunctName: 'c_grammarRefused', twinName: 'grammarCheckRemoved', mutationList: [{ find: '	if (invalidTextList.length) {', replace: '	if (false) {' }] },
	{ conjunctName: 'd_sourceIdentifierCypher', twinName: 'perStandardCaseRemoved', mutationList: [{ find: "`WHEN '${oneDeclaration.sourceKey}' THEN ${nodeVariableName}.${oneDeclaration.nativeIdentifierPropertyName}`", replace: "`WHEN '${oneDeclaration.sourceKey}' THEN ${nodeVariableName}.cedsId`" }] },
];

// (f) findMappings, through the real handler table on a stub graph: an unstamped graph is refused by name before any
// search; on a stamped one the lookup predicate names every declared property (here metaEdId and uri beside cedsId)
const stubRecordOf = (fieldValueByName) => ({ get: (fieldName) => fieldValueByName[fieldName], keys: Object.keys(fieldValueByName) });
const findMappingsOn = (declarationRowList, callback) => {
	const queryLog = [];
	const stubSession = { run: (cypherText) => {
		queryLog.push(cypherText);
		if (/MATCH \(h:HubDefinition\) RETURN h\.hubName AS hubName/.test(cypherText)) return Promise.resolve({ records: [stubRecordOf({ hubName: 'CEDS', hubSource: 'CEDS', hubVersion: '14', canonicalKeyName: 'CEDS Global ID' })] });
		if (/MATCH \(d:StandardDefinition\) RETURN d\.sourceKey/.test(cypherText)) return Promise.resolve({ records: declarationRowList.map(stubRecordOf) });
		if (/AS matchedNodeCount/.test(cypherText)) return Promise.resolve({ records: [stubRecordOf({ matchedNodeCount: 0, instancePathMatchedNodeCount: 0 })] });
		return Promise.resolve({ records: [] });
	} };
	const { QUERY_HANDLER_BY_QUERY_TYPE } = require('../dataModelExplorerSearch');
	QUERY_HANDLER_BY_QUERY_TYPE.findMappings(stubSession, { name: '1381' }, {}, (err, result) => callback(err, result, queryLog));
};

console.log('native-identifier — BASELINE');
const realModule = require(MODULE_PATH);
Object.keys(conjunctByName).forEach((conjunctName) => {
	const verdict = conjunctByName[conjunctName](realModule);
	assert(conjunctName, verdict.pass, verdict.detail);
});
console.log('native-identifier — findMappings on stub graphs');
findMappingsOn(PRE_A2_ROW_LIST, (unstampedErr, unstampedResult, unstampedQueryLog) => {
	assert('f_findMappingsRefusesUnstamped: refused by name, and no search ran', !unstampedErr && unstampedResult && unstampedResult.refusalName === 'nativeIdentifierUnstamped' && !unstampedQueryLog.some((cypherText) => /AS matchedNodeCount/.test(cypherText)), JSON.stringify(unstampedResult).slice(0, 160));
	findMappingsOn(A2_ROW_LIST, (stampedErr, stampedResult, stampedQueryLog) => {
		const countQuery = stampedQueryLog.find((cypherText) => /AS matchedNodeCount/.test(cypherText)) || '';
		assert('f_findMappingsLooksUpDeclaredNames: n.cedsId, n.metaEdId and n.uri are lookup fields; nothingMatched lists them', ['n.cedsId = $name', 'n.metaEdId = $name', 'n.uri = $name'].every((predicateText) => countQuery.includes(predicateText)) && /_id, path, stableId, cedsId, metaEdId, uri/.test((stampedResult || {}).reason || ''), `${countQuery.slice(0, 200)} | ${(stampedResult || {}).reason}`);
		runTwinSweep();
	});
});
const runTwinSweep = () => {
console.log('native-identifier — TWIN SWEEP (each observed RED)');
TWIN_LIST.forEach((oneTwin) => {
	const verdict = conjunctByName[oneTwin.conjunctName](loadWithMutations({ modulePath: MODULE_PATH, mutationList: oneTwin.mutationList }));
	assert(`${oneTwin.conjunctName} observed RED under '${oneTwin.twinName}'`, !verdict.pass, verdict.detail);
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
};
