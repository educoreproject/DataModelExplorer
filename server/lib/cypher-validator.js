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

// CALL is allowlist-gated, not keyword-blocked: only these read-only
// introspection/index procedures may be invoked. Everything else —
// apoc.*, dbms.*, db.createIndex, and CALL { } subqueries — is rejected.
// The askMilo graph tools do NOT pass through this validator (they hold
// their own bolt connection), so this list serves the HTTP/MCP/Slack seam only.
const allowedCallProcedures = [
	'db.labels',
	'db.relationshipTypes',
	'db.propertyKeys',
	'db.schema.visualization',
	'db.schema.nodeTypeProperties',
	'db.schema.relTypeProperties',
	'db.index.vector.queryNodes',
	'db.index.fulltext.queryNodes',
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

	// CALL gating: every CALL must name an allowlisted procedure. A CALL
	// followed by anything other than an allowlisted procedure name — a
	// subquery brace, apoc.*, dbms.*, an unknown procedure — is rejected.
	const callPattern = /\bCALL\b\s*([a-zA-Z0-9_.]*)/gi;
	let callMatch;
	while ((callMatch = callPattern.exec(stripped)) !== null) {
		const procedureName = callMatch[1].toLowerCase();

		if (!procedureName) {
			return {
				valid: false,
				reason: 'CALL subqueries are not permitted',
			};
		}

		const isAllowed = allowedCallProcedures.some(
			(allowed) => allowed.toLowerCase() === procedureName,
		);
		if (!isAllowed) {
			return {
				valid: false,
				reason: `CALL to procedure '${callMatch[1]}' is not permitted. Allowed procedures: ${allowedCallProcedures.join(', ')}`,
			};
		}
	}

	return { valid: true };
};

module.exports = validateReadOnly;
