'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SecurityFirstPattern]]
// @concept: [[UserGraphSeam]]
//
// dme-internal-auth.js — the SECOND auth mode for the per-user graph executor endpoints
// (dme-user-cypher-query, dme-user-graph-write). Option A (parent ruling, 2026-06-05):
// a server-ONLY internal secret + a hard localhost-origin check lets a trusted server
// subprocess (askMilo, spawned by ws-graphinator) read/write a user's isolated graph
// WITHOUT the browser's rolling JWT — which is never shared with askMilo (sharing it
// would desync the refresh and break the user's other login-protected tools).
//
// An internal call is honored ONLY when ALL of these hold:
//   1. the request carries the internal-secret header matching the server config secret,
//   2. the socket peer is loopback (127.0.0.1 / ::1), AND
//   3. no forwarding header is present (x-forwarded-for / x-forwarded-host / x-real-ip /
//      forwarded) — a request proxied in from outside through nginx carries one; a genuine
//      server-internal localhost call does not. (nginx is also configured to strip the
//      secret header — defense in depth — but the auth decision does NOT rely on that.)
// When honored, the caller-asserted userRefId + versionRefId are trusted, because the
// trusted server chain (ws-graphinator knows the authenticated userRefId) established
// them. Otherwise internal=false and the endpoint uses the existing JWT path, unchanged.

const INTERNAL_SECRET_HEADER = 'x-dme-internal-secret';

const FORWARDING_HEADERS = [
	'x-forwarded-for',
	'x-forwarded-host',
	'x-real-ip',
	'forwarded',
];

// A loopback peer address. Express/Node may report IPv4-mapped IPv6 (::ffff:127.0.0.1).
const isLoopbackAddress = (addr) => {
	if (!addr) {
		return false;
	}
	const bare = addr.replace(/^::ffff:/, '');
	return bare === '127.0.0.1' || bare === '::1';
};

const hasForwardingHeader = (headers) =>
	FORWARDING_HEADERS.some((name) => headers && headers[name] !== undefined);

// resolveInternalAuth({ xReq, configuredSecret }) -> { internal: boolean, reason: string }
// Pure decision function. The endpoint sources the asserted identity itself once this
// returns internal:true (it reads userRefId/versionRefId from the request body/query).
const resolveInternalAuth = ({ xReq, configuredSecret } = {}) => {
	const headers = (xReq && xReq.headers) || {};
	const presented = headers[INTERNAL_SECRET_HEADER];

	if (!presented) {
		return { internal: false, reason: 'no internal-secret header (JWT path)' };
	}
	if (!configuredSecret) {
		return {
			internal: false,
			reason: 'internal mode disabled (no secret configured)',
		};
	}
	if (presented !== configuredSecret) {
		return { internal: false, reason: 'internal-secret mismatch' };
	}
	// The secret matched — the origin MUST also be loopback and unproxied.
	const peer = (xReq.socket && xReq.socket.remoteAddress) || xReq.ip || '';
	if (!isLoopbackAddress(peer)) {
		return { internal: false, reason: `non-loopback origin (${peer})` };
	}
	if (hasForwardingHeader(headers)) {
		return { internal: false, reason: 'forwarding header present (proxied origin)' };
	}
	return { internal: true, reason: 'internal secret + loopback origin' };
};

module.exports = {
	resolveInternalAuth,
	isLoopbackAddress,
	INTERNAL_SECRET_HEADER,
};
