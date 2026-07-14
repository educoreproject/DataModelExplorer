#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]
// @concept: [[SecurityFirstPattern]]

// ============================================================================
// oauth-audit.js — the append-only audit writer for the EDUcore AS
// (dmeMcpOAuth Phase 2). Every security-relevant event lands in authAuditLog
// (created Phase 1.3): login_success, login_failed, consent_granted,
// token_issued, token_revoked, client_registered, client_disabled,
// access_revoked, logout, and the DCR rejections.
//
// The table is append-only — enforced at the DB layer by triggers installed in
// oauth-audit-enforce.js (2.6). This writer only ever INSERTs (saveObject with
// no refId -> INSERT). It records WHO/WHAT/WHEN/WHERE but NEVER secrets:
// no passwords, no tokens, no auth codes, no PKCE verifiers.
//
// Contract: module.exports({ sqlDb, tableName })(callback) -> { write }
//   write({ event, sub, username, clientId, ip, detail }, cb?)  fire-and-forget
//   (a cb is optional; audit failure must never break the auth flow, so a
//    missing cb just logs the error and moves on).
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const DEFAULT_TABLE = 'authAuditLog';

// Values that must never be written to the audit log, even if a caller
// mistakenly passes them inside `detail`.
const FORBIDDEN_DETAIL_KEYS = new Set([
	'password',
	'token',
	'access_token',
	'refresh_token',
	'authtoken',
	'code',
	'code_verifier',
	'client_secret',
	'authorization',
	'hash',
]);

const scrubDetail = (detail) => {
	if (!detail || typeof detail !== 'object') {
		return detail;
	}
	const clean = {};
	Object.keys(detail).forEach((key) => {
		if (FORBIDDEN_DETAIL_KEYS.has(key.toLowerCase())) {
			return;
		}
		clean[key] = detail[key];
	});
	return clean;
};

const moduleFunction = ({ sqlDb, tableName = DEFAULT_TABLE } = {}) => (factoryCallback) => {
	const { xLog } = process.global;

	sqlDb.getTable(tableName, (err, tableRef) => {
		if (err) {
			xLog && xLog.error(`[${moduleName}] getTable('${tableName}') failed: ${err}`);
			factoryCallback(err);
			return;
		}

		const write = ({ event, sub, username, clientId, ip, detail } = {}, callback) => {
			const row = {
				event: event || 'unknown',
				sub: sub || '',
				username: username || '',
				clientId: clientId || '',
				ip: ip || '',
				detail: detail ? JSON.stringify(scrubDetail(detail)) : '',
				eventAt: Date.now(),
			};
			// No refId -> the abstraction INSERTs a new row (never an UPDATE).
			tableRef.saveObject(row, { suppressStatementLog: true }, (writeErr) => {
				if (writeErr) {
					xLog && xLog.error(`[${moduleName}] audit write failed (${event}): ${writeErr}`);
				}
				if (typeof callback === 'function') {
					callback(writeErr);
				}
			});
		};

		factoryCallback('', { write });
	});
};

module.exports = moduleFunction;
