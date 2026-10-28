#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[AccessPointPattern]]
//
// The active companion pages for the standard in focus (gate G1.1). With only a standardKey: that standard's pages
// that are not pinned to a node. With a subjectStableId as well: those, plus the pages pinned to that node and no
// other. Inactive pages are never listed.
//
//   inputData: { standardKey, subjectStableId (absent or null when the focus is the standard itself) }
//   -> callback(errText, [pageRecord, ...]) sorted by sortOrder, title

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const { getCompanionTables } = require('../../lib/companion-pages/companion-tables');

const QUIET = { suppressStatementLog: true };

const isNonEmptyText = (candidateValue) => typeof candidateValue === 'string' && candidateValue.trim() !== '';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;
	const pageMapper = dataMapping['companion-page'];

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			if (!isNonEmptyText(args.standardKey)) {
				next('standardKey is required', args);
				return;
			}
			if (args.subjectStableId !== undefined && args.subjectStableId !== null && !isNonEmptyText(args.subjectStableId)) {
				next('subjectStableId must be non-empty text, or absent', args);
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => getCompanionTables({ sqlDb, dataMapping }, mergeArgs(args, next, 'companionTables')));

		taskList.push((args, next) => {
			const { standardKey, subjectStableId, companionTables } = args;
			const queryText = isNonEmptyText(subjectStableId)
				? pageMapper.getSql('activeForStandardSubject', { standardKey, subjectStableId })
				: pageMapper.getSql('activeForStandard', { standardKey });
			companionTables.pageTable.getData(queryText, QUIET, (err, rowList = []) => next(err, { ...args, pageRowList: rowList || [] }));
		});

		const initialData = { standardKey: inputData.standardKey, subjectStableId: inputData.subjectStableId };

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, []);
				return;
			}
			callback('', pageMapper.map(args.pageRowList, 'forward'));
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
