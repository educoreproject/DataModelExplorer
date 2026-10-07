#!/usr/bin/env node
'use strict';

// standard-filter-refusal.test.js — W-D-2 (campaign P1, 2026-10-06; V2-C06, A5 ruled). A `standard` filter takes a live
// `_source` value. `--standard=SIF` used to answer `[]` with exit 0 — an empty list the model reported as "SIF has no such
// data" — because the graph's SIF is `SIF260928`. Now an unknown value is REFUSED BY NAME with the valid list, read from
// the graph at call time (never a literal); a family name expands only once StandardDefinition.standardFamily exists
// (P3), and until then it is refused like any unknown value. The tool descriptions stop listing standards the graph does
// not hold. ⟪campaign P3⟫ the P3 graph declares its families, so SIF and PESC now EXPAND to their releases (the family
// list is read here by the test's own Cypher), and the refusal cases name standards no family and no _source carries.
//
//   node cli/lib.d/data-model-explorer/test/standard-filter-refusal.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const fs = require('fs');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-2 standard filter: unknown standards are refused by name with the live list' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

// hermetic: descriptions name no absent standard and send the model to dme_list_standards
const providerToolList = JSON.parse(fs.readFileSync(path.join(harness.dmeDirPath, 'provider.json'), 'utf8')).tools.filter((oneTool) => /^dme_/.test(oneTool.definition.name));
const ABSENT_STANDARD_NAME_PATTERN = /\b(CTDL|SEDM|JEDx|EdMatrix|CIP|LIF)\b/;
providerToolList.forEach((oneTool) => {
	const toolText = JSON.stringify(oneTool.definition);
	assert(`${oneTool.definition.name}: names no standard the graph does not hold`, !ABSENT_STANDARD_NAME_PATTERN.test(toolText), (toolText.match(ABSENT_STANDARD_NAME_PATTERN) || [])[0]);
	const standardProperty = oneTool.definition.input_schema.properties.standard;
	if (standardProperty) assert(`${oneTool.definition.name}: its standard input says the value comes from dme_list_standards`, /dme_list_standards/.test(standardProperty.description), standardProperty.description);
});

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery('MATCH (n:ForgedNode) WHERE n._source IS NOT NULL RETURN DISTINCT n._source AS source ORDER BY source', {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, liveSourceList: rowList.map((oneRow) => oneRow.source) });
}));
taskList.push((args, next) => runQuery('MATCH (d:StandardDefinition) WHERE d.standardFamily IS NOT NULL RETURN d.standardFamily AS family, collect(d.sourceKey) AS sourceList ORDER BY family', {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, sourceListByFamily: rowList.reduce((byFamily, oneRow) => ({ ...byFamily, [oneRow.family]: oneRow.sourceList }), {}) });
}));
const REFUSAL_CASE_LIST = [
	{ argumentList: ['-search', 'student birth date', '--standard=CTDL'], verbName: 'search' },
	{ argumentList: ['-explore', '--name=BirthDate', '--standard=SIF2'], verbName: 'explore' },
	{ argumentList: ['-explore', '--name=BirthDate', '--standard=PESC-CollegeTranscript'], verbName: 'explore' },
	{ argumentList: ['-unmappedFields', '--standard=SEDM', '--limit=3'], verbName: 'unmappedFields' },
];
REFUSAL_CASE_LIST.forEach(({ argumentList, verbName }) => taskList.push((args, next) => runVerb(argumentList, (err, outcome) => {
	const refusalObject = outcome.parsedStdout || {};
	assert(`${argumentList.join(' ')} → exit 0, refusedByName '${verbName}', refusalName 'unknownStandard'`, outcome.status === 0 && refusalObject.refusedByName === verbName && refusalObject.refusalName === 'unknownStandard', `exit ${outcome.status}; ${JSON.stringify(outcome.parsedStdout).slice(0, 200)} ${outcome.stderrText.slice(0, 200)}`);
	assert('  validValueList is exactly the live _source list (no null, read at call time)', JSON.stringify(refusalObject.validValueList) === JSON.stringify(args.liveSourceList), JSON.stringify(refusalObject.validValueList));
	next('', args);
}, cliFilePath)));
taskList.push((args, next) => runVerb(['-explore', '--name=BirthDate', '--standard=SIF260928'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const entryList = Array.isArray(payload) ? payload : payload.entryList;
	assert('control: --standard=SIF260928 (a live _source) answers rows, all from SIF260928', outcome.status === 0 && Array.isArray(entryList) && entryList.length > 0 && entryList.every((oneEntry) => oneEntry.node._source === 'SIF260928'), JSON.stringify(payload).slice(0, 200));
	next('', args);
}, cliFilePath));
// a declared family expands to its releases: every row comes from the family, and a multi-release family answers from
// more than one release (a filter that kept only the first release would stay green on SIF alone)
[{ familyName: 'SIF', minimumSourceCount: 1 }, { familyName: 'PESC', minimumSourceCount: 2 }].forEach(({ familyName, minimumSourceCount }) => taskList.push((args, next) => runVerb(['-explore', '--name=BirthDate', `--standard=${familyName}`], (err, outcome) => {
	const familySourceList = args.sourceListByFamily[familyName] || [];
	const entryList = (outcome.parsedStdout || {}).entryList;
	const answeredSourceList = Array.isArray(entryList) ? [...new Set(entryList.map((oneEntry) => oneEntry.node._source))] : [];
	assert(`family ${familyName} is declared (${familySourceList.join(', ')})`, familySourceList.length > 0);
	assert(`--standard=${familyName} expands: rows, every one from the family, from at least ${minimumSourceCount} release(s)`, outcome.status === 0 && Array.isArray(entryList) && entryList.length > 0 && answeredSourceList.every((oneSource) => familySourceList.indexOf(oneSource) !== -1) && answeredSourceList.length >= minimumSourceCount, `${answeredSourceList.join(', ')} ${JSON.stringify(outcome.parsedStdout).slice(0, 160)}`);
	next('', args);
}, cliFilePath)));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
