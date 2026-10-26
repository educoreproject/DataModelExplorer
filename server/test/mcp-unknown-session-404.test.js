'use strict';
// Unknown MCP session ID -> 404 (MCP Streamable HTTP spec), so a client whose
// session was dropped by a server restart starts a new one instead of failing.
// A request with NO session ID that is not an initialize stays 400.
// Uses the SEC-2 internal path (secret + loopback) to get past the gate.
//
// Run: node server/test/mcp-unknown-session-404.test.js

const http = require('http');

const TEST_INTERNAL_SECRET = 'mcp404TestSecret'.padEnd(64, '0');

process.global = {
	getConfig: (name) => {
		if (name === 'dmeUserGraphInternalAuth') {
			return { internalAuthSecret: TEST_INTERNAL_SECRET };
		}
		if (name === 'mcp-server') {
			return { enabled: true, mcpPath: '/mcp' };
		}
		return {};
	},
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const express = require('express');
const bodyParser = require('body-parser');

const results = [];
const ok = (name, cond, detail) => {
	results.push([name, !!cond]);
	console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const request = (port, { method = 'POST', headers = {}, body = '' }, callback) => {
	const req = http.request(
		{
			host: '127.0.0.1',
			port,
			path: '/mcp',
			method,
			headers: {
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
				'x-dme-internal-secret': TEST_INTERNAL_SECRET,
				...headers,
				'content-length': Buffer.byteLength(body),
			},
		},
		(res) => {
			let data = '';
			res.on('data', (c) => (data += c));
			res.on('end', () => callback('', { status: res.statusCode, body: data }));
		},
	);
	req.on('error', (e) => callback(String(e)));
	req.write(body);
	req.end();
};

const app = express();
app.use(bodyParser.json({ extended: true }));
app.use((req, res, next) => {
	req.appValueGetter = () => ({});
	next();
});

require('../lib/mcp-server/mcp-server')({
	expressApp: app,
	accessPointsDotD: {
		'dme-cypher-query': (queryData, cb) => cb('', [{ ok: true }]),
	},
});

const staleSession = { 'mcp-session-id': '00000000-0000-4000-8000-000000000000' };
const toolsListBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

const server = app.listen(0, () => {
	const port = server.address().port;

	console.log('\n=== MCP unknown session ===\n');

	request(port, { headers: staleSession, body: toolsListBody }, (e1, r1) => {
		ok('POST with unknown session ID -> 404', !e1 && r1.status === 404, `status ${r1.status}`);

		request(port, { method: 'GET', headers: staleSession }, (e2, r2) => {
			ok('GET with unknown session ID -> 404', !e2 && r2.status === 404, `status ${r2.status}`);

			request(port, { method: 'DELETE', headers: staleSession }, (e3, r3) => {
				ok('DELETE with unknown session ID -> 404', !e3 && r3.status === 404, `status ${r3.status}`);

				request(port, { body: toolsListBody }, (e4, r4) => {
					ok('POST non-initialize with no session ID -> 400', !e4 && r4.status === 400, `status ${r4.status}`);

					request(port, { method: 'GET' }, (e5, r5) => {
						ok('GET with no session ID -> 400', !e5 && r5.status === 400, `status ${r5.status}`);

						server.close();
						const failed = results.filter(([, pass]) => !pass).length;
						console.log(`\n=== Results: ${results.length - failed} passed, ${failed} failed ===\n`);
						process.exit(failed > 0 ? 1 : 0);
					});
				});
			});
		});
	});
});
