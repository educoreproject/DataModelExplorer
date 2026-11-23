'use strict';
// outgoing-connect-window.test.js — gate for WORKORDER-accountMailLooseEnds-112326 E7: every educore Node process that
// calls out uses the one connect window (lib/outgoing-connect-window.js), not only the API server.
//
//   W1 askMilo started by hand (no window in NODE_OPTIONS) applies the [email-sender] settings default itself
//   W2 askMilo started the way ws-graphinator starts it, after the server applied a CONFIGURED window, reports that
//      window, inherited
//   W3 any other Node process the server starts (the educoreForge CLIs, the DME tools askMilo runs) has it too
//   W4 NODE_OPTIONS keeps its other options and carries exactly one copy of the flag, however often it is applied
//   W5 a bad window: the helper throws by name; email-sender refuses a bad setting by name and changes nothing
//   W6 the server's spawns of Node processes hand the child the server's environment (else W2 and W3 would not hold)
//
// Run: node server/test/outgoing-connect-window.test.js

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const serverPath = path.join(__dirname, '..');
const askMiloScriptPath = path.join(serverPath, 'data-model', 'lib', 'ask-milo-multitool', 'askMilo.js');
const { applyOutgoingConnectWindow, nodeOptionsWindowOf, CONNECT_WINDOW_NODE_FLAG_NAME } = require(path.join(serverPath, 'lib', 'outgoing-connect-window'));
const { applyConnectAttemptTimeout } = require(path.join(serverPath, 'lib', 'email-sender'));
const { settingDefaultByName } = require(path.join(serverPath, 'lib', 'email-sender-settings.json'));

const CONFIGURED_WINDOW_MILLISECONDS = 1700;

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};
const reportOf = (stdoutText) => {
	const reportLine = String(stdoutText || '').trim().split('\n').pop() || '';
	return /^\{/.test(reportLine) ? JSON.parse(reportLine).outgoingConnectWindow || {} : {};
};
const envWithoutWindowOf = () => {
	const childEnv = { ...process.env };
	childEnv.NODE_OPTIONS = String(childEnv.NODE_OPTIONS || '').replace(new RegExp(`${CONNECT_WINDOW_NODE_FLAG_NAME}=\\S*`, 'g'), '').trim();
	return childEnv;
};

// W1
const byHand = spawnSync(process.execPath, [askMiloScriptPath, '-connectWindow'], { encoding: 'utf8', env: envWithoutWindowOf(), timeout: 30000 });
const byHandReport = reportOf(byHand.stdout);
check(`W1 askMilo by hand applies the settings default (${settingDefaultByName.connectAttemptTimeoutMilliseconds} ms) itself`, byHandReport.appliedMilliseconds === settingDefaultByName.connectAttemptTimeoutMilliseconds && byHandReport.sourceName === 'settingsDefault', `${byHand.stdout} ${byHand.stderr}`);

// W4, W5 (before the server-side apply below, on this test's own process)
process.env.NODE_OPTIONS = `--max-old-space-size=512 ${CONNECT_WINDOW_NODE_FLAG_NAME}=300`;
applyOutgoingConnectWindow(900);
applyOutgoingConnectWindow(950);
const flagCount = (process.env.NODE_OPTIONS.match(new RegExp(CONNECT_WINDOW_NODE_FLAG_NAME, 'g')) || []).length;
check('W4 NODE_OPTIONS keeps its other options and carries exactly one copy of the flag', /--max-old-space-size=512/.test(process.env.NODE_OPTIONS) && flagCount === 1 && nodeOptionsWindowOf(process.env.NODE_OPTIONS) === 950 && net.getDefaultAutoSelectFamilyAttemptTimeout() === 950, process.env.NODE_OPTIONS);
const thrownText = ((attempt) => {
	const outcome = { text: '' };
	try {
		attempt();
	} catch (thrownError) {
		outcome.text = thrownError.message;
	}
	return outcome.text;
})(() => applyOutgoingConnectWindow(5));
check('W5 a window under 10 ms throws by name and changes nothing', /applyOutgoingConnectWindow: the window must be a whole number/.test(thrownText) && nodeOptionsWindowOf(process.env.NODE_OPTIONS) === 950 && net.getDefaultAutoSelectFamilyAttemptTimeout() === 950, thrownText);
const refusedApplied = applyConnectAttemptTimeout({ connectAttemptTimeoutMilliseconds: 'fast' });
check('W5 email-sender refuses a bad setting by name (emailSettingNotValid) and NODE_OPTIONS is unchanged', /^emailSettingNotValid: .*connectAttemptTimeoutMilliseconds/.test(refusedApplied.connectRefusal) && nodeOptionsWindowOf(process.env.NODE_OPTIONS) === 950, JSON.stringify(refusedApplied));

// the server's start: a configured window, applied as data-model.js applies it
process.env.NODE_OPTIONS = '';
const serverApplied = applyConnectAttemptTimeout({ connectAttemptTimeoutMilliseconds: String(CONFIGURED_WINDOW_MILLISECONDS) });
check(`W2 setup: the server applied the configured ${CONFIGURED_WINDOW_MILLISECONDS} ms window`, !serverApplied.connectRefusal && serverApplied.appliedMilliseconds === CONFIGURED_WINDOW_MILLISECONDS, JSON.stringify(serverApplied));

// W3
const otherChild = spawnSync(process.execPath, ['-e', "process.stdout.write(String(require('net').getDefaultAutoSelectFamilyAttemptTimeout()))"], { encoding: 'utf8', env: { ...process.env }, timeout: 30000 });
check(`W3 another Node process the server starts has the ${CONFIGURED_WINDOW_MILLISECONDS} ms window before its code runs`, otherChild.stdout === String(CONFIGURED_WINDOW_MILLISECONDS), `${otherChild.stdout} ${otherChild.stderr}`);

// W6
[
	['lib/ws-graphinator.js', /spawn\(askMiloCommand, \[\], \{ shell: true, env: process\.env \}\)/, /env: \{ \.\.\.process\.env, \.\.\.askmiloUserEnv \}/],
	['data-model/lib/slack-instance/ask-milo-relay.js', /spawn\(process\.execPath, \[askMiloJsPath\], \{\s*env: process\.env,/],
	['lib/educoreforge-cli-bridge.js', /\{ env: \{ \.\.\.process\.env \}, timeout, maxBuffer \}/],
	// askMilo's tool runner (the DME CLIs) passes no env, so Node hands the child askMilo's own environment
	['data-model/lib/ask-milo-multitool/lib/toolHandler.js', /execFile\(executable, args, \{ timeout, maxBuffer: 1024 \* 1024, cwd: cwd \|\| undefined \}/],
].forEach(([relativePath, ...patternList]) => {
	const sourceText = fs.readFileSync(path.join(serverPath, relativePath), 'utf8');
	check(`W6 ${relativePath} starts its Node processes with the server's environment`, patternList.every((sourcePattern) => sourcePattern.test(sourceText)));
});

// W2: exactly as ws-graphinator starts askMilo (its askMiloCommand, shell: true, env: process.env)
const askMiloCommand = `"${process.execPath}" "${askMiloScriptPath}"`;
const askMiloChild = spawn(`${askMiloCommand} -connectWindow`, [], { shell: true, env: process.env });
const stdoutChunkList = [];
const stderrChunkList = [];
askMiloChild.stdout.on('data', (chunk) => stdoutChunkList.push(chunk));
askMiloChild.stderr.on('data', (chunk) => stderrChunkList.push(chunk));
askMiloChild.on('close', () => {
	const inheritedReport = reportOf(Buffer.concat(stdoutChunkList).toString('utf8'));
	check(`W2 askMilo started as ws-graphinator starts it reports the server's ${CONFIGURED_WINDOW_MILLISECONDS} ms window, inherited`, inheritedReport.appliedMilliseconds === CONFIGURED_WINDOW_MILLISECONDS && inheritedReport.sourceName === 'inherited', `${Buffer.concat(stdoutChunkList)} ${Buffer.concat(stderrChunkList)}`);
	const failedCount = resultList.filter((passed) => !passed).length;
	console.log(`outgoing-connect-window: ${resultList.length - failedCount} passed, ${failedCount} failed`);
	process.exit(failedCount ? 1 : 0);
});
