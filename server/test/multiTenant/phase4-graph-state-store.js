'use strict';
// Phase 4 gate — graph-state-version SQL store (doc 06).
// Real integration test: boots the actual sqlite-instance + data-mapping + the
// graph-state-version-* access points against a throwaway temp SQLite file, and
// exercises New / Save / List / loadScript / setLive / clearLive / clearStaleLocks.
//
// Run: node server/test/multiTenant/phase4-graph-state-store.js
// Exit 0 = all gate assertions PASS.

const fs = require('fs');
const path = require('path');
const os = require('os');

// process.global must exist before requiring modules that read it.
process.global = {
	getConfig: () => ({}),
	xLog: {
		status: () => {},
		error: (m) => console.error('xLog.error:', m),
		verbose: () => {},
		result: () => {},
	},
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const TEST_DB = path.join(os.tmpdir(), 'ruby_phase4_graph_state_store.sqlite3');
try { fs.unlinkSync(TEST_DB); } catch (e) {}

const sqliteInstance = require('../../data-model/lib/sqlite-instance/sqlite-instance')({
	unused: true,
});
const dataMapping = require('../../data-model/data-mapping/data-mapping')({
	pwHash: (x) => x,
	hashPassword: (x) => x,
	verifyPassword: () => true,
	validatePasswordStrength: () => ({ valid: true }),
});

const registry = {};
const makeDotD = () => ({
	logList: [],
	library: { add: (name, fn) => { registry[name] = fn; } },
});

const apFiles = [
	'new', 'save', 'list', 'loadScript',
	'setLive', 'clearLive', 'stampHeartbeat', 'clearStaleLocks',
];

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);

const series = (steps, done) => {
	let i = 0;
	const nextStep = (err) => {
		if (err) { done(err); return; }
		if (i >= steps.length) { done(); return; }
		steps[i++](nextStep);
	};
	nextStep();
};

const finish = (err) => {
	if (err) console.error('FLOW ERROR:', err);
	let allPass = !err;
	results.forEach(([n, good]) => {
		if (!good) allPass = false;
		console.log(`${good ? 'PASS' : 'FAIL'} - ${n}`);
	});
	try { fs.unlinkSync(TEST_DB); } catch (e) {}
	console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL');
	process.exit(allPass ? 0 : 1);
};

sqliteInstance.initDatabaseInstance(TEST_DB, (err, sqlDb) => {
	if (err) { finish(`db init: ${err}`); return; }

	const passThroughParameters = { sqlDb, dataMapping };
	apFiles.forEach((f) => {
		require(`../../data-model/access-points-dot-d/accessPoints.d/graph-state-version-${f}`)({
			dotD: makeDotD(),
			passThroughParameters,
		});
	});

	const ap = (name) => registry[`graph-state-version-${name}`];
	const USER_A = '__TEST_userA';
	const USER_B = '__TEST_userB';
	const state = {};

	const oldIso = new Date(Date.now() - 3600 * 1000).toISOString();
	const freshIso = new Date().toISOString();

	series([
		// --- New: insert version rows ---
		(cb) => ap('new')({ userRefId: USER_A, versionName: 'A1' }, (e, r) => {
			state.a1 = r && r.refId; ok('T4.1 New returns a refId (A1)', state.a1); cb(e);
		}),
		(cb) => ap('new')({ userRefId: USER_A, versionName: 'A2' }, (e, r) => {
			state.a2 = r && r.refId; ok('T4.1 New returns a refId (A2)', state.a2); cb(e);
		}),
		(cb) => ap('new')({ userRefId: USER_B, versionName: 'B1' }, (e, r) => {
			state.b1 = r && r.refId; ok('T4.2 New for user B', state.b1); cb(e);
		}),

		// --- List scoped to user ---
		(cb) => ap('list')({ userRefId: USER_A }, (e, rows) => {
			ok('T4.2 List for A returns exactly A rows (2)', Array.isArray(rows) && rows.length === 2);
			// T4.3 — client list must not leak stateScript or any liveBolt* field
			const leaks = rows.some((row) =>
				('stateScript' in row) || ('liveBoltUri' in row) ||
				('liveBoltPassword' in row) || ('lockToken' in row));
			ok('T4.3 List exposes no stateScript / liveBolt* / lockToken', !leaks);
			const onlySafe = rows.every((row) =>
				Object.keys(row).every((k) =>
					['refId', 'versionName', 'updatedAt', 'userNodeCount'].includes(k)));
			ok('T4.3 List returns only the safe columns', onlySafe);
			cb(e);
		}),
		(cb) => ap('list')({ userRefId: USER_B }, (e, rows) => {
			ok('T4.2 List for B returns exactly B rows (1)', Array.isArray(rows) && rows.length === 1);
			cb(e);
		}),

		// --- Save updates in place (last-write-wins, no history row) ---
		(cb) => ap('save')({ userRefId: USER_A, refId: state.a1, stateScript: 'SCRIPT_V1', userNodeCount: 3 }, (e, r) => {
			ok('T4.1 Save #1 ok', r && r.saved); cb(e);
		}),
		(cb) => ap('save')({ userRefId: USER_A, refId: state.a1, stateScript: 'SCRIPT_V2', userNodeCount: 5 }, (e, r) => {
			ok('T4.1 Save #2 ok', r && r.saved); cb(e);
		}),
		(cb) => ap('loadScript')({ userRefId: USER_A, refId: state.a1 }, (e, row) => {
			ok('T4.1 Save updated stateScript in place', row && row.stateScript === 'SCRIPT_V2');
			ok('T4.1 Save updated userNodeCount in place', row && Number(row.userNodeCount) === 5);
			cb(e);
		}),
		(cb) => ap('list')({ userRefId: USER_A }, (e, rows) => {
			ok('T4.1 No history row created by Save (A still 2)', rows.length === 2);
			cb(e);
		}),

		// --- Cross-user isolation: cannot load another user's row ---
		(cb) => ap('loadScript')({ userRefId: USER_A, refId: state.b1 }, (e, row) => {
			ok('T4.2 User A cannot load user B row (null)', row === null);
			cb(e);
		}),

		// --- setLive round-trip ---
		(cb) => ap('setLive')({
			userRefId: USER_A, refId: state.a1,
			liveBoltUri: 'bolt://localhost:7711', liveBoltPassword: 'SECRET_PW',
			liveContainerName: 'usr_x', livePort: 7711, lockToken: 'LOCK_A1',
			lastHeartbeatAt: freshIso,
		}, (e, r) => { ok('T4.4 setLive ok', r && r.live); cb(e); }),
		(cb) => ap('loadScript')({ userRefId: USER_A, refId: state.a1 }, (e, row) => {
			ok('T4.4 setLive round-trips liveBoltUri', row && row.liveBoltUri === 'bolt://localhost:7711');
			ok('T4.4 setLive round-trips liveBoltPassword', row && row.liveBoltPassword === 'SECRET_PW');
			ok('T4.4 setLive round-trips livePort', row && String(row.livePort) === '7711');
			ok('T4.4 setLive round-trips lockToken', row && row.lockToken === 'LOCK_A1');
			ok('T4.4 setLive round-trips lastHeartbeatAt', row && row.lastHeartbeatAt === freshIso);
			cb(e);
		}),

		// --- clearLive empties the transient block, leaves durable intact ---
		(cb) => ap('clearLive')({ userRefId: USER_A, refId: state.a1 }, (e, r) => {
			ok('T4.4 clearLive ok', r && r.cleared); cb(e);
		}),
		(cb) => ap('loadScript')({ userRefId: USER_A, refId: state.a1 }, (e, row) => {
			ok('T4.4 clearLive emptied liveBoltUri', row && (row.liveBoltUri === '' || row.liveBoltUri == null));
			ok('T4.4 clearLive emptied lockToken', row && (row.lockToken === '' || row.lockToken == null));
			ok('T4.4 clearLive preserved durable stateScript', row && row.stateScript === 'SCRIPT_V2');
			cb(e);
		}),

		// --- Reaper: clearStaleLocks clears expired leases, spares fresh ones ---
		(cb) => ap('setLive')({
			userRefId: USER_A, refId: state.a1,
			liveBoltUri: 'bolt://stale', lockToken: 'STALE_LOCK', lastHeartbeatAt: oldIso,
		}, (e) => cb(e)),
		(cb) => ap('setLive')({
			userRefId: USER_A, refId: state.a2,
			liveBoltUri: 'bolt://fresh', lockToken: 'FRESH_LOCK', lastHeartbeatAt: freshIso,
		}, (e) => cb(e)),
		(cb) => ap('clearStaleLocks')({ leaseTtlSeconds: 60 }, (e, r) => {
			ok('T4.4 clearStaleLocks ran', r && r.cleared); cb(e);
		}),
		(cb) => ap('loadScript')({ userRefId: USER_A, refId: state.a1 }, (e, row) => {
			ok('T4.4 Reaper cleared the STALE lease (lockToken emptied)', row && (row.lockToken === '' || row.lockToken == null));
			cb(e);
		}),
		(cb) => ap('loadScript')({ userRefId: USER_A, refId: state.a2 }, (e, row) => {
			ok('T4.4 Reaper spared the FRESH lease (lockToken intact)', row && row.lockToken === 'FRESH_LOCK');
			cb(e);
		}),
	], finish);
});
