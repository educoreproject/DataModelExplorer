#!/usr/bin/env node
'use strict';

// ============================================================================
// schema-provider-cache.test.js — ⟪lane zbE, E2-4⟫ getSchema's text is rendered once per graph build and then served from
// a cache keyed by the passport's identity (graphName, manifestRefId, builtAt, graphContractSha256), per schema-provider
// instance. The full description reads every node (13 s on GOLD_EVAL_261021_ctdlHub, measured); paying that on every
// MCP getSchema call is what made the tool unusable. Stub neo4jDb counting the queries it is asked; no live graph.
//   1. the second call on one passport runs ONLY the passport read, and answers the same text;
//   2. a changed passport (a rebuild) renders afresh;
//   3. a graph with no passport, or with two, is never cached: every call renders;
//   4. two instances share nothing (a user graph's instance never reads the golden graph's text).
//
//   node server/lib/schema-provider-cache.test.js [pathToSchemaProvider]
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

const passportRecordFor = (builtAt) => ({ graphName: 'GOLD_EVAL_zzStub', manifestRefId: 'zzManifest', builtAt, graphContractSha256: 'zzSha' });

// countingStubFor — canned answers; queryLog records every query text asked; passportHolder.recordList is mutable so a
// test can rebuild the graph between calls
const countingStubFor = (passportHolder, labelText) => {
	const queryLog = [];
	const stubResultByQueryFragment = [
		{ queryFragment: 'MATCH (p:GraphProvenance)', recordsOf: () => passportHolder.recordList },
		{ queryFragment: 'db.labels()', recordsOf: () => [{ label: labelText }, { label: 'ForgedNode' }] },
		{ queryFragment: 'db.relationshipTypes()', recordsOf: () => [{ relationshipType: 'HAS_PROPERTY' }] },
		{ queryFragment: 'UNWIND keys(n)', recordsOf: () => [{ label: labelText, properties: ['name'] }] },
		{ queryFragment: 'db.schema.nodeTypeProperties()', recordsOf: () => [{ label: labelText, properties: ['name'] }] },
		{ queryFragment: 'db.schema.relTypeProperties()', recordsOf: () => [] },
		{ queryFragment: 'DISTINCT n.role', recordsOf: () => [{ role: 'DmeProperty' }] },
		{ queryFragment: 'DISTINCT n._source', recordsOf: () => [{ source: 'CEDS' }] },
		{ queryFragment: 'MATCH (h:HubDefinition)', recordsOf: () => [{ hubName: 'CEDS', hubSource: 'CEDS', hubVersion: '14.0.0.0', canonicalKeyName: 'CEDS Global ID' }] },
		{ queryFragment: 'AS matchBasis', recordsOf: () => [{ matchBasis: 'derived' }] },
	];
	return {
		queryLog,
		runQuery: (queryText, queryParams, callback) => {
			queryLog.push(queryText);
			const stubResult = stubResultByQueryFragment.find((candidate) => queryText.includes(candidate.queryFragment));
			if (!stubResult) {
				callback(`stub neo4jDb: no canned result for query: ${queryText}`);
				return;
			}
			callback('', stubResult.recordsOf());
		},
	};
};
const schemaQueryCountOf = (queryLog) => queryLog.filter((queryText) => queryText.includes('db.labels()')).length;

const finish = () => {
	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
};

console.log('\n=== Schema Provider: text cached per passport (E2-4) ===\n');

const passportHolder = { recordList: [passportRecordFor('2026-10-22T00:00:00Z')] };
const goldenStub = countingStubFor(passportHolder, 'CedsProperty');
const getGoldenSchema = schemaProvider({ neo4jDb: goldenStub });

getGoldenSchema((firstErr, firstText) => {
	assert(`first call renders (${firstErr || 'no error'})`, !firstErr && typeof firstText === 'string' && firstText.length > 0);
	const queryCountAfterFirst = goldenStub.queryLog.length;
	getGoldenSchema((secondErr, secondText) => {
		const secondQueryList = goldenStub.queryLog.slice(queryCountAfterFirst);
		assert('1. the second call on one passport answers the same text', !secondErr && secondText === firstText);
		assert('   and runs only the passport read', secondQueryList.length === 1 && secondQueryList[0].includes('GraphProvenance'), JSON.stringify(secondQueryList.map((queryText) => queryText.slice(0, 40))));

		passportHolder.recordList = [passportRecordFor('2026-10-23T00:00:00Z')];
		const schemaCountBeforeRebuild = schemaQueryCountOf(goldenStub.queryLog);
		getGoldenSchema((rebuildErr) => {
			assert('2. a changed passport (builtAt) renders afresh', !rebuildErr && schemaQueryCountOf(goldenStub.queryLog) === schemaCountBeforeRebuild + 1);

			const noPassportHolder = { recordList: [] };
			const noPassportStub = countingStubFor(noPassportHolder, 'CedsProperty');
			const getNoPassportSchema = schemaProvider({ neo4jDb: noPassportStub });
			getNoPassportSchema(() => getNoPassportSchema((noPassportErr) => {
				assert('3. a graph with no passport renders on every call', !noPassportErr && schemaQueryCountOf(noPassportStub.queryLog) === 2);

				const twoPassportHolder = { recordList: [passportRecordFor('a'), passportRecordFor('b')] };
				const twoPassportStub = countingStubFor(twoPassportHolder, 'CedsProperty');
				const getTwoPassportSchema = schemaProvider({ neo4jDb: twoPassportStub });
				getTwoPassportSchema(() => getTwoPassportSchema(() => {
					assert('   and so does a graph with two passports', schemaQueryCountOf(twoPassportStub.queryLog) === 2);

					// same passport, different content (a user graph is a gold clone plus a user layer)
					const userGraphStub = countingStubFor({ recordList: [passportRecordFor('2026-10-23T00:00:00Z')] }, 'UserLayerZzStubLabel');
					schemaProvider({ neo4jDb: userGraphStub })((userErr, userText) => {
						assert('4. a second instance with the same passport renders its OWN graph', !userErr && schemaQueryCountOf(userGraphStub.queryLog) === 1 && typeof userText === 'string' && userText.includes('UserLayerZzStubLabel'));
						finish();
					});
				}));
			}));
		});
	});
});
