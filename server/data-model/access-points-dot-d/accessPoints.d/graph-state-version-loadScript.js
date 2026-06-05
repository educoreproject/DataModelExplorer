#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[GraphStateStore]]
// @concept: [[AccessPointPattern]]
//
// graph-state-version-loadScript — SERVER-INTERNAL full-row read (doc 06), used by
// replay (05) to get a version's stateScript. Always scoped to userRefId. The full
// row (including stateScript and the transient block) is server-side only; it is
// never returned verbatim to a client — the client surface is graph-state-version-list.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// GET TABLE
		taskList.push((args, next) =>
			args.sqlDb.getTable(
				'graph_state_versions',
				mergeArgs(args, next, 'versionsTable'),
			),
		);

		// READ THE FULL ROW (scoped to userRefId)
		taskList.push((args, next) => {
			const { versionsTable, dataMapping, refId, userRefId } = args;

			if (!refId || !userRefId) {
				next('graph-state-version-loadScript: refId and userRefId are required', args);
				return;
			}

			const query = dataMapping['graph-state-version'].getSql('getByIdForUser', {
				refId,
				userRefId,
			});

			versionsTable.getData(
				query,
				{ suppressStatementLog: true, noTableNameOk: true },
				(err, resultList = []) => {
					if (err) {
						next(err, args);
						return;
					}
					next('', { ...args, row: resultList.qtLast() || null });
				},
			);
		});

		const initialData = {
			refId: inputData.refId,
			userRefId: inputData.userRefId,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, null);
				return;
			}
			callback('', args.row);
		});
	};

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	addEndpoint({ name: moduleName, serviceFunction, dotD });
	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
