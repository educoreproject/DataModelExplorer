#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[OidcIdentityProvider]]

// ============================================================================
// oauth-bearer-gate.js — the OAuth bearer half of the /mcp resource gate
// (dmeMcpOAuth Phase 3.1).
//
// mcp-server.js COMPOSES this with the existing loopback-secret path: a request
// is allowed if EITHER the loopback gate OR this bearer check passes. This
// module owns ONLY the bearer side:
//
//   1. verifyBearer            — the audience-BOUND verifier exported by
//                                oauth-server.js (RS256 + kid + exp + exact
//                                aud; the MED-1 seam — audience cannot be
//                                omitted).
//   2. users row (by sub)      — user exists, user.disabled is falsy
//                                (TEXT-coerced per LOW-3), and
//                                iat >= user.accessRevokedAfter.
//   3. Grant row (by gid claim)— MUST exist in oauthAdapterStore
//                                (model='Grant', id=gid), payload.revoked
//                                falsy, and iat >= grant
//                                payload.accessRevokedAfter. jwt-format access
//                                tokens are NEVER persisted (oidc-provider
//                                formats/jwt.js yields no payload to upsert),
//                                so the gid claim — added to extraTokenClaims
//                                in oauth-provider.js per spec §4 — is the
//                                only bridge from a bearer token to its grant.
//                                A destroyed Grant row (grant destroy,
//                                refresh-reuse family kill) therefore cuts
//                                instantly; tokens without gid fail closed.
//
// UNITS: accessRevokedAfter (users column AND grant payload field) is epoch
// SECONDS — the same units as JWT iat. Both arrive as TEXT from the educore
// sqlite abstraction and are Number()-coerced before comparison (the Phase-0
// lesson). Pass condition is the spec's iat >= max(user, grant cutoff).
//
// The oauth context (verifyBearer, sqlDb, audit, resourceMetadataUrl) is read
// LAZILY per request via getOauthContext() — oauth-server.js mounts AFTER
// mcp-server.js in startApiServer's pipeline and stashes its exports on
// expressApp.set('oauthServer'). When the AS is absent (disabled by config),
// every bearer check fails closed and only the loopback path can admit.
//
// Contract: module.exports({ getOauthContext }) -> { checkBearer, rejectWith }
//   checkBearer(xReq, callback) -> callback(rejectReason, { mcpAuth })
//     mcpAuth = { mode:'oauth', sub, username, role, clientId, jti }
//     (role/username come from the FRESH users row, not the token — a role
//      change bites on the next request, not at next token mint.)
//   rejectWith(xRes) -> sends the 401 with
//     WWW-Authenticate: Bearer resource_metadata="<...>/.well-known/oauth-protected-resource"
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

// Escape a value for inline SQL (single-quote doubling) — same defense-in-depth
// convention as oauth-adapter.js; inputs are token claims, never free text.
const esc = (value) => String(value).replace(/'/g, "''");

// LOW-3: `disabled` is a TEXT column written ''/absent for not-disabled.
// Anything other than empty/'0'/'false' counts as disabled.
const isDisabled = (rawValue) => {
	const text = String(rawValue == null ? '' : rawValue).trim().toLowerCase();
	return text !== '' && text !== '0' && text !== 'false';
};

const moduleFunction = ({ getOauthContext } = {}) => {
	const { xLog } = process.global;

	if (typeof getOauthContext !== 'function') {
		throw new Error(`[${moduleName}] getOauthContext (function) is required`);
	}

	// tableRefs are acquired once on first use and closed over thereafter.
	const tableRefCache = {};
	const getTableRef = (sqlDb, tableName, callback) => {
		if (tableRefCache[tableName]) {
			callback('', tableRefCache[tableName]);
			return;
		}
		sqlDb.getTable(tableName, (err, tableRef) => {
			if (err) {
				callback(err);
				return;
			}
			tableRefCache[tableName] = tableRef;
			callback('', tableRef);
		});
	};

	const readOptions = { suppressStatementLog: true, noTableNameOk: true };

	// ------------------------------------------------------------------
	// checkBearer — the per-request verification pipeline.
	const checkBearer = (xReq, callback) => {
		const oauthContext = getOauthContext();
		if (!oauthContext || typeof oauthContext.verifyBearer !== 'function') {
			callback('authorization server not mounted — bearer path closed');
			return;
		}
		const { verifyBearer, sqlDb } = oauthContext;
		if (!sqlDb) {
			callback('oauth context has no sqlDb — bearer path closed');
			return;
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// signature + alg(RS256) + kid + exp + exact aud — the MED-1 bound verifier.
		taskList.push((args, next) => {
			const verdict = verifyBearer(xReq.headers && xReq.headers.authorization);
			if (!verdict || verdict.valid !== true) {
				next(`invalid bearer token: ${(verdict && verdict.reason) || 'unknown'}`, args);
				return;
			}
			const claims = verdict.claims || {};
			if (!claims.sub || !claims.jti) {
				next('token lacks sub/jti claims', args);
				return;
			}
			if (!claims.gid) {
				next('token carries no grant (fail closed)', args);
				return;
			}
			next('', { ...args, claims, grantId: String(claims.gid), tokenIat: Number(claims.iat || 0) });
		});

		// --------------------------------------------------------------------------------
		// users row: exists, not disabled, iat >= user.accessRevokedAfter.
		taskList.push((args, next) => getTableRef(sqlDb, 'users', mergeArgs(args, next, 'userTable')));

		taskList.push((args, next) => {
			const { userTable, claims, tokenIat } = args;
			const localCallback = (err, rows) => {
				if (err) {
					next(`users lookup failed: ${err}`, args);
					return;
				}
				const userRow = rows && rows[0];
				if (!userRow) {
					next('unknown user (sub not in users table)', args);
					return;
				}
				if (isDisabled(userRow.disabled)) {
					next('user disabled', args);
					return;
				}
				const userCutoff = Number(userRow.accessRevokedAfter || 0);
				if (userCutoff && tokenIat < userCutoff) {
					next('user access revoked (token issued before cutoff)', args);
					return;
				}
				next('', { ...args, userRow });
			};
			userTable.getData(
				`SELECT refId, username, role, disabled, accessRevokedAfter FROM <!tableName!> WHERE refId='${esc(claims.sub)}' LIMIT 1;`,
				readOptions,
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// Grant row (by the token's gid claim): exists, not revoked,
		// iat >= grant.accessRevokedAfter. A missing row = grant destroyed = revoked.
		taskList.push((args, next) =>
			getTableRef(sqlDb, 'oauthAdapterStore', mergeArgs(args, next, 'adapterTable')),
		);

		taskList.push((args, next) => {
			const { adapterTable, grantId, tokenIat } = args;
			const localCallback = (err, rows) => {
				if (err) {
					next(`grant lookup failed: ${err}`, args);
					return;
				}
				const grantRecord = rows && rows[0];
				if (!grantRecord) {
					next('grant revoked (no Grant record)', args);
					return;
				}
				let grantPayload = {};
				try {
					grantPayload = JSON.parse(grantRecord.payload || '{}');
				} catch (parseErr) {
					next('grant record unreadable', args);
					return;
				}
				if (grantPayload.revoked) {
					next('grant revoked (marked by admin)', args);
					return;
				}
				const grantCutoff = Number(grantPayload.accessRevokedAfter || 0);
				if (grantCutoff && tokenIat < grantCutoff) {
					next('grant access revoked (token issued before cutoff)', args);
					return;
				}
				next('', args);
			};
			adapterTable.getData(
				`SELECT payload FROM <!tableName!> WHERE model='Grant' AND id='${esc(grantId)}' LIMIT 1;`,
				readOptions,
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) {
				callback(err.toString ? err.toString() : String(err));
				return;
			}
			const { claims, userRow, grantId } = args;
			callback('', {
				mcpAuth: {
					mode: 'oauth',
					sub: claims.sub,
					username: userRow.username || claims.username || '',
					role: userRow.role || '',
					clientId: claims.client_id || '',
					jti: claims.jti,
					grantId,
				},
			});
		});
	};

	// ------------------------------------------------------------------
	// rejectWith — the RFC 9728 401. resource_metadata points the client at the
	// protected-resource discovery doc so it can find the authorization server.
	const rejectWith = (xRes) => {
		const oauthContext = getOauthContext();
		const resourceMetadataUrl = oauthContext && oauthContext.resourceMetadataUrl;
		const headerValue = resourceMetadataUrl
			? `Bearer resource_metadata="${resourceMetadataUrl}"`
			: 'Bearer';
		xRes.set('WWW-Authenticate', headerValue);
		xRes.status(401).send('unauthorized');
	};

	return { checkBearer, rejectWith };
};

module.exports = moduleFunction;
