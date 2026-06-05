#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[GraphStateStore]]
// @concept: [[SessionLifecycle]]
// @concept: [[AccessPointPattern]]
//
// graph-state-version-setLive — record the transient "live session" block on a
// version row at open (doc 06/07): liveBoltUri/password/container/port + lockToken +
// openedAt + lastHeartbeatAt. The soft-lock token is part of this block (open == take
// the lock), so a separate setLock is unnecessary. Ownership is verified first.

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
				next('graph-state-version-setLive: refId and userRefId are required', args);
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

		// WRITE THE TRANSIENT LIVE BLOCK
		taskList.push((args, next) => {
			const {
				versionsTable,
				refId,
				liveBoltUri,
				liveBoltPassword,
				liveContainerName,
				livePort,
				lockToken,
				openedAt,
				lastHeartbeatAt,
			} = args;

			const nowIso = new Date().toISOString();

			const saveObj = {
				refId,
				liveBoltUri: liveBoltUri || '',
				liveBoltPassword: liveBoltPassword || '',
				liveContainerName: liveContainerName || '',
				livePort: typeof livePort === 'number' ? livePort : livePort || '',
				lockToken: lockToken || '',
				openedAt: openedAt || nowIso,
				lastHeartbeatAt: lastHeartbeatAt || nowIso,
			};

			versionsTable.saveObject(saveObj, { suppressStatementLog: true }, (err) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, openedAt: saveObj.openedAt, lastHeartbeatAt: saveObj.lastHeartbeatAt });
			});
		});

		const initialData = {
			refId: inputData.refId,
			userRefId: inputData.userRefId,
			liveBoltUri: inputData.liveBoltUri,
			liveBoltPassword: inputData.liveBoltPassword,
			liveContainerName: inputData.liveContainerName,
			livePort: inputData.livePort,
			lockToken: inputData.lockToken,
			openedAt: inputData.openedAt,
			lastHeartbeatAt: inputData.lastHeartbeatAt,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', {
				refId: args.refId,
				live: true,
				openedAt: args.openedAt,
				lastHeartbeatAt: args.lastHeartbeatAt,
			});
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
