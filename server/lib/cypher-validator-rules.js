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

// ⟪lane GREP, 2026-10-11⟫ the ONLY functions under a blocked prefix that a query may call, each BY ITS EXACT NAME (Neo4j
// resolves a function name case-sensitively: APOC.TEXT.CLEAN is 'Unknown function', measured). APOC's PURE text functions:
// string in, number or string out, no I/O, no procedure. This list must equal the one the graphs are launched with
// (educoreForge replayManager APOC_PURE_TEXT_FUNCTION_NAME_LIST, commit fca4246e), which is the graph's own wall: a gold
// loads no apoc function it does not name. It is declared here by hand, not read from graphContract.json, because adding it
// to the contract changes the contract's sha, and every gold's passport then refuses (graphContractMismatch) until rebuilt.
// test/apoc-text-allowlist-live.test.js holds this list equal to the apoc functions the live graph actually loads.
const APOC_PURE_TEXT_FUNCTION_NAME_LIST = Object.freeze([
	'apoc.text.levenshteinSimilarity',
	'apoc.text.levenshteinDistance',
	'apoc.text.jaroWinklerDistance',
	'apoc.text.sorensenDiceSimilarity',
	'apoc.text.fuzzyMatch',
	'apoc.text.clean',
	'apoc.text.compareCleaned',
]);

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
	// ⟪lane GREP, 2026-10-11⟫ the allow-list above must not open a door beside it. B13 and B14 passed the validator BEFORE this
	// lane (a backtick-quoted or space-separated namespace segment hid the apoc. prefix from the pattern); Neo4j accepts both
	// spellings (apoc.`text`.clean and apoc . text . clean both ran, measured on GOLD_EVAL_261010_forgeClean)
	{ caseId: 'B9', cypher: `RETURN apoc.text.levenshteinSimilarityX('a', 'b')` }, // a near name: one character more
	{ caseId: 'B10', cypher: `RETURN apoc.textlevenshteinSimilarity('a', 'b')` }, // a near name: a dot fewer
	{ caseId: 'B11', cypher: `RETURN apoc.text.clean(apoc.cypher.runFirstColumnSingle("RETURN 1", {})) AS v` }, // an allowed call carrying a blocked one
	{ caseId: 'B12', cypher: `RETURN apoc.cypher.runFirstColumnSingle /* a comment */ ("RETURN 1", {}) AS v` }, // a comment before the parenthesis
	{ caseId: 'B13', cypher: "RETURN `apoc`.cypher.runFirstColumnSingle(\"RETURN 1\", {}) AS v" }, // a backtick-quoted namespace segment
	{ caseId: 'B14', cypher: `RETURN apoc . cypher . runFirstColumnSingle("RETURN 1", {}) AS v` }, // whitespace around the dots
	{ caseId: 'B15', cypher: `CALL apoc.text.clean('x')` }, // a procedure CALL of an allowed FUNCTION name: only the CALL allow-list governs procedures
	{ caseId: 'B16', cypher: `RETURN APOC.TEXT.CLEAN('x')` }, // the allowed name in another case is not the allowed name
	{ caseId: 'B17', cypher: "RETURN apoc.`text`.clean(apoc.`cypher`.runFirstColumnSingle('RETURN 1', {}))" }, // B11 spelled as B13
].map((oneRow) => Object.freeze(oneRow)));

// ⟪lane GREP⟫ reads that must stay VALID beside the bypass cases: the allowed functions however they are spelled, and any
// function name inside a string literal (harmless: a literal is not a call)
const ALLOWED_FUNCTION_READ_CASE_LIST = Object.freeze([
	{ caseId: 'A1', cypher: `MATCH (n:ForgedNode) RETURN n.name, apoc.text.levenshteinSimilarity(apoc.text.clean(n.name), apoc.text.clean($name)) AS s ORDER BY s DESC LIMIT 5` },
	{ caseId: 'A2', cypher: `RETURN apoc.text.levenshteinDistance('a', 'b'), apoc.text.jaroWinklerDistance('a', 'b'), apoc.text.sorensenDiceSimilarity('a', 'b')` },
	{ caseId: 'A3', cypher: `RETURN apoc.text.fuzzyMatch('BrithDate', 'BirthDate'), apoc.text.compareCleaned('Birth Date', 'birthdate')` },
	{ caseId: 'A4', cypher: `RETURN apoc.text.clean /* a comment */ ('A b'), apoc.text.clean\n('C d')` },
	{ caseId: 'A5', cypher: "RETURN apoc.`text`.clean('A b')" },
	{ caseId: 'A6', cypher: `RETURN 'apoc.cypher.runFirstColumnSingle(' AS t, "apoc.load.json('http://x')" AS u` },
].map((oneRow) => Object.freeze(oneRow)));

module.exports = Object.freeze({
	BLOCKED_CLAUSE_PATTERN_LIST,
	BLOCKED_FUNCTION_PREFIX_LIST,
	APOC_PURE_TEXT_FUNCTION_NAME_LIST,
	ALLOWED_CALL_PROCEDURE_LIST,
	VALIDATOR_BYPASS_CASE_LIST,
	ALLOWED_FUNCTION_READ_CASE_LIST,
});
