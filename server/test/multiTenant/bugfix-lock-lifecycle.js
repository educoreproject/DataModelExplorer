'use strict';
// BUG-1 gate — lock lifecycle (owner-reclaim on reopen + release on close).
//
// Drives the REAL access points (dme-user-graph-open, dme-user-graph-close) against a
// crashed-prior-session fixture: a version row holding a FRESH lock + a (now dead) live
// block, seeded with a SYNTHETIC 2-node stateScript (campaign P4a: fixtures/bugfixLockStateScript.base64.txt, captured
// from a scratch user graph by captureBugfixLockFixture.js — it was a hand-captured copy of a real user's script in /tmp,
// which no longer existed and must never be the source). Asserts the owner RECLAIMS read-write
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
			? { ...require('../lib/goldenContainerName').goldenDmeConfigForTests(), }
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

// the SYNTHETIC encoded stateScript, captured from a scratch user graph; refused unless every node it re-creates is a
// fixture DebugNode (the declaration says what the fixture is)
const { FIXTURE_FILE_PATH, FIXTURE_NODE_COUNT, FIXTURE_NODE_LABEL, FIXTURE_NODE_NAME_PREFIX } = require('./fixtures/bugfixLockFixtureDeclaration');
const { decodeStateScript } = require('../../data-model/lib/user-graph/re-emit');
if (!fs.existsSync(FIXTURE_FILE_PATH)) {
	console.error(`bugfix-lock-lifecycle: the fixture ${FIXTURE_FILE_PATH} is absent — run captureBugfixLockFixture.js (a scratch user graph), never a copy of real user data`);
	process.exit(1);
}
const FIXTURE_SCRIPT_RAW = fs.readFileSync(FIXTURE_FILE_PATH, 'utf8').trim();
const fixtureNodeLineList = decodeStateScript(FIXTURE_SCRIPT_RAW).split('\n').filter((line) => line.startsWith('MERGE (n:'));
const isFixtureNodeLine = (line) => line.includes(`:${FIXTURE_NODE_LABEL}`) && line.includes(FIXTURE_NODE_NAME_PREFIX);
const foreignNodeLineList = fixtureNodeLineList.filter((line) => !isFixtureNodeLine(line) && !line.includes(':UserGraphIdentity'));
const fixtureUserNodeCount = Number((decodeStateScript(FIXTURE_SCRIPT_RAW).match(/^\/\/ userNodeCount: (\d+)$/m) || [])[1]);
if (foreignNodeLineList.length > 0 || fixtureNodeLineList.filter(isFixtureNodeLine).length !== FIXTURE_NODE_COUNT || !Number.isInteger(fixtureUserNodeCount)) {
	console.error(`bugfix-lock-lifecycle: REFUSED — the fixture is not the declared synthetic one (${FIXTURE_NODE_COUNT} ${FIXTURE_NODE_LABEL} named ${FIXTURE_NODE_NAME_PREFIX}*, nothing else): ${foreignNodeLineList.length} foreign node line(s), userNodeCount ${fixtureUserNodeCount}`);
	process.exit(1);
}

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
		//    the synthetic fixture stateScript + a held FRESH lock + a (dead) live block.
		(cb) => newVersion({ userRefId: USER, versionName: '__TEST_fixture two nodes' }, (e, r) => { st.vRef = r && r.refId; cb(e); }),
		(cb) => {
			sqlDb.getTable('graph_state_versions', (e, tableRef) => {
				if (e) { cb(e); return; }
				st.tableRef = tableRef;
				tableRef.saveObject({
					refId: st.vRef,
					stateScript: FIXTURE_SCRIPT_RAW,    // encoded form (readVersionRow decodes)
					userNodeCount: fixtureUserNodeCount,
					embeddingModelVersion: 'voyage-3',
					// crashed live block: lock still held, heartbeat fresh, container is gone.
					lockToken: STALE_LOCK,
					lastHeartbeatAt: new Date().toISOString(),
					openedAt: new Date().toISOString(),
					liveBoltUri: 'bolt://localhost:9999',
					liveContainerName: 'usr___TEST_dead_container',
					livePort: '9999',
				}, { suppressStatementLog: true }, (sErr) => cb(sErr));
			});
		},

		// sanity: the seed really looks live+fresh (so we exercise the reclaim branch, not the
		// already-free path).
		(cb) => loadScript({ userRefId: USER, refId: st.vRef }, (e, row) => {
			ok('SEED row has stale fresh lock', row && row.lockToken === STALE_LOCK);
			ok(`SEED row carries the fixture script (userNodeCount ${fixtureUserNodeCount})`, row && Number(row.userNodeCount) === fixtureUserNodeCount);
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
		(cb) => queryBolt(st.liveRow.liveBoltUri, require('../../data-model/lib/user-graph/user-graph').liveCloneConnectionFor(st.liveRow).neo4jPassword, // W-E-12: from the clone
			
			'MATCH (n:DebugNode) RETURN count(n) AS c', {},
			(e, rows) => { ok(`BUG2 replayed clone has the ${FIXTURE_NODE_COUNT} saved ${FIXTURE_NODE_LABEL} nodes`, rows && String(rows[0].c) === String(FIXTURE_NODE_COUNT)); cb(e); }),
		(cb) => queryBolt(st.liveRow.liveBoltUri, require('../../data-model/lib/user-graph/user-graph').liveCloneConnectionFor(st.liveRow).neo4jPassword, // W-E-12: from the clone
			
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
			ok('BUG1b durable stateScript survives close', row && Number(row.userNodeCount) === fixtureUserNodeCount);
			cb(e);
		}),
	], finish);
});
