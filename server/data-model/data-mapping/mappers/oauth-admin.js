#!/usr/bin/env node
'use strict';
// @concept: [[MapperPattern]]
// @concept: [[OidcIdentityProvider]]

// ============================================================================
// oauth-admin.js (mapper) — named SQL for the Phase-4 admin & audit surface
// (dmeMcpOAuth 4.1). Reads the oidc-provider records that live in the generic
// one-table adapter store (oauthAdapterStore: model='Grant' / model='Client',
// JSON payloads) and the append-only authAuditLog.
//
// getSql only — payload JSON parsing/shaping happens in the access point
// (oauth-admin), which is the business-logic layer. All user-supplied filter
// values pass through safeSql (sqlstring-sqlite escaping); the LIMIT is a
// clamped integer inlined by the mapper (never user text). eventAt is TEXT
// (Date.now() stored as a string by the educore abstraction) so it is CAST to
// INTEGER for correct ordering/range comparison.
//
// Factory shape matches the other mappers: module.exports = fn({moduleName});
// data-mapping.js then calls it with { baseMappingProcess, safeSql, ... }.
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = ({ moduleName }) => ({ baseMappingProcess, safeSql } = {}) => {
	const { xLog } = process.global;

	// Identity map — the store columns come back as-is; shaping is done in the
	// access point from the parsed payload, so the mapper transform is a passthrough.
	const map = (inObj) => inObj;

	const getSql = (queryName, replaceObject = {}) => {
		if (queryName === 'grantsAll') {
			// Every Grant row; the access point filters by payload.accountId/clientId.
			return `SELECT refId, id, payload, expiresAt FROM <!tableName!> WHERE model = 'Grant'`;
		}

		if (queryName === 'clientsAll') {
			return `SELECT refId, id, payload FROM <!tableName!> WHERE model = 'Client'`;
		}

		if (queryName === 'auditFiltered') {
			// Conditionally assemble the WHERE so no token is ever left unfilled;
			// safeSql escapes the present values. sinceMs/untilMs are pre-coerced
			// to Number by the access point (unquoted numeric literals). limit is
			// a clamped integer inlined here — never a user string.
			const { event, userRef, clientId, sinceMs, untilMs, limit } = replaceObject;
			let where = 'WHERE 1=1';
			const values = {};
			if (event) { where += ' AND event = <!event!>'; values.event = event; }
			if (userRef) { where += ' AND sub = <!userRef!>'; values.userRef = userRef; }
			if (clientId) { where += ' AND clientId = <!clientId!>'; values.clientId = clientId; }
			if (sinceMs !== undefined && sinceMs !== null && sinceMs !== '') {
				where += ' AND CAST(eventAt AS INTEGER) >= <!sinceMs!>'; values.sinceMs = Number(sinceMs);
			}
			if (untilMs !== undefined && untilMs !== null && untilMs !== '') {
				where += ' AND CAST(eventAt AS INTEGER) <= <!untilMs!>'; values.untilMs = Number(untilMs);
			}
			const limitN = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
			const template =
				`SELECT event, sub, username, clientId, ip, detail, eventAt ` +
				`FROM <!tableName!> ${where} ORDER BY CAST(eventAt AS INTEGER) DESC LIMIT ${limitN}`;
			return safeSql(template, values);
		}

		xLog && xLog.error(`[${moduleName} mapper] unknown query name '${queryName}'`);
		return undefined;
	};

	return { map, getSql };
};

module.exports = moduleFunction({ moduleName });
