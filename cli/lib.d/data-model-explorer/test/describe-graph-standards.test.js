#!/usr/bin/env node
'use strict';

// describe-graph-standards.test.js — W-D-15 (campaign P1, 2026-10-06; V2-C16, V2-S09/S15). describeGraph's standards read
// coalesced two vocabularies (`source: coalesce(d.source, d.standardKey)`), so the card printed the forge token
// `pesccollegetranscript1v8v0` where every filter takes `PESC-CollegeTranscript-1.8.0`; the model read the card and then
// filtered with the wrong word. The read is now CONTRACTS §5's STANDARD_DEFINITION_FIELD_LIST verbatim (read from the
// shipped graphContract.json), no coalesce, no reader-only names; the card prints sourceKey first and the token in
// parentheses. (This gate covers W-D-15's hunk only: the passport/recipe/ancestry reads are V2-C01..C03, P2.)
//
//   node cli/lib.d/data-model-explorer/test/describe-graph-standards.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const fs = require('fs');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-15 describeGraph reads StandardDefinition by §5, prints _source' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];
const standardDefinitionFieldList = JSON.parse(fs.readFileSync(path.join(harness.dmeDirPath, 'contract', 'graphContract.json'), 'utf8')).standardDefinitionFieldList;
const describeGraphText = fs.readFileSync(path.join(harness.dmeDirPath, 'lib', 'describeGraph.js'), 'utf8');
assert('describeGraph.js coalesces no second vocabulary into the standards read', !/coalesce\(d\.(source|displayName)/.test(describeGraphText));

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery('MATCH (n:ForgedNode) WHERE n._source IS NOT NULL RETURN DISTINCT n._source AS source ORDER BY source', {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, liveSourceList: rowList.map((oneRow) => oneRow.source) });
}));
taskList.push((args, next) => runVerb(['-describeGraph'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const standardList = payload.standards || [];
	const sortedText = (oneList) => JSON.stringify([...oneList].sort());
	const declaredNameText = sortedText(standardDefinitionFieldList.map((oneField) => oneField.name));
	assert(`every standards[i] has exactly the §5 field names (${standardDefinitionFieldList.length})`, standardList.length > 0 && standardList.every((oneStandard) => sortedText(Object.keys(oneStandard)) === declaredNameText), standardList[0] ? sortedText(Object.keys(standardList[0])) : 'none');
	assert('  every sourceKey is a live _source value (the filter vocabulary)', standardList.length > 0 && standardList.every((oneStandard) => args.liveSourceList.includes(oneStandard.sourceKey)), JSON.stringify(standardList.map((oneStandard) => oneStandard.sourceKey)));
	const pescLine = (payload.card || '').split('\n').find((lineText) => /PESC-CollegeTranscript-1\.8\.0/.test(lineText));
	assert('  the card line for PESC CT names PESC-CollegeTranscript-1.8.0 with the token in parentheses', !!pescLine && /\(pesccollegetranscript1v8v0\)/.test(pescLine), pescLine);
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
