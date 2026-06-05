'use strict';
// Phase 5 gate (functional) — a User-mode conversation builds the user's model. Drives the
// REAL askMilo engine exactly as ws-graphinator does in User mode (authoring prompt,
// standards suppressed, session context: versionRefId+apiBase as command input, secret in
// env), then verifies via the graph that the node + standard link landed, survives Save,
// and is reconstructed on reopen. Makes ONE real LLM call (askMilo tool-use).
//
// Requires API server up (:7790, Phase 5 code) + Docker golden + network (Anthropic+Voyage).
// Run (cwd = server): node test/multiTenant/phase5-conversation.js

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 7790;
const API_BASE = `http://127.0.0.1:${PORT}`;
const EDU_CFG = '/Users/tqwhite/Documents/webdev/educore/system/configs/instanceSpecific/qbook';
const CONFIG_INI = path.join(EDU_CFG, 'startApiServer.ini');
const SECRET = (() => {
	const m = fs.readFileSync(CONFIG_INI, 'utf8').match(/^\s*internalAuthSecret\s*=\s*(.+?)\s*$/m);
	return m ? m[1] : '__NO_SECRET__';
})();

const PROMPT = "Build my model: create a node named 'Intro to Algebra' with the label Course and a short description. Then find the CEDS standard element named 'Course' (query for its uri) and link my new node to that CEDS element with an ALIGNS_WITH relationship. Confirm what you created.";

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);
const st = {};

const httpRequest = ({ method, path: p, headers = {}, body, timeout = 180000 }, cb) => {
	const payload = body !== undefined ? JSON.stringify(body) : undefined;
	const h = { ...headers };
	if (payload !== undefined) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(payload); }
	const req = http.request({ host: HOST, port: PORT, method, path: p, headers: h }, (res) => {
		let d = ''; res.on('data', (c) => (d += c));
		res.on('end', () => { let j; try { j = JSON.parse(d); } catch (e) {} cb(null, { status: res.statusCode, headers: res.headers, body: j, raw: d }); });
	});
	req.on('error', (e) => cb(e));
	req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
	if (payload !== undefined) req.write(payload);
	req.end();
};

const login = (user, pass, cb) => httpRequest({ method: 'GET', path: `/api/login?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`, timeout: 20000 }, (e, r) => {
	if (e) { cb(e); return; }
	cb(null, { token: r.headers && r.headers.authtoken });
});

// Query the user's graph over the internal read path (secret), deriving owner server-side.
const userQuery = (versionRefId, query, cb) => httpRequest({
	method: 'POST', path: '/api/dme-user-cypher-query', headers: { 'x-dme-internal-secret': SECRET },
	body: { action: 'query', versionRefId, query }, timeout: 30000,
}, (e, r) => cb(e, r && r.body));

const runAskMilo = (versionRefId, prompt, cb) => {
	const input = JSON.stringify({
		switches: {},
		values: {
			configPath: [EDU_CFG],
			expandModel: ['claude-sonnet-4-6'],
			agentModel: ['claude-sonnet-4-6'],
			perspectives: ['0'],
			singleCallPromptName: ['DmeUserAuthoring'],
			aiToolsSuppressed: ['DataModelExplorer,SifSearch,WebSearch,WebFetch'],
			dmeVersionRefId: [versionRefId],
			dmeApiBase: [API_BASE],
		},
		fileList: [prompt],
	});
	const child = spawn('askMilo', [], { shell: true, env: { ...process.env, DME_INTERNAL_SECRET: SECRET } });
	let out = ''; let err = '';
	child.stdout.on('data', (c) => (out += c.toString()));
	child.stderr.on('data', (c) => (err += c.toString()));
	child.on('close', (code) => cb(code, out, err));
	child.on('error', (e) => cb(1, out, `${err}\nspawn error: ${e.message}`));
	child.stdin.write(input); child.stdin.end();
};

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

const NODE_Q = "MATCH (n:UserContent) WHERE toLower(n.name) CONTAINS 'algebra' OPTIONAL MATCH (n)-[r]->(s) WHERE s.uri IS NOT NULL RETURN n.name AS name, n.userNodeId AS id, type(r) AS rel, s.uri AS targetUri, s.name AS targetName";

series([
	(cb) => login('tqwhite', 'shairWord!0', (e, r) => { if (e) { cb(e); return; } st.token = r.token; ok('login', !!st.token); cb(); }),
	(cb) => { console.log('opening clone...'); httpRequest({ method: 'POST', path: '/api/dme-user-graph-open', headers: { Authorization: `Bearer ${st.token}` }, body: { new: true, versionName: '__TEST_phase5_conversation' }, timeout: 180000 }, (e, r) => { const row = r && r.body && r.body[0]; st.versionRefId = row && row.versionRefId; ok('open version', !!st.versionRefId); cb(e || (st.versionRefId ? '' : 'open failed')); }); },

	// --- T5.1a: the conversation builds the model (one real askMilo tool-use run) ---
	(cb) => { console.log('running askMilo (User mode, real LLM tool-use; may take ~30-90s)...'); runAskMilo(st.versionRefId, PROMPT, (code, out, err) => {
		ok('T5.1 askMilo run completed (exit 0)', code === 0);
		if (code !== 0) console.error('askMilo stderr tail:', err.slice(-600));
		cb();
	}); },
	(cb) => userQuery(st.versionRefId, NODE_Q, (e, rows) => {
		const row = Array.isArray(rows) ? rows.find((x) => x && x.id) : null;
		st.userNodeId = row && row.id;
		ok('T5.1 a :UserContent node was created from the conversation', !!st.userNodeId);
		ok('T5.1 the node was linked to a standard element (by uri)', !!(row && row.targetUri));
		if (row) console.log(`   created: "${row.name}" -[${row.rel}]-> ${row.targetName || ''} (${row.targetUri || 'no link'})`);
		cb();
	}),

	// --- T5.1b: Save, then close + reopen -> the version is reconstructed (replay) ---
	(cb) => httpRequest({ method: 'POST', path: '/api/dme-user-graph-save', headers: { Authorization: `Bearer ${st.token}` }, body: { versionRefId: st.versionRefId }, timeout: 60000 }, (e, r) => {
		ok('T5.1 Save succeeded', r && (r.status === 200));
		cb();
	}),
	(cb) => httpRequest({ method: 'POST', path: '/api/dme-user-graph-close', headers: { Authorization: `Bearer ${st.token}` }, body: { versionRefId: st.versionRefId }, timeout: 60000 }, () => cb()),
	(cb) => { console.log('reopening version (fresh clone + replay)...'); httpRequest({ method: 'POST', path: '/api/dme-user-graph-open', headers: { Authorization: `Bearer ${st.token}` }, body: { versionRefId: st.versionRefId }, timeout: 180000 }, (e, r) => {
		const row = r && r.body && r.body[0]; const reopened = row && row.versionRefId;
		ok('T5.1 reopen succeeded', !!reopened); cb(e || (reopened ? '' : 'reopen failed'));
	}); },
	(cb) => userQuery(st.versionRefId, NODE_Q, (e, rows) => {
		const row = Array.isArray(rows) ? rows.find((x) => x && x.id) : null;
		ok('T5.1 node reconstructed after reopen (replay)', !!(row && row.id));
		ok('T5.1 standard link reconstructed after reopen', !!(row && row.targetUri));
		cb();
	}),
], finish);
