#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SessionLifecycle]]
// @concept: [[AccessPointPattern]]
//
// dme-user-graph-status — the authoritative "is this version open / unsaved" probe
// (doc 12). Owner-scoped (readVersionRow filters on userRefId), returns ONLY the
// boolean state a client needs for the unsaved-changes guards:
//   [{ versionRefId, open, dirty }]
// Never returns the stateScript or any liveBolt* secret. A missing or foreign version
// yields [] (a user can never probe another user's row). "open" === a live block is
// recorded on the row (a live clone exists); "dirty" === open AND liveDirty === 1 (a
// successful live write not yet re-emitted to the durable stateScript).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;
	const { readVersionRow } = require('../../lib/user-graph/user-graph');

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// SINGLE STAGE: an empty versionRefId means the client has no active graph (nothing
		// open, nothing to lose) -> []. Otherwise read the owner-scoped row and derive the
		// two booleans. A row the user does not own reads back null -> [] as well.
		taskList.push((args, next) => {
			const { userRefId, versionRefId } = args;
			if (!userRefId) {
				next('dme-user-graph-status: userRefId is required', args);
				return;
			}
			if (!versionRefId) {
				next('', { ...args, statusList: [] });
				return;
			}
			readVersionRow({ sqlDb, dataMapping, userRefId, versionRefId }, (err, row) => {
				if (err) { next(err, args); return; }
				if (!row) { next('', { ...args, statusList: [] }); return; }
				const open = !!(row.liveContainerName && row.lockToken);
				const dirty = open && Number(row.liveDirty) === 1;
				next('', { ...args, statusList: [{ versionRefId, open, dirty }] });
			});
		});

		const initialData = {
			userRefId: inputData.userRefId,
			versionRefId: inputData.versionRefId,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, []);
				return;
			}
			callback('', args.statusList || []);
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
