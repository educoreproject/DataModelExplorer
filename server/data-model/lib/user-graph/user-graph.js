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
const warmPool = require('./warm-pool');
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
		xLog.status(`[dmeOpenTrace] getUserGraph STAGE1: reading version row userRefId=${userRefId} versionRefId=${versionRefId}`);
		readVersionRow({ sqlDb, dataMapping, userRefId, versionRefId }, (err, row) => {
			if (err) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE1: readVersionRow ERROR: ${err}`); next(err, args); return; }
			if (!row) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE1: version NOT FOUND/owned`); next('getUserGraph: version not found or not owned by this user', args); return; }
			xLog.status(`[dmeOpenTrace] getUserGraph STAGE1: row OK versionName="${row.versionName || ''}" stateScript=${row.stateScript ? row.stateScript.length + ' chars' : 'EMPTY (new version)'}`);
			next('', {
				...args,
				username: username || '',
				versionName: row.versionName || `version ${versionRefId}`,
				stateScript: row.stateScript || '',
			});
		});
	});

	// STAGE 2: acquire the isolated clone — WARM POOL fast path first (claim a pre-booted
	// clone, skipping the cold cp + boot), else a cold clone on a spike (08). A refill is
	// triggered asynchronously toward the pool depth. The claimed clone becomes this
	// session's container (marker + replay + setLive below); teardown removes it.
	taskList.push((args, next) => {
		const coldProvision = () => {
			xLog.status(`[dmeOpenTrace] getUserGraph STAGE2: warm pool empty — COLD provisioning clone for versionRefId=${versionRefId}`);
			cloneManager.provisionClone({ userRefId, versionRefId }, (err, descriptor) => {
				if (err) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE2: provisionClone FAILED: ${err}`); next(`getUserGraph clone failed: ${err}`, args); return; }
				xLog.status(`[dmeOpenTrace] getUserGraph STAGE2: clone provisioned — container=${descriptor.containerName} bolt=${descriptor.boltUri}`);
				next('', { ...args, descriptor, warmServed: false });
			});
		};
		const warm = warmPool.claimWarm();
		if (warm) {
			// rename-on-claim: a spare keeps its usr__warm_* name until claimed; rename it to the
			// owned name so idle-vs-in-use is unambiguous (safe restart-adoption + correct cap
			// counting + teardown). The physical cloneDir (under uid-_warm) is unchanged.
			const ownedName = cloneManager.containerNameFor(userRefId, versionRefId);
			try {
				cloneManager.renameContainer(warm.containerName, ownedName);
			} catch (e) {
				xLog.status(`[dmeOpenTrace] getUserGraph STAGE2: warm rename ${warm.containerName} -> ${ownedName} FAILED (${e.message}); falling back to cold provision`);
				coldProvision();
				return;
			}
			const owned = { ...warm, containerName: ownedName };
			xLog.status(`[dmeOpenTrace] getUserGraph STAGE2: WARM POOL hit — claimed ${warm.containerName}, renamed to ${ownedName} bolt=${owned.boltUri}`);
			next('', { ...args, descriptor: owned, warmServed: true });
			return;
		}
		coldProvision();
	});

	// STAGE 3: inject the identity marker NODE into the clone.
	taskList.push((args, next) => {
		const { descriptor, username, versionName } = args;
		xLog.status(`[dmeOpenTrace] getUserGraph STAGE3: injecting identity marker into ${descriptor.boltUri}`);
		const markerDb = neo4jInstanceGen.initDatabaseInstance(
			{ neo4jBoltUri: descriptor.boltUri, neo4jUser: descriptor.user, neo4jPassword: descriptor.password },
			(connErr, db) => {
				if (connErr) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE3: marker connect FAILED: ${connErr}`); next(`marker connect failed: ${connErr}`, args); return; }
				const cypher =
					'CREATE (i:UserGraphIdentity:UserContent {' +
					'userRefId: $userRefId, username: $username, versionRefId: $versionRefId, ' +
					'versionName: $versionName, createdAt: toString(datetime())}) RETURN i';
				db.runQuery(
					cypher,
					{ userRefId, username, versionRefId, versionName },
					(qErr) => {
						db.close();
						if (qErr) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE3: marker injection FAILED: ${qErr}`); next(`marker injection failed: ${qErr}`, args); return; }
						xLog.status(`[dmeOpenTrace] getUserGraph STAGE3: marker injected OK`);
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
		if (!stateScript) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE3.5: no stateScript — skipping replay (new/empty version)`); next('', { ...args, danglingRefs: [] }); return; }
		xLog.status(`[dmeOpenTrace] getUserGraph STAGE3.5: replaying stateScript (${stateScript.length} chars) into ${descriptor.boltUri}`);
		neo4jInstanceGen.initDatabaseInstance(
			{ neo4jBoltUri: descriptor.boltUri, neo4jUser: descriptor.user, neo4jPassword: descriptor.password },
			(connErr, db) => {
				if (connErr) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE3.5: replay connect FAILED: ${connErr}`); next(`replay connect failed: ${connErr}`, args); return; }
				replayStateScript({ userGraphDb: db, stateScript }, (rErr, res) => {
					db.close();
					if (rErr) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE3.5: replay FAILED: ${rErr}`); next(rErr, args); return; }
					xLog.status(`[dmeOpenTrace] getUserGraph STAGE3.5: replay OK — danglingRefs=${(res.danglingRefs || []).length}`);
					next('', { ...args, danglingRefs: res.danglingRefs });
				});
			},
		);
	});

	// STAGE 3.6: ensure the durable graph NAMEPLATE — a real UserContent node (NOT
	// UserGraphIdentity, so the re-emit serializer SAVES it). Written ONCE at create
	// (ON CREATE only), then it replays from the stateScript on every later open — the
	// name lives IN the graph's own content and is the user's to edit. Also a soft check:
	// for a saved graph the replayed nameplate's versionRefId should match the request.
	taskList.push((args, next) => {
		const { descriptor, versionName } = args;
		neo4jInstanceGen.initDatabaseInstance(
			{ neo4jBoltUri: descriptor.boltUri, neo4jUser: descriptor.user, neo4jPassword: descriptor.password },
			(connErr, db) => {
				if (connErr) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE3.6: nameplate connect FAILED: ${connErr}`); next(`nameplate connect failed: ${connErr}`, args); return; }
				const cypher =
					'MERGE (i:UserContent {userNodeId: $nameplateId}) ' +
					'ON CREATE SET i.name = $versionName, i.versionRefId = $versionRefId, i.kind = $kind, i.createdAt = toString(datetime()) ' +
					'RETURN i.name AS name, (i.versionRefId = $versionRefId) AS refIdMatches';
				db.runQuery(
					cypher,
					{ nameplateId: 'graphNameplate', versionName, versionRefId, kind: 'graphNameplate' },
					(qErr, records) => {
						db.close();
						if (qErr) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE3.6: nameplate FAILED: ${qErr}`); next(`nameplate failed: ${qErr}`, args); return; }
						const row = (records && records[0]) || {};
						xLog.status(`[dmeOpenTrace] getUserGraph STAGE3.6: nameplate ensured name="${row.name}" refIdMatches=${row.refIdMatches}`);
						next('', args);
					},
				);
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
				// Fresh provision (or owner-reclaim re-provision) means the clone matches
				// the durable stateScript after replay: not dirty (doc 12).
				liveDirty: 0,
			},
		}, (err) => {
			if (err) { xLog.status(`[dmeOpenTrace] getUserGraph STAGE4: setLive FAILED: ${err}`); next(`setLive failed: ${err}`, args); return; }
			xLog.status(`[dmeOpenTrace] getUserGraph STAGE4: setLive OK — lockToken minted, livePort=${descriptor.boltPort} container=${descriptor.containerName}`);
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
		xLog.status(`[dmeOpenTrace] getUserGraph STAGE5: handle assembled — versionRefId=${handle.versionRefId} bolt=${handle.graphConnection.boltUri} container=${handle.containerName}`);
		next('', { ...args, handle });
	});

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			// Best-effort cleanup if we provisioned before failing downstream.
			if (args && args.descriptor) {
				xLog.status(`[dmeOpenTrace] getUserGraph: FAILED after provisioning — tearing down clone ${args.descriptor.containerName}. err=${err}`);
				cloneManager.teardownClone(
					{ containerName: args.descriptor.containerName, cloneDir: args.descriptor.cloneDir },
					() => callback(err),
				);
				return;
			}
			xLog.status(`[dmeOpenTrace] getUserGraph: FAILED before provisioning. err=${err}`);
			callback(err);
			return;
		}
		xLog.status(`[dmeOpenTrace] getUserGraph: COMPLETE — returning handle for versionRefId=${args.handle.versionRefId}`);
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
				liveDirty: 0, // no live clone, nothing unsaved (doc 12)
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

// ---------------------------------------------------------------------------
// setLiveDirty — flip the authoritative "unsaved live writes" flag on the version
// row (doc 12). A successful user write sets dirty=1; Save clears it to 0. Open
// (setLive) and Close (clearLive) already set liveDirty=0 with the rest of the live
// block, so this helper only carries the write/save transitions. Column knowledge for
// the live block stays in this one seam file.
const setLiveDirty = ({ sqlDb, versionRefId, dirty }, callback) => {
	const cb = typeof callback === 'function' ? callback : () => {};
	if (!sqlDb || !versionRefId) {
		cb('setLiveDirty: sqlDb and versionRefId are required');
		return;
	}
	writeLiveBlock(
		{ sqlDb, versionRefId, fields: { liveDirty: dirty ? 1 : 0 } },
		(err) => cb(err || ''),
	);
};

module.exports = {
	getUserGraph,
	releaseUserGraph,
	buildGraphConnection,
	readVersionRow,
	setLiveDirty,
};
