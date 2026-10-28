#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[AccessPointPattern]]
//
// Adds or edits one companion page registry entry, by pageSlug (SPEC-companionPages-102826, Administration).
// The record is a WHOLE row (companion-page-rules.js); an existing pageSlug is updated in place, a new one inserted.
// Admin-only is enforced by the endpoint; this access point trusts its caller for identity.
//
//   inputData: { pageRecord }   ->   callback(errText, pageRecord as stored)

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const newRefId = require('../../lib/new-refid')({ digits: 20 });
const { getCompanionTables } = require('../../lib/companion-pages/companion-tables');
const { refusalOfPageRecord } = require('../../lib/companion-pages/companion-page-rules');

const QUIET = { suppressStatementLog: true };

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;
	const pageMapper = dataMapping['companion-page'];

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const refusalText = refusalOfPageRecord({ pageRecord: args.pageRecord, dataColumnList: pageMapper.dataColumnList, TARGET_KIND_LIST: pageMapper.TARGET_KIND_LIST });
			next(refusalText, args);
		});

		taskList.push((args, next) => getCompanionTables({ sqlDb, dataMapping }, mergeArgs(args, next, 'companionTables')));

		taskList.push((args, next) => {
			args.companionTables.pageTable.getData(pageMapper.getSql('byPageSlug', { pageSlug: args.pageRecord.pageSlug }), QUIET, (err, rowList = []) =>
				next(err, { ...args, existingRow: rowList[0] }),
			);
		});

		taskList.push((args, next) => {
			const { existingRow, pageRecord, companionTables } = args;
			const reverseRecord = pageMapper.map(pageRecord, 'reverse');
			const statementText = existingRow
				? pageMapper.getSql('updateByPageSlug', reverseRecord)
				: pageMapper.getSql('insert', { ...reverseRecord, refId: newRefId() });
			companionTables.pageTable.runStatement(statementText, QUIET, (err) => next(err, args));
		});

		taskList.push((args, next) => {
			args.companionTables.pageTable.getData(pageMapper.getSql('byPageSlug', { pageSlug: args.pageRecord.pageSlug }), QUIET, (err, rowList = []) =>
				next(err || (rowList.length ? '' : `${moduleName}: page ${args.pageRecord.pageSlug} was not stored`), { ...args, storedRow: rowList[0] }),
			);
		});

		const initialData = { pageRecord: inputData.pageRecord };

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				xLog.error(`${moduleName}: ${err}`);
				callback(err, {});
				return;
			}
			callback('', pageMapper.map(args.storedRow, 'forward'));
		});
	};

	// ================================================================================
	// Access Point Registration

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
