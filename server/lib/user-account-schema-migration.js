#!/usr/bin/env node
'use strict';
// @concept: [[SqliteAbstraction]]

// user-account-schema-migration.js — startup work for registration and password reset (PLAN-userRegistrationReset-112026
// 4.6, ruling R5). Idempotent: safe on every boot, and a second run changes nothing. Mirrors oauth-schema-init.js.
//
//   1. TRIGGER REPAIR. Every trigger named *UpdateTimestamp whose SQL has no WHERE clause is dropped and recreated as
//      sqlite-instance initTable writes it today (lib/timestamp-trigger-repair.js), in one transaction per trigger.
//      Such a trigger restamps updatedAt on every row whenever one row changes. Triggers with other names are never
//      read as candidates, so hand-written ones (authAuditLog_append_only_*, companionSourceMoveCurrent) stay
//      byte-identical. Each repaired trigger is logged by name. Existing updatedAt values are already wrong and are left.
//   2. userTokens. The table (getTable creates refId, createdAt, updatedAt) and its token columns, added where absent,
//      plus an index on tokenHash; then spent rows (used or expired) are swept.
//   2b. accountApprovalDecisions (WORKORDER-adminApproval-112126): the table of who approved or declined a self-registered
//      account and when, its columns added where absent, plus an index on applicantUserRefId.
//   3. DUPLICATE EMAIL CHECK. Accounts sharing an address (compared without case) are logged by username. No data
//      changes; a reset by that address refuses at request time (password-reset-request) until an admin fixes them.
//
// Contract: moduleFunction({ sqlDb, dataMapping })(callback) -> callback(errText, { logInfoList, repairedTriggerNameList, duplicateEmailList })

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { isWherelessTimestampTrigger, triggerReplacementSqlOf } = require('./timestamp-trigger-repair');

const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true });
const QUIET_UNTAGGED_OPTIONS = Object.freeze({ suppressStatementLog: true, noTableNameOk: true });
const USERS_TABLE_NAME = 'users';
const USER_TOKENS_TABLE_NAME = 'userTokens';
const APPROVAL_DECISIONS_TABLE_NAME = 'accountApprovalDecisions';
const TRIGGER_LIST_SQL = "SELECT name, tbl_name AS tableName, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name";

const moduleFunction = ({ sqlDb, dataMapping }) => (callback) => {
	const logInfoList = [];
	const taskList = new taskListPlus();

	// any table handle runs database-wide statements; users exists on every server (and getTable makes it if not)
	taskList.push((args, next) => sqlDb.getTable(USERS_TABLE_NAME, mergeArgs(args, next, 'userTable')));

	// ---- 1. trigger repair
	taskList.push((args, next) =>
		args.userTable.getData(TRIGGER_LIST_SQL, QUIET_UNTAGGED_OPTIONS, (listError, triggerRowList = []) => {
			if (listError) {
				next(`listing triggers: ${listError}`, args);
				return;
			}
			next('', { ...args, staleTriggerRowList: triggerRowList.filter(isWherelessTimestampTrigger) });
		}),
	);

	taskList.push((args, next) => {
		const repairOne = (remainingRowList, repairedNameList) => {
			if (!remainingRowList.length) {
				next('', { ...args, repairedTriggerNameList: repairedNameList });
				return;
			}
			const [triggerRow, ...restRowList] = remainingRowList;
			args.userTable.runStatement(triggerReplacementSqlOf({ triggerName: triggerRow.name, tableName: triggerRow.tableName }), QUIET_UNTAGGED_OPTIONS, (repairError) => {
				if (repairError) {
					// the transaction is still open after a failed statement: end it, so the old trigger is kept
					args.userTable.runStatement('ROLLBACK;', QUIET_UNTAGGED_OPTIONS, () => next(`repairing trigger ${triggerRow.name}: ${repairError}`, args));
					return;
				}
				logInfoList.push(`repaired WHERE-less trigger ${triggerRow.name} on ${triggerRow.tableName}`);
				repairOne(restRowList, [...repairedNameList, triggerRow.name]);
			});
		};
		repairOne(args.staleTriggerRowList, []);
	});

	// ---- 2. userTokens
	taskList.push((args, next) => sqlDb.getTable(USER_TOKENS_TABLE_NAME, mergeArgs(args, next, 'tokenTable')));

	taskList.push((args, next) =>
		args.tokenTable.getData(dataMapping['user-token'].getSql('tableInfo'), QUIET_OPTIONS, (infoError, columnRowList = []) => {
			if (infoError) {
				next(`reading ${USER_TOKENS_TABLE_NAME} columns: ${infoError}`, args);
				return;
			}
			const presentNameList = columnRowList.map((columnRow) => String(columnRow.name).toLowerCase());
			next('', { ...args, missingColumnNameList: dataMapping['user-token'].tokenColumnNameList.filter((columnName) => !presentNameList.includes(columnName.toLowerCase())) });
		}),
	);

	taskList.push((args, next) => {
		const statementList = [
			...args.missingColumnNameList.map((columnName) => `ALTER TABLE <!tableName!> ADD COLUMN [${columnName}] TEXT;`),
			`CREATE INDEX IF NOT EXISTS [${USER_TOKENS_TABLE_NAME}_tokenHash] ON <!tableName!> ([tokenHash]);`,
		];
		args.tokenTable.runStatement(statementList.join('\n'), QUIET_OPTIONS, (alterError) => {
			if (alterError) {
				next(`preparing ${USER_TOKENS_TABLE_NAME}: ${alterError}`, args);
				return;
			}
			logInfoList.push(args.missingColumnNameList.length ? `${USER_TOKENS_TABLE_NAME}: added ${args.missingColumnNameList.join(', ')}` : `${USER_TOKENS_TABLE_NAME}: present`);
			next('', args);
		});
	});

	taskList.push((args, next) =>
		args.tokenTable.runStatement(dataMapping['user-token'].getSql('spentSweep', { nowText: new Date().toISOString() }), QUIET_OPTIONS, (sweepError) => next(sweepError ? `sweeping ${USER_TOKENS_TABLE_NAME}: ${sweepError}` : '', args)),
	);

	// ---- 2b. accountApprovalDecisions
	taskList.push((args, next) => sqlDb.getTable(APPROVAL_DECISIONS_TABLE_NAME, mergeArgs(args, next, 'decisionTable')));

	taskList.push((args, next) =>
		args.decisionTable.getData(dataMapping['account-approval-decision'].getSql('tableInfo'), QUIET_OPTIONS, (infoError, columnRowList = []) => {
			if (infoError) {
				next(`reading ${APPROVAL_DECISIONS_TABLE_NAME} columns: ${infoError}`, args);
				return;
			}
			const presentNameList = columnRowList.map((columnRow) => String(columnRow.name).toLowerCase());
			next('', { ...args, missingDecisionColumnNameList: dataMapping['account-approval-decision'].decisionColumnNameList.filter((columnName) => !presentNameList.includes(columnName.toLowerCase())) });
		}),
	);

	taskList.push((args, next) => {
		const statementList = [
			...args.missingDecisionColumnNameList.map((columnName) => `ALTER TABLE <!tableName!> ADD COLUMN [${columnName}] TEXT;`),
			`CREATE INDEX IF NOT EXISTS [${APPROVAL_DECISIONS_TABLE_NAME}_applicantUserRefId] ON <!tableName!> ([applicantUserRefId]);`,
		];
		args.decisionTable.runStatement(statementList.join('\n'), QUIET_OPTIONS, (alterError) => {
			if (alterError) {
				next(`preparing ${APPROVAL_DECISIONS_TABLE_NAME}: ${alterError}`, args);
				return;
			}
			logInfoList.push(args.missingDecisionColumnNameList.length ? `${APPROVAL_DECISIONS_TABLE_NAME}: added ${args.missingDecisionColumnNameList.join(', ')}` : `${APPROVAL_DECISIONS_TABLE_NAME}: present`);
			next('', args);
		});
	});

	// ---- 3. duplicate email check
	taskList.push((args, next) =>
		args.userTable.getData(dataMapping['profile-user'].getSql('duplicateEmailList'), QUIET_OPTIONS, (duplicateError, duplicateEmailList = []) => {
			if (duplicateError) {
				next(`checking duplicate email addresses: ${duplicateError}`, args);
				return;
			}
			duplicateEmailList.forEach((duplicateRow) => logInfoList.push(`DUPLICATE EMAIL: ${duplicateRow.userCount} accounts share one email address (${duplicateRow.usernameListText}); a reset by that address refuses until an admin fixes them`));
			next('', { ...args, duplicateEmailList });
		}),
	);

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(`${moduleName}: ${err}`, { logInfoList });
			return;
		}
		if (!args.repairedTriggerNameList.length) {
			logInfoList.push('no WHERE-less timestamp trigger found');
		}
		callback('', { logInfoList, repairedTriggerNameList: args.repairedTriggerNameList, duplicateEmailList: args.duplicateEmailList });
	});
};

module.exports = moduleFunction;
