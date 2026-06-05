'use strict';
// BUG-1 gate — lock lifecycle (owner-reclaim on reopen + release on close).
//
// Drives the REAL access points (dme-user-graph-open, dme-user-graph-close) against a
// crashed-prior-session fixture: a version row holding a FRESH lock + a (now dead) live
// block, seeded with TQ's real 2-node stateScript. Asserts the owner RECLAIMS read-write
// (not read-only), the saved nodes are replayed into the fresh clone, a NEW lock is taken,
// and Close releases the lock. Provisions a REAL Neo4j clone (may briefly quiesce golden).
//
// Run: node server/test/multiTenant/bugfix-lock-lifecycle.js   (needs Docker + golden up)

const fs = require('fs');
const path = require('path');
const os = require('os');

process.global = {
	getConfig: (name) =>
		name === 'dataModelExplorerSearch'
			? { neo4jBoltUri: 'bolt://localhost:7706', neo4jUser: 'neo4j', neo4jPassword: '99d0615d205eead0ea65b3f642ffb3d5' }
			: {},
	xLog: { status: () => {}, error: (m) => console.error('xLog.error:', m), verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const LIB = '../../data-model/lib';
const sqliteInstance = require(`${LIB}/sqlite-instance/sqlite-instance`)({ unused: true });
const dataMapping = require('../../data-model/data-mapping/data-mapping')({
	pwHash: (x) => x, hashPassword: (x) => x, verifyPassword: () => true, validatePasswordStrength: () => ({ valid: true }),
});
const cloneManager = require(`${LIB}/user-graph/clone-manager`);
const neo4jGen = require(`${LIB}/neo4j-instance/neo4j-instance`)({ unused: true });

// TQ's real encoded 2-node stateScript, captured read-only from the dev sqlite.
const DEV_DB = '/Users/tqwhite/Documents/webdev/educore/system/dataStores/educore_dev.sqlite3';
const REAL_SCRIPT_RAW = fs.readFileSync('/tmp/tq_statescript_raw.txt', 'utf8').trim();

const TEST_DB = path.join(os.tmpdir(), 'bronze_bugfix_lock_lifecycle.sqlite3');
try { fs.unlinkSync(TEST_DB); } catch (e) {}

const registry = {};
const makeDotD = () => ({ logList: [], library: { add: (n, f) => { registry[n] = f; } } });

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);
const provisioned = []; // {containerName, cloneDir} for guaranteed cleanup

const series = (steps, done) => {
	let i = 0;
	const nextStep = (err) => {
		if (err) { done(err); return; }
		if (i >= steps.length) { done(); return; }
		steps[i++](nextStep);
	};
	nextStep();
};

const cleanupAll = (finalCb) => {
	let i = 0;
	const nextOne = () => {
		if (i >= provisioned.length) { finalCb(); return; }
		const p = provisioned[i++];
		cloneManager.teardownClone(p, () => nextOne());
	};
	nextOne();
};

const finish = (err) => {
	cleanupAll(() => {
		try { fs.unlinkSync(TEST_DB); } catch (e) {}
		if (err) console.error('FLOW ERROR:', err);
		let allPass = !err;
		results.forEach(([n, good]) => { if (!good) allPass = false; console.log(`${good ? 'PASS' : 'FAIL'} - ${n}`); });
		console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL');
		process.exit(allPass ? 0 : 1);
	});
};

const queryBolt = (boltUri, password, cypher, params, cb) => {
	neo4jGen.initDatabaseInstance(
		{ neo4jBoltUri: boltUri, neo4jUser: 'neo4j', neo4jPassword: password },
		(err, db) => {
			if (err) { cb(err); return; }
			db.runQuery(cypher, params || {}, (qErr, rows) => { db.close(); cb(qErr, rows); });
		},
	);
};

sqliteInstance.initDatabaseInstance(TEST_DB, (dbErr, sqlDb) => {
	if (dbErr) { finish(`db init: ${dbErr}`); return; }

	const passThroughParameters = { sqlDb, dataMapping, accessPointsDotD: registry };
	require('../../data-model/access-points-dot-d/accessPoints.d/graph-state-version-new')({ dotD: makeDotD(), passThroughParameters });
	require('../../data-model/access-points-dot-d/accessPoints.d/graph-state-version-loadScript')({ dotD: makeDotD(), passThroughParameters });
	require('../../data-model/access-points-dot-d/accessPoints.d/dme-user-graph-open')({ dotD: makeDotD(), passThroughParameters });
	require('../../data-model/access-points-dot-d/accessPoints.d/dme-user-graph-close')({ dotD: makeDotD(), passThroughParameters });

	const newVersion = registry['graph-state-version-new'];
	const loadScript = registry['graph-state-version-loadScript'];
	const openGraph = registry['dme-user-graph-open'];
	const closeGraph = registry['dme-user-graph-close'];

	const USER = '__TEST_lockUser';
	const STALE_LOCK = '__TEST_staleLockL1';
	const st = {};

	series([
		// 1) Create a version row, then seed it to look like a CRASHED prior session:
		//    TQ's real 2-node stateScript + a held FRESH lock + a (dead) live block.
		(cb) => newVersion({ userRefId: USER, versionName: '__TEST_TQ two nodes' }, (e, r) => { st.vRef = r && r.refId; cb(e); }),
		(cb) => {
			sqlDb.getTable('graph_state_versions', (e, tableRef) => {
				if (e) { cb(e); return; }
				st.tableRef = tableRef;
				tableRef.saveObject({
					refId: st.vRef,
					stateScript: REAL_SCRIPT_RAW,       // encoded form (readVersionRow decodes)
					userNodeCount: 2,
					embeddingModelVersion: 'voyage-3',
					// crashed live block: lock still held, heartbeat fresh, container is gone.
					lockToken: STALE_LOCK,
					lastHeartbeatAt: new Date().toISOString(),
					openedAt: new Date().toISOString(),
					liveBoltUri: 'bolt://localhost:9999',
					liveBoltPassword: 'dead',
					liveContainerName: 'usr___TEST_dead_container',
					livePort: '9999',
				}, { suppressStatementLog: true }, (sErr) => cb(sErr));
			});
		},

		// sanity: the seed really looks live+fresh (so we exercise the reclaim branch, not the
		// already-free path).
		(cb) => loadScript({ userRefId: USER, refId: st.vRef }, (e, row) => {
			ok('SEED row has stale fresh lock', row && row.lockToken === STALE_LOCK);
			ok('SEED row carries the 2-node script', row && Number(row.userNodeCount) === 2);
			cb(e);
		}),

		// 2) REOPEN the same version as the owner -> must RECLAIM read-write (not read-only).
		(cb) => {
			console.log('reopening (reclaim path; may briefly quiesce golden)...');
			openGraph({ userRefId: USER, username: 'tq', versionRefId: st.vRef }, (e, res) => {
				if (e) { cb(e); return; }
				st.openResult = res;
				ok('BUG1a reopen returns READ-WRITE (readOnly===false)', res && res.readOnly === false);
				ok('BUG1a reopen returns the same versionRefId', res && res.versionRefId === st.vRef);
				ok('BUG1a reopen surfaces an identityMarker', !!(res && res.identityMarker && res.identityMarker.versionRefId === st.vRef));
				cb();
			});
		},

		// 3) Read the row back: a FRESH clone is live (new container/bolt) and a NEW lock taken.
		(cb) => loadScript({ userRefId: USER, refId: st.vRef }, (e, row) => {
			if (e) { cb(e); return; }
			st.liveRow = row;
			if (row && row.liveContainerName) {
				provisioned.push({ containerName: row.liveContainerName, cloneDir: cloneManager.cloneDirFor(USER, st.vRef) });
			}
			ok('BUG1a reclaim took a NEW lock (non-empty, != stale)', !!(row && row.lockToken && row.lockToken !== STALE_LOCK));
			ok('BUG1a reclaim points at a FRESH clone container (usr_*, != dead)', !!(row && /^usr_/.test(row.liveContainerName || '') && row.liveContainerName !== 'usr___TEST_dead_container'));
			ok('BUG1a reclaim wrote a real live bolt (!= the dead 9999)', !!(row && row.liveBoltUri && row.liveBoltUri !== 'bolt://localhost:9999'));
			cb();
		}),

		// 4) BUG2 — the reclaimed clone REPLAYED the saved state: the 2 user nodes are present
		//    (the old read-only branch showed nothing; reclaim provisions + replays).
		(cb) => queryBolt(st.liveRow.liveBoltUri, st.liveRow.liveBoltPassword,
			'MATCH (n:DebugNode) RETURN count(n) AS c', {},
			(e, rows) => { ok('BUG2 replayed clone has the 2 saved DebugNode nodes', rows && String(rows[0].c) === '2'); cb(e); }),
		(cb) => queryBolt(st.liveRow.liveBoltUri, st.liveRow.liveBoltPassword,
			'MATCH (i:UserGraphIdentity) RETURN i.versionRefId AS v', {},
			(e, rows) => { ok('BUG2 clone carries this version identity marker', rows && rows[0] && rows[0].v === st.vRef); cb(e); }),

		// 5) BUG1b — CLOSE releases the lock + clears the live block (this is exactly what the
		//    client onUnmounted / beforeunload hook now calls).
		(cb) => closeGraph({ userRefId: USER, versionRefId: st.vRef }, (e, res) => {
			ok('BUG1b close reports closed', res && res.closed === true);
			cb(e);
		}),
		(cb) => loadScript({ userRefId: USER, refId: st.vRef }, (e, row) => {
			ok('BUG1b close cleared lockToken', row && (row.lockToken === '' || row.lockToken == null));
			ok('BUG1b close cleared liveBoltUri', row && (row.liveBoltUri === '' || row.liveBoltUri == null));
			ok('BUG1b close cleared liveContainerName', row && (row.liveContainerName === '' || row.liveContainerName == null));
			// durable truth survives teardown: the saved script is still on the row.
			ok('BUG1b durable stateScript survives close', row && Number(row.userNodeCount) === 2);
			cb(e);
		}),
	], finish);
});
