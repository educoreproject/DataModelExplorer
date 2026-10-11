'use strict';
// promptIsText.test.js — W-E-4 (X3, campaign P0, 2026-10-06). A positional argument is ALWAYS the question text; a file
// is read only through --promptFile. Until 2026-10-06 askMilo read a single positional that named an existing file AS
// that file, and the Slack relay hands the user's text over as exactly that positional: a Slack user who typed a server
// path received the file's contents as the "answer" (measured: the mock run returned a host file's body as its prompt).
//
// The gate never reads a real system file: it writes a SENTINEL file in a temp directory and asks about its path.
// askMilo runs with -mockApi (canned response, no API call, no save).
//
//   node server/data-model/lib/ask-milo-multitool/test/promptIsText.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const askMiloPath = path.join(__dirname, '..', 'askMilo.js');
const SENTINEL_TEXT = 'P0_PROMPT_IS_TEXT_SENTINEL_FILE_BODY';

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'askMiloPromptIsText-'));
const sentinelFilePath = path.join(scratchDir, 'sentinel.txt');
fs.writeFileSync(sentinelFilePath, `${SENTINEL_TEXT}\n`);

const runAskMilo = (askMiloInput) => {
	const run = spawnSync(process.execPath, [askMiloPath], { input: JSON.stringify(askMiloInput), encoding: 'utf8', timeout: 60000 });
	const reportText = run.stdout || '';
	const reportJson = (() => { const jsonStart = reportText.indexOf('{'); return jsonStart === -1 ? null : JSON.parse(reportText.slice(jsonStart)); })();
	return { status: run.status, reportJson, stderrText: run.stderr || '' };
};

console.log('\n=== W-E-4: a positional argument is the question, never a file ===\n');

const positionalRun = runAskMilo({ switches: { mockApi: true, noSave: true, json: true }, values: {}, fileList: [sentinelFilePath] });
ok('a mock run whose only positional is an existing file path exits 0', positionalRun.status === 0, positionalRun.stderrText.slice(-200));
ok('  and its prompt IS that path, verbatim', positionalRun.reportJson && positionalRun.reportJson.prompt === sentinelFilePath, positionalRun.reportJson && JSON.stringify(positionalRun.reportJson.prompt).slice(0, 120));
ok('  and the file\'s body appears nowhere in the report', !(JSON.stringify(positionalRun.reportJson || {}) + positionalRun.stderrText).includes(SENTINEL_TEXT));

const promptFileRun = runAskMilo({ switches: { mockApi: true, noSave: true, json: true }, values: { promptFile: [sentinelFilePath] }, fileList: [] });
ok('--promptFile, the ONE named route, still reads the file', promptFileRun.reportJson && typeof promptFileRun.reportJson.prompt === 'string' && promptFileRun.reportJson.prompt.includes(SENTINEL_TEXT), promptFileRun.stderrText.slice(-200));

const helpRun = spawnSync(process.execPath, [askMiloPath, '-help'], { encoding: 'utf8', timeout: 30000 });
const helpText = `${helpRun.stdout}${helpRun.stderr}`;
ok('-help says a positional argument is always literal text', /a positional argument is always literal text/.test(helpText));
ok('  and no longer advertises "askMilo [options] /path/to/prompt-file.txt"', !/askMilo \[options\] \/path\/to\/prompt-file\.txt/.test(helpText));

// the Slack relay half: the input it hands askMilo carries the user's text as the one positional and NO promptFile
process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {} }, getConfig: () => ({}), rawConfig: {}, commandLineParameters: { switches: {}, values: {} } };
const relay = require(path.join(__dirname, '..', '..', 'slack-instance', 'ask-milo-relay'))({ unused: true });
const relayInput = relay.askMiloInputFor ? relay.askMiloInputFor({ question: sentinelFilePath, askPromptName: 'DataModelExplorerSlack' }) : null;
ok('the relay composes askMilo\'s input in one exported function (askMiloInputFor)', relayInput !== null);
ok('  whose ONE positional is the Slack text, verbatim', relayInput && JSON.stringify(relayInput.fileList) === JSON.stringify([sentinelFilePath]));
ok('  and which carries NO promptFile (a Slack user can never name a file)', relayInput && relayInput.values && relayInput.values.promptFile === undefined);

fs.rmSync(scratchDir, { recursive: true, force: true });
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
