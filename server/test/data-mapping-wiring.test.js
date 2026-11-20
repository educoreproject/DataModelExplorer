'use strict';
// data-mapping-wiring.test.js — data-model.js must hand data-mapping.js every password function the mappers use.
// Found 2026-11-20 (WORKORDER-userRegistrationReset-112026, Phase 5 browser walk): data-model.js passed pwHash,
// hashPassword, verifyPassword and validatePasswordStrength but not isStoredPasswordHash, which profile-user's reverse
// map calls on every password write (since 4a97844). On the real server every password save threw "isStoredPasswordHash
// is not a function"; every harness passed, because harnesses hand data-mapping ALL of password-hash.
//
// Reads data-model.js's source (so it follows the code), builds data-mapping with exactly the names it passes, and
// writes a password through profile-user's reverse map. Needs no database.
// Run: node server/test/data-mapping-wiring.test.js

const fs = require('fs');
const path = require('path');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, debug: () => {} }, getConfig: () => ({}), rawConfig: {}, commandLineParameters: { switches: {}, values: {}, fileList: [] } };

const dataModelSourceText = fs.readFileSync(path.join(__dirname, '..', 'data-model', 'data-model.js'), 'utf8');
const passedNameMatch = dataModelSourceText.match(/require\(`\.\/data-mapping`\)\(\{([^}]*)\}\)/);
check('data-model.js builds data-mapping with a literal list of names', !!passedNameMatch);
const passedNameList = passedNameMatch ? passedNameMatch[1].split(',').map((nameText) => nameText.trim()).filter(Boolean) : [];

const passwordTools = require(path.join(__dirname, '..', 'data-model', 'lib', 'password-hash'))();
const passedTools = Object.fromEntries(passedNameList.map((toolName) => [toolName, passwordTools[toolName]]));
check('every name data-model.js passes is a password-hash function', passedNameList.every((toolName) => typeof passwordTools[toolName] === 'function'), passedNameList.join(','));

const TWELVE_CHARACTER_PASSWORD = 'a-twelve-char-password';
const dataMapping = require(path.join(__dirname, '..', 'data-model', 'data-mapping', 'data-mapping'))(passedTools);
let mappedRecord = {};
let mapErrorText = '';
try {
	mappedRecord = dataMapping['profile-user'].map({ refId: 'r1', password: TWELVE_CHARACTER_PASSWORD }, 'reverse');
} catch (mapError) {
	mapErrorText = mapError.message;
}
check('profile-user writes a password with exactly what data-model.js passes (hashed, not thrown)', !mapErrorText && passwordTools.isStoredPasswordHash(mappedRecord.password) && mappedRecord.password !== TWELVE_CHARACTER_PASSWORD, mapErrorText || JSON.stringify(mappedRecord));

const failedCount = resultList.filter((passed) => !passed).length;
console.log(`data-mapping-wiring: ${resultList.length - failedCount} passed, ${failedCount} failed`);
process.exit(failedCount ? 1 : 0);
