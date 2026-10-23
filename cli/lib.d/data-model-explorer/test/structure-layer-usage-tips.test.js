#!/usr/bin/env node
'use strict';

// structure-layer-usage-tips.test.js — ⟪lane zbE, E1-2 (census 11, deferred row R6-3)⟫ dme_structure's description of the
// guide layer comes from the layer itself: the guide root's layerUsageTips (stamped by educoreForge lane A2, A2-4), carried
// in every answer, so provider.json no longer holds the layer's own sentence (BRONZE_CROWN ruling 2026-10-23, (a)(b)(c)).
// The class / property lookup uses the layer standard's OWN declared identifier property (E1-1), never a literal cedsId.
// HERMETIC: a stub session answers each read.
//   (a) an A2 graph: the answer carries layerUsageTips verbatim; the lookup names the declared property (a stub name here)
//   (b) a guide root WITHOUT layerUsageTips (built before A2) -> refused by name, layerUsageTipsAbsent
//   (c) the layer's standard declares no native identifier -> refused by name, nativeIdentifierUnstamped
//   (d) provider.json's dme_structure description no longer carries the layer's sentence; it says the layer describes
//       itself in every answer (layerUsageTips)
//
//   node cli/lib.d/data-model-explorer/test/structure-layer-usage-tips.test.js

const fs = require('fs');
const path = require('path');

const DME_DIR_PATH = path.join(__dirname, '..');
const { runStructure } = require('../lib/structure');
const { runCypherQuery } = require('../lib/runCypherQuery');
const { refusalFor, listEnvelopeFor } = require('../lib/toolPayloadContract');

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const STUB_USAGE_TIPS = 'zzStub The Conceptual Model of the layer, in the layer\'s own words.';
const stubRecordOf = (fieldValueByName) => ({ get: (fieldName) => fieldValueByName[fieldName], keys: Object.keys(fieldValueByName) });
const structureOn = ({ rootRow, declarationRowList }, callback) => {
	const queryLog = [];
	const session = { run: (cypherText) => {
		queryLog.push(cypherText);
		if (/DmeLayerRoot/.test(cypherText)) return Promise.resolve({ records: rootRow ? [stubRecordOf(rootRow)] : [] });
		if (/MATCH \(d:StandardDefinition\) RETURN d\.sourceKey/.test(cypherText)) return Promise.resolve({ records: declarationRowList.map(stubRecordOf) });
		if (/HAS_PRIMARY_CONCEPT/.test(cypherText)) return Promise.resolve({ records: [stubRecordOf({ classId: 'C200013', className: 'Person', guideV14ClassName: 'Person', primaryConcept: 'Person', secondaryConcept: null, primaryConceptDefinition: 'd' })] });
		return Promise.resolve({ records: [] });
	} };
	runStructure({ session, params: { mode: 'classConcepts', name: 'C200013' }, runCypherQuery, refusalFor, listEnvelopeFor, toNumber: (oneValue) => oneValue }, (err, payload) => callback(err, payload || {}, queryLog));
};

const A2_DECLARATION_ROW_LIST = [{ sourceKey: 'CEDS', nativeIdentifierPropertyName: 'zzLayerNativeId' }, { sourceKey: 'EdFi', nativeIdentifierPropertyName: 'metaEdId' }];

console.log('\n=== dme_structure: the guide layer describes itself (E1-2) ===\n');
structureOn({ rootRow: { guideVersion: 'V14', layerUsageTips: STUB_USAGE_TIPS, layerSource: 'CEDS' }, declarationRowList: A2_DECLARATION_ROW_LIST }, (err, payload, queryLog) => {
	const lookupQuery = queryLog.find((cypherText) => /HAS_PRIMARY_CONCEPT/.test(cypherText)) || '';
	assert('(a) the answer carries the root\'s layerUsageTips verbatim', !err && payload.layerUsageTips === STUB_USAGE_TIPS, JSON.stringify(payload).slice(0, 200));
	assert('    the class lookup reads the layer standard\'s declared identifier (a stub name, zzLayerNativeId), not a literal cedsId', /class\.zzLayerNativeId = \$name/.test(lookupQuery) && /class\.zzLayerNativeId AS classId/.test(lookupQuery) && !/cedsId/.test(lookupQuery), lookupQuery.slice(0, 200));
	structureOn({ rootRow: { guideVersion: 'V14', layerUsageTips: null, layerSource: 'CEDS' }, declarationRowList: A2_DECLARATION_ROW_LIST }, (absentErr, absentPayload) => {
		assert('(b) a guide root without layerUsageTips is refused by name (layerUsageTipsAbsent)', !absentErr && absentPayload.refusalName === 'layerUsageTipsAbsent', JSON.stringify(absentPayload).slice(0, 200));
		structureOn({ rootRow: { guideVersion: 'V14', layerUsageTips: STUB_USAGE_TIPS, layerSource: 'CEDS' }, declarationRowList: [{ sourceKey: 'CEDS', nativeIdentifierPropertyName: null }, { sourceKey: 'EdFi', nativeIdentifierPropertyName: 'metaEdId' }] }, (undeclaredErr, undeclaredPayload) => {
			assert('(c) a layer standard that declares no native identifier is refused by name', !undeclaredErr && undeclaredPayload.refusalName === 'nativeIdentifierUnstamped', JSON.stringify(undeclaredPayload).slice(0, 200));
			const structureDescription = (JSON.parse(fs.readFileSync(path.join(DME_DIR_PATH, 'provider.json'), 'utf8')).tools.find((oneTool) => oneTool.definition.name === 'dme_structure') || { definition: {} }).definition.description || '';
			assert('(d) provider.json no longer carries the layer\'s own sentence, and points at layerUsageTips', !/^The Conceptual Model of the CEDS Ontology Guide V14/.test(structureDescription) && /layerUsageTips/.test(structureDescription), structureDescription.slice(0, 160));
			console.log(`\n${passed} passed, ${failed} failed`);
			process.exit(failed > 0 ? 1 : 0);
		});
	});
});
