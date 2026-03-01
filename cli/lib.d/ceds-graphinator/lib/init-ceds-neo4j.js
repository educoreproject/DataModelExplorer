#!/usr/bin/env node
'use strict';

// =============================================================================
// init-ceds-neo4j.js — CEDS init step for the chassis
//
// Creates a neo4j-driver instance pointing at the CEDS ontology database.
// Returns a Promise that resolves with { cedsNeo4jDriver, cedsUtils }.
// In help mode, skips driver creation and returns empties.
// =============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const cedsUtils = require('./ceds-utils');

const moduleFunction =
	({ moduleName } = {}) =>
	({ getConfig, commandLineParameters, xLog }) => {
		// Check for help/tool selector mode — skip heavy init
		const isHelpMode = !!(
			commandLineParameters.switches.help ||
			commandLineParameters.switches.showToolSelector ||
			commandLineParameters.switches.showToolSelectors ||
			commandLineParameters.switches.listTools ||
			commandLineParameters.values.help ||
			commandLineParameters.values.showToolSelector ||
			commandLineParameters.values.showToolSelectors ||
			commandLineParameters.values.listTools
		);

		if (isHelpMode) {
			return Promise.resolve({ cedsNeo4jDriver: null, cedsUtils });
		}

		const cedsConfig = getConfig('ceds2') || {};
		const NEO4J_URI = cedsConfig.neo4jBoltUri || 'bolt://localhost:7692';
		const NEO4J_USER = cedsConfig.neo4jUser || 'neo4j';
		const NEO4J_PASS = cedsConfig.neo4jPassword || 'cedsOntologyPassword';

		try {
			const neo4j = require('neo4j-driver');
			const driver = neo4j.driver(
				NEO4J_URI,
				neo4j.auth.basic(NEO4J_USER, NEO4J_PASS),
			);
			return Promise.resolve({ cedsNeo4jDriver: driver, cedsUtils });
		} catch (err) {
			xLog.warn(`Failed to create CEDS Neo4j driver: ${err.message}`);
			return Promise.resolve({ cedsNeo4jDriver: null, cedsUtils });
		}
	};

module.exports = moduleFunction({ moduleName });
