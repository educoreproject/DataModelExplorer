#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]
// @concept: [[PermissionValidation]]
// @concept: [[SecurityFirstPattern]]

// ============================================================================
// oauth-token-validators.js — strict role validator + audience firewall +
// algorithm-pinned verifiers for the EDUcore OAuth/OIDC surfaces (dmeMcpOAuth).
//
// This module resolves panel criticals C2 (strict validator / audience firewall)
// and C6 (algorithm pinning). It deliberately does NOT modify the app-wide
// getValidator in access-token-header-tools.js (that stays as-is for the existing
// website endpoints); the OAuth/admin surfaces use makeStrictValidator instead.
//
// The strict validator differs from getValidator in three security-relevant ways:
//   1. EXACT role-set membership — no `userRole === 'super'` wildcard bypass.
//   2. Tokenized roles — CSV roles are split and compared as whole tokens, so the
//      `.includes()` substring bug ('superuser' satisfying 'super', 'badminton'
//      satisfying 'admin') cannot happen.
//   3. Audience firewall — a token carrying the MCP audience is rejected outright
//      at an admin/OAuth surface, and (via the pinned verifiers) a website HS256
//      token is rejected by the MCP RS256 gate and vice-versa.
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const jwt = require('jsonwebtoken');

const moduleFunction = () => {
	// ------------------------------------------------------------------
	// makeStrictValidator(permittedRoles) -> (authclaims, options, callback)
	// Same call shape as getValidator so it drops into endpoint registration,
	// but with exact membership, no super wildcard, no substring match, and an
	// optional MCP-audience fence.
	const makeStrictValidator = (permittedRoles = []) => {
		const permitted = permittedRoles.map((r) => String(r).trim());
		return (authclaims, options = {}, callback) => {
			if (typeof options === 'function') {
				callback = options;
				options = {};
			}

			const rawRole =
				authclaims && authclaims.user ? authclaims.user.role : undefined;
			const roles = String(rawRole || '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);

			let err = false;

			// Audience firewall: an MCP-audience token must never satisfy an
			// admin/OAuth validator, regardless of role.
			const mcpAudience = options.mcpAudience;
			const aud = authclaims ? authclaims.aud : undefined;
			const audList = aud === undefined ? [] : [].concat(aud);
			if (mcpAudience && audList.includes(mcpAudience)) {
				err = 'Unauthorized: MCP-audience token rejected at admin/OAuth surface';
			} else {
				// EXACT set membership — no wildcard, no substring.
				const ok = roles.some((r) => permitted.includes(r));
				err = ok ? false : 'Unauthorized access';
			}

			if (typeof callback === 'function') {
				callback(err);
				return;
			}
			return err;
		};
	};

	// ------------------------------------------------------------------
	// verifyWebsiteToken(token, secret) — pins HS256.
	const verifyWebsiteToken = (token, secret) => {
		if (!token || !secret) {
			return { valid: false, reason: 'missing token or secret' };
		}
		let claims;
		try {
			claims = jwt.verify(token, secret, { algorithms: ['HS256'] });
		} catch (err) {
			return { valid: false, reason: `verify failed: ${err.message}` };
		}
		return { valid: true, claims };
	};

	// ------------------------------------------------------------------
	// verifyMcpAccessToken({ token, resolvePublicKey, expectedAudience })
	// Pins RS256, selects the key by `kid`, enforces exact audience. Rejects
	// alg:none, HS256-as-RS256 confusion, unknown kid, and foreign audience.
	// resolvePublicKey(kid) -> a public key (PEM string or KeyObject) or falsy.
	const verifyMcpAccessToken = ({
		token,
		resolvePublicKey,
		expectedAudience,
	} = {}) => {
		if (!token) {
			return { valid: false, reason: 'no token' };
		}
		// MED-2 (Gate-1): the audience fence is MANDATORY, never optional. A caller
		// that forgets expectedAudience must FAIL CLOSED, not silently skip the aud
		// check (jwt.verify only enforces `aud` when `audience` is set). This makes
		// the audience firewall bite in production wiring, not just in the harness.
		if (!expectedAudience) {
			return { valid: false, reason: 'expectedAudience is required (fail-closed)' };
		}
		const decoded = jwt.decode(token, { complete: true });
		if (!decoded || !decoded.header) {
			return { valid: false, reason: 'undecodable token' };
		}
		const { alg, kid } = decoded.header;

		// Reject anything but RS256 up front — kills alg:none and the
		// HS256-signed-with-the-RSA-public-key forgery before verification.
		if (alg !== 'RS256') {
			return { valid: false, reason: `algorithm not RS256 (got ${alg})` };
		}
		if (!kid) {
			return { valid: false, reason: 'no kid in header' };
		}
		const publicKey =
			typeof resolvePublicKey === 'function' ? resolvePublicKey(kid) : null;
		if (!publicKey) {
			return { valid: false, reason: `no public key for kid ${kid}` };
		}

		let claims;
		try {
			claims = jwt.verify(token, publicKey, {
				algorithms: ['RS256'],
				audience: expectedAudience,
			});
		} catch (err) {
			return { valid: false, reason: `verify failed: ${err.message}` };
		}
		return { valid: true, claims };
	};

	return { makeStrictValidator, verifyWebsiteToken, verifyMcpAccessToken };
};

module.exports = moduleFunction;
