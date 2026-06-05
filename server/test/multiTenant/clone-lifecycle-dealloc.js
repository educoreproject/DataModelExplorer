'use strict';
// T2 gate (doc 12, Phase 2) — incumbent deallocation contract (the cure for the
// "clone cap reached (3 concurrent)" error). Proves the server APs support the client's
// _openCall sequence cleanly: open A (1 live clone) -> dirty A with a real write ->
// CLOSE A via the close AP -> open B. Asserts net-zero clone growth (exactly one usr_*
// container for the user throughout), exactly one of {A,B} holds a live block, and A's
// liveDirty + live block are fully cleared by close. Provisions REAL clones (briefly
// quiesces golden); always tears them down. Isolated tmp sqlite + __TEST_ user.
//
// Run: node server/test/multiTenant/clone-lifecycle-dealloc.js   (needs Docker + golden + network)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

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
const cloneManager = require(`${LIB}/user-graph/clone-manager`);

const TEST_DB = path.join(os.tmpdir(), 'indigo_clone_lifecycle_dealloc.sqlite3');
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

// Count this test user's live clone containers (named usr_<user>_<version>). Scoped to the
// test user so an unrelated clone elsewhere can never perturb the net-zero assertion.
const userCloneCount = (userPrefix) => {
	try {
		const out = execSync(`docker ps -a --filter name=${userPrefix} --format '{{.Names}}'`, { encoding: 'utf-8' }).trim();
		return out ? out.split('\n').filter(Boolean).length : 0;
	} catch (e) { return 0; }
};

sqliteInstance.initDatabaseInstance(TEST_DB, (dbErr, sqlDb) => {
	if (dbErr) { finish(`db init: ${dbErr}`); return; }
	const ptp = { sqlDb, dataMapping, accessPointsDotD: lib };
	[
		'graph-state-version-new', 'graph-state-version-loadScript',
		'dme-user-graph-open', 'dme-user-graph-close', 'dme-user-graph-write', 'dme-user-graph-status',
	].forEach((f) => require(`../../data-model/access-points-dot-d/accessPoints.d/${f}`)({ dotD: dotD(), passThroughParameters: ptp }));

	const USER = '__TEST_deallocUser';
	const CONTAINER_PREFIX = `usr___TEST_deallocUser`; // containerNameFor sanitizes the same way
	const st = {};

	const registerLive = (refId, cb) => lib['graph-state-version-loadScript']({ userRefId: USER, refId }, (e, row) => {
		if (row && row.liveContainerName) provisioned.push({ containerName: row.liveContainerName, cloneDir: cloneManager.cloneDirFor(USER, refId) });
		cb(e, row);
	});

	series([
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: 'Ver A' }, (e, r) => { st.a = r && r.refId; cb(e); }),
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: 'Ver B' }, (e, r) => { st.b = r && r.refId; cb(e); }),

		// OPEN A — one live clone.
		(cb) => {
			console.log('opening A (quiesces golden)...');
			lib['dme-user-graph-open']({ userRefId: USER, username: 'tq', versionRefId: st.a }, (e, res) => {
				ok('T2.1 open A returns read-write', res && res.readOnly === false);
				cb(e);
			});
		},
		(cb) => registerLive(st.a, (e, row) => { ok('T2.1 A is live on a usr_* clone', !!(row && /^usr_/.test(row.liveContainerName || ''))); cb(e); }),
		(cb) => { ok('T2.1 exactly one live clone for the user after open A', userCloneCount(CONTAINER_PREFIX) === 1); cb(); },

		// DIRTY A with a real write so the close-clears-liveDirty assertion is meaningful.
		(cb) => lib['dme-user-graph-write']({
			userRefId: USER, versionRefId: st.a, action: 'createNode',
			params: { labels: ['Course'], properties: { name: 'A dirty node', description: 'forces liveDirty=1 on A' } },
		}, (e) => cb(e)),
		(cb) => lib['dme-user-graph-status']({ userRefId: USER, versionRefId: st.a }, (e, list) => {
			const s = (list && list[0]) || null;
			ok('T2.2 A is dirty before close (dirty===true)', s && s.dirty === true);
			cb(e);
		}),

		// CLOSE A (this is exactly what the client _openCall does to the incumbent before
		// opening the target). Tears down A's container + clears its live block + liveDirty.
		(cb) => lib['dme-user-graph-close']({ userRefId: USER, versionRefId: st.a }, (e, res) => { ok('T2.3 close A reports closed', res && res.closed === true); cb(e); }),
		(cb) => lib['graph-state-version-loadScript']({ userRefId: USER, refId: st.a }, (e, row) => {
			ok('T2.3 close cleared A liveContainerName', row && (row.liveContainerName === '' || row.liveContainerName == null));
			ok('T2.3 close cleared A liveDirty', row && (Number(row.liveDirty) !== 1));
			cb(e);
		}),
		(cb) => lib['dme-user-graph-status']({ userRefId: USER, versionRefId: st.a }, (e, list) => {
			const s = (list && list[0]) || null;
			ok('T2.3 after close A: open===false', s && s.open === false);
			ok('T2.3 after close A: dirty===false', s && s.dirty === false);
			cb(e);
		}),
		(cb) => { ok('T2.3 zero live clones for the user between close A and open B', userCloneCount(CONTAINER_PREFIX) === 0); cb(); },

		// OPEN B — the target. Net-zero: still exactly one live clone for the user.
		(cb) => {
			console.log('opening B (quiesces golden)...');
			lib['dme-user-graph-open']({ userRefId: USER, username: 'tq', versionRefId: st.b }, (e, res) => {
				ok('T2.4 open B returns read-write', res && res.readOnly === false);
				cb(e);
			});
		},
		(cb) => registerLive(st.b, (e, row) => { ok('T2.4 B is live on a usr_* clone', !!(row && /^usr_/.test(row.liveContainerName || ''))); cb(e); }),
		(cb) => { ok('T2.4 NET-ZERO: exactly one live clone for the user after close A + open B (cap did not grow)', userCloneCount(CONTAINER_PREFIX) === 1); cb(); },

		// EXACTLY ONE of {A,B} holds a live block.
		(cb) => lib['dme-user-graph-status']({ userRefId: USER, versionRefId: st.a }, (e, list) => { st.aOpen = !!((list && list[0]) || {}).open; cb(e); }),
		(cb) => lib['dme-user-graph-status']({ userRefId: USER, versionRefId: st.b }, (e, list) => {
			const bOpen = !!((list && list[0]) || {}).open;
			ok('T2.5 B holds the live block (open===true)', bOpen === true);
			ok('T2.5 exactly one of {A,B} is open', (st.aOpen ? 1 : 0) + (bOpen ? 1 : 0) === 1);
			cb(e);
		}),

		// CLOSE B (clean exit).
		(cb) => lib['dme-user-graph-close']({ userRefId: USER, versionRefId: st.b }, (e) => cb(e)),
		(cb) => { ok('T2.6 zero live clones for the user after closing B', userCloneCount(CONTAINER_PREFIX) === 0); cb(); },
	], finish);
});
