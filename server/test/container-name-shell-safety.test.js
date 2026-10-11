'use strict';
// container-name-shell-safety.test.js — W-E-12 mechanics (X4, campaign P0, 2026-10-06): docker is invoked with
// ARGUMENT ARRAYS (execFile / execFileSync / spawn), never a shell string, and a container name that is not a plain
// docker name is refused BY NAME before docker is called. Until 2026-10-06 container-connection-resolver.js and
// clone-manager.js interpolated names into `docker ...` shell strings (names come from config and the server today,
// so exploitability was low; the shape was the defect).
//
// BEHAVIOURAL half: resolveContainerConnection with shell metacharacters must not run them (a marker file must not
// appear) and must refuse by name. STRUCTURAL half (declared as such): neither module calls execSync/exec with a
// template or a composed command string.
//
//   node server/test/container-name-shell-safety.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

console.log('\n=== W-E-12: docker by argument array; container names refused by name ===\n');

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'containerNameShellSafety-'));
const markerPathA = path.join(scratchDir, 'pwnedBySemicolon');
const markerPathB = path.join(scratchDir, 'pwnedBySubstitution');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');

const semicolonAnswer = resolveContainerConnection(`x; touch ${markerPathA}`);
ok('a name carrying "; touch <marker>" runs NOTHING (no marker file)', !fs.existsSync(markerPathA));
ok('  and is refused BY NAME as not a container name', /is not a valid docker container name/.test(semicolonAnswer.error || ''), semicolonAnswer.error);
const substitutionAnswer = resolveContainerConnection(`$(touch ${markerPathB})`);
ok('a name carrying "$(touch <marker>)" runs NOTHING', !fs.existsSync(markerPathB));
ok('  and is refused BY NAME', /is not a valid docker container name/.test(substitutionAnswer.error || ''), substitutionAnswer.error);
const absentAnswer = resolveContainerConnection('DEV_P0_noSuchContainer_shellSafety');
ok('a plain name that is not a container still answers its ordinary refusal (the guard is not refusing everything)', absentAnswer.errorName === 'containerAbsent' && /there is no container named/.test(absentAnswer.error || ''), absentAnswer.error);

const shellStringCallPattern = /\b(execSync|exec)\(\s*(`|[a-zA-Z_][a-zA-Z0-9_]*Cmd\b|'docker|"docker)/;
['data-model/lib/user-graph/container-connection-resolver.js', 'data-model/lib/user-graph/clone-manager.js'].forEach((relativePath) => {
	const sourceText = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
	const offendingLineList = sourceText.split('\n').map((oneLine, lineIndex) => ({ oneLine, lineNumber: lineIndex + 1 })).filter(({ oneLine }) => shellStringCallPattern.test(oneLine) && !/^\s*\/\//.test(oneLine));
	ok(`STRUCTURAL: ${path.basename(relativePath)} invokes no shell string (execSync/exec with a template or a composed command)`, offendingLineList.length === 0, offendingLineList.map(({ lineNumber, oneLine }) => `${lineNumber}: ${oneLine.trim().slice(0, 90)}`).join(' | '));
});

fs.rmSync(scratchDir, { recursive: true, force: true });
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
