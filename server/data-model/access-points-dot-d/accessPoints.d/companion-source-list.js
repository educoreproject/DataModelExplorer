#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[AccessPointPattern]]
//
// A companion page's sources with their provenance, never their storage names.
//   listScope 'current': the current row of each (sourceRole, sourcePart) — what a page is built from, for everyone
//   listScope 'history': every row ever uploaded, newest first within each role and part — for admins (the
//                        companion-source-history endpoint is the one that allows it)
//
//   inputData: { pageSlug, listScope }   ->   callback(errText, [sourceRecord, ...])

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const { getCompanionTables } = require('../../lib/companion-pages/companion-tables');
const { namePatternByField } = require('../../lib/companion-pages/companion-source-rules.json');

const QUIET = { suppressStatementLog: true };
const QUERY_NAME_BY_LIST_SCOPE = { current: 'currentForPage', history: 'historyForPage' };

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;
	const sourceMapper = dataMapping['companion-source'];

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			if (!new RegExp(namePatternByField.pageSlug).test(String(args.pageSlug))) {
				next(`pageSlug '${args.pageSlug}' does not match ${namePatternByField.pageSlug}`, args);
				return;
			}
			if (!QUERY_NAME_BY_LIST_SCOPE[args.listScope]) {
				next(`listScope '${args.listScope}' is not one of ${Object.keys(QUERY_NAME_BY_LIST_SCOPE).join(', ')}`, args);
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => getCompanionTables({ sqlDb, dataMapping }, mergeArgs(args, next, 'companionTables')));

		taskList.push((args, next) => {
			const queryText = sourceMapper.getSql(QUERY_NAME_BY_LIST_SCOPE[args.listScope], { pageSlug: args.pageSlug });
			args.companionTables.sourceTable.getData(queryText, QUIET, (err, rowList = []) => next(err, { ...args, sourceRowList: rowList || [] }));
		});

		const initialData = { pageSlug: inputData.pageSlug, listScope: inputData.listScope };

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, []);
				return;
			}
			callback('', sourceMapper.map(args.sourceRowList, 'forward').map(sourceMapper.toPublic));
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
