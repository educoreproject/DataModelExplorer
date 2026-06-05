'use strict';
// BUG-3 gate — strict mint-on-isNew + distinct auto-naming.
//
// Asserts: (A) dme-user-graph-open NEVER mints unless isNew — a reopen with no versionRefId
// errors instead of silently minting a stray version; (B) graph-state-version-new auto-names
// 'Version YYYY-MM-DD HH:MM:SS' when no name is given, and honors a supplied name; (C) the full
// explicit-New path through open still works (mints with the auto-name, provisions a clone,
// read-write) and closes clean. Provisions ONE real Neo4j clone for (C).
//
// Run: node server/test/multiTenant/bugfix-version-mint-naming.js   (needs Docker + golden up)

const fs = require('fs');
const path = require('path');
const os = require('os');

process.global = {
	getConfig: (name) =>
		name === 'dataModelExplorerSearch'
			? { neo4jBoltUri: 'bolt://localhost:7706', neo4jUser: 'neo4j', neo4jPassword: '99d0615d205eead0ea65b3f642ffb3d5' }
			: {},
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const LIB = '../../data-model/lib';
const sqliteInstance = require(`${LIB}/sqlite-instance/sqlite-instance`)({ unused: true });
const dataMapping = require('../../data-model/data-mapping/data-mapping')({
	pwHash: (x) => x, hashPassword: (x) => x, verifyPassword: () => true, validatePasswordStrength: () => ({ valid: true }),
});
const cloneManager = require(`${LIB}/user-graph/clone-manager`);

const TEST_DB = path.join(os.tmpdir(), 'bronze_bugfix_mint_naming.sqlite3');
try { fs.unlinkSync(TEST_DB); } catch (e) {}

const registry = {};
const makeDotD = () => ({ logList: [], library: { add: (n, f) => { registry[n] = f; } } });

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);
const provisioned = [];

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
		cloneManager.teardownClone(provisioned[i++], () => nextOne());
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

const TIMESTAMP_NAME = /^Version \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

sqliteInstance.initDatabaseInstance(TEST_DB, (dbErr, sqlDb) => {
	if (dbErr) { finish(`db init: ${dbErr}`); return; }

	const passThroughParameters = { sqlDb, dataMapping, accessPointsDotD: registry };
	['graph-state-version-new', 'graph-state-version-list', 'graph-state-version-loadScript', 'dme-user-graph-open', 'dme-user-graph-close']
		.forEach((n) => require(`../../data-model/access-points-dot-d/accessPoints.d/${n}`)({ dotD: makeDotD(), passThroughParameters }));

	const newVersion = registry['graph-state-version-new'];
	const listVersions = registry['graph-state-version-list'];
	const loadScript = registry['graph-state-version-loadScript'];
	const openGraph = registry['dme-user-graph-open'];
	const closeGraph = registry['dme-user-graph-close'];

	const USER = '__TEST_b3User';
	const st = {};
	const countRows = (cb) => listVersions({ userRefId: USER }, (e, list) => cb(e, Array.isArray(list) ? list.length : -1));

	series([
		// B — auto-naming. (Runs first so the versions table has its full column set before the
		// count-based checks in A; the sqlite abstraction adds columns on the first saveObject.)
		(cb) => newVersion({ userRefId: USER }, (e, r) => {
			ok('BUG3b new() with no name auto-names "Version YYYY-MM-DD HH:MM:SS"', !!(r && TIMESTAMP_NAME.test(r.versionName)));
			cb(e);
		}),
		(cb) => newVersion({ userRefId: USER, versionName: 'My Hand-Named Model' }, (e, r) => {
			ok('BUG3b new() honors a supplied name', !!(r && r.versionName === 'My Hand-Named Model'));
			cb(e);
		}),
		(cb) => newVersion({ userRefId: USER, versionName: '   ' }, (e, r) => {
			ok('BUG3b new() treats whitespace-only name as empty -> auto-names', !!(r && TIMESTAMP_NAME.test(r.versionName)));
			cb(e);
		}),

		// A — the silent-mint hole is closed: a reopen with no versionRefId and not isNew ERRORS
		// and mints nothing.
		(cb) => countRows((e, c) => { st.before = c; cb(e); }),
		(cb) => openGraph({ userRefId: USER, isNew: false }, (e, res) => {
			ok('BUG3a open(no versionRefId, not isNew) is REJECTED', !!e && /versionRefId is required/.test(String(e)));
			ok('BUG3a rejected open returns no versionRefId', !(res && res.versionRefId));
			cb();
		}),
		(cb) => openGraph({ userRefId: USER, isNew: false, versionRefId: '' }, (e) => {
			ok('BUG3a open(empty versionRefId) is REJECTED', !!e && /versionRefId is required/.test(String(e)));
			cb();
		}),
		(cb) => countRows((e, c) => { ok('BUG3a no stray version was minted by the rejected opens', c === st.before); cb(e); }),

		// C — the explicit-New path through open still works end to end (mint + clone + r/w),
		// and the version carries the distinct auto-name.
		(cb) => {
			console.log('explicit New through open (provisions a clone; may briefly quiesce golden)...');
			openGraph({ userRefId: USER, username: 'tq', isNew: true }, (e, res) => {
				if (e) { cb(e); return; }
				st.newRef = res && res.versionRefId;
				ok('BUG3c New-through-open returns read-write', res && res.readOnly === false);
				ok('BUG3c New-through-open returns a versionRefId', !!st.newRef);
				cb();
			});
		},
		(cb) => loadScript({ userRefId: USER, refId: st.newRef }, (e, row) => {
			if (row && row.liveContainerName) provisioned.push({ containerName: row.liveContainerName, cloneDir: cloneManager.cloneDirFor(USER, st.newRef) });
			ok('BUG3c New version carries the distinct auto-name', !!(row && TIMESTAMP_NAME.test(row.versionName)));
			ok('BUG3c New version is live on a usr_* clone', !!(row && /^usr_/.test(row.liveContainerName || '')));
			cb(e);
		}),
		(cb) => closeGraph({ userRefId: USER, versionRefId: st.newRef }, (e, res) => {
			ok('BUG3c close after New reports closed', res && res.closed === true);
			cb(e);
		}),
	], finish);
});
