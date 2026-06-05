'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[UserGraphSeam]]
// @concept: [[ColdClone]]
//
// user-graph.js — the single stable seam for acquiring and releasing a usable user
// graph (design doc 03). Callers know only getUserGraph / releaseUserGraph; the clone,
// identity injection, and (later) the warm-pool fast path grow behind this interface.
//
// PHASE 5 — the seam's REAL implementation (the cold clone). getUserGraph now:
//   1. resolves username + the version row's versionName,
//   2. provisions a genuine per-user isolated clone of the quiesced golden
//      (clone-manager: plain cp, dedicated container, no NEO4J_AUTH),
//   3. injects the :UserGraphIdentity marker NODE into the clone,
//   4. records the live session on the version row (06 setLive), and
//   5. returns the handle with the clone's real graphConnection + containerName.
// releaseUserGraph tears the clone down (container + clone dir) and clears the live
// fields. The return CONTRACT is unchanged from the Phase 3 stub.
//
// The serving golden is briefly quiesced per open (the slow cold-boot baseline);
// Phase 8 hides this behind a snapshot-source + warm pool with no caller change.

const qt = require('qtools-functional-library');
const makeRefId = require('../../../lib/make-ref-id');
const { pipeRunner, taskListPlus } = new require(
	'qtools-asynchronous-pipe-plus',
)();
const cloneManager = require('./clone-manager');
const neo4jInstanceGen = require('../neo4j-instance/neo4j-instance')({ unused: true });
const { replayStateScript, decodeStateScript } = require('./re-emit');

const VERSIONS_TABLE = 'graph_state_versions';

// ---------------------------------------------------------------------------
// buildGraphConnection — the STANDARD DME connection from config. Still used by the
// askMilo wiring (ws-graphinator) in User mode until Phase 6 points askMilo at the
// live clone. getUserGraph itself no longer uses it — it returns the clone's bolt.
const buildGraphConnection = () => {
	const { getConfig } = process.global;
	const cfg = getConfig('dataModelExplorerSearch') || {};
	if (!cfg.neo4jBoltUri) {
		return null;
	}
	return {
		boltUri: cfg.neo4jBoltUri,
		user: cfg.neo4jUser,
		password: cfg.neo4jPassword,
	};
};

// ---------------------------------------------------------------------------
// Internal: read one version row (scoped to the user).
const readVersionRow = ({ sqlDb, dataMapping, userRefId, versionRefId }, callback) => {
	sqlDb.getTable(VERSIONS_TABLE, (err, tableRef) => {
		if (err || !tableRef) { callback(err || 'no versions table'); return; }
		const query = dataMapping['graph-state-version'].getSql('getByIdForUser', {
			refId: versionRefId,
			userRefId,
		});
		tableRef.getData(
			query,
			{ suppressStatementLog: true, noTableNameOk: true },
			(getErr, rows = []) => {
				if (getErr) { callback(getErr); return; }
				const row = rows.qtLast() || null;
				if (row && row.stateScript) {
					row.stateScript = decodeStateScript(row.stateScript);
				}
				callback('', row);
			},
		);
	});
};

// Internal: write transient live block (setLive) or clear it (clearLive).
const writeLiveBlock = ({ sqlDb, versionRefId, fields }, callback) => {
	sqlDb.getTable(VERSIONS_TABLE, (err, tableRef) => {
		if (err || !tableRef) { callback(err || 'no versions table'); return; }
		tableRef.saveObject(
			{ refId: versionRefId, ...fields },
			{ suppressStatementLog: true },
			(saveErr) => callback(saveErr || ''),
		);
	});
};

// ---------------------------------------------------------------------------
// getUserGraph — the cold clone (doc 03 step 2). callback(err, UserGraphHandle)
const getUserGraph = (
	{ userRefId, versionRefId, username, sqlDb, dataMapping } = {},
	callback,
) => {
	const { xLog } = process.global;
	const taskList = new taskListPlus();

	// STAGE 1: resolve username (caller's JWT value preferred) + the version row.
	taskList.push((args, next) => {
		if (!userRefId || !versionRefId) {
			next('getUserGraph: userRefId and versionRefId are required', args);
			return;
		}
		if (!sqlDb || !dataMapping) {
			next('getUserGraph: sqlDb and dataMapping are required for the cold clone', args);
			return;
		}
		readVersionRow({ sqlDb, dataMapping, userRefId, versionRefId }, (err, row) => {
			if (err) { next(err, args); return; }
			if (!row) { next('getUserGraph: version not found or not owned by this user', args); return; }
			next('', {
				...args,
				username: username || '',
				versionName: row.versionName || `version ${versionRefId}`,
				stateScript: row.stateScript || '',
			});
		});
	});

	// STAGE 2: provision the isolated clone.
	taskList.push((args, next) => {
		cloneManager.provisionClone({ userRefId, versionRefId }, (err, descriptor) => {
			if (err) { next(`getUserGraph clone failed: ${err}`, args); return; }
			next('', { ...args, descriptor });
		});
	});

	// STAGE 3: inject the identity marker NODE into the clone.
	taskList.push((args, next) => {
		const { descriptor, username, versionName } = args;
		const markerDb = neo4jInstanceGen.initDatabaseInstance(
			{ neo4jBoltUri: descriptor.boltUri, neo4jUser: descriptor.user, neo4jPassword: descriptor.password },
			(connErr, db) => {
				if (connErr) { next(`marker connect failed: ${connErr}`, args); return; }
				const cypher =
					'CREATE (i:UserGraphIdentity:UserContent {' +
					'userRefId: $userRefId, username: $username, versionRefId: $versionRefId, ' +
					'versionName: $versionName, createdAt: toString(datetime())}) RETURN i';
				db.runQuery(
					cypher,
					{ userRefId, username, versionRefId, versionName },
					(qErr) => {
						db.close();
						if (qErr) { next(`marker injection failed: ${qErr}`, args); return; }
						next('', args);
					},
				);
			},
		);
	});

	// STAGE 3.5: replay the stored state script into the clone (05). Collect dangling
	// references (standard endpoints that no longer resolve in the current golden) —
	// surfaced on the handle, never silently dropped. Skipped for a brand-new version.
	taskList.push((args, next) => {
		const { descriptor, stateScript } = args;
		if (!stateScript) { next('', { ...args, danglingRefs: [] }); return; }
		neo4jInstanceGen.initDatabaseInstance(
			{ neo4jBoltUri: descriptor.boltUri, neo4jUser: descriptor.user, neo4jPassword: descriptor.password },
			(connErr, db) => {
				if (connErr) { next(`replay connect failed: ${connErr}`, args); return; }
				replayStateScript({ userGraphDb: db, stateScript }, (rErr, res) => {
					db.close();
					if (rErr) { next(rErr, args); return; }
					next('', { ...args, danglingRefs: res.danglingRefs });
				});
			},
		);
	});

	// STAGE 4: record the live session on the version row (06 setLive).
	taskList.push((args, next) => {
		const { descriptor } = args;
		const lockToken = makeRefId(16);
		const nowIso = new Date().toISOString();
		writeLiveBlock({
			sqlDb,
			versionRefId,
			fields: {
				liveBoltUri: descriptor.boltUri,
				liveBoltPassword: descriptor.password,
				liveContainerName: descriptor.containerName,
				livePort: descriptor.boltPort,
				lockToken,
				openedAt: nowIso,
				lastHeartbeatAt: nowIso,
			},
		}, (err) => {
			if (err) { next(`setLive failed: ${err}`, args); return; }
			next('', { ...args, lockToken });
		});
	});

	// STAGE 5: assemble the handle.
	taskList.push((args, next) => {
		const { descriptor, username, versionName, lockToken, danglingRefs } = args;
		const handle = {
			versionRefId,
			graphConnection: {
				boltUri: descriptor.boltUri,
				user: descriptor.user,
				password: descriptor.password,
			},
			containerName: descriptor.containerName,
			cloneDir: descriptor.cloneDir, // for teardown
			lockToken,
			identityMarker: {
				userRefId,
				username,
				versionRefId,
				versionName,
			},
			danglingRefs: danglingRefs || [], // surfaced standard refs that no longer resolve (05)
		};
		next('', { ...args, handle });
	});

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			// Best-effort cleanup if we provisioned before failing downstream.
			if (args && args.descriptor) {
				cloneManager.teardownClone(
					{ containerName: args.descriptor.containerName, cloneDir: args.descriptor.cloneDir },
					() => callback(err),
				);
				return;
			}
			callback(err);
			return;
		}
		callback('', args.handle);
	});
};

// ---------------------------------------------------------------------------
// releaseUserGraph(handle, { sqlDb, dataMapping }, callback) — real teardown:
// stop+remove the container, delete the clone dir, clear the live fields (06).
// Teardown never persists; Save is the durable path.
const releaseUserGraph = (handle, deps, callback) => {
	const cb = typeof callback === 'function'
		? callback
		: (typeof deps === 'function' ? deps : () => {});
	const { sqlDb } = (deps && typeof deps === 'object') ? deps : {};

	if (!handle || !handle.identityMarker) {
		cb('releaseUserGraph: invalid handle');
		return;
	}

	const { userRefId, versionRefId } = handle.identityMarker;

	cloneManager.teardownClone(
		{ containerName: handle.containerName, cloneDir: handle.cloneDir },
		(tearErr) => {
			const clearedFields = {
				liveBoltUri: '', liveBoltPassword: '', liveContainerName: '',
				livePort: '', lockToken: '', openedAt: '', lastHeartbeatAt: '',
			};
			if (!sqlDb) {
				cb(tearErr || '', { released: true, versionRefId });
				return;
			}
			writeLiveBlock({ sqlDb, versionRefId, fields: clearedFields }, (clearErr) => {
				cb(tearErr || clearErr || '', { released: true, versionRefId, userRefId });
			});
		},
	);
};

module.exports = {
	getUserGraph,
	releaseUserGraph,
	buildGraphConnection,
	readVersionRow,
};
