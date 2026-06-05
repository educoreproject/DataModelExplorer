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
// OWNER RECLAIM (07/09): a version is single-owner (readVersionRow is userRefId-scoped),
// so a still-live lock (a held lockToken with a FRESH lastHeartbeatAt within the lease)
// is ALWAYS this same user's own prior, unclosed session — Save does not release the lock
// and leaving the page Closes only via the client hook, which can miss on a crash. Rather
// than crippling the owner with a read-only view, the owner RECLAIMS: the prior live
// container is torn down + the live block cleared, then the open proceeds normally
// (read-write: fresh provision + replay of the saved stateScript + a new lock). A stale
// lease is likewise reclaimed; the reaper remains the backstop for sessions that never
// reopen.

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
	const { getUserGraph, readVersionRow, releaseUserGraph } = require('../../lib/user-graph/user-graph');
	const { cloneDirFor } = require('../../lib/user-graph/clone-manager');

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

		// STAGE 2: owner-reclaim. A live lock here is always this same user's own prior,
		// unclosed session (single-owner version), so reclaim it: tear down the orphaned
		// live container + clear the live block, then fall through to the normal read-write
		// open below (fresh provision + replay of the saved stateScript + a new lock).
		taskList.push((args, next) => {
			const { userRefId, resolvedVersionRefId } = args;
			readVersionRow({ sqlDb, dataMapping, userRefId, versionRefId: resolvedVersionRefId }, (err, row) => {
				if (err) { next(err, args); return; }
				if (!row) { next('Version not found or not owned by this user', args); return; }
				const live = !!row.lockToken && isLeaseFresh(row.lastHeartbeatAt);
				if (!live) { next('', args); return; }
				const staleHandle = {
					versionRefId: resolvedVersionRefId,
					containerName: row.liveContainerName || null,
					cloneDir: cloneDirFor(userRefId, resolvedVersionRefId),
					identityMarker: { userRefId, versionRefId: resolvedVersionRefId },
				};
				releaseUserGraph(staleHandle, { sqlDb, dataMapping }, (relErr) => {
					if (relErr) {
						// releaseUserGraph clears the live block even on a teardown miss, so a
						// fresh open is still correct. Log and proceed (the reaper reclaims any
						// leaked container).
						xLog.error(`dme-user-graph-open reclaim: stale teardown reported '${relErr}'; proceeding with fresh read-write open`);
					}
					next('', args);
				});
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
			if (err) { callback(err, {}); return; }
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
