#!/usr/bin/env node
'use strict';

// apoc-text-allowlist-live.test.js — lane GREP (2026-10-11), live on the graph dataModelExplorerSearch.ini points at.
// The read-only validator allows seven pure apoc.text functions BY NAME (server/lib/cypher-validator-rules.js
// APOC_PURE_TEXT_FUNCTION_NAME_LIST). That list is typed by hand in this repository, beside the one educoreForge launches
// every graph with (replayManager APOC_PURE_TEXT_FUNCTION_NAME_LIST); it is not read from graphContract.json because adding it
// there changes the contract's sha and every gold's passport would refuse until rebuilt (DEVLOG-GREP §2). So this gate
// holds the two equal the only way that cannot drift: against what the live graph actually LOADS.
//   (a) the apoc.* functions the graph loads (SHOW FUNCTIONS) are exactly the validator's list — no more, no fewer
//   (b) -rawCypher runs each allowed function, by name and with a backtick-quoted namespace segment
//   (c) -rawCypher still refuses (notReadOnly) a blocked function carried inside an allowed one, hidden by a backtick or by
//       spaces around its dots — before any Cypher runs
//
//   node cli/lib.d/data-model-explorer/test/apoc-text-allowlist-live.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'lane GREP apoc.text allow-list (validator list = the graph\'s loaded functions)' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];
// the rules of the tree whose CLI runs (a twin run on another tree reads that tree's list)
const validatorRules = require(path.join(path.dirname(cliFilePath || path.join(harness.dmeDirPath, 'dataModelExplorerSearch.js')), '..', '..', '..', 'server', 'lib', 'cypher-validator-rules'));
const allowedFunctionNameList = validatorRules.APOC_PURE_TEXT_FUNCTION_NAME_LIST || [];

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery("SHOW FUNCTIONS YIELD name WHERE name STARTS WITH 'apoc.' RETURN name ORDER BY name", {}, (err, rowList) => {
	const loadedNameList = (rowList || []).map((oneRow) => oneRow.name);
	assert('(a) the apoc functions the live graph loads are exactly the validator\'s allow-list', !err && loadedNameList.length > 0 && JSON.stringify(loadedNameList) === JSON.stringify(allowedFunctionNameList.slice().sort()), `${err || ''} graph: ${JSON.stringify(loadedNameList)} validator: ${JSON.stringify(allowedFunctionNameList)}`);
	next('', args);
}));
taskList.push((args, next) => {
	// apoc.text.clean takes one string; the other six compare two
	const callText = allowedFunctionNameList.map((functionName, functionIndex) => `${functionName}(${functionName === 'apoc.text.clean' ? "'BrithDate'" : "'BrithDate', 'BirthDate'"}) AS result${functionIndex}`).join(', ');
	runVerb(['-rawCypher', `--query=RETURN ${callText || 'apoc.text.clean(\'x\') AS result0'}, apoc.\`text\`.clean('Birth Date') AS quotedSegmentResult`], (err, outcome) => {
		const recordRow = ((outcome.parsedStdout || {}).records || [])[0] || {};
		assert('(b) -rawCypher runs every allowed function, and one spelled with a backtick-quoted namespace segment', outcome.status === 0 && allowedFunctionNameList.length === 7 && allowedFunctionNameList.every((functionName, functionIndex) => recordRow[`result${functionIndex}`] !== undefined && recordRow[`result${functionIndex}`] !== null) && recordRow.quotedSegmentResult === 'birthdate', `${JSON.stringify(outcome.parsedStdout).slice(0, 300)} ${outcome.stderrText.slice(0, 200)}`);
		next('', args);
	}, cliFilePath);
});
[
	['an allowed call carrying a blocked one', 'RETURN apoc.text.clean(apoc.cypher.runFirstColumnSingle("RETURN 1", {})) AS v'],
	['a backtick-quoted namespace segment', 'RETURN `apoc`.cypher.runFirstColumnSingle("RETURN 1", {}) AS v'],
	['spaces around the dots', 'RETURN apoc . cypher . runFirstColumnSingle("RETURN 1", {}) AS v'],
].forEach(([caseText, cypherText]) => taskList.push((args, next) => runVerb(['-rawCypher', `--query=${cypherText}`], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert(`(c) -rawCypher refuses a blocked function hidden by ${caseText} (notReadOnly, exit 0)`, outcome.status === 0 && payload.refusalName === 'notReadOnly' && /apoc\.cypher\.runFirstColumnSingle/.test(payload.reason || ''), JSON.stringify(payload).slice(0, 240));
	next('', args);
}, cliFilePath)));

pipeRunner(taskList.getList(), {}, (err) => finish(err));
