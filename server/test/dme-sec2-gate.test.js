'use strict';
// SEC-2 gate (DME/Slack plan v3, task 1.9, DAWN_RIVER ruling: gate BOTH).
// /api/dme-cypher-query and /mcp are internal-only: x-dme-internal-secret +
// loopback origin + no forwarding header. Anonymous, wrong-secret, and
// proxied-origin requests all get 401; a genuine internal call passes.
//
// Run: node server/test/dme-sec2-gate.test.js

const http = require('http');

const TEST_INTERNAL_SECRET = 'sec2GateTestSecret'.padEnd(64, '0');

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

const request = (port, { method = 'POST', path: routePath, headers = {}, body = '' }, callback) => {
	const req = http.request(
		{ host: '127.0.0.1', port, path: routePath, method, headers: { 'content-type': 'application/json', ...headers, 'content-length': Buffer.byteLength(body) } },
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
// the app-value-manager middleware equivalent the real server mounts
app.use((req, res, next) => {
	req.appValueGetter = () => ({});
	next();
});

// the cypher endpoint with a stub access point (gate behavior is the subject)
const endpointsDotD = { logList: [] };
require('../endpoints-dot-d/qtDotLib.d/dme-cypher-query')({
	dotD: endpointsDotD,
	passThroughParameters: {
		expressApp: app,
		accessTokenHeaderTools: { getValidator: () => (claims, cb) => cb('') },
		accessPointsDotD: {
			'dme-cypher-query': (queryData, cb) => cb('', [{ gatePassed: true }]),
		},
		routingPrefix: '/api/',
	},
});

// the MCP surface (real module; a passed gate reaches MCP session logic)
require('../lib/mcp-server/mcp-server')({
	expressApp: app,
	accessPointsDotD: {
		'dme-cypher-query': (queryData, cb) => cb('', [{ ok: true }]),
	},
});

const server = app.listen(0, () => {
	const port = server.address().port;
	const cypherBody = JSON.stringify({ action: 'query', query: 'MATCH (n) RETURN n LIMIT 1' });

	console.log('\n=== SEC-2 gate ===\n');

	request(port, { path: '/api/dme-cypher-query', body: cypherBody }, (e1, r1) => {
		ok('cypher endpoint: anonymous request → 401', !e1 && r1.status === 401);

		request(port, { path: '/api/dme-cypher-query', body: cypherBody, headers: { 'x-dme-internal-secret': 'wrong-secret' } }, (e2, r2) => {
			ok('cypher endpoint: wrong secret → 401', !e2 && r2.status === 401);

			request(port, { path: '/api/dme-cypher-query', body: cypherBody, headers: { 'x-dme-internal-secret': TEST_INTERNAL_SECRET, 'x-forwarded-for': '203.0.113.9' } }, (e3, r3) => {
				ok('cypher endpoint: correct secret but proxied origin → 401', !e3 && r3.status === 401);

				request(port, { path: '/api/dme-cypher-query', body: cypherBody, headers: { 'x-dme-internal-secret': TEST_INTERNAL_SECRET } }, (e4, r4) => {
					ok(
						'cypher endpoint: internal call (secret + loopback) passes',
						!e4 && r4.status === 200 && /gatePassed/.test(r4.body),
						`status ${r4.status}`,
					);

					request(port, { path: '/api/dme-cypher-query', method: 'GET' }, (e5, r5) => {
						ok('cypher endpoint: anonymous GET (schema) → 401', !e5 && r5.status === 401);

						request(port, { path: '/mcp', body: '{}' }, (e6, r6) => {
							ok('MCP: anonymous request → 401', !e6 && r6.status === 401);

							request(port, { path: '/mcp', body: '{}', headers: { 'x-dme-internal-secret': TEST_INTERNAL_SECRET, 'x-forwarded-for': '203.0.113.9' } }, (e7, r7) => {
								ok('MCP: proxied origin → 401', !e7 && r7.status === 401);

								request(port, { path: '/mcp', body: '{}', headers: { 'x-dme-internal-secret': TEST_INTERNAL_SECRET } }, (e8, r8) => {
									ok(
										'MCP: internal call passes the gate (reaches MCP logic)',
										!e8 && r8.status !== 401,
										`status ${r8.status}`,
									);

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
		});
	});
});
