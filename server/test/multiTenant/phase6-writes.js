'use strict';
// Phase 6 gate — writes via the server-side executor (doc 02/04/09).
// Per the parent's ruling (Option A), writes are driven through the educore write
// endpoint/executor (the faithful substitute for an askMilo write tool). Provisions a
// REAL clone, exercises createNode / connectToStandard / the additive-only guardrail /
// Save. Always tears down. Makes REAL Voyage embedding calls (T6.1 requires an embedding).
//
// Run: node server/test/multiTenant/phase6-writes.js   (needs Docker + golden + network)

const fs = require('fs');
const path = require('path');
const os = require('os');

process.global = {
	getConfig: (name) =>
		name === 'dataModelExplorerSearch'
			? {
					neo4jBoltUri: 'bolt://localhost:7706', neo4jUser: 'neo4j',
					neo4jPassword: '99d0615d205eead0ea65b3f642ffb3d5',
					voyageApiKey: 'pa-3W7FFeGKVZ4xEN9Lh2ceXMATTpbLbK-b2nwg6TbqF3o',
			  }
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
const neo4jGen = require(`${LIB}/neo4j-instance/neo4j-instance`)({ unused: true });

const TEST_DB = path.join(os.tmpdir(), 'ruby_phase6_writes.sqlite3');
try { fs.unlinkSync(TEST_DB); } catch (e) {}

// Shared access-point library (matches the real loader: accessPointsDotD === the library)
const lib = {};
const dotD = () => ({ logList: [], library: { add: (n, f) => { lib[n] = f; } } });

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);
const provisioned = [];

const series = (steps, done) => {
	let i = 0;
	const nextStep = (err) => { if (err) { done(err); return; } if (i >= steps.length) { done(); return; } steps[i++](nextStep); };
	nextStep();
};
const cleanupAll = (cb) => { let i = 0; const n = () => { if (i >= provisioned.length) { cb(); return; } cloneManager.teardownClone(provisioned[i++], () => n()); }; n(); };
const finish = (err) => {
	cleanupAll(() => {
		try { fs.unlinkSync(TEST_DB); } catch (e) {}
		if (err) console.error('FLOW ERROR:', err);
		let allPass = !err;
		results.forEach(([n, g]) => { if (!g) allPass = false; console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`); });
		console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL');
		process.exit(allPass ? 0 : 1);
	});
};
const queryConn = (conn, cypher, params, cb) => {
	neo4jGen.initDatabaseInstance({ neo4jBoltUri: conn.boltUri, neo4jUser: conn.user || 'neo4j', neo4jPassword: conn.password }, (e, db) => {
		if (e) { cb(e); return; }
		db.runQuery(cypher, params || {}, (qe, rows) => { db.close(); cb(qe, rows); });
	});
};

const GOLDEN = { boltUri: 'bolt://localhost:7706', user: 'neo4j', password: '99d0615d205eead0ea65b3f642ffb3d5' };
const STANDARD_URI = 'https://w3id.org/CEDStandards/terms/C000000'; // a real CEDS element uri

sqliteInstance.initDatabaseInstance(TEST_DB, (dbErr, sqlDb) => {
	if (dbErr) { finish(`db init: ${dbErr}`); return; }
	const ptp = { sqlDb, dataMapping, accessPointsDotD: lib };
	[
		'graph-state-version-new', 'graph-state-version-save', 'graph-state-version-loadScript',
		'dme-user-graph-write', 'dme-user-graph-save',
	].forEach((f) => require(`../../data-model/access-points-dot-d/accessPoints.d/${f}`)({ dotD: dotD(), passThroughParameters: ptp }));

	const USER = '__TEST_uW';
	const st = {};

	series([
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: 'WriteVer' }, (e, r) => { st.v = r && r.refId; cb(e); }),
		(cb) => {
			console.log('opening clone (quiesces golden)...');
			seam.getUserGraph({ userRefId: USER, versionRefId: st.v, username: 'alice', sqlDb, dataMapping }, (e, h) => {
				if (e) { cb(e); return; }
				st.handle = h; provisioned.push({ containerName: h.containerName, cloneDir: h.cloneDir });
				st.conn = h.graphConnection; cb();
			});
		},

		// T6.1 — create a user node; verify :UserContent + userNodeId + embedding, and NOT in golden
		(cb) => lib['dme-user-graph-write']({
			userRefId: USER, versionRefId: st.v, action: 'createNode',
			params: { labels: ['Course'], properties: { name: 'Intro to Algebra', description: 'A first course in algebra' } },
		}, (e, r) => { st.userNodeId = r && r.userNodeId; ok('T6.1 createNode returns userNodeId', st.userNodeId); ok('T6.1 embeddingModelVersion is voyage-3', r && r.embeddingModelVersion === 'voyage-3'); ok('T6.1 embedding dim 1024', r && r.embeddingDim === 1024); cb(e); }),
		(cb) => queryConn(st.conn,
			'MATCH (n:UserContent {userNodeId:$id}) RETURN n.embeddingModelVersion AS emv, size(n.embedding) AS dim, ("Course" IN labels(n)) AS hasCourse, ("UserContent" IN labels(n)) AS isUser, n.name AS name',
			{ id: st.userNodeId }, (e, rows) => {
				const n = rows && rows[0];
				ok('T6.1 node is :UserContent in clone', n && n.isUser === true);
				ok('T6.1 node carries inline embedding (1024)', n && Number(n.dim) === 1024);
				ok('T6.1 node has user-supplied label :Course', n && n.hasCourse === true);
				ok('T6.1 node keeps its name', n && n.name === 'Intro to Algebra');
				cb(e);
			}),
		(cb) => queryConn(GOLDEN, 'MATCH (n {userNodeId:$id}) RETURN count(n) AS c', { id: st.userNodeId }, (e, rows) => {
			ok('T6.1 node is NOT in golden (isolation)', rows && String(rows[0].c) === '0'); cb(e);
		}),

		// T6.2 — connect the user node to a standard element by its stable key (uri)
		(cb) => lib['dme-user-graph-write']({
			userRefId: USER, versionRefId: st.v, action: 'connectToStandard',
			params: { userNodeId: st.userNodeId, relType: 'ALIGNS_WITH', standardKey: STANDARD_URI },
		}, (e, r) => { ok('T6.2 connectToStandard resolved the standard by uri', r && r.targetKey === STANDARD_URI); cb(e); }),
		(cb) => queryConn(st.conn,
			'MATCH (u:UserContent {userNodeId:$id})-[r:ALIGNS_WITH]->(s) RETURN s.uri AS uri',
			{ id: st.userNodeId }, (e, rows) => { ok('T6.2 relationship lands on the right standard uri', rows && rows[0] && rows[0].uri === STANDARD_URI); cb(e); }),

		// T6.3 — guardrail: attempt to modify a golden node is REFUSED
		(cb) => lib['dme-user-graph-write']({
			userRefId: USER, versionRefId: st.v, action: 'modifyNode',
			params: { selector: { uri: STANDARD_URI }, properties: { hacked: true } },
		}, (e, r) => {
			ok('T6.3 modifying a golden node is refused (error)', !!e && /additive-only/i.test(String(e)));
			cb(); // expected error — do not propagate
		}),
		(cb) => queryConn(st.conn, 'MATCH (s {uri:$u}) RETURN s.hacked AS hacked', { u: STANDARD_URI }, (e, rows) => {
			ok('T6.3 golden node was NOT mutated', rows && (rows[0].hacked === null || rows[0].hacked === undefined)); cb(e);
		}),

		// T6.4 — Save persists a graph_state_versions row (Phase 4 store)
		(cb) => lib['dme-user-graph-save']({ userRefId: USER, versionRefId: st.v }, (e, r) => {
			ok('T6.4 Save ok', r && r.saved); ok('T6.4 Save counted the user node (1)', r && Number(r.userNodeCount) === 1); cb(e);
		}),
		(cb) => lib['graph-state-version-loadScript']({ userRefId: USER, refId: st.v }, (e, row) => {
			ok('T6.4 row has userNodeCount=1', row && Number(row.userNodeCount) === 1);
			ok('T6.4 row stateScript persisted (placeholder)', row && /pending re-emit/i.test(row.stateScript || ''));
			ok('T6.4 row embeddingModelVersion=voyage-3', row && row.embeddingModelVersion === 'voyage-3');
			cb(e);
		}),

		// teardown
		(cb) => seam.releaseUserGraph(st.handle, { sqlDb, dataMapping }, (e) => cb(e)),
	], finish);
});
