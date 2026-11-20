#!/usr/bin/env node
'use strict';
// @concept: [[SqliteAbstraction]]

// EDUCORE COPY (2026-11-19, branch fix/dmeSessionResume, TQ: "do the whole thing"): the scaffold's 11.0, copied
// verbatim apart from this paragraph and the @concept line above. It replaces a pre-10.0 node-sqlite3 copy that had
// taken only the 10.1 repair (efed1d7) and the trigger WHERE clause (3eecff4). better-sqlite3 was already a root
// dependency (system/code/package.json, 14c4cc1), so the driver swap adds no package. The 10.0 damage this copy
// cannot undo by itself (doubled apostrophes in stored rows, WHERE-less triggers on old tables) is repaired by
// server/scripts/repairSqlite10Damage.js. Tests: tests/index.test.js (scaffold suite, unchanged).

// =====================================================================
// sqlite-instance — VERSION 11.0
// =====================================================================
//
// ON THE VERSION NUMBER, which is frankly made up
//
// There was no version number before 10.0. Ten is an arbitrary choice: it
// says this module is old and mature — it has backed every table in every
// project of this family for years — and that it was only then brought
// under some discipline, at Milo's mentorship. The number is a starting line,
// not a history. Semver from there: PATCH for a repair that cannot change any
// caller's behavior, MINOR for a repair that changes behavior only where the
// code was already failing, MAJOR for anything that can break a working call.
//
// THE CANONICAL ORIGIN is the project scaffold
// (BBEdit/Clippings/_SHELL/projectScaffold/installationLibrary/system/code/
// server/data-model/lib/sqlite-instance/). Every application holds a
// derivative copy and takes a version deliberately, with tqii's agreement.
// THIS COPY (the scaffold) IS the canonical origin. lennyPens was the origin
// through 10.1; tqii moved it here on 2026-09-24. 11.0 was built in
// bidConnector (b69cd58), ported to and tested in lennyPens (8cce5da), and
// copied here unchanged apart from this paragraph.
//
// PROOF lives beside the module: tests/index.test.js runs every suite
// against a throwaway database in /tmp/sqliteInstanceTests.
//
// ---------------------------------------------------------------------
// VERSION HISTORY
// ---------------------------------------------------------------------
//
// 11.0  2026-09-24  Consolidation of the scaffold/lennyPens line (10.1) with
//                   bidConnector's fork, built in bidConnector. MAJOR, for one
//                   reason: item 1.
//
//       0. bidConnector's copy moves from node-sqlite3 (async) to
//          better-sqlite3 (synchronous under the same callback API), the
//          driver of the rest of the family (tqii: 'everyone should use
//          better-sqlite'). What a caller of the old bidConnector copy feels:
//          double-quoted string literals are rejected (use single quotes);
//          getData runs prepare().all(), which refuses statements that return
//          no rows (use runStatement for writes); callbacks fire before the
//          call returns; the database opens in WAL mode (-wal and -shm files
//          beside it); an error is a string, not an Error object; the table
//          object gains deleteObject, the database object checkTableExists;
//          saveObject reports a failure WITH the refId (the 10.1 contract).
//
//       1. OPTIONS NO LONGER LEAK BETWEEN CALLS (the reason this is MAJOR).
//          Every entry point did Object.assign(defaultOptions, options), which
//          wrote each call's options INTO the defaults shared by every table
//          on the database instance. A call that passed no options object was
//          then judged by whatever the last caller had passed: one
//          getData(..., {noTableNameOk:true}) switched the <!tableName!> guard
//          off for every later option-less call on every table, and one
//          {suppressStatementLog:false} turned statement logging on for all.
//          Now each call merges into a fresh object and nothing writes the
//          defaults. THIS CAN BREAK A WORKING CALL: an option-less, untagged
//          getData/runStatement that succeeded only because some earlier call
//          had leaked noTableNameOk:true is now refused. Hence MAJOR. Fix at
//          the call site by passing the option that call actually needs.
//          Also: options passed to getTable(name, options) are now that
//          TABLE's defaults for every later call on it (previously they
//          leaked into every table).
//          A related quiet change: a call passing a partial options object
//          now gets the defaults for what it omits (10.1 used the partial
//          object alone, so e.g. {noTableNameOk:true} also switched statement
//          logging ON). Net effect: less logging, nothing refused.
//
//       2. refId IS ESCAPED in saveObject's existing-row SELECT and its
//          UPDATE ... WHERE. It was pasted in raw: saveObject({refId:
//          "x' OR '1'='1"}) matched every row and rewrote an existing row's
//          refId and data; a refId containing an apostrophe was a syntax
//          error. (Fixed in bidConnector's fork 2026-09-24; found by its
//          crmSync lane B probe.) MINOR on its own.
//
//       3. VALUES ARE NEVER TEMPLATED. saveObject and deleteObject used to
//          send their SQL through the same qtTemplateReplace as caller SQL, so
//          a stored value containing the text <!tableName!> was silently
//          rewritten to the table name. They now write the table name
//          themselves and execute the statement untemplated. MINOR.
//
//       4. NEW, OPT-IN: bulkInsert. saveObject(list, {bulkInsert:true}) writes
//          the list in batches of BULK_INSERT_BATCH_SIZE rows, ONE statement
//          per batch (INSERT ... ON CONFLICT([refId]) DO UPDATE), so a batch
//          is written whole or not at all. Carried from bidConnector's saveList
//          and REBUILT, because that version doubled apostrophes (stored
//          O''Brien), used INSERT OR REPLACE (reset createdAt on every
//          re-save), saved-then-deleted a record to learn the schema, reported
//          refIds for a batch that failed, and — with suppressDynamicSchema —
//          wrote rows with a NULL refId and lost rows while reporting success,
//          and crashed the process (taskList.unshift is not a function) when
//          the first record had no refId. NOTE for bidConnector: its arrays
//          were ALWAYS bulk before 11.0; callers that want bulk now say so
//          (helix-sync-set passes bulkInsert:true).
//          Semantics match saveObject: a field absent from a record keeps its
//          stored value (COALESCE(excluded.x, x)). Without bulkInsert, an array
//          is saved row by row exactly as in 10.1.
//
//       5. NEW, OPT-IN: suppressDynamicSchema and strictSchema (from
//          bidConnector). suppressDynamicSchema: getTable does not create the
//          table, and saves add no columns — a missing table is refused by
//          name and unknown fields are dropped with a warning. strictSchema
//          (only meaningful with suppressDynamicSchema, refused without it):
//          unknown fields refuse the save, by name. Either may be given to
//          getTable (the table's default) or to a single call. The three
//          boolean options are type-checked and refused by name.
//
//       6. Column introspection uses PRAGMA table_info instead of parsing the
//          CREATE TABLE text. The parser (getFieldNames) missed columns
//          declared in forms it did not recognize, and the save then failed
//          with "duplicate column name". Changes only calls that were failing.
//
//       7. The module's ONLY try/catch is callbackFromThrowingCall, the
//          boundary adapter for better-sqlite3 (which has no non-throwing
//          exec/prepare). The driver's own error text is passed through.
//          A caller can feel this: 10.1 ran the caller's callback INSIDE its
//          try, so an exception thrown in caller code inside a db callback was
//          caught and the callback called a SECOND time, with that exception
//          as its error (runStatement also logged it as 'SQL Error'). 11.0 runs
//          the callback outside the try, so that exception now propagates to
//          the caller like any other throw.
//
//       8. saveObject(list, callback) — options omitted — no longer crashes
//          (10.1 dispatched arrays before sorting out the arguments).
//
//       9. LONG LISTS NO LONGER OVERFLOW THE STACK. better-sqlite3 calls back
//          before returning, so pipeRunner over a list recursed once per item:
//          10.1's row-by-row saveObject(list) failed with 'Maximum call stack
//          size exceeded' at about 250 rows (reported as a save error, after
//          writing the first 249). Each list item and each bulk batch now
//          starts on a fresh stack (setImmediate). MINOR: only failing calls change.
//
//       NOT changed, deliberately: string values are still trimmed, and
//       getTable still rewrites unsafe table names (owner.replace(/\W/g,'_')).
//       Changing either would alter working calls for no one's request. The
//       10.1 contract stands: saveObject reports an error WITH the refId.
//
//       Adopting 11.0 in an application: (a) sweep for option-less
//       getData/runStatement calls without <!tableName!> (item 1); (b) no
//       data repair is owed for 11.0 itself, but a project still below 10.0
//       owes the 10.0 repairs below. Proof: tests/ (every 11.0 gate observed
//       red against 10.1 before the change).
//
// 10.1  2026-08-04  saveObject REPORTS a refused write. (Made in lennyPens,
//                   then the origin.)
//
//       The insert/update stage caught the SQL error, pushed it onto a local
//       errorList that nothing ever read, and called next('') regardless. A
//       UNIQUE, NOT NULL or CHECK violation therefore reached the caller as
//       SUCCESS, carrying the refId of a row that was never written — no
//       caller could tell a completed write from a refused one. The dead
//       errorList is gone; the stage now propagates, in the same shape
//       deleteObject already used.
//
//       Why this is MINOR and not MAJOR: on a healthy write the error
//       argument is empty both before and after, so the success path is
//       unchanged for every caller. Behavior differs ONLY where a write was
//       already failing silently — the failure becomes loud instead of
//       invisible. Nothing that used to succeed can now fail.
//
//       Deliberately NOT changed, to keep that promise strict: the refId is
//       still returned alongside an error. A caller that ignores the error
//       argument behaves exactly as it did before, so adopting 10.1 cannot
//       introduce a crash. Nulling it was considered and rejected for that
//       reason.
//
//       Also deliberately deferred: a machine-readable way to distinguish a
//       constraint refusal from a genuine database failure. Callers that need
//       the distinction must currently match on the error text. Adding a
//       structured third argument later disturbs no existing caller, so the
//       shape is better decided when a second caller actually needs it than
//       guessed at now.
//
//       Proof: lennyPens server/test/__TEST_sqliteInstance_deleteAndEscaping.js,
//       since 11.0 at tests/deleteAndEscaping.test.js — the
//       error-propagation checks were OBSERVED failing against the unfixed
//       module (reporting success on a refused insert) alongside two passing
//       integrity controls that confirm the index really did refuse the row.
//
// 10.0  2026-07-21  The pre-version state, numbered in retrospect.
//
//       Three changes made that day, before this history existed: deleteObject
//       added to the table object (with a hard refId guard, because an
//       unguarded delete builds a WHERE clause matching nothing or
//       everything); apostrophes escaped ONCE instead of twice (values were
//       being STORED as it''s); and the auto-created updatedAt trigger given a
//       WHERE clause, so updating one row no longer restamps every row in the
//       table.
//
//       NOTE for anyone porting 10.0 into an older copy: the last two are bug
//       fixes that leave DAMAGE BEHIND. Existing tables keep their broken
//       trigger (CREATE TRIGGER IF NOT EXISTS never replaces it) and existing
//       rows keep their doubled apostrophes. Both need explicit per-database
//       repair — see the porting instructions in lennyPens'
//       system/code/CLAUDE.md. 10.1 and 11.0 carry no such obligation.
//
// =====================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');

const Database = require('better-sqlite3');

const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const sqlString = require('sqlstring-sqlite');

const newRefId = require('../new-refid')({
	excludedChars: ['0', 'O', '1', 'l'],
	digits: 20,
});

// Rows per INSERT statement in bulkInsert mode. One statement per batch keeps
// each batch atomic and stays far below SQLite's statement-length limits.
const BULK_INSERT_BATCH_SIZE = 500;

// Options that must be true or false when present; anything else is refused by name.
const booleanOptionNameList = ['suppressDynamicSchema', 'strictSchema', 'bulkInsert'];

// START OF moduleFunction() ============================================================

const moduleFunction = function ({ unused }) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(`${moduleName}`);

	// =====================================================================
	// HELPERS
	// =====================================================================

	const jsonToTsv = (jsonData) => {
		const allPropertyNames = Array.from(
			jsonData.reduce((propertyNameSet, obj) => {
				Object.keys(obj).forEach((propertyName) => propertyNameSet.add(propertyName));
				return propertyNameSet;
			}, new Set()),
		);

		const headers = allPropertyNames.join('\t');
		const rows = jsonData.map((obj) =>
			allPropertyNames.map((propertyName) => obj[propertyName] ?? '').join('\t'),
		);
		const tsvData = `${headers}\n${rows.join('\n')}`;

		return tsvData;
	};

	// -----
	// callbackFromThrowingCall — THE ONLY try/catch IN THIS MODULE.
	//
	// better-sqlite3 has no non-throwing exec/prepare: every SQL error arrives
	// as a thrown SqliteError. This adapter is the single boundary where that
	// throw becomes callback(errString), so everything above it stays
	// callback/pipeRunner. The driver's own message is passed through,
	// never replaced. The callback runs OUTSIDE the try, so an exception in
	// caller code is never mistaken for a database error.

	const callbackFromThrowingCall = (throwingCall, resultOnError, callback) => {
		let outcome;
		try {
			outcome = { result: throwingCall() };
		} catch (err) {
			outcome = { errString: err.toString() };
		}
		if (outcome.errString) {
			callback(outcome.errString, resultOnError);
			return;
		}
		callback(null, outcome.result);
	};

	// -----
	// mergeCallOptions — a fresh object per call. NEVER write into the defaults
	// (10.1 did, and one caller's options leaked into every other caller's).

	const mergeCallOptions = (baseOptions, callOptions) => ({
		...baseOptions,
		...callOptions,
	});

	// Returns an error string naming the offending option, or '' when valid.
	const validateOptions = (mergedOptions) => {
		const wrongTypeName = booleanOptionNameList.find(
			(optionName) =>
				mergedOptions[optionName] !== undefined &&
				typeof mergedOptions[optionName] != 'boolean',
		);
		if (wrongTypeName) {
			return `sqlite-instance option '${wrongTypeName}' must be true or false; got ${JSON.stringify(mergedOptions[wrongTypeName])}`;
		}
		if (mergedOptions.strictSchema && !mergedOptions.suppressDynamicSchema) {
			return `sqlite-instance option 'strictSchema' requires 'suppressDynamicSchema: true'; strictSchema alone has no meaning`;
		}
		return '';
	};

	// Scalar properties only; strings trimmed (unchanged since 10.0: do NOT escape
	// here, sqlString.escape() is the single point of SQL escaping).
	const cleanRecord = (inObj) => {
		const cleanObj = {};
		Object.keys(inObj).forEach((propertyName) => {
			if (
				['boolean', 'number', 'string', 'bigint'].includes(
					typeof inObj[propertyName],
				)
			) {
				cleanObj[propertyName] =
					typeof inObj[propertyName] == 'string'
						? inObj[propertyName].trim()
						: inObj[propertyName];
			}
		});
		return cleanObj;
	};

	const lowerCaseList = (nameList) => nameList.map((name) => name.toLowerCase());

	// Decide what a save may write, given the table's columns and the options.
	// Returns { errString } or { writableFieldNameList, addColumnNameList, droppedFieldNameList }.
	const planColumns = ({ tableName, tableExists, existingColumnNameList, incomingFieldNameList, mergedOptions }) => {
		const existingLowerList = lowerCaseList(existingColumnNameList);
		const unknownFieldNameList = incomingFieldNameList.filter(
			(fieldName) => !existingLowerList.includes(fieldName.toLowerCase()),
		);

		if (!mergedOptions.suppressDynamicSchema) {
			return {
				writableFieldNameList: incomingFieldNameList,
				addColumnNameList: unknownFieldNameList,
				droppedFieldNameList: [],
			};
		}

		if (!tableExists) {
			return {
				errString: `Table '${tableName}' does not exist and suppressDynamicSchema is enabled`,
			};
		}
		if (unknownFieldNameList.length && mergedOptions.strictSchema) {
			return {
				errString: `Fields [${unknownFieldNameList.join(', ')}] don't exist in table '${tableName}' and strictSchema is enabled`,
			};
		}
		const unknownLowerList = lowerCaseList(unknownFieldNameList);
		return {
			writableFieldNameList: incomingFieldNameList.filter(
				(fieldName) => !unknownLowerList.includes(fieldName.toLowerCase()),
			),
			addColumnNameList: [],
			droppedFieldNameList: unknownFieldNameList,
		};
	};

	// =====================================================================
	// DB ACCESS FUNCTIONS
	// =====================================================================

	// -----
	// executeStatementActual / executeQueryActual — run FINAL SQL, untemplated.
	// Used directly by saveObject/deleteObject, whose statements carry values
	// that must never pass through qtTemplateReplace.

	const executeStatementActual = (db) => (finalStatement, mergedOptions, callback) => {
		mergedOptions.suppressStatementLog || xLog.status(finalStatement);
		callbackFromThrowingCall(
			() => db.exec(finalStatement),
			undefined,
			(err) => {
				if (err) {
					xLog.error(
						`${''.padEnd(50, '-')}\nSQL Error; ${err}\nBad Statement:\n\t${finalStatement}\n${''.padEnd(50, '-')}\n`,
					);
					callback(err);
					return;
				}
				callback(null);
			},
		);
	};

	const executeQueryActual = (db) => (finalStatement, mergedOptions, callback) => {
		mergedOptions.suppressStatementLog || xLog.status(finalStatement);
		callbackFromThrowingCall(
			() => db.prepare(finalStatement).all(),
			[],
			callback,
		);
	};

	const missingTableNameTagMessage = (functionName) =>
		`SQL statement has no <!tableName!> substitution tag. This is not allowed. [${functionName}]`;

	// -----
	// runStatementActual — execute caller SQL (CREATE, INSERT, UPDATE, ALTER, etc.)

	const runStatementActual =
		(db, tableName, tableDefaultOptions, executeStatement) =>
		(statement, callOptions = {}, callback) => {
			if (typeof callOptions == 'function') {
				callback = callOptions;
				callOptions = {};
			}
			const mergedOptions = mergeCallOptions(tableDefaultOptions, callOptions);

			if (!mergedOptions.noTableNameOk && !statement.match(/<!tableName!>/)) {
				xLog.error(missingTableNameTagMessage('runStatementActual'));
				if (typeof callback == 'function') {
					callback(missingTableNameTagMessage('runStatementActual'), {});
					return;
				} else {
					return '';
				}
			}
			const finalStatement = statement.qtTemplateReplace({ tableName });

			if (typeof callback == 'function') {
				executeStatement(finalStatement, mergedOptions, callback);
			} else {
				mergedOptions.suppressStatementLog || xLog.status(finalStatement);
				db.exec(finalStatement);
			}
		};

	// =====================================================================
	// WORKING FUNCTIONS
	// =====================================================================

	// -----
	// getDataActual — execute a caller SELECT and return rows

	const getDataActual =
		(db, tableName, tableDefaultOptions, executeQuery) =>
		(statement, callOptions = {}, callback) => {
			if (typeof callOptions == 'function') {
				callback = callOptions;
				callOptions = {};
			}
			const mergedOptions = mergeCallOptions(tableDefaultOptions, callOptions);

			if (!mergedOptions.noTableNameOk && !statement.match(/<!tableName!>/)) {
				xLog.error(missingTableNameTagMessage('getDataActual'));
				if (typeof callback == 'function') {
					callback(missingTableNameTagMessage('getDataActual'), {});
					return;
				} else {
					return '';
				}
			}
			const finalStatement = statement.qtTemplateReplace({ tableName });

			if (typeof callback == 'function') {
				executeQuery(finalStatement, mergedOptions, callback);
			} else {
				mergedOptions.suppressStatementLog || xLog.status(finalStatement);
				return db.prepare(finalStatement).all();
			}
		};

	// -----
	// readColumnsActual — the table's column names; an empty list means no table

	const readColumnsActual = (executeQuery, tableName) => (mergedOptions, callback) => {
		executeQuery(
			`PRAGMA table_info([${tableName}]);`,
			{ ...mergedOptions, suppressStatementLog: true },
			(err, columnRowList = []) => {
				if (err) {
					callback(err);
					return;
				}
				if (mergedOptions.showCreateTableDebug) {
					console.dir(
						{ [`columns of ${tableName}`]: columnRowList },
						{ showHidden: false, depth: 4, colors: true },
					);
				}
				callback(null, {
					tableExists: columnRowList.length > 0,
					existingColumnNameList: columnRowList.map(({ name }) => name),
				});
			},
		);
	};

	const addColumnsActual = (executeStatement, tableName) => (addColumnNameList, mergedOptions, callback) => {
		if (!addColumnNameList.length) {
			callback(null);
			return;
		}
		xLog.status(
			`Adding ${addColumnNameList.length} new columns to ${tableName} in ${moduleName}`,
		);
		const statements = addColumnNameList
			.map((name) => `ALTER TABLE [${tableName}] ADD COLUMN [${name}] TEXT;`)
			.join('\n');
		executeStatement(statements, mergedOptions, callback);
	};

	// -----
	// saveListActual — save an array of records one at a time (the 10.1 path)

	const saveListActual =
		(saveObject) =>
		(inArray, mergedOptions, callback) => {
			const taskList = new taskListPlus();
			const resultList = [];

			inArray.forEach((record) => {
				taskList.push((args, next) => {
					const localCallback = (err, result) => {
						resultList.push(result);
						next(err, args);
					};

					// setImmediate: better-sqlite3 calls back synchronously, so without a
					// fresh stack per record a long list overflows (10.1 did at ~250 rows).
					setImmediate(() => saveObject(record, mergedOptions, localCallback));
				});
			});

			pipeRunner(taskList.getList(), {}, (err, args) => {
				callback(err, resultList);
			});
		};

	// -----
	// bulkSaveListActual — bulkInsert: one INSERT ... ON CONFLICT statement per batch

	const bulkSaveListActual =
		({ tableName, executeStatement, readColumns, addColumns }) =>
		(inArray, mergedOptions, callback) => {
			if (!inArray.length) {
				// nothing to write: the same answer the row-by-row path gives
				callback(null, []);
				return;
			}
			const notObjectIndex = inArray.findIndex(
				(record) => !record || typeof record != 'object' || Array.isArray(record),
			);
			if (notObjectIndex > -1) {
				callback(`bulkInsert: item ${notObjectIndex} is not an object (table: ${tableName})`, []);
				return;
			}

			const cleanRecordList = inArray.map((inObj) => {
				const cleanObj = cleanRecord(inObj);
				cleanObj.refId = cleanObj.refId ? cleanObj.refId : newRefId();
				return cleanObj;
			});

			const writtenRefIdList = [];
			const taskList = new taskListPlus();

			taskList.push((args, next) => {
				readColumns(mergedOptions, (err, columnState) => next(err, { ...args, ...columnState }));
			});

			taskList.push((args, next) => {
				const { tableExists, existingColumnNameList } = args;

				// every field in the list, first spelling wins (SQLite names are case-insensitive)
				const incomingFieldNameList = cleanRecordList.reduce((fieldNameList, cleanObj) => {
					Object.keys(cleanObj).forEach((fieldName) => {
						if (!lowerCaseList(fieldNameList).includes(fieldName.toLowerCase())) {
							fieldNameList.push(fieldName);
						}
					});
					return fieldNameList;
				}, []);

				const columnPlan = planColumns({ tableName, tableExists, existingColumnNameList, incomingFieldNameList, mergedOptions });
				if (columnPlan.errString) {
					xLog.error(columnPlan.errString);
					next(columnPlan.errString, args);
					return;
				}
				if (columnPlan.droppedFieldNameList.length) {
					xLog.warning(
						`Fields [${columnPlan.droppedFieldNameList.join(', ')}] don't exist in table '${tableName}' and will be ignored`,
					);
				}
				next('', { ...args, ...columnPlan });
			});

			taskList.push((args, next) => {
				addColumns(args.addColumnNameList, mergedOptions, (err) => next(err, args));
			});

			taskList.push((args, next) => {
				const { writableFieldNameList } = args;
				const batchList = [];
				for (let index = 0; index < cleanRecordList.length; index += BULK_INSERT_BATCH_SIZE) {
					batchList.push(cleanRecordList.slice(index, index + BULK_INSERT_BATCH_SIZE));
				}

				const fieldListSql = writableFieldNameList.map((name) => `[${name}]`).join(', ');
				const updateFieldNameList = writableFieldNameList.filter((name) => name.toLowerCase() != 'refid');
				const conflictSql = updateFieldNameList.length
					? `DO UPDATE SET ${updateFieldNameList.map((name) => `[${name}] = COALESCE(excluded.[${name}], [${name}])`).join(', ')}`
					: 'DO NOTHING';

				const batchTaskList = new taskListPlus();
				batchList.forEach((batch, batchIndex) => {
					// each batch starts on a fresh stack; see saveListActual
					batchTaskList.push((batchArgs, nextBatch) => setImmediate(() => {
						const valuesSql = batch
							.map((cleanObj) => {
								const valueByLowerName = Object.keys(cleanObj).reduce(
									(valueMap, fieldName) => ({ ...valueMap, [fieldName.toLowerCase()]: cleanObj[fieldName] }),
									{},
								);
								const valueList = writableFieldNameList.map((name) => {
									const fieldValue = valueByLowerName[name.toLowerCase()];
									return sqlString.escape(fieldValue === undefined ? null : fieldValue);
								});
								return `(${valueList.join(', ')})`;
							})
							.join(',\n');

						executeStatement(
							`INSERT INTO [${tableName}] (${fieldListSql}) VALUES\n${valuesSql}\nON CONFLICT([refId]) ${conflictSql};`,
							{ ...mergedOptions, suppressStatementLog: true },
							(err) => {
								if (err) {
									nextBatch(`bulkInsert batch ${batchIndex + 1}/${batchList.length} of ${tableName} failed; no row of that batch was written: ${err}`, batchArgs);
									return;
								}
								batch.forEach(({ refId }) => writtenRefIdList.push(refId));
								mergedOptions.showProgress &&
									xLog.status(`Wrote ${writtenRefIdList.length} of ${cleanRecordList.length} records into ${tableName}`);
								nextBatch('', batchArgs);
							},
						);
					}));
				});

				pipeRunner(batchTaskList.getList(), {}, (err) => next(err, args));
			});

			pipeRunner(taskList.getList(), {}, (err) => {
				if (err) {
					xLog.error(err);
				}
				callback(err, writtenRefIdList);
			});
		};

	// -----
	// saveObjectActual — upsert a single record (INSERT or UPDATE based on refId)

	const saveObjectActual = ({
		tableName,
		tableDefaultOptions,
		executeStatement,
		executeQuery,
		readColumns,
		addColumns,
		helpers,
	}) => {
		let counter = 0;

		return (inObj, callOptions = {}, callback) => {
			if (typeof callOptions == 'function') {
				callback = callOptions;
				callOptions = {};
			}
			const mergedOptions = mergeCallOptions(tableDefaultOptions, callOptions);
			const optionsErrString = validateOptions(mergedOptions);
			if (optionsErrString) {
				xLog.error(optionsErrString);
				callback(optionsErrString, Array.isArray(inObj) ? [] : undefined);
				return;
			}

			// Two list strategies behind one interface: (inArray, mergedOptions, callback)
			// -> callback(errString, refIdList). saveList: row by row through saveObject
			// (the 10.1 path). bulkSaveList: one INSERT ... ON CONFLICT per batch.
			if (Array.isArray(inObj)) {
				const { saveList, bulkSaveList } = helpers;
				(mergedOptions.bulkInsert ? bulkSaveList : saveList)(inObj, mergedOptions, callback);
				return;
			}

			const { showProgress } = mergedOptions;
			const cleanObj = cleanRecord(inObj);
			cleanObj.refId = cleanObj.refId ? cleanObj.refId : newRefId();

			const taskList = new taskListPlus();

			taskList.push((args, next) => {
				readColumns(mergedOptions, (err, columnState) => next(err, { ...args, ...columnState }));
			});

			taskList.push((args, next) => {
				const { tableExists, existingColumnNameList, cleanObj } = args;
				const columnPlan = planColumns({
					tableName,
					tableExists,
					existingColumnNameList,
					incomingFieldNameList: Object.keys(cleanObj),
					mergedOptions,
				});
				if (columnPlan.errString) {
					next(columnPlan.errString, args);
					return;
				}
				if (columnPlan.droppedFieldNameList.length) {
					xLog.warning(
						`Fields [${columnPlan.droppedFieldNameList.join(', ')}] don't exist in table '${tableName}' and will be ignored`,
					);
				}
				const writableObj = columnPlan.writableFieldNameList.reduce(
					(result, fieldName) => ({ ...result, [fieldName]: cleanObj[fieldName] }),
					{},
				);
				next('', { ...args, ...columnPlan, writableObj });
			});

			taskList.push((args, next) => {
				addColumns(args.addColumnNameList, mergedOptions, (err) => next(err, args));
			});

			taskList.push((args, next) => {
				const { writableObj } = args;
				executeQuery(
					`SELECT [refId] FROM [${tableName}] WHERE [refId]=${sqlString.escape(writableObj.refId)};`,
					mergedOptions,
					(err, existingRecords) => next(err, { ...args, existingRecords }),
				);
			});

			taskList.push((args, next) => {
				const { writableObj, existingRecords } = args;
				const refId = writableObj.refId;

				const localCallback = (err) => {
					// v10.1: a refused write is REPORTED, with the refId (see header).
					if (err) {
						next(err, { ...args, refId });
						return;
					}
					next('', { ...args, refId });
				};

				if (existingRecords.length > 0) {
					const assignmentPairs = Object.keys(writableObj)
						.map((name) => `[${name}]=${sqlString.escape(writableObj[name])}`)
						.join(', ');

					executeStatement(
						`UPDATE [${tableName}] set ${assignmentPairs}  where [refId]=${sqlString.escape(refId)};`,
						mergedOptions,
						localCallback,
					);
				} else {
					const fieldNames = Object.keys(writableObj)
						.map((name) => `[${name}]`)
						.join(', ');

					const valueList = Object.keys(writableObj)
						.map((name) => sqlString.escape(writableObj[name]))
						.join(', ');

					executeStatement(
						`INSERT INTO [${tableName}] (${fieldNames}) VALUES (${valueList});`,
						mergedOptions,
						localCallback,
					);
				}

				counter++;

				if (showProgress && counter % showProgress === 0) {
					xLog.status(`Wrote ${counter} records into ${tableName}`);
				}
			});

			pipeRunner(taskList.getList(), { cleanObj }, (err, args = {}) => {
				const { refId } = args;
				if (err) {
					xLog.error(err);
				}

				callback(err, refId);
			});
		};
	};

	// -----
	// deleteListActual — delete an array of records sequentially

	const deleteListActual =
		(deleteObject) =>
		(inArray, mergedOptions, callback) => {
			const taskList = new taskListPlus();
			const resultList = [];

			inArray.forEach((record) => {
				taskList.push((args, next) => {
					const localCallback = (err, result) => {
						resultList.push(result);
						next(err, args);
					};

					// fresh stack per record; see saveListActual
					setImmediate(() => deleteObject(record, mergedOptions, localCallback));
				});
			});

			pipeRunner(taskList.getList(), {}, (err, args) => {
				callback(err, resultList);
			});
		};

	// -----
	// deleteObjectActual — hard-delete a single record by refId
	//
	// Counterpart to saveObjectActual. Accepts a bare refId string, an object
	// carrying a refId (so callers holding a record need not dig the id out),
	// or an array of either (delegated to deleteList).
	//
	// Returns the deleted refId, mirroring saveObject returning the saved one.
	//
	// SAFETY: a missing or empty refId is a hard error, never a query. An
	// unguarded delete here would build a WHERE clause matching nothing --
	// or, worse, everything -- and quietly empty the table.

	const deleteObjectActual = ({
		tableName,
		tableDefaultOptions,
		executeStatement,
		executeQuery,
		helpers,
	}) => {
		return (inObj, callOptions = {}, callback) => {
			if (typeof callOptions == 'function') {
				callback = callOptions;
				callOptions = {};
			}
			const mergedOptions = mergeCallOptions(tableDefaultOptions, callOptions);

			if (Array.isArray(inObj)) {
				helpers.deleteList(inObj, mergedOptions, callback);
				return;
			}

			const refId =
				typeof inObj == 'string' || typeof inObj == 'number'
					? String(inObj)
					: inObj && typeof inObj == 'object'
						? inObj.refId
						: undefined;

			if (typeof refId != 'string' || !refId.trim()) {
				const message = `deleteObject requires a refId (table: ${tableName})`;
				xLog.error(message);
				callback(message, null);
				return;
			}

			const cleanRefId = refId.trim();

			const taskList = new taskListPlus();

			// Confirm the record exists so callers can distinguish a real
			// deletion from a no-op (endpoints map this to a 404).
			taskList.push((args, next) => {
				const { cleanRefId } = args;
				const localCallback = (err, existingRecords = []) => {
					if (err) {
						next(err, args);
						return;
					}
					if (!existingRecords.length) {
						next(
							`No record with refId '${cleanRefId}' (table: ${tableName})`,
							args,
						);
						return;
					}
					next('', { ...args, existingRecords });
				};

				executeQuery(
					`SELECT [refId] FROM [${tableName}] WHERE [refId]=${sqlString.escape(cleanRefId)};`,
					mergedOptions,
					localCallback,
				);
			});

			taskList.push((args, next) => {
				const { cleanRefId } = args;
				const localCallback = (err) => {
					if (err) {
						next(err, args);
						return;
					}
					next('', args);
				};

				executeStatement(
					`DELETE FROM [${tableName}] WHERE [refId]=${sqlString.escape(cleanRefId)};`,
					mergedOptions,
					localCallback,
				);
			});

			pipeRunner(taskList.getList(), { cleanRefId }, (err, args) => {
				if (err) {
					callback(err, null);
					return;
				}
				callback('', cleanRefId);
			});
		};
	};

	// =====================================================================
	// TABLE OBJECT
	// =====================================================================

	// -----
	// initTable — create the table with standard columns (refId, createdAt, updatedAt)
	// unless the table's options say suppressDynamicSchema.

	const initTable = (runStatement, tableDefaultOptions, callback) => {
		if (tableDefaultOptions.suppressDynamicSchema) {
			callback(null);
			return;
		}

		const statement = `
			CREATE TABLE IF NOT EXISTS <!tableName!> (
				[refId] TEXT PRIMARY KEY,
				[createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				[updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TRIGGER IF NOT EXISTS <!tableName!>UpdateTimestamp
				AFTER UPDATE ON <!tableName!>
				FOR EACH ROW
				BEGIN
				  /* The WHERE clause is essential. Without it, updating one row
				     restamps updatedAt on EVERY row in the table. */
				  UPDATE <!tableName!> SET [updatedAt] = CURRENT_TIMESTAMP WHERE [refId] = NEW.[refId];
				END;
			/* CREATE UNIQUE INDEX IF NOT EXISTS idx_<!tableName!>_refId ON <!tableName!>(refId)*/ /* instance */;`;
		runStatement(statement, {}, callback);
	};

	// -----
	// getTableActual — create or access a table and return its API

	const getTableActual = (db, moduleDefaultOptions) => (owner, getTableOptions = {}, callback) => {
		if (typeof getTableOptions == 'function') {
			callback = getTableOptions;
			getTableOptions = {};
		}
		// This table's defaults: the module defaults plus what getTable was given.
		const tableDefaultOptions = mergeCallOptions(moduleDefaultOptions, getTableOptions);
		const optionsErrString = validateOptions(tableDefaultOptions);
		if (optionsErrString) {
			xLog.error(optionsErrString);
			callback(optionsErrString);
			return;
		}

		const tableName = owner.replace(/\W/g, '_');

		const executeStatement = executeStatementActual(db);
		const executeQuery = executeQueryActual(db);
		const runStatement = runStatementActual(db, tableName, tableDefaultOptions, executeStatement);
		const getData = getDataActual(db, tableName, tableDefaultOptions, executeQuery);
		const readColumns = readColumnsActual(executeQuery, tableName);
		const addColumns = addColumnsActual(executeStatement, tableName);

		const helpers = {};
		const saveObject = saveObjectActual({
			tableName,
			tableDefaultOptions,
			executeStatement,
			executeQuery,
			readColumns,
			addColumns,
			helpers,
		});
		helpers.saveList = saveListActual(saveObject);
		helpers.bulkSaveList = bulkSaveListActual({ tableName, executeStatement, readColumns, addColumns });

		const deleteObject = deleteObjectActual({
			tableName,
			tableDefaultOptions,
			executeStatement,
			executeQuery,
			helpers,
		});
		helpers.deleteList = deleteListActual(deleteObject);

		const localCallback = (err) => {
			const dbTable = { getData, saveObject, deleteObject, runStatement };
			callback(err, dbTable);
		};

		initTable(runStatement, tableDefaultOptions, localCallback);
	};

	// =====================================================================
	// CHECK TABLE EXISTS
	// =====================================================================

	const checkTableExistsActual = (db) => (tableName, callback) => {
		const query = "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?";

		let syncExists = false;
		callbackFromThrowingCall(
			() => db.prepare(query).get(tableName),
			false,
			(err, result) => {
				if (err) {
					xLog.error(`Error checking table existence for ${tableName}: ${err}`);
				}
				const exists = !err && !!result && result.count > 0;
				syncExists = exists;
				if (callback) {
					callback(err, exists);
				}
			},
		);
		if (!callback) {
			return syncExists;
		}
	};

	// =====================================================================
	// INITIALIZE
	// =====================================================================

	// Never written after this point: every call merges into a fresh object.
	const moduleDefaultOptions = Object.freeze({
		suppressStatementLog: true,
		showCreateTableDebug: false,
		noTableNameOk: false,
		suppressDynamicSchema: false,
		strictSchema: false,
		bulkInsert: false,
	});

	const initDatabaseInstance = (dbFilePath, callback) => {
		const db = new Database(dbFilePath);
		db.pragma('journal_mode = WAL');
		const getTable = getTableActual(db, moduleDefaultOptions);
		const checkTableExists = checkTableExistsActual(db);

		callback('', { getTable, checkTableExists, jsonToTsv, accessPoints: {} });
	};

	return { initDatabaseInstance };
};

// END OF moduleFunction() ============================================================

module.exports = moduleFunction;
