'use strict';

// indexer.js — Create BM25 full-text index for CEDS Ontology nodes

const createFullTextIndex = async ({ neo4jBoltUri, neo4jUser, neo4jPassword }) => {
	const neo4j = require('neo4j-driver');
	const { xLog } = process.global;

	xLog.status('[indexer] Creating BM25 full-text index...');
	const driver = neo4j.driver(neo4jBoltUri, neo4j.auth.basic(neo4jUser, neo4jPassword));

	try {
		await driver.verifyConnectivity();
		xLog.status('[indexer] Connected to Neo4j.');
	} catch (err) {
		throw new Error(`Cannot connect to Neo4j: ${err.message}`);
	}

	const session = driver.session();

	try {
		xLog.status('[indexer] Creating fulltext index ceds14_fulltext...');
		await session.run(`
			CREATE FULLTEXT INDEX ceds14_fulltext IF NOT EXISTS
			FOR (n:CedsClass|CedsProperty|CedsOptionSet|CedsOptionValue)
			ON EACH [n.label, n.description, n.notation]
		`);

		await session.run('CALL db.awaitIndexes(300)');

		const verifyResult = await session.run(`SHOW INDEXES WHERE name = 'ceds14_fulltext'`);
		if (verifyResult.records.length > 0) {
			const state = verifyResult.records[0].get('state');
			xLog.status(`[indexer] Index ceds14_fulltext state: ${state}`);
			xLog.status('[indexer] === FULL-TEXT INDEX CREATED SUCCESSFULLY ===');
		} else {
			xLog.status('[indexer] WARNING — Index ceds14_fulltext not found after creation');
		}
	} finally {
		await session.close();
		await driver.close();
	}
};

module.exports = { createFullTextIndex };
