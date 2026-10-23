#!/usr/bin/env node
'use strict';

// =============================================================================
// ceds2.js — CEDS Graphinator CLI (chassis consumer)
//
// This is the CEDS Ontology-specific consumer of qtools-cli-tools-dispatcher.
// It provides: Neo4j driver for the CEDS ontology graph.
// The chassis provides: dispatcher, dispatch map, tools.d loading, help system,
// tool-metadata-generator, JSON stdin, result formatting.
// =============================================================================

const path = require('path');
const os = require('os');
const { createGraphToolCli } = require('qtools-cli-tools-dispatcher');

createGraphToolCli({
	// Identity
	programName: 'ceds2',

	// Config — consuming app provides projectRoot directly
	projectRoot: path.join(__dirname, '..', '..', '..', '..'),
	configFileName: 'ceds2.ini',
	configPathResolver: ({ projectRoot, hostname }) => {
		const configName =
			hostname === 'qMini.local' ? 'instanceSpecific/qbook' : '';
		return `${projectRoot}/configs/${configName}/`;
	},

	// Tools
	toolsPath: path.join(__dirname, 'tools.d'),

	// Initialization steps — run in parallel
	// Each receives { getConfig, commandLineParameters, xLog }
	// Each returns a Promise resolving to an object whose keys merge into passThroughParameters
	initSteps: [
		require('./lib/init-ceds-neo4j'),
	],

	// Which keys from init results to pass through to tools
	passThroughKeys: [
		'cedsNeo4jDriver',
		'cedsUtils',
		'toolMetadataGenerator',
		'toolLibrary',
	],

	// Cleanup after all tools finish
	cleanup: (args) => {
		if (args.cedsNeo4jDriver) {
			args.cedsNeo4jDriver.close().catch(() => {});
		}
	},
});
