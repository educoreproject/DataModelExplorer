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

module.exports = { runCypherQuery };
