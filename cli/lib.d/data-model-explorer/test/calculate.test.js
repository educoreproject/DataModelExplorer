#!/usr/bin/env node
'use strict';

// calculate.test.js — A14 (ruled 2026-10-06: dme_calculate plus the numbers rule now, dmeKit later; campaign P1). askMilo
// has no way to compute but its own head, and it miscounted (six PESC documents, then seven listed). dme_calculate does
// count / sum / average / minimum / maximum / difference / ratio / percent over numbers the model holds; a bad
// operation, a malformed number, a wrong arity or a zero denominator is refused by name. Graphless: no session opens.
// The provider tool's operation enum equals the declared operations.
//
//   node cli/lib.d/data-model-explorer/test/calculate.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const dmeDirPath = path.join(__dirname, '..');
const cliFilePath = process.argv[2] || path.join(dmeDirPath, 'dataModelExplorerSearch.js');

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};
const runCalculate = (argumentList) => {
	const run = spawnSync(process.execPath, [cliFilePath, '-calculate', ...argumentList], { encoding: 'utf8', timeout: 30000 });
	let parsedStdout = null;
	try { parsedStdout = JSON.parse(run.stdout); } catch (parseError) { parsedStdout = null; }
	return { status: run.status, payload: parsedStdout || {}, stderrText: run.stderr || '' };
};
console.log('\n=== A14 dme_calculate ===\n');

const RESULT_CASE_LIST = [
	{ argumentList: ['--operation=percent', '--numberList=1117,1904'], expectedResult: (1117 / 1904) * 100, expectedRounded: 58.67 },
	{ argumentList: ['--operation=sum', '--numberList=2324,1904,5018'], expectedResult: 9246 },
	{ argumentList: ['--operation=count', '--numberList=3,3,3,3,3,3,3'], expectedResult: 7 },
	{ argumentList: ['--operation=average', '--numberList=1,2,3,4'], expectedResult: 2.5 },
	{ argumentList: ['--operation=minimum', '--numberList=-2,5,0.5'], expectedResult: -2 },
	{ argumentList: ['--operation=maximum', '--numberList=-2,5,0.5'], expectedResult: 5 },
	{ argumentList: ['--operation=difference', '--numberList=18585,2324'], expectedResult: 16261 },
	{ argumentList: ['--operation=ratio', '--numberList=5420,16261'], expectedResult: 5420 / 16261 },
];
RESULT_CASE_LIST.forEach(({ argumentList, expectedResult, expectedRounded }) => {
	const outcome = runCalculate(argumentList);
	assert(`${argumentList.join(' ')} → result ${expectedResult}`, outcome.status === 0 && outcome.payload.result === expectedResult && (expectedRounded === undefined || outcome.payload.resultRoundedToTwoDecimals === expectedRounded), `exit ${outcome.status}; ${JSON.stringify(outcome.payload)} ${outcome.stderrText.slice(0, 120)}`);
});
const REFUSAL_CASE_LIST = [
	{ argumentList: ['--operation=median', '--numberList=1,2'], refusalName: 'unknownOperation' },
	{ argumentList: ['--operation=sum', '--numberList=1,117,x'], refusalName: 'invalidNumberList' },
	{ argumentList: ['--operation=sum', '--numberList=12%'], refusalName: 'invalidNumberList' },
	{ argumentList: ['--operation=percent', '--numberList=1,2,3'], refusalName: 'invalidNumberList' },
	{ argumentList: ['--operation=ratio', '--numberList=4,0'], refusalName: 'divisionByZero' },
	{ argumentList: ['--operation=sum', '--numberList='], refusalName: 'emptyNumberList' },
	{ argumentList: ['--operation=sum'], refusalName: 'emptyNumberList' },
];
REFUSAL_CASE_LIST.forEach(({ argumentList, refusalName }) => {
	const outcome = runCalculate(argumentList);
	assert(`${argumentList.join(' ')} → refused: ${refusalName}`, outcome.status === 0 && outcome.payload.refusedByName === 'calculate' && outcome.payload.refusalName === refusalName, `exit ${outcome.status}; ${JSON.stringify(outcome.payload).slice(0, 160)} ${outcome.stderrText.slice(0, 120)}`);
});
const { CALCULATE_OPERATION_ARITY_BY_NAME } = require(path.join(dmeDirPath, 'lib', 'toolPayloadContract'));
const calculateTool = JSON.parse(fs.readFileSync(path.join(dmeDirPath, 'provider.json'), 'utf8')).tools.find((oneTool) => oneTool.definition.name === 'dme_calculate');
assert('provider dme_calculate exists and its operation enum equals the declared operations', !!calculateTool && !!CALCULATE_OPERATION_ARITY_BY_NAME && JSON.stringify([...calculateTool.definition.input_schema.properties.operation.enum].sort()) === JSON.stringify(Object.keys(CALCULATE_OPERATION_ARITY_BY_NAME).sort()));
console.log(`\n=== A14 dme_calculate — Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
