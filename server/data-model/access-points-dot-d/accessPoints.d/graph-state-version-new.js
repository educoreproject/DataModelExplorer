#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[GraphStateStore]]
// @concept: [[AccessPointPattern]]
//
// graph-state-version-new — INSERT one version row for a user (doc 06). "New" forks
// a fresh version; Save later updates it in place. We write the full column set
// (durable + empty transient block) on insert so every column exists from row one —
// the reaper's multi-row UPDATE then never references a missing column.

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

		// INSERT THE NEW VERSION ROW (full column set; empty transient block)
		taskList.push((args, next) => {
			const { versionsTable, userRefId, versionName } = args;

			if (!userRefId) {
				next('graph-state-version-new: userRefId is required', args);
				return;
			}

			const saveObj = {
				userRefId,
				versionName: versionName || '(new version)',
				stateScript: '',
				embeddingModelVersion: '',
				goldenVersionAuthoredAgainst: '',
				userNodeCount: 0,
				liveBoltUri: '',
				liveBoltPassword: '',
				liveContainerName: '',
				livePort: '',
				lockToken: '',
				openedAt: '',
				lastHeartbeatAt: '',
			};

			const localCallback = (err, savedRefId) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, savedRefId });
			};

			versionsTable.saveObject(saveObj, { suppressStatementLog: true }, localCallback);
		});

		const initialData = {
			userRefId: inputData.userRefId,
			versionName: inputData.versionName,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', {
				refId: args.savedRefId,
				versionName: args.versionName || '(new version)',
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
