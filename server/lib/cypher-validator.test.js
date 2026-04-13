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

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
