'use strict';
// account-disabled-and-revocation.test.js — gate for Phase 4b of WORKORDER-userRegistrationReset-112026 (supervisor
// ruling 2026-11-20 on findings F1 and F2).
//
//   T4b.1 (F2) the website login refuses an account whose users.disabled is set: an admin-disabled one by accountDisabled,
//         a pending one by emailNotConfirmed; re-enabled ('' , '0', 'false') it signs in again
//   T4b.2 (F1) revokeSessionsOf on a database shaped like an oauth-server-off instance (oauthAdapterStore made by
//         oauth-schema-init, never given the adapter's columns): no error, accessRevokedAfter stamped, the skip logged
//         by name
//   T4b.3 (F1 control) with the adapter's columns present, the account's OAuth grant rows are still deleted
//
// Run: node server/test/account-disabled-and-revocation.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootUserAccountServer, httpPost } = require('./lib/userAccountHarness');

const serverPath = path.join(__dirname, '..');
const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const seedUserList = [
	{ username: 'dora', password: 'dora-original-pass', first: 'Dora', last: 'Disabled', emailAdr: 'dora@example.org', phone: '', source: 'test', role: 'user', disabled: 'adminDisabled' },
	{ username: 'pete', password: 'pete-original-pass', first: 'Pete', last: 'Pending', emailAdr: 'pete@example.org', phone: '', source: 'test', role: 'user', disabled: 'pendingConfirmation' },
];

const finish = () => {
	const failedCount = resultList.filter((passed) => !passed).length;
	console.log(`account-disabled-and-revocation: ${resultList.length - failedCount} passed, ${failedCount} failed`);
	process.exit(failedCount ? 1 : 0);
};

const setDisabled = (harness, username, disabledText, callback) => harness.userTable.runStatement(`UPDATE <!tableName!> SET disabled = '${disabledText}' WHERE username = '${username}'`, { suppressStatementLog: true }, callback);

// ---- T4b.2 and T4b.3: revokeSessionsOf straight on scratch databases
const revocationChecks = (callback) => {
	process.global = process.global || {};
	const logList = [];
	process.global.xLog = { status: (logText) => logList.push(String(logText)), error: (logText) => logList.push(`ERROR ${logText}`), verbose: () => {}, result: () => {}, debug: () => {} };
	process.global.getConfig = process.global.getConfig || (() => ({}));
	const passwordTools = require(path.join(serverPath, 'data-model', 'lib', 'password-hash'))();
	const dataMapping = require(path.join(serverPath, 'data-model', 'data-mapping', 'data-mapping'))(passwordTools);
	const sqlDbGen = require(path.join(serverPath, 'data-model', 'lib', 'sqlite-instance'))({});
	const { revokeSessionsOf } = require(path.join(serverPath, 'lib', 'user-session-revocation'));
	const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'revocationShape-'));

	const userOf = (sqlDb, done) => sqlDb.getTable('users', (tableError, userTable) => userTable.saveObject({ username: 'olive', role: 'user', disabled: '' }, { suppressStatementLog: true }, (saveError, userRefId) => done(tableError || saveError, { userTable, userRefId })));

	sqlDbGen.initDatabaseInstance(path.join(scratchDirPath, 'oauthOff.sqlite3'), (offDbError, offSqlDb) =>
		require(path.join(serverPath, 'lib', 'oauth-schema-init'))({ sqlDb: offSqlDb })((schemaError) =>
			userOf(offSqlDb, (userError, { userTable, userRefId } = {}) =>
				revokeSessionsOf({ sqlDb: offSqlDb, dataMapping, userRefId }, (revokeError, { accessRevokedAfterSeconds } = {}) =>
					userTable.getData(`SELECT accessRevokedAfter FROM <!tableName!> WHERE refId = '${userRefId}'`, { suppressStatementLog: true }, (readError, rowList = []) => {
						check('T4b.2 the oauth-off database was built (oauthAdapterStore present, no adapter columns)', !offDbError && !schemaError && !userError, offDbError || schemaError || userError);
						check('T4b.2 revokeSessionsOf succeeds where oauthAdapterStore lacks the adapter columns', !revokeError, revokeError);
						check('T4b.2 ...and still stamps accessRevokedAfter (the website cutoff)', rowList[0] && Number(rowList[0].accessRevokedAfter) === accessRevokedAfterSeconds && accessRevokedAfterSeconds > 0, JSON.stringify(rowList));
						check('T4b.2 ...and logs the skipped grant cleanup by name', logList.some((logText) => /oauthGrantCleanupSkipped/.test(logText)), logList.join(' | '));

						// T4b.3: the adapter's columns, a Grant of olive's and a refresh token in its family, then revoke
						sqlDbGen.initDatabaseInstance(path.join(scratchDirPath, 'oauthOn.sqlite3'), (onDbError, onSqlDb) =>
							require(path.join(serverPath, 'lib', 'oauth-schema-init'))({ sqlDb: onSqlDb })(() =>
								require(path.join(serverPath, 'lib', 'oauth-adapter'))({ sqlDb: onSqlDb })(() =>
									userOf(onSqlDb, (onUserError, { userRefId: onUserRefId } = {}) =>
										onSqlDb.getTable('oauthAdapterStore', (adapterTableError, adapterTable) =>
											adapterTable.runStatement(
												`INSERT INTO <!tableName!> (refId, model, id, payload, grantId) VALUES ('Grant:g1', 'Grant', 'g1', '{"accountId":"${onUserRefId}"}', ''), ('RefreshToken:r1', 'RefreshToken', 'r1', '{}', 'g1');`,
												{ suppressStatementLog: true },
												(insertError) =>
													revokeSessionsOf({ sqlDb: onSqlDb, dataMapping, userRefId: onUserRefId }, (onRevokeError) =>
														adapterTable.getData('SELECT refId FROM <!tableName!>', { suppressStatementLog: true }, (remainingError, remainingRowList = []) => {
															check('T4b.3 control: with the adapter columns present, the account\'s Grant and its refresh token are deleted', !onDbError && !onUserError && !adapterTableError && !insertError && !onRevokeError && remainingRowList.length === 0, `${onDbError || onUserError || adapterTableError || insertError || onRevokeError || ''} ${JSON.stringify(remainingRowList)}`);
															callback();
														}),
													),
											),
										),
									),
								),
							),
						);
					}),
				),
			),
		),
	);
};

// ---- T4b.1: the website login, through the real login endpoint
bootUserAccountServer({ serverPath, scratchDirPath: fs.mkdtempSync(path.join(os.tmpdir(), 'disabledLogin-')), seedUserList }, (bootError, harness) => {
	if (bootError) {
		check('the harness booted', false, bootError);
		finish();
		return;
	}
	const login = (username, password, callback) => httpPost({ baseUrl: harness.baseUrl, routePath: '/api/login', requestBody: { username, password } }, (errText, response) => callback(response || {}));
	login('dora', 'dora-original-pass', (disabledResponse) => {
		check('T4b.1 an admin-disabled account is refused at website login, by name (accountDisabled, 403)', disabledResponse.statusCode === 403 && disabledResponse.bodyJson && disabledResponse.bodyJson.refusalName === 'accountDisabled', `${disabledResponse.statusCode} ${disabledResponse.bodyText}`);
		login('pete', 'pete-original-pass', (pendingResponse) => {
			check('T4b.1 a pending account is refused by emailNotConfirmed', pendingResponse.statusCode === 403 && pendingResponse.bodyJson && pendingResponse.bodyJson.refusalName === 'emailNotConfirmed', `${pendingResponse.statusCode} ${pendingResponse.bodyText}`);
			login('dora', 'wrong-password-here', (wrongResponse) => {
				check('T4b.1 a wrong password on a disabled account says only "Authentication failed"', wrongResponse.statusCode === 401 && !/accountDisabled/.test(wrongResponse.bodyText), wrongResponse.bodyText);
				const reEnabledTextList = ['', '0', 'false'];
				const tryNext = (remainingList) => {
					if (!remainingList.length) {
						harness.close();
						revocationChecks(finish);
						return;
					}
					setDisabled(harness, 'dora', remainingList[0], () =>
						login('dora', 'dora-original-pass', (enabledResponse) => {
							check(`T4b.1 re-enabled (disabled='${remainingList[0]}'), the account signs in`, enabledResponse.statusCode === 200 && enabledResponse.bodyJson && enabledResponse.bodyJson[0].username === 'dora', `${enabledResponse.statusCode} ${enabledResponse.bodyText}`);
							tryNext(remainingList.slice(1));
						}),
					);
				};
				tryNext(reEnabledTextList);
			});
		});
	});
});
