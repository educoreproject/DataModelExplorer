'use strict';
// Phase 5 gate — real per-user cold clone (doc 03).
// Exercises the seam directly: New version -> getUserGraph (provision + marker +
// setLive) -> assert marker / golden standards / isolation -> releaseUserGraph
// (teardown). Provisions REAL Neo4j clone containers (briefly quiesces the golden).
// Always tears down provisioned clones, even on failure.
//
// Run: node server/test/multiTenant/phase5-cold-clone.js   (needs Docker + golden up)

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
const seam = require(`${LIB}/user-graph/user-graph`);
const cloneManager = require(`${LIB}/user-graph/clone-manager`);
const neo4jGen = require(`${LIB}/neo4j-instance/neo4j-instance`)({ unused: true });

const TEST_DB = path.join(os.tmpdir(), 'ruby_phase5_cold_clone.sqlite3');
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

// Run a single cypher against a clone's bolt and hand back the rows.
const queryClone = (graphConnection, cypher, params, cb) => {
	neo4jGen.initDatabaseInstance(
		{ neo4jBoltUri: graphConnection.boltUri, neo4jUser: graphConnection.user, neo4jPassword: graphConnection.password },
		(err, db) => {
			if (err) { cb(err); return; }
			db.runQuery(cypher, params || {}, (qErr, rows) => { db.close(); cb(qErr, rows); });
		},
	);
};

sqliteInstance.initDatabaseInstance(TEST_DB, (dbErr, sqlDb) => {
	if (dbErr) { finish(`db init: ${dbErr}`); return; }

	const passThroughParameters = { sqlDb, dataMapping };
	require('../../data-model/access-points-dot-d/accessPoints.d/graph-state-version-new')({ dotD: makeDotD(), passThroughParameters });
	require('../../data-model/access-points-dot-d/accessPoints.d/graph-state-version-loadScript')({ dotD: makeDotD(), passThroughParameters });
	const newVersion = registry['graph-state-version-new'];
	const loadScript = registry['graph-state-version-loadScript'];

	const USER_A = '__TEST_uA';
	const USER_B = '__TEST_uB';
	const st = {};

	series([
		// Create version rows
		(cb) => newVersion({ userRefId: USER_A, versionName: 'VerA' }, (e, r) => { st.vA = r && r.refId; cb(e); }),
		(cb) => newVersion({ userRefId: USER_B, versionName: 'VerB' }, (e, r) => { st.vB = r && r.refId; cb(e); }),

		// Open (cold clone) version A
		(cb) => {
			console.log('opening clone A (quiesces golden)...');
			seam.getUserGraph({ userRefId: USER_A, versionRefId: st.vA, username: 'alice', sqlDb, dataMapping }, (e, handle) => {
				if (e) { cb(e); return; }
				st.handleA = handle;
				provisioned.push({ containerName: handle.containerName, cloneDir: handle.cloneDir });
				ok('Open A returns a clone container', /^usr_/.test(handle.containerName || ''));
				cb();
			});
		},

		// T5.1 — marker proves a NEW graph for this user/version
		(cb) => queryClone(st.handleA.graphConnection,
			'MATCH (i:UserGraphIdentity) RETURN i.userRefId AS userRefId, i.username AS username, i.versionRefId AS versionRefId, i.versionName AS versionName', {},
			(e, rows) => {
				const m = rows && rows[0];
				ok('T5.1 marker exists', !!m);
				ok('T5.1 marker.userRefId', m && m.userRefId === USER_A);
				ok('T5.1 marker.username', m && m.username === 'alice');
				ok('T5.1 marker.versionRefId', m && m.versionRefId === st.vA);
				ok('T5.1 marker.versionName', m && m.versionName === 'VerA');
				cb(e);
			}),

		// T5.2 — the clone contains golden's standards (golden count, marker excluded)
		(cb) => queryClone(st.handleA.graphConnection,
			'MATCH (n) WHERE NOT n:UserContent RETURN count(n) AS c', {},
			(e, rows) => {
				const c = rows && rows[0] && rows[0].c;
				ok('T5.2 clone carries golden standards (75882)', String(c) === '75882');
				cb(e);
			}),

		// Open (cold clone) version B
		(cb) => {
			console.log('opening clone B (quiesces golden)...');
			seam.getUserGraph({ userRefId: USER_B, versionRefId: st.vB, username: 'bob', sqlDb, dataMapping }, (e, handle) => {
				if (e) { cb(e); return; }
				st.handleB = handle;
				provisioned.push({ containerName: handle.containerName, cloneDir: handle.cloneDir });
				ok('Open B returns a clone container', /^usr_/.test(handle.containerName || ''));
				ok('T5.3 A and B are different containers', handle.containerName !== st.handleA.containerName);
				cb();
			});
		},

		// T5.3 — isolation: a write in A is invisible in B
		(cb) => queryClone(st.handleA.graphConnection,
			'CREATE (:UserContent:__TEST_IsolationProbe {tag: $tag}) RETURN 1', { tag: 'ONLY_IN_A' },
			(e) => cb(e)),
		(cb) => queryClone(st.handleA.graphConnection,
			'MATCH (n:__TEST_IsolationProbe) RETURN count(n) AS c', {},
			(e, rows) => { ok('T5.3 probe present in A', rows && String(rows[0].c) === '1'); cb(e); }),
		(cb) => queryClone(st.handleB.graphConnection,
			'MATCH (n:__TEST_IsolationProbe) RETURN count(n) AS c', {},
			(e, rows) => { ok('T5.3 probe INVISIBLE in B (isolation)', rows && String(rows[0].c) === '0'); cb(e); }),
		(cb) => queryClone(st.handleB.graphConnection,
			'MATCH (i:UserGraphIdentity) RETURN i.userRefId AS u', {},
			(e, rows) => { ok('T5.3 B marker is B (distinct identity)', rows && rows[0] && rows[0].u === USER_B); cb(e); }),

		// T5.4 — teardown removes container + clone dir, clears live fields
		(cb) => {
			const hA = st.handleA;
			seam.releaseUserGraph(hA, { sqlDb, dataMapping }, (e) => {
				if (e) { cb(e); return; }
				const gone = !cloneManager.containerExists(hA.containerName) && !fs.existsSync(hA.cloneDir);
				ok('T5.4 teardown A removed container + dir', gone);
				loadScript({ userRefId: USER_A, refId: st.vA }, (lErr, row) => {
					ok('T5.4 teardown cleared live fields (liveBoltUri empty)', row && (row.liveBoltUri === '' || row.liveBoltUri == null));
					cb(lErr);
				});
			});
		},
		(cb) => {
			const hB = st.handleB;
			seam.releaseUserGraph(hB, { sqlDb, dataMapping }, (e) => {
				if (e) { cb(e); return; }
				const gone = !cloneManager.containerExists(hB.containerName) && !fs.existsSync(hB.cloneDir);
				ok('T5.4 teardown B removed container + dir', gone);
				cb();
			});
		},
	], finish);
});
