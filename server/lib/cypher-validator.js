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
//   // { valid: false, reason: 'Not permitted on this read-only path (writes, admin and database switching are refused): CREATE' }
// ============================================================================

const {
	BLOCKED_CLAUSE_PATTERN_LIST,
	BLOCKED_FUNCTION_PREFIX_LIST,
	APOC_PURE_TEXT_FUNCTION_NAME_LIST,
	ALLOWED_CALL_PROCEDURE_LIST,
} = require('./cypher-validator-rules');

// one alternation, matched in ENCOUNTER ORDER: block comment, line comment, single-quoted, double-quoted, backtick-quoted
// (a doubled backtick is an escaped one). The old two-pass stripper removed single-quoted strings first, so the
// apostrophe in "it's" opened a 'string' that swallowed the CREATE after it (B1), and a quote in a comment did the same (B4).
const LITERAL_OR_COMMENT_PATTERN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`]|``)*`/g;
// what may survive the blanking only if something was left open
const UNTERMINATED_OPENER_PATTERN = /['"`]|\/\*/;

const stripLiteralsAndComments = (cypher) => cypher.replace(LITERAL_OR_COMMENT_PATTERN, ' ');

// ⟪lane GREP, 2026-10-11⟫ FUNCTION NAMES are read from their own normalisation of the query, because Neo4j accepts a
// qualified name spelled in pieces: apoc.`text`.clean( and apoc . text . clean( both call apoc.text.clean (measured). The
// literal blanking above turns a backtick-quoted segment into a space, which hid the apoc. prefix (B13); and the old prefix
// pattern wanted 'apoc.' unbroken (B14). Here comments and string literals are blanked as before, but a backtick-quoted
// identifier is replaced by its own text when that text is a plain identifier (no other kind can spell an apoc name, so
// the rest become QUOTED_NON_PLAIN_IDENTIFIER), whitespace around a dot is closed up, and EVERY qualified call is read —
// not only the first, so an allowed call cannot carry a blocked one inside it (B11).
const PLAIN_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const QUOTED_NON_PLAIN_IDENTIFIER_TEXT = 'QUOTED_NON_PLAIN_IDENTIFIER';
const functionNameTextOf = (cypher) =>
	cypher
		.replace(LITERAL_OR_COMMENT_PATTERN, (literalText) => {
			if (!literalText.startsWith('`')) {
				return ' ';
			}
			const identifierText = literalText.slice(1, -1).replace(/``/g, '`');
			return PLAIN_IDENTIFIER_PATTERN.test(identifierText) ? identifierText : QUOTED_NON_PLAIN_IDENTIFIER_TEXT;
		})
		.replace(/\s*\.\s*/g, '.');
// a qualified name (two or more dotted identifiers) followed, after any whitespace, by an opening parenthesis
const QUALIFIED_CALL_PATTERN = /(?<![A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)\s*\(/g;
const blockedFunctionNameListOf = (cypher) =>
	Array.from(functionNameTextOf(cypher).matchAll(QUALIFIED_CALL_PATTERN), (callMatch) => callMatch[1]).filter(
		(functionName) =>
			BLOCKED_FUNCTION_PREFIX_LIST.some((blockedPrefix) => functionName.toLowerCase().startsWith(blockedPrefix.toLowerCase())) &&
			APOC_PURE_TEXT_FUNCTION_NAME_LIST.indexOf(functionName) === -1,
	);

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
			reason: `Not permitted on this read-only path (writes, admin and database switching are refused): ${violations.join(', ')}`,
		};
	}

	const blockedFunctionNameList = blockedFunctionNameListOf(cypherString);
	if (blockedFunctionNameList.length > 0) {
		return { valid: false, reason: `function ${blockedFunctionNameList.join(', ')} is not permitted (of the ${BLOCKED_FUNCTION_PREFIX_LIST.join(', ')} functions only these are: ${APOC_PURE_TEXT_FUNCTION_NAME_LIST.join(', ')})` };
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
