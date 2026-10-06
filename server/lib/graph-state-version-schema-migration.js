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
		const statements = args.retiredPresentList.map((oneName) => `ALTER TABLE <!tableName!> DROP COLUMN [${oneName}];`).join('\n');
		args.versionsTable.runStatement(statements, { suppressStatementLog: true }, (err) => {
			if (err) {
				next(`${VERSIONS_TABLE_NAME}: dropping the retired column(s) ${args.retiredPresentList.join(', ')} failed (SQLite 3.35+ is required for DROP COLUMN): ${err}`, args);
				return;
			}
			// MEASURED (2026-10-06, SQLite 3.51 and the server's sqlite3): DROP COLUMN rewrites the table, and the dropped
			// values' bytes are gone from the file without a VACUUM; the test checks the file's bytes, not this sentence
			logInfoList.push(`${VERSIONS_TABLE_NAME}: dropped retired column(s) ${args.retiredPresentList.join(', ')}`);
			next('', args);
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
