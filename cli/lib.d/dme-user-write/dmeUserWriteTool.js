#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[AuthoringWrites]]
//
// dmeUserWriteTool.js — askMilo WRITE tool for the per-user DME graph. POSTs structured
// write actions to the educore executor (/api/dme-user-graph-write) over the server-
// internal auth path (Option A). Session context from env (set by ws-graphinator ->
// askMilo -> toolHandler): DME_API_BASE, DME_INTERNAL_SECRET, DME_VERSION_REF_ID. No
// bolt, no invariant logic here — the executor stamps :UserContent + userNodeId +
// embedding, enforces additive-only (refuses golden writes), and resolves the user's live
// clone from versionRefId. Self-contained (Node builtins only).
//
// Usage (driven by provider.json), e.g.:
//   node dmeUserWriteTool.js -createNode --name=Course --labels=Course --description=...
//   node dmeUserWriteTool.js -connectToStandard --userNodeId=.. --relType=ALIGNS_WITH --standardUri=..
//   node dmeUserWriteTool.js -setProperty --userNodeId=.. --propName=credits --propValue=3
//   node dmeUserWriteTool.js -deleteNode --userNodeId=..

const http = require('http');
const https = require('https');
const { URL } = require('url');

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
	fail('dme_user_write: no active user-graph version (DME_VERSION_REF_ID is unset). Open a version in User mode first.');
}
if (!apiBase || !secret) {
	fail('dme_user_write: server-internal context missing (DME_API_BASE / DME_INTERNAL_SECRET unset).');
}

const need = (name) => {
	const v = values[name];
	if (v === undefined || v === true || v === '') fail(`dme_user_write: --${name} is required.`);
	return v;
};

// Map the tool's flat flags to the executor's structured { action, params }.
let action;
let params;
if (switches.createNode) {
	action = 'createNode';
	const properties = { name: need('name') };
	if (values.description && values.description !== true) properties.description = values.description;
	const labels = values.labels && values.labels !== true
		? String(values.labels).split(',').map((s) => s.trim()).filter(Boolean)
		: [];
	params = { labels, properties };
} else if (switches.connectToStandard) {
	action = 'connectToStandard';
	params = { userNodeId: need('userNodeId'), relType: need('relType'), standardKey: need('standardUri') };
} else if (switches.connectUserNodes) {
	action = 'connectUserNodes';
	params = { fromUserNodeId: need('fromUserNodeId'), toUserNodeId: need('toUserNodeId'), relType: need('relType') };
} else if (switches.setProperty) {
	action = 'modifyNode';
	params = { selector: { userNodeId: need('userNodeId') }, properties: { [need('propName')]: need('propValue') } };
} else if (switches.deleteNode) {
	action = 'deleteNode';
	params = { selector: { userNodeId: need('userNodeId') } };
} else {
	fail('dme_user_write: specify one of -createNode, -connectToStandard, -connectUserNodes, -setProperty, -deleteNode.');
}

postJson(apiBase, '/api/dme-user-graph-write', secret, { versionRefId, action, params }, (err, res) => {
	if (err) fail(`dme_user_write: ${err}`);
	if (res.status < 200 || res.status >= 300) {
		fail(`dme_user_write: executor returned ${res.status}: ${res.body}`);
	}
	process.stdout.write(res.body.endsWith('\n') ? res.body : res.body + '\n');
});
