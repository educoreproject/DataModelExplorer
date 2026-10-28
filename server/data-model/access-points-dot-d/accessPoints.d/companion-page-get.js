#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[AccessPointPattern]]
//
// One companion page's registry record, by its pageSlug: what the compiled page at /explore/companion/<pageSlug>
// shows as its title, summary and audience, and what an admin's edit form starts from. An inactive page is answered
// too (its record says isActive false), so an admin can find and reactivate it; an unregistered slug is refused.
//
//   inputData: { pageSlug }   ->   callback(errText, pageRecord)

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const { getCompanionTables } = require('../../lib/companion-pages/companion-tables');
const { namePatternByField } = require('../../lib/companion-pages/companion-source-rules.json');

const QUIET = { suppressStatementLog: true };

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;
	const pageMapper = dataMapping['companion-page'];

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			if (!new RegExp(namePatternByField.pageSlug).test(String(args.pageSlug))) {
				next(`pageSlug '${args.pageSlug}' does not match ${namePatternByField.pageSlug}`, args);
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => getCompanionTables({ sqlDb, dataMapping }, mergeArgs(args, next, 'companionTables')));

		taskList.push((args, next) =>
			args.companionTables.pageTable.getData(pageMapper.getSql('byPageSlug', { pageSlug: args.pageSlug }), QUIET, (err, rowList = []) =>
				next(err || (rowList && rowList.length ? '' : `no companion page '${args.pageSlug}' is registered`), { ...args, pageRow: rowList && rowList[0] }),
			),
		);

		pipeRunner(taskList.getList(), { pageSlug: inputData.pageSlug }, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', pageMapper.map(args.pageRow, 'forward'));
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
