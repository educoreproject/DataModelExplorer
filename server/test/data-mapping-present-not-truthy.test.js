#!/usr/bin/env node
'use strict';

// data-mapping-present-not-truthy.test.js — gates G0.1 and G0.2 (Companion Pages Phase 0; Continuity request c60aad64;
// scaffold erratum dataMappingPresentNotTruthy_102726.md).
// baseMappingProcess kept a field only when its value was TRUTHY, so 0, false and '' never reached the database and an
// update could never clear a field. It now keeps every field that is present (!== undefined). Because a blank now
// passes, profile-user.js drops a password of '' or null before hashing, so a blank password field leaves the stored
// password alone. The two changes go together.
//
// PROVES:
//   G0.1  0, false and '' survive a forward and a reverse map (through the real profile-user mapper)
//   G0.2  a reverse map of password '' or null carries no password; a real password is still hashed; and, through the
//         real sqlite-instance on a throwaway database, saving a blank password leaves the stored hash unchanged
// RED TWINS (in memory, lib/moduleWithStubs.js):
//   truthyFilter    data-mapping.js with the old truthy filters: G0.1 fails
//   noPasswordGuard the present-not-truthy filter WITHOUT the profile-user guard: the blank password overwrites
//
//   node server/test/data-mapping-present-not-truthy.test.js   (with /usr/local/bin/node: sqlite3 is built for it)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadWithStubs } = require('./lib/moduleWithStubs');

const SERVER_PATH = path.join(__dirname, '..');
const DATA_MAPPING_PATH = path.join(SERVER_PATH, 'data-model', 'data-mapping', 'data-mapping.js');
const PROFILE_USER_PATH = path.join(SERVER_PATH, 'data-model', 'data-mapping', 'mappers', 'profile-user.js');

const FORWARD_FILTER_PRESENT = '.filter(name => inObj[mappingSpec[name]] !== undefined)';
const REVERSE_FILTER_PRESENT = '.filter(name => inObj[name] !== undefined)';
const PASSWORD_GUARD = `if (outObj.password === '' || outObj.password === null) {
					delete outObj.password;
				}`;

process.global = {
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	getConfig: () => ({}),
};

const passwordTools = require(path.join(SERVER_PATH, 'data-model', 'lib', 'password-hash'))();
const sqlDbGen = require(path.join(SERVER_PATH, 'data-model', 'lib', 'sqlite-instance'))({});

const results = [];
const ok = (name, condition, detail) => {
	results.push([name, !!condition]);
	console.log(`  ${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const falsyProfile = { refId: 'falsyProbeRefId', first: 0, last: false, phone: '' };
const falsySurvives = (profileUserMapper) => {
	const forwardResult = profileUserMapper.map(falsyProfile, 'forward');
	const reverseResult = profileUserMapper.map(falsyProfile, 'reverse');
	return ['first', 'last', 'phone'].every((fieldName) => forwardResult[fieldName] === falsyProfile[fieldName] && reverseResult[fieldName] === falsyProfile[fieldName]);
};

const realDataMapping = require(DATA_MAPPING_PATH)(passwordTools);
const truthyDataMapping = loadWithStubs({
	modulePath: DATA_MAPPING_PATH,
	mutationList: [
		{ find: FORWARD_FILTER_PRESENT, replace: '.filter(name => inObj[mappingSpec[name]])' },
		{ find: REVERSE_FILTER_PRESENT, replace: '.filter(name => inObj[name])' },
	],
})(passwordTools);
const unguardedDataMapping = loadWithStubs({
	modulePath: DATA_MAPPING_PATH,
	stubByRequestPath: { [PROFILE_USER_PATH]: loadWithStubs({ modulePath: PROFILE_USER_PATH, mutationList: [{ find: PASSWORD_GUARD, replace: '' }] }) },
})(passwordTools);

console.log('G0.1 present, not truthy');
ok('0, false and \'\' survive forward and reverse', falsySurvives(realDataMapping['profile-user']));
ok('a field that is absent stays absent', !('emailAdr' in realDataMapping['profile-user'].map(falsyProfile, 'reverse')));
ok('red twin truthyFilter: the old filter drops them', !falsySurvives(truthyDataMapping['profile-user']));

console.log('G0.2 blank password');
const realProfileUser = realDataMapping['profile-user'];
ok("reverse map of password '' carries no password", !('password' in realProfileUser.map({ refId: 'r1', password: '' }, 'reverse')));
ok('reverse map of password null carries no password', !('password' in realProfileUser.map({ refId: 'r1', password: null }, 'reverse')));
const hashedPassword = realProfileUser.map({ refId: 'r1', password: 'NewPassword9!' }, 'reverse').password;
ok('a real password is still hashed', typeof hashedPassword === 'string' && hashedPassword.includes(':') && passwordTools.verifyPassword('NewPassword9!', hashedPassword));
ok("red twin noPasswordGuard: password '' passes through", unguardedDataMapping['profile-user'].map({ refId: 'r1', password: '' }, 'reverse').password === '');

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'dataMappingPresent-'));
const storedHash = passwordTools.hashPassword('OriginalPassword9!');

const storedPasswordAfterBlankSave = (dataMapping, tableName, callback) => {
	sqlDbGen.initDatabaseInstance(path.join(scratchDirPath, `${tableName}.sqlite3`), (dbError, sqlDb) => {
		sqlDb.getTable(tableName, (tableError, userTable) => {
			userTable.saveObject({ refId: 'blankProbeUser', username: 'blankprobe', password: storedHash, role: 'user' }, { suppressStatementLog: true }, (seedError) => {
				const blankUpdate = dataMapping['profile-user'].map({ refId: 'blankProbeUser', first: 'Changed', password: '' }, 'reverse');
				userTable.saveObject(blankUpdate, { suppressStatementLog: true }, (saveError) => {
					userTable.getData(`SELECT password, first FROM <!tableName!> WHERE refId = 'blankProbeUser'`, { suppressStatementLog: true }, (readError, rowList) => {
						callback(dbError || tableError || seedError || saveError || readError, rowList[0]);
					});
				});
			});
		});
	});
};

storedPasswordAfterBlankSave(realDataMapping, 'usersReal', (realError, realRow) => {
	ok('saved through sqlite-instance: a blank password leaves the stored hash unchanged', !realError && realRow.password === storedHash && realRow.first === 'Changed', realError || `first=${realRow.first}`);
	storedPasswordAfterBlankSave(unguardedDataMapping, 'usersUnguarded', (twinError, twinRow) => {
		ok('red twin noPasswordGuard, saved: the blank password overwrites the stored hash', !twinError && twinRow.password !== storedHash, twinError || `stored=${JSON.stringify(twinRow.password)}`);
		fs.rmSync(scratchDirPath, { recursive: true, force: true });
		const failedCount = results.filter(([, isPass]) => !isPass).length;
		console.log(`\n=== Results: ${results.length - failedCount} passed, ${failedCount} failed ===\n`);
		process.exit(failedCount > 0 ? 1 : 0);
	});
});
