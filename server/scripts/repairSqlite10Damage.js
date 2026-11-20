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
// RUN IT BEFORE THE 11.0 SERVER FIRST OPENS THE DATABASE. Rows saved by 11.0 hold typed apostrophes exactly, and a typed
// pair (SQL '') in them would read as one doubling. The marker is the journal mode: the old module never set WAL and
// 11.0 sets it on every open, so -apply REFUSES a database already in WAL mode. -acceptWalDatabase overrides that, for
// an operator who knows no 11.0 server has saved to this file (another tool may have set WAL).
//
// -dryRun opens the file READ-ONLY and changes nothing, not even the journal mode. -apply writes a consistent copy to
// backupFilePath (VACUUM INTO; refused if that file exists), then reads and repairs inside ONE BEGIN IMMEDIATE
// transaction, so no save can land between the read and the write. It keeps the journal mode as it found it and keeps
// each session's updatedAt, and marks the file repaired (PRAGMA user_version 1001): a second -apply is refused by name
// and a -dryRun reports isAlreadyRepaired. Stop the API server first all the same.
//
// HOW THE UN-DOUBLING DECIDES, AND WHEN IT REFUSES TO GUESS. Each save doubled every apostrophe in the whole session, so
// text that has been through n saves holds each typed apostrophe as a run of 2^n. A turn's prompt, stdout and stderr
// entered together and share one n; later turns have been through no more saves than earlier ones.
//   - A turn's n is PINNED by its word-internal apostrophes (a letter on both sides: John's, don't), which nobody types
//     as pairs: n = log2 of the shortest such run. Every run in the turn must then divide by 2^n.
//   - A turn with apostrophes but none word-internal (only SQL '', or HTML attributes quoted with ') is not pinned by
//     itself. Its n is bounded: at least 1 (every stored turn went through the session's last save) and at least any
//     later turn's; at most what its own runs allow (each typed run is at least 1 long and divides by 2^n) and at most
//     any earlier turn's. When the bounds meet, that is n. When they do not, the ROW IS FLAGGED: never guessed.
//   - A pinned n outside those bounds, or a shortest word-internal run that is not a power of two: FLAGGED.
// A flagged row is left exactly as it is, with its reason in the report, for a person to look at.
// sessionName is regenerated on every save and written once: one unit, pinned the same way, flagged if it cannot be.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const path = require('path');
const fs = require('fs');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

const SESSIONS_TABLE_NAME = 'dme_sessions';
const DOUBLED_APOSTROPHE_LIKE_VALUE = "%''%"; // a bound value, not SQL text: two apostrophes in a row
// PRAGMA user_version written by -apply (nothing else in educore uses user_version): repaired text is single-escaped,
// and the rule (every stored turn went through at least one save) no longer holds for it, so a repaired file is not
// examined again
const REPAIRED_USER_VERSION = 1001;

// ================================================================================
// PURE: the un-doubling

const isPowerOfTwo = (runLength) => runLength > 0 && Number.isInteger(Math.log2(runLength));

// every apostrophe run in a text, with whether a letter sits on both sides of it
const apostropheRunListOf = (text) =>
	[...String(text).matchAll(/'+/g)].map((runMatch) => {
		const beforeText = String(text).slice(0, runMatch.index);
		const afterText = String(text).slice(runMatch.index + runMatch[0].length);
		return { runLength: runMatch[0].length, isWordInternal: /\p{L}$/u.test(beforeText) && /^\p{L}/u.test(afterText) };
	});

// -> { saveCount: n | null (not pinned), flagText }
const pinnedSaveCountOf = (runList) => {
	const wordInternalLengthList = runList.filter((run) => run.isWordInternal).map((run) => run.runLength);
	if (!wordInternalLengthList.length) return { saveCount: null, flagText: '' };
	const shortestWordInternalLength = Math.min(...wordInternalLengthList);
	if (!isPowerOfTwo(shortestWordInternalLength)) return { saveCount: null, flagText: `shortest word-internal apostrophe run ${shortestWordInternalLength} is not a power of two` };
	return { saveCount: Math.log2(shortestWordInternalLength), flagText: '' };
};

const undoubledTextOf = (text, saveCount) => String(text).replace(/'+/g, (run) => "'".repeat(run.length / 2 ** saveCount));

const runListOfTurn = (turn) =>
	Object.keys(turn)
		.filter((propertyName) => typeof turn[propertyName] === 'string')
		.flatMap((propertyName) => apostropheRunListOf(turn[propertyName]));

// the most saves a set of runs allows: a typed run is at least 1 long, and every run must divide by 2^n
const twoAdicValuationOf = (runLength) => (runLength % 2 === 0 ? 1 + twoAdicValuationOf(runLength / 2) : 0);
const saveCountUpperBoundOf = (runList) => Math.min(...runList.map((run) => Math.min(Math.floor(Math.log2(run.runLength)), twoAdicValuationOf(run.runLength))));

// -> { repairedTurnList, flagText }   flagText non-empty means: do not repair this row, a person must look
const undoubledTurnListOf = (turnList) => {
	const turnInfoList = turnList.map((turn) => {
		const runList = runListOfTurn(turn);
		return { runList, ...pinnedSaveCountOf(runList), upperBound: runList.length ? saveCountUpperBoundOf(runList) : Infinity };
	});
	const pinFlagIndex = turnInfoList.findIndex((turnInfo) => turnInfo.flagText);
	if (pinFlagIndex !== -1) return { repairedTurnList: [], flagText: `turn ${pinFlagIndex + 1}: ${turnInfoList[pinFlagIndex].flagText}` };

	// resolved n per turn: pinned turns first; then, until nothing changes, a turn whose bounds meet. Every stored turn went
	// through at least the session's last save (n >= 1), no later turn through more saves than it, no earlier through fewer.
	const resolvedList = turnInfoList.map((turnInfo) => turnInfo.saveCount);
	const boundsOf = (turnIndex) => {
		const laterList = resolvedList.slice(turnIndex + 1).filter((saveCount) => saveCount !== null);
		const earlierList = resolvedList.slice(0, turnIndex).filter((saveCount) => saveCount !== null);
		return { lowerBound: Math.max(1, ...laterList), upperBound: Math.min(turnInfoList[turnIndex].upperBound, ...earlierList) };
	};
	let isChanged = true;
	while (isChanged) {
		isChanged = false;
		turnInfoList.forEach((turnInfo, turnIndex) => {
			if (resolvedList[turnIndex] !== null || !turnInfo.runList.length) return;
			const { lowerBound, upperBound } = boundsOf(turnIndex);
			if (lowerBound === upperBound) {
				resolvedList[turnIndex] = lowerBound;
				isChanged = true;
			}
		});
	}

	for (let turnIndex = 0; turnIndex < turnInfoList.length; turnIndex++) {
		const { runList } = turnInfoList[turnIndex];
		if (!runList.length) continue;
		const saveCount = resolvedList[turnIndex];
		const { lowerBound, upperBound } = boundsOf(turnIndex);
		if (saveCount === null) {
			return {
				repairedTurnList: [],
				flagText: `turn ${turnIndex + 1}: none of its apostrophes is inside a word, and its save count could be anything from ${lowerBound} to ${upperBound} (typed pairs such as SQL '' cannot be told from doubling)`,
			};
		}
		if (saveCount < lowerBound || saveCount > upperBound) {
			return { repairedTurnList: [], flagText: `turn ${turnIndex + 1}: reads as ${saveCount} saves, outside the ${lowerBound} to ${upperBound} its neighbours and its own runs allow` };
		}
	}

	const repairedTurnList = turnList.map((turn, turnIndex) =>
		Object.keys(turn).reduce(
			(soFar, propertyName) => ({ ...soFar, [propertyName]: typeof turn[propertyName] === 'string' && turnInfoList[turnIndex].runList.length ? undoubledTextOf(turn[propertyName], resolvedList[turnIndex]) : turn[propertyName] }),
			{},
		),
	);
	return { repairedTurnList, flagText: '' };
};

// -> { repairedSessionName, flagText }   one unit with its own n, bounded and pinned as a turn is
const undoubledSessionNameOf = (sessionName) => {
	const runList = apostropheRunListOf(sessionName);
	if (!runList.length) return { repairedSessionName: sessionName, flagText: '' };
	const nameRepair = undoubledTurnListOf([{ sessionName }]);
	if (nameRepair.flagText) return { repairedSessionName: sessionName, flagText: nameRepair.flagText.replace(/^turn 1/, 'sessionName') };
	return { repairedSessionName: nameRepair.repairedTurnList[0].sessionName, flagText: '' };
};

// -> { repairedRow | null, flagText }  repairedRow null means nothing to change
const repairOfSessionRow = (sessionRow) => {
	const sessionDataText = String(sessionRow.sessionData || '');
	if (!/^\s*\[[\s\S]*\]\s*$/.test(sessionDataText)) {
		return { repairedRow: null, flagText: 'sessionData is not a JSON list' };
	}
	const turnList = JSON.parse(sessionDataText); // a malformed list throws here, inside the database boundary: rolled back, nothing changed
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
// THE DATABASE BOUNDARY

// better-sqlite3 has no non-throwing calls; THIS is the script's one try/catch, where a throw becomes an error string
// (the same boundary sqlite-instance 11.0 keeps in callbackFromThrowingCall). The callback runs outside the try.
const databaseCallOf = (throwingCall, callback) => {
	let outcome;
	try {
		outcome = { result: throwingCall() };
	} catch (thrownError) {
		outcome = { errString: String(thrownError && thrownError.message ? thrownError.message : thrownError) };
	}
	callback(outcome.errString || '', outcome.result);
};

// everything the report needs, read on an open connection; repairs are prepared, not written
const surveyOf = (db, isAlreadyRepaired) => {
	const triggerRowList = db.prepare("SELECT name, tbl_name AS tableName, sql FROM sqlite_master WHERE type = 'trigger'").all();
	const tableNameList = db
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
		.all()
		.map((tableRow) => tableRow.name);
	const otherDoubledByColumn = {};
	tableNameList.forEach((tableName) => {
		db.prepare('SELECT name FROM pragma_table_info(?)')
			.all(tableName)
			.forEach((columnRow) => {
				const doubledRowCount = db.prepare(`SELECT count(*) AS doubledRowCount FROM [${tableName}] WHERE CAST([${columnRow.name}] AS TEXT) LIKE ?`).get(DOUBLED_APOSTROPHE_LIKE_VALUE).doubledRowCount;
				if (doubledRowCount > 0) otherDoubledByColumn[`${tableName}.${columnRow.name}`] = doubledRowCount;
			});
	});
	const hasSessionsTable = tableNameList.includes(SESSIONS_TABLE_NAME);
	const sessionRowList = hasSessionsTable ? db.prepare(`SELECT refId, sessionName, sessionData FROM [${SESSIONS_TABLE_NAME}]`).all() : [];
	const doubledRowList = isAlreadyRepaired ? [] : sessionRowList.filter((sessionRow) => /''/.test(String(sessionRow.sessionData)) || /''/.test(String(sessionRow.sessionName)));
	const repairedRowList = [];
	const sessionFlaggedList = [];
	doubledRowList.forEach((sessionRow) => {
		const { repairedRow, flagText } = repairOfSessionRow(sessionRow);
		if (flagText) sessionFlaggedList.push({ refId: sessionRow.refId, flagText });
		if (repairedRow) repairedRowList.push(repairedRow);
	});
	return { wherelessList: triggerRowList.filter(isWherelessTimestampTrigger), otherDoubledByColumn, hasSessionsTable, sessionRowCount: sessionRowList.length, sessionDoubledRowCount: doubledRowList.length, repairedRowList, sessionFlaggedList };
};

// replace the WHERE-less triggers; then, with dme_sessions' trigger out of the way so each row keeps its updatedAt,
// write the repaired rows and put that trigger back in its correct form
const writeRepairs = (db, survey) => {
	survey.wherelessList.forEach((triggerRow) => {
		db.exec(`DROP TRIGGER [${triggerRow.name}];`);
		db.exec(correctTriggerSqlOf(triggerRow.tableName));
	});
	if (!survey.repairedRowList.length) return;
	db.exec(`DROP TRIGGER IF EXISTS [${SESSIONS_TABLE_NAME}UpdateTimestamp];`);
	const updateStatement = db.prepare(`UPDATE [${SESSIONS_TABLE_NAME}] SET [sessionData] = ?, [sessionName] = ? WHERE [refId] = ?`);
	survey.repairedRowList.forEach((repairedRow) => updateStatement.run(repairedRow.sessionData, repairedRow.sessionName, repairedRow.refId));
	db.exec(correctTriggerSqlOf(SESSIONS_TABLE_NAME));
};

const doubledCountAfterOf = (db, hasSessionsTable) =>
	hasSessionsTable
		? db.prepare(`SELECT count(*) AS doubledRowCount FROM [${SESSIONS_TABLE_NAME}] WHERE [sessionData] LIKE ? OR [sessionName] LIKE ?`).get(DOUBLED_APOSTROPHE_LIKE_VALUE, DOUBLED_APOSTROPHE_LIKE_VALUE).doubledRowCount
		: 0;

// ================================================================================
// THE RUN

const runRepair = ({ databaseFilePath, backupFilePath, isApply, isWalAccepted }, callback) => {
	const Database = require('better-sqlite3');
	const report = { databaseFilePath, mode: isApply ? 'apply' : 'dryRun', journalModeFound: '', triggerReplacedList: [], otherDoubledByColumn: {}, sessionRowCount: 0, sessionDoubledRowCount: 0, sessionRepairedRowCount: 0, sessionFlaggedList: [], afterDoubledRowCount: null };
	const taskList = new taskListPlus();

	taskList.push((args, next) => databaseCallOf(() => new Database(databaseFilePath, { readonly: !isApply, fileMustExist: true }), (err, db) => next(err, { ...args, db })));

	taskList.push((args, next) =>
		databaseCallOf(
			() => args.db.pragma('user_version', { simple: true }),
			(err, userVersion) => {
				report.isAlreadyRepaired = userVersion === REPAIRED_USER_VERSION;
				if (!err && isApply && report.isAlreadyRepaired) {
					next('refused: this database was already repaired (user_version ' + REPAIRED_USER_VERSION + '); a second repair would halve typed apostrophe pairs', args);
					return;
				}
				if (!err && isApply && userVersion !== 0 && !report.isAlreadyRepaired) {
					next(`refused: the database's user_version is ${userVersion}, not 0, so something else uses it and this repair will not overwrite it`, args);
					return;
				}
				next(err, args);
			},
		),
	);

	taskList.push((args, next) =>
		databaseCallOf(
			() => args.db.pragma('journal_mode', { simple: true }),
			(err, journalMode) => {
				report.journalModeFound = journalMode;
				if (!err && isApply && journalMode === 'wal' && !isWalAccepted) {
					next('refused: the database is already in WAL mode, so an 11.0 server has probably opened it, and rows it saved can hold typed apostrophe pairs this repair would halve. If you know no 11.0 server has saved to it, add -acceptWalDatabase', args);
					return;
				}
				next(err, args);
			},
		),
	);

	taskList.push((args, next) => {
		if (!isApply) {
			next('', args);
			return;
		}
		if (fs.existsSync(backupFilePath)) {
			next(`backupFilePath already exists, refusing to overwrite it: ${backupFilePath}`, args);
			return;
		}
		databaseCallOf(
			() => args.db.prepare('VACUUM INTO ?').run(backupFilePath),
			(err) => {
				if (err || !fs.existsSync(backupFilePath)) {
					next(`backup to ${backupFilePath} failed: ${err || 'no file written'}`, args);
					return;
				}
				report.backupFilePath = backupFilePath;
				next('', args);
			},
		);
	});

	// -apply: from here to COMMIT is one BEGIN IMMEDIATE transaction, so no save lands between the read and the write
	taskList.push((args, next) => (isApply ? databaseCallOf(() => args.db.exec('BEGIN IMMEDIATE;'), (err) => next(err, { ...args, isInTransaction: !err })) : next('', args)));

	taskList.push((args, next) =>
		databaseCallOf(
			() => {
				const survey = surveyOf(args.db, report.isAlreadyRepaired);
				if (isApply) {
					writeRepairs(args.db, survey);
					args.db.pragma(`user_version = ${REPAIRED_USER_VERSION}`);
				}
				return survey;
			},
			(err, survey) => {
				if (err) {
					next(isApply ? `repair rolled back, nothing changed: ${err}` : err, args);
					return;
				}
				report.triggerReplacedList = survey.wherelessList.map((triggerRow) => triggerRow.tableName);
				report.otherDoubledByColumn = survey.otherDoubledByColumn;
				report.sessionRowCount = survey.sessionRowCount;
				report.sessionDoubledRowCount = survey.sessionDoubledRowCount;
				report.sessionRepairedRowCount = isApply ? survey.repairedRowList.length : 0;
				report.sessionRepairableRowCount = survey.repairedRowList.length;
				report.sessionFlaggedList = survey.sessionFlaggedList;
				next('', { ...args, hasSessionsTable: survey.hasSessionsTable });
			},
		),
	);

	taskList.push((args, next) => (args.isInTransaction ? databaseCallOf(() => args.db.exec('COMMIT;'), (err) => next(err, { ...args, isInTransaction: !!err })) : next('', args)));

	taskList.push((args, next) =>
		databaseCallOf(
			() => doubledCountAfterOf(args.db, args.hasSessionsTable),
			(err, doubledRowCount) => {
				report.afterDoubledRowCount = doubledRowCount;
				next(err, args);
			},
		),
	);

	pipeRunner(taskList.getList(), {}, (err, args) => {
		const { db, isInTransaction } = args || {};
		if (db && isInTransaction) databaseCallOf(() => db.exec('ROLLBACK;'), () => {});
		if (db) databaseCallOf(() => db.close(), () => {});
		callback(err ? `${moduleName}: ${err}` : '', report);
	});
};

// ================================================================================
// COMMAND LINE

if (require.main === module) {
	const commandLineParameters = require('qtools-parse-command-line').getParameters();
	const databaseFilePath = commandLineParameters.qtGetSurePath('values.databaseFilePath[0]', '');
	const backupFilePath = commandLineParameters.qtGetSurePath('values.backupFilePath[0]', '');
	const isApply = !!commandLineParameters.switches.apply;
	const isDryRun = !!commandLineParameters.switches.dryRun;
	const isWalAccepted = !!commandLineParameters.switches.acceptWalDatabase;

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

	runRepair({ databaseFilePath: path.resolve(databaseFilePath), backupFilePath: backupFilePath && path.resolve(backupFilePath), isApply, isWalAccepted }, (err, report) => {
		process.stdout.write(`${JSON.stringify(report, null, '\t')}\n`);
		if (err) {
			process.stderr.write(`${err}\n`);
			process.exit(1);
		}
		process.exit(0);
	});
}

module.exports = { undoubledTurnListOf, undoubledSessionNameOf, repairOfSessionRow, isWherelessTimestampTrigger, correctTriggerSqlOf, runRepair };
