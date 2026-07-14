#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[OidcIdentityProvider]]

// ============================================================================
// oauth-mcp-verifier.js — the audience-BOUND MCP token verifier seam
// (dmeMcpOAuth Phase 2, MED-1 / MED-2 carry-forward).
//
// Gate-1 found the audience fence was OPT-IN: verifyMcpAccessToken skipped the
// aud check when expectedAudience was undefined, and the strict validator's
// fence only fired when a caller remembered to pass mcpAudience. "Green in the
// harness, absent in the wiring." This module removes the chance of forgetting:
//
//   - expectedAudience and resolvePublicKey are REQUIRED at CONSTRUCTION; the
//     factory THROWS if either is missing. A gate cannot be wired without an
//     audience — the omission fails loudly at boot, not silently at runtime.
//   - The returned verifyBearer() ALWAYS passes the bound audience to the
//     algorithm-pinned verifyMcpAccessToken (RS256 + kid + exact aud).
//
// Phase 3's /mcp bearer gate COMPOSES this with the per-request revocation
// checks (user.disabled, iat >= accessRevokedAfter). This module owns exactly
// one job — prove the token is a genuine, unexpired, correctly-audienced RS256
// access token minted by THIS AS — and it cannot be bypassed by omission.
//
// Contract: module.exports({ resolvePublicKey, expectedAudience, verifyMcpAccessToken })
//   -> { verifyBearer }
//   verifyBearer(authorizationHeader) -> { valid, claims?, reason? }
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = ({ resolvePublicKey, expectedAudience, verifyMcpAccessToken } = {}) => {
	// FAIL LOUDLY at wiring time — this is the whole point of MED-1.
	if (typeof resolvePublicKey !== 'function') {
		throw new Error(`[${moduleName}] resolvePublicKey (function) is required — refusing to build an unverifiable gate`);
	}
	if (!expectedAudience) {
		throw new Error(`[${moduleName}] expectedAudience is required — refusing to build a gate with no audience fence`);
	}
	if (typeof verifyMcpAccessToken !== 'function') {
		throw new Error(`[${moduleName}] verifyMcpAccessToken (function) is required`);
	}

	const extractBearer = (authorizationHeader) => {
		if (!authorizationHeader || typeof authorizationHeader !== 'string') {
			return null;
		}
		const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
		return match ? match[1].trim() : null;
	};

	// The bound audience is ALWAYS supplied — a caller of verifyBearer cannot
	// omit it, so the fence always bites.
	const verifyBearer = (authorizationHeader) => {
		const token = extractBearer(authorizationHeader);
		if (!token) {
			return { valid: false, reason: 'no bearer token' };
		}
		return verifyMcpAccessToken({ token, resolvePublicKey, expectedAudience });
	};

	return { verifyBearer, expectedAudience };
};

module.exports = moduleFunction;
