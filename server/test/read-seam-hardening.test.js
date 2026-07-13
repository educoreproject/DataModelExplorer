'use strict';
// Read-seam hardening gate (DME/Slack plan v3, task 1.0).
// Proves against the LIVE golden container:
//   1. a write through the hardened runQuery seam is refused by Neo4j itself
//      (READ access mode), not just the validator denylist
//   2. a deliberately heavy query dies at the transaction timeout
//   3. runTransaction remains write-capable (exercised with a rollback so the
//      golden graph is never actually modified)
//   4. the dme-cypher-query access point enforces a real LIMIT before execution
//   5. the access point rejects non-allowlisted CALL through the same seam
//
// Run: node server/test/read-seam-hardening.test.js   (needs Docker + golden up)

process.global = {
	getConfig: (name) => ({}),
	xLog: {
		status: () => {},
		error: () => {},
		verbose: () => {},
		result: () => {},
	},
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const {
	resolveContainerConnection,
} = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({
	unused: true,
});

const GOLDEN_CONTAINER = process.env.GOLDEN_CONTAINER || 'gf_pvsEcand';

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

const conn = resolveContainerConnection(GOLDEN_CONTAINER);
if (conn.error) {
	console.error(`Cannot resolve golden connection: ${conn.error}`);
	process.exit(1);
}

let hardenedDb;
let accessPointFn;

console.log(`\n=== Read-seam hardening gate (golden: ${GOLDEN_CONTAINER}) ===\n`);

series(
	[
		// ------------------------------------------------------------------
		// connect with the hardened options the golden seam uses
		(next) => {
			neo4jGen.initDatabaseInstance(
				{
					neo4jBoltUri: conn.boltUri,
					neo4jUser: conn.user,
					neo4jPassword: conn.password,
					readOnly: true,
					queryTimeoutMs: 2000,
				},
				(err, db) => {
					if (err) {
						next(`hardened connect failed: ${err}`);
						return;
					}
					hardenedDb = db;
					next();
				},
			);
		},

		// ------------------------------------------------------------------
		// 1. write through the READ seam is refused by Neo4j itself
		(next) => {
			hardenedDb.runQuery(
				'CREATE (n:__ReadSeamHardeningTestNode__ {stamp: $stamp}) RETURN n',
				{ stamp: 'seam-test' },
				(err) => {
					ok(
						'write via runQuery refused by READ mode',
						err && /read|write/i.test(String(err)),
						err ? String(err).slice(0, 90) : 'NO ERROR — WRITE WENT THROUGH',
					);
					next();
				},
			);
		},

		// confirm nothing was created (belt and suspenders)
		(next) => {
			hardenedDb.runQuery(
				'MATCH (n:__ReadSeamHardeningTestNode__) RETURN count(n) AS c',
				{},
				(err, records) => {
					ok(
						'no test node exists after refused write',
						!err && records && records[0] && records[0].c === 0,
					);
					next();
				},
			);
		},

		// ------------------------------------------------------------------
		// 2. deliberately heavy query dies at the timeout (2s on this handle)
		(next) => {
			// the WHERE predicate defeats the count-store shortcut, forcing real
			// enumeration of node pairs — minutes of work, killed at the 2s timeout
			const startedAt = Date.now();
			hardenedDb.runQuery(
				'MATCH (a), (b) WHERE a.name < b.name RETURN count(*) AS boom',
				{},
				(err) => {
					const elapsedMs = Date.now() - startedAt;
					ok(
						'heavy query killed at timeout',
						err &&
							elapsedMs >= 1500 &&
							elapsedMs < 15000 &&
							/timeout|terminated/i.test(String(err)),
						err
							? `${elapsedMs}ms — ${String(err).slice(0, 90)}`
							: `completed in ${elapsedMs}ms — NOT killed`,
					);
					next();
				},
			);
		},

		// ------------------------------------------------------------------
		// 3. runTransaction is still write-capable (rollback keeps golden clean)
		(next) => {
			hardenedDb.runTransaction((tx, done) => {
				tx.run(
					'CREATE (n:__ReadSeamHardeningTestNode__ {stamp: $stamp}) RETURN n.stamp AS stamp',
					{ stamp: 'tx-test' },
					(err, records) => {
						const wroteInsideTx =
							!err && records && records[0] && records[0].stamp === 'tx-test';
						ok(
							'runTransaction write executes inside tx',
							wroteInsideTx,
							err ? String(err).slice(0, 90) : undefined,
						);
						done('deliberate-rollback-keep-golden-clean');
					},
				);
			}, () => next());
		},

		// confirm the rollback left nothing behind
		(next) => {
			hardenedDb.runQuery(
				'MATCH (n:__ReadSeamHardeningTestNode__) RETURN count(n) AS c',
				{},
				(err, records) => {
					ok(
						'rollback left golden unchanged',
						!err && records && records[0] && records[0].c === 0,
					);
					next();
				},
			);
		},

		// ------------------------------------------------------------------
		// load the access point with the hardened db for LIMIT + CALL gating
		(next) => {
			const registry = {};
			const dotD = {
				logList: [],
				library: {
					add: (name, fn) => {
						registry[name] = fn;
					},
				},
			};
			require('../data-model/access-points-dot-d/accessPoints.d/dme-cypher-query')(
				{ dotD, passThroughParameters: { neo4jDb: hardenedDb } },
			);
			accessPointFn = registry['dme-cypher-query'];
			ok('access point loads with hardened db', typeof accessPointFn === 'function');
			next();
		},

		// 4a. query with no LIMIT comes back capped
		(next) => {
			accessPointFn(
				{ action: 'query', query: 'MATCH (n) RETURN n.name' },
				(err, result) => {
					ok(
						'un-LIMITed query capped by enforced LIMIT',
						!err && Array.isArray(result) && result.length <= 100,
						err ? String(err).slice(0, 90) : `rows: ${result && result.length}`,
					);
					next();
				},
			);
		},

		// 4b. oversized trailing LIMIT clamped
		(next) => {
			accessPointFn(
				{ action: 'query', query: 'MATCH (n) RETURN n.name LIMIT 5000' },
				(err, result) => {
					ok(
						'oversized LIMIT clamped to cap',
						!err && Array.isArray(result) && result.length <= 100,
						err ? String(err).slice(0, 90) : `rows: ${result && result.length}`,
					);
					next();
				},
			);
		},

		// 4c. small LIMIT untouched
		(next) => {
			accessPointFn(
				{ action: 'query', query: 'MATCH (n) RETURN n.name LIMIT 5' },
				(err, result) => {
					ok(
						'small LIMIT untouched',
						!err && Array.isArray(result) && result.length === 5,
						err ? String(err).slice(0, 90) : `rows: ${result && result.length}`,
					);
					next();
				},
			);
		},

		// 5. non-allowlisted CALL rejected at the access point
		(next) => {
			accessPointFn(
				{ action: 'query', query: 'CALL dbms.listConfig() YIELD name RETURN name' },
				(err) => {
					ok(
						'CALL dbms.* rejected through access point',
						err && /not permitted/i.test(String(err)),
						err ? String(err).slice(0, 90) : 'NO ERROR',
					);
					next();
				},
			);
		},
	],
	(err) => {
		if (hardenedDb) {
			hardenedDb.close();
		}
		if (err) {
			console.error(`\nGate aborted: ${err}`);
			process.exit(1);
		}
		const failed = results.filter(([, pass]) => !pass).length;
		console.log(
			`\n=== Results: ${results.length - failed} passed, ${failed} failed ===\n`,
		);
		process.exit(failed > 0 ? 1 : 0);
	},
);
