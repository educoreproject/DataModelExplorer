'use strict';
// Phase 7 gate — the thesis: re-emit -> store -> replay onto a fresh current-golden
// clone (doc 04/05/06). Builds a layer, Saves, tears down, re-opens, and proves the
// layer is reconstructed identically; plus determinism, idempotent replay, the
// latest-golden binding, REAL dangling-ref detection, and secret non-exposure.
// Provisions REAL clones (quiesces golden) + makes REAL Voyage calls. Always tears down.

const fs = require('fs');
const path = require('path');
const os = require('os');

process.global = {
	getConfig: (name) =>
		name === 'dataModelExplorerSearch'
			? { neo4jBoltUri: 'bolt://localhost:7706', neo4jUser: 'neo4j', neo4jPassword: '99d0615d205eead0ea65b3f642ffb3d5', voyageApiKey: 'pa-3W7FFeGKVZ4xEN9Lh2ceXMATTpbLbK-b2nwg6TbqF3o' }
			: {},
	xLog: { status: () => {}, error: (m) => console.error('xLog.error:', m), verbose: () => {}, result: () => {} },
	rawConfig: {}, commandLineParameters: { switches: {}, values: {} },
};

const LIB = '../../data-model/lib';
const sqliteInstance = require(`${LIB}/sqlite-instance/sqlite-instance`)({ unused: true });
const dataMapping = require('../../data-model/data-mapping/data-mapping')({
	pwHash: (x) => x, hashPassword: (x) => x, verifyPassword: () => true, validatePasswordStrength: () => ({ valid: true }),
});
const seam = require(`${LIB}/user-graph/user-graph`);
const cloneManager = require(`${LIB}/user-graph/clone-manager`);
const reEmitLib = require(`${LIB}/user-graph/re-emit`);
const neo4jGen = require(`${LIB}/neo4j-instance/neo4j-instance`)({ unused: true });

const TEST_DB = path.join(os.tmpdir(), 'ruby_phase7_thesis.sqlite3');
try { fs.unlinkSync(TEST_DB); } catch (e) {}

const lib = {};
const dotD = () => ({ logList: [], library: { add: (n, f) => { lib[n] = f; } } });
const results = [];
const ok = (name, cond) => results.push([name, !!cond]);
const provisioned = [];
const REAL_URI = 'https://w3id.org/CEDStandards/terms/C000000';

const series = (steps, done) => { let i = 0; const n = (e) => { if (e) { done(e); return; } if (i >= steps.length) { done(); return; } steps[i++](n); }; n(); };
const cleanupAll = (cb) => { let i = 0; const n = () => { if (i >= provisioned.length) { cb(); return; } cloneManager.teardownClone(provisioned[i++], () => n()); }; n(); };
const finish = (err) => { cleanupAll(() => { try { fs.unlinkSync(TEST_DB); } catch (e) {} if (err) console.error('FLOW ERROR:', err); let p = !err; results.forEach(([n, g]) => { if (!g) p = false; console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`); }); console.log(p ? 'ALL_PASS' : 'SOME_FAIL'); process.exit(p ? 0 : 1); }); };
const conn = (c, cypher, params, cb) => { neo4jGen.initDatabaseInstance({ neo4jBoltUri: c.boltUri, neo4jUser: c.user || 'neo4j', neo4jPassword: c.password }, (e, db) => { if (e) { cb(e); return; } db.runQuery(cypher, params || {}, (qe, rows) => { db.close(); cb(qe, rows); }); }); };
const withDb = (c, fn, cb) => { neo4jGen.initDatabaseInstance({ neo4jBoltUri: c.boltUri, neo4jUser: c.user || 'neo4j', neo4jPassword: c.password }, (e, db) => { if (e) { cb(e); return; } fn(db, (err, val) => { db.close(); cb(err, val); }); }); };

sqliteInstance.initDatabaseInstance(TEST_DB, (dbErr, sqlDb) => {
	if (dbErr) { finish(`db init: ${dbErr}`); return; }
	const ptp = { sqlDb, dataMapping, accessPointsDotD: lib };
	['graph-state-version-new', 'graph-state-version-save', 'graph-state-version-list', 'graph-state-version-loadScript', 'dme-user-graph-write']
		.forEach((f) => require(`../../data-model/access-points-dot-d/accessPoints.d/${f}`)({ dotD: dotD(), passThroughParameters: ptp }));

	const USER = '__TEST_uT';
	const st = {};
	const write = (action, params, cb) => lib['dme-user-graph-write']({ userRefId: USER, versionRefId: st.v, action, params }, cb);

	series([
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: 'Thesis' }, (e, r) => { st.v = r && r.refId; cb(e); }),
		(cb) => { console.log('open #1 (build layer)...'); seam.getUserGraph({ userRefId: USER, versionRefId: st.v, username: 'alice', sqlDb, dataMapping }, (e, h) => { if (e) { cb(e); return; } st.h1 = h; provisioned.push({ containerName: h.containerName, cloneDir: h.cloneDir }); cb(); }); },

		// Build a layer: two user nodes, a user->user rel, a user->standard rel
		(cb) => write('createNode', { labels: ['Course'], properties: { name: 'Intro Algebra', description: 'first algebra' } }, (e, r) => { st.n1 = r && r.userNodeId; cb(e); }),
		(cb) => write('createNode', { labels: ['Topic'], properties: { name: 'Linear Equations', description: 'lines' } }, (e, r) => { st.n2 = r && r.userNodeId; cb(e); }),
		(cb) => write('connectUserNodes', { fromUserNodeId: st.n1, toUserNodeId: st.n2, relType: 'COVERS' }, (e) => cb(e)),
		(cb) => write('connectToStandard', { userNodeId: st.n1, relType: 'ALIGNS_WITH', standardKey: REAL_URI }, (e) => cb(e)),

		// T7.2 determinism — re-emit twice on the same live graph -> byte-identical
		(cb) => withDb(st.h1.graphConnection, (db, done) => reEmitLib.reEmit({ userGraphDb: db, embeddingModelVersion: 'voyage-3' }, done), (e, r1) => { st.script1 = r1 && r1.stateScript; st.uCount = r1 && r1.userNodeCount; st.relCount = r1 && r1.relationshipCount; cb(e); }),
		(cb) => withDb(st.h1.graphConnection, (db, done) => reEmitLib.reEmit({ userGraphDb: db, embeddingModelVersion: 'voyage-3' }, done), (e, r2) => { ok('T7.2 re-emit is deterministic (byte-identical)', st.script1 && r2 && st.script1 === r2.stateScript); ok('T7.2 counts: 2 nodes, 2 rels', st.uCount === 2 && st.relCount === 2); cb(e); }),

		// Save (re-emit -> store) and check secret non-exposure
		(cb) => lib['graph-state-version-save']({ userRefId: USER, refId: st.v, stateScript: st.script1, userNodeCount: st.uCount, embeddingModelVersion: 'voyage-3' }, (e) => cb(e)),
		(cb) => lib['graph-state-version-list']({ userRefId: USER }, (e, rows) => { const leak = rows.some((r) => ('stateScript' in r) || ('liveBoltUri' in r) || ('liveBoltPassword' in r)); ok('T7.6 client list exposes no stateScript / liveBolt*', !leak); cb(e); }),

		// Close (full teardown), then re-open (provision fresh current-golden clone + replay)
		(cb) => seam.releaseUserGraph(st.h1, { sqlDb, dataMapping }, (e) => cb(e)),
		(cb) => { console.log('open #2 (replay onto fresh golden clone)...'); seam.getUserGraph({ userRefId: USER, versionRefId: st.v, username: 'alice', sqlDb, dataMapping }, (e, h) => { if (e) { cb(e); return; } st.h2 = h; provisioned.push({ containerName: h.containerName, cloneDir: h.cloneDir }); cb(); }); },

		// T7.1 round-trip — the layer is reconstructed identically; T7.4 latest-golden binding
		(cb) => conn(st.h2.graphConnection, 'MATCH (n:UserContent) WHERE NOT n:UserGraphIdentity RETURN count(n) AS c', {}, (e, rows) => { ok('T7.1 reconstructed userNodeCount = 2', rows && String(rows[0].c) === '2'); cb(e); }),
		(cb) => conn(st.h2.graphConnection, 'MATCH (n:UserContent {userNodeId:$id}) RETURN n.name AS name, size(n.embedding) AS dim, ("Course" IN labels(n)) AS hasCourse', { id: st.n1 }, (e, rows) => { const n = rows && rows[0]; ok('T7.1 node1 reconstructed with name', n && n.name === 'Intro Algebra'); ok('T7.1 node1 embedding preserved (1024)', n && Number(n.dim) === 1024); ok('T7.1 node1 user label preserved', n && n.hasCourse === true); cb(e); }),
		(cb) => conn(st.h2.graphConnection, 'MATCH (:UserContent {userNodeId:$a})-[:COVERS]->(:UserContent {userNodeId:$b}) RETURN count(*) AS c', { a: st.n1, b: st.n2 }, (e, rows) => { ok('T7.1 user->user COVERS rel reconstructed', rows && String(rows[0].c) === '1'); cb(e); }),
		(cb) => conn(st.h2.graphConnection, 'MATCH (:UserContent {userNodeId:$a})-[:ALIGNS_WITH]->(s) RETURN s.uri AS uri', { a: st.n1 }, (e, rows) => { ok('T7.4 user->standard rel rebinds onto fresh golden by uri', rows && rows[0] && rows[0].uri === REAL_URI); cb(e); }),
		(cb) => { ok('T7.1 open #2 reports no dangling refs', Array.isArray(st.h2.danglingRefs) && st.h2.danglingRefs.length === 0); cb(); },

		// T7.3 idempotent replay — replay the SAME script again into the live clone; no duplicates
		(cb) => withDb(st.h2.graphConnection, (db, done) => reEmitLib.replayStateScript({ userGraphDb: db, stateScript: st.script1 }, done), (e) => cb(e)),
		(cb) => conn(st.h2.graphConnection, 'MATCH (n:UserContent) WHERE NOT n:UserGraphIdentity RETURN count(n) AS c', {}, (e, rows) => { ok('T7.3 idempotent replay: still 2 nodes (no duplicates)', rows && String(rows[0].c) === '2'); cb(e); }),
		(cb) => conn(st.h2.graphConnection, 'MATCH (:UserContent {userNodeId:$a})-[r:COVERS]->(:UserContent {userNodeId:$b}) RETURN count(r) AS c', { a: st.n1, b: st.n2 }, (e, rows) => { ok('T7.3 idempotent replay: still 1 COVERS rel (no duplicates)', rows && String(rows[0].c) === '1'); cb(e); }),
		(cb) => seam.releaseUserGraph(st.h2, { sqlDb, dataMapping }, (e) => cb(e)),

		// T7.5 dangling ref — REAL removal: provision a clone, DELETE the referenced standard
		// element from it (a golden where the element moved), then replay -> MATCH-by-uri fails,
		// dangling collected, the rest reconstructs.
		(cb) => { console.log('open #3 (dangling-ref: delete element, replay)...'); cloneManager.provisionClone({ userRefId: '__TEST_uDangle', versionRefId: 'd1' }, (e, d) => { if (e) { cb(e); return; } st.dClone = d; provisioned.push({ containerName: d.containerName, cloneDir: d.cloneDir }); cb(); }); },
		(cb) => conn(st.dClone, 'MATCH (s {uri:$u}) DETACH DELETE s RETURN 1', { u: REAL_URI }, (e) => cb(e)),
		(cb) => conn(st.dClone, 'MATCH (s {uri:$u}) RETURN count(s) AS c', { u: REAL_URI }, (e, rows) => { ok('T7.5 setup: standard element removed from the clone', rows && String(rows[0].c) === '0'); cb(e); }),
		(cb) => withDb(st.dClone, (db, done) => reEmitLib.replayStateScript({ userGraphDb: db, stateScript: st.script1 }, done), (e, res) => {
			ok('T7.5 dangling ref collected (not dropped)', res && res.danglingRefs.length === 1 && res.danglingRefs[0].standardKey === REAL_URI);
			cb(e);
		}),
		(cb) => conn(st.dClone, 'MATCH (n:UserContent) WHERE NOT n:UserGraphIdentity RETURN count(n) AS c', {}, (e, rows) => { ok('T7.5 the rest of the layer still reconstructs (2 nodes)', rows && String(rows[0].c) === '2'); cb(e); }),
		(cb) => conn(st.dClone, 'MATCH (:UserContent {userNodeId:$a})-[:ALIGNS_WITH]->() RETURN count(*) AS c', { a: st.n1 }, (e, rows) => { ok('T7.5 the dangling relationship was NOT created', rows && String(rows[0].c) === '0'); cb(e); }),
	], finish);
});
