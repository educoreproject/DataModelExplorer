#!/usr/bin/env node
'use strict';

// sqlite-save-refusal.test.js — gate G0.3 (Companion Pages Phase 0; code/CLAUDE.md AMENDMENT 2026-08-04).
// saveObject REPORTED SUCCESS ON A REFUSED WRITE: the insert/update stage pushed the SQL error onto a local errorList
// that nothing read and called next('') regardless. This copy now carries the 10.1 error propagation (and only that;
// the 10.0 changes are not adopted): a refused write returns the error, still alongside the refId.
//
// PROVES, on a throwaway database under os.tmpdir() (never a project database):
//   a UNIQUE violation and a NOT NULL violation each return an error from saveObject, with the refId
//   integrity controls: the constraint really refused the row (row counts unchanged), and a healthy save still succeeds
// RED TWIN (in memory, lib/moduleWithStubs.js): the stage's error branch removed — the refused writes report success.
//
//   /usr/local/bin/node server/test/sqlite-save-refusal.test.js   (sqlite3 is built for that node)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadWithStubs } = require('./lib/moduleWithStubs');

const SQLITE_INSTANCE_PATH = path.join(__dirname, '..', 'data-model', 'lib', 'sqlite-instance', 'sqlite-instance.js');
const ERROR_BRANCH = `if (err) {
						next(err, { ...args, refId });
						return;
					}`;

process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {} }, getConfig: () => ({}) };

const results = [];
const ok = (name, condition, detail) => {
	results.push([name, !!condition]);
	console.log(`  ${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const QUIET = { suppressStatementLog: true };

// runs the four probes against one module; callback({ uniqueOutcome, notNullOutcome, healthyOutcome, uniqueRowCount, notNullRowCount })
const probeModule = ({ sqlDbGen, databaseFilePath }, callback) => {
	sqlDbGen.initDatabaseInstance(databaseFilePath, (dbError, sqlDb) => {
		sqlDb.getTable('notNullProbe', (seedTableError, seedTable) => {
			// replace the auto-created table with one that has a NOT NULL column, before its first save
			seedTable.runStatement(`DROP TABLE <!tableName!>; CREATE TABLE <!tableName!> ([refId] TEXT PRIMARY KEY, [createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, [updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, [requiredText] TEXT NOT NULL);`, QUIET, (ddlError) => {
				sqlDb.getTable('uniqueProbe', (tableError, uniqueTable) => {
					uniqueTable.saveObject({ refId: 'firstRow', slugText: 'same-slug' }, QUIET, (firstError) => {
						uniqueTable.runStatement(`CREATE UNIQUE INDEX IF NOT EXISTS uniqueProbeSlug ON <!tableName!>([slugText]);`, QUIET, (indexError) => {
							uniqueTable.saveObject({ refId: 'secondRow', slugText: 'same-slug' }, QUIET, (uniqueError, uniqueRefId) => {
								seedTable.saveObject({ refId: 'missingRequired', otherText: 'x' }, QUIET, (notNullError, notNullRefId) => {
									uniqueTable.saveObject({ refId: 'thirdRow', slugText: 'other-slug' }, QUIET, (healthyError, healthyRefId) => {
										uniqueTable.getData(`SELECT count(*) AS rowCount FROM <!tableName!>`, QUIET, (countError, uniqueCountList) => {
											seedTable.getData(`SELECT count(*) AS rowCount FROM <!tableName!>`, QUIET, (notNullCountError, notNullCountList) => {
												const setupError = dbError || seedTableError || ddlError || tableError || firstError || indexError || countError || notNullCountError;
												callback(setupError, {
													uniqueOutcome: { errorText: uniqueError, refId: uniqueRefId },
													notNullOutcome: { errorText: notNullError, refId: notNullRefId },
													healthyOutcome: { errorText: healthyError, refId: healthyRefId },
													uniqueRowCount: uniqueCountList[0].rowCount,
													notNullRowCount: notNullCountList[0].rowCount,
												});
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});
};

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sqliteSaveRefusal-'));
const realSqlDbGen = require(SQLITE_INSTANCE_PATH)({});
const swallowingSqlDbGen = loadWithStubs({ modulePath: SQLITE_INSTANCE_PATH, mutationList: [{ find: ERROR_BRANCH, replace: '' }] })({});

probeModule({ sqlDbGen: realSqlDbGen, databaseFilePath: path.join(scratchDirPath, 'real.sqlite3') }, (realSetupError, real) => {
	console.log('real module');
	ok('setup ran cleanly', !realSetupError, realSetupError);
	ok('UNIQUE violation returns an error', !!real.uniqueOutcome.errorText, String(real.uniqueOutcome.errorText));
	ok('UNIQUE violation still returns the refId', real.uniqueOutcome.refId === 'secondRow');
	ok('NOT NULL violation returns an error', !!real.notNullOutcome.errorText, String(real.notNullOutcome.errorText));
	ok('NOT NULL violation still returns the refId', real.notNullOutcome.refId === 'missingRequired');
	ok('control: the UNIQUE index really refused the row', real.uniqueRowCount === 2, `rows=${real.uniqueRowCount}`);
	ok('control: the NOT NULL column really refused the row', real.notNullRowCount === 0, `rows=${real.notNullRowCount}`);
	ok('control: a healthy save succeeds with its refId', !real.healthyOutcome.errorText && real.healthyOutcome.refId === 'thirdRow');
	probeModule({ sqlDbGen: swallowingSqlDbGen, databaseFilePath: path.join(scratchDirPath, 'twin.sqlite3') }, (twinSetupError, twin) => {
		console.log('red twin: error branch removed');
		ok('twin setup ran cleanly', !twinSetupError, twinSetupError);
		ok('the swallowing stage reports success on both refused writes', !twin.uniqueOutcome.errorText && !twin.notNullOutcome.errorText);
		fs.rmSync(scratchDirPath, { recursive: true, force: true });
		const failedCount = results.filter(([, isPass]) => !isPass).length;
		console.log(`\n=== Results: ${results.length - failedCount} passed, ${failedCount} failed ===\n`);
		process.exit(failedCount > 0 ? 1 : 0);
	});
});
