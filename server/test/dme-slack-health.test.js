'use strict';
// /dme health gate (DME/Slack plan v3, task 1.10).
// Runs the health command through the REAL dispatch: golden identity (name +
// live node count), askMilo responsiveness (real getDefaults spawn), and the
// spend line from the ledger — delivered as one Slack message.
//
// Run: node server/test/dme-slack-health.test.js  (needs golden + askMilo config)

const path = require('path');
const os = require('os');
const fs = require('fs');

const dmeSlackTestConfig = {
	signingSecret: 'healthGateSigningSecret000000001',
	botToken: 'xoxb-HEALTH-GATE-FIXTURE-TOKEN-notReal-0000',
	accessPolicy: 'allowAll',
	userDailyCapUsd: 2,
	globalDailyCapUsd: 10,
	spendResetTimezone: 'America/Chicago',
	askCostEstimateUsd: 0.25,
	askTimeoutSeconds: 180,
	askMaxConcurrent: 2,
	interimMessageSeconds: 20,
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
	xLog: { status: () => {}, error: (m) => console.error('xLog.error:', m), verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
	configurationSourceFilePath:
		'/Users/tqwhite/Documents/webdev/educore/system/configs/instanceSpecific/qbook/startApiServer.ini',
};

const results = [];
const ok = (name, cond, detail) => {
	results.push([name, !!cond]);
	console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const deliveries = [];
const capturingTransport = ({ url, data, headers }, callback) => {
	deliveries.push({ url, data });
	callback('', { status: 200, data: { ok: true } });
};

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

const TEST_DB_PATH = path.join(os.tmpdir(), 'dmeSlackHealthGate.sqlite3');
if (fs.existsSync(TEST_DB_PATH)) {
	fs.unlinkSync(TEST_DB_PATH);
}

const conn = resolveContainerConnection(process.env.GOLDEN_CONTAINER || 'gf_pvsEcand');

console.log('\n=== /dme health gate ===\n');

sqliteGen.initDatabaseInstance(TEST_DB_PATH, (e1, sqlDb) => {
	neo4jGen.initDatabaseInstance(
		{ neo4jBoltUri: conn.boltUri, neo4jUser: conn.user, neo4jPassword: conn.password, readOnly: true, queryTimeoutMs: 15000 },
		(e2, neo4jDb) => {
			slackGen.initSlackInstance({ ...dmeSlackTestConfig, transport: capturingTransport }, (e3, slackAccess) => {
				require('../data-model/access-points-dot-d')(
					{ sqlDb, hxAccess: {}, dataMapping, neo4jDb, slackAccess },
					(e4, accessPointsDotD) => {
						if (e1 || e2 || e3 || e4) {
							console.error(e1 || e2 || e3 || e4);
							process.exit(1);
						}

						accessPointsDotD['dme-slack-dispatch'](
							{
								commandText: 'health',
								slackUserId: 'U0HEALTH',
								channelId: 'C0HEALTH',
								responseUrl: 'https://hooks.slack.com/commands/T0001/health',
							},
							(dispatchErr) => {
								const delivery = deliveries[deliveries.length - 1];
								const text = (delivery && delivery.data.text) || '';
								ok('health dispatch completes', !dispatchErr, dispatchErr);
								ok('names the golden container', /gf_pvsEcand/.test(text));
								ok('reports a live forged-node count', /105\d{3} forged nodes/.test(text));
								ok('reports askMilo responsive', /askMilo: responsive/.test(text));
								ok('reports today’s spend with the team cap', /spend .*you \$0\.00 · team \$0\.00 of \$10/.test(text));
								ok('reports uptime', /uptime/i.test(text));
								console.log('\n  --- health reply ---');
								console.log(text.split('\n').map((l) => `  | ${l}`).join('\n'));
								console.log('  --- end ---');

								neo4jDb.close();
								const failed = results.filter(([, pass]) => !pass).length;
								console.log(`\n=== Results: ${results.length - failed} passed, ${failed} failed ===\n`);
								process.exit(failed > 0 ? 1 : 0);
							},
						);
					},
				);
			});
		},
	);
});
