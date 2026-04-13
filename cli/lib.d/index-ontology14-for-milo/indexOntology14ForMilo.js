#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const os = require('os');
const path = require('path');
const fs = require('fs');
const commandLineParser = require('qtools-parse-command-line');
const configFileProcessor = require('qtools-config-file-processor');

// =====================================================================
// MODULE FUNCTION
// =====================================================================

const moduleFunction = ({ moduleName } = {}) => ({ unused } = {}) => {
	const { xLog, getConfig, commandLineParameters, projectRoot } = process.global;
	const localConfig = getConfig(moduleName) || {};

	// -- help text --
	if (commandLineParameters.switches.help) {
		xLog.result(`
indexOntology14ForMilo -- Container management and data loading for CEDS Ontology v14 Neo4j graph

Container Management:
  indexOntology14ForMilo -start [--assetsDir=PATH]
  indexOntology14ForMilo -stop
  indexOntology14ForMilo -status
  indexOntology14ForMilo -forceInit --confirm

Data Loading (requires running container):
  indexOntology14ForMilo -loadOntology [--rdfPath=PATH]
    Runs the full pipeline: parse RDF → load to Neo4j → create BM25 index → generate vector embeddings
    Default RDF: ceds-ontology14/assets/CEDS-Ontology.rdf

Options:
  --assetsDir=PATH         Directory containing neo4j-data.tar.gz and manifest.json
  --rdfPath=PATH           Path to CEDS-Ontology.rdf (for -loadOntology)
  --voyageApiKey=KEY       Override Voyage API key from config
  --providerDir=PATH       Provider directory (default: cwd, set by providerRegistry)
  -help                    Show help
		`);
		return;
	}

	// -- resolve common parameters --
	const voyageApiKey = (commandLineParameters.values.voyageApiKey || [])[0] || localConfig.voyageApiKey || '';
	const assetsDir = (commandLineParameters.values.assetsDir || [])[0] || '';

	// Provider directory: where the provider (ceds-ontology14/) lives.
	// When called from providerRegistry startup, cwd = provider dir.
	// When called manually, --providerDir can override.
	const providerDir = (commandLineParameters.values.providerDir || [])[0] || process.cwd();

	// Resolve the provider's project root (walk up from providerDir to find 'system')
	const findRoot = (startDir) => {
		let dir = startDir;
		for (let i = 0; i < 15; i++) {
			if (fs.existsSync(path.join(dir, 'configs'))) return dir;
			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
		return null;
	};
	const providerProjectRoot = findRoot(providerDir);

	if (!providerProjectRoot) {
		xLog.error('[indexOntology14ForMilo] Cannot find provider project root (directory with configs/)');
		process.exit(1);
	}

	// =====================================================================
	// CONTAINER MANAGEMENT ACTIONS
	// =====================================================================

	const { startContainer, stopContainer, statusContainer, forceInitContainer } = require('./lib/containerManager');

	if (commandLineParameters.switches.start) {
		startContainer({ voyageApiKey, providerProjectRoot, providerDir, assetsDir }, (err, result) => {
			if (err) {
				xLog.error(`[indexOntology14ForMilo] Start failed: ${err}`);
				process.exit(1);
			}
			xLog.status(`[indexOntology14ForMilo] Container ${result.containerName} ready (bolt:${result.boltPort} http:${result.httpPort})`);
		});
		return;
	}

	if (commandLineParameters.switches.stop) {
		stopContainer({ providerProjectRoot }, (err) => {
			if (err) {
				xLog.error(`[indexOntology14ForMilo] Stop failed: ${err}`);
				process.exit(1);
			}
		});
		return;
	}

	if (commandLineParameters.switches.status) {
		statusContainer({ providerProjectRoot }, (err) => {
			if (err) {
				xLog.error(`[indexOntology14ForMilo] Status failed: ${err}`);
				process.exit(1);
			}
		});
		return;
	}

	if (commandLineParameters.switches.forceInit) {
		const confirm = commandLineParameters.switches.confirm || false;
		forceInitContainer({ providerProjectRoot, confirm }, (err) => {
			if (err) {
				xLog.error(`[indexOntology14ForMilo] forceInit failed: ${err}`);
				process.exit(1);
			}
		});
		return;
	}

	// =====================================================================
	// DATA LOADING ACTION: -loadOntology
	// =====================================================================

	if (commandLineParameters.switches.loadOntology) {
		const rdfPath = (commandLineParameters.values.rdfPath || [])[0]
			|| path.join(providerDir, 'assets', 'CEDS-Ontology.rdf');

		if (!fs.existsSync(rdfPath)) {
			xLog.error(`[indexOntology14ForMilo] RDF file not found: ${rdfPath}`);
			process.exit(1);
		}

		// Resolve Neo4j connection from instanceConfig or search .ini
		const neo4jConfig = resolveNeo4jConfig({ providerProjectRoot });
		if (!neo4jConfig) {
			xLog.error('[indexOntology14ForMilo] No Neo4j config found. Run -start first.');
			process.exit(1);
		}

		const { parseRdf } = require('./lib/rdfParser');
		const { loadToNeo4j } = require('./lib/neo4jLoader');
		const { createFullTextIndex } = require('./lib/indexer');
		const { createEmbeddings } = require('./lib/embedder');

		const runPipeline = async () => {
			// Step 1: Parse RDF and load to Neo4j
			xLog.status('[indexOntology14ForMilo] Step 1/3: Parsing RDF and loading to Neo4j...');
			const result = await parseRdf(rdfPath);
			await loadToNeo4j({
				entities: result.entities,
				version: result.version,
				counts: result.counts,
				...neo4jConfig,
			});

			// Step 2: Create BM25 full-text index
			xLog.status('[indexOntology14ForMilo] Step 2/3: Creating BM25 full-text index...');
			await createFullTextIndex(neo4jConfig);

			// Step 3: Generate vector embeddings
			xLog.status('[indexOntology14ForMilo] Step 3/3: Generating vector embeddings (this takes a while)...');
			await createEmbeddings({ ...neo4jConfig, voyageApiKey });

			xLog.status('[indexOntology14ForMilo] === ONTOLOGY LOAD COMPLETE ===');
		};

		runPipeline().catch(err => {
			xLog.error(`[indexOntology14ForMilo] Pipeline failed: ${err.message}`);
			process.exit(1);
		});

		return;
	}

	// No action specified
	xLog.error('Usage: indexOntology14ForMilo -start|-stop|-status|-forceInit|-loadOntology [options]');
	xLog.error('Use -help for full options list');
};

// =====================================================================
// RESOLVE NEO4J CONFIG — Check instanceConfig first, then search .ini
// =====================================================================

const resolveNeo4jConfig = ({ providerProjectRoot }) => {
	const INSTANCE_DIR_NAME = 'index-ontology14-for-milo';
	const dataStoreBase = path.join(providerProjectRoot, 'dataStores', 'instanceSpecific', INSTANCE_DIR_NAME);
	const instanceConfigPath = path.join(dataStoreBase, `${INSTANCE_DIR_NAME}.ini`);

	// Try instanceConfig first (container managed by us)
	if (fs.existsSync(instanceConfigPath)) {
		const existingConfig = configFileProcessor.getConfig(
			`${INSTANCE_DIR_NAME}.ini`,
			dataStoreBase + '/',
			{ resolve: false }
		);
		const neo4jConfig = existingConfig['neo4j'] || {};
		return {
			neo4jBoltUri: `bolt://localhost:${neo4jConfig.boltPort}`,
			neo4jUser: 'neo4j',
			neo4jPassword: neo4jConfig.password,
		};
	}

	// Try search .ini (externally managed database)
	const configName = os.hostname() === 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDir = path.join(providerProjectRoot, 'configs', configName);
	const searchIniPath = path.join(configDir, 'cedsOntology14Search.ini');

	if (fs.existsSync(searchIniPath)) {
		const searchConfig = configFileProcessor.getConfig(
			'cedsOntology14Search.ini',
			configDir + '/',
			{ resolve: false }
		);
		const section = searchConfig['cedsOntology14Search'] || {};
		return {
			neo4jBoltUri: section.neo4jBoltUri,
			neo4jUser: section.neo4jUser,
			neo4jPassword: section.neo4jPassword,
		};
	}

	return null;
};

// =====================================================================
// STARTUP / CONFIGURATION
// =====================================================================

// prettier-ignore
{
	const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
		__dirname.replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), "$1");
	const projectRoot = findProjectRoot();

	let commandLineParameters = commandLineParser.getParameters({ noFunctions: true });

	// Accept JSON from stdin or argv[2] as override (bb2 pattern)
	try {
		const stdinText = !process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : '';
		const possibleJson = process.argv[2] ? process.argv[2] : stdinText;
		commandLineParameters = JSON.parse(possibleJson);
		commandLineParameters.fromJson = true;
	} catch (err) {
		// no JSON found — use normal commandLineParameters
	}

	// Load config from askMilo.ini (shares config with askMilo)
	const configName = os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDirPath = `${projectRoot}/configs/${configName}/`;

	let config = {};
	try {
		config = configFileProcessor.getConfig('askMilo.ini', configDirPath, { resolve: false });
	} catch (err) {
		// Config not found — proceed with empty config
	}

	const getConfig = (name) => {
		if (name === 'allConfigs') return config;
		if (name === moduleName) return config['askMilo'] || {};
		return config[name] || {};
	};

	process.global = Object.freeze({
		xLog: Object.freeze({ status: console.error, error: console.error, result: console.log }),
		getConfig,
		commandLineParameters,
		projectRoot,
		rawConfig: config,
	});
}

module.exports = moduleFunction({ moduleName })({});
