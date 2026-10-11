'use strict';
// config-secrets-owner-only.test.js — X4 (campaign P4b; ruled by VIOLET_VALLEY with TQ's approval, 2026-10-06): the .ini
// configs are the ONE home for secrets, every secrets-bearing config file is readable by its owner only (mode 600), and
// no secret lives in a data table or a shared repo. This gate holds the first rule on THIS machine's configs tree
// (codeRoot/../configs): every .ini that assigns a value to a secret-named key must carry no group or other permission
// bit. It prints file paths and modes only — never a key's value.
//   RED TWIN (in-memory): a secrets-bearing file reported at mode 644 -> red.
//
// Run: node server/test/config-secrets-owner-only.test.js

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

// a secret-named key with a value: apiKey / ...ApiKey / ...Password / password / secret / ...Secret / token / ...Token /
// apiToken. `apiKeyEnvironmentVariableName` names an environment variable, not a secret, so a key must END in the word.
const SECRET_ASSIGNMENT_PATTERN = /^[ \t]*[A-Za-z0-9_.]*(?:[Aa]pi[Kk]ey|[Pp]assword|[Ss]ecret|[Aa]pi[Tt]oken|[Bb]ot[Tt]oken)[ \t]*=[ \t]*[^\s;<]/m;
const GROUP_OR_OTHER_PERMISSION_MASK = 0o077;

const configsRootPath = path.join(__dirname, '..', '..', '..', 'configs');
if (!fs.existsSync(configsRootPath)) {
	console.log(`REFUSED: config-secrets-owner-only: no configs tree at ${configsRootPath} (codeRoot/../configs)`);
	process.exit(1);
}

const listIniFiles = (dirPath) => fs.readdirSync(dirPath, { withFileTypes: true }).reduce((soFar, oneEntry) => {
	const entryPath = path.join(dirPath, oneEntry.name);
	if (oneEntry.isDirectory()) { return oneEntry.name === '.git' ? soFar : soFar.concat(listIniFiles(entryPath)); }
	return /\.ini$/.test(oneEntry.name) ? soFar.concat([entryPath]) : soFar;
}, []);

const configsRealRootPath = fs.realpathSync(configsRootPath);
const secretsBearingFileList = listIniFiles(configsRealRootPath).filter((oneFilePath) => SECRET_ASSIGNMENT_PATTERN.test(fs.readFileSync(oneFilePath, 'utf8')));
const judgeOwnerOnly = (fileModeList) => {
	const exposedList = fileModeList.filter((oneFileMode) => (oneFileMode.mode & GROUP_OR_OTHER_PERMISSION_MASK) !== 0);
	return { pass: fileModeList.length > 0 && exposedList.length === 0, detail: exposedList.map((oneFileMode) => `${(oneFileMode.mode & 0o777).toString(8)} ${path.relative(configsRealRootPath, oneFileMode.filePath)}`).join('; ') || `${fileModeList.length} file(s), all owner-only` };
};
const fileModeList = secretsBearingFileList.map((oneFilePath) => ({ filePath: oneFilePath, mode: fs.statSync(oneFilePath).mode }));

console.log(`\n=== X4: every secrets-bearing config file is owner-only (${fileModeList.length} found under ${configsRootPath}) ===\n`);
const verdict = judgeOwnerOnly(fileModeList);
ok('every secrets-bearing .ini is mode 600 or tighter', verdict.pass, verdict.detail);
const twinVerdict = judgeOwnerOnly(fileModeList.map((oneFileMode, fileIndex) => (fileIndex === 0 ? { ...oneFileMode, mode: 0o100644 } : oneFileMode)));
ok('RED TWIN groupReadable (one file at 644) turns it red', twinVerdict.pass === false, twinVerdict.detail);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed === 0 ? 0 : 1);
