'use strict';
// dme-slack-relay.test.js — W-E-3 (campaign P1, 2026-10-06; V2-C35). The relay handed Slack askMilo's whole TEXT report —
// '====' banner, 'askMilo -- <prompt>', the 'PROMPT:' echo — and a reply cut off at the output limit as if finished (the
// live ask test stripped the banner before asserting, so it could not see either). The relay now asks for askMilo's JSON
// report and answers its `response`, its stopReason and answerCutOff; non-JSON output is a failure by name; the Slack
// blocks say when an answer was cut off. Hermetic: the relay spawns STUB askMilo scripts (askMiloJsPathOverride), no model.
//
// Run: node server/test/dme-slack-relay.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');

process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} }, getConfig: () => ({}), rawConfig: {}, commandLineParameters: { switches: {}, values: {} } };

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};
console.log('\n=== W-E-3: the Slack relay answers askMilo\'s response, not its report; a cut-off answer is marked ===\n');

const stubDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'dmeSlackRelayStub-'));
const writeStub = (stubName, stdoutText) => {
	const stubFilePath = path.join(stubDirPath, `${stubName}.js`);
	fs.writeFileSync(stubFilePath, `process.stdin.resume(); let inputText = ''; process.stdin.on('data', (chunk) => { inputText += chunk; }); process.stdin.on('end', () => { require('fs').writeFileSync(${JSON.stringify(path.join(stubDirPath, `${stubName}.input.json`))}, inputText); process.stdout.write(${JSON.stringify(stdoutText)}); process.stderr.write('Cost: $0.0100 (1 input / 2 output)\\n'); });\n`);
	return stubFilePath;
};
const reportTextFor = (stopReason, answerCutOff) => JSON.stringify({ mode: 'singleCall', promptName: 'DataModelExplorerSlack', prompt: 'hello', response: '*re: hello*\nthe answer', stopReason, answerCutOff, model: 'opus', cost: { usd: 0.01 }, elapsedSeconds: 1 }, null, 2);
const relayFactory = require('../data-model/lib/slack-instance/ask-milo-relay');
const askWith = (stubFilePath, callback) => {
	const relay = relayFactory({ unused: true, askMiloJsPathOverride: stubFilePath });
	relay.askQuestion({ question: 'hello', slackUserId: 'U0RELAY', timeoutSeconds: 30, maxConcurrent: 2, maxPerUser: 1, askPromptName: 'DataModelExplorerSlack' }, callback);
};

const cutStubFilePath = writeStub('cutOff', reportTextFor('max_tokens', true));
const wholeStubFilePath = writeStub('whole', reportTextFor('end_turn', false));
const textStubFilePath = writeStub('textReport', '================\naskMilo -- x\n================\n\nPROMPT: hello\n\nthe answer\n');

askWith(cutStubFilePath, (cutError, cutResult) => {
	ok('max_tokens report → answerText is the response alone (no ==== banner, no PROMPT: echo)', !cutError && cutResult.answerText === '*re: hello*\nthe answer', cutError || JSON.stringify(cutResult.answerText));
	ok('  and answerCutOff true, stopReason max_tokens', cutResult && cutResult.answerCutOff === true && cutResult.stopReason === 'max_tokens');
	const inputJson = JSON.parse(fs.readFileSync(path.join(stubDirPath, 'cutOff.input.json'), 'utf8'));
	ok('  the relay asked askMilo for its JSON report (switches.json)', inputJson.switches && inputJson.switches.json === true);
	askWith(wholeStubFilePath, (wholeError, wholeResult) => {
		ok('end_turn report → answerCutOff false', !wholeError && wholeResult.answerCutOff === false && wholeResult.stopReason === 'end_turn', wholeError);
		askWith(textStubFilePath, (textError, textResult) => {
			ok('a non-JSON report is a failure by name, never relayed as an answer', !textError && textResult.failed === true && /non-JSON/.test(textResult.failureReason || '') && textResult.answerText === undefined, JSON.stringify(textResult).slice(0, 200));
			let overrideRefusalText = '';
			try { relayFactory({ unused: true, askMiloJsPathOverride: path.join(stubDirPath, 'absent.js') }); } catch (overrideError) { overrideRefusalText = overrideError.message; }
			ok('an askMiloJsPathOverride that is not an existing file is refused by name', /askMiloJsPathOverride/.test(overrideRefusalText), overrideRefusalText);

			const dataMapping = require('../data-model/data-mapping/data-mapping')({ pwHash: (x) => x, hashPassword: (x) => x, verifyPassword: () => true, validatePasswordStrength: () => ({ valid: true }) });
			const askBlockText = JSON.stringify(dataMapping['dme-slack'].buildAskAnswerBlocks({ question: 'hello', answerText: 'partial', dmeBaseUrl: 'https://qbook.work', answerCutOff: true }));
			ok('Slack blocks for a cut-off answer say so', /cut off at the model.s output limit/.test(askBlockText), askBlockText.slice(0, 200));
			const wholeBlockText = JSON.stringify(dataMapping['dme-slack'].buildAskAnswerBlocks({ question: 'hello', answerText: 'whole', dmeBaseUrl: 'https://qbook.work', answerCutOff: false }));
			ok('  and a whole answer does not', !/cut off/.test(wholeBlockText));
			fs.rmSync(stubDirPath, { recursive: true, force: true });
			console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
			process.exit(failed > 0 ? 1 : 0);
		});
	});
});
