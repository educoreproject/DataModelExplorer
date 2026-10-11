'use strict';
// captureBugfixLockFixture.js — campaign P4a (A13, STANDDOWN-STEEL_VALLEY). The BUG-1 gate (bugfix-lock-lifecycle.js) used
// to read /tmp/tq_statescript_raw.txt, a hand-captured copy of a REAL user's stateScript from educore_dev.sqlite3; the
// file is gone and real user data must never be its source. This tool builds the fixture from a SCRATCH user graph: a
// __TEST_ user in an isolated tmp sqlite opens a fresh clone, creates FIXTURE_NODE_COUNT DebugNode nodes through the real
// write access point, saves through the real save access point (which re-emits against the clone's own manifest), and
// writes the row's stored (base64-encoded) stateScript to fixtures/bugfixLockStateScript.base64.txt. Provisions ONE real
// clone (briefly quiesces golden), makes no embedding call (the user layer is text-only since P2), and always tears the clone down.
//
// Run: node server/test/multiTenant/captureBugfixLockFixture.js   (needs Docker + golden)
const fs = require('fs');
const path = require('path');
const os = require('os');
process.global = {
	getConfig: (name) =>
		name === 'dataModelExplorerSearch'
			? { ...require('../lib/goldenContainerName').goldenDmeConfigForTests() }
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
const { encodeStateScript, STMT_BOUNDARY } = require(`${LIB}/user-graph/re-emit`);
const { FIXTURE_FILE_PATH, FIXTURE_NODE_COUNT, FIXTURE_NODE_LABEL, FIXTURE_NODE_NAME_PREFIX } = require('./fixtures/bugfixLockFixtureDeclaration');

const TEST_DB = path.join(os.tmpdir(), 'p4a_capture_bugfix_lock_fixture.sqlite3');
try { fs.unlinkSync(TEST_DB); } catch (e) {}
const lib = {};
const dotD = () => ({ logList: [], library: { add: (n, f) => { lib[n] = f; } } });
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
		if (err) {
			console.error(`CAPTURE FAILED: ${err}`);
			process.exit(1);
		}
		console.log(`CAPTURED: ${FIXTURE_FILE_PATH}`);
		process.exit(0);
	});
};

sqliteInstance.initDatabaseInstance(TEST_DB, (dbErr, sqlDb) => {
	if (dbErr) { finish(`db init: ${dbErr}`); return; }
	const ptp = { sqlDb, dataMapping, accessPointsDotD: lib };
	['graph-state-version-new', 'graph-state-version-save', 'graph-state-version-loadScript', 'dme-user-graph-write', 'dme-user-graph-save']
		.forEach((f) => require(`../../data-model/access-points-dot-d/accessPoints.d/${f}`)({ dotD: dotD(), passThroughParameters: ptp }));

	const USER = '__TEST_fixtureCapture';
	const st = {};
	const nodeStepList = Array.from({ length: FIXTURE_NODE_COUNT }, (unused, nodeIndex) => (cb) => lib['dme-user-graph-write']({
		userRefId: USER, versionRefId: st.v, action: 'createNode',
		params: { labels: [FIXTURE_NODE_LABEL], properties: { name: `${FIXTURE_NODE_NAME_PREFIX}${nodeIndex + 1}`, description: 'synthetic node for the BUG-1 lock-lifecycle gate (campaign P4a); no user data' } },
	}, (e, r) => cb(e || (r && r.userNodeId ? '' : `createNode ${nodeIndex + 1} returned no userNodeId`))));

	series([
		(cb) => lib['graph-state-version-new']({ userRefId: USER, versionName: '__TEST_bugfixLockFixture' }, (e, r) => { st.v = r && r.refId; cb(e); }),
		(cb) => {
			console.log('opening a scratch clone (quiesces golden)...');
			seam.getUserGraph({ userRefId: USER, versionRefId: st.v, username: '__TEST_fixtureCapture', sqlDb, dataMapping }, (e, h) => {
				if (e) { cb(e); return; }
				st.handle = h; provisioned.push({ containerName: h.containerName, cloneDir: h.cloneDir });
				cb();
			});
		},
		...nodeStepList,
		(cb) => lib['dme-user-graph-save']({ userRefId: USER, versionRefId: st.v }, (e, r) => cb(e || (r && r.saved ? '' : 'save did not report saved'))),
		// the STORED form is base64 (re-emit.js encodeStateScript, one encode at the store boundary); loadScript decodes it,
		// so the fixture re-encodes the decoded script with the same function — byte-identical to the stored column
		(cb) => lib['graph-state-version-loadScript']({ userRefId: USER, refId: st.v }, (e, row) => {
			if (e) { cb(e); return; }
			const fixtureNodeStatementCount = ((row && row.stateScript) || '').split('\n').filter((line) => line.startsWith('MERGE (n:') && line.includes(`:${FIXTURE_NODE_LABEL}`)).length;
			if (fixtureNodeStatementCount !== FIXTURE_NODE_COUNT) {
				cb(`the saved stateScript re-creates ${fixtureNodeStatementCount} ${FIXTURE_NODE_LABEL} node(s); expected ${FIXTURE_NODE_COUNT}`);
				return;
			}
			// the UserGraphIdentity statement is per-VERSION content (it names the capture's own versionRefId) and the gate seeds
			// the script into a different version, whose open seeds its own marker; so the fixture keeps only the fixture
			// nodes, and its header counts them
			const [headerText, ...statementList] = row.stateScript.split(STMT_BOUNDARY).reduce((soFar, chunkText, chunkIndex) => (chunkIndex === 0 ? chunkText.split(/\n(?=MERGE )/) : soFar.concat([chunkText])), []);
			const fixtureStatementList = statementList.filter((statementText) => !statementText.includes(':UserGraphIdentity'));
			const fixtureHeaderText = headerText.replace(/^\/\/ userNodeCount: \d+$/m, `// userNodeCount: ${fixtureStatementList.length}`);
			fs.writeFileSync(FIXTURE_FILE_PATH, `${encodeStateScript(`${fixtureHeaderText}\n${fixtureStatementList.join(STMT_BOUNDARY)}`)}\n`);
			cb();
		}),
		(cb) => seam.releaseUserGraph(st.handle, { sqlDb, dataMapping }, (e) => cb(e)),
	], finish);
});
