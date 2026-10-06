#!/usr/bin/env node
'use strict';

// list-standards-contract.test.js — W-D-13 and PLAN A4 edits 3-4 (campaign P1, 2026-10-06; V2-C15 DME half). askMilo said
// "PESC is loaded as six separate documents" and then listed seven: it counted a list itself. dme_list_standards now
// answers its own totals — standardCount, and familyList ([{family, releaseCount, sourceList}]) counted by the tool's own
// query from StandardDefinition.standardFamily. Today no definition carries standardFamily (the forges stamp it in P3), so
// familyList is [] with familyNote — a family is NEVER derived from a _source prefix. Every number is the test's Cypher.
//
//   node cli/lib.d/data-model-explorer/test/list-standards-contract.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-13 dme_list_standards totals and familyList' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(`MATCH (r:DmeStandardRoot) WITH count(r) AS standardCount
	OPTIONAL MATCH (d:StandardDefinition) WHERE d.standardFamily IS NOT NULL
	WITH standardCount, d.standardFamily AS family, count(d) AS releaseCount
	RETURN standardCount, collect(CASE WHEN family IS NULL THEN null ELSE {family: family, releaseCount: releaseCount} END) AS familyCountList`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, expected: rowList[0] });
}));
taskList.push((args, next) => runVerb(['-listStandards'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const totals = payload.totals || {};
	assert(`totals.standardCount === ${args.expected.standardCount} (the test's count of :DmeStandardRoot)`, totals.standardCount === args.expected.standardCount, JSON.stringify(totals).slice(0, 160));
	assert('  count === standards.length === totals.standardCount', payload.count === (payload.standards || []).length && payload.count === totals.standardCount);
	if (args.expected.familyCountList.length === 0) {
		assert('  no definition carries standardFamily: familyList [], familyFieldPresent false, familyNote present (no prefix inference)', Array.isArray(totals.familyList) && totals.familyList.length === 0 && totals.familyFieldPresent === false && typeof totals.familyNote === 'string', JSON.stringify(totals));
	} else {
		const releaseTotal = (totals.familyList || []).reduce((runningTotal, oneFamily) => runningTotal + oneFamily.releaseCount, 0);
		assert('  familyFieldPresent: each family\'s releaseCount equals the test\'s count; Σ releaseCount === standardCount', totals.familyFieldPresent === true && releaseTotal === totals.standardCount && args.expected.familyCountList.every((oneFamily) => (totals.familyList.find((listedFamily) => listedFamily.family === oneFamily.family) || {}).releaseCount === oneFamily.releaseCount), JSON.stringify(totals.familyList));
	}
	assert('  each standard row carries standardKey, standardFamily and releaseLabel fields', (payload.standards || []).length > 0 && payload.standards.every((oneStandard) => ['standardKey', 'standardFamily', 'releaseLabel'].every((fieldName) => fieldName in oneStandard)));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
