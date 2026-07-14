#!/usr/bin/env node
'use strict';
// @concept: [[OidcIdentityProvider]]
// @concept: [[SecurityFirstPattern]]

// ============================================================================
// oauth-keys.js — RS256 signing-key management for the EDUcore AS
// (dmeMcpOAuth Phase 2.1).
//
// The RS256 private key lives in a KEY FILE (JSON JWK), never in an INI —
// per spec §4 ("RS256 keypair in a key FILE") and the C6 hardening. The file
// is generated on first boot (0600) into a directory the Phase-5 deploy
// EXCLUDES from the rsync --delete, so a config push never wipes it. On every
// later boot the same key is loaded, so tokens survive restarts.
//
// Exposes:
//   jwks              -> { keys: [ <private JWK with kid/alg/use> ] } for the
//                        provider's `jwks` config (the provider publishes only
//                        the public half at /oauth/jwks).
//   resolvePublicKey  -> (kid) => a public KeyObject or null, for the strict
//                        MCP verifier (verifyMcpAccessToken) to pin RS256 +
//                        select-by-kid. Overlapping kids (rotation) supported.
//
// Key rotation: additional public JWKs may be retained for verification after
// a new signing key is generated; the newest private key signs, all published
// public keys verify until old tokens expire (overlap by kid).
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// RFC 7638 JWK thumbprint -> a stable, content-derived kid.
const computeKid = (publicJwk) => {
	const ordered = JSON.stringify({
		e: publicJwk.e,
		kty: publicJwk.kty,
		n: publicJwk.n,
	});
	return crypto.createHash('sha256').update(ordered).digest('base64url');
};

const generateKeypairJwk = () => {
	const { privateKey } = crypto.generateKeyPairSync('rsa', {
		modulusLength: 2048,
	});
	const privateJwk = privateKey.export({ format: 'jwk' });
	const kid = computeKid(privateJwk);
	return { ...privateJwk, kid, alg: 'RS256', use: 'sig' };
};

// moduleFunction({ keyFilePath }) -> { jwks, resolvePublicKey, kid }
const moduleFunction = ({ keyFilePath } = {}) => {
	const { xLog } = process.global;

	if (!keyFilePath) {
		throw new Error(`[${moduleName}] keyFilePath is required`);
	}

	let store; // { keys: [ privateJwk, ... ] }

	if (fs.existsSync(keyFilePath)) {
		store = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
		xLog && xLog.status(`[${moduleName}] loaded signing key(s) from ${keyFilePath}`);
	} else {
		const primary = generateKeypairJwk();
		store = { keys: [primary] };
		fs.mkdirSync(path.dirname(keyFilePath), { recursive: true });
		fs.writeFileSync(keyFilePath, JSON.stringify(store, null, 1), { mode: 0o600 });
		// Belt-and-suspenders: enforce 0600 even if the file pre-existed with a
		// looser umask on the directory create.
		fs.chmodSync(keyFilePath, 0o600);
		xLog && xLog.status(`[${moduleName}] generated new RS256 signing key -> ${keyFilePath} (kid ${primary.kid})`);
	}

	const jwks = { keys: store.keys };

	// Build a kid -> public KeyObject map for the strict MCP verifier.
	const publicKeyByKid = {};
	store.keys.forEach((privateJwk) => {
		const publicJwk = {
			kty: privateJwk.kty,
			n: privateJwk.n,
			e: privateJwk.e,
			alg: 'RS256',
			use: 'sig',
			kid: privateJwk.kid,
		};
		publicKeyByKid[privateJwk.kid] = crypto.createPublicKey({
			key: publicJwk,
			format: 'jwk',
		});
	});

	const resolvePublicKey = (kid) => publicKeyByKid[kid] || null;

	const primaryKid = store.keys[0] && store.keys[0].kid;

	return { jwks, resolvePublicKey, kid: primaryKid };
};

module.exports = moduleFunction;
