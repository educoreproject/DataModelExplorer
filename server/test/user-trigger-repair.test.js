'use strict';
// user-trigger-repair.test.js — gate for Phase 1 of WORKORDER-userRegistrationReset-112026 (ruling R5): the startup
// migration lib/user-account-schema-migration.js, run through the REAL sqlite-instance and data-mapping on scratch
// databases built here (never a project database).
//
//   T1.1 before the repair, the stale users trigger restamps every row when one row is updated (the test can fail)
//   T1.2 after the repair, updating one user leaves every other row's updatedAt unchanged
//   T1.3 a second run repairs nothing, and triggers not named *UpdateTimestamp are byte-identical
//   T1.4 userTokens exists after the run, with its token columns and the tokenHash index
//   T1.5 accounts sharing an email (case and spaces ignored) are reported by username; no user data changes (the columns
//        that existed before; the one added column, applicationComment, is NULL everywhere: amended 2026-11-21, A8)
//
// Run: node server/test/user-trigger-repair.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const serverPath = path.join(__dirname, '..');
const Database = require(require.resolve('better-sqlite3', { paths: [serverPath] }));

process.global = {
	xLog: { status: () => {}, error: (errorText) => process.env.TRIGGER_TEST_VERBOSE && process.stderr.write(`xLog.error: ${errorText}\n`), verbose: () => {}, result: () => {}, debug: () => {} },
	getConfig: () => ({}),
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {}, fileList: [] },
};

const passwordTools = require(path.join(serverPath, 'data-model', 'lib', 'password-hash'))();
const dataMapping = require(path.join(serverPath, 'data-model', 'data-mapping', 'data-mapping'))(passwordTools);
const sqlDbGen = require(path.join(serverPath, 'data-model', 'lib', 'sqlite-instance'))({});
const runMigration = require(path.join(serverPath, 'lib', 'user-account-schema-migration'));

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'userTriggerRepair-'));
const OLD_STAMP_TEXT = '2000-01-01 00:00:00';
const STALE_TRIGGER_SQL = (tableName) => `CREATE TRIGGER ${tableName}UpdateTimestamp AFTER UPDATE ON ${tableName} FOR EACH ROW BEGIN UPDATE ${tableName} SET [updatedAt] = CURRENT_TIMESTAMP; END`;
const AUDIT_TRIGGER_SQL = `CREATE TRIGGER authAuditLog_append_only_no_update BEFORE UPDATE ON authAuditLog BEGIN SELECT RAISE(ABORT, 'authAuditLog is append-only'); END`;
const MOVE_TRIGGER_SQL = `CREATE TRIGGER companionSourceMoveCurrent AFTER INSERT ON companionSource FOR EACH ROW BEGIN UPDATE companionSource SET isCurrent = 0 WHERE refId != NEW.refId; END`;

// a database as a pre-10.0 server left it: users and pages with the WHERE-less trigger, plus two hand-written triggers
const buildStaleDatabase = (databaseFilePath) => {
	const db = new Database(databaseFilePath);
	db.exec(`
		CREATE TABLE users ([refId] TEXT PRIMARY KEY, [createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, [updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, username TEXT, emailAdr TEXT, password TEXT, role TEXT);
		${STALE_TRIGGER_SQL('users')};
		CREATE TABLE pages ([refId] TEXT PRIMARY KEY, [createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, [updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, title TEXT);
		${STALE_TRIGGER_SQL('pages')};
		CREATE TABLE authAuditLog ([refId] TEXT PRIMARY KEY, eventName TEXT);
		${AUDIT_TRIGGER_SQL};
		CREATE TABLE companionSource ([refId] TEXT PRIMARY KEY, isCurrent INTEGER);
		${MOVE_TRIGGER_SQL};
	`);
	const insertUser = db.prepare(`INSERT INTO users (refId, createdAt, updatedAt, username, emailAdr, role) VALUES (?, ?, ?, ?, ?, 'user')`);
	[
		['userOne', 'alpha', 'Shared@Example.org'],
		['userTwo', 'beta', ' shared@example.org '],
		['userThree', 'gamma', 'gamma@example.org'],
		['userFour', 'delta', ''],
	].forEach(([refId, username, emailAdr]) => insertUser.run(refId, OLD_STAMP_TEXT, OLD_STAMP_TEXT, username, emailAdr));
	db.close();
};

const updatedAtByRefIdOf = (databaseFilePath) => {
	const db = new Database(databaseFilePath);
	const stampByRefId = Object.fromEntries(db.prepare('SELECT refId, updatedAt FROM users').all().map((userRow) => [userRow.refId, userRow.updatedAt]));
	db.close();
	return stampByRefId;
};

const touchUserOne = (databaseFilePath) => {
	const db = new Database(databaseFilePath);
	db.prepare(`UPDATE users SET role = 'admin' WHERE refId = 'userOne'`).run();
	db.close();
};

const triggerSqlByNameOf = (databaseFilePath) => {
	const db = new Database(databaseFilePath);
	const sqlByName = Object.fromEntries(db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all().map((triggerRow) => [triggerRow.name, triggerRow.sql]));
	db.close();
	return sqlByName;
};

// the users rows as text, over the given columns only (T1.5 compares the columns that existed before the run: the
// migration adds users.applicationComment, WORKORDER-adminApproval-112126 A8, supervisor ruling 2026-11-21)
const userColumnNameListOf = (databaseFilePath) => {
	const db = new Database(databaseFilePath);
	const columnNameList = db.prepare('PRAGMA table_info(users)').all().map((columnRow) => columnRow.name);
	db.close();
	return columnNameList;
};
const userRowsTextOf = (databaseFilePath, columnNameList) => {
	const db = new Database(databaseFilePath);
	const rowsText = JSON.stringify(db.prepare(`SELECT ${columnNameList.map((columnName) => `[${columnName}]`).join(', ')} FROM users ORDER BY refId`).all());
	db.close();
	return rowsText;
};

const migrateFile = (databaseFilePath, callback) =>
	sqlDbGen.initDatabaseInstance(databaseFilePath, (dbError, sqlDb) => {
		if (dbError) {
			callback(`opening ${databaseFilePath}: ${dbError}`);
			return;
		}
		runMigration({ sqlDb, dataMapping })(callback);
	});

// ---- T1.1 the unrepaired database shows the defect
const controlFilePath = path.join(scratchDirPath, 'control.sqlite3');
buildStaleDatabase(controlFilePath);
touchUserOne(controlFilePath);
const controlStampByRefId = updatedAtByRefIdOf(controlFilePath);
check('T1.1 before the repair: updating one user restamps the OTHER rows too (the defect is present)', ['userTwo', 'userThree', 'userFour'].every((refId) => controlStampByRefId[refId] !== OLD_STAMP_TEXT), JSON.stringify(controlStampByRefId));

// ---- T1.2 to T1.5 on a fresh stale database
const repairedFilePath = path.join(scratchDirPath, 'repaired.sqlite3');
buildStaleDatabase(repairedFilePath);
const triggerSqlBeforeByName = triggerSqlByNameOf(repairedFilePath);
const userColumnNameListBefore = userColumnNameListOf(repairedFilePath);
const userRowsTextBefore = userRowsTextOf(repairedFilePath, userColumnNameListBefore);

migrateFile(repairedFilePath, (firstError, firstResult = {}) => {
	check('the migration ran', !firstError, firstError);
	check('T1.2 the run repaired exactly the two stale triggers, by name', JSON.stringify((firstResult.repairedTriggerNameList || []).slice().sort()) === JSON.stringify(['pagesUpdateTimestamp', 'usersUpdateTimestamp']), JSON.stringify(firstResult.repairedTriggerNameList));
	check('T1.2 each repaired trigger is named in the log', ['usersUpdateTimestamp', 'pagesUpdateTimestamp'].every((triggerName) => (firstResult.logInfoList || []).some((logText) => logText.includes(triggerName))), JSON.stringify(firstResult.logInfoList));

	const triggerSqlAfterByName = triggerSqlByNameOf(repairedFilePath);
	check('T1.2 the repaired users trigger carries WHERE [refId] = NEW.[refId]', /WHERE \[refId\] = NEW\.\[refId\]/.test(triggerSqlAfterByName.usersUpdateTimestamp || ''), triggerSqlAfterByName.usersUpdateTimestamp);
	check('T1.5 the migration changed no user data (the columns that existed before the run)', userRowsTextOf(repairedFilePath, userColumnNameListBefore) === userRowsTextBefore);
	const userColumnNameListAfter = userColumnNameListOf(repairedFilePath);
	check('T1.5 the users table grew by exactly one column, applicationComment (A8)', userColumnNameListAfter.length === userColumnNameListBefore.length + 1 && userColumnNameListAfter.filter((columnName) => !userColumnNameListBefore.includes(columnName)).join() === 'applicationComment', JSON.stringify(userColumnNameListAfter));
	check('T1.5 applicationComment is NULL on every pre-existing row', JSON.parse(userRowsTextOf(repairedFilePath, ['applicationComment'])).every((userRow) => userRow.applicationComment === null));

	touchUserOne(repairedFilePath);
	const repairedStampByRefId = updatedAtByRefIdOf(repairedFilePath);
	check('T1.2 after the repair: updating one user leaves every other row\'s updatedAt unchanged', ['userTwo', 'userThree', 'userFour'].every((refId) => repairedStampByRefId[refId] === OLD_STAMP_TEXT), JSON.stringify(repairedStampByRefId));
	check('T1.2 and still stamps the row that changed', repairedStampByRefId.userOne !== OLD_STAMP_TEXT, JSON.stringify(repairedStampByRefId));

	['authAuditLog_append_only_no_update', 'companionSourceMoveCurrent'].forEach((triggerName) =>
		check(`T1.3 the hand-written trigger ${triggerName} is byte-identical`, triggerSqlAfterByName[triggerName] === triggerSqlBeforeByName[triggerName], triggerSqlAfterByName[triggerName]),
	);

	const verifyDb = new Database(repairedFilePath);
	const tokenColumnNameList = verifyDb.prepare('PRAGMA table_info(userTokens)').all().map((columnRow) => columnRow.name);
	const tokenIndexNameList = verifyDb.prepare('PRAGMA index_list(userTokens)').all().map((indexRow) => indexRow.name);
	verifyDb.close();
	check('T1.4 userTokens exists with refId, createdAt, updatedAt, userRefId, purpose, tokenHash, expiresAt, usedAt', ['refId', 'createdAt', 'updatedAt', 'userRefId', 'purpose', 'tokenHash', 'expiresAt', 'usedAt'].every((columnName) => tokenColumnNameList.includes(columnName)), tokenColumnNameList.join(','));
	check('T1.4 userTokens has its tokenHash index', tokenIndexNameList.includes('userTokens_tokenHash'), tokenIndexNameList.join(','));
	check('T1.4 userTokens has its own WHERE-carrying timestamp trigger', /WHERE \[refId\] = NEW\.\[refId\]/.test(triggerSqlAfterByName.userTokensUpdateTimestamp || ''), triggerSqlAfterByName.userTokensUpdateTimestamp);

	const duplicateList = firstResult.duplicateEmailList || [];
	check('T1.5 exactly one shared address is reported, naming alpha and beta (case and spaces ignored), and no blank address counts', duplicateList.length === 1 && /alpha/.test(duplicateList[0].usernameListText) && /beta/.test(duplicateList[0].usernameListText) && Number(duplicateList[0].userCount) === 2, JSON.stringify(duplicateList));
	check('T1.5 the log names the duplicate by username and contains no address', (firstResult.logInfoList || []).some((logText) => /DUPLICATE EMAIL/.test(logText) && /alpha/.test(logText)) && !(firstResult.logInfoList || []).some((logText) => /@/.test(logText)), JSON.stringify(firstResult.logInfoList));

	migrateFile(repairedFilePath, (secondError, secondResult = {}) => {
		check('T1.3 a second run succeeds and repairs nothing', !secondError && Array.isArray(secondResult.repairedTriggerNameList) && secondResult.repairedTriggerNameList.length === 0, secondError || JSON.stringify(secondResult.repairedTriggerNameList));
		check('T1.3 a second run leaves every trigger byte-identical to the first run', JSON.stringify(triggerSqlByNameOf(repairedFilePath)) === JSON.stringify(triggerSqlAfterByName));

		const failedCount = resultList.filter((passed) => !passed).length;
		console.log(`user-trigger-repair: ${resultList.length - failedCount} passed, ${failedCount} failed`);
		process.exit(failedCount ? 1 : 0);
	});
});
