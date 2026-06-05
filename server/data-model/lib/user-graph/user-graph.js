'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[UserGraphSeam]]
//
// user-graph.js — the single stable seam for acquiring and releasing a usable
// user graph (design doc 03). Callers know only getUserGraph / releaseUserGraph;
// everything below — clone, identity injection, replay, and later the warm-pool
// fast path — grows behind this interface with no caller change.
//
// THIS FILE IS THE STUB (Phase 3): no graph / docker / neo4j / file creation.
//   - graphConnection = the standard DME connection from dataModelExplorerSearch.ini
//   - containerName   = null
//   - lockToken       = a soft-lock held in an in-memory registry
//   - identityMarker  = returned as DATA (nothing is injected into any graph)
// Phase 5 replaces buildGraphConnection + getUserGraph's body with a real
// per-user isolated clone (its own container + bolt URI/password + marker node),
// and releaseUserGraph gains real teardown. The return CONTRACT never changes.

const qt = require('qtools-functional-library');
const makeRefId = require('../../../lib/make-ref-id');
const { pipeRunner, taskListPlus } = new require(
	'qtools-asynchronous-pipe-plus',
)();

// In-memory soft-lock registry (stub). Phase 6 moves the lease to SQL
// (graph_state_versions) with a periodically-stamped lastHeartbeatAt and a reaper.
const liveLocks = new Map(); // key `${userRefId}::${versionRefId}` -> lockToken

const lockKey = (userRefId, versionRefId) =>
	`${userRefId}::${versionRefId || ''}`;

// ---------------------------------------------------------------------------
// buildGraphConnection — resolve the user graph's bolt connection.
//
// STUB: the standard DME connection (every stub user graph IS the shared graph).
// Phase 5 returns the live per-user clone's bolt URI + password instead. Exposed
// so the askMilo wiring (ws-graphinator) and getUserGraph share one resolver.
const buildGraphConnection = () => {
	const { getConfig } = process.global;
	const cfg = getConfig('dataModelExplorerSearch') || {};
	if (!cfg.neo4jBoltUri) {
		return null;
	}
	return {
		boltUri: cfg.neo4jBoltUri,
		user: cfg.neo4jUser,
		password: cfg.neo4jPassword,
	};
};

// ---------------------------------------------------------------------------
// getUserGraph({ userRefId, versionRefId, sqlDb, dataMapping }, callback)
//   -> callback(err, UserGraphHandle)
//
// UserGraphHandle = {
//   versionRefId,
//   graphConnection: { boltUri, user, password },   // load-bearing; server-only secret
//   containerName: string | null,                   // null at the stub
//   lockToken,
//   identityMarker: { userRefId, username, versionRefId, versionName },
// }
const getUserGraph = (
	{ userRefId, versionRefId, username, sqlDb, dataMapping } = {},
	callback,
) => {
	const taskList = new taskListPlus();

	// STAGE 1: resolve username. The caller (the endpoint) already holds the
	// authoritative value in the JWT claims (sourced from the user's profile record),
	// so when it is supplied we use it directly. The profile_user lookup is the
	// alternative path for internal callers that have only userRefId. Either way the
	// stub degrades to '' rather than failing.
	taskList.push((args, next) => {
		if (username) {
			next('', { ...args, username });
			return;
		}

		const mapper = dataMapping && dataMapping['profile-user'];
		if (!sqlDb || !mapper) {
			next('', { ...args, username: '' });
			return;
		}

		sqlDb.getTable('profile_user', (err, tableRef) => {
			if (err || !tableRef) {
				next('', { ...args, username: '' });
				return;
			}

			const query = mapper.getSql('all');
			tableRef.getData(
				query,
				{ suppressStatementLog: true, noTableNameOk: true },
				(getErr, rows) => {
					if (getErr || !Array.isArray(rows)) {
						next('', { ...args, username: '' });
						return;
					}
					const row = rows.qtGetByProperty('refId', userRefId);
					next('', { ...args, username: row ? row.username || '' : '' });
				},
			);
		});
	});

	// STAGE 2: assemble the handle + acquire the soft-lock.
	taskList.push((args, next) => {
		const graphConnection = buildGraphConnection();
		if (!graphConnection) {
			next(
				'getUserGraph: no dataModelExplorerSearch connection configured',
				args,
			);
			return;
		}

		const lockToken = makeRefId(16);
		liveLocks.set(lockKey(userRefId, versionRefId), lockToken);

		const handle = {
			versionRefId: versionRefId || '',
			graphConnection,
			containerName: null, // stub: no container exists yet
			lockToken,
			identityMarker: {
				userRefId: userRefId || '',
				username: args.username,
				versionRefId: versionRefId || '',
				// STUB: the version store (graph_state_versions) arrives in Phase 4,
				// which resolves the real versionName. Derived placeholder until then.
				versionName: versionRefId
					? `version ${versionRefId}`
					: '(new version)',
			},
		};

		next('', { ...args, handle });
	});

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(err);
			return;
		}
		callback('', args.handle);
	});
};

// ---------------------------------------------------------------------------
// releaseUserGraph(handle, callback) -> callback(err, { released, lockWasHeld })
//
// STUB: free the soft-lock. Phase 5 adds container stop+remove and clone-dir
// deletion here. Teardown never persists (Save is the durable path).
const releaseUserGraph = (handle, callback) => {
	const cb = typeof callback === 'function' ? callback : () => {};

	if (!handle || !handle.identityMarker) {
		cb('releaseUserGraph: invalid handle');
		return;
	}

	const { userRefId, versionRefId } = handle.identityMarker;
	const key = lockKey(userRefId, versionRefId);
	const lockWasHeld =
		liveLocks.has(key) && liveLocks.get(key) === handle.lockToken;
	liveLocks.delete(key);

	cb('', { released: true, lockWasHeld });
};

// Test/inspection helper — is a soft-lock currently held for this user/version?
const isLockHeld = (userRefId, versionRefId) =>
	liveLocks.has(lockKey(userRefId, versionRefId));

module.exports = {
	getUserGraph,
	releaseUserGraph,
	buildGraphConnection,
	isLockHeld,
};
