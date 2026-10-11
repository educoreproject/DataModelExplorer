#!/usr/bin/env node
'use strict';

// compare-codesets-contract.test.js — W-D-8 (campaign P1, 2026-10-06; DME half of G9, V2-C12). This build holds NO
// value-tier judgment (0 match edges leave an option value), yet compareCodesets printed matchType null on every row
// under a description saying null "shows where a codeset does not align to CEDS". The verb now reads the build-level fact
// from the graph and says which it is: verdict 'judged' or 'valuesNotJudgedInThisBuild'; null means NOT JUDGED in the
// latter. The envelope carries the §14 totals (cap COMPARE_CODESETS_ROW_CAP), and a name matching no option set is
// refused by name. The expected verdict and totals are derived from the test's own Cypher, never hard-coded.
//
//   node cli/lib.d/data-model-explorer/test/compare-codesets-contract.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-8 compareCodesets: verdict, totals, refusal' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(`
	MATCH (:ForgedNode {role: 'DmeOptionValue'})-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference) WITH count(m) AS valueTierJudgmentCount
	MATCH (h:HubDefinition) WITH valueTierJudgmentCount, h._source AS hubSource
	MATCH (os:ForgedNode {role: 'DmeOptionSet'}) WHERE toLower(os.name) CONTAINS 'sex' AND os._source <> hubSource
	MATCH (os)-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})
	RETURN valueTierJudgmentCount, count(DISTINCT os) AS matchedOptionSetCount, count(v) AS expectedRowCount`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, expected: rowList[0] });
}));
taskList.push((args, next) => runVerb(['-compareCodesets', 'Sex'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const expectedVerdict = args.expected.valueTierJudgmentCount > 0 ? 'judged' : 'valuesNotJudgedInThisBuild';
	assert(`Sex: verdict '${expectedVerdict}' (the test's own value-tier count is ${args.expected.valueTierJudgmentCount})`, payload.verdict === expectedVerdict && payload.valueTierJudgmentCount === args.expected.valueTierJudgmentCount, JSON.stringify(payload).slice(0, 160));
	assert(`  totalRowCount === ${args.expected.expectedRowCount} and matchedOptionSetCount === ${args.expected.matchedOptionSetCount}`, payload.totalRowCount === args.expected.expectedRowCount && payload.matchedOptionSetCount === args.expected.matchedOptionSetCount, JSON.stringify({ totalRowCount: payload.totalRowCount, matchedOptionSetCount: payload.matchedOptionSetCount }));
	const valueRowList = payload.valueRowList || [];
	assert('  envelope: returnedRowCount === rows, truncatedRowCount === total − returned', Array.isArray(payload.valueRowList) && payload.returnedRowCount === valueRowList.length && payload.truncatedRowCount === payload.totalRowCount - valueRowList.length);
	if (expectedVerdict === 'valuesNotJudgedInThisBuild') assert('  verdictText says null means NOT JUDGED', /NOT JUDGED/.test(payload.verdictText || ''), payload.verdictText);
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-compareCodesets', 'zzznosuchcodeset'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert('zzznosuchcodeset: refusedByName compareCodesets, refusalName noOptionSetMatched', outcome.status === 0 && payload.refusedByName === 'compareCodesets' && payload.refusalName === 'noOptionSetMatched', JSON.stringify(payload).slice(0, 160));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
