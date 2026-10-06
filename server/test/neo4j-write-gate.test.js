'use strict';
// neo4j-write-gate.test.js — W-E-10 (X2, campaign P0, 2026-10-06), the server half. A connection gets a WRITE path only
// by asking for it BY NAME (initDatabaseInstance({ ..., writeCapable: true })); without it runTransaction refuses before
// the caller's function runs. The golden DME handle (data-model.js) never asks, so golden has no write path at all, and
// the Use Case Editor's save (the only golden writer) is refused by name until A11 decides where it writes. The user
// cypher-query access point opens its clone connection READ-ONLY with the golden handle's timeout.
//
// LIVE half on a SCRATCH Neo4j only (DME_SCRATCH_BOLT_URI + DME_SCRATCH_NEO4J_PASSWORD; refused when unset; never the
// golden graph). The structural half reads the two access-point sources.
//
//   DME_SCRATCH_BOLT_URI=bolt://localhost:7891 DME_SCRATCH_NEO4J_PASSWORD=... node server/test/neo4j-write-gate.test.js

const fs = require('fs');
const path = require('path');

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};
const finish = () => {
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed > 0 ? 1 : 0);
};

console.log('\n=== W-E-10 server half: no write path unless asked for by name ===\n');

// structural: the golden handle never asks for writes; the user query handle opens read-only with a timeout
const dataModelText = fs.readFileSync(path.join(__dirname, '..', 'data-model', 'data-model.js'), 'utf8');
ok('the golden DME handle (data-model.js) does NOT pass writeCapable', !/writeCapable\s*:/.test(dataModelText));
const userQueryText = fs.readFileSync(path.join(__dirname, '..', 'data-model', 'access-points-dot-d', 'accessPoints.d', 'dme-user-cypher-query.js'), 'utf8');
const userInitCall = (userQueryText.match(/initDatabaseInstance\(\s*\{[\s\S]*?\}/) || [''])[0];
ok('dme-user-cypher-query opens its clone connection readOnly: true', /readOnly:\s*true/.test(userInitCall), userInitCall.replace(/\s+/g, ' '));
ok('  with a queryTimeoutMs', /queryTimeoutMs:/.test(userInitCall));
ok('  and the false "read-only enforced this phase" comment is gone', !/read-only enforced this phase/.test(userQueryText));

const scratchBoltUri = process.env.DME_SCRATCH_BOLT_URI;
const scratchPassword = process.env.DME_SCRATCH_NEO4J_PASSWORD;
if (!scratchBoltUri || !scratchPassword) {
	console.log('\nREFUSED: the live half needs DME_SCRATCH_BOLT_URI and DME_SCRATCH_NEO4J_PASSWORD naming a SCRATCH Neo4j; there is no default.');
	failed++;
	finish();
}
const scratchConnection = { neo4jBoltUri: scratchBoltUri, neo4jUser: 'neo4j', neo4jPassword: scratchPassword };

// the golden-shaped handle: readOnly, timeout, no writeCapable
neo4jGen.initDatabaseInstance({ ...scratchConnection, readOnly: true, queryTimeoutMs: 30000 }, (initError, readHandle) => {
	ok('a golden-shaped handle (readOnly, no writeCapable) connects', !initError, initError);
	let userFunctionRan = false;
	readHandle.runTransaction((tx, done) => {
		userFunctionRan = true;
		tx.run('CREATE (n:P0WriteGateProbe {via: "goldenShapedRunTransaction"}) RETURN n', {}, (runError) => done(runError || '', 'wrote'));
	}, (transactionError) => {
		ok('runTransaction on it REFUSES BY NAME', /this connection was opened read-only; pass writeCapable:true by name/.test(transactionError || ''), transactionError || 'it committed');
		ok('  before the caller\'s function ever ran (the Use Case Editor save cannot reach tx.run)', !userFunctionRan);
		readHandle.runQuery('CREATE (n:P0WriteGateProbe {via: "goldenShapedRunQuery"}) RETURN n', {}, (queryError) => {
			ok('and runQuery on it is refused by Neo4j (READ access mode)', /AccessMode|read access mode/i.test(queryError || ''), queryError || 'it wrote');
			readHandle.close();
			neo4jGen.initDatabaseInstance({ ...scratchConnection, writeCapable: true }, (writeInitError, writeHandle) => {
				ok('a handle that asks for writeCapable BY NAME connects', !writeInitError, writeInitError);
				writeHandle.runTransaction((tx, done) => {
					tx.run('CREATE (n:P0WriteGateProbe {via: "writeCapableRollback"}) RETURN count(n) AS created', {}, (runError, rows) => done(runError || 'ROLLBACK ON PURPOSE', rows));
				}, (rollbackError, rows) => {
					ok('  and its runTransaction reaches tx.run (rolled back on purpose; the write path is real)', rollbackError === 'ROLLBACK ON PURPOSE' && rows && rows[0] && rows[0].created === 1, `${rollbackError} ${JSON.stringify(rows)}`);
					writeHandle.runQuery('MATCH (n:P0WriteGateProbe) RETURN count(n) AS probeCount', {}, (countError, countRows) => {
						ok('and the scratch graph holds NO probe node afterwards', !countError && countRows[0].probeCount === 0, countError || JSON.stringify(countRows));
						writeHandle.close();
						finish();
					});
				});
			});
		});
	});
});
