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
indexDataModelExplorer — Container management and data loading for DataModelExplorer Neo4j graph

Container Management:
  indexDataModelExplorer -start
  indexDataModelExplorer -stop
  indexDataModelExplorer -status
  indexDataModelExplorer -forceInit --confirm

Data Loading (requires running container):
  indexDataModelExplorer -loadCeds [--rdfPath=PATH]
  indexDataModelExplorer -loadSif [--tsvPath=PATH] [--resolutionMapPath=PATH]
  indexDataModelExplorer -buildBridges
  indexDataModelExplorer -rebuild         # forceInit + start + loadCeds + loadSif + buildBridges

Options:
  --rdfPath=PATH              Path to CEDS-Ontology.rdf
  --tsvPath=PATH              Path to SIF Implementation Specification TSV
  --resolutionMapPath=PATH    Path to SIF RefId resolution map TSV
  --voyageApiKey=KEY          Override Voyage API key from config
  -help                       Show help
		`);
		return;
	}

	// -- resolve common parameters --
	const voyageApiKey = (commandLineParameters.values.voyageApiKey || [])[0] || localConfig.voyageApiKey || '';
	const assetsDir = (commandLineParameters.values.assetsDir || [])[0] || '';
	const providerDir = (commandLineParameters.values.providerDir || [])[0] || process.cwd();

	// Resolve the provider's project root
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
		xLog.error('[indexDataModelExplorer] Cannot find provider project root (directory with configs/)');
		process.exit(1);
	}

	// =====================================================================
	// CONTAINER MANAGEMENT ACTIONS
	// =====================================================================

	const { startContainer, stopContainer, statusContainer, forceInitContainer } = require('./lib/containerManager');

	if (commandLineParameters.switches.start) {
		startContainer({ voyageApiKey, providerProjectRoot, providerDir, assetsDir }, (err, result) => {
			if (err) {
				xLog.error(`[indexDataModelExplorer] Start failed: ${err}`);
				process.exit(1);
			}
			xLog.status(`[indexDataModelExplorer] Container ${result.containerName} ready (bolt:${result.boltPort} http:${result.httpPort})`);
		});
		return;
	}

	if (commandLineParameters.switches.stop) {
		stopContainer({ providerProjectRoot }, (err) => {
			if (err) { xLog.error(`[indexDataModelExplorer] Stop failed: ${err}`); process.exit(1); }
		});
		return;
	}

	if (commandLineParameters.switches.status) {
		statusContainer({ providerProjectRoot }, (err) => {
			if (err) { xLog.error(`[indexDataModelExplorer] Status failed: ${err}`); process.exit(1); }
		});
		return;
	}

	if (commandLineParameters.switches.forceInit) {
		const confirm = commandLineParameters.switches.confirm || false;
		forceInitContainer({ providerProjectRoot, confirm }, (err) => {
			if (err) { xLog.error(`[indexDataModelExplorer] forceInit failed: ${err}`); process.exit(1); }
		});
		return;
	}

	// =====================================================================
	// DATA LOADING: -loadCeds
	// =====================================================================

	if (commandLineParameters.switches.loadCeds) {
		const rdfPath = (commandLineParameters.values.rdfPath || [])[0]
			|| path.join(__dirname, 'assets', 'CEDS-Ontology.rdf');

		if (!fs.existsSync(rdfPath)) {
			xLog.error(`[indexDataModelExplorer] RDF file not found: ${rdfPath}`);
			process.exit(1);
		}

		const neo4jConfig = resolveNeo4jConfig({ providerProjectRoot });
		if (!neo4jConfig) {
			xLog.error('[indexDataModelExplorer] No Neo4j config found. Run -start first.');
			process.exit(1);
		}

		const { parseRdf } = require('./lib/ceds/rdfParser');
		const { loadToNeo4j } = require('./lib/ceds/neo4jLoader');
		const { createFullTextIndex } = require('./lib/ceds/indexer');
		const { createEmbeddings } = require('./lib/ceds/embedder');

		const runPipeline = async () => {
			xLog.status('[indexDataModelExplorer] === LOADING CEDS ===');

			// Step 1: Parse RDF and load to Neo4j
			xLog.status('[indexDataModelExplorer] Step 1/3: Parsing RDF and loading to Neo4j...');
			const result = await parseRdf(rdfPath);
			await loadToNeo4j({
				entities: result.entities,
				version: result.version,
				counts: result.counts,
				...neo4jConfig,
			});

			// Step 2: Create BM25 full-text index
			xLog.status('[indexDataModelExplorer] Step 2/3: Creating BM25 full-text index...');

			// Use a custom index name for the unified graph
			const neo4j = require('neo4j-driver');
			const driver = neo4j.driver(neo4jConfig.neo4jBoltUri, neo4j.auth.basic(neo4jConfig.neo4jUser, neo4jConfig.neo4jPassword), { encrypted: false });
			const session = driver.session();
			try {
				await session.run(`
					CREATE FULLTEXT INDEX dme_ceds_fulltext IF NOT EXISTS
					FOR (n:CedsClass|CedsProperty|CedsOptionSet|CedsOptionValue)
					ON EACH [n.label, n.description, n.notation]
				`);
				await session.run('CALL db.awaitIndexes(300)');
				xLog.status('[indexDataModelExplorer] BM25 index dme_ceds_fulltext created');
			} finally {
				await session.close();
				await driver.close();
			}

			// Step 3: Generate vector embeddings
			xLog.status('[indexDataModelExplorer] Step 3/3: Generating vector embeddings...');

			// Use a custom vector index name
			const resolvedVoyageKey = voyageApiKey || resolveVoyageApiKey({ providerProjectRoot });
			if (!resolvedVoyageKey) {
				xLog.error('[indexDataModelExplorer] Missing voyageApiKey — skipping embeddings');
			} else {
				await createEmbeddings({ ...neo4jConfig, voyageApiKey: resolvedVoyageKey });

				// Rename vector index for unified namespace
				const driver2 = neo4j.driver(neo4jConfig.neo4jBoltUri, neo4j.auth.basic(neo4jConfig.neo4jUser, neo4jConfig.neo4jPassword), { encrypted: false });
				const session2 = driver2.session();
				try {
					// The embedder creates ceds14_vector. Create an alias index for DME namespace
					await session2.run(`
						CREATE VECTOR INDEX dme_ceds_vector IF NOT EXISTS
						FOR (n:CEDS)
						ON (n.embedding)
						OPTIONS {indexConfig: {\`vector.dimensions\`: 1024, \`vector.similarity_function\`: 'cosine'}}
					`);
					await session2.run('CALL db.awaitIndexes(300)');
				} finally {
					await session2.close();
					await driver2.close();
				}
			}

			xLog.status('[indexDataModelExplorer] === CEDS LOAD COMPLETE ===');
		};

		runPipeline().catch(err => {
			xLog.error(`[indexDataModelExplorer] CEDS pipeline failed: ${err.message}`);
			console.error(err.stack);
			process.exit(1);
		});
		return;
	}

	// =====================================================================
	// DATA LOADING: -loadSif
	// =====================================================================

	if (commandLineParameters.switches.loadSif) {
		const tsvPath = (commandLineParameters.values.tsvPath || [])[0]
			|| path.join(__dirname, 'assets', 'ImplementationSpecification_031326.tsv');
		const resolutionMapPath = (commandLineParameters.values.resolutionMapPath || [])[0]
			|| path.join(__dirname, 'assets', 'refIdResolutionMap.tsv');

		if (!fs.existsSync(tsvPath)) {
			xLog.error(`[indexDataModelExplorer] TSV file not found: ${tsvPath}`);
			process.exit(1);
		}

		const neo4jConfig = resolveNeo4jConfig({ providerProjectRoot });
		if (!neo4jConfig) {
			xLog.error('[indexDataModelExplorer] No Neo4j config found. Run -start first.');
			process.exit(1);
		}

		const { parseTsvFile, loadResolutionMap, resolveRefIdTargets, deduplicateEdges, loadGraphIntoNeo4j } = require('./lib/sif/tsvParser');
		const { createEmbeddings } = require('./lib/sif/embedder');

		const runPipeline = async () => {
			xLog.status('[indexDataModelExplorer] === LOADING SIF ===');

			// Step 1: Parse TSV
			xLog.status('[indexDataModelExplorer] Step 1/3: Parsing SIF TSV...');
			const sifObjectList = parseTsvFile(tsvPath);
			xLog.status(`[indexDataModelExplorer] Parsed ${sifObjectList.length} SIF object types`);

			const totalFields = sifObjectList.reduce((sum, obj) => sum + obj.fields.length, 0);
			xLog.status(`[indexDataModelExplorer] Total SIF fields: ${totalFields}`);

			// Step 2: Resolve RefId targets and load to Neo4j
			xLog.status('[indexDataModelExplorer] Step 2/3: Resolving RefIds and loading to Neo4j...');
			const manualResolutions = loadResolutionMap(resolutionMapPath);
			const rawEdges = resolveRefIdTargets(sifObjectList, manualResolutions);
			const edgeList = deduplicateEdges(rawEdges);

			await loadGraphIntoNeo4j(sifObjectList, edgeList, neo4jConfig);

			// Step 3: Generate vector embeddings
			xLog.status('[indexDataModelExplorer] Step 3/3: Generating SIF vector embeddings...');
			const resolvedVoyageKey = voyageApiKey || resolveVoyageApiKey({ providerProjectRoot });
			if (!resolvedVoyageKey) {
				xLog.error('[indexDataModelExplorer] Missing voyageApiKey — skipping SIF embeddings');
			} else {
				await createEmbeddings({
					...neo4jConfig,
					voyageApiKey: resolvedVoyageKey,
				});
			}

			xLog.status('[indexDataModelExplorer] === SIF LOAD COMPLETE ===');
		};

		runPipeline().catch(err => {
			xLog.error(`[indexDataModelExplorer] SIF pipeline failed: ${err.message}`);
			console.error(err.stack);
			process.exit(1);
		});
		return;
	}

	// =====================================================================
	// BUILD BRIDGES
	// =====================================================================

	if (commandLineParameters.switches.buildBridges) {
		const neo4jConfig = resolveNeo4jConfig({ providerProjectRoot });
		if (!neo4jConfig) {
			xLog.error('[indexDataModelExplorer] No Neo4j config found. Run -start first.');
			process.exit(1);
		}

		const { buildBridges } = require('./lib/bridges/bridgeBuilder');
		const resolvedVoyageKey = voyageApiKey || resolveVoyageApiKey({ providerProjectRoot });

		buildBridges({ ...neo4jConfig, voyageApiKey: resolvedVoyageKey })
			.then(() => {
				xLog.status('[indexDataModelExplorer] Bridge building complete.');
			})
			.catch(err => {
				xLog.error(`[indexDataModelExplorer] Bridge building failed: ${err.message}`);
				console.error(err.stack);
				process.exit(1);
			});
		return;
	}

	// =====================================================================
	// REBUILD (full reset)
	// =====================================================================

	if (commandLineParameters.switches.rebuild) {
		xLog.error('[indexDataModelExplorer] -rebuild runs: forceInit + start + loadCeds + loadSif + buildBridges');
		xLog.error('[indexDataModelExplorer] Use individual commands for now. Full rebuild pipeline coming soon.');
		return;
	}

	// No action specified
	xLog.error('Usage: indexDataModelExplorer -start|-stop|-status|-forceInit|-loadCeds|-loadSif|-buildBridges [options]');
	xLog.error('Use -help for full options list');
};

// =====================================================================
// RESOLVE NEO4J CONFIG
// =====================================================================

const resolveNeo4jConfig = ({ providerProjectRoot }) => {
	const INSTANCE_DIR_NAME = 'index-data-model-explorer-for-milo';
	const SEARCH_MODULE_NAME = 'dataModelExplorerSearch';
	const dataStoreBase = path.join(providerProjectRoot, 'dataStores', 'instanceSpecific', INSTANCE_DIR_NAME);
	const instanceConfigPath = path.join(dataStoreBase, `${INSTANCE_DIR_NAME}.ini`);

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

	// Try search .ini
	const configName = os.hostname() === 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDir = path.join(providerProjectRoot, 'configs', configName);
	const searchIniPath = path.join(configDir, `${SEARCH_MODULE_NAME}.ini`);

	if (fs.existsSync(searchIniPath)) {
		const searchConfig = configFileProcessor.getConfig(
			`${SEARCH_MODULE_NAME}.ini`,
			configDir + '/',
			{ resolve: false }
		);
		const section = searchConfig[SEARCH_MODULE_NAME] || {};
		return {
			neo4jBoltUri: section.neo4jBoltUri,
			neo4jUser: section.neo4jUser,
			neo4jPassword: section.neo4jPassword,
		};
	}

	return null;
};

// =====================================================================
// RESOLVE VOYAGE API KEY
// =====================================================================

const resolveVoyageApiKey = ({ providerProjectRoot }) => {
	const INSTANCE_DIR_NAME = 'index-data-model-explorer-for-milo';
	const dataStoreBase = path.join(providerProjectRoot, 'dataStores', 'instanceSpecific', INSTANCE_DIR_NAME);
	const instanceConfigPath = path.join(dataStoreBase, `${INSTANCE_DIR_NAME}.ini`);

	if (fs.existsSync(instanceConfigPath)) {
		const existingConfig = configFileProcessor.getConfig(
			`${INSTANCE_DIR_NAME}.ini`,
			dataStoreBase + '/',
			{ resolve: false }
		);
		const embeddingConfig = existingConfig['embedding'] || {};
		if (embeddingConfig.voyageApiKey) return embeddingConfig.voyageApiKey;
	}

	// Fallback: try search .ini
	const configName = os.hostname() === 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDir = path.join(providerProjectRoot, 'configs', configName);
	const searchIniPath = path.join(configDir, 'dataModelExplorerSearch.ini');

	if (fs.existsSync(searchIniPath)) {
		const searchConfig = configFileProcessor.getConfig(
			'dataModelExplorerSearch.ini',
			configDir + '/',
			{ resolve: false }
		);
		const section = searchConfig['dataModelExplorerSearch'] || {};
		if (section.voyageApiKey) return section.voyageApiKey;
	}

	return '';
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

	// Accept JSON from stdin
	try {
		const stdinText = !process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : '';
		const possibleJson = process.argv[2] ? process.argv[2] : stdinText;
		commandLineParameters = JSON.parse(possibleJson);
		commandLineParameters.fromJson = true;
	} catch (err) {
		// no JSON found
	}

	const configName = os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDirPath = `${projectRoot}/configs/${configName}/`;

	let config = {};
	try {
		config = configFileProcessor.getConfig('askMilo.ini', configDirPath, { resolve: false }) || {};
	} catch (err) {
		// Config not found — proceed with empty config
	}

	const getConfig = (name) => {
		if (name === 'allConfigs') return config;
		if (name === moduleName) return (config && config['askMilo']) || {};
		return (config && config[name]) || {};
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
