#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[GraphStateStore]]
// @concept: [[AccessPointPattern]]
//
// graph-state-version-rename — rename a version (versionName), ownership-checked.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			args.sqlDb.getTable('graph_state_versions', mergeArgs(args, next, 'versionsTable')),
		);

		taskList.push((args, next) => {
			const { versionsTable, dataMapping, refId, userRefId, versionName } = args;
			if (!refId || !userRefId || !versionName) {
				next('graph-state-version-rename: refId, userRefId, versionName are required', args);
				return;
			}
			const query = dataMapping['graph-state-version'].getSql('getByIdForUser', { refId, userRefId });
			versionsTable.getData(query, { suppressStatementLog: true, noTableNameOk: true }, (err, rows = []) => {
				if (err) { next(err, args); return; }
				if (!rows.qtLast()) { next('Version not found or not owned by this user', args); return; }
				versionsTable.saveObject({ refId, versionName }, { suppressStatementLog: true }, (sErr) => {
					if (sErr) { next(sErr, args); return; }
					next('', args);
				});
			});
		});

		const initialData = {
			refId: inputData.refId, userRefId: inputData.userRefId, versionName: inputData.versionName,
			sqlDb, dataMapping,
		};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) { callback(err, {}); return; }
			callback('', { refId: args.refId, versionName: args.versionName, renamed: true });
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
