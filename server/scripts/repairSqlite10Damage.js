#!/usr/bin/env node
'use strict';
// @concept: [[SqliteAbstraction]]
// @concept: [[SessionPersistence]]
//
// repairSqlite10Damage.js — repairs, ONE database file at a time, the two kinds of damage the pre-10.0 sqlite-instance
// left behind and that porting 11.0 cannot undo (see sqlite-instance.js, VERSION HISTORY 10.0):
//   1. updatedAt triggers with no WHERE clause (every update restamped every row): replaced with the 10.0 form.
//   2. apostrophes doubled once per save in dme_sessions.sessionData and dme_sessions.sessionName: un-doubled.
// Every other text column of every table is SCANNED and REPORTED, never changed: only dme_sessions' structure is
// understood well enough to repair safely.
//
//   node server/scripts/repairSqlite10Damage.js --databaseFilePath=/abs/path.sqlite3 -dryRun
//   node server/scripts/repairSqlite10Damage.js --databaseFilePath=/abs/path.sqlite3 --backupFilePath=/abs/new.sqlite3 -apply
//
// -dryRun changes nothing and prints what -apply would do. -apply first writes a consistent copy of the database to
// backupFilePath (VACUUM INTO; refused if that file exists), then repairs inside ONE transaction. Idempotent: a second
// -apply finds nothing to do. Stop the API server first: the repair must not race a save.
//
// HOW THE UN-DOUBLING DECIDES. Each save doubled every apostrophe in the whole session, so text that has been through
// n saves holds each typed apostrophe as a run of 2^n. A turn's prompt, stdout and stderr entered the session together,
// so they share one n; later turns have been through fewer saves, so n never rises from one turn to the next. Per turn,
// n is read from the SHORTEST apostrophe run (a typed single apostrophe), and every run is divided by 2^n. A turn is
// FLAGGED, and its row left untouched, when that reading is not trustworthy: a run that 2^n does not divide, or an n
// greater than the previous turn's (which happens when a turn's only apostrophes were typed as pairs, as in SQL '').
// sessionName is regenerated on every save and written once, so it is a single unit with its own n.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const path = require('path');
const fs = require('fs');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const SESSIONS_TABLE_NAME = 'dme_sessions';
const DOUBLED_APOSTROPHE_LIKE_PATTERN = "%''%"; // the VALUE (sqlString.escape quotes it): two apostrophes in a row

// ================================================================================
// PURE: the un-doubling

const apostropheRunLengthListOf = (text) => (String(text).match(/'+/g) || []).map((run) => run.length);

// n for one unit of text: log2 of its shortest apostrophe run (0 when it has none), or null when that is not a power of two
const saveCountOf = (runLengthList) => {
	if (!runLengthList.length) return 0;
	const shortestRunLength = Math.min(...runLengthList);
	return Math.round(Math.log2(shortestRunLength)) === Math.log2(shortestRunLength) ? Math.log2(shortestRunLength) : null;
};

const undoubledTextOf = (text, saveCount) => String(text).replace(/'+/g, (run) => "'".repeat(run.length / 2 ** saveCount));

const stringLeafListOf = (turn) => Object.keys(turn).filter((propertyName) => typeof turn[propertyName] === 'string').map((propertyName) => turn[propertyName]);

// -> { repairedTurnList, flagText }   flagText non-empty means: do not repair this row, a person must look
const undoubledTurnListOf = (turnList) => {
	let previousSaveCount = Infinity;
	const repairedTurnList = [];
	for (let turnIndex = 0; turnIndex < turnList.length; turnIndex++) {
		const turn = turnList[turnIndex];
		const runLengthList = stringLeafListOf(turn).flatMap(apostropheRunLengthListOf);
		const saveCount = saveCountOf(runLengthList);
		if (saveCount === null) {
			return { repairedTurnList: [], flagText: `turn ${turnIndex + 1}: shortest apostrophe run ${Math.min(...runLengthList)} is not a power of two` };
		}
		if (runLengthList.length && saveCount > previousSaveCount) {
			return { repairedTurnList: [], flagText: `turn ${turnIndex + 1}: reads as ${saveCount} saves after an earlier turn read as ${previousSaveCount} (typed pairs, such as SQL '', cannot be told from doubling)` };
		}
		const indivisibleRunLength = runLengthList.find((runLength) => runLength % 2 ** saveCount !== 0);
		if (indivisibleRunLength !== undefined) {
			return { repairedTurnList: [], flagText: `turn ${turnIndex + 1}: a run of ${indivisibleRunLength} apostrophes is not a multiple of ${2 ** saveCount}` };
		}
		if (runLengthList.length) previousSaveCount = saveCount;
		repairedTurnList.push(Object.keys(turn).reduce((soFar, propertyName) => ({ ...soFar, [propertyName]: typeof turn[propertyName] === 'string' ? undoubledTextOf(turn[propertyName], saveCount) : turn[propertyName] }), {}));
	}
	return { repairedTurnList, flagText: '' };
};

// -> { repairedSessionName, flagText }
const undoubledSessionNameOf = (sessionName) => {
	const saveCount = saveCountOf(apostropheRunLengthListOf(sessionName));
	if (saveCount === null) return { repairedSessionName: sessionName, flagText: 'sessionName: shortest apostrophe run is not a power of two' };
	return { repairedSessionName: undoubledTextOf(sessionName, saveCount), flagText: '' };
};

// -> { repairedRow | null, flagText }  repairedRow null means nothing to change
const repairOfSessionRow = (sessionRow) => {
	const sessionDataText = String(sessionRow.sessionData || '');
	if (!/^\s*\[[\s\S]*\]\s*$/.test(sessionDataText)) {
		return { repairedRow: null, flagText: 'sessionData is not a JSON list' };
	}
	const turnList = JSON.parse(sessionDataText); // a malformed list throws here, before any write: loud, and nothing changed
	const turnRepair = undoubledTurnListOf(turnList);
	if (turnRepair.flagText) return { repairedRow: null, flagText: turnRepair.flagText };
	const nameRepair = undoubledSessionNameOf(sessionRow.sessionName || '');
	if (nameRepair.flagText) return { repairedRow: null, flagText: nameRepair.flagText };
	const repairedSessionData = JSON.stringify(turnRepair.repairedTurnList);
	if (repairedSessionData === sessionDataText && nameRepair.repairedSessionName === sessionRow.sessionName) {
		return { repairedRow: null, flagText: '' };
	}
	return { repairedRow: { refId: sessionRow.refId, sessionData: repairedSessionData, sessionName: nameRepair.repairedSessionName }, flagText: '' };
};

// the 10.0 trigger, as sqlite-instance's initTable writes it
const correctTriggerSqlOf = (tableName) =>
	`CREATE TRIGGER [${tableName}UpdateTimestamp] AFTER UPDATE ON [${tableName}] FOR EACH ROW BEGIN UPDATE [${tableName}] SET [updatedAt] = CURRENT_TIMESTAMP WHERE [refId] = NEW.[refId]; END;`;

const isWherelessTimestampTrigger = (triggerRow) => /UpdateTimestamp$/.test(triggerRow.name) && !/\bWHERE\b/i.test(triggerRow.sql || '');

// ================================================================================
// THE RUN

const runRepair = ({ databaseFilePath, backupFilePath, isApply, sqlString }, callback) => {
	const report = { databaseFilePath, mode: isApply ? 'apply' : 'dryRun', triggerReplacedList: [], otherDoubledByColumn: {}, sessionRowCount: 0, sessionDoubledRowCount: 0, sessionRepairedRowCount: 0, sessionFlaggedList: [], afterDoubledRowCount: null };
	const sqlDbGen = require(path.join(__dirname, '..', 'data-model', 'lib', 'sqlite-instance'))({});
	const taskList = new taskListPlus();

	taskList.push((args, next) => sqlDbGen.initDatabaseInstance(databaseFilePath, mergeArgs(args, next, 'sqlDb')));
	// a handle for catalogue reads; suppressDynamicSchema so it never creates a table
	taskList.push((args, next) => args.sqlDb.getTable(SESSIONS_TABLE_NAME, { suppressDynamicSchema: true }, mergeArgs(args, next, 'sessionsTable')));

	taskList.push((args, next) => {
		if (!isApply) {
			next('', args);
			return;
		}
		if (fs.existsSync(backupFilePath)) {
			next(`backupFilePath already exists, refusing to overwrite it: ${backupFilePath}`, args);
			return;
		}
		args.sessionsTable.runStatement(`VACUUM INTO ${sqlString.escape(backupFilePath)};`, { noTableNameOk: true }, (backupError) => {
			if (backupError || !fs.existsSync(backupFilePath)) {
				next(`backup to ${backupFilePath} failed: ${backupError || 'no file written'}`, args);
				return;
			}
			report.backupFilePath = backupFilePath;
			next('', args);
		});
	});

	taskList.push((args, next) => args.sessionsTable.getData(`SELECT name, tbl_name AS tableName, sql FROM sqlite_master WHERE type = 'trigger';`, { noTableNameOk: true }, (err, triggerRowList = []) => {
		const wherelessList = triggerRowList.filter(isWherelessTimestampTrigger);
		report.triggerReplacedList = wherelessList.map((triggerRow) => triggerRow.tableName);
		next(err, { ...args, wherelessList });
	}));

	// the scan of every text column (reported only, except dme_sessions which is repaired below)
	taskList.push((args, next) => args.sessionsTable.getData(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';`, { noTableNameOk: true }, (err, tableRowList = []) => {
		const countStatementList = [];
		tableRowList.forEach((tableRow) => countStatementList.push(tableRow.name));
		next(err, { ...args, tableNameList: countStatementList });
	}));
	taskList.push((args, next) => {
		const scanNext = (remainingTableNameList) => {
			if (!remainingTableNameList.length) {
				next('', args);
				return;
			}
			const tableName = remainingTableNameList[0];
			args.sessionsTable.getData(`SELECT name FROM pragma_table_info(${sqlString.escape(tableName)});`, { noTableNameOk: true }, (columnError, columnRowList = []) => {
				if (columnError) {
					next(columnError, args);
					return;
				}
				const countSql = columnRowList.map((columnRow) => `SELECT ${sqlString.escape(columnRow.name)} AS columnName, count(*) AS doubledRowCount FROM [${tableName}] WHERE CAST([${columnRow.name}] AS TEXT) LIKE ${sqlString.escape(DOUBLED_APOSTROPHE_LIKE_PATTERN)}`).join(' UNION ALL ');
				args.sessionsTable.getData(`${countSql};`, { noTableNameOk: true }, (countError, countRowList = []) => {
					if (countError) {
						next(countError, args);
						return;
					}
					countRowList.filter((countRow) => countRow.doubledRowCount > 0).forEach((countRow) => {
						report.otherDoubledByColumn[`${tableName}.${countRow.columnName}`] = countRow.doubledRowCount;
					});
					scanNext(remainingTableNameList.slice(1));
				});
			});
		};
		scanNext(args.tableNameList);
	});

	taskList.push((args, next) => {
		if (!args.tableNameList.includes(SESSIONS_TABLE_NAME)) {
			next('', { ...args, repairedRowList: [] });
			return;
		}
		args.sessionsTable.getData(`SELECT refId, sessionName, sessionData FROM <!tableName!>;`, {}, (err, sessionRowList = []) => {
			if (err) {
				next(err, args);
				return;
			}
			report.sessionRowCount = sessionRowList.length;
			const doubledRowList = sessionRowList.filter((sessionRow) => /''/.test(String(sessionRow.sessionData)) || /''/.test(String(sessionRow.sessionName)));
			report.sessionDoubledRowCount = doubledRowList.length;
			const repairedRowList = [];
			doubledRowList.forEach((sessionRow) => {
				const { repairedRow, flagText } = repairOfSessionRow(sessionRow);
				if (flagText) report.sessionFlaggedList.push({ refId: sessionRow.refId, flagText });
				if (repairedRow) repairedRowList.push(repairedRow);
			});
			report.sessionRepairedRowCount = repairedRowList.length;
			next('', { ...args, repairedRowList });
		});
	});

	// ONE transaction: replace the WHERE-less triggers; then, with dme_sessions' trigger out of the way so the repair
	// keeps each row's updatedAt, write the repaired rows, and put that trigger back in its correct form
	taskList.push((args, next) => {
		if (!isApply) {
			next('', args);
			return;
		}
		const sessionsTriggerName = `${SESSIONS_TABLE_NAME}UpdateTimestamp`;
		const triggerStatementList = args.wherelessList.flatMap((triggerRow) => [`DROP TRIGGER [${triggerRow.name}];`, correctTriggerSqlOf(triggerRow.tableName)]);
		const rowStatementList = args.repairedRowList.length
			? [
					`DROP TRIGGER IF EXISTS [${sessionsTriggerName}];`,
					...args.repairedRowList.map((repairedRow) => `UPDATE [${SESSIONS_TABLE_NAME}] SET [sessionData] = ${sqlString.escape(repairedRow.sessionData)}, [sessionName] = ${sqlString.escape(repairedRow.sessionName)} WHERE [refId] = ${sqlString.escape(repairedRow.refId)};`),
					correctTriggerSqlOf(SESSIONS_TABLE_NAME),
				]
			: [];
		const statementList = [...triggerStatementList, ...rowStatementList];
		if (!statementList.length) {
			next('', args);
			return;
		}
		args.sessionsTable.runStatement(['BEGIN;', ...statementList, 'COMMIT;'].join('\n'), { noTableNameOk: true }, (err) => {
			if (err) {
				args.sessionsTable.runStatement('ROLLBACK;', { noTableNameOk: true }, () => next(`repair rolled back, nothing changed: ${err}`, args));
				return;
			}
			next('', args);
		});
	});

	taskList.push((args, next) => {
		if (!args.tableNameList.includes(SESSIONS_TABLE_NAME)) {
			next('', args);
			return;
		}
		args.sessionsTable.getData(`SELECT count(*) AS doubledRowCount FROM <!tableName!> WHERE [sessionData] LIKE ${sqlString.escape(DOUBLED_APOSTROPHE_LIKE_PATTERN)} OR [sessionName] LIKE ${sqlString.escape(DOUBLED_APOSTROPHE_LIKE_PATTERN)};`, {}, (err, countRowList = []) => {
			report.afterDoubledRowCount = (countRowList[0] || {}).doubledRowCount;
			next(err, args);
		});
	});

	pipeRunner(taskList.getList(), {}, (err) => callback(err ? `${moduleName}: ${err}` : '', report));
};

// ================================================================================
// COMMAND LINE

if (require.main === module) {
	const commandLineParameters = require('qtools-parse-command-line').getParameters();
	const databaseFilePath = commandLineParameters.qtGetSurePath('values.databaseFilePath[0]', '');
	const backupFilePath = commandLineParameters.qtGetSurePath('values.backupFilePath[0]', '');
	const isApply = !!commandLineParameters.switches.apply;
	const isDryRun = !!commandLineParameters.switches.dryRun;

	const refusalText = !databaseFilePath
		? '--databaseFilePath is required'
		: !fs.existsSync(databaseFilePath)
			? `no database file at ${databaseFilePath}`
			: isApply === isDryRun
				? 'give exactly one of -dryRun or -apply'
				: isApply && !backupFilePath
					? '-apply requires --backupFilePath (where the pre-repair copy is written)'
					: '';
	if (refusalText) {
		process.stderr.write(`${moduleName}: ${refusalText}\n`);
		process.exit(1);
	}

	process.global = { xLog: { status: () => {}, error: (errorText) => process.stderr.write(`${errorText}\n`), verbose: () => {}, result: () => {}, debug: () => {}, color: {} }, getConfig: () => ({}), rawConfig: {}, commandLineParameters };
	const sqlString = require('sqlstring-sqlite');
	runRepair({ databaseFilePath: path.resolve(databaseFilePath), backupFilePath: backupFilePath && path.resolve(backupFilePath), isApply, sqlString }, (err, report) => {
		process.stdout.write(`${JSON.stringify(report, null, '\t')}\n`);
		if (err) {
			process.stderr.write(`${err}\n`);
			process.exit(1);
		}
		process.exit(0);
	});
}

module.exports = { undoubledTurnListOf, undoubledSessionNameOf, repairOfSessionRow, isWherelessTimestampTrigger, correctTriggerSqlOf, runRepair };
