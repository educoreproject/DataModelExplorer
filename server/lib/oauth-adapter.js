#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]
// @concept: [[SqliteAbstraction]]

// ============================================================================
// oauth-adapter.js — the node-oidc-provider persistence adapter for EDUcore
// (dmeMcpOAuth Phase 2.1). Productionizes the Phase-0.2 spike, proven 7/7
// against the REAL educore sqlite abstraction.
//
// ONE generic table (`oauthAdapterStore`) backs ALL ~13 oidc-provider model
// kinds (AccessToken, RefreshToken, AuthorizationCode, Grant, Session,
// Interaction, Client, etc.), keyed refId = "<model>:<id>". Columns:
//   model, id, payload (JSON string), grantId, userCode, uid, expiresAt.
//
// TWO abstraction facts, both learned the hard way in the spike, are honored:
//   1. Every column is stored TEXT — numeric fields come back as strings, so
//      `expiresAt` MUST be Number()-coerced before any comparison (a raw "0"
//      is truthy and breaks a naive expiry guard).
//   2. saveObject persists only scalar fields — the structured payload MUST be
//      JSON-stringified (and JSON.parse'd on the way out).
//
// The adapter methods return Promises with the callback sqlDb INSIDE — the
// sanctioned, bounded callback->Promise bridge (planReview M6) that satisfies
// oidc-provider's async adapter contract while honoring the no-async/await
// idiom. There is no `async`/`await` keyword anywhere in this file.
//
// Contract: module.exports = ({ sqlDb, tableName })(callback)
//   -> callback(err, { Adapter })   where Adapter is the class oidc-provider
//                                    instantiates as `new Adapter(modelName)`.
// The table is acquired ONCE here and closed over, so per-op getTable() noise
// (and its repeated table-init log line) never recurs.
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const DEFAULT_TABLE = 'oauthAdapterStore';

// The domain columns this adapter reads/writes. The educore abstraction only
// materializes a column on its FIRST WRITE, so on a freshly-created store the
// very first find() — e.g. an unknown-client authorize doing Client.find —
// would hit `no such column: payload` and 500. We therefore PRAGMA-check and
// ALTER these in at init, so reads never precede the columns' existence.
const DOMAIN_COLUMNS = ['model', 'id', 'payload', 'grantId', 'userCode', 'uid', 'expiresAt'];

const moduleFunction = ({ sqlDb, tableName = DEFAULT_TABLE } = {}) => (callback) => {
	const { xLog } = process.global;

	// Escape a value for inline SQL (single-quote doubling). Inputs are
	// system-generated ids/uids/grant-ids, never user free-text, but we escape
	// as defense in depth regardless.
	const esc = (value) => String(value).replace(/'/g, "''");

	// Acquire the backing table ONCE; the Adapter class closes over tableRef.
	sqlDb.getTable(tableName, (err, tableRef) => {
		if (err) {
			xLog && xLog.error(`[${moduleName}] getTable('${tableName}') failed: ${err}`);
			callback(err);
			return;
		}

		const readOptions = { suppressStatementLog: true, noTableNameOk: true };
		const writeOptions = { suppressStatementLog: true };

		// Materialize the domain columns before any read can reference them
		// (PRAGMA-checked, idempotent — mirrors oauth-schema-init's user-column add).
		const ensureColumns = (done) => {
			tableRef.getData(
				`PRAGMA table_info(<!tableName!>);`,
				{ suppressStatementLog: true },
				(pragmaErr, rows = []) => {
					if (pragmaErr) { done(pragmaErr); return; }
					const existing = rows.map((r) => String(r.name).toLowerCase());
					const missing = DOMAIN_COLUMNS.filter((c) => !existing.includes(c.toLowerCase()));
					if (missing.length === 0) { done(); return; }
					const statements = missing
						.map((name) => `ALTER TABLE <!tableName!> ADD COLUMN [${name}] TEXT;`)
						.join('\n');
					tableRef.runStatement(statements, writeOptions, (alterErr) => {
						if (alterErr) { done(alterErr); return; }
						xLog && xLog.status(`[${moduleName}] materialized adapter columns: ${missing.join(', ')}`);
						done();
					});
				},
			);
		};

		class Adapter {
			constructor(name) {
				this.name = name;
			}

			key(id) {
				return `${this.name}:${id}`;
			}

			// upsert(id, payload, expiresIn) -> Promise<void>
			upsert(id, payload, expiresIn) {
				return new Promise((resolve, reject) => {
					const row = {
						refId: this.key(id),
						model: this.name,
						id: String(id),
						payload: JSON.stringify(payload),
						grantId: payload.grantId ? String(payload.grantId) : '',
						userCode: payload.userCode ? String(payload.userCode) : '',
						uid: payload.uid ? String(payload.uid) : '',
						expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : 0,
					};
					tableRef.saveObject(row, writeOptions, (saveErr) =>
						saveErr ? reject(saveErr) : resolve(),
					);
				});
			}

			// _findByColumn(column, value) -> Promise<payload | undefined>
			// A single expiry guard lives here so find/findByUid/findByUserCode all
			// honor it. expiresAt is TEXT in the DB -> Number()-coerce before compare.
			_findByColumn(column, value) {
				return new Promise((resolve, reject) => {
					const query =
						`SELECT payload, expiresAt FROM <!tableName!> ` +
						`WHERE model='${esc(this.name)}' AND ${column}='${esc(value)}' LIMIT 1;`;
					tableRef.getData(query, readOptions, (findErr, rows) => {
						if (findErr) {
							reject(findErr);
							return;
						}
						const record = rows && rows[0];
						if (!record) {
							resolve(undefined);
							return;
						}
						const expiresAt = Number(record.expiresAt);
						if (expiresAt && expiresAt < Date.now()) {
							resolve(undefined);
							return;
						}
						resolve(JSON.parse(record.payload));
					});
				});
			}

			find(id) {
				return this._findByColumn('id', id);
			}

			findByUid(uid) {
				return this._findByColumn('uid', uid);
			}

			findByUserCode(userCode) {
				return this._findByColumn('userCode', userCode);
			}

			// consume(id) -> Promise<void>: mark the payload consumed (in epoch
			// seconds, per the oidc-provider contract). This is what powers
			// authorization-code single-use and refresh-token reuse detection.
			consume(id) {
				return this.find(id).then((payload) => {
					if (!payload) {
						return undefined;
					}
					payload.consumed = Math.floor(Date.now() / 1000);
					return this.upsert(id, payload, undefined).then(() => undefined);
				});
			}

			// destroy(id) -> Promise<void>: remove the single row.
			destroy(id) {
				return new Promise((resolve, reject) => {
					tableRef.runStatement(
						`DELETE FROM <!tableName!> WHERE refId='${esc(this.key(id))}';`,
						writeOptions,
						(delErr) => (delErr ? reject(delErr) : resolve()),
					);
				});
			}

			// revokeByGrantId(grantId) -> Promise<void>: kill the whole grant
			// family (all tokens sharing grantId). This is the mechanism behind
			// admin revocation and refresh-reuse family revocation.
			revokeByGrantId(grantId) {
				return new Promise((resolve, reject) => {
					tableRef.runStatement(
						`DELETE FROM <!tableName!> WHERE grantId='${esc(grantId)}';`,
						writeOptions,
						(delErr) => (delErr ? reject(delErr) : resolve()),
					);
				});
			}
		}

		ensureColumns((ensureErr) => {
			if (ensureErr) {
				xLog && xLog.error(`[${moduleName}] failed to materialize adapter columns: ${ensureErr}`);
				callback(ensureErr);
				return;
			}
			callback('', { Adapter, tableRef });
		});
	});
};

module.exports = moduleFunction;
