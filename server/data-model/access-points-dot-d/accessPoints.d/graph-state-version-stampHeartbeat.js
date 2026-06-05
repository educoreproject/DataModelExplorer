#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[GraphStateStore]]
// @concept: [[SessionLifecycle]]
// @concept: [[AccessPointPattern]]
//
// graph-state-version-stampHeartbeat — refresh a live version's lease (doc 06/07).
// The live session calls this periodically; the reaper treats
// now - lastHeartbeatAt > leaseTTL as abandoned. Scoped to userRefId. Concrete
// stamp interval is set in 08; this just advances the stamp.

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

		// OWNERSHIP CHECK
		taskList.push((args, next) => {
			const { versionsTable, dataMapping, refId, userRefId } = args;

			if (!refId || !userRefId) {
				next('graph-state-version-stampHeartbeat: refId and userRefId are required', args);
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
					if (!resultList.qtLast()) {
						next('Version not found or not owned by this user', args);
						return;
					}
					next('', args);
				},
			);
		});

		// ADVANCE THE HEARTBEAT STAMP
		taskList.push((args, next) => {
			const { versionsTable, refId, lastHeartbeatAt } = args;
			const stamp = lastHeartbeatAt || new Date().toISOString();

			versionsTable.saveObject(
				{ refId, lastHeartbeatAt: stamp },
				{ suppressStatementLog: true },
				(err) => {
					if (err) {
						next(err, args);
						return;
					}
					next('', { ...args, stampedAt: stamp });
				},
			);
		});

		const initialData = {
			refId: inputData.refId,
			userRefId: inputData.userRefId,
			lastHeartbeatAt: inputData.lastHeartbeatAt,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', { refId: args.refId, stampedAt: args.stampedAt });
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
