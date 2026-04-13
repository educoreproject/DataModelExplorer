#!/usr/bin/env node
'use strict';

// ============================================================================
// schema-provider.test.js — Tests for DME graph schema provider
// ============================================================================

const getSchemaDescription = require('./schema-provider');

let passed = 0;
let failed = 0;

const assert = (testName, condition) => {
	if (condition) {
		passed++;
		console.log(`  PASS: ${testName}`);
	} else {
		failed++;
		console.log(`  FAIL: ${testName}`);
	}
};

console.log('\n=== Schema Provider Tests ===\n');

const schema = getSchemaDescription();

// Test 1: Non-empty string
assert('Returns a non-empty string', typeof schema === 'string' && schema.length > 0);

// Test 2: All 8 node labels present
const nodeLabels = [
	'SifObject',
	'SifXmlElement',
	'SifField',
	'SifCodeset',
	'CedsClass',
	'CedsProperty',
	'CedsOptionSet',
	'CedsOptionValue',
];

for (const label of nodeLabels) {
	assert(`Contains node label: ${label}`, schema.includes(label));
}

// Test 3: All 9 relationship types present
const relationships = [
	'HAS_ROOT_ELEMENT',
	'CHILD_ELEMENT',
	'REALIZED_BY',
	'HAS_TYPE',
	'CONSTRAINED_BY',
	'MAPS_TO',
	'HAS_PROPERTY',
	'HAS_OPTION_SET',
	'HAS_VALUE',
];

for (const rel of relationships) {
	assert(`Contains relationship: ${rel}`, schema.includes(rel));
}

// Test 4: At least 3 example Cypher queries (look for MATCH)
const matchCount = (schema.match(/MATCH/g) || []).length;
assert(`Contains at least 3 MATCH statements (found ${matchCount})`, matchCount >= 3);

// Test 5: Contains both standards
assert('Mentions CEDS v14', schema.includes('CEDS v14'));
assert('Mentions SIF', schema.includes('SIF'));

// Print first 50 lines for the dev log
console.log('\n--- Schema output (first 50 lines) ---');
const lines = schema.split('\n');
console.log(lines.slice(0, 50).join('\n'));
console.log(`... (${lines.length} total lines)\n`);

// --- Summary ---
console.log(`=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
