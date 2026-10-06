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

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { sqlDb, dataMapping, accessPointsDotD } = passThroughParameters;

	const { readVersionRow, setLiveDirty } = require('../../lib/user-graph/user-graph');
	const { USER_EMBEDDING_RULE } = require('../../lib/user-graph/user-layer-contract');
	const { reEmit } = require('../../lib/user-graph/re-emit');
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

		// STAGE 2: re-emit the live user layer into a deterministic state script (doc 04)
		taskList.push((args, next) => {
			const { versionRow } = args;
			const cloneConnection = require('../../lib/user-graph/user-graph').liveCloneConnectionFor(versionRow);
			if (cloneConnection.error) { next(cloneConnection.error, args); return; }
			neo4jInstanceGen.initDatabaseInstance(
				cloneConnection,
				(err, db) => {
					if (err) { next(`save connect failed: ${err}`, args); return; }
					// the clone is a copy of the golden, so its passport names the build this layer was authored against (W-E-5)
					db.runQuery('MATCH (p:GraphProvenance) RETURN p.manifestRefId AS manifestRefId', {}, (pErr, provenanceRowList) => {
						if (pErr) { db.close(); next(`save passport read failed: ${pErr}`, args); return; }
						const manifestRefIdList = (provenanceRowList || []).map((row) => row.manifestRefId).filter(Boolean);
						if (manifestRefIdList.length !== 1) {
							db.close();
							next(`dme-user-graph-save: the clone's passport must name exactly one manifestRefId (found ${manifestRefIdList.length}); refusing to save a layer with no golden version`, args);
							return;
						}
						const goldenVersionAuthoredAgainst = manifestRefIdList[0];
						reEmit({ userGraphDb: db, goldenVersionAuthoredAgainst }, (rErr, res) => {
							db.close();
							if (rErr) { next(rErr, args); return; }
							next('', {
								...args,
								goldenVersionAuthoredAgainst,
								stateScript: res.stateScript,
								userNodeCount: res.userNodeCount,
								relationshipCount: res.relationshipCount,
							});
						});
					});
				},
			);
		});

		// STAGE 3: persist the re-emitted script + metadata via the Phase 4 store
		taskList.push((args, next) => {
			const { accessPointsDotD, userRefId, versionRefId, userNodeCount, stateScript, goldenVersionAuthoredAgainst } = args;
			accessPointsDotD['graph-state-version-save'](
				{
					userRefId,
					refId: versionRefId,
					stateScript,
					userNodeCount,
					// text-only layer: the column records the policy, not a model (no vector exists to have one)
					embeddingModelVersion: USER_EMBEDDING_RULE.userVectorPolicy,
					goldenVersionAuthoredAgainst,
				},
				(err, result) => {
					if (err) { next(err, args); return; }
					next('', { ...args, saveResult: result });
				},
			);
		});

		// STAGE 4: the durable stateScript now matches the live clone again — clear the
		// dirty flag (doc 12). Best-effort wrt the saved result already being durable: a
		// flag-clear miss is logged, not fatal (the row's durable truth is the save above).
		taskList.push((args, next) => {
			const { sqlDb, versionRefId } = args;
			setLiveDirty({ sqlDb, versionRefId, dirty: 0 }, (err) => {
				if (err) { xLog.error(`dme-user-graph-save: liveDirty clear reported '${err}' (save itself succeeded)`); }
				next('', args);
			});
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
