'use strict';
// DCR redirect-URI allowlist (oauth-dcr-guard.js makeRedirectValidator).
// Pins the Claude exact callback, the loopback rule, and the Gemini custom
// MCP connector callbacks on Google's oauth-redirect hosts. The six Gemini
// URIs are the ones production rejected on 2026-10-26 (authAuditLog).
//
// Run: node server/test/oauth-dcr-guard.test.js

const { makeRedirectValidator } = require('../lib/oauth-dcr-guard');

const results = [];
const ok = (name, cond, detail) => {
	results.push([name, !!cond]);
	console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const isAllowedRedirect = makeRedirectValidator(['https://claude.ai/api/mcp/auth_callback']);

const geminiSuffix = 'user_bound_custom-mcp-102688023217691212928-ed-core_org';
const geminiAccepted = [
	`https://oauth-redirect.googleusercontent.com/r/${geminiSuffix}`,
	`https://oauth-redirect-test.googleusercontent.com/r/${geminiSuffix}`,
	`https://oauth-redirect-sandbox.googleusercontent.com/r/${geminiSuffix}`,
	`https://oauth-redirect.googleusercontent.com/a/${geminiSuffix}`,
	`https://oauth-redirect-test.googleusercontent.com/a/${geminiSuffix}`,
	`https://oauth-redirect-sandbox.googleusercontent.com/a/${geminiSuffix}`,
	'https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-114020063250871774546-educore_dev',
];

const otherAccepted = [
	'https://claude.ai/api/mcp/auth_callback',
	'http://localhost:7777/callback',
	'http://127.0.0.1:53412/oauth/callback',
];

const rejected = [
	`http://oauth-redirect.googleusercontent.com/r/${geminiSuffix}`, // not https
	`https://oauth-redirect.googleusercontent.com:8443/r/${geminiSuffix}`, // explicit port
	`https://oauth-redirect.googleusercontent.com.evil.example/r/${geminiSuffix}`, // look-alike host
	`https://evil.googleusercontent.com/r/${geminiSuffix}`, // other Google subdomain
	`https://oauth-redirect.googleusercontent.com/x/${geminiSuffix}`, // wrong path prefix
	`https://oauth-redirect.googleusercontent.com/r/${geminiSuffix}/extra`, // trailing path
	`https://oauth-redirect.googleusercontent.com/r/${geminiSuffix}?next=https://evil.example`, // query
	`https://oauth-redirect.googleusercontent.com/r/${geminiSuffix}#frag`, // fragment
	`https://attacker@oauth-redirect.googleusercontent.com/r/${geminiSuffix}`, // userinfo
	'https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-', // empty id
	'https://oauth-redirect.googleusercontent.com/', // bare host
	'https://claude.ai/api/mcp/auth_callback/extra', // not the exact Claude URI
	'https://evil.example/callback', // arbitrary host
	'not a uri',
];

geminiAccepted.forEach((uri) => ok(`accepts Gemini callback ${uri}`, isAllowedRedirect(uri)));
otherAccepted.forEach((uri) => ok(`accepts ${uri}`, isAllowedRedirect(uri)));
rejected.forEach((uri) => ok(`rejects ${uri}`, !isAllowedRedirect(uri)));

const failed = results.filter(([, passed]) => !passed);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
