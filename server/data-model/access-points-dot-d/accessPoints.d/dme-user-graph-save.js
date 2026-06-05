#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SessionLifecycle]]
// @concept: [[GraphStateStore]]
// @concept: [[AccessPointPattern]]
//
// dme-user-graph-save — the SAVE step (doc 07). Re-emits the live user layer and
// persists it on the version row (graph-state-version-save, Phase 4). PHASE 6: the
// stateScript is a placeholder; userNodeCount is the REAL live count. Phase 7 swaps in
// the deterministic re-emit serializer (doc 04) behind this same endpoint.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const PLACEHOLDER_STATE_SCRIPT = '// stateScript pending re-emit serializer (Phase 7, doc 04)';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping, accessPointsDotD } = passThroughParameters;

	const { readVersionRow } = require('../../lib/user-graph/user-graph');
	const { EMBEDDING_MODEL } = require('../../lib/user-graph/write-executor');
	const neo4jInstanceGen = require('../../lib/neo4j-instance/neo4j-instance')({ unused: true });

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: resolve the live clone (scoped)
		taskList.push((args, next) => {
			const { userRefId, versionRefId } = args;
			if (!userRefId || !versionRefId) {
				next('dme-user-graph-save: userRefId and versionRefId are required', args);
				return;
			}
			readVersionRow({ sqlDb, dataMapping, userRefId, versionRefId }, (err, row) => {
				if (err) { next(err, args); return; }
				if (!row) { next('Version not found or not owned by this user', args); return; }
				if (!row.liveBoltUri) { next('Version is not open — open it before saving', args); return; }
				next('', { ...args, versionRow: row });
			});
		});

		// STAGE 2: count the user layer on the live clone (marker excluded)
		taskList.push((args, next) => {
			const { versionRow } = args;
			neo4jInstanceGen.initDatabaseInstance(
				{ neo4jBoltUri: versionRow.liveBoltUri, neo4jUser: 'neo4j', neo4jPassword: versionRow.liveBoltPassword },
				(err, db) => {
					if (err) { next(`save connect failed: ${err}`, args); return; }
					db.runQuery(
						'MATCH (n:UserContent) WHERE NOT n:UserGraphIdentity RETURN count(n) AS c',
						{},
						(qErr, rows) => {
							db.close();
							if (qErr) { next(`save count failed: ${qErr}`, args); return; }
							const userNodeCount = rows && rows[0] ? Number(rows[0].c) : 0;
							next('', { ...args, userNodeCount });
						},
					);
				},
			);
		});

		// STAGE 3: persist via the Phase 4 store (placeholder stateScript for Phase 6)
		taskList.push((args, next) => {
			const { accessPointsDotD, userRefId, versionRefId, userNodeCount } = args;
			accessPointsDotD['graph-state-version-save'](
				{
					userRefId,
					refId: versionRefId,
					stateScript: PLACEHOLDER_STATE_SCRIPT,
					userNodeCount,
					embeddingModelVersion: EMBEDDING_MODEL,
				},
				(err, result) => {
					if (err) { next(err, args); return; }
					next('', { ...args, saveResult: result });
				},
			);
		});

		const initialData = {
			userRefId: inputData.userRefId,
			versionRefId: inputData.versionRefId,
			accessPointsDotD,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) { callback(err, {}); return; }
			callback('', { versionRefId: args.versionRefId, saved: true, userNodeCount: args.userNodeCount });
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
