#!/usr/bin/env node
'use strict';

// ============================================================================
// cypher-validator.test.js — Tests for read-only Cypher validation
// ============================================================================

const validateReadOnly = require('./cypher-validator');

let passed = 0;
let failed = 0;

const assert = (testName, result, expectedValid) => {
	const ok = result.valid === expectedValid;
	if (ok) {
		passed++;
		console.log(`  PASS: ${testName}`);
	} else {
		failed++;
		console.log(`  FAIL: ${testName}`);
		console.log(`    Expected valid=${expectedValid}, got valid=${result.valid}`);
		if (result.reason) {
			console.log(`    Reason: ${result.reason}`);
		}
	}
};

console.log('\n=== Cypher Validator Tests ===\n');

// --- Should PASS (read-only) ---
console.log('Read-only queries (should pass):');

assert(
	'Simple MATCH/RETURN',
	validateReadOnly('MATCH (n) RETURN n'),
	true,
);

assert(
	'Property contains "set" (lowercase in value)',
	validateReadOnly("MATCH (n:CedsClass) WHERE n.label CONTAINS 'set' RETURN n"),
	true,
);

assert(
	'String literal contains CREATE keyword',
	validateReadOnly("MATCH (n) WHERE n.name = 'CREATE' RETURN n"),
	true,
);

assert(
	'OPTIONAL MATCH with relationship traversal',
	validateReadOnly('OPTIONAL MATCH (a)-[r]->(b) RETURN a, type(r), b'),
	true,
);

assert(
	'ORDER BY and LIMIT',
	validateReadOnly('MATCH (n) RETURN n ORDER BY n.name LIMIT 10'),
	true,
);

assert(
	'WITH and UNWIND',
	validateReadOnly('MATCH (n) WITH n.label AS label UNWIND [1,2,3] AS x RETURN label, x'),
	true,
);

// --- Should FAIL (write operations) ---
console.log('\nWrite queries (should fail):');

assert(
	'CREATE node',
	validateReadOnly('CREATE (n:Bad) RETURN n'),
	false,
);

assert(
	'SET property',
	validateReadOnly("MATCH (n) SET n.name = 'bad'"),
	false,
);

assert(
	'DELETE node',
	validateReadOnly('MATCH (n) DELETE n'),
	false,
);

assert(
	'DETACH DELETE',
	validateReadOnly('MATCH (n) DETACH DELETE n'),
	false,
);

assert(
	'MERGE',
	validateReadOnly('MERGE (n:Bad {id: 1})'),
	false,
);

assert(
	'REMOVE property',
	validateReadOnly('MATCH (n) REMOVE n.prop'),
	false,
);

assert(
	'DROP INDEX',
	validateReadOnly('DROP INDEX ON :Person(name)'),
	false,
);

assert(
	'LOAD CSV',
	validateReadOnly("LOAD CSV FROM 'file:///bad.csv' AS row RETURN row"),
	false,
);

assert(
	'Mixed case CrEaTe',
	validateReadOnly('CrEaTe (n:MixedCase)'),
	false,
);

// --- CALL gating (allowlist) ---
console.log('\nCALL gating — allowlisted procedures (should pass):');

assert(
	'CALL db.labels()',
	validateReadOnly('CALL db.labels() YIELD label RETURN label'),
	true,
);

assert(
	'CALL db.schema.visualization()',
	validateReadOnly('CALL db.schema.visualization()'),
	true,
);

assert(
	'CALL db.index.vector.queryNodes',
	validateReadOnly(
		"CALL db.index.vector.queryNodes('golden_vector', 10, $embedding) YIELD node, score RETURN node.name, score",
	),
	true,
);

assert(
	'CALL db.index.fulltext.queryNodes',
	validateReadOnly(
		"CALL db.index.fulltext.queryNodes('someIndex', $query) YIELD node RETURN node",
	),
	true,
);

assert(
	'Mixed case CALL DB.LABELS()',
	validateReadOnly('CALL DB.LABELS() YIELD label RETURN label'),
	true,
);

assert(
	'String literal containing CALL apoc',
	validateReadOnly("MATCH (n) WHERE n.name = 'CALL apoc.load.json' RETURN n"),
	true,
);

console.log('\nCALL gating — non-allowlisted (should fail):');

assert(
	'CALL apoc.load.json',
	validateReadOnly("CALL apoc.load.json('https://bad.example/x') YIELD value RETURN value"),
	false,
);

assert(
	'CALL apoc.periodic.iterate',
	validateReadOnly("CALL apoc.periodic.iterate('MATCH (n) RETURN n', 'RETURN 1', {})"),
	false,
);

assert(
	'CALL dbms.listConfig',
	validateReadOnly('CALL dbms.listConfig() YIELD name RETURN name'),
	false,
);

assert(
	'CALL dbms.components',
	validateReadOnly('CALL dbms.components() YIELD name, versions RETURN name, versions'),
	false,
);

assert(
	'CALL { subquery }',
	validateReadOnly('MATCH (n) CALL { WITH n MATCH (n)-[r]->(m) RETURN m } RETURN n, m'),
	false,
);

assert(
	'CALL { } IN TRANSACTIONS',
	validateReadOnly('CALL { MATCH (n) RETURN n } IN TRANSACTIONS OF 100 ROWS RETURN 1'),
	false,
);

assert(
	'CALL db.createLabel (not allowlisted)',
	validateReadOnly("CALL db.createLabel('Sneaky')"),
	false,
);

assert(
	'Allowlisted CALL followed by disallowed CALL',
	validateReadOnly(
		'CALL db.labels() YIELD label CALL dbms.listConfig() YIELD name RETURN label, name',
	),
	false,
);

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
