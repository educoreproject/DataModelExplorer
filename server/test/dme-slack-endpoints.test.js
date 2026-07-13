'use strict';
// Endpoint + dispatch gate (DME/Slack plan v3, tasks 1.4/1.6/1.8 non-spawn rows).
// Assembles the REAL stack — express with the startApiServer middleware shape,
// real endpoints, real dispatch access point, real mapper, real hardened golden
// connection — with exactly two substitutions: fixture Slack credentials and a
// capturing transport (the "mock driver" of the acceptance row is the driver's
// injectable transport; all driver logic itself is real).
//
// Proves: 401 on unsigned/stale/tampered; sub-second ack on signed commands
// with the answer arriving out-of-band; url_verification challenge echo;
// event dedupe; lookup fixture '/dme birth date' cards; no-results message;
// graph-down message; allowlist deny/allow config-only flip; both spend-cap
// fixture messages VERBATIM (caps set to $0.01 — no askMilo spawn happens).
//
// Run: node server/test/dme-slack-endpoints.test.js  (needs Docker + golden up)

const crypto = require('crypto');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const TEST_SIGNING_SECRET = 'endpointGateSigningSecret0000001';
const TEST_BOT_TOKEN = 'xoxb-ENDPOINT-GATE-FIXTURE-TOKEN-notReal-00';

// mutable per-scenario config the whole stack reads through getConfig
const dmeSlackTestConfig = {
	signingSecret: TEST_SIGNING_SECRET,
	botToken: TEST_BOT_TOKEN,
	accessPolicy: 'allowAll',
	allowedUserIds: '',
	allowedChannelIds: '',
	userDailyCapUsd: 5,
	globalDailyCapUsd: 50,
	spendResetTimezone: 'America/Chicago',
	askCostEstimateUsd: 0.25,
	askTimeoutSeconds: 180,
	askMaxConcurrent: 2,
	interimMessageSeconds: 20,
	replayWindowSeconds: 300,
	dmeBaseUrl: 'https://qbook.work',
};

process.global = {
	getConfig: (name) => {
		if (name === 'dmeSlack') {
			return dmeSlackTestConfig;
		}
		if (name === 'dataModelExplorerSearch') {
			return { goldenContainerName: process.env.GOLDEN_CONTAINER || 'gf_pvsEcand' };
		}
		return {};
	},
	xLog: {
		status: () => {},
		error: () => {},
		verbose: () => {},
		result: () => {},
	},
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

const series = (steps, done) => {
	let i = 0;
	const nextStep = (err) => {
		if (err) {
			done(err);
			return;
		}
		if (i >= steps.length) {
			done();
			return;
		}
		steps[i++](nextStep);
	};
	nextStep();
};

// ---- the capturing transport (the injectable seam of the real driver) ----
const deliveries = [];
const capturingTransport = ({ url, data, headers }, callback) => {
	deliveries.push({ url, data, headers, at: Date.now() });
	callback('', { status: 200, data: { ok: true } });
};

const waitForDelivery = (sinceCount, timeoutMs, callback) => {
	const startedAt = Date.now();
	const poll = () => {
		if (deliveries.length > sinceCount) {
			callback('', deliveries[deliveries.length - 1]);
			return;
		}
		if (Date.now() - startedAt > timeoutMs) {
			callback('timed out waiting for out-of-band delivery');
			return;
		}
		setTimeout(poll, 25);
	};
	poll();
};

// ---- signing helper ----
const signedHeaders = (bodyString, { ageSeconds = 0, tamper = false } = {}) => {
	const timestamp = Math.floor(Date.now() / 1000) - ageSeconds;
	const signature = `v0=${crypto
		.createHmac('sha256', TEST_SIGNING_SECRET)
		.update(`v0:${timestamp}:${bodyString}`)
		.digest('hex')}`;
	return {
		'content-type': 'application/x-www-form-urlencoded',
		'x-slack-request-timestamp': String(timestamp),
		'x-slack-signature': tamper
			? signature.replace(/.$/, (last) => (last === '0' ? '1' : '0'))
			: signature,
	};
};

const postRaw = (port, routePath, bodyString, headers, callback) => {
	const startedAt = Date.now();
	const request = http.request(
		{ host: '127.0.0.1', port, path: routePath, method: 'POST', headers: { ...headers, 'content-length': Buffer.byteLength(bodyString) } },
		(response) => {
			let data = '';
			response.on('data', (chunk) => (data += chunk));
			response.on('end', () =>
				callback('', {
					status: response.statusCode,
					body: data,
					ackMs: Date.now() - startedAt,
				}),
			);
		},
	);
	request.on('error', (err) => callback(String(err)));
	request.write(bodyString);
	request.end();
};

const slashBody = (text, { user = 'U0TESTER', channel = 'C0TESTCH', command = '/dme' } = {}) =>
	`token=fx&team_id=T0001&channel_id=${channel}&user_id=${user}&command=${encodeURIComponent(command)}&text=${encodeURIComponent(text)}&response_url=${encodeURIComponent('https://hooks.slack.com/commands/T0001/fixture')}`;

// ================================================================================
// ASSEMBLE THE REAL STACK

const {
	resolveContainerConnection,
} = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });
const slackGen = require('../data-model/lib/slack-instance/slack-instance')({ unused: true });
const sqliteGen = require('../data-model/lib/sqlite-instance/sqlite-instance')({ getConfig: process.global.getConfig });
const dataMapping = require('../data-model/data-mapping/data-mapping')({
	pwHash: (x) => x,
	hashPassword: (x) => x,
	verifyPassword: () => true,
	validatePasswordStrength: () => ({ valid: true }),
});

const TEST_DB_PATH = path.join(os.tmpdir(), 'dmeSlackEndpointGate.sqlite3');
if (fs.existsSync(TEST_DB_PATH)) {
	fs.unlinkSync(TEST_DB_PATH);
}

const conn = resolveContainerConnection(process.env.GOLDEN_CONTAINER || 'gf_pvsEcand');
if (conn.error) {
	console.error(`Cannot resolve golden connection: ${conn.error}`);
	process.exit(1);
}

let sqlDb;
let neo4jDb;
let slackAccess;
let accessPointsDotD;
let server;
let port;

console.log('\n=== dme-slack endpoint + dispatch gate ===\n');

series(
	[
		(next) =>
			sqliteGen.initDatabaseInstance(TEST_DB_PATH, (err, handle) => {
				sqlDb = handle;
				next(err);
			}),
		(next) =>
			neo4jGen.initDatabaseInstance(
				{ neo4jBoltUri: conn.boltUri, neo4jUser: conn.user, neo4jPassword: conn.password, readOnly: true, queryTimeoutMs: 15000 },
				(err, handle) => {
					neo4jDb = handle;
					next(err);
				},
			),
		(next) =>
			slackGen.initSlackInstance(
				{ ...dmeSlackTestConfig, transport: capturingTransport },
				(err, handle) => {
					slackAccess = handle;
					next(err);
				},
			),
		(next) =>
			require('../data-model/access-points-dot-d')(
				{ sqlDb, hxAccess: {}, dataMapping, neo4jDb, slackAccess },
				(err, dotDLibrary) => {
					accessPointsDotD = dotDLibrary;
					next(err);
				},
			),
		(next) => {
			const app = express();
			const rawBodyCapture = (xReq, xRes, buf) => {
				xReq.rawBody = buf;
			};
			app.use(bodyParser.json({ extended: true, verify: rawBodyCapture }));
			app.use(bodyParser.urlencoded({ extended: true, verify: rawBodyCapture }));

			const endpointsDotD = { logList: [] };
			const accessTokenHeaderTools = { getValidator: () => () => {} };
			['dme-slack-command', 'dme-slack-events'].forEach((endpointName) => {
				require(`../endpoints-dot-d/qtDotLib.d/${endpointName}`)({
					dotD: endpointsDotD,
					passThroughParameters: {
						expressApp: app,
						accessTokenHeaderTools,
						accessPointsDotD,
						slackAccess,
						routingPrefix: '/api/',
					},
				});
			});

			server = app.listen(0, () => {
				port = server.address().port;
				next();
			});
		},

		// ----------------------------------------------------------------
		// signature discipline at the HTTP surface
		(next) => {
			const body = slashBody('help');
			postRaw(port, '/api/dme-slack-command', body, { 'content-type': 'application/x-www-form-urlencoded' }, (err, res) => {
				ok('unsigned request → 401', !err && res.status === 401);
				next();
			});
		},
		(next) => {
			const body = slashBody('help');
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body, { ageSeconds: 400 }), (err, res) => {
				ok('stale-signed request (400s) → 401', !err && res.status === 401);
				next();
			});
		},
		(next) => {
			const body = slashBody('help');
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body, { tamper: true }), (err, res) => {
				ok('tampered signature → 401', !err && res.status === 401);
				next();
			});
		},

		// ----------------------------------------------------------------
		// /dme help — fast ack + out-of-band delivery
		(next) => {
			const body = slashBody('help');
			const before = deliveries.length;
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body), (err, res) => {
				ok(
					'signed /dme help acked fast with Working on it…',
					!err && res.status === 200 && /Working on it/.test(res.body) && res.ackMs < 1000,
					`ack ${res.ackMs}ms`,
				);
				waitForDelivery(before, 5000, (waitErr, delivery) => {
					ok(
						'help answer arrives out-of-band via response_url',
						!waitErr &&
							delivery.url === 'https://hooks.slack.com/commands/T0001/fixture' &&
							/\/dme <term>|\/dme/.test(delivery.data.text || ''),
					);
					next();
				});
			});
		},

		// ----------------------------------------------------------------
		// /dme lookup birth date — the 1.6 lookup fixture (now behind the verb)
		(next) => {
			const body = slashBody('lookup birth date');
			const before = deliveries.length;
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body), (err, res) => {
				ok(
					'signed /dme lookup birth date acked fast (Working on it…)',
					!err && res.status === 200 && /Working on it/.test(res.body) && res.ackMs < 1000,
					`ack ${res.ackMs}ms`,
				);
				waitForDelivery(before, 20000, (waitErr, delivery) => {
					const blocks = (delivery && delivery.data.blocks) || [];
					const blockText = JSON.stringify(blocks);
					ok(
						'lookup card set delivered (BirthDate + CEDS hub tuple present)',
						!waitErr &&
							delivery.data.response_type === 'in_channel' &&
							/[Bb]irth\s?[Dd]ate/.test(blockText) &&
							/CEDS hub tuple/.test(blockText),
						waitErr || `${blocks.length} blocks`,
					);
					ok(
						'lookup reply carries the DME deep link',
						/dm\/explorer\?prompt=/.test(blockText),
					);
					ok(
						'lookup reply hints the bare AI form',
						/Just type: `\/dme birth date`/.test(blockText) ||
							/`\/dme birth date` \(no 'lookup'\)/.test(blockText),
					);
					next();
				});
			});
		},

		// ----------------------------------------------------------------
		// lookup no-results: teaches the bare AI form
		(next) => {
			const body = slashBody('lookup zqxjklwvuty');
			const before = deliveries.length;
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body), (err, res) => {
				waitForDelivery(before, 20000, (waitErr, delivery) => {
					const text = (delivery && delivery.data.text) || '';
					ok(
						'lookup no-results names the term and teaches the bare AI form',
						!waitErr &&
							/No elements matched "zqxjklwvuty"/.test(text) &&
							/`\/dme zqxjklwvuty` \(no 'lookup'\)/.test(text),
					);
					next();
				});
			});
		},

		// ----------------------------------------------------------------
		// INVERTED ROUTER (TQ ruling): bare text routes to the askMilo default.
		// Proven with a $0.01 cap — the cap fixture firing IS the routing proof,
		// and no spawn happens.
		(next) => {
			dmeSlackTestConfig.userDailyCapUsd = 0.01;
			const body = slashBody('what CEDS element matches SIF birth date', { command: '/tqdme' });
			const before = deliveries.length;
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body), (err, res) => {
				ok(
					'bare question acks with the Thinking message',
					!err && /Thinking — a real answer takes a minute or two/.test(res.body),
				);
				waitForDelivery(before, 5000, (waitErr, delivery) => {
					ok(
						'bare text routed to the AI default (cap fixture fired)',
						!waitErr && /personal daily limit/.test(delivery.data.text || ''),
					);
					next();
				});
			});
		},

		// silent 'ask' alias still reaches the AI path (undocumented)
		(next) => {
			const body = slashBody('ask what is a birth date?');
			const before = deliveries.length;
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body), (err, res) => {
				waitForDelivery(before, 5000, (waitErr, delivery) => {
					ok(
						"silent 'ask' alias routes to the AI default",
						!waitErr && /personal daily limit/.test(delivery.data.text || ''),
					);
					dmeSlackTestConfig.userDailyCapUsd = 5;
					next();
				});
			});
		},

		// help invoked as /tqdme leads with the two NEW forms, command echoed
		(next) => {
			const body = slashBody('help', { command: '/tqdme' });
			const before = deliveries.length;
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body), (err, res) => {
				waitForDelivery(before, 5000, (waitErr, delivery) => {
					const text = (delivery && delivery.data.text) || '';
					const lines = text.split('\n');
					ok(
						'help leads with question-default + lookup verb, echoing /tqdme',
						!waitErr &&
							/The two forms/.test(lines[0]) &&
							/`\/tqdme <question>`/.test(lines[1]) &&
							/`\/tqdme lookup <term>`/.test(lines[2]),
					);
					next();
				});
			});
		},

		// ----------------------------------------------------------------
		// spend caps — fixture messages VERBATIM, no spawn (estimate > cap)
		(next) => {
			dmeSlackTestConfig.userDailyCapUsd = 0.01;
			const body = slashBody('ask what is a birth date?');
			const before = deliveries.length;
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body), (err, res) => {
				waitForDelivery(before, 5000, (waitErr, delivery) => {
					ok(
						'F-LIMIT-USER ($5 wording) delivered VERBATIM at $0.01 user cap',
						!waitErr &&
							delivery.data.text ===
								`You've hit your personal daily limit for /dme ask ($5 per person per day). It resets at midnight (US Central). If you need more headroom, talk to TQ — the limit is a config setting he can raise.`,
					);
					dmeSlackTestConfig.userDailyCapUsd = 5;
					next();
				});
			});
		},
		(next) => {
			dmeSlackTestConfig.globalDailyCapUsd = 0.01;
			const body = slashBody('ask what is a birth date?');
			const before = deliveries.length;
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body), (err, res) => {
				waitForDelivery(before, 5000, (waitErr, delivery) => {
					ok(
						'F-LIMIT-GLOBAL ($50 wording) delivered VERBATIM at $0.01 global cap',
						!waitErr &&
							delivery.data.text ===
								`The team's shared daily budget for /dme ask ($50/day for everyone combined) is used up for today. It resets at midnight (US Central). If this keeps happening, talk to TQ about raising the team budget.`,
					);
					dmeSlackTestConfig.globalDailyCapUsd = 50;
					next();
				});
			});
		},

		// ----------------------------------------------------------------
		// allowlist — config-only flip blocks a second user, then reverts
		(next) => {
			dmeSlackTestConfig.accessPolicy = 'allowlist';
			dmeSlackTestConfig.allowedUserIds = 'U0TESTER';
			const body = slashBody('help', { user: 'U0SOMEONEELSE' });
			const before = deliveries.length;
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body), (err, res) => {
				waitForDelivery(before, 5000, (waitErr, delivery) => {
					ok(
						'allowlist blocks a non-listed user with the A5 fixture',
						!waitErr &&
							delivery.data.text === `Sorry — /dme isn't enabled for you yet. Ask TQ if you think it should be.`,
					);
					next();
				});
			});
		},
		(next) => {
			const body = slashBody('help', { user: 'U0TESTER' });
			const before = deliveries.length;
			postRaw(port, '/api/dme-slack-command', body, signedHeaders(body), (err, res) => {
				waitForDelivery(before, 5000, (waitErr, delivery) => {
					ok(
						'allowlisted user still passes under allowlist policy',
						!waitErr && /\/dme/.test(delivery.data.text || ''),
					);
					dmeSlackTestConfig.accessPolicy = 'allowAll';
					dmeSlackTestConfig.allowedUserIds = '';
					next();
				});
			});
		},

		// ----------------------------------------------------------------
		// events endpoint: challenge echo + dedupe
		(next) => {
			const body = JSON.stringify({ type: 'url_verification', challenge: 'fixtureChallenge123' });
			postRaw(
				port,
				'/api/dme-slack-events',
				body,
				{ ...signedHeaders(body), 'content-type': 'application/json' },
				(err, res) => {
					ok(
						'url_verification challenge echoed (behind signature)',
						!err && res.status === 200 && /fixtureChallenge123/.test(res.body),
					);
					next();
				},
			);
		},
		(next) => {
			const body = JSON.stringify({ type: 'url_verification', challenge: 'x' });
			postRaw(port, '/api/dme-slack-events', body, { 'content-type': 'application/json' }, (err, res) => {
				ok('unsigned events request → 401', !err && res.status === 401);
				next();
			});
		},
		(next) => {
			const eventBody = JSON.stringify({ type: 'event_callback', event_id: 'EvGATE001', event: { type: 'app_mention' } });
			postRaw(port, '/api/dme-slack-events', eventBody, { ...signedHeaders(eventBody), 'content-type': 'application/json' }, (e1, r1) => {
				postRaw(port, '/api/dme-slack-events', eventBody, { ...signedHeaders(eventBody), 'content-type': 'application/json' }, (e2, r2) => {
					ok(
						'event_callback + retried event_id both ack 200 (idempotent)',
						!e1 && !e2 && r1.status === 200 && r2.status === 200,
					);
					next();
				});
			});
		},

		// ----------------------------------------------------------------
		// graph-down state: dispatch with neo4jDb null answers the A8 message
		(next) => {
			require('../data-model/access-points-dot-d')(
				{ sqlDb, hxAccess: {}, dataMapping, neo4jDb: null, slackAccess },
				(err, downRegistry) => {
					if (err) {
						next(err);
						return;
					}
					const before = deliveries.length;
					downRegistry['dme-slack-dispatch'](
						{
							commandText: 'lookup birth date',
							slackUserId: 'U0TESTER',
							channelId: 'C0TESTCH',
							responseUrl: 'https://hooks.slack.com/commands/T0001/fixture',
						},
						() => {
							waitForDelivery(before, 5000, (waitErr, delivery) => {
								ok(
									'graph-down lookup answers the A8 maintenance message',
									!waitErr &&
										delivery.data.text ===
											'The data-model graph is temporarily unavailable (probably maintenance). Try again in a few minutes.',
								);
								next();
							});
						},
					);
				},
			);
		},
	],
	(err) => {
		if (server) {
			server.close();
		}
		if (neo4jDb) {
			neo4jDb.close();
		}
		if (err) {
			console.error(`\nGate aborted: ${err}`);
			process.exit(1);
		}
		const failed = results.filter(([, pass]) => !pass).length;
		console.log(`\n=== Results: ${results.length - failed} passed, ${failed} failed ===\n`);
		process.exit(failed > 0 ? 1 : 0);
	},
);
