#!/usr/bin/env node
'use strict';

// ============================================================================
// schema-provider-graph-meanings.test.js — ⟪lane zbE, E2-1⟫ an edge type whose meaning the graph itself defines is
// described in the graph's words, read at run time from its SchemaView node (schemaView:edgeType:<TYPE>), never from a
// hand-written line. REFERENCES was described as 'intra-standard cross reference' while 227 REFERENCES edges of
// GOLD_EVAL_261021_ctdlHub cross _source inside the CTDL family (measured 2026-10-22). A graph that holds such an edge
// type but not its SchemaView definition is refused by name. Stub neo4jDb; no live graph.
//
//   node server/lib/schema-provider-graph-meanings.test.js [pathToSchemaProvider]
// ============================================================================

const schemaProviderPath = process.argv[2] || './schema-provider';
const schemaProvider = require(schemaProviderPath);

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) {
		passed++;
		console.log(`  PASS: ${testName}`);
		return;
	}
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};

const STUB_REFERENCES_MEANING_TEXT = 'zzStub graph-defined REFERENCES meaning';

// stubNeo4jDbFor — canned answers by query fragment; schemaViewRecordList is what the SchemaView read returns
const stubNeo4jDbFor = ({ relationshipTypeList, schemaViewRecordList }) => {
	const stubResultByQueryFragment = [
		{ queryFragment: 'db.labels()', records: [{ label: 'CedsProperty' }, { label: 'ForgedNode' }] },
		{ queryFragment: 'db.relationshipTypes()', records: relationshipTypeList.map((relationshipType) => ({ relationshipType })) },
		{ queryFragment: 'db.schema.nodeTypeProperties()', records: [{ label: 'CedsProperty', properties: ['name'] }] },
		{ queryFragment: 'DISTINCT n.role', records: [{ role: 'DmeProperty' }] },
		{ queryFragment: 'DISTINCT n._source', records: [{ source: 'CEDS' }] },
		{ queryFragment: 'MATCH (h:HubDefinition)', records: [{ hubName: 'CEDS', hubSource: 'CEDS', hubVersion: '14.0.0.0', canonicalKeyName: 'CEDS Global ID' }] },
		{ queryFragment: 'matchEdge.matchBasis', records: [{ matchBasis: 'derived' }] },
		{ queryFragment: 'db.schema.relTypeProperties()', records: [] },
		{ queryFragment: 'SchemaView', records: schemaViewRecordList },
	];
	return {
		runQuery: (queryText, queryParams, callback) => {
			const stubResult = stubResultByQueryFragment.find((candidate) => queryText.includes(candidate.queryFragment));
			if (!stubResult) {
				callback(`stub neo4jDb: no canned result for query: ${queryText}`);
				return;
			}
			callback('', stubResult.records);
		},
	};
};

const finish = () => {
	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
};

console.log('\n=== Schema Provider: graph-defined edge meanings (E2-1) ===\n');

const withDefinition = stubNeo4jDbFor({ relationshipTypeList: ['HAS_PROPERTY', 'REFERENCES'], schemaViewRecordList: [{ stableId: 'schemaView:edgeType:REFERENCES', description: STUB_REFERENCES_MEANING_TEXT }] });
schemaProvider({ neo4jDb: withDefinition })((err, schemaText) => {
	assert(`renders when the graph defines REFERENCES (${err || 'no error'})`, !err);
	const schemaTextOrEmpty = typeof schemaText === 'string' ? schemaText : '';
	const referencesLine = schemaTextOrEmpty.split('\n').find((lineText) => lineText.startsWith('- **REFERENCES** —')) || '';
	assert('the REFERENCES line is the graph\'s own SchemaView description', referencesLine === `- **REFERENCES** — ${STUB_REFERENCES_MEANING_TEXT}`, referencesLine || 'no REFERENCES line');
	assert('the hand-written \'intra-standard cross reference\' text is gone', !schemaTextOrEmpty.includes('intra-standard cross reference'));
	assert('a hand-described edge (HAS_PROPERTY) still renders its line', schemaTextOrEmpty.includes('- **HAS_PROPERTY** —'));

	const withoutDefinition = stubNeo4jDbFor({ relationshipTypeList: ['HAS_PROPERTY', 'REFERENCES'], schemaViewRecordList: [] });
	schemaProvider({ neo4jDb: withoutDefinition })((absentErr) => {
		assert('a graph holding REFERENCES without its SchemaView definition is refused by name', typeof absentErr === 'string' && absentErr.includes('schemaView:edgeType:REFERENCES'), absentErr || 'no error');

		const withoutEdge = stubNeo4jDbFor({ relationshipTypeList: ['HAS_PROPERTY'], schemaViewRecordList: [] });
		schemaProvider({ neo4jDb: withoutEdge })((noEdgeErr, noEdgeText) => {
			assert(`a graph without REFERENCES needs no definition (${noEdgeErr || 'no error'})`, !noEdgeErr);
			assert('  and prints no REFERENCES line', typeof noEdgeText === 'string' && !noEdgeText.includes('- **REFERENCES** —'));
			finish();
		});
	});
});
