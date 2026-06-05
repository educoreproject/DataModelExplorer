#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[AuthoringWrites]]
//
// dmeUserReadTool.js — askMilo READ tool for the per-user DME graph. POSTs read Cypher to
// the educore executor (/api/dme-user-cypher-query) over the server-internal auth path
// (Option A). All session context comes from env, set by ws-graphinator -> askMilo ->
// toolHandler: DME_API_BASE, DME_INTERNAL_SECRET, DME_VERSION_REF_ID. No bolt, no DB; the
// executor resolves the user's live clone server-side from versionRefId and enforces
// read-only. Self-contained (Node builtins only) so the provider needs no node_modules.
//
// Usage (driven by provider.json): node dmeUserReadTool.js -query --query=<cypher>
//                                  node dmeUserReadTool.js -schema

const http = require('http');
const https = require('https');
const { URL } = require('url');

// --- minimal, dependency-free arg parse: '-switch' (single dash) and '--flag=value' ----
const parseArgs = (argv) => {
	const switches = {};
	const values = {};
	argv.forEach((tok) => {
		if (tok.startsWith('--')) {
			const eq = tok.indexOf('=');
			if (eq !== -1) values[tok.slice(2, eq)] = tok.slice(eq + 1);
			else values[tok.slice(2)] = true;
		} else if (tok.startsWith('-')) {
			switches[tok.slice(1)] = true;
		}
	});
	return { switches, values };
};

const fail = (msg) => { process.stderr.write(`${msg}\n`); process.exit(1); };

const postJson = (apiBase, path, secret, body, cb) => {
	let u;
	try { u = new URL(path, apiBase); } catch (e) { cb(`bad DME_API_BASE/path: ${e.message}`); return; }
	const payload = JSON.stringify(body);
	const mod = u.protocol === 'https:' ? https : http;
	const req = mod.request(
		{
			hostname: u.hostname,
			port: u.port,
			path: u.pathname + u.search,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(payload),
				'x-dme-internal-secret': secret,
			},
		},
		(res) => {
			let data = '';
			res.on('data', (c) => (data += c));
			res.on('end', () => cb(null, { status: res.statusCode, body: data }));
		},
	);
	req.on('error', (e) => cb(`request failed: ${e.message}`));
	req.write(payload);
	req.end();
};

const { switches, values } = parseArgs(process.argv.slice(2));

const apiBase = process.env.DME_API_BASE;
const secret = process.env.DME_INTERNAL_SECRET;
const versionRefId = process.env.DME_VERSION_REF_ID;

if (!versionRefId) {
	fail('dme_user_read: no active user-graph version (DME_VERSION_REF_ID is unset). Open a version in User mode first.');
}
if (!apiBase || !secret) {
	fail('dme_user_read: server-internal context missing (DME_API_BASE / DME_INTERNAL_SECRET unset).');
}

let body;
if (switches.schema) {
	body = { action: 'schema', versionRefId };
} else if (switches.query) {
	const query = values.query;
	if (!query) fail('dme_user_read: --query is required for -query.');
	body = { action: 'query', query, versionRefId };
} else {
	fail('dme_user_read: specify -query or -schema.');
}

postJson(apiBase, '/api/dme-user-cypher-query', secret, body, (err, res) => {
	if (err) fail(`dme_user_read: ${err}`);
	if (res.status < 200 || res.status >= 300) {
		fail(`dme_user_read: executor returned ${res.status}: ${res.body}`);
	}
	process.stdout.write(res.body.endsWith('\n') ? res.body : res.body + '\n');
});
