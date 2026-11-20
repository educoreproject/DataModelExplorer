#!/usr/bin/env node
'use strict';

// graph-state-version-schema-migration.js — removes RETIRED columns from graph_state_versions at startup (W-E-12, X4
// mechanics, ruling B, campaign P0, 2026-10-06). The table's columns are created on demand by sqlite-instance's
// saveObject, so a column the code stops writing stays in every existing database file, holding its old values. The
// one retired column holds secrets (each live clone's neo4j password), so it is DROPPED, not merely left unwritten.
// Idempotent: a database without the column (or without the table) is left as it is. Mirrors oauth-schema-init.js.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const VERSIONS_TABLE_NAME = 'graph_state_versions';
// each with why: a column named here is dropped from every database the server opens
const RETIRED_COLUMN_BY_NAME = Object.freeze({
	liveBoltPassword: 'a live clone\'s neo4j password; since W-E-12 it travels with the clone (DME_CLONE_NEO4J_AUTH)',
});

const moduleFunction = ({ sqlDb }) => (callback) => {
	const { xLog } = process.global;
	const logInfoList = [];
	const taskList = new taskListPlus();

	taskList.push((args, next) => args.sqlDb.getTable(VERSIONS_TABLE_NAME, mergeArgs(args, next, 'versionsTable')));

	taskList.push((args, next) => {
		args.versionsTable.getData(`PRAGMA table_info(<!tableName!>);`, { suppressStatementLog: true }, (err, rows = []) => {
			if (err) {
				next(err, args);
				return;
			}
			const presentColumnNameList = rows.map((oneRow) => String(oneRow.name));
			next('', { ...args, retiredPresentList: Object.keys(RETIRED_COLUMN_BY_NAME).filter((oneName) => presentColumnNameList.indexOf(oneName) !== -1) });
		});
	});

	taskList.push((args, next) => {
		if (args.retiredPresentList.length === 0) {
			logInfoList.push(`${VERSIONS_TABLE_NAME}: no retired column present`);
			next('', args);
			return;
		}
		// sqlite-instance 11.0 opens the database in WAL mode: the pre-drop pages stay in the -wal file, and pages the
		// rewrite frees keep their bytes, unless secure_delete zeroes them and a TRUNCATE checkpoint empties the -wal.
		// secure_delete is put back as it was found (it is per connection, and this connection serves every table).
		args.versionsTable.getData('PRAGMA secure_delete;', { suppressStatementLog: true, noTableNameOk: true }, (readError, secureDeleteRowList = []) => {
			if (readError) {
				next(`${VERSIONS_TABLE_NAME}: reading secure_delete failed: ${readError}`, args);
				return;
			}
			const secureDeleteFound = (secureDeleteRowList[0] || {}).secure_delete ? 'ON' : 'OFF';
			const statements = [
				'PRAGMA secure_delete = ON;',
				...args.retiredPresentList.map((oneName) => `ALTER TABLE <!tableName!> DROP COLUMN [${oneName}];`),
				`PRAGMA secure_delete = ${secureDeleteFound};`,
			].join('\n');
			args.versionsTable.runStatement(statements, { suppressStatementLog: true }, (err) => {
				if (err) {
					next(`${VERSIONS_TABLE_NAME}: dropping the retired column(s) ${args.retiredPresentList.join(', ')} failed (SQLite 3.35+ is required for DROP COLUMN): ${err}`, args);
					return;
				}
				// MEASURED (2026-10-06, SQLite 3.51 and the server's sqlite3, rollback journal): DROP COLUMN rewrites the
				// table, and the dropped values' bytes are gone from the file without a VACUUM. Under better-sqlite3 + WAL
				// (2026-11-19) they were NOT gone without secure_delete and the checkpoint; the test checks the file's bytes.
				logInfoList.push(`${VERSIONS_TABLE_NAME}: dropped retired column(s) ${args.retiredPresentList.join(', ')}`);
				args.versionsTable.getData('PRAGMA wal_checkpoint(TRUNCATE);', { suppressStatementLog: true, noTableNameOk: true }, (checkpointError, checkpointRowList = []) => {
					const checkpointRow = checkpointRowList[0] || {};
					// busy: another connection held a read transaction, so the -wal (with the dropped values) was not emptied
					if (checkpointError || checkpointRow.busy) {
						const warningText = `${VERSIONS_TABLE_NAME}: the -wal file still holds the dropped column's old values until a later checkpoint (${checkpointError || 'checkpoint busy'})`;
						xLog.error(`${moduleName}: ${warningText}`);
						logInfoList.push(warningText);
					}
					next('', args);
				});
			});
		});
	});

	pipeRunner(taskList.getList(), { sqlDb }, (err) => {
		if (err) {
			callback(`${moduleName}: ${err}`);
			return;
		}
		callback('', { logInfoList });
	});
};

moduleFunction.RETIRED_COLUMN_BY_NAME = RETIRED_COLUMN_BY_NAME;
module.exports = moduleFunction;
