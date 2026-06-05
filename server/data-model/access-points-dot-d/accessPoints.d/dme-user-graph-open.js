#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SessionLifecycle]]
// @concept: [[UserGraphSeam]]
// @concept: [[AccessPointPattern]]
//
// dme-user-graph-open — the OPEN step (doc 07). For { new:true } mints a version row,
// then acquires the isolated clone via the seam (getUserGraph -> provision + marker +
// replay + setLive) and returns ONLY the non-secret identity fields + any dangling refs.
//
// SOFT LOCK (07/09): if the version is already live elsewhere (a held lockToken with a
// FRESH lastHeartbeatAt within the lease), a second open is offered READ-ONLY — it does
// NOT re-provision or steal the lock; it reuses the live container for reads, and the UI
// disables Save + the write tools. A stale lease (heartbeat older than the TTL) is
// treated as abandoned and the open proceeds normally (the reaper also reclaims it).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const LEASE_TTL_SECONDS = 900; // matches the reaper default (08 sets the production value)

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping, accessPointsDotD } = passThroughParameters;
	const { getUserGraph, readVersionRow } = require('../../lib/user-graph/user-graph');

	const isLeaseFresh = (lastHeartbeatAt) => {
		if (!lastHeartbeatAt) return false;
		const stamp = Date.parse(lastHeartbeatAt);
		if (Number.isNaN(stamp)) return false;
		return Date.now() - stamp < LEASE_TTL_SECONDS * 1000;
	};

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: resolve versionRefId (mint for new:true)
		taskList.push((args, next) => {
			const { userRefId, versionRefId, isNew, versionName } = args;
			if (!userRefId) { next('dme-user-graph-open: userRefId is required', args); return; }
			if (versionRefId && !isNew) { next('', { ...args, resolvedVersionRefId: versionRefId }); return; }
			accessPointsDotD['graph-state-version-new']({ userRefId, versionName }, (err, result) => {
				if (err) { next(err, args); return; }
				next('', { ...args, resolvedVersionRefId: result.refId });
			});
		});

		// STAGE 2: soft-lock check — second concurrent open is read-only
		taskList.push((args, next) => {
			const { userRefId, username, resolvedVersionRefId } = args;
			readVersionRow({ sqlDb, dataMapping, userRefId, versionRefId: resolvedVersionRefId }, (err, row) => {
				if (err) { next(err, args); return; }
				if (!row) { next('Version not found or not owned by this user', args); return; }
				const live = !!row.lockToken && isLeaseFresh(row.lastHeartbeatAt);
				if (live) {
					// Read-only second view: reuse the live container for reads, no lock steal.
					next('skipRestOfPipe', {
						...args,
						readOnly: true,
						versionRefId: resolvedVersionRefId,
						identityMarker: {
							userRefId,
							username: username || '',
							versionRefId: resolvedVersionRefId,
							versionName: row.versionName || '',
						},
						danglingRefs: [],
					});
					return;
				}
				next('', args);
			});
		});

		// STAGE 3: acquire the isolated clone via the seam (read-write open)
		taskList.push((args, next) => {
			const { userRefId, username, resolvedVersionRefId } = args;
			getUserGraph({ userRefId, versionRefId: resolvedVersionRefId, username, sqlDb, dataMapping }, (err, handle) => {
				if (err) { next(`open failed: ${err}`, args); return; }
				next('', {
					...args,
					readOnly: false,
					versionRefId: handle.versionRefId,
					identityMarker: handle.identityMarker,
					danglingRefs: handle.danglingRefs || [],
				});
			});
		});

		const initialData = {
			userRefId: inputData.userRefId,
			username: inputData.username,
			versionRefId: inputData.versionRefId,
			isNew: !!inputData.isNew,
			versionName: inputData.versionName,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err && err !== 'skipRestOfPipe') { callback(err, {}); return; }
			callback('', {
				versionRefId: args.versionRefId,
				identityMarker: args.identityMarker,
				danglingRefs: args.danglingRefs || [],
				readOnly: !!args.readOnly,
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
