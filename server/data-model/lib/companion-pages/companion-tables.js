#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
//
// Opens the companionPage, companionSource and companionCompile tables with their DECLARED schemas (the mappers' createTable).
// sqlite-instance's getTable always creates a bare table first (refId/createdAt/updatedAt only), so a CREATE TABLE IF
// NOT EXISTS run after it would be a no-op. On first open, then, the bare EMPTY table getTable just made is dropped and
// replaced by the declared one. A table that exists with rows but lacks a declared column is refused by name, never
// migrated silently. The DDL is re-run on every open (all IF NOT EXISTS) so its index and triggers are always there.
//
//   getCompanionTables({ sqlDb, dataMapping }, callback(errText, { pageTable, sourceTable, compileTable }))

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

const TABLE_NAME_BY_MAPPER_NAME = { 'companion-page': 'companionPage', 'companion-source': 'companionSource', 'companion-compile': 'companionCompile' };
const QUIET = { suppressStatementLog: true };

const openDeclaredTable = ({ sqlDb, mapper, tableName }, callback) => {
	const taskList = new taskListPlus();

	taskList.push((args, next) => sqlDb.getTable(tableName, (err, tableRef) => next(err, { ...args, tableRef })));

	taskList.push((args, next) => {
		args.tableRef.getData(`PRAGMA table_info(<!tableName!>);`, QUIET, (err, columnRowList = []) => {
			const existingColumnNameList = (columnRowList || []).map((columnRow) => columnRow.name);
			const missingColumnNameList = mapper.dataColumnList.filter((columnName) => !existingColumnNameList.includes(columnName));
			next(err, { ...args, missingColumnNameList });
		});
	});

	taskList.push((args, next) => {
		if (!args.missingColumnNameList.length) {
			next('', { ...args, isBareTable: false });
			return;
		}
		args.tableRef.getData(`SELECT count(*) AS rowCount FROM <!tableName!>;`, QUIET, (err, countRowList = []) => {
			if (err) {
				next(err, args);
				return;
			}
			if (countRowList[0].rowCount > 0) {
				next(`${moduleName}: table ${tableName} has rows but lacks declared column(s) ${args.missingColumnNameList.join(', ')}; refusing to alter it`, args);
				return;
			}
			next('', { ...args, isBareTable: true });
		});
	});

	taskList.push((args, next) => {
		const dropText = args.isBareTable ? `DROP TABLE <!tableName!>;` : '';
		args.tableRef.runStatement(`${dropText}${mapper.getSql('createTable')}`, QUIET, (err) => next(err, args));
	});

	pipeRunner(taskList.getList(), {}, (err, args) => callback(err ? `${moduleName} ${tableName}: ${err}` : '', args.tableRef));
};

const getCompanionTables = ({ sqlDb, dataMapping }, callback) => {
	const taskList = new taskListPlus();

	taskList.push((args, next) =>
		openDeclaredTable({ sqlDb, mapper: dataMapping['companion-page'], tableName: TABLE_NAME_BY_MAPPER_NAME['companion-page'] }, (err, pageTable) => next(err, { ...args, pageTable })),
	);
	taskList.push((args, next) =>
		openDeclaredTable({ sqlDb, mapper: dataMapping['companion-source'], tableName: TABLE_NAME_BY_MAPPER_NAME['companion-source'] }, (err, sourceTable) => next(err, { ...args, sourceTable })),
	);

	taskList.push((args, next) =>
		openDeclaredTable({ sqlDb, mapper: dataMapping['companion-compile'], tableName: TABLE_NAME_BY_MAPPER_NAME['companion-compile'] }, (err, compileTable) => next(err, { ...args, compileTable })),
	);

	pipeRunner(taskList.getList(), {}, (err, args) => callback(err, { pageTable: args.pageTable, sourceTable: args.sourceTable, compileTable: args.compileTable }));
};

module.exports = { getCompanionTables, TABLE_NAME_BY_MAPPER_NAME };
