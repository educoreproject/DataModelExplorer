#!/usr/bin/env node
'use strict';

// __TEST_sqliteInstance_deleteAndEscaping — proves the three 2026-07-21
// changes to sqlite-instance.js:
//
//   1. deleteObject()  — new formal hard-delete on the table object,
//                        including the refId guard, the not-found report,
//                        and array (deleteList) handling.
//   2. apostrophe fix  — values are escaped ONCE (by sqlString.escape) and
//                        no longer arrive double-escaped ("it''s").
//   3. trigger fix     — the auto-created updatedAt trigger carries a WHERE
//                        clause, so updating one row no longer restamps
//                        updatedAt on every row in the table.
//
// Runs against a THROWAWAY database file in the OS temp directory. It never
// opens the project database, so it is safe to run at any time.
//
// Run from anywhere:
//   node deleteAndEscaping.test.js   (from this tests directory)

const path = require('path');
const fs = require('fs');
const os = require('os');

// ----- Bootstrap process.global before requiring project modules -----

// Carried into sqlite-instance/tests on 2026-09-24 (11.0) from lennyPens
// server/test/__TEST_sqliteInstance_deleteAndEscaping.js, so the module carries its own proof.
// Changes: the process.global bootstrap comes from test-helpers (no project x-log), and the
// module path comes from config.js. Every check is otherwise as written. Run standalone, or
// through index.test.js, which runs it as a child process.
require('./test-helpers');
const config = require('./config');

const { pipeRunner, taskListPlus, mergeArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const sqlDbGen = require(config.modulePath)({
	getConfig: process.global.getConfig,
});

const dbPath = path.join(
	os.tmpdir(),
	`__TEST_sqliteInstance_${process.pid}.sqlite3`,
);

const TABLE_NAME = '__TEST_widgets';
const APOSTROPHE_VALUE = "Lenny's Pen Emporium — it's a \"quote\" too";

// v10.1 error-propagation check. Deliberately apostrophe-free: this value goes
// into a SQL literal directly, and the point of that check is the error
// reporting, not the escaping (which check 2 above already covers).
const DUPLICATE_VALUE = 'duplicate probe value';
const UNIQUE_INDEX_NAME = '__TEST_widgets_uniqueName';

// ----- Tiny assertion harness -----

const results = [];
const check = (label, passed, detail) => {
	results.push({ label, passed, detail });
	const mark = passed ? 'PASS' : 'FAIL';
	console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
};

const cleanup = () => {
	[dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach((filePath) => {
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	});
};

// ----- The test pipeline -----

const taskList = new taskListPlus();

taskList.push((args, next) => {
	sqlDbGen.initDatabaseInstance(dbPath, (err, sqlDb) => {
		if (err) {
			next(err, args);
			return;
		}
		next('', { ...args, sqlDb });
	});
});

taskList.push((args, next) =>
	args.sqlDb.getTable(TABLE_NAME, mergeArgs(args, next, 'table')),
);

// --- 2. APOSTROPHE: save a value with apostrophes and read it back ---

taskList.push((args, next) => {
	const { table } = args;
	table.saveObject(
		{ name: APOSTROPHE_VALUE, note: 'first' },
		{ suppressStatementLog: true },
		(err, refId) => {
			if (err) {
				next(`save with apostrophes failed: ${err}`, args);
				return;
			}
			next('', { ...args, apostropheRefId: refId });
		},
	);
});

taskList.push((args, next) => {
	const { table, apostropheRefId } = args;
	table.getData(
		`SELECT * FROM <!tableName!> WHERE [refId]='${apostropheRefId}';`,
		{ suppressStatementLog: true },
		(err, rows = []) => {
			if (err) {
				next(err, args);
				return;
			}
			const stored = rows.length ? rows[0].name : null;
			check(
				'apostrophes round-trip exactly (no double-escaping)',
				stored === APOSTROPHE_VALUE,
				stored === APOSTROPHE_VALUE ? '' : `stored as: ${JSON.stringify(stored)}`,
			);
			next('', args);
		},
	);
});

// --- 3. TRIGGER: updating one row must not restamp the others ---

taskList.push((args, next) => {
	const { table } = args;
	table.saveObject(
		{ name: 'trigger probe', note: 'second' },
		{ suppressStatementLog: true },
		(err, refId) => {
			if (err) {
				next(err, args);
				return;
			}
			next('', { ...args, probeRefId: refId });
		},
	);
});

taskList.push((args, next) => {
	const { table, apostropheRefId } = args;
	table.getData(
		`SELECT [refId], [updatedAt] FROM <!tableName!> WHERE [refId]='${apostropheRefId}';`,
		{ suppressStatementLog: true },
		(err, rows = []) => {
			if (err) {
				next(err, args);
				return;
			}
			next('', { ...args, beforeUpdatedAt: rows.length ? rows[0].updatedAt : null });
		},
	);
});

// Force a distinguishable timestamp, then update ONLY the probe row.
taskList.push((args, next) => {
	setTimeout(() => next('', args), 1100);
});

taskList.push((args, next) => {
	const { table, probeRefId } = args;
	table.saveObject(
		{ refId: probeRefId, name: 'trigger probe edited', note: 'second' },
		{ suppressStatementLog: true },
		(err) => {
			if (err) {
				next(err, args);
				return;
			}
			next('', args);
		},
	);
});

taskList.push((args, next) => {
	const { table, apostropheRefId, beforeUpdatedAt } = args;
	table.getData(
		`SELECT [refId], [updatedAt] FROM <!tableName!> WHERE [refId]='${apostropheRefId}';`,
		{ suppressStatementLog: true },
		(err, rows = []) => {
			if (err) {
				next(err, args);
				return;
			}
			const afterUpdatedAt = rows.length ? rows[0].updatedAt : null;
			check(
				'updating one row leaves other rows updatedAt untouched',
				afterUpdatedAt === beforeUpdatedAt,
				afterUpdatedAt === beforeUpdatedAt
					? ''
					: `bystander moved ${beforeUpdatedAt} -> ${afterUpdatedAt}`,
			);
			next('', args);
		},
	);
});

// --- 1. DELETE: guard, not-found, real delete, array form ---

taskList.push((args, next) => {
	const { table } = args;
	table.deleteObject('', { suppressStatementLog: true }, (err) => {
		check(
			'deleteObject refuses an empty refId',
			!!err && /requires a refId/.test(String(err)),
			err ? '' : 'no error was returned',
		);
		next('', args);
	});
});

taskList.push((args, next) => {
	const { table } = args;
	table.deleteObject(
		undefined,
		{ suppressStatementLog: true },
		(err) => {
			check(
				'deleteObject refuses an undefined refId',
				!!err && /requires a refId/.test(String(err)),
				err ? '' : 'no error was returned',
			);
			next('', args);
		},
	);
});

taskList.push((args, next) => {
	const { table } = args;
	table.deleteObject(
		'no-such-refid-at-all',
		{ suppressStatementLog: true },
		(err) => {
			check(
				'deleteObject reports a missing record instead of silent success',
				!!err && /No record with refId/.test(String(err)),
				err ? '' : 'no error was returned',
			);
			next('', args);
		},
	);
});

// Nothing may have been destroyed by the three refusals above.
taskList.push((args, next) => {
	const { table } = args;
	table.getData(
		`SELECT [refId] FROM <!tableName!>;`,
		{ suppressStatementLog: true },
		(err, rows = []) => {
			if (err) {
				next(err, args);
				return;
			}
			check(
				'refused deletes destroyed nothing',
				rows.length === 2,
				`expected 2 rows, found ${rows.length}`,
			);
			next('', args);
		},
	);
});

taskList.push((args, next) => {
	const { table, apostropheRefId } = args;
	table.deleteObject(
		apostropheRefId,
		{ suppressStatementLog: true },
		(err, returnedRefId) => {
			check(
				'deleteObject removes a record by bare refId and returns it',
				!err && returnedRefId === apostropheRefId,
				err ? String(err) : '',
			);
			next('', args);
		},
	);
});

taskList.push((args, next) => {
	const { table, probeRefId } = args;
	// Object form — callers holding a record should not have to dig out the id.
	table.deleteObject(
		{ refId: probeRefId, name: 'trigger probe edited' },
		{ suppressStatementLog: true },
		(err, returnedRefId) => {
			check(
				'deleteObject accepts an object carrying a refId',
				!err && returnedRefId === probeRefId,
				err ? String(err) : '',
			);
			next('', args);
		},
	);
});

taskList.push((args, next) => {
	const { table } = args;
	table.getData(
		`SELECT [refId] FROM <!tableName!>;`,
		{ suppressStatementLog: true },
		(err, rows = []) => {
			if (err) {
				next(err, args);
				return;
			}
			check(
				'table is empty after both deletes',
				rows.length === 0,
				`expected 0 rows, found ${rows.length}`,
			);
			next('', args);
		},
	);
});

// Array form.
taskList.push((args, next) => {
	const { table } = args;
	table.saveObject(
		[{ name: 'batch one' }, { name: 'batch two' }, { name: 'batch three' }],
		{ suppressStatementLog: true },
		(err, refIdList = []) => {
			if (err) {
				next(err, args);
				return;
			}
			next('', { ...args, batchRefIds: refIdList });
		},
	);
});

taskList.push((args, next) => {
	const { table, batchRefIds } = args;
	// Delete two of the three; the third must survive.
	table.deleteObject(
		batchRefIds.slice(0, 2),
		{ suppressStatementLog: true },
		(err, deletedList = []) => {
			check(
				'deleteObject accepts an array and deletes each member',
				!err && deletedList.length === 2,
				err ? String(err) : `deleted ${deletedList.length}`,
			);
			next('', args);
		},
	);
});

taskList.push((args, next) => {
	const { table } = args;
	table.getData(
		`SELECT [refId] FROM <!tableName!>;`,
		{ suppressStatementLog: true },
		(err, rows = []) => {
			if (err) {
				next(err, args);
				return;
			}
			check(
				'array delete left the untargeted row alone',
				rows.length === 1,
				`expected 1 row, found ${rows.length}`,
			);
			next('', args);
		},
	);
});

// --- 4. ERROR PROPAGATION: a refused write must REPORT the refusal ---
//
// v10.1. saveObject used to report success on a refused insert: the SQL error
// was pushed onto a local errorList that nothing read, and the stage called
// next('') regardless — so the caller received an empty error and the refId of
// a row that was never written. There was no way to tell a successful write
// from a refused one.
//
// A UNIQUE index is the cheapest way to make the database refuse a write on
// purpose. The table is created by the abstraction itself, so the index is
// added here directly.

taskList.push((args, next) => {
	const { table } = args;
	table.runStatement(
		`CREATE UNIQUE INDEX ${UNIQUE_INDEX_NAME} ON <!tableName!> ([name]);`,
		{ suppressStatementLog: true },
		(err) => {
			if (err) {
				next(`could not create the unique index: ${err}`, args);
				return;
			}
			next('', args);
		},
	);
});

taskList.push((args, next) => {
	const { table } = args;
	table.saveObject(
		{ name: DUPLICATE_VALUE, note: 'the row that should survive' },
		{ suppressStatementLog: true },
		(err, refId) => {
			if (err) {
				next(`the FIRST write of the duplicate probe failed: ${err}`, args);
				return;
			}
			next('', { ...args, firstDuplicateRefId: refId });
		},
	);
});

taskList.push((args, next) => {
	const { table } = args;
	// The same [name] again. The unique index must refuse it, and saveObject
	// must SAY SO.
	table.saveObject(
		{ name: DUPLICATE_VALUE, note: 'the row that must never land' },
		{ suppressStatementLog: true },
		(err, refId) => {
			check(
				'a write refused by a UNIQUE index reports the error',
				!!err,
				err ? `err=${String(err)}` : 'REPORTED SUCCESS on a refused insert',
			);
			check(
				'a refused write mentions the constraint that refused it',
				!!err && /unique/i.test(String(err)),
				err ? '' : 'no error to inspect',
			);
			next('', { ...args, refusedRefId: refId });
		},
	);
});

taskList.push((args, next) => {
	const { table, firstDuplicateRefId } = args;
	table.getData(
		`SELECT [refId], [note] FROM <!tableName!> WHERE [name]='${DUPLICATE_VALUE}';`,
		{ suppressStatementLog: true },
		(err, rows = []) => {
			if (err) {
				next(err, args);
				return;
			}
			// The index really did bite — this is the control that proves the
			// assertions above are about REPORTING, not about data integrity.
			check(
				'the UNIQUE index refused the duplicate — exactly one row',
				rows.length === 1,
				`found ${rows.length} rows`,
			);
			check(
				'the surviving row is the ORIGINAL, not the duplicate',
				rows.length === 1 && rows[0].refId === firstDuplicateRefId,
				rows.length === 1 ? `note=${rows[0].note}` : '',
			);
			next('', args);
		},
	);
});

taskList.push((args, next) => {
	// Housekeeping: drop the index so it cannot affect any later check.
	const { table } = args;
	table.runStatement(
		// An index name is not a table name, so this statement legitimately
		// carries no <!tableName!> tag.
		`DROP INDEX IF EXISTS ${UNIQUE_INDEX_NAME};`,
		{ suppressStatementLog: true, noTableNameOk: true },
		() => next('', args),
	);
});

// ----- Run -----

console.log('\n__TEST_sqliteInstance_deleteAndEscaping');
console.log(`  database: ${dbPath}\n`);

const initialData = {};
pipeRunner(taskList.getList(), initialData, (err) => {
	if (err) {
		console.log(`\n  [FAIL] pipeline error: ${err}`);
		results.push({ label: 'pipeline', passed: false });
	}

	cleanup();

	const failed = results.filter((item) => !item.passed);
	console.log(
		`\n  ${results.length - failed.length}/${results.length} checks passed\n`,
	);
	process.exit(failed.length ? 1 : 0);
});
