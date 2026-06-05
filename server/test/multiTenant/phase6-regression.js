'use strict';
// Phase 6 gate — end-to-end round-trip + regression sweep (T6.1/T6.2). Proves the whole
// conversational loop's MECHANICS deterministically (the LLM conversational round-trip is
// covered live by phase5-conversation.js), that the old paths still work alongside the new
// ones, and the Option-A token-untouched property: a user write goes over the internal
// secret path and never touches the browser's JWT.
//
// Requires API server up (:7790, full build) + Docker golden. Run (cwd = server):
//   node test/multiTenant/phase6-regression.js

const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 7790;
const API_BASE = `http://127.0.0.1:${PORT}`;
const WRITE_TOOL = path.resolve(__dirname, '../../../cli/lib.d/dme-user-write/dmeUserWriteTool.js');
const READ_TOOL = path.resolve(__dirname, '../../../cli/lib.d/dme-user-read/dmeUserReadTool.js');
const DME_TOOL_DIR = path.resolve(__dirname, '../../../cli/lib.d/data-model-explorer');
const EDU_CFG = '/Users/tqwhite/Documents/webdev/educore/system/configs/instanceSpecific/qbook';
const CLI_CFG = '/Users/tqwhite/tq_usr_bin/qbookSuperTool/system/configs/instanceSpecific/qbook';
const SECRET = (() => {
	const m = fs.readFileSync(path.join(EDU_CFG, 'startApiServer.ini'), 'utf8').match(/^\s*internalAuthSecret\s*=\s*(.+?)\s*$/m);
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
		let d = ''; res.on('data', (c) => (d += c));
		res.on('end', () => { let j; try { j = JSON.parse(d); } catch (e) {} cb(null, { status: res.statusCode, headers: res.headers, body: j, raw: d }); });
	});
	req.on('error', (e) => cb(e));
	req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
	if (payload !== undefined) req.write(payload);
	req.end();
};

const runNode = (scriptPath, argv, env, cwd, cb) => execFile('node', [scriptPath, ...argv], { env: { ...process.env, ...env }, cwd, timeout: 90000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => cb({ code: err ? (err.code || 1) : 0, out: stdout || '', err: stderr || '' }));
const userEnv = () => ({ DME_API_BASE: API_BASE, DME_INTERNAL_SECRET: SECRET, DME_VERSION_REF_ID: st.versionRefId });
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const series = (steps, done) => { let i = 0; const n = (e) => { if (e) { done(e); return; } if (i >= steps.length) { done(); return; } steps[i++](n); }; n(); };
const finish = (err) => {
	const out = () => { if (err) console.error('FLOW ERROR:', err); let allPass = !err; results.forEach(([n, g]) => { if (!g) allPass = false; console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`); }); console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL'); process.exit(allPass ? 0 : 1); };
	if (st.versionRefId && st.token) { httpRequest({ method: 'POST', path: '/api/dme-user-graph-close', headers: { Authorization: `Bearer ${st.token}` }, body: { versionRefId: st.versionRefId } }, () => out()); return; }
	out();
};
const listVersions = (token, cb) => httpRequest({ method: 'GET', path: '/api/dme-user-graph-list', headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }, cb);

series([
	(cb) => httpRequest({ method: 'GET', path: `/api/login?username=tqwhite&password=${encodeURIComponent('shairWord!0')}`, timeout: 20000 }, (e, r) => { st.token = r && r.headers && r.headers.authtoken; ok('login', !!st.token); cb(e); }),

	// token-untouched (pre): the browser JWT works before any user write
	(cb) => listVersions(st.token, (e, r) => { ok('T6.2 token valid before write (list 200)', r && r.status === 200); cb(); }),

	(cb) => { console.log('opening clone...'); httpRequest({ method: 'POST', path: '/api/dme-user-graph-open', headers: { Authorization: `Bearer ${st.token}` }, body: { new: true, versionName: '__TEST_phase6_regression' }, timeout: 180000 }, (e, r) => { const row = r && r.body && r.body[0]; st.versionRefId = row && row.versionRefId; ok('open version', !!st.versionRefId); cb(e || (st.versionRefId ? '' : 'open failed')); }); },

	// --- T6.1: round-trip mechanics (deterministic, via tools): build -> save -> close -> reopen -> verify ---
	(cb) => runNode(WRITE_TOOL, ['-createNode', '--name=Phase6 Roundtrip Node', '--labels=Course'], userEnv(), undefined, (r) => { const row = (parse(r.out) || [])[0]; st.userNodeId = row && row.userNodeId; ok('T6.1 build: createNode (exit 0 + userNodeId)', r.code === 0 && !!st.userNodeId); cb(); }),
	(cb) => httpRequest({ method: 'POST', path: '/api/dme-user-graph-save', headers: { Authorization: `Bearer ${st.token}` }, body: { versionRefId: st.versionRefId }, timeout: 60000 }, (e, r) => { ok('T6.1 save (200)', r && r.status === 200); cb(); }),
	(cb) => httpRequest({ method: 'POST', path: '/api/dme-user-graph-close', headers: { Authorization: `Bearer ${st.token}` }, body: { versionRefId: st.versionRefId }, timeout: 60000 }, () => cb()),
	(cb) => { console.log('reopening (fresh clone + replay)...'); httpRequest({ method: 'POST', path: '/api/dme-user-graph-open', headers: { Authorization: `Bearer ${st.token}` }, body: { versionRefId: st.versionRefId }, timeout: 180000 }, (e, r) => { const row = r && r.body && r.body[0]; ok('T6.1 reopen (200)', !!(row && row.versionRefId)); cb(e); }); },
	(cb) => runNode(READ_TOOL, ['-query', `--query=MATCH (n:UserContent {userNodeId:'${st.userNodeId}'}) RETURN n.name AS name`], userEnv(), undefined, (r) => { const row = (parse(r.out) || [])[0]; ok('T6.1 node reconstructed after reopen', row && row.name === 'Phase6 Roundtrip Node'); cb(); }),

	// --- T6.2: coexistence / regression of the old paths ---
	(cb) => httpRequest({ method: 'GET', path: '/api/dme-cypher-query', timeout: 20000 }, (e, r) => { ok('T6.2 standard /api/dme-cypher-query schema 200', r && r.status === 200); cb(); }),
	(cb) => httpRequest({ method: 'POST', path: '/api/dme-cypher-query', body: { action: 'query', query: 'MATCH (n) RETURN count(n) AS c' }, timeout: 20000 }, (e, r) => { const c = r && r.body && r.body[0] && Number(r.body[0].c); ok('T6.2 standard read query returns rows', c > 0); cb(); }),
	(cb) => httpRequest({ method: 'POST', path: '/api/dme-cypher-query', body: { action: 'query', query: 'CREATE (n:__TEST_Foo) RETURN n' }, timeout: 20000 }, (e, r) => { ok('T6.2 standard endpoint still rejects writes (read-only intact)', r && r.status !== 200); cb(); }),
	(cb) => runNode(path.join(DME_TOOL_DIR, 'dataModelExplorerSearch.js'), ['-search', 'course'], {}, DME_TOOL_DIR, (r) => { ok('T6.2 existing data-model-explorer read tool still works', r.code === 0 && r.out.trim().length > 0); cb(); }),

	// --- T6.2: token-untouched (post) — the user write above used the internal secret, not the JWT ---
	(cb) => listVersions(st.token, (e, r) => { ok('T6.2 SAME browser JWT still valid after a user write (token untouched)', r && r.status === 200); cb(); }),

	// --- T6.2: CLI askMilo path unaffected (no user tools; standards present) ---
	(cb) => { const input = JSON.stringify({ switches: { getDefaults: true }, values: { configPath: [CLI_CFG] }, fileList: [] }); execFile('bash', ['-lc', `echo '${input}' | askMilo`], { timeout: 60000, maxBuffer: 1024 * 1024 }, (err, stdout) => { const j = parse((stdout || '').trim()) || {}; const t = j.availableTools || []; ok('T6.2 CLI askMilo runs (getDefaults)', t.length > 0); ok('T6.2 CLI does NOT offer the user tools', t.indexOf('DmeUserRead') === -1 && t.indexOf('DmeUserWrite') === -1); ok('T6.2 CLI still offers the standard DataModelExplorer tool', t.indexOf('DataModelExplorer') !== -1); cb(); }); },
], finish);
