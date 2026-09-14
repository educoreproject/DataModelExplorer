#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
//
// Opens the dme_user_mappings table and makes sure every column the mapper
// declares exists. sqlite-instance creates tables with only refId/createdAt/
// updatedAt and normally grows them inside saveObject(); the mapping access
// points issue their own INSERT/UPDATE (saveObject double-escapes apostrophes,
// which would corrupt transformation rules), so the schema is grown here.
//
// Also exposes the users lookup the list/export access points use to label
// each proposal with who made it.

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
		// `status` gets a default so rows that predate review land as proposals.
		const statements = missing
			.map((name) =>
				name === 'status'
					? `ALTER TABLE <!tableName!> ADD COLUMN [status] TEXT DEFAULT 'proposed';`
					: `ALTER TABLE <!tableName!> ADD COLUMN [${name}] TEXT;`,
			)
			.join('\n');
		mappingTable.runStatement(statements, { suppressStatementLog: true }, (err) => next(err, args));
	});

	pipeRunner(taskList.getList(), {}, (err, args) => {
		callback(err, args.mappingTable);
	});
};

// refId -> { username, first, last, displayName } for every user, so a list of
// proposals can say who proposed each. Passwords never leave this function.
const getUserDirectory = ({ sqlDb, dataMapping }, callback) => {
	sqlDb.getTable('users', (err, userTable) => {
		if (err) {
			callback(err, {});
			return;
		}
		// Only the naming columns — never password — and only columns every
		// deployment's users table has, so a sparse test database works too.
		const query = `SELECT refId, username, first, last FROM <!tableName!>`;
		userTable.getData(query, { suppressStatementLog: true }, (qErr, rows = []) => {
			if (qErr) {
				callback(qErr, {});
				return;
			}
			const directory = {};
			for (const row of rows || []) {
				if (!row?.refId) continue;
				const fullName = [row.first, row.last].filter(Boolean).join(' ').trim();
				directory[row.refId] = {
					username: row.username || '',
					first: row.first || '',
					last: row.last || '',
					displayName: fullName || row.username || row.refId,
				};
			}
			callback('', directory);
		});
	});
};

// Decorate mapping rows with proposer/reviewer names and an ownership flag for
// the caller. Pure; safe on an empty directory.
const decorateRows = (rows, directory, callerRefId) =>
	(rows || []).map((row) => ({
		...row,
		status: row.status || 'proposed',
		proposedBy: directory[row.userRefId]?.displayName || row.userRefId || '',
		proposedByUsername: directory[row.userRefId]?.username || '',
		reviewedByName: row.reviewedBy ? directory[row.reviewedBy]?.displayName || row.reviewedBy : '',
		mine: !!callerRefId && row.userRefId === callerRefId,
	}));

module.exports = { getMappingTable, getUserDirectory, decorateRows, TABLE_NAME };
