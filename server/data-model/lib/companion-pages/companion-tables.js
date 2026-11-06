#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
//
// Opens the companionPage, companionSource and companionCompile tables with their DECLARED schemas (the mappers' createTable).
// sqlite-instance's getTable always creates a bare table first (refId/createdAt/updatedAt only), so a CREATE TABLE IF
// NOT EXISTS run after it would be a no-op. On first open, then, the bare EMPTY table getTable just made is dropped and
// replaced by the declared one. A table that exists with rows but lacks a declared column is refused by name, never
// migrated silently, UNLESS the mapper names that column in its ADDED_COLUMN_NAME_LIST (a nullable column declared after rows
// existed, e.g. companion-compile's graphIdentitySha256, WORKORDER-downloadsByIdentity-110626): those, and only those, are added
// by ALTER TABLE ADD COLUMN, each named in the log. A mapper that declares no ADDED_COLUMN_NAME_LIST has none. The DDL is
// re-run on every open (all IF NOT EXISTS) so its index and triggers are always there.
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
			const notAddableColumnNameList = args.missingColumnNameList.filter((columnName) => !addedColumnNameListOf(mapper).includes(columnName));
			if (countRowList[0].rowCount > 0 && notAddableColumnNameList.length) {
				next(`${moduleName}: table ${tableName} has rows but lacks declared column(s) ${notAddableColumnNameList.join(', ')}; refusing to alter it`, args);
				return;
			}
			next('', { ...args, isBareTable: countRowList[0].rowCount === 0, addColumnNameList: countRowList[0].rowCount > 0 ? args.missingColumnNameList : [] });
		});
	});

	// a populated table's declared added columns, each named in the log (nullable: its existing rows read them as null)
	taskList.push((args, next) => {
		if (!args.addColumnNameList || !args.addColumnNameList.length) {
			next('', args);
			return;
		}
		process.global.xLog.status(`${moduleName}: table ${tableName} holds rows; adding declared column(s) ${args.addColumnNameList.join(', ')}`);
		args.tableRef.runStatement(args.addColumnNameList.map((columnName) => `ALTER TABLE <!tableName!> ADD COLUMN [${columnName}] TEXT;`).join('\n'), QUIET, (err) => next(err, args));
	});

	taskList.push((args, next) => {
		const dropText = args.isBareTable ? `DROP TABLE <!tableName!>;` : '';
		args.tableRef.runStatement(`${dropText}${mapper.getSql('createTable')}`, QUIET, (err) => next(err, args));
	});

	pipeRunner(taskList.getList(), {}, (err, args) => callback(err ? `${moduleName} ${tableName}: ${err}` : '', args.tableRef));
};

// a mapper's declared added columns: none unless it declares the list (an optional declaration, documented above)
const addedColumnNameListOf = (mapper) => (Array.isArray(mapper.ADDED_COLUMN_NAME_LIST) ? mapper.ADDED_COLUMN_NAME_LIST : []);

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
