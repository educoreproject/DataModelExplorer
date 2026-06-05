#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SessionLifecycle]]
// @concept: [[UserGraphSeam]]
// @concept: [[AccessPointPattern]]
//
// dme-user-graph-close — the CLOSE step (doc 07). Releases the isolated clone via the
// seam (releaseUserGraph -> stop+remove container, delete clone dir, clear the live
// fields). Teardown never persists; the last Save is the durable truth. Idempotent: a
// version with no live container closes cleanly.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;
	const { releaseUserGraph, readVersionRow } = require('../../lib/user-graph/user-graph');
	const { cloneDirFor } = require('../../lib/user-graph/clone-manager');

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: read the version row (scoped) to find the live container
		taskList.push((args, next) => {
			const { userRefId, versionRefId } = args;

			if (!userRefId || !versionRefId) {
				next('dme-user-graph-close: userRefId and versionRefId are required', args);
				return;
			}

			readVersionRow({ sqlDb, dataMapping, userRefId, versionRefId }, (err, row) => {
				if (err) { next(err, args); return; }
				if (!row) { next('Version not found or not owned by this user', args); return; }
				next('', { ...args, versionRow: row });
			});
		});

		// STAGE 2: release via the seam (teardown + clearLive)
		taskList.push((args, next) => {
			const { userRefId, versionRefId, versionRow } = args;

			const handle = {
				versionRefId,
				containerName: versionRow.liveContainerName || null,
				cloneDir: cloneDirFor(userRefId, versionRefId),
				identityMarker: { userRefId, versionRefId },
			};

			releaseUserGraph(handle, { sqlDb, dataMapping }, (err) => {
				if (err) { next(`close failed: ${err}`, args); return; }
				next('', args);
			});
		});

		const initialData = {
			userRefId: inputData.userRefId,
			versionRefId: inputData.versionRefId,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) { callback(err, {}); return; }
			callback('', { versionRefId: args.versionRefId, closed: true });
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
