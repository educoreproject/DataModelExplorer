#!/usr/bin/env node
'use strict';

// ============================================================================
// cypher-validator.js — Read-only Cypher query validation
//
// Determines whether a Cypher string is read-only. String literals, quoted identifiers and comments are blanked out
// FIRST, in one left-to-right pass, so a keyword inside a value is not a clause and a quote inside a comment or an
// identifier cannot open a fake string. The rules are DATA in cypher-validator-rules.js (W-E-9, X1, 2026-10-06).
//
// This is a FILTER. The wall is the READ session every DME path opens (W-E-10): a write that slips past here is still
// refused by Neo4j. A read that FETCHES (LOAD CSV FROM http, an APOC load function) is not a write, so it is refused here.
//
// Usage:
//   const validateReadOnly = require('./lib/cypher-validator');
//   const result = validateReadOnly('MATCH (n) RETURN n');
//   // { valid: true }
//   const bad = validateReadOnly('CREATE (n:Bad) RETURN n');
//   // { valid: false, reason: 'Write operations are not permitted: CREATE' }
// ============================================================================

const {
	BLOCKED_CLAUSE_PATTERN_LIST,
	BLOCKED_FUNCTION_PREFIX_LIST,
	ALLOWED_CALL_PROCEDURE_LIST,
} = require('./cypher-validator-rules');

// one alternation, matched in ENCOUNTER ORDER: block comment, line comment, single-quoted, double-quoted, backtick-quoted
// (a doubled backtick is an escaped one). The old two-pass stripper removed single-quoted strings first, so the
// apostrophe in "it's" opened a 'string' that swallowed the CREATE after it (B1), and a quote in a comment did the same (B4).
const LITERAL_OR_COMMENT_PATTERN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`]|``)*`/g;
// what may survive the blanking only if something was left open
const UNTERMINATED_OPENER_PATTERN = /['"`]|\/\*/;

const stripLiteralsAndComments = (cypher) => cypher.replace(LITERAL_OR_COMMENT_PATTERN, ' ');

const escapeForPattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BLOCKED_FUNCTION_PATTERN = new RegExp(`\\b((?:${BLOCKED_FUNCTION_PREFIX_LIST.map(escapeForPattern).join('|')})[a-zA-Z0-9_.]*)\\s*\\(`, 'i');

const validateReadOnly = (cypherString) => {
	if (!cypherString || typeof cypherString !== 'string') {
		return { valid: false, reason: 'Query string is required' };
	}

	const stripped = stripLiteralsAndComments(cypherString);

	if (UNTERMINATED_OPENER_PATTERN.test(stripped)) {
		return { valid: false, reason: 'unterminated string literal, quoted identifier or comment' };
	}

	const violations = BLOCKED_CLAUSE_PATTERN_LIST.filter((oneRule) => oneRule.pattern.test(stripped)).map((oneRule) => oneRule.name);
	if (violations.length > 0) {
		return {
			valid: false,
			reason: `Write operations are not permitted: ${violations.join(', ')}`,
		};
	}

	const functionMatch = BLOCKED_FUNCTION_PATTERN.exec(stripped);
	if (functionMatch) {
		return { valid: false, reason: `function ${functionMatch[1]} is not permitted` };
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

		const isAllowed = ALLOWED_CALL_PROCEDURE_LIST.some(
			(allowed) => allowed.toLowerCase() === procedureName,
		);
		if (!isAllowed) {
			return {
				valid: false,
				reason: `CALL to procedure '${callMatch[1]}' is not permitted. Allowed procedures: ${ALLOWED_CALL_PROCEDURE_LIST.join(', ')}`,
			};
		}
	}

	return { valid: true };
};

module.exports = validateReadOnly;
