'use strict';

// ============================================================================
// cypher-validator-rules.js — the read-only Cypher validator's rules AS DATA (W-E-9, X1; campaign P0, 2026-10-06).
// Read by cypher-validator.js AND by its test, so a rule and the case that proves it are declared once.
//
// The validator is a FILTER; the READ session is the WALL (W-E-10). A READ session cannot stop a read that fetches
// (LOAD CSV FROM http, an APOC load function), so those are refused here by name as well.
// ============================================================================

// one row per refused clause; each pattern runs over the query AFTER string literals, quoted identifiers and comments
// are blanked out (cypher-validator.js stripLiteralsAndComments)
const BLOCKED_CLAUSE_PATTERN_LIST = Object.freeze([
	{ name: 'CREATE', pattern: /\bCREATE\b/i },
	{ name: 'MERGE', pattern: /\bMERGE\b/i },
	{ name: 'DELETE', pattern: /\bDELETE\b/i },
	{ name: 'DETACH', pattern: /\bDETACH\b/i },
	{ name: 'SET', pattern: /\bSET\b/i },
	{ name: 'REMOVE', pattern: /\bREMOVE\b/i },
	{ name: 'DROP', pattern: /\bDROP\b/i },
	{ name: 'FOREACH', pattern: /\bFOREACH\b/i },
	{ name: 'LOAD CSV', pattern: /\bLOAD\s+CSV\b/i }, // B2: any whitespace between the two words
	{ name: 'SHOW', pattern: /\bSHOW\b/i }, // B3: SHOW USERS / SHOW DATABASES and the rest of the admin surface
	{ name: 'USE', pattern: /^\s*USE\b/im }, // B6: switching to another database (system included)
	{ name: 'TERMINATE', pattern: /\bTERMINATE\b/i }, // B7
	{ name: 'ALTER', pattern: /\bALTER\b/i },
	{ name: 'GRANT', pattern: /\bGRANT\b/i },
	{ name: 'DENY', pattern: /\bDENY\b/i },
	{ name: 'REVOKE', pattern: /\bREVOKE\b/i },
].map((oneRow) => Object.freeze(oneRow)));

// B5: a FUNCTION has no CALL, so the CALL gate never sees apoc.cypher.runFirstColumnSingle(...) or apoc.load.* functions
const BLOCKED_FUNCTION_PREFIX_LIST = Object.freeze(['apoc.']);

// CALL is allowlist-gated: only these read-only introspection / index procedures. Everything else — apoc.*, dbms.*,
// db.createIndex, and CALL { } subqueries — is refused. (Unchanged from the eight the validator carried before.)
const ALLOWED_CALL_PROCEDURE_LIST = Object.freeze([
	'db.labels',
	'db.relationshipTypes',
	'db.propertyKeys',
	'db.schema.visualization',
	'db.schema.nodeTypeProperties',
	'db.schema.relTypeProperties',
	'db.index.vector.queryNodes',
	'db.index.fulltext.queryNodes',
]);

// the bypasses the 2026-10-06 survey reproduced against the old validator (all seven answered { valid: true }), plus
// B8, found while writing the tokenizer: a backtick-quoted identifier holding a quote character opened a fake string
const VALIDATOR_BYPASS_CASE_LIST = Object.freeze([
	{ caseId: 'B1', cypher: `WITH "it's" AS a CREATE (n:X) RETURN 'z'` },
	{ caseId: 'B2', cypher: `LOAD  CSV FROM "http://x" AS r RETURN r` },
	{ caseId: 'B3', cypher: `SHOW USERS` },
	{ caseId: 'B4', cypher: `MATCH (n) /* ' */ CREATE (m:X) /* ' */ RETURN 1` },
	{ caseId: 'B5', cypher: `RETURN apoc.cypher.runFirstColumnSingle("CALL apoc.load.json('http://x') YIELD value RETURN value", {}) AS v` },
	{ caseId: 'B6', cypher: `USE system MATCH (n) RETURN n` },
	{ caseId: 'B7', cypher: `TERMINATE TRANSACTIONS "neo4j-transaction-1"` },
	{ caseId: 'B8', cypher: "MATCH (n:`'`) CREATE (m:X) RETURN '`'" },
].map((oneRow) => Object.freeze(oneRow)));

module.exports = Object.freeze({
	BLOCKED_CLAUSE_PATTERN_LIST,
	BLOCKED_FUNCTION_PREFIX_LIST,
	ALLOWED_CALL_PROCEDURE_LIST,
	VALIDATOR_BYPASS_CASE_LIST,
});
