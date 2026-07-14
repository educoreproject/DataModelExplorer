#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[OidcIdentityProvider]]

// ============================================================================
// oauth-dcr-guard.js — the front-door guard for Dynamic Client Registration
// (dmeMcpOAuth Phase 2.4). Anonymous DCR (/oauth/register) is a spam/abuse
// surface, so BEFORE the provider ever processes a registration we enforce:
//
//   1. Per-IP rate limiting (a sliding window; excess -> 429).
//   2. A registration-time redirect-URI ALLOWLIST. Every requested
//      redirect_uri must be either the exact Claude MCP callback or a
//      port-agnostic loopback URI; anything else -> 400 invalid_redirect_uri.
//      This is the primary defense against a rogue client registering an
//      attacker-controlled redirect to steal authorization codes.
//
// A passing request calls next() and falls through to the provider's DCR
// handler (which persists the Client, giving admin visibility via the adapter
// store). Accept/reject are audited.
//
// Contract: module.exports({ audit, allowlist, rateLimit })
//   -> (req, res, next)   an Express middleware to mount on POST /oauth/register
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const DEFAULT_ALLOW_EXACT = ['https://claude.ai/api/mcp/auth_callback'];
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// A redirect_uri is allowed if it is an exact allowlisted URI, or a loopback
// URI (http/https, host localhost/127.0.0.1/::1, ANY port, any path).
const makeRedirectValidator = (exactList) => (uri) => {
	if (exactList.includes(uri)) {
		return true;
	}
	let parsed;
	try {
		parsed = new URL(uri);
	} catch (e) {
		return false;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return false;
	}
	return LOOPBACK_HOSTS.has(parsed.hostname);
};

const moduleFunction = ({
	audit,
	allowlist = DEFAULT_ALLOW_EXACT,
	rateLimit = {},
} = {}) => {
	const { xLog } = process.global;
	const maxPerWindow = rateLimit.maxPerWindow || 10;
	const windowMs = rateLimit.windowMs || 60 * 60 * 1000; // 1 hour
	const isAllowedRedirect = makeRedirectValidator(allowlist);

	// ip -> [timestamps] sliding window
	const hits = new Map();
	const clientIp = (req) =>
		(req.ip ||
			(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
			(req.socket && req.socket.remoteAddress) ||
			'').toString();

	const rateLimited = (ip) => {
		const now = Date.now();
		const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
		list.push(now);
		hits.set(ip, list);
		return list.length > maxPerWindow;
	};

	const reject = (res, status, error, description) => {
		res.setHeader('Cache-Control', 'no-store');
		res.status(status).setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify({ error, error_description: description }));
	};

	return (req, res, next) => {
		const ip = clientIp(req);

		if (rateLimited(ip)) {
			audit && audit.write({ event: 'dcr_rejected', ip, detail: { reason: 'rate_limited' } });
			xLog && xLog.error(`[${moduleName}] DCR rate-limited ip=${ip}`);
			reject(res, 429, 'temporarily_unavailable', 'Too many registration requests. Try again later.');
			return;
		}

		const body = req.body || {};
		const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];

		// A public MCP client MUST supply at least one redirect_uri, and every
		// one must pass the allowlist.
		if (redirectUris.length === 0) {
			audit && audit.write({ event: 'dcr_rejected', ip, detail: { reason: 'no_redirect_uris' } });
			reject(res, 400, 'invalid_redirect_uri', 'At least one redirect_uri is required.');
			return;
		}

		const bad = redirectUris.filter((uri) => !isAllowedRedirect(uri));
		if (bad.length > 0) {
			audit && audit.write({ event: 'dcr_rejected', ip, detail: { reason: 'redirect_not_allowlisted', bad } });
			xLog && xLog.error(`[${moduleName}] DCR rejected disallowed redirect_uri(s): ${bad.join(', ')}`);
			reject(res, 400, 'invalid_redirect_uri', `redirect_uri not allowed: ${bad.join(', ')}`);
			return;
		}

		audit && audit.write({ event: 'client_registered', ip, detail: { client_name: body.client_name, redirect_uris: redirectUris } });
		next();
	};
};

module.exports = moduleFunction;
module.exports.makeRedirectValidator = makeRedirectValidator;
