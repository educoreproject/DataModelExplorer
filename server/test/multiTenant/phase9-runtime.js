'use strict';
// Phase 9 gate — production runtime (LOCAL): snapshot-source + pointer flip (T9.4),
// warm-pool fast path (T9.1), spike cold fallback (T9.3), overshoot tolerance (T9.2),
// embedding migration (T9.5). T9.6 is validate-clone.js. Real clones; always tears down.

const fs = require('fs');
const path = require('path');
// The Voyage key comes from the established ini — never a literal in source.
const dmeIniSection = require('qtools-config-file-processor').getConfig(
	'dataModelExplorerSearch.ini',
	path.join(__dirname, '../../../../configs/instanceSpecific/qbook/'),
	{ resolve: true }
).dataModelExplorerSearch;
if (!dmeIniSection || !dmeIniSection.voyageApiKey || dmeIniSection.voyageApiKey.startsWith('<!')) {
	console.error('Missing voyageApiKey in dataModelExplorerSearch.ini [dataModelExplorerSearch] — cannot run this test.');
	process.exit(1);
}
const os = require('os');

process.global = {
	getConfig: (name) => name === 'dataModelExplorerSearch'
		? { neo4jBoltUri: 'bolt://localhost:7706', neo4jUser: 'neo4j', neo4jPassword: '99d0615d205eead0ea65b3f642ffb3d5', voyageApiKey: dmeIniSection.voyageApiKey, }
		: {},
	xLog: { status: () => {}, error: (m) => console.error('xLog.error:', m), verbose: () => {}, result: () => {} },
	rawConfig: {}, commandLineParameters: { switches: {}, values: {} },
};

const LIB = '../../data-model/lib';
const sqliteInstance = require(`${LIB}/sqlite-instance/sqlite-instance`)({ unused: true });
const dataMapping = require('../../data-model/data-mapping/data-mapping')({ pwHash: (x) => x, hashPassword: (x) => x, verifyPassword: () => true, validatePasswordStrength: () => ({ valid: true }) });
const seam = require(`${LIB}/user-graph/user-graph`);
const cloneManager = require(`${LIB}/user-graph/clone-manager`);
const warmPool = require(`${LIB}/user-graph/warm-pool`);
const migration = require(`${LIB}/user-graph/embedding-migration`);
const neo4jGen = require(`${LIB}/neo4j-instance/neo4j-instance`)({ unused: true });

const TEST_DB = path.join(os.tmpdir(), 'ruby_phase9_runtime.sqlite3');
try { fs.unlinkSync(TEST_DB); } catch (e) {}
const lib = {};
const dotD = () => ({ logList: [], library: { add: (n, f) => { lib[n] = f; } } });
const results = [];
const ok = (name, cond) => results.push([name, !!cond]);
const owned = []; // {containerName, cloneDir} to tear down

const series = (steps, done) => { let i = 0; const n = (e) => { if (e) { done(e); return; } if (i >= steps.length) { done(); return; } steps[i++](n); }; n(); };
const teardownAll = (cb) => { warmPool.drainPool(() => { let i = 0; const n = () => { if (i >= owned.length) { cb(); return; } cloneManager.teardownClone(owned[i++], () => n()); }; n(); }); };
const finish = (err) => { teardownAll(() => { try { fs.unlinkSync(TEST_DB); } catch (e) {} if (err) console.error('FLOW ERROR:', err); let p = !err; results.forEach(([n, g]) => { if (!g) p = false; console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`); }); console.log(p ? 'ALL_PASS' : 'SOME_FAIL'); process.exit(p ? 0 : 1); }); };
const countNonUser = (conn, cb) => neo4jGen.initDatabaseInstance({ neo4jBoltUri: conn.boltUri, neo4jUser: conn.user || 'neo4j', neo4jPassword: conn.password }, (e, db) => { if (e) { cb(e); return; } db.runQuery('MATCH (n) WHERE NOT n:UserContent RETURN count(n) AS c', {}, (qe, rows) => { db.close(); cb(qe, rows && rows[0] && rows[0].c); }); });

sqliteInstance.initDatabaseInstance(TEST_DB, (dbErr, sqlDb) => {
	if (dbErr) { finish(`db init: ${dbErr}`); return; }
	const ptp = { sqlDb, dataMapping, accessPointsDotD: lib };
	['graph-state-version-new', 'graph-state-version-save', 'graph-state-version-loadScript', 'dme-user-graph-write']
		.forEach((f) => require(`../../data-model/access-points-dot-d/accessPoints.d/${f}`)({ dotD: dotD(), passThroughParameters: ptp }));
	const USER = '__TEST_uR';
	const st = {};

	series([
		// ---- T9.4 snapshot-source + pointer flip ----
		(cb) => { console.log('creating golden snapshot (one quiesce)...'); cloneManager.createSnapshot((e, r) => { st.snap1 = r && r.snapName; ok('T9.4 snapshot created + pointer set', !!st.snap1 && !!cloneManager.currentSnapshotDir()); cb(e); }); },
		(cb) => { console.log('provision clone FROM snapshot (golden NOT quiesced)...'); cloneManager.provisionClone({ userRefId: '__TEST_snap', versionRefId: 's1' }, (e, d) => { if (e) { cb(e); return; } st.snapClone = d; owned.push({ containerName: d.containerName, cloneDir: d.cloneDir }); ok('T9.4 golden stayed RUNNING during clone (no quiesce)', cloneManager.isContainerRunning('rag_DataModelExplorer')); cb(); }); },
		(cb) => countNonUser(st.snapClone, (e, c) => { ok('T9.4 snapshot clone carries golden standards (75882)', String(c) === '75882'); cb(e); }),
		(cb) => { cloneManager.teardownClone(st.snapClone, () => { owned.length = 0; cb(); }); },
		(cb) => { cloneManager.createSnapshot((e, r) => { st.snap2 = r && r.snapName; ok('T9.4 pointer FLIPPED to a new snapshot atomically', st.snap2 && st.snap2 !== st.snap1 && cloneManager.currentSnapshotDir().indexOf(st.snap2) !== -1); cb(e); }); },

		// ---- T9.1 warm-pool fast path ----
		(cb) => { console.log('priming warm pool (depth 1)...'); warmPool.primePool(1, (e) => { ok('T9.1 pool primed to depth 1', warmPool.poolDepth() === 1); cb(e); }); },
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: 'W1' }, (e, r) => { st.vw = r && r.refId; cb(e); }),
		(cb) => { console.log('open via warm pool (should skip cold boot)...'); const t0 = Date.now(); seam.getUserGraph({ userRefId: USER, versionRefId: st.vw, username: 'alice', sqlDb, dataMapping }, (e, h) => { if (e) { cb(e); return; } st.hw = h; owned.push({ containerName: h.containerName, cloneDir: h.cloneDir }); const secs = (Date.now() - t0) / 1000; ok('T9.1 warm open succeeded', !!h.containerName); ok(`T9.1 warm open was fast (~replay time, no cold boot): ${secs.toFixed(1)}s < 12s`, secs < 12); ok('T9.1 warm clone consumed from pool (depth 0)', warmPool.poolDepth() === 0); cb(); }); },

		// ---- T9.3 spike: empty pool -> cold-clone fallback ----
		(cb) => warmPool.drainPool(() => cb()),
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: 'S1' }, (e, r) => { st.vs = r && r.refId; cb(e); }),
		(cb) => { console.log('open with EMPTY pool (cold fallback)...'); seam.getUserGraph({ userRefId: USER, versionRefId: st.vs, username: 'alice', sqlDb, dataMapping }, (e, h) => { if (e) { cb(e); return; } st.hs = h; owned.push({ containerName: h.containerName, cloneDir: h.cloneDir }); ok('T9.3 spike: empty pool falls back to a cold clone (no error/hang)', !!h.containerName); cb(); }); },
		(cb) => seam.releaseUserGraph(st.hs, { sqlDb, dataMapping }, () => cb()),

		// ---- T9.2 overshoot tolerance: concurrent refills, no crash, no over-provision ----
		(cb) => { console.log('overshoot: concurrent refills toward depth 2...'); warmPool.setTargetDepth(2); warmPool.refillAsync(); warmPool.refillAsync(); warmPool.refillAsync(); cb(); },
		(cb) => { const start = Date.now(); const wait = () => { if (warmPool.poolDepth() >= 2 || Date.now() - start > 120000) { ok('T9.2 overshoot tolerated: pool reached target without exceeding it or crashing', warmPool.poolDepth() === 2); cb(); return; } setTimeout(wait, 1000); }; wait(); },
		(cb) => warmPool.drainPool(() => { ok('T9.2 pool drained cleanly', warmPool.poolDepth() === 0); cb(); }),

		// ---- T9.5 embedding migration (re-embed + bump stamp; replay still works) ----
		(cb) => lib['dme-user-graph-write']({ userRefId: USER, versionRefId: st.vw, action: 'createNode', params: { labels: ['Course'], properties: { name: 'Migrate Me', description: 'a node to re-embed' } } }, (e, r) => { st.mn = r && r.userNodeId; cb(e); }),
		(cb) => { const { reEmit } = require(`${LIB}/user-graph/re-emit`); neo4jGen.initDatabaseInstance({ neo4jBoltUri: st.hw.graphConnection.boltUri, neo4jUser: 'neo4j', neo4jPassword: st.hw.graphConnection.password }, (ce, db) => { if (ce) { cb(ce); return; } reEmit({ userGraphDb: db, embeddingModelVersion: 'voyage-3' }, (re, res) => { db.close(); if (re) { cb(re); return; } lib['graph-state-version-save']({ userRefId: USER, refId: st.vw, stateScript: res.stateScript, userNodeCount: res.userNodeCount, embeddingModelVersion: 'voyage-3' }, (se) => cb(se)); }); }); },
		(cb) => seam.releaseUserGraph(st.hw, { sqlDb, dataMapping }, () => { owned.length = 0; cb(); }),
		(cb) => migration.migrateVersion({ sqlDb, dataMapping, accessPointsDotD: lib, userRefId: USER, versionRefId: st.vw, newModelVersion: 'voyage-3', voyageApiKey: process.global.getConfig('dataModelExplorerSearch').voyageApiKey, dryRun: true }, (e, sum) => { ok('T9.5 migration dry-run reports the node count without writing', sum && sum.dryRun === true && sum.wouldReEmbed === 1); cb(e); }),
		(cb) => { console.log('migration real run (re-embed + bump stamp)...'); migration.migrateVersion({ sqlDb, dataMapping, accessPointsDotD: lib, userRefId: USER, versionRefId: st.vw, newModelVersion: 'voyage-3-migrated', voyageApiKey: process.global.getConfig('dataModelExplorerSearch').voyageApiKey, dryRun: false }, (e, sum) => { ok('T9.5 migration re-embedded 1 node + bumped stamp', sum && sum.reEmbedded === 1 && sum.newModelVersion === 'voyage-3-migrated'); cb(e); }); },
		(cb) => lib['graph-state-version-loadScript']({ userRefId: USER, refId: st.vw }, (e, row) => { ok('T9.5 stored stamp bumped to voyage-3-migrated', row && row.embeddingModelVersion === 'voyage-3-migrated'); cb(e); }),
		(cb) => { console.log('re-open after migration (replay still works)...'); seam.getUserGraph({ userRefId: USER, versionRefId: st.vw, username: 'alice', sqlDb, dataMapping }, (e, h) => { if (e) { cb(e); return; } owned.push({ containerName: h.containerName, cloneDir: h.cloneDir }); cb(); }); },
		(cb) => { // verify the re-opened clone has the migrated node with the new stamp
			lib['graph-state-version-loadScript']({ userRefId: USER, refId: st.vw }, (e, row) => {
				if (e || !row || !row.liveBoltUri) { ok('T9.5 replay after migration reconstructed the node', false); cb(); return; }
				neo4jGen.initDatabaseInstance({ neo4jBoltUri: row.liveBoltUri, neo4jUser: 'neo4j', neo4jPassword: row.liveBoltPassword }, (ce, db) => {
					if (ce) { ok('T9.5 replay after migration reconstructed the node', false); cb(); return; }
					db.runQuery('MATCH (n:UserContent {userNodeId:$id}) RETURN n.embeddingModelVersion AS emv, size(n.embedding) AS dim', { id: st.mn }, (qe, rows) => {
						db.close();
						const n = rows && rows[0];
						ok('T9.5 replay after migration reconstructed the node with the new stamp', n && n.emv === 'voyage-3-migrated' && Number(n.dim) === 1024);
						cb();
					});
				});
			});
		},
	], finish);
});
