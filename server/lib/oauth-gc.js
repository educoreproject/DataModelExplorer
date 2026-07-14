#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]
// @concept: [[SqliteAbstraction]]

// ============================================================================
// oauth-gc.js — housekeeping garbage collector for the OAuth store
// (dmeMcpOAuth Phase 2.6). Two sweeps:
//
//   1. Expired-row GC: every oidc-provider model row carries an expiresAt
//      (epoch ms; 0 == never). Any row with 0 < expiresAt < now is dead weight
//      (the adapter already treats it as absent) and is deleted.
//   2. Stale DCR-client sweep: registered clients (model 'Client') never expire
//      on their own. A client older than dcrClientTtlMs that has NO live
//      (non-expired) token/grant/session referencing it is abandoned and is
//      deleted. Live clients are never touched.
//
// Runnable once (runOnce) or on an interval (startDaemon). Non-fatal: a sweep
// error is logged and the daemon keeps going.
//
// Contract: module.exports({ sqlDb, tableName, dcrClientTtlMs })(callback)
//   -> callback(err, { runOnce, startDaemon })
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const DEFAULT_TABLE = 'oauthAdapterStore';
const DEFAULT_DCR_CLIENT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const moduleFunction = ({
	sqlDb,
	tableName = DEFAULT_TABLE,
	dcrClientTtlMs = DEFAULT_DCR_CLIENT_TTL_MS,
} = {}) => (factoryCallback) => {
	const { xLog } = process.global;

	sqlDb.getTable(tableName, (err, tableRef) => {
		if (err) {
			xLog && xLog.error(`[${moduleName}] getTable('${tableName}') failed: ${err}`);
			factoryCallback(err);
			return;
		}

		const readOptions = { suppressStatementLog: true, noTableNameOk: true };
		const writeOptions = { suppressStatementLog: true };
		const esc = (v) => String(v).replace(/'/g, "''");

		const run = (sql) => new Promise((resolve, reject) => {
			tableRef.runStatement(sql, writeOptions, (e) => (e ? reject(e) : resolve()));
		});
		const query = (sql) => new Promise((resolve, reject) => {
			tableRef.getData(sql, readOptions, (e, rows) => (e ? reject(e) : resolve(rows || [])));
		});

		// Sweep 1: expired rows.
		const gcExpired = () => {
			const now = Date.now();
			return query(`SELECT COUNT(*) AS n FROM <!tableName!> WHERE expiresAt > 0 AND CAST(expiresAt AS INTEGER) < ${now};`)
				.then((rows) => {
					const n = Number(rows[0] && rows[0].n) || 0;
					if (n === 0) {
						return 0;
					}
					return run(`DELETE FROM <!tableName!> WHERE expiresAt > 0 AND CAST(expiresAt AS INTEGER) < ${now};`).then(() => n);
				});
		};

		// Sweep 2: stale DCR clients (no live token/grant/session referencing them).
		const gcStaleClients = () => {
			const cutoff = Date.now() - dcrClientTtlMs;
			// Client rows have expiresAt 0; use createdAt (abstraction timestamp).
			return query(`SELECT id, refId, createdAt FROM <!tableName!> WHERE model='Client';`)
				.then((clients) => {
					// Keep only clients older than the cutoff.
					const candidates = clients.filter((c) => {
						const created = Date.parse(c.createdAt);
						return created && created < cutoff;
					});
					if (candidates.length === 0) {
						return 0;
					}
					const now = Date.now();
					// A client is live if any non-expired row's payload references its id.
					const isReferenced = (clientId) =>
						query(
							`SELECT COUNT(*) AS n FROM <!tableName!> WHERE model!='Client' ` +
							`AND (expiresAt=0 OR CAST(expiresAt AS INTEGER) >= ${now}) ` +
							`AND payload LIKE '%"clientId":"${esc(clientId)}"%';`,
						).then((rows) => (Number(rows[0] && rows[0].n) || 0) > 0);

					let removed = 0;
					return candidates.reduce(
						(chain, client) =>
							chain
								.then(() => isReferenced(client.id))
								.then((referenced) => {
									if (referenced) {
										return undefined;
									}
									removed += 1;
									return run(`DELETE FROM <!tableName!> WHERE refId='${esc(client.refId)}';`);
								}),
						Promise.resolve(),
					).then(() => removed);
				});
		};

		const runOnce = (cb) => {
			Promise.resolve()
				.then(() => gcExpired())
				.then((expiredRemoved) =>
					gcStaleClients().then((staleClients) => ({ expiredRemoved, staleClients })),
				)
				.then((result) => {
					xLog && xLog.status(`[${moduleName}] GC: removed ${result.expiredRemoved} expired rows, ${result.staleClients} stale clients`);
					if (typeof cb === 'function') {
						cb('', result);
					}
				})
				.catch((sweepErr) => {
					xLog && xLog.error(`[${moduleName}] GC sweep error: ${sweepErr}`);
					if (typeof cb === 'function') {
						cb(sweepErr);
					}
				});
		};

		const startDaemon = (intervalMs = 60 * 60 * 1000) => {
			const timer = setInterval(() => runOnce(), intervalMs);
			if (timer.unref) {
				timer.unref(); // never keep the process alive for GC alone
			}
			return timer;
		};

		factoryCallback('', { runOnce, startDaemon });
	});
};

module.exports = moduleFunction;
