'use strict';
// Phase 8 backend gate — soft-lock read-only (T8.2), reaper (T8.3), dangling-ref remap
// (T8.4). The version-selector UI (T8.1) is exercised by Playwright separately; T8.5
// (standard regression) is an HTTP check. Provisions REAL clones; always tears down.

const fs = require('fs');
const path = require('path');
const os = require('os');

process.global = {
	getConfig: (name) => name === 'dataModelExplorerSearch'
		? { neo4jBoltUri: 'bolt://localhost:7706', neo4jUser: 'neo4j', neo4jPassword: '99d0615d205eead0ea65b3f642ffb3d5', voyageApiKey: 'pa-3W7FFeGKVZ4xEN9Lh2ceXMATTpbLbK-b2nwg6TbqF3o' }
		: {},
	xLog: { status: () => {}, error: (m) => console.error('xLog.error:', m), verbose: () => {}, result: () => {} },
	rawConfig: {}, commandLineParameters: { switches: {}, values: {} },
};

const LIB = '../../data-model/lib';
const sqliteInstance = require(`${LIB}/sqlite-instance/sqlite-instance`)({ unused: true });
const dataMapping = require('../../data-model/data-mapping/data-mapping')({ pwHash: (x) => x, hashPassword: (x) => x, verifyPassword: () => true, validatePasswordStrength: () => ({ valid: true }) });
const seam = require(`${LIB}/user-graph/user-graph`);
const cloneManager = require(`${LIB}/user-graph/clone-manager`);
const reaper = require(`${LIB}/user-graph/reaper`);

const TEST_DB = path.join(os.tmpdir(), 'ruby_phase8_versions.sqlite3');
try { fs.unlinkSync(TEST_DB); } catch (e) {}

const lib = {};
const dotD = () => ({ logList: [], library: { add: (n, f) => { lib[n] = f; } } });
const results = [];
const ok = (name, cond) => results.push([name, !!cond]);
const provisioned = [];
const URI_A = 'https://w3id.org/CEDStandards/terms/C000000';
const URI_B = 'https://w3id.org/CEDStandards/terms/C200411';

const series = (steps, done) => { let i = 0; const n = (e) => { if (e) { done(e); return; } if (i >= steps.length) { done(); return; } steps[i++](n); }; n(); };
const cleanupAll = (cb) => { let i = 0; const n = () => { if (i >= provisioned.length) { cb(); return; } cloneManager.teardownClone(provisioned[i++], () => n()); }; n(); };
const finish = (err) => { cleanupAll(() => { try { fs.unlinkSync(TEST_DB); } catch (e) {} if (err) console.error('FLOW ERROR:', err); let p = !err; results.forEach(([n, g]) => { if (!g) p = false; console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`); }); console.log(p ? 'ALL_PASS' : 'SOME_FAIL'); process.exit(p ? 0 : 1); }); };

sqliteInstance.initDatabaseInstance(TEST_DB, (dbErr, sqlDb) => {
	if (dbErr) { finish(`db init: ${dbErr}`); return; }
	const ptp = { sqlDb, dataMapping, accessPointsDotD: lib };
	['graph-state-version-new', 'graph-state-version-save', 'graph-state-version-list', 'graph-state-version-loadScript', 'graph-state-version-setLive', 'graph-state-version-rename', 'graph-state-version-stampHeartbeat', 'dme-user-graph-open', 'dme-user-graph-write', 'dme-user-graph-remap']
		.forEach((f) => require(`../../data-model/access-points-dot-d/accessPoints.d/${f}`)({ dotD: dotD(), passThroughParameters: ptp }));

	const USER = '__TEST_uV';
	const st = {};

	series([
		// ---- T8.2 soft-lock: second open of a live version is read-only ----
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: 'V1' }, (e, r) => { st.v1 = r && r.refId; cb(e); }),
		(cb) => { console.log('open v1 (live)...'); lib['dme-user-graph-open']({ userRefId: USER, username: 'alice', versionRefId: st.v1 }, (e, r) => { if (e) { cb(e); return; } st.h1container = r.identityMarker; ok('T8.2 first open is read-write', r && r.readOnly === false); cb(); }); },
		(cb) => lib['dme-user-graph-open']({ userRefId: USER, username: 'alice', versionRefId: st.v1 }, (e, r) => { ok('T8.2 second concurrent open is READ-ONLY (soft lock)', r && r.readOnly === true); cb(e); }),
		// capture the live container for cleanup, then close v1
		(cb) => lib['graph-state-version-loadScript']({ userRefId: USER, refId: st.v1 }, (e, row) => { if (row && row.liveContainerName) provisioned.push({ containerName: row.liveContainerName, cloneDir: cloneManager.cloneDirFor(USER, st.v1) }); cb(e); }),

		// ---- T8.4 remap: build a layer referencing URI_A, save, remap A->B in the stored script ----
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: 'V2' }, (e, r) => { st.v2 = r && r.refId; cb(e); }),
		(cb) => { console.log('open v2 (build + remap)...'); seam.getUserGraph({ userRefId: USER, versionRefId: st.v2, username: 'alice', sqlDb, dataMapping }, (e, h) => { if (e) { cb(e); return; } st.h2 = h; provisioned.push({ containerName: h.containerName, cloneDir: h.cloneDir }); cb(); }); },
		(cb) => lib['dme-user-graph-write']({ userRefId: USER, versionRefId: st.v2, action: 'createNode', params: { labels: ['Course'], properties: { name: 'Algebra' } } }, (e, r) => { st.n = r && r.userNodeId; cb(e); }),
		(cb) => lib['dme-user-graph-write']({ userRefId: USER, versionRefId: st.v2, action: 'connectToStandard', params: { userNodeId: st.n, relType: 'ALIGNS_WITH', standardKey: URI_A } }, (e) => cb(e)),
		// Save via reEmit -> store
		(cb) => { const { reEmit } = require(`${LIB}/user-graph/re-emit`); const g = require(`${LIB}/neo4j-instance/neo4j-instance`)({ unused: true }); g.initDatabaseInstance({ neo4jBoltUri: st.h2.graphConnection.boltUri, neo4jUser: 'neo4j', neo4jPassword: st.h2.graphConnection.password }, (ce, db) => { if (ce) { cb(ce); return; } reEmit({ userGraphDb: db, embeddingModelVersion: 'voyage-3' }, (re, res) => { db.close(); if (re) { cb(re); return; } lib['graph-state-version-save']({ userRefId: USER, refId: st.v2, stateScript: res.stateScript, userNodeCount: res.userNodeCount, embeddingModelVersion: 'voyage-3' }, (se) => cb(se)); }); }); },
		(cb) => lib['graph-state-version-loadScript']({ userRefId: USER, refId: st.v2 }, (e, row) => { ok('T8.4 setup: saved script references URI_A', row && row.stateScript.indexOf(URI_A) !== -1); cb(e); }),
		(cb) => lib['dme-user-graph-remap']({ userRefId: USER, versionRefId: st.v2, oldKey: URI_A, newKey: URI_B }, (e, r) => { ok('T8.4 remap reports success', r && r.remapped); cb(e); }),
		(cb) => lib['graph-state-version-loadScript']({ userRefId: USER, refId: st.v2 }, (e, row) => { ok('T8.4 stored script now references URI_B', row && row.stateScript.indexOf(URI_B) !== -1); ok('T8.4 stored script no longer references URI_A', row && row.stateScript.indexOf(URI_A) === -1); cb(e); }),
		(cb) => seam.releaseUserGraph(st.h2, { sqlDb, dataMapping }, (e) => cb(e)),

		// ---- T8.3 reaper: abandoned live session (stale heartbeat) is reclaimed ----
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: 'V3' }, (e, r) => { st.v3 = r && r.refId; cb(e); }),
		(cb) => lib['graph-state-version-save']({ userRefId: USER, refId: st.v3, stateScript: '// === USER GRAPH STATE SCRIPT ===\n// durable', userNodeCount: 0, embeddingModelVersion: 'voyage-3' }, (e) => cb(e)),
		(cb) => { console.log('open v3 (then abandon)...'); seam.getUserGraph({ userRefId: USER, versionRefId: st.v3, username: 'alice', sqlDb, dataMapping }, (e, h) => { if (e) { cb(e); return; } st.h3 = h; st.h3container = h.containerName; provisioned.push({ containerName: h.containerName, cloneDir: h.cloneDir }); cb(); }); },
		// abandon: stamp an OLD heartbeat while keeping the live container
		(cb) => lib['graph-state-version-setLive']({ userRefId: USER, refId: st.v3, liveBoltUri: st.h3.graphConnection.boltUri, liveBoltPassword: st.h3.graphConnection.password, liveContainerName: st.h3container, lockToken: st.h3.lockToken, lastHeartbeatAt: new Date(Date.now() - 3600 * 1000).toISOString() }, (e) => cb(e)),
		(cb) => reaper.reapStaleSessions({ sqlDb, dataMapping, leaseTtlSeconds: 60 }, (e, res) => { ok('T8.3 reaper reclaimed the abandoned session', res && res.reaped.some((x) => x.versionRefId === st.v3)); cb(e); }),
		(cb) => { ok('T8.3 reaped container is gone', !cloneManager.containerExists(st.h3container)); cb(); },
		(cb) => lib['graph-state-version-loadScript']({ userRefId: USER, refId: st.v3 }, (e, row) => { ok('T8.3 lease cleared (lockToken empty)', row && (row.lockToken === '' || row.lockToken == null)); ok('T8.3 durable stateScript UNTOUCHED', row && row.stateScript.indexOf('durable') !== -1); cb(e); }),

		// ---- T8.1 (backend slice) version list + rename ----
		(cb) => lib['graph-state-version-rename']({ userRefId: USER, refId: st.v1, versionName: 'V1 Renamed' }, (e, r) => { ok('rename reports success', r && r.renamed); cb(e); }),
		(cb) => lib['graph-state-version-list']({ userRefId: USER }, (e, rows) => { ok('T8.1 list returns all 3 versions', Array.isArray(rows) && rows.length === 3); const v1 = rows.find((r) => r.refId === st.v1); ok('T8.1 rename reflected in list', v1 && v1.versionName === 'V1 Renamed'); cb(e); }),
	], finish);
});
