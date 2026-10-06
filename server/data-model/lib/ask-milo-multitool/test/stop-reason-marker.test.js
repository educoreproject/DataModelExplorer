'use strict';
// stop-reason-marker.test.js — W-D-21 and W-E-3's askMilo half (campaign P1, 2026-10-06; V2-S29, V2-C35). The tools driver
// treated EVERY non-tool_use stop as a finished answer, so a reply cut off at max_tokens reached the user as if complete,
// and no driver reported why the model stopped. Now every single-call driver returns through lib/stopReason.js
// finalAnswerFor: the answer carries stopReason, and a stop declared in ANSWER_STOP_REASON_MARKER_BY_REASON (max_tokens, the
// tool-iteration limit) sets answerCutOff and appends its marker. The JSON report carries stopReason and answerCutOff and
// refuses by name to format an answer without a stopReason. Hermetic (mock API; no model call).
//
// Run: node server/data-model/lib/ask-milo-multitool/test/stop-reason-marker.test.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const multitoolDirPath = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};
console.log('\n=== W-D-21 / W-E-3: askMilo says why it stopped; a cut-off answer is marked ===\n');

const stopReasonFilePath = path.join(multitoolDirPath, 'lib', 'stopReason.js');
ok('lib/stopReason.js exists', fs.existsSync(stopReasonFilePath));
if (fs.existsSync(stopReasonFilePath)) {
	const { finalAnswerFor, ANSWER_STOP_REASON_MARKER_BY_REASON } = require(stopReasonFilePath);
	const cutAnswer = finalAnswerFor({ responseText: 'partial', cost: { usd: 0 }, stopReason: 'max_tokens' });
	ok('max_tokens → answerCutOff true, stopReason carried, the declared marker appended', cutAnswer.answerCutOff === true && cutAnswer.stopReason === 'max_tokens' && cutAnswer.responseText.endsWith(ANSWER_STOP_REASON_MARKER_BY_REASON.max_tokens), JSON.stringify(cutAnswer));
	const wholeAnswer = finalAnswerFor({ responseText: 'whole', cost: { usd: 0 }, stopReason: 'end_turn' });
	ok('end_turn → answerCutOff false, text unchanged', wholeAnswer.answerCutOff === false && wholeAnswer.responseText === 'whole');
	let missingReasonText = '';
	try { finalAnswerFor({ responseText: 'x', cost: {} }); } catch (reasonError) { missingReasonText = reasonError.message; }
	ok('an answer with no stopReason is refused by name', /stopReason/.test(missingReasonText), missingReasonText);
}
['stages/single-call-tools-direct.mjs', 'stages/single-call-direct.mjs', 'stages/single-call.mjs', 'lib/mockApi.js'].forEach((driverRelativePath) => {
	const driverText = fs.readFileSync(path.join(multitoolDirPath, driverRelativePath), 'utf8');
	ok(`${driverRelativePath}: every single-call answer returns through finalAnswerFor (no bare { responseText, cost })`, /finalAnswerFor\(/.test(driverText) && !/return \{\s*responseText,\s*cost/.test(driverText) && !/return \{\s*\n\s*responseText,\s*\n\s*cost/.test(driverText));
});
const toolsDriverText = fs.readFileSync(path.join(multitoolDirPath, 'stages', 'single-call-tools-direct.mjs'), 'utf8');
ok('the tools driver passes the API stop_reason through finalAnswerFor', /finalAnswerFor\(\{ responseText, cost: totalCost, stopReason: response\.stop_reason \}\)/.test(toolsDriverText));

const mockRun = spawnSync(process.execPath, [path.join(multitoolDirPath, 'askMilo.js')], { input: JSON.stringify({ switches: { mockApi: true, noSave: true, json: true }, values: {}, fileList: ['hello'] }), encoding: 'utf8', timeout: 60000 });
const reportText = mockRun.stdout || '';
const reportJson = (() => { const jsonStart = reportText.indexOf('{'); return jsonStart === -1 ? null : JSON.parse(reportText.slice(jsonStart)); })();
ok('a mock JSON report carries stopReason and answerCutOff', !!reportJson && typeof reportJson.stopReason === 'string' && reportJson.answerCutOff === false, JSON.stringify(reportJson).slice(0, 200));
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
