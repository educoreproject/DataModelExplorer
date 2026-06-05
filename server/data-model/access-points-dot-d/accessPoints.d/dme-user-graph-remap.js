#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[Replay]]
// @concept: [[AccessPointPattern]]
//
// dme-user-graph-remap — opt-in remap of a surfaced dangling reference (doc 05/09).
// The user points a no-longer-resolving standard reference at the current equivalent;
// the STORED state script is updated so the fix is permanent (a standard endpoint is a
// uri literal in the script, so the remap is a precise substitution of the old uri for
// the new). Re-save round-trips through the Phase 4 store. Ownership-checked.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping, accessPointsDotD } = passThroughParameters;
	const { readVersionRow } = require('../../lib/user-graph/user-graph');

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: read the version row (decoded stateScript), scoped to the user
		taskList.push((args, next) => {
			const { userRefId, versionRefId, oldKey, newKey } = args;
			if (!userRefId || !versionRefId || !oldKey || !newKey) {
				next('dme-user-graph-remap: userRefId, versionRefId, oldKey, newKey are required', args);
				return;
			}
			readVersionRow({ sqlDb, dataMapping, userRefId, versionRefId }, (err, row) => {
				if (err) { next(err, args); return; }
				if (!row) { next('Version not found or not owned by this user', args); return; }
				next('', { ...args, row });
			});
		});

		// STAGE 2: substitute the old uri literal for the new one in the stored script
		taskList.push((args, next) => {
			const { row, oldKey, newKey } = args;
			const script = row.stateScript || '';
			const needle = `'${oldKey}'`;
			if (script.indexOf(needle) === -1) {
				next(`remap: the reference '${oldKey}' is not present in this version's script`, args);
				return;
			}
			const updated = script.split(needle).join(`'${newKey}'`);
			next('', { ...args, updatedScript: updated, userNodeCount: row.userNodeCount, embeddingModelVersion: row.embeddingModelVersion });
		});

		// STAGE 3: persist the updated script (re-encodes through the store)
		taskList.push((args, next) => {
			const { accessPointsDotD, userRefId, versionRefId, updatedScript, userNodeCount, embeddingModelVersion } = args;
			accessPointsDotD['graph-state-version-save'](
				{
					userRefId,
					refId: versionRefId,
					stateScript: updatedScript,
					userNodeCount: typeof userNodeCount === 'number' ? userNodeCount : Number(userNodeCount) || 0,
					embeddingModelVersion: embeddingModelVersion || '',
				},
				(err) => { if (err) { next(err, args); return; } next('', args); },
			);
		});

		const initialData = {
			userRefId: inputData.userRefId, versionRefId: inputData.versionRefId,
			oldKey: inputData.oldKey, newKey: inputData.newKey,
			sqlDb, dataMapping, accessPointsDotD,
		};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) { callback(err, {}); return; }
			callback('', { versionRefId: args.versionRefId, remapped: true, from: args.oldKey, to: args.newKey });
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
