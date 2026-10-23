#!/usr/bin/env node
'use strict';

// ============================================================================
// schema-provider-match-basis.test.js — ⟪lane zbE, E2-3 (census 61)⟫ getSchema describes EVERY matchBasis value the graph
// carries, each with its own sentence, and only those: the values are read from the graph (match edges AND
// DECLARED_CORRESPONDENCE, whose matchBasis is 'declared'), the sentences from one registry (MATCH_BASIS_MEANING_BY_VALUE).
// Until E2-3 the line named the live values but described a fixed three (derived, standard, declaredIdentity), so the
// 'declared' value GOLD_EVAL_261021_ctdlHub carries (57 edges, measured) had no sentence. A live value the registry does not
// know is refused by name. Stub neo4jDb; no live graph.
//
//   node server/lib/schema-provider-match-basis.test.js [pathToSchemaProvider]
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

const stubNeo4jDbFor = (liveMatchBasisList) => {
	const stubResultByQueryFragment = [
		{ queryFragment: 'MATCH (p:GraphProvenance)', records: [] },
		{ queryFragment: 'db.labels()', records: [{ label: 'CedsProperty' }, { label: 'ForgedNode' }] },
		{ queryFragment: 'db.relationshipTypes()', records: [{ relationshipType: 'EXACT_MATCH' }, { relationshipType: 'DECLARED_CORRESPONDENCE' }] },
		{ queryFragment: 'UNWIND keys(n)', records: [{ label: 'CedsProperty', properties: ['name'] }] },
		{ queryFragment: 'db.schema.relTypeProperties()', records: [] },
		{ queryFragment: 'DISTINCT n.role', records: [{ role: 'DmeProperty' }] },
		{ queryFragment: 'DISTINCT n._source', records: [{ source: 'CEDS' }] },
		{ queryFragment: 'MATCH (h:HubDefinition)', records: [{ hubName: 'CEDS', hubSource: 'CEDS', hubVersion: '14.0.0.0', canonicalKeyName: 'CEDS Global ID' }] },
		{ queryFragment: 'AS matchBasis', records: liveMatchBasisList.map((matchBasis) => ({ matchBasis })) },
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
const matchBasisLineOf = (schemaText) => (typeof schemaText === 'string' ? schemaText.split('\n').find((lineText) => lineText.indexOf('- **`matchBasis`**') === 0) || '' : '');

const finish = () => {
	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
};

console.log('\n=== Schema Provider: every live matchBasis value described (E2-3) ===\n');

schemaProvider({ neo4jDb: stubNeo4jDbFor(['declared', 'derived']) })((err, schemaText) => {
	const matchBasisLine = matchBasisLineOf(schemaText);
	assert(`renders (${err || 'no error'})`, !err);
	assert('1. the live value `declared` has its sentence: a published statement, never a mapping', /`declared` — [^;]*published statement/.test(matchBasisLine) && /`declared` — [^;]*never/.test(matchBasisLine), matchBasisLine);
	assert('   and the live value `derived` has its sentence: a judgment', /`derived` — [^;]*judgment/.test(matchBasisLine), matchBasisLine);
	assert('2. a value this graph does not carry (`standard`, `declaredIdentity`) is not described', !/`standard`|`declaredIdentity`/.test(matchBasisLine), matchBasisLine);
	assert('   the edge TYPE never carries authority (kept)', /edge TYPE never carries authority/.test(matchBasisLine));

	schemaProvider({ neo4jDb: stubNeo4jDbFor(['derived', 'zzUnknownBasis']) })((unknownErr) => {
		assert('3. a live value with no registered sentence is refused by name', typeof unknownErr === 'string' && unknownErr.includes('zzUnknownBasis'), unknownErr || 'no error');
		schemaProvider({ neo4jDb: stubNeo4jDbFor([]) })((noneErr, noneText) => {
			assert(`4. a graph with no matchBasis says so (${noneErr || 'no error'})`, !noneErr && /none recorded in this graph/.test(matchBasisLineOf(noneText)), matchBasisLineOf(noneText));
			finish();
		});
	});
});
