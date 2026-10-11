'use strict';
// Spend-ledger roundtrip (DME/Slack plan v3, task 1.8 accumulation row).
// Same sqlite abstraction + mapper SQL the dispatch uses: rows accumulate per
// user per localDay; other users and other days never bleed into a total.
//
// Run: node server/test/dme-slack-ledger.test.js

const path = require('path');
const os = require('os');
const fs = require('fs');

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: (m) => console.error('xLog.error:', m), verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const sqliteGen = require('../data-model/lib/sqlite-instance/sqlite-instance')({
	getConfig: process.global.getConfig,
});
const dataMapping = require('../data-model/data-mapping/data-mapping')({
	pwHash: (x) => x,
	hashPassword: (x) => x,
	verifyPassword: () => true,
	validatePasswordStrength: () => ({ valid: true }),
});
const mapper = dataMapping['dme-slack'];

const TEST_DB_PATH = path.join(os.tmpdir(), 'dmeSlackLedgerGate.sqlite3');
if (fs.existsSync(TEST_DB_PATH)) {
	fs.unlinkSync(TEST_DB_PATH);
}

const results = [];
const ok = (name, cond, detail) => {
	results.push([name, !!cond]);
	console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const TABLE = 'dmeSlackSpend';
const rows = [
	{ slackUserId: 'U0ALPHA', costUsd: 0.25, requestRefId: 'ref1', localDay: '2026-07-13', askedAtIso: '2026-07-13T10:00:00Z' },
	{ slackUserId: 'U0ALPHA', costUsd: 0.1316, requestRefId: 'ref2', localDay: '2026-07-13', askedAtIso: '2026-07-13T11:00:00Z' },
	{ slackUserId: 'U0BETA', costUsd: 0.5, requestRefId: 'ref3', localDay: '2026-07-13', askedAtIso: '2026-07-13T12:00:00Z' },
	{ slackUserId: 'U0ALPHA', costUsd: 9.99, requestRefId: 'ref4', localDay: '2026-07-12', askedAtIso: '2026-07-12T12:00:00Z' },
];

console.log('\n=== dme-slack spend ledger gate ===\n');

sqliteGen.initDatabaseInstance(TEST_DB_PATH, (initErr, sqlDb) => {
	if (initErr) {
		console.error(initErr);
		process.exit(1);
	}
	sqlDb.getTable(TABLE, (tableErr, tableRef) => {
		if (tableErr) {
			console.error(tableErr);
			process.exit(1);
		}

		let i = 0;
		const saveNext = () => {
			if (i >= rows.length) {
				readBack();
				return;
			}
			tableRef.saveObject(rows[i++], { suppressStatementLog: true, noTableNameOk: true }, (saveErr) => {
				if (saveErr) {
					console.error(`save failed: ${saveErr}`);
					process.exit(1);
				}
				saveNext();
			});
		};

		const readBack = () => {
			const userSql = mapper.getSql('todayUserSpend', { tableName: TABLE, slackUserId: 'U0ALPHA', localDay: '2026-07-13' });
			tableRef.getData(userSql, { suppressStatementLog: true, noTableNameOk: true }, (uErr, uRows) => {
				const userTotal = parseFloat((uRows && uRows[0] && uRows[0].totalUsd) || 0);
				ok(
					'user total sums own rows for the day only',
					!uErr && Math.abs(userTotal - 0.3816) < 0.0001,
					`$${userTotal}`,
				);

				const globalSql = mapper.getSql('todayGlobalSpend', { tableName: TABLE, localDay: '2026-07-13' });
				tableRef.getData(globalSql, { suppressStatementLog: true, noTableNameOk: true }, (gErr, gRows) => {
					const globalTotal = parseFloat((gRows && gRows[0] && gRows[0].totalUsd) || 0);
					ok(
						'global total sums all users for the day, other days excluded',
						!gErr && Math.abs(globalTotal - 0.8816) < 0.0001,
						`$${globalTotal}`,
					);

					const failed = results.filter(([, pass]) => !pass).length;
					console.log(`\n=== Results: ${results.length - failed} passed, ${failed} failed ===\n`);
					process.exit(failed > 0 ? 1 : 0);
				});
			});
		};

		saveNext();
	});
});
