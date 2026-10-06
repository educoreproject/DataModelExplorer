#!/usr/bin/env node
'use strict';

// __TEST_container-connection-resolver.js — Phase 1 proof gate for the container-name DME
// connection resolver. Run standalone:  node __TEST_container-connection-resolver.js
//
// Proves three things (per PLAN-dme-connection-by-container-name-062026 §Phase 1; re-pointed W-E-11, campaign P1,
// 2026-10-06 — it used to name a retired container, its port, its password and a retired edge type as literals):
//   1. resolveContainerConnection(<the declared golden>) derives a bolt URI, user 'neo4j' and a password purely from
//      the container name. The golden is read from _goldenContainer.ini; the password is checked, never printed.
//   2. A neo4j-driver READ session opened with the RESOLVED triple sees the live graph: its distinct _source count
//      equals its :DmeStandardRoot count, and it holds match edges — both counted live, never expected literals.
//   3. The resolver file is reachable by BOTH the server-relative require string
//      (from a consumer in user-graph/) and the CLI-relative require string
//      (from cli/lib.d/data-model-explorer/) — and both load the same module.
//
// No async/await, no try/catch-for-control-flow: promise .then()/.catch() chains and
// explicit value checks. Exits 0 only when every assertion passes (never fakes a green).

const path = require('path');
const neo4j = require('neo4j-driver');
const { readGoldenContainerName } = require('../../../../test/lib/goldenContainerName');
const GOLDEN_CONTAINER = readGoldenContainerName();

let failures = 0;
const check = (label, actual, expected) => {
	const ok = actual === expected;
	if (!ok) {
		failures += 1;
	}
	console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// --- Gate 3: dual-path requireability ------------------------------------------------
// The real resolver lives one dir up from this test (user-graph/).
const realResolverPath = path.resolve(__dirname, '..', 'container-connection-resolver.js');

// The exact relative string a SERVER consumer in user-graph/ will use.
const serverAnchorDir = path.resolve(__dirname, '..'); // .../server/data-model/lib/user-graph
const serverRequireString = './container-connection-resolver';
const serverResolved = path.resolve(serverAnchorDir, `${serverRequireString}.js`);

// The exact relative string a CLI tool in cli/lib.d/data-model-explorer/ will use.
const cliAnchorDir = path.resolve(__dirname, '../../../../../cli/lib.d/data-model-explorer');
const cliRequireString = '../../../server/data-model/lib/user-graph/container-connection-resolver';
const cliResolved = path.resolve(cliAnchorDir, `${cliRequireString}.js`);

console.log('Gate 3 — dual-path requireability:');
check('server-relative string resolves to the real file', serverResolved, realResolverPath);
check('CLI-relative string resolves to the real file', cliResolved, realResolverPath);

const fromServerPath = require(serverResolved);
const fromCliPath = require(cliResolved);
check('module loaded via server path exposes resolveContainerConnection', typeof fromServerPath.resolveContainerConnection, 'function');
check('module loaded via CLI path exposes resolveContainerConnection', typeof fromCliPath.resolveContainerConnection, 'function');
check('both paths load the identical module object', fromServerPath === fromCliPath, true);

const { resolveContainerConnection } = fromServerPath;

// --- Gate 1: name-only derivation of the connection triple ---------------------------
console.log(`Gate 1 — name-only connection derivation for the declared golden ${GOLDEN_CONTAINER}:`);
const conn = resolveContainerConnection(GOLDEN_CONTAINER);
check('error is null', conn.error, null);
check('boltUri is a localhost bolt URI', /^bolt:\/\/localhost:\d+$/.test(String(conn.boltUri)), true);
check('user', conn.user, 'neo4j');
check('password resolved (non-empty; never printed)', typeof conn.password === 'string' && conn.password.length > 0, true);

// Negative case: an absent container must yield a clear error, never a bad connection.
const missing = resolveContainerConnection('__TEST_definitely_absent_container__');
check('absent container yields an error string', typeof missing.error === 'string' && missing.error.length > 0, true);
check('absent container yields null boltUri', missing.boltUri, null);

if (conn.error) {
	console.log(`\nCannot run Gate 2 — resolver failed for ${GOLDEN_CONTAINER}: ${conn.error}`);
	console.log(`\nRESULT: ${failures} failure(s).`);
	process.exit(1);
}

// --- Gate 2: live graph truth over the RESOLVED triple -------------------------------
console.log('Gate 2 — live golden truth over the resolved triple:');
const driver = neo4j.driver(conn.boltUri, neo4j.auth.basic(conn.user, conn.password), { encrypted: false });
const session = driver.session({ defaultAccessMode: neo4j.session.READ });

const toNum = (record, key) => {
	const value = record.get(key);
	return (value && typeof value.toNumber === 'function') ? value.toNumber() : value;
};

session
	.run('MATCH (n:ForgedNode) WHERE n._source IS NOT NULL WITH count(DISTINCT n._source) AS sourceCount MATCH (r:DmeStandardRoot) RETURN sourceCount, count(r) AS rootCount')
	.then((result) => {
		check('distinct _source count equals the :DmeStandardRoot count (both live)', toNum(result.records[0], 'sourceCount'), toNum(result.records[0], 'rootCount'));
		return session.run('MATCH ()-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference) RETURN count(m) AS c');
	})
	.then((result) => {
		check('the graph holds match edges', toNum(result.records[0], 'c') > 0, true);
		return session.close();
	})
	.then(() => driver.close())
	.then(() => {
		console.log(`\nRESULT: ${failures === 0 ? 'ALL GREEN' : `${failures} FAILURE(S)`}.`);
		process.exit(failures === 0 ? 0 : 1);
	})
	.catch((err) => {
		console.log(`\n[FAIL] live session error: ${err.message}`);
		session.close().then(() => driver.close()).then(() => process.exit(1), () => process.exit(1));
	});
