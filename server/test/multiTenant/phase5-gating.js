'use strict';
// Phase 5 gate (deterministic) — ws-graphinator graphMode gating (T5.2). With a STUB
// askMilo on PATH recording each invocation's command input, drive the real WS with a
// User-mode prompt and a Standard-mode prompt, and assert:
//  - User mode: per-user tools offered (not suppressed), standards suppressed, authoring prompt.
//  - Standard mode: per-user tools suppressed (never offered), standard prompt honored.
// Requires the API server up with the stub askMilo + STUB_RECORD_FILE (see Phase 5 run steps).
// Run (cwd = server): node test/multiTenant/phase5-gating.js

const WebSocket = require('ws');
const fs = require('fs');

const RECORD_FILE = process.env.STUB_RECORD_FILE || '/tmp/jadetower-stub-record.jsonl';
const results = [];
const ok = (name, cond) => results.push([name, !!cond]);
try { fs.unlinkSync(RECORD_FILE); } catch (e) {}

const ws = new WebSocket('ws://127.0.0.1:7790/ws/explorer');
let phase = 0;
const guard = setTimeout(() => finish('timeout'), 30000);

const suppressedOf = (rec) => {
	const v = rec && rec.values && rec.values.aiToolsSuppressed;
	const s = Array.isArray(v) ? v[0] : v;
	return (s || '').split(',').map((x) => x.trim()).filter(Boolean);
};
const promptOf = (rec) => {
	const v = rec && rec.values && rec.values.singleCallPromptName;
	return Array.isArray(v) ? v[0] : v;
};

function finish(err) {
	clearTimeout(guard);
	try { ws.close(); } catch (e) {}
	let prompts = [];
	try { prompts = fs.readFileSync(RECORD_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.isGetDefaults); } catch (e) {}
	const userRec = prompts[0];
	const stdRec = prompts[1];

	const userSup = suppressedOf(userRec);
	ok('T5.2 user-mode: DmeUserRead NOT suppressed (offered)', userSup.indexOf('DmeUserRead') === -1);
	ok('T5.2 user-mode: DmeUserWrite NOT suppressed (offered)', userSup.indexOf('DmeUserWrite') === -1);
	ok('T5.2 user-mode: standards suppressed (DataModelExplorer)', userSup.indexOf('DataModelExplorer') !== -1);
	ok('T5.2 user-mode: uses the DmeUserAuthoring prompt', promptOf(userRec) === 'DmeUserAuthoring');

	const stdSup = suppressedOf(stdRec);
	ok('T5.2 standard-mode: DmeUserRead suppressed (not offered)', stdSup.indexOf('DmeUserRead') !== -1);
	ok('T5.2 standard-mode: DmeUserWrite suppressed (not offered)', stdSup.indexOf('DmeUserWrite') !== -1);
	ok('T5.2 standard-mode: honors the requested standard prompt', promptOf(stdRec) === 'DataModelExplorer');

	if (err) console.error('FLOW ERROR:', err);
	let allPass = !err;
	results.forEach(([n, g]) => { if (!g) allPass = false; console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`); });
	console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL');
	process.exit(allPass ? 0 : 1);
}

ws.on('open', () => {
	ws.send(JSON.stringify({ type: 'prompt', text: 'p5 user probe', settings: { graphMode: 'user', activeVersionRefId: 'FAKE_V', tools: [] } }));
});
ws.on('message', (raw) => {
	let msg; try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
	if (msg.channel === 'done') {
		if (phase === 0) { phase = 1; ws.send(JSON.stringify({ type: 'prompt', text: 'p5 standard probe', settings: { graphMode: 'standard', promptName: 'DataModelExplorer', tools: [] } })); }
		else { finish(); }
	}
});
ws.on('error', (e) => finish(`WS error: ${e.message}`));
