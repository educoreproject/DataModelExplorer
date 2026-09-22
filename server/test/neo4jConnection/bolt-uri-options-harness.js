'use strict';
// @concept: [[Neo4jAbstraction]]
//
// neo4j-instance connection options — proves the server can be pointed at a HOSTED
// Neo4j (Aura and friends, neo4j+s://) as well as the self-hosted docker containers
// (bolt://) without a code change, only a config change.
//
// The driver validates the bolt URI synchronously and throws before any network
// traffic, so all of this runs offline: no Neo4j, no config, no droplet. Cases that
// need a reachable server stop at the connection attempt and are checked by the shape
// of the error, not by reaching a database.
//
// Run: node server/test/neo4jConnection/bolt-uri-options-harness.js

const errors = [];

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: () => {} },
};

const neo4j = require('neo4j-driver');
const neo4jGen = require('../../data-model/lib/neo4j-instance/neo4j-instance')({
	unused: true,
});

const check = (label, passed, detail) => {
	console.log(`${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
	if (!passed) {
		errors.push(label);
	}
};

// ---------------------------------------------------------------------------
// 1. The raw driver contract this module has to respect.
//
// These assert the neo4j-driver behavior the module is written around. If a driver
// upgrade ever changes it, these fail first and say why the rest of the file exists.

const driverAccepts = (uri, options) => {
	try {
		neo4j.driver(uri, neo4j.auth.basic('neo4j', 'unused'), options).close();
		return '';
	} catch (err) {
		return err.message;
	}
};

check(
	'driver: bolt:// accepts { encrypted: false }',
	driverAccepts('bolt://localhost:7687', { encrypted: false }) === '',
);

check(
	'driver: neo4j+s:// REJECTS { encrypted: false }',
	/not both/i.test(driverAccepts('neo4j+s://x.databases.neo4j.io', { encrypted: false })),
	'this is the failure a hosted URI would hit with the old hardcoded option',
);

check(
	'driver: neo4j+s:// accepts no encryption option',
	driverAccepts('neo4j+s://x.databases.neo4j.io', {}) === '',
);

// ---------------------------------------------------------------------------
// 2. initDatabaseInstance picks options per URI scheme.
//
// A hosted URI must get past driver construction and fail later, on the network.
// The old code could not: it threw synchronously, out of the callback contract.

const initCases = [
	{
		uri: 'bolt://localhost:7687',
		label: 'self-hosted bolt://',
	},
	{
		uri: 'neo4j://localhost:7687',
		label: 'self-hosted routing neo4j://',
	},
	{
		uri: 'neo4j+s://x.databases.neo4j.io',
		label: 'hosted neo4j+s://',
	},
	{
		uri: 'bolt+s://x.databases.neo4j.io:7687',
		label: 'hosted bolt+s://',
	},
	{
		uri: 'neo4j+ssc://x.databases.neo4j.io',
		label: 'hosted neo4j+ssc://',
	},
];

const runInitCases = (remaining, whenDone) => {
	if (!remaining.length) {
		whenDone();
		return;
	}

	const [{ uri, label }, ...rest] = remaining;
	let threw = '';

	const next = (err) => {
		// Every case fails to connect here (nothing is listening), which is expected.
		// What matters is HOW: through the callback, and never with the driver's
		// synchronous "configured either through URL or config" complaint.
		check(`initDatabaseInstance: ${label} does not throw synchronously`, !threw, threw);
		check(
			`initDatabaseInstance: ${label} reports connection failure, not misconfiguration`,
			!!err && !/not both/i.test(err) && !/cannot open driver/i.test(err),
			err ? String(err).split('\n')[0].slice(0, 110) : 'no error at all',
		);
		runInitCases(rest, whenDone);
	};

	try {
		neo4jGen.initDatabaseInstance(
			{ neo4jBoltUri: uri, neo4jUser: 'neo4j', neo4jPassword: 'unused' },
			next,
		);
	} catch (err) {
		threw = err.toString();
		next(threw);
	}
};

// ---------------------------------------------------------------------------
// 3. Bad config still reports cleanly rather than throwing.

const runConfigCases = (whenDone) => {
	neo4jGen.initDatabaseInstance({ neo4jBoltUri: '', neo4jUser: 'neo4j' }, (err) => {
		check('initDatabaseInstance: missing config is reported', /missing required config/.test(err || ''));

		let threw = '';
		const afterBadScheme = (badErr) => {
			check('initDatabaseInstance: unusable URI does not throw synchronously', !threw, threw);
			check(
				'initDatabaseInstance: unusable URI is reported as a driver problem',
				/cannot open driver/.test(badErr || ''),
				badErr ? String(badErr).slice(0, 110) : 'no error at all',
			);
			whenDone();
		};

		try {
			neo4jGen.initDatabaseInstance(
				{ neo4jBoltUri: 'https://not-a-bolt-uri', neo4jUser: 'neo4j', neo4jPassword: 'unused' },
				afterBadScheme,
			);
		} catch (err) {
			threw = err.toString();
			afterBadScheme(threw);
		}
	});
};

// ---------------------------------------------------------------------------

console.log(`neo4j-driver ${require('neo4j-driver/package.json').version}\n`);

runInitCases(initCases, () => {
	runConfigCases(() => {
		console.log('');
		if (errors.length) {
			console.log(`FAILED (${errors.length}):`);
			errors.forEach((one) => console.log(`  - ${one}`));
			process.exit(1);
		}
		console.log('ALL PASSED');
		process.exit(0);
	});
});
