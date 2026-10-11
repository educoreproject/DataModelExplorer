#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]
// @concept: [[SqliteAbstraction]]

// ============================================================================
// oauth-schema-init.js — ensures the OAuth/OIDC persistence schema exists
// (dmeMcpOAuth Phase 1.3). Idempotent: safe to run on every boot.
//
//   - creates (if absent) the four new tables via the sqlDb abstraction:
//       oauthClient, oauthGrant, authAuditLog, oauthAdapterStore
//     (getTable creates refId/createdAt/updatedAt; the domain columns are added
//      by the abstraction on first write, per its ALTER-on-save behavior)
//   - adds the two security columns to the EXISTING users table if missing:
//       disabled, accessRevokedAfter
//     using a PRAGMA existence check before ALTER (SQLite errors on duplicate
//     ADD COLUMN). Existing user rows/values are never touched.
//
// Contract: moduleFunction({ sqlDb })(callback) -> callback(err, { logInfoList })
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const NEW_TABLES = ['oauthClient', 'oauthGrant', 'authAuditLog', 'oauthAdapterStore'];
const USER_SECURITY_COLUMNS = ['disabled', 'accessRevokedAfter'];

const moduleFunction = ({ sqlDb }) => (callback) => {
	const { xLog } = process.global;
	const logInfoList = [];

	const taskList = new taskListPlus();

	// --------------------------------------------------------------------------------
	// Ensure each new table exists (getTable creates it if absent).
	NEW_TABLES.forEach((tableName) => {
		taskList.push((args, next) => {
			const localCallback = (err) => {
				if (err) {
					next(err, args);
					return;
				}
				logInfoList.push(`ensured table: ${tableName}`);
				next('', args);
			};
			args.sqlDb.getTable(tableName, localCallback);
		});
	});

	// --------------------------------------------------------------------------------
	// Add the two security columns to the users table if missing (PRAGMA-checked).
	taskList.push((args, next) =>
		args.sqlDb.getTable('users', mergeArgs(args, next, 'userTable')),
	);

	taskList.push((args, next) => {
		const { userTable } = args;
		const localCallback = (err, rows = []) => {
			if (err) {
				next(err, args);
				return;
			}
			const existing = rows.map((r) => String(r.name).toLowerCase());
			const missing = USER_SECURITY_COLUMNS.filter(
				(c) => !existing.includes(c.toLowerCase()),
			);
			next('', { ...args, missingUserColumns: missing });
		};
		userTable.getData(
			`PRAGMA table_info(<!tableName!>);`,
			{ suppressStatementLog: true },
			localCallback,
		);
	});

	taskList.push((args, next) => {
		const { userTable, missingUserColumns } = args;
		if (!missingUserColumns || missingUserColumns.length === 0) {
			logInfoList.push('users security columns already present');
			next('', args);
			return;
		}
		const statements = missingUserColumns
			.map((name) => `ALTER TABLE <!tableName!> ADD COLUMN [${name}] TEXT;`)
			.join('\n');
		const localCallback = (err) => {
			if (err) {
				next(err, args);
				return;
			}
			logInfoList.push(`added users columns: ${missingUserColumns.join(', ')}`);
			next('', args);
		};
		userTable.runStatement(statements, { suppressStatementLog: true }, localCallback);
	});

	// --------------------------------------------------------------------------------
	const initialData = { sqlDb };
	pipeRunner(taskList.getList(), initialData, (err) => {
		if (err) {
			xLog && xLog.error(`oauth-schema-init failed: ${err.toString()}`);
			callback(err);
			return;
		}
		callback('', { logInfoList });
	});
};

module.exports = moduleFunction;
