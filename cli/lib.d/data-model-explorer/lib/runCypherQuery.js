'use strict';

// runCypherQuery.js — the data-model-explorer's ONE adapter from neo4j-driver's promise API to TQ's explicit
// callback(err, result) control flow (lane S, 2026-10-05). The driver offers only promises; every caller above
// this line is a callback or a qtools taskList step. A failure reaches the callback as the driver's message
// text, the same text the earlier async/await code surfaced through err.message.

const runCypherQuery = (neo4jSession, cypherText, cypherParameters, callback) => {
	neo4jSession.run(cypherText, cypherParameters).then(
		(queryResult) => callback('', queryResult),
		(queryError) => callback(queryError.message),
	);
};

// ⟪lane GREP, 2026-10-11⟫ the same, bounded by a transaction timeout. Neo4j ending the transaction for its time limit is an
// OUTCOME the caller answers by name (callback('', { timedOut: true })), not an error; any other failure is the message text.
// Neo4j checks the limit BETWEEN operations: a single long evaluation (one regex =~ backtracking) is not interrupted by it
// (measured, DEVLOG-GREP §8), so this bounds work made of many short steps, such as a per-node similarity function.
const TRANSACTION_TIMEOUT_CODE_LIST = Object.freeze(['Neo.ClientError.Transaction.TransactionTimedOut', 'Neo.ClientError.Transaction.TransactionTimedOutClientConfiguration']);
const runCypherQueryWithinTimeLimit = (neo4jSession, cypherText, cypherParameters, timeLimitMilliseconds, callback) => {
	neo4jSession.run(cypherText, cypherParameters, { timeout: timeLimitMilliseconds }).then(
		(queryResult) => callback('', { queryResult }),
		(queryError) => (TRANSACTION_TIMEOUT_CODE_LIST.indexOf(queryError.code) !== -1 ? callback('', { timedOut: true }) : callback(queryError.message)),
	);
};

module.exports = { runCypherQuery, runCypherQueryWithinTimeLimit, TRANSACTION_TIMEOUT_CODE_LIST };
