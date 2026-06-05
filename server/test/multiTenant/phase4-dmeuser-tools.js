'use strict';
// Phase 4 gate — the two askMilo tool providers (dme-user-read, dme-user-write) POST to
// the executor over the internal-auth path. Runs the REAL CLI scripts via execFile (as the
// toolHandler would), with the session context in env. Also tests the two load-bearing
// controls the parent flagged: (C1) dme-user-graph-list is strictly JWT-scoped; (C2) the
// JWT path cannot fetch another user's version by id (getById is internal-only).
//
// Requires the API server up (:7790, Phase 4 code) + Docker golden. Opens a real clone,
// tears it down. Run (cwd = server): node test/multiTenant/phase4-dmeuser-tools.js

const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 7790;
const API_BASE = `http://127.0.0.1:${PORT}`;
const STANDARD_URI = 'https://w3id.org/CEDStandards/terms/C000000'; // a real CEDS element uri

const READ_TOOL = path.resolve(__dirname, '../../../cli/lib.d/dme-user-read/dmeUserReadTool.js');
const WRITE_TOOL = path.resolve(__dirname, '../../../cli/lib.d/dme-user-write/dmeUserWriteTool.js');

const CONFIG_INI = path.resolve(__dirname, '../../../../configs/instanceSpecific/qbook/startApiServer.ini');
const SECRET = (() => {
	const m = fs.readFileSync(CONFIG_INI, 'utf8').match(/^\s*internalAuthSecret\s*=\s*(.+?)\s*$/m);
	return m ? m[1] : '__NO_SECRET__';
})();

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);
const st = {};

const httpRequest = ({ method, path: p, headers = {}, body, timeout = 180000 }, cb) => {
	const payload = body !== undefined ? JSON.stringify(body) : undefined;
	const h = { ...headers };
	if (payload !== undefined) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(payload); }
	const req = http.request({ host: HOST, port: PORT, method, path: p, headers: h }, (res) => {
		let data = ''; res.on('data', (c) => (data += c));
		res.on('end', () => { let j; try { j = JSON.parse(data); } catch (e) {} cb(null, { status: res.statusCode, headers: res.headers, body: j, raw: data }); });
	});
	req.on('error', (e) => cb(e));
	req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
	if (payload !== undefined) req.write(payload);
	req.end();
};

// Run a CLI tool the way the askMilo toolHandler would (execFile + env), return {code,out,err}
const runTool = (scriptPath, argv, sessionEnv, cb) => {
	const env = { ...process.env, ...sessionEnv };
	execFile('node', [scriptPath, ...argv], { env, timeout: 60000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
		cb({ code: err ? (err.code || 1) : 0, out: stdout || '', err: stderr || '' });
	});
};

const userEnv = () => ({ DME_API_BASE: API_BASE, DME_INTERNAL_SECRET: SECRET, DME_VERSION_REF_ID: st.versionRefId });
const parseRows = (out) => { try { return JSON.parse(out); } catch (e) { return null; } };

const series = (steps, done) => { let i = 0; const n = (e) => { if (e) { done(e); return; } if (i >= steps.length) { done(); return; } steps[i++](n); }; n(); };

const finish = (err) => {
	const out = () => {
		if (err) console.error('FLOW ERROR:', err);
		let allPass = !err;
		results.forEach(([n, g]) => { if (!g) allPass = false; console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`); });
		console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL');
		process.exit(allPass ? 0 : 1);
	};
	if (st.versionRefId && st.token) {
		httpRequest({ method: 'POST', path: '/api/dme-user-graph-close', headers: { Authorization: `Bearer ${st.token}` }, body: { versionRefId: st.versionRefId } }, () => out());
		return;
	}
	out();
};

const login = (user, pass, cb) => httpRequest({
	method: 'GET', path: `/api/login?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`, timeout: 20000,
}, (e, r) => {
	if (e) { cb(e); return; }
	let claims = {}; try { claims = JSON.parse((r.headers && r.headers.authclaims) || '{}'); } catch (x) {}
	cb(null, { token: r.headers && r.headers.authtoken, userRefId: claims && claims.user && claims.user.refId });
});

series([
	// --- T4.5: no versionRefId -> clear error, no call ---
	(cb) => runTool(READ_TOOL, ['-query', '--query=RETURN 1 AS one'], { DME_API_BASE: API_BASE, DME_INTERNAL_SECRET: SECRET }, (r) => {
		ok('T4.5 read tool with no versionRefId errors (non-zero exit)', r.code !== 0);
		ok('T4.5 read tool error mentions the missing version', /version/i.test(r.err));
		cb();
	}),
	(cb) => runTool(WRITE_TOOL, ['-createNode', '--name=Nope'], { DME_API_BASE: API_BASE, DME_INTERNAL_SECRET: SECRET }, (r) => {
		ok('T4.5 write tool with no versionRefId errors (non-zero exit)', r.code !== 0);
		cb();
	}),

	// --- setup: login + open a version (tqwhite) ---
	(cb) => login('tqwhite', 'shairWord!0', (e, r) => { if (e) { cb(e); return; } st.token = r.token; st.userRefId = r.userRefId; ok('login tqwhite', !!st.token); cb(); }),
	(cb) => { console.log('opening clone (quiesces golden)...'); httpRequest({ method: 'POST', path: '/api/dme-user-graph-open', headers: { Authorization: `Bearer ${st.token}` }, body: { new: true, versionName: '__TEST_phase4_tools' }, timeout: 180000 }, (e, r) => {
		const row = r && r.body && r.body[0]; st.versionRefId = row && row.versionRefId;
		ok('open version (JWT)', !!st.versionRefId); cb(e || (st.versionRefId ? '' : 'open failed'));
	}); },

	// --- T4.1: read query returns rows from the user's graph ---
	(cb) => runTool(READ_TOOL, ['-query', '--query=MATCH (n) RETURN count(n) AS c'], userEnv(), (r) => {
		const rows = parseRows(r.out); const c = rows && rows[0] && Number(rows[0].c);
		ok('T4.1 read tool query succeeds (exit 0)', r.code === 0);
		ok('T4.1 read tool returns rows (golden node count > 0)', c > 0);
		cb();
	}),

	// --- T4.2: createNode stamps :UserContent + userNodeId + voyage-3 embedding ---
	(cb) => runTool(WRITE_TOOL, ['-createNode', '--name=Intro to Algebra', '--labels=Course', '--description=A first course in algebra'], userEnv(), (r) => {
		const rows = parseRows(r.out); const row = rows && rows[0]; st.userNodeId = row && row.userNodeId;
		ok('T4.2 createNode succeeds (exit 0)', r.code === 0);
		ok('T4.2 createNode returns userNodeId', !!st.userNodeId);
		ok('T4.2 createNode stamped voyage-3 embedding', row && row.embeddingModelVersion === 'voyage-3');
		cb();
	}),
	(cb) => runTool(READ_TOOL, ['-query', `--query=MATCH (n:UserContent {userNodeId:'${st.userNodeId}'}) RETURN n.name AS name, ('UserContent' IN labels(n)) AS isUser, ('Course' IN labels(n)) AS isCourse`], userEnv(), (r) => {
		const row = (parseRows(r.out) || [])[0];
		ok('T4.2 node readable as :UserContent in the user graph', row && row.isUser === true);
		ok('T4.2 node keeps name + label', row && row.name === 'Intro to Algebra' && row.isCourse === true);
		cb();
	}),

	// --- T4.3: connect to a standard by uri; non-existent uri -> clear error ---
	(cb) => runTool(WRITE_TOOL, ['-connectToStandard', `--userNodeId=${st.userNodeId}`, '--relType=ALIGNS_WITH', `--standardUri=${STANDARD_URI}`], userEnv(), (r) => {
		const row = (parseRows(r.out) || [])[0];
		ok('T4.3 connectToStandard succeeds (exit 0)', r.code === 0);
		ok('T4.3 relationship resolved the standard by uri', row && row.targetKey === STANDARD_URI);
		cb();
	}),
	(cb) => runTool(READ_TOOL, ['-query', `--query=MATCH (u:UserContent {userNodeId:'${st.userNodeId}'})-[:ALIGNS_WITH]->(s) RETURN s.uri AS uri`], userEnv(), (r) => {
		const row = (parseRows(r.out) || [])[0];
		ok('T4.3 relationship lands on the right standard uri', row && row.uri === STANDARD_URI);
		cb();
	}),
	(cb) => runTool(WRITE_TOOL, ['-connectToStandard', `--userNodeId=${st.userNodeId}`, '--relType=ALIGNS_WITH', '--standardUri=urn:bogus:does-not-exist'], userEnv(), (r) => {
		ok('T4.3 connecting to a non-existent uri errors (non-zero exit)', r.code !== 0);
		cb();
	}),

	// --- T4.4: modifying a golden node is refused (direct executor POST — the tool itself
	// cannot even target golden, since modify/delete select by userNodeId only) ---
	(cb) => httpRequest({ method: 'POST', path: '/api/dme-user-graph-write', headers: { 'x-dme-internal-secret': SECRET }, body: { versionRefId: st.versionRefId, action: 'modifyNode', params: { selector: { uri: STANDARD_URI }, properties: { hacked: true } } }, timeout: 30000 }, (e, r) => {
		ok('T4.4 modifying a golden node is refused (executor 401)', r && r.status === 401);
		ok('T4.4 refusal is the additive-only guard', r && /additive-only/i.test(r.raw || ''));
		cb();
	}),

	// --- C1 (parent control): dme-user-graph-list is strictly JWT-scoped ---
	(cb) => httpRequest({ method: 'GET', path: '/api/dme-user-graph-list', headers: { Authorization: `Bearer ${st.token}` }, timeout: 20000 }, (e, r) => {
		const mine = Array.isArray(r.body) ? r.body.map((v) => v.refId) : [];
		ok('C1 owner sees own version in list', mine.indexOf(st.versionRefId) !== -1);
		cb();
	}),
	(cb) => login('debbiedo', 'shairWord!0', (e, r) => { if (e) { cb(e); return; } st.otherToken = r.token; ok('login debbiedo (second user)', !!st.otherToken); cb(); }),
	(cb) => httpRequest({ method: 'GET', path: '/api/dme-user-graph-list', headers: { Authorization: `Bearer ${st.otherToken}` }, timeout: 20000 }, (e, r) => {
		const theirs = Array.isArray(r.body) ? r.body.map((v) => v.refId) : [];
		ok("C1 another user's list does NOT contain the owner's versionRefId", theirs.indexOf(st.versionRefId) === -1);
		cb();
	}),

	// --- C2 (parent control): the JWT path cannot fetch another user's version by id
	// (getByIdForUser is scoped; getById is internal-only) ---
	(cb) => httpRequest({ method: 'POST', path: '/api/dme-user-cypher-query', headers: { Authorization: `Bearer ${st.otherToken}` }, body: { action: 'query', versionRefId: st.versionRefId, query: 'RETURN 1 AS one' }, timeout: 20000 }, (e, r) => {
		ok("C2 JWT user cannot reach another user's version by id (refused)", r && r.status === 401);
		cb();
	}),
], finish);
