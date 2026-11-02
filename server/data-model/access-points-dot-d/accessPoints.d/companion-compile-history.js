#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[AccessPointPattern]]
//
// Every stored compile of a companion page, newest first, without its payload, each with the source rows it was built
// from (the spec's "which compiles used it", read from the other side). A compile records only the HASH of its sources,
// so the rows are reconstructed and then proven: the rows current at the compile's compiledAt (for each sourceRole and
// sourcePart, the newest row uploaded at or before it) are hashed exactly as the compile was stamped, and named only
// when that hash equals the compile's sourceSetSha256. When it does not (an upload landed between the compile reading
// its sources and stamping its time), usedSourceRefIdList is null and the compile says its sources cannot be named,
// rather than naming rows it may not have used.
//
//   inputData: { pageSlug }
//   -> callback(errText, [{ refId, pageSlug, graphName, graphContractSha256, sourceSetSha256, compiledAt, compilerVersion,
//                           usedSourceRefIdList: [sourceRefId, ...] | null }, ...])

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const { getCompanionTables } = require('../../lib/companion-pages/companion-tables');
const { sourceSetSha256Of, sourceRecordListCurrentAt } = require('../../lib/companion-pages/companion-source-set');
const { namePatternByField } = require('../../lib/companion-pages/companion-source-rules.json');

const QUIET = { suppressStatementLog: true };
const COMPILE_PROPERTY_LIST = ['refId', 'pageSlug', 'graphName', 'graphContractSha256', 'sourceSetSha256', 'compiledAt', 'compilerVersion'];

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping, accessPointsDotD } = passThroughParameters;
	const compileMapper = dataMapping['companion-compile'];

	const usedSourceRefIdListOf = ({ compileRecord, sourceHistoryList }) => {
		const currentRecordList = sourceRecordListCurrentAt({ sourceHistoryList, momentText: compileRecord.compiledAt });
		return sourceSetSha256Of(currentRecordList) === compileRecord.sourceSetSha256 ? currentRecordList.map((sourceRecord) => sourceRecord.refId).sort() : null;
	};

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
			args.companionTables.compileTable.getData(compileMapper.getSql('historyForPage', { pageSlug: args.pageSlug }), QUIET, (err, rowList = []) =>
				next(err, { ...args, compileRecordList: compileMapper.map(rowList || [], 'forward') }),
			),
		);

		taskList.push((args, next) => accessPointsDotD['companion-source-list']({ pageSlug: args.pageSlug, listScope: 'history' }, (listError, sourceHistoryList) => next(listError, { ...args, sourceHistoryList })));

		pipeRunner(taskList.getList(), { pageSlug: inputData.pageSlug }, (err, args) => {
			if (err) {
				callback(err, []);
				return;
			}
			callback(
				'',
				args.compileRecordList.map((compileRecord) => ({
					...compileRecord.qtSelectProperties(COMPILE_PROPERTY_LIST),
					usedSourceRefIdList: usedSourceRefIdListOf({ compileRecord, sourceHistoryList: args.sourceHistoryList }),
				})),
			);
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
