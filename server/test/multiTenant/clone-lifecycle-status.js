'use strict';
// T1 gate (doc 12, Phase 1) — liveDirty lifecycle + status access point.
//
// Drives the REAL access points against a REAL Neo4j clone: open -> status dirty===0;
// a real dme-user-graph-write (createNode, real Voyage embedding) -> status dirty===1;
// dme-user-graph-save -> status dirty===0; releaseUserGraph (close) -> status open===0.
// The status AP is the exact logic the GET /api/dme-user-graph-status endpoint serves.
// Provisions ONE real clone (briefly quiesces golden); always tears it down. Uses an
// isolated tmp sqlite and a __TEST_ user row — never touches TQ's data.
//
// Run: node server/test/multiTenant/clone-lifecycle-status.js   (needs Docker + golden + network)

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

const TEST_DB = path.join(os.tmpdir(), 'indigo_clone_lifecycle_status.sqlite3');
try { fs.unlinkSync(TEST_DB); } catch (e) {}

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

const statusOf = (userRefId, versionRefId, cb) =>
	lib['dme-user-graph-status']({ userRefId, versionRefId }, (e, list) => cb(e, (list && list[0]) || null));

sqliteInstance.initDatabaseInstance(TEST_DB, (dbErr, sqlDb) => {
	if (dbErr) { finish(`db init: ${dbErr}`); return; }
	const ptp = { sqlDb, dataMapping, accessPointsDotD: lib };
	[
		'graph-state-version-new', 'graph-state-version-save', 'graph-state-version-loadScript',
		'dme-user-graph-write', 'dme-user-graph-save', 'dme-user-graph-status',
	].forEach((f) => require(`../../data-model/access-points-dot-d/accessPoints.d/${f}`)({ dotD: dotD(), passThroughParameters: ptp }));

	const USER = '__TEST_dirtyUser';
	const st = {};

	series([
		// status on a never-opened version: not open, not dirty, never errors.
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: 'DirtyVer' }, (e, r) => { st.v = r && r.refId; cb(e); }),
		(cb) => statusOf(USER, st.v, (e, s) => {
			ok('T1.0 status on un-opened version: open===false', s && s.open === false);
			ok('T1.0 status on un-opened version: dirty===false', s && s.dirty === false);
			cb(e);
		}),

		// OPEN (real clone). setLive writes liveDirty=0 with the rest of the live block.
		(cb) => {
			console.log('opening clone (quiesces golden)...');
			seam.getUserGraph({ userRefId: USER, versionRefId: st.v, username: 'tq', sqlDb, dataMapping }, (e, h) => {
				if (e) { cb(e); return; }
				st.handle = h; provisioned.push({ containerName: h.containerName, cloneDir: h.cloneDir });
				cb();
			});
		},
		(cb) => statusOf(USER, st.v, (e, s) => {
			ok('T1.1 after open: open===true', s && s.open === true);
			ok('T1.1 after open: dirty===false (clone matches durable after replay)', s && s.dirty === false);
			cb(e);
		}),

		// WRITE (real createNode + Voyage embedding) -> liveDirty=1.
		(cb) => lib['dme-user-graph-write']({
			userRefId: USER, versionRefId: st.v, action: 'createNode',
			params: { labels: ['Course'], properties: { name: 'Dirty Probe Course', description: 'forces a live write' } },
		}, (e, r) => { st.userNodeId = r && r.userNodeId; ok('T1.2 createNode returns a userNodeId', !!st.userNodeId); cb(e); }),
		(cb) => statusOf(USER, st.v, (e, s) => {
			ok('T1.2 after a real write: dirty===true', s && s.dirty === true);
			ok('T1.2 after a real write: still open===true', s && s.open === true);
			cb(e);
		}),

		// SAVE -> re-emit durable stateScript, liveDirty cleared to 0.
		(cb) => lib['dme-user-graph-save']({ userRefId: USER, versionRefId: st.v }, (e, r) => { ok('T1.3 Save ok', r && r.saved); cb(e); }),
		(cb) => statusOf(USER, st.v, (e, s) => {
			ok('T1.3 after Save: dirty===false (durable matches live again)', s && s.dirty === false);
			ok('T1.3 after Save: still open===true', s && s.open === true);
			cb(e);
		}),

		// a SECOND write re-dirties (proves the flag is not one-shot).
		(cb) => lib['dme-user-graph-write']({
			userRefId: USER, versionRefId: st.v, action: 'createNode',
			params: { labels: ['Course'], properties: { name: 'Second Probe', description: 'second live write' } },
		}, (e) => cb(e)),
		(cb) => statusOf(USER, st.v, (e, s) => { ok('T1.4 a second write re-dirties: dirty===true', s && s.dirty === true); cb(e); }),

		// CLOSE (release) -> live block cleared, liveDirty cleared. Not open, not dirty.
		(cb) => seam.releaseUserGraph(st.handle, { sqlDb, dataMapping }, (e) => cb(e)),
		(cb) => statusOf(USER, st.v, (e, s) => {
			ok('T1.5 after close: open===false', s && s.open === false);
			ok('T1.5 after close: dirty===false', s && s.dirty === false);
			cb(e);
		}),

		// status owner-scoping: a different user probing this versionRefId gets [] (no leak).
		(cb) => lib['dme-user-graph-status']({ userRefId: '__TEST_otherUser', versionRefId: st.v }, (e, list) => {
			ok('T1.6 foreign user probing the version gets [] (owner-scoped)', Array.isArray(list) && list.length === 0);
			cb(e);
		}),
		// status with empty versionRefId (client has no active graph) -> [].
		(cb) => lib['dme-user-graph-status']({ userRefId: USER, versionRefId: '' }, (e, list) => {
			ok('T1.7 empty versionRefId -> [] (nothing open)', Array.isArray(list) && list.length === 0);
			cb(e);
		}),
	], finish);
});
