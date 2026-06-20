#!/usr/bin/env node
'use strict';

// __TEST_container-connection-resolver.js — Phase 1 proof gate for the container-name DME
// connection resolver. Run standalone:  node __TEST_container-connection-resolver.js
//
// Proves three things (per PLAN-dme-connection-by-container-name-062026 §Phase 1):
//   1. resolveContainerConnection('gf_golden') derives boltUri bolt://localhost:7704,
//      user 'neo4j', password 'ibirNVH_...' purely from the container name.
//   2. A neo4j-driver session opened with the RESOLVED triple sees golden truth:
//      5254 IMPLIED_MAPPING edges and 2 distinct _source standards.
//   3. The resolver file is reachable by BOTH the server-relative require string
//      (from a consumer in user-graph/) and the CLI-relative require string
//      (from cli/lib.d/data-model-explorer/) — and both load the same module.
//
// No async/await, no try/catch-for-control-flow: promise .then()/.catch() chains and
// explicit value checks. Exits 0 only when every assertion passes (never fakes a green).

const path = require('path');
const neo4j = require('neo4j-driver');

const EXPECTED = {
	boltUri: 'bolt://localhost:7704',
	user: 'neo4j',
	password: 'ibirNVH_7i0wHM62ERdApt2rJmfL__LSmfKMDyxPjk4',
	impliedMapping: 5254,
	distinctSource: 2,
};

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
console.log('Gate 1 — name-only connection derivation for gf_golden:');
const conn = resolveContainerConnection('gf_golden');
check('error is null', conn.error, null);
check('boltUri', conn.boltUri, EXPECTED.boltUri);
check('user', conn.user, EXPECTED.user);
check('password', conn.password, EXPECTED.password);

// Negative case: an absent container must yield a clear error, never a bad connection.
const missing = resolveContainerConnection('__TEST_definitely_absent_container__');
check('absent container yields an error string', typeof missing.error === 'string' && missing.error.length > 0, true);
check('absent container yields null boltUri', missing.boltUri, null);

if (conn.error) {
	console.log(`\nCannot run Gate 2 — resolver failed for gf_golden: ${conn.error}`);
	console.log(`\nRESULT: ${failures} failure(s).`);
	process.exit(1);
}

// --- Gate 2: live graph truth over the RESOLVED triple -------------------------------
console.log('Gate 2 — live golden truth over the resolved triple:');
const driver = neo4j.driver(conn.boltUri, neo4j.auth.basic(conn.user, conn.password), { encrypted: false });
const session = driver.session();

const toNum = (record, key) => {
	const value = record.get(key);
	return (value && typeof value.toNumber === 'function') ? value.toNumber() : value;
};

session
	.run('MATCH ()-[r:IMPLIED_MAPPING]->() RETURN count(r) AS c')
	.then((result) => {
		check('IMPLIED_MAPPING count', toNum(result.records[0], 'c'), EXPECTED.impliedMapping);
		return session.run('MATCH (n) WHERE n._source IS NOT NULL RETURN count(DISTINCT n._source) AS c');
	})
	.then((result) => {
		check('distinct _source standards', toNum(result.records[0], 'c'), EXPECTED.distinctSource);
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
