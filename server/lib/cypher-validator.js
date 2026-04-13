#!/usr/bin/env node
'use strict';

// ============================================================================
// cypher-validator.js — Read-only Cypher query validation
//
// Determines whether a Cypher string is read-only by scanning for blocked
// write keywords. Strips string literals before scanning to avoid false
// positives on keywords inside quoted values.
//
// Usage:
//   const validateReadOnly = require('./lib/cypher-validator');
//   const result = validateReadOnly('MATCH (n) RETURN n');
//   // { valid: true }
//   const bad = validateReadOnly('CREATE (n:Bad) RETURN n');
//   // { valid: false, reason: 'Write operations are not permitted: CREATE' }
// ============================================================================

const blockedKeywords = [
	'CREATE',
	'MERGE',
	'DELETE',
	'DETACH',
	'SET',
	'REMOVE',
	'DROP',
	'LOAD CSV',
	'FOREACH',
];

const stripStringLiterals = (cypher) => {
	// Remove single-quoted and double-quoted string literals to prevent
	// false positives on keywords inside strings like WHERE n.name = 'CREATE'
	return cypher
		.replace(/'(?:[^'\\]|\\.)*'/g, "''")
		.replace(/"(?:[^"\\]|\\.)*"/g, '""');
};

const validateReadOnly = (cypherString) => {
	if (!cypherString || typeof cypherString !== 'string') {
		return { valid: false, reason: 'Query string is required' };
	}

	const stripped = stripStringLiterals(cypherString);

	const violations = [];

	for (const keyword of blockedKeywords) {
		// LOAD CSV is a two-word keyword — match as-is with word boundaries
		const pattern = keyword.includes(' ')
			? new RegExp(`\\b${keyword}\\b`, 'i')
			: new RegExp(`\\b${keyword}\\b`, 'i');

		if (pattern.test(stripped)) {
			violations.push(keyword);
		}
	}

	if (violations.length > 0) {
		return {
			valid: false,
			reason: `Write operations are not permitted: ${violations.join(', ')}`,
		};
	}

	return { valid: true };
};

module.exports = validateReadOnly;
