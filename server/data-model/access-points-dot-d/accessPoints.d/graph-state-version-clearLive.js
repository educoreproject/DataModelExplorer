#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[GraphStateStore]]
// @concept: [[SessionLifecycle]]
// @concept: [[AccessPointPattern]]
//
// graph-state-version-clearLive — clear the transient "live session" block at close
// (doc 06/07): empties liveBolt*/livePort/lockToken/openedAt/lastHeartbeatAt. The
// durable columns (stateScript, versionName, ...) are untouched — teardown never
// persists; Save is the durable path. Empty string is the cleared marker (saveObject
// drops nulls). Ownership is verified first.

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
				next('graph-state-version-clearLive: refId and userRefId are required', args);
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

		// CLEAR THE TRANSIENT LIVE BLOCK
		taskList.push((args, next) => {
			const { versionsTable, refId } = args;

			const saveObj = {
				refId,
				liveBoltUri: '',
				liveBoltPassword: '',
				liveContainerName: '',
				livePort: '',
				lockToken: '',
				openedAt: '',
				lastHeartbeatAt: '',
			};

			versionsTable.saveObject(saveObj, { suppressStatementLog: true }, (err) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', args);
			});
		});

		const initialData = {
			refId: inputData.refId,
			userRefId: inputData.userRefId,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', { refId: args.refId, cleared: true });
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
