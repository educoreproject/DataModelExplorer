#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SessionLifecycle]]
// @concept: [[UserGraphSeam]]
// @concept: [[AccessPointPattern]]
//
// dme-user-graph-open — the OPEN step of the user-graph session loop (doc 07). For
// { new:true } it mints a version row first (graph-state-version-new); then it acquires
// the isolated clone via the seam (getUserGraph -> provision + marker + setLive) and
// returns ONLY the non-secret identity fields. The bolt secret never leaves the server.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping, accessPointsDotD } = passThroughParameters;
	const { getUserGraph } = require('../../lib/user-graph/user-graph');

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: for new:true, mint a version row to obtain a versionRefId
		taskList.push((args, next) => {
			const { userRefId, versionRefId, isNew, versionName } = args;

			if (!userRefId) {
				next('dme-user-graph-open: userRefId is required', args);
				return;
			}

			if (versionRefId && !isNew) {
				next('', { ...args, resolvedVersionRefId: versionRefId });
				return;
			}

			accessPointsDotD['graph-state-version-new'](
				{ userRefId, versionName },
				(err, result) => {
					if (err) { next(err, args); return; }
					next('', { ...args, resolvedVersionRefId: result.refId });
				},
			);
		});

		// STAGE 2: acquire the isolated clone via the seam
		taskList.push((args, next) => {
			const { userRefId, username, resolvedVersionRefId } = args;

			getUserGraph(
				{ userRefId, versionRefId: resolvedVersionRefId, username, sqlDb, dataMapping },
				(err, handle) => {
					if (err) { next(`open failed: ${err}`, args); return; }
					next('', { ...args, handle });
				},
			);
		});

		const initialData = {
			userRefId: inputData.userRefId,
			username: inputData.username,
			versionRefId: inputData.versionRefId,
			isNew: !!inputData.isNew,
			versionName: inputData.versionName,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) { callback(err, {}); return; }
			const { handle } = args;
			// Return ONLY non-secret fields (identityMarker + versionRefId). No graphConnection.
			callback('', {
				versionRefId: handle.versionRefId,
				identityMarker: handle.identityMarker,
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
