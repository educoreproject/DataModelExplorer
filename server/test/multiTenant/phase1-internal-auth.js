'use strict';
// Phase 1 gate — internal write/read mode on the per-user graph executor endpoints
// (dme-user-cypher-query + dme-user-graph-write), driven over HTTP against the running
// educore API server (port 7790). Proves the second auth mode (Option A): a localhost
// call carrying the internal secret is accepted and lands in the right user graph, while
// wrong/missing-secret and proxied-origin calls are refused and the JWT path is unchanged.
//
// Requires: API server up (node startApiServer.js), Docker golden up. Opens a REAL clone
// (slow: quiesces golden + Voyage embedding) and always tears it down.
// Run: node server/test/multiTenant/phase1-internal-auth.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 7790;
const USER = 'tqwhite';
const PASS = 'shairWord!0';

// Read the internal secret from server config at runtime — never hardcode it into the
// (pushable) code repo. Mirrors how the server reads [dmeUserGraphInternalAuth].
const CONFIG_INI = path.resolve(
	__dirname,
	'../../../../configs/instanceSpecific/qbook/startApiServer.ini',
);
const SECRET = (() => {
	const text = fs.readFileSync(CONFIG_INI, 'utf8');
	const m = text.match(/^\s*internalAuthSecret\s*=\s*(.+?)\s*$/m);
	if (!m) { console.error('FATAL: internalAuthSecret not found in', CONFIG_INI); process.exit(1); }
	return m[1];
})();

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);

// httpRequest({ method, path, headers, body, timeout }) -> cb(err, { status, headers, body, raw })
const httpRequest = ({ method, path, headers = {}, body, timeout = 180000 }, cb) => {
	const payload = body !== undefined ? JSON.stringify(body) : undefined;
	const allHeaders = { ...headers };
	if (payload !== undefined) {
		allHeaders['Content-Type'] = 'application/json';
		allHeaders['Content-Length'] = Buffer.byteLength(payload);
	}
	const req = http.request({ host: HOST, port: PORT, method, path, headers: allHeaders }, (res) => {
		let data = '';
		res.on('data', (c) => (data += c));
		res.on('end', () => {
			let parsed;
			try { parsed = JSON.parse(data); } catch (e) { parsed = undefined; }
			cb(null, { status: res.statusCode, headers: res.headers, body: parsed, raw: data });
		});
	});
	req.on('error', (e) => cb(e));
	req.setTimeout(timeout, () => { req.destroy(new Error(`request timeout after ${timeout}ms`)); });
	if (payload !== undefined) { req.write(payload); }
	req.end();
};

const st = {};

const series = (steps, done) => {
	let i = 0;
	const nextStep = (err) => {
		if (err) { done(err); return; }
		if (i >= steps.length) { done(); return; }
		steps[i++](nextStep);
	};
	nextStep();
};

const finish = (err) => {
	const printAndExit = () => {
		if (err) console.error('FLOW ERROR:', err);
		let allPass = !err;
		results.forEach(([n, g]) => { if (!g) allPass = false; console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`); });
		console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL');
		process.exit(allPass ? 0 : 1);
	};
	// Best-effort teardown of the opened version
	if (st.versionRefId && st.token) {
		httpRequest({
			method: 'POST', path: '/api/dme-user-graph-close',
			headers: { Authorization: `Bearer ${st.token}` },
			body: { versionRefId: st.versionRefId },
		}, () => printAndExit());
		return;
	}
	printAndExit();
};

series([
	// T1.4a — standard read endpoint untouched (regression): schema returns 200
	(cb) => httpRequest({ method: 'GET', path: '/api/dme-cypher-query', timeout: 20000 }, (e, r) => {
		ok('T1.4a standard /api/dme-cypher-query schema returns 200', !e && r && r.status === 200);
		cb();
	}),

	// Login (JWT) — needed to open a version and to prove the JWT path
	(cb) => httpRequest({
		method: 'GET',
		path: `/api/login?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`,
		timeout: 20000,
	}, (e, r) => {
		st.token = r && r.headers && r.headers.authtoken;
		let claims = {};
		try { claims = JSON.parse((r && r.headers && r.headers.authclaims) || '{}'); } catch (x) {}
		st.userRefId = claims && claims.user && claims.user.refId;
		ok('login returns a JWT authtoken', !!st.token);
		ok('login authclaims carry userRefId', !!st.userRefId);
		cb(e);
	}),

	// Open a fresh version (JWT path) — provisions a real clone
	(cb) => {
		console.log('opening clone (quiesces golden, may take ~10-30s)...');
		httpRequest({
			method: 'POST', path: '/api/dme-user-graph-open',
			headers: { Authorization: `Bearer ${st.token}` },
			body: { new: true, versionName: '__TEST_phase1_internal_auth' },
			timeout: 180000,
		}, (e, r) => {
			const row = r && r.body && r.body[0];
			st.versionRefId = row && (row.versionRefId || (row.identityMarker && row.identityMarker.versionRefId));
			if (row && row.identityMarker && row.identityMarker.userRefId) {
				st.userRefId = row.identityMarker.userRefId;
			}
			ok('open (JWT) returns a versionRefId', !!st.versionRefId);
			if (!st.versionRefId) console.error('open response:', JSON.stringify(r && r.body));
			cb(e || (st.versionRefId ? '' : 'open failed — cannot continue'));
		});
	},

	// T1.1 — INTERNAL WRITE: correct secret + localhost, NO JWT -> write lands
	(cb) => httpRequest({
		method: 'POST', path: '/api/dme-user-graph-write',
		headers: { 'x-dme-internal-secret': SECRET },
		body: {
			userRefId: st.userRefId, versionRefId: st.versionRefId, action: 'createNode',
			params: { labels: ['Course'], properties: { name: 'Phase1 Internal Node', description: 'created via internal auth' } },
		},
		timeout: 60000,
	}, (e, r) => {
		const row = r && r.body && r.body[0];
		st.userNodeId = row && row.userNodeId;
		ok('T1.1 internal write accepted (status 200)', r && r.status === 200);
		ok('T1.1 internal write returns userNodeId', !!st.userNodeId);
		ok('T1.1 internal write stamped voyage-3 embedding', row && row.embeddingModelVersion === 'voyage-3');
		cb(e);
	}),

	// T1.1 — INTERNAL READ: correct secret + localhost, NO JWT -> reads the same user graph
	(cb) => httpRequest({
		method: 'POST', path: '/api/dme-user-cypher-query',
		headers: { 'x-dme-internal-secret': SECRET },
		body: {
			action: 'query', userRefId: st.userRefId, versionRefId: st.versionRefId,
			query: 'MATCH (n:UserContent {userNodeId:$id}) RETURN n.name AS name, ("UserContent" IN labels(n)) AS isUser',
			params: { id: st.userNodeId },
		},
		timeout: 30000,
	}, (e, r) => {
		const rows = r && r.body;
		const node = Array.isArray(rows) ? rows[0] : undefined;
		ok('T1.1 internal read accepted (status 200)', r && r.status === 200);
		ok('T1.1 internal read finds the node by userNodeId', node && node.name === 'Phase1 Internal Node');
		ok('T1.1 node is :UserContent in the user graph', node && node.isUser === true);
		cb(e);
	}),

	// T1.2a — NO secret, NO JWT -> refused (write endpoint)
	(cb) => httpRequest({
		method: 'POST', path: '/api/dme-user-graph-write',
		body: { userRefId: st.userRefId, versionRefId: st.versionRefId, action: 'createNode', params: { labels: ['X'], properties: { name: 'nope' } } },
		timeout: 20000,
	}, (e, r) => {
		ok('T1.2a write with no secret + no JWT is refused (401)', r && r.status === 401);
		cb();
	}),

	// T1.2b — WRONG secret, NO JWT -> refused (write endpoint)
	(cb) => httpRequest({
		method: 'POST', path: '/api/dme-user-graph-write',
		headers: { 'x-dme-internal-secret': 'WRONG-SECRET' },
		body: { userRefId: st.userRefId, versionRefId: st.versionRefId, action: 'createNode', params: { labels: ['X'], properties: { name: 'nope' } } },
		timeout: 20000,
	}, (e, r) => {
		ok('T1.2b write with wrong secret + no JWT is refused (401)', r && r.status === 401);
		cb();
	}),

	// T1.2c — NO secret, NO JWT -> refused (read endpoint too)
	(cb) => httpRequest({
		method: 'POST', path: '/api/dme-user-cypher-query',
		body: { action: 'query', userRefId: st.userRefId, versionRefId: st.versionRefId, query: 'RETURN 1 AS one' },
		timeout: 20000,
	}, (e, r) => {
		ok('T1.2c read with no secret + no JWT is refused (401)', r && r.status === 401);
		cb();
	}),

	// T1.3 — correct secret BUT proxied origin (X-Forwarded-For), NO JWT -> refused
	(cb) => httpRequest({
		method: 'POST', path: '/api/dme-user-graph-write',
		headers: { 'x-dme-internal-secret': SECRET, 'X-Forwarded-For': '8.8.8.8' },
		body: { userRefId: st.userRefId, versionRefId: st.versionRefId, action: 'createNode', params: { labels: ['X'], properties: { name: 'nope' } } },
		timeout: 20000,
	}, (e, r) => {
		ok('T1.3 write with secret but X-Forwarded-For is refused (401)', r && r.status === 401);
		cb();
	}),

	// T1.4b — JWT path unchanged on the user READ endpoint (no secret, Bearer token)
	(cb) => httpRequest({
		method: 'POST', path: '/api/dme-user-cypher-query',
		headers: { Authorization: `Bearer ${st.token}` },
		body: { action: 'query', versionRefId: st.versionRefId, query: 'MATCH (n:UserContent {userNodeId:$id}) RETURN n.name AS name', params: { id: st.userNodeId } },
		timeout: 30000,
	}, (e, r) => {
		const rows = r && r.body;
		const node = Array.isArray(rows) ? rows[0] : undefined;
		ok('T1.4b JWT read accepted (status 200)', r && r.status === 200);
		ok('T1.4b JWT read returns the node (path unchanged)', node && node.name === 'Phase1 Internal Node');
		cb(e);
	}),

	// T1.4c — JWT path unchanged on the user WRITE endpoint (no secret, Bearer token)
	(cb) => httpRequest({
		method: 'POST', path: '/api/dme-user-graph-write',
		headers: { Authorization: `Bearer ${st.token}` },
		body: { versionRefId: st.versionRefId, action: 'createNode', params: { labels: ['Course'], properties: { name: 'Phase1 JWT Node' } } },
		timeout: 60000,
	}, (e, r) => {
		const row = r && r.body && r.body[0];
		ok('T1.4c JWT write accepted (status 200)', r && r.status === 200);
		ok('T1.4c JWT write returns userNodeId (path unchanged)', row && !!row.userNodeId);
		cb(e);
	}),
], finish);
