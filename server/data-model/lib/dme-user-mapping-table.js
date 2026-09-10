#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
//
// Opens the dme_user_mappings table and makes sure every column the mapper
// declares exists. sqlite-instance creates tables with only refId/createdAt/
// updatedAt and normally grows them inside saveObject(); the mapping access
// points issue their own INSERT/UPDATE (saveObject double-escapes apostrophes,
// which would corrupt transformation rules), so the schema is grown here.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

const TABLE_NAME = 'dme_user_mappings';

const getMappingTable = ({ sqlDb, dataMapping }, callback) => {
	const { xLog } = process.global;
	const taskList = new taskListPlus();

	taskList.push((args, next) =>
		sqlDb.getTable(TABLE_NAME, (err, mappingTable) => next(err, { ...args, mappingTable })),
	);

	taskList.push((args, next) => {
		const { mappingTable } = args;
		mappingTable.getData(
			`PRAGMA table_info(<!tableName!>);`,
			{ suppressStatementLog: true },
			(err, columns = []) => {
				const existing = (columns || []).map((c) => String(c.name).toLowerCase());
				const wanted = dataMapping['dme-user-mapping'].dataColumns;
				const missing = wanted.filter((name) => !existing.includes(name.toLowerCase()));
				next(err, { ...args, missing });
			},
		);
	});

	taskList.push((args, next) => {
		const { mappingTable, missing } = args;
		if (!missing.length) {
			next('', args);
			return;
		}
		xLog.status(`${moduleName}: adding ${missing.length} column(s) to ${TABLE_NAME}: ${missing.join(', ')}`);
		const statements = missing
			.map((name) => `ALTER TABLE <!tableName!> ADD COLUMN [${name}] TEXT;`)
			.join('\n');
		mappingTable.runStatement(statements, { suppressStatementLog: true }, (err) => next(err, args));
	});

	pipeRunner(taskList.getList(), {}, (err, args) => {
		callback(err, args.mappingTable);
	});
};

module.exports = { getMappingTable, TABLE_NAME };
