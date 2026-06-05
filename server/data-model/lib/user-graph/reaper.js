'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SessionLifecycle]]
// @concept: [[Reaper]]
//
// reaper.js — orphan GC (doc 07). A session that dies without Close leaves a container
// + clone dir + a stale lease (lastHeartbeatAt no longer advancing). The reaper finds
// rows where now - lastHeartbeatAt > leaseTTL that still hold a live container, tears
// them down (releaseUserGraph semantics: container + clone dir), then clears the lease.
// The durable stateScript is UNTOUCHED — nothing authored-and-saved is lost; only
// unsaved in-session work (already non-durable by policy) disappears.
//
// The lease is refreshed by ACTIVITY (each user query/write stamps lastHeartbeatAt) and
// by the browser's periodic heartbeat ping; when the browser is gone the stamp goes
// stale and this reaper reclaims the resources.

const cloneManager = require('./clone-manager');

const VERSIONS_TABLE = 'graph_state_versions';
const DEFAULT_LEASE_TTL_SECONDS = 900;
const DEFAULT_REAP_INTERVAL_MS = 120000; // 2 min — production interval is an 08 concern

// reapStaleSessions({ sqlDb, dataMapping, leaseTtlSeconds }, callback(err, { reaped }))
const reapStaleSessions = ({ sqlDb, dataMapping, leaseTtlSeconds }, callback) => {
	const cb = typeof callback === 'function' ? callback : () => {};
	const ttl = typeof leaseTtlSeconds === 'number' ? leaseTtlSeconds : DEFAULT_LEASE_TTL_SECONDS;
	const cutoff = new Date(Date.now() - ttl * 1000).toISOString();

	sqlDb.getTable(VERSIONS_TABLE, (tErr, tableRef) => {
		if (tErr || !tableRef) { cb(tErr || 'reaper: no versions table'); return; }

		const findQuery = dataMapping['graph-state-version'].getSql('findStaleLive', { cutoff });
		tableRef.getData(findQuery, { suppressStatementLog: true, noTableNameOk: true }, (gErr, rows = []) => {
			if (gErr) { cb(gErr); return; }

			const stale = Array.isArray(rows) ? rows : [];
			let idx = 0;
			const reaped = [];

			const tearNext = () => {
				if (idx >= stale.length) {
					// Clear the lease on every expired row (covers container-less rows too).
					const clearQuery = dataMapping['graph-state-version'].getSql('clearStaleLocks', { cutoff });
					tableRef.runStatement(clearQuery, { suppressStatementLog: true }, (cErr) => {
						cb(cErr || '', { reaped, cutoff });
					});
					return;
				}
				const row = stale[idx++];
				const cloneDir = cloneManager.cloneDirFor(row.userRefId, row.refId);
				cloneManager.teardownClone({ containerName: row.liveContainerName, cloneDir }, () => {
					reaped.push({ versionRefId: row.refId, containerName: row.liveContainerName });
					tearNext();
				});
			};

			tearNext();
		});
	});
};

// startReaperDaemon — periodic reaper (ops). Returns a stop() handle.
const startReaperDaemon = ({ sqlDb, dataMapping, leaseTtlSeconds, intervalMs }) => {
	const { xLog } = process.global;
	const every = intervalMs || DEFAULT_REAP_INTERVAL_MS;
	const tick = () => {
		reapStaleSessions({ sqlDb, dataMapping, leaseTtlSeconds }, (err, result) => {
			if (err) { if (xLog) xLog.error(`[reaper] ${err}`); return; }
			if (result && result.reaped && result.reaped.length && xLog) {
				xLog.status(`[reaper] reclaimed ${result.reaped.length} abandoned session(s)`);
			}
		});
	};
	const handle = setInterval(tick, every);
	if (handle.unref) handle.unref();
	return { stop: () => clearInterval(handle) };
};

module.exports = {
	reapStaleSessions,
	startReaperDaemon,
	DEFAULT_LEASE_TTL_SECONDS,
};
