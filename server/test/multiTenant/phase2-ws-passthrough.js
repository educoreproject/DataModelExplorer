'use strict';
// Phase 2 gate (integration) — ws-graphinator hands the User-mode session context to the
// askMilo subprocess and NEVER leaks the secret to the browser. Driven over the real WS.
//
// Requires the API server running with a STUB askMilo first on PATH and STUB_RECORD_FILE
// set in its env (see the Phase 2 run steps in DEVELOPMENT-LOG-askmilo.md). The stub
// records each invocation's parsed command input + the DME_INTERNAL_SECRET env it saw.
// Run (cwd = server): node test/multiTenant/phase2-ws-passthrough.js

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const RECORD_FILE = process.env.STUB_RECORD_FILE || '/tmp/jadetower-stub-record.jsonl';
const CONFIG_INI = path.resolve(
	__dirname,
	'../../../../configs/instanceSpecific/qbook/startApiServer.ini',
);
const SECRET = (() => {
	const text = fs.readFileSync(CONFIG_INI, 'utf8');
	const m = text.match(/^\s*internalAuthSecret\s*=\s*(.+?)\s*$/m);
	return m ? m[1] : '__NO_SECRET__';
})();

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);

try { fs.unlinkSync(RECORD_FILE); } catch (e) {}

const allMessages = [];
const ws = new WebSocket('ws://127.0.0.1:7790/ws/explorer');
let phase = 0;

const finish = (err) => {
	try { ws.close(); } catch (e) {}
	// Read the stub records (filter out the on-connect getDefaults call)
	let prompts = [];
	try {
		prompts = fs
			.readFileSync(RECORD_FILE, 'utf8')
			.split('\n')
			.filter(Boolean)
			.map((l) => JSON.parse(l))
			.filter((r) => !r.isGetDefaults);
	} catch (e) {}

	const userRec = prompts[0];
	const stdRec = prompts[1];

	// T2.1 — User mode: askMilo received versionRefId + apiBase (command input) + secret (env)
	ok('T2.1 stub got a user-mode prompt invocation', !!userRec);
	ok('T2.1 dmeVersionRefId delivered as command input', userRec && JSON.stringify(userRec.values.dmeVersionRefId) === JSON.stringify(['FAKE_V']));
	ok('T2.1 dmeApiBase delivered as command input', userRec && JSON.stringify(userRec.values.dmeApiBase) === JSON.stringify(['http://127.0.0.1:7790']));
	ok('T2.1 internal secret delivered via env', userRec && userRec.secretEnv === SECRET);

	// T2.3 — secret is env-only and never reaches the browser
	ok('T2.3 secret NOT in command input keys', userRec && userRec.values.dmeInternalSecret === undefined);
	ok('T2.3 secret string NOT in serialized command input', userRec && JSON.stringify(userRec.values).indexOf(SECRET) === -1);
	const leakedToWs = allMessages.some((m) => typeof m === 'string' && m.indexOf(SECRET) !== -1);
	ok('T2.3 secret string NEVER appears in any WS message to the client', !leakedToWs);

	// T2.2 — Standard mode: none of it injected
	ok('T2.2 stub got a standard-mode prompt invocation', !!stdRec);
	ok('T2.2 no dmeVersionRefId in standard mode', stdRec && stdRec.values.dmeVersionRefId === undefined);
	ok('T2.2 no dmeApiBase in standard mode', stdRec && stdRec.values.dmeApiBase === undefined);
	ok('T2.2 no secret env in standard mode', stdRec && stdRec.secretEnv === null);

	if (err) console.error('FLOW ERROR:', err);
	let allPass = !err;
	results.forEach(([n, g]) => { if (!g) allPass = false; console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`); });
	console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL');
	process.exit(allPass ? 0 : 1);
};

const guard = setTimeout(() => finish('timeout waiting for WS done events'), 30000);

ws.on('open', () => {
	// Prompt 1 — User mode with a live version
	ws.send(JSON.stringify({
		type: 'prompt', text: 'phase2 user-mode probe',
		settings: { graphMode: 'user', activeVersionRefId: 'FAKE_V', tools: [], model: 'opus' },
	}));
});

ws.on('message', (raw) => {
	const text = raw.toString();
	allMessages.push(text);
	let msg;
	try { msg = JSON.parse(text); } catch (e) { return; }
	if (msg.channel === 'done') {
		if (phase === 0) {
			phase = 1;
			// Prompt 2 — Standard mode
			ws.send(JSON.stringify({
				type: 'prompt', text: 'phase2 standard-mode probe',
				settings: { graphMode: 'standard', tools: [], model: 'opus' },
			}));
		} else {
			clearTimeout(guard);
			finish();
		}
	}
});

ws.on('error', (e) => { clearTimeout(guard); finish(`WS error: ${e.message}`); });
