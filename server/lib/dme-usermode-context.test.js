'use strict';
// Unit test for dme-usermode-context.buildUserModeAskmiloContext — the User-mode session
// context ws-graphinator hands to askMilo. Pure function, no server.
// Run: node server/lib/dme-usermode-context.test.js

const { buildUserModeAskmiloContext } = require('./dme-usermode-context');

const SECRET = 'unit-secret-xyz789';
const getConfig = (name) =>
	name === 'dmeUserGraphInternalAuth'
		? { internalAuthSecret: SECRET }
		: name === 'startApiServer'
		? { apiPort: '7790' }
		: {};

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);

// T2.2 — Standard mode: nothing injected (no version, no secret, no apiBase)
const std = buildUserModeAskmiloContext({ settings: { graphMode: 'standard' }, getConfig });
ok('T2.2 standard mode -> empty commandValues', Object.keys(std.commandValues).length === 0);
ok('T2.2 standard mode -> empty env (no secret)', Object.keys(std.env).length === 0);

// User mode but NO active version -> nothing injected
const noVer = buildUserModeAskmiloContext({ settings: { graphMode: 'user' }, getConfig });
ok('user mode w/o version -> empty commandValues', Object.keys(noVer.commandValues).length === 0);
ok('user mode w/o version -> empty env', Object.keys(noVer.env).length === 0);

// T2.1 — User mode + live version: versionRefId + apiBase (command input), secret (env)
const userCtx = buildUserModeAskmiloContext({
	settings: { graphMode: 'user', activeVersionRefId: 'VER_123' },
	getConfig,
});
ok('T2.1 dmeVersionRefId in command input', userCtx.commandValues.dmeVersionRefId === 'VER_123');
ok('T2.1 dmeApiBase is loopback executor URL', userCtx.commandValues.dmeApiBase === 'http://127.0.0.1:7790');
ok('T2.1 secret present in env (DME_INTERNAL_SECRET)', userCtx.env.DME_INTERNAL_SECRET === SECRET);

// T2.3 — the secret is ENV ONLY: it must NOT appear anywhere in the command input
ok(
	'T2.3 secret absent from command input (no dmeInternalSecret key)',
	userCtx.commandValues.dmeInternalSecret === undefined,
);
ok(
	'T2.3 secret string absent from serialized command input',
	JSON.stringify(userCtx.commandValues).indexOf(SECRET) === -1,
);

// versionRefId fallback key also honored (settings.versionRefId)
const altVer = buildUserModeAskmiloContext({
	settings: { graphMode: 'user', versionRefId: 'VER_ALT' },
	getConfig,
});
ok('versionRefId alt key honored', altVer.commandValues.dmeVersionRefId === 'VER_ALT');

let allPass = true;
results.forEach(([n, g]) => {
	if (!g) allPass = false;
	console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`);
});
console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL');
process.exit(allPass ? 0 : 1);
