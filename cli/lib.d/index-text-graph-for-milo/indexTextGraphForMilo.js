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
indexTextGraphForMilo -- Generate askMilo RAG tool providers backed by Neo4j + Voyage AI

Container Management:
  indexTextGraphForMilo -start [--name=NAME] [--voyageApiKey=KEY] [--assetsDir=PATH]
  indexTextGraphForMilo -stop [--name=NAME]
  indexTextGraphForMilo -status [--name=NAME]
  indexTextGraphForMilo -forceInit [--name=NAME] --confirm

Indexing:
  indexTextGraphForMilo -indexText [options]
    Required:
      --sourcePath=GLOB          Path or glob to source text files
      --providerName=NAME        Name for provider (e.g., CareerStory)
    Optional:
      --outDirPath=PATH          Output directory (default: auto-generated)
      --chunkStrategy=TEXT       Chunking instruction or shortcut
      --voyageApiKey=KEY         Override from config
      --anthropicApiKey=KEY      Override from config
      --embeddingModel=MODEL     (default: voyage-4)
      --embeddingDimensions=N    (default: 1024)
      --topK=N                   Default search results (default: 10)
      -help                      Show help
		`);
		return;
	}

	// -- resolve common parameters --
	const providerName = (commandLineParameters.values.name || [])[0];
	const voyageApiKey = (commandLineParameters.values.voyageApiKey || [])[0] || localConfig.voyageApiKey || '';
	const embeddingModel = (commandLineParameters.values.embeddingModel || [])[0] || localConfig.embeddingModel || 'voyage-4';
	const embeddingDimensions = (commandLineParameters.values.embeddingDimensions || [])[0] || localConfig.embeddingDimensions || '1024';

	// =====================================================================
	// CONTAINER MANAGEMENT ACTIONS
	// =====================================================================

	const { startContainer, stopContainer, statusContainer, forceInitContainer } = require('./lib/containerManager');

	const assetsDir = (commandLineParameters.values.assetsDir || [])[0] || '';

	if (commandLineParameters.switches.start) {
		startContainer({ providerName, voyageApiKey, embeddingModel, embeddingDimensions, projectRoot, assetsDir }, (err, result) => {
			if (err) {
				xLog.error(`[indexTextGraphForMilo] Start failed: ${err}`);
				process.exit(1);
			}
			xLog.status(`[indexTextGraphForMilo] Container ${result.containerName} ready (bolt:${result.boltPort} http:${result.httpPort})`);
		});
		return;
	}

	if (commandLineParameters.switches.stop) {
		stopContainer({ providerName, projectRoot }, (err) => {
			if (err) {
				xLog.error(`[indexTextGraphForMilo] Stop failed: ${err}`);
				process.exit(1);
			}
		});
		return;
	}

	if (commandLineParameters.switches.status) {
		statusContainer({ providerName, projectRoot }, (err) => {
			if (err) {
				xLog.error(`[indexTextGraphForMilo] Status failed: ${err}`);
				process.exit(1);
			}
		});
		return;
	}

	if (commandLineParameters.switches.forceInit) {
		const confirm = commandLineParameters.switches.confirm || false;
		forceInitContainer({ providerName, projectRoot, confirm }, (err) => {
			if (err) {
				xLog.error(`[indexTextGraphForMilo] forceInit failed: ${err}`);
				process.exit(1);
			}
		});
		return;
	}

	// =====================================================================
	// INDEXING ACTION
	// =====================================================================

	if (commandLineParameters.switches.indexText) {
		const sourcePath = (commandLineParameters.values.sourcePath || [])[0];
		const indexProviderName = (commandLineParameters.values.providerName || [])[0];
		const outDirPath = (commandLineParameters.values.outDirPath || [])[0];
		const chunkStrategyRaw = (commandLineParameters.values.chunkStrategy || [])[0] || 'paragraph';
		const anthropicApiKey = (commandLineParameters.values.anthropicApiKey || [])[0] || localConfig.anthropicApiKey || '';
		const topK = parseInt((commandLineParameters.values.topK || [])[0] || '10', 10);

		// Validate required params
		if (!sourcePath) {
			xLog.error('Error: --sourcePath is required');
			return;
		}
		if (!indexProviderName) {
			xLog.error('Error: --providerName is required');
			return;
		}
		if (!anthropicApiKey) {
			xLog.error('Error: Anthropic API key required. Set --anthropicApiKey or add anthropicApiKey to config.');
			return;
		}

		// Verify container is running
		const dataStoreBase = path.join(projectRoot, 'dataStores', 'instanceSpecific', 'index-text-graph-for-milo');
		const instanceConfigPath = path.join(dataStoreBase, 'index-text-graph-for-milo.ini');

		if (!fs.existsSync(instanceConfigPath)) {
			xLog.error('Error: No container initialized. Run -start first.');
			return;
		}

		const instanceConfig = configFileProcessor.getConfig(
			'index-text-graph-for-milo.ini',
			dataStoreBase + '/',
			{ resolve: false }
		);
		const neo4jConfig = instanceConfig['neo4j'] || {};
		const embeddingConfig = instanceConfig['embedding'] || {};

		// Check container is running
		const { execSync } = require('child_process');
		let containerRunning = false;
		try {
			const result = execSync(
				`docker inspect --format '{{.State.Running}}' ${neo4jConfig.containerName} 2>/dev/null`,
				{ encoding: 'utf-8' }
			).trim();
			containerRunning = result === 'true';
		} catch (err) {
			// container doesn't exist
		}

		if (!containerRunning) {
			xLog.error(`Error: Container ${neo4jConfig.containerName} is not running. Run -start first.`);
			return;
		}

		// Resolve chunk strategy
		const chunkersConfig = getConfig('chunkers') || {};
		const chunkStrategy = chunkersConfig[chunkStrategyRaw] || chunkStrategyRaw;

		// Resolve output directory
		const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
		const resolvedOutDir = outDirPath || `./miloToolGen_${indexProviderName}_${dateStamp}`;

		// Resolve source files
		const sourceFiles = resolveSourceFiles(sourcePath);
		if (sourceFiles.length === 0) {
			xLog.error('No source files found. Check --sourcePath');
			return;
		}

		xLog.status(`[indexTextGraphForMilo] Found ${sourceFiles.length} source file(s)`);
		xLog.status(`[indexTextGraphForMilo] Chunk strategy: ${chunkStrategy.slice(0, 80)}...`);
		xLog.status(`[indexTextGraphForMilo] Provider name: ${indexProviderName}`);
		xLog.status(`[indexTextGraphForMilo] Output: ${resolvedOutDir}`);

		// Resolve effective embedding config
		const effectiveVoyageKey = voyageApiKey || embeddingConfig.voyageApiKey || '';
		const effectiveModel = embeddingModel || embeddingConfig.embeddingModel || 'voyage-4';
		const effectiveDimensions = parseInt(embeddingDimensions || embeddingConfig.embeddingDimensions || '1024', 10);

		if (!effectiveVoyageKey) {
			xLog.error('Error: Voyage API key required. Set --voyageApiKey or configure in .ini');
			return;
		}

		// Pipeline
		const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
		const taskList = new taskListPlus();

		// Step 1: Chunk documents
		taskList.push((args, next) => {
			xLog.status('[indexTextGraphForMilo] Step 1: Chunking documents...');
			const { chunkDocuments } = require('./lib/chunker');

			chunkDocuments({
				sourceFiles: args.sourceFiles,
				chunkStrategy: args.chunkStrategy,
				anthropicApiKey: args.anthropicApiKey,
			}, (err, chunks) => {
				if (err) {
					next(`Chunking failed: ${err}`);
					return;
				}
				xLog.status(`[indexTextGraphForMilo] Chunking produced ${chunks.length} chunks`);
				next('', { ...args, chunks });
			});
		});

		// Step 2: Generate embeddings (Voyage AI)
		taskList.push((args, next) => {
			xLog.status('[indexTextGraphForMilo] Step 2: Generating embeddings (Voyage AI)...');
			const { generateEmbeddings } = require('./lib/embedder');

			generateEmbeddings({
				chunks: args.chunks,
				voyageApiKey: args.voyageApiKey,
				embeddingModel: args.embeddingModel,
				embeddingDimensions: args.embeddingDimensions,
			}, (err, embeddedChunks) => {
				if (err) {
					next(`Embedding failed: ${err}`);
					return;
				}
				xLog.status(`[indexTextGraphForMilo] Embedded ${embeddedChunks.length} chunks`);
				next('', { ...args, embeddedChunks });
			});
		});

		// Step 3: Load into Neo4j
		taskList.push((args, next) => {
			xLog.status('[indexTextGraphForMilo] Step 3: Loading into Neo4j...');
			const { loadChunks } = require('./lib/neo4jLoader');

			if (!fs.existsSync(args.resolvedOutDir)) {
				fs.mkdirSync(args.resolvedOutDir, { recursive: true });
			}

			loadChunks({
				embeddedChunks: args.embeddedChunks,
				boltUri: `bolt://localhost:${args.boltPort}`,
				neo4jUser: 'neo4j',
				neo4jPassword: args.neo4jPassword,
				outDirPath: args.resolvedOutDir,
			}, (err, result) => {
				if (err) {
					next(`Neo4j load failed: ${err}`);
					return;
				}
				xLog.status(`[indexTextGraphForMilo] Loaded ${result.totalChunks} chunks into Neo4j`);
				next('', { ...args, totalChunks: result.totalChunks });
			});
		});

		// Step 3.5: Package Neo4j data as tarball in provider assets
		taskList.push((args, next) => {
			xLog.status('[indexTextGraphForMilo] Step 3.5: Packaging Neo4j data into provider assets...');

			const assetsDir = path.join(args.resolvedOutDir, 'assets');
			const neo4jDataParent = path.join(
				projectRoot, 'dataStores', 'instanceSpecific', 'index-text-graph-for-milo',
				`neo4j-${neo4jConfig.providerName || 'default'}`
			);
			const neo4jDataSrc = path.join(neo4jDataParent, 'data');

			if (!fs.existsSync(neo4jDataSrc)) {
				next(`Neo4j data directory not found: ${neo4jDataSrc}`);
				return;
			}

			if (!fs.existsSync(assetsDir)) {
				fs.mkdirSync(assetsDir, { recursive: true });
			}

			const tarballPath = path.join(assetsDir, 'neo4j-data.tar.gz');

			// Create tarball of the data directory
			const { execSync: execSyncLocal } = require('child_process');
			try {
				execSyncLocal(`tar -czf "${tarballPath}" -C "${neo4jDataParent}" data`, { timeout: 120000 });
			} catch (err) {
				next(`Failed to create Neo4j data tarball: ${err.message}`);
				return;
			}

			// Write manifest with connection details needed by -start
			const camelName = args.providerName.charAt(0).toLowerCase() + args.providerName.slice(1);
			const manifest = {
				providerName: args.providerName,
				neo4jPassword: args.neo4jPassword,
				embeddingModel: args.embeddingModel,
				embeddingDimensions: args.embeddingDimensions,
				topK: args.topK,
				searchModuleName: `${camelName}Search`,
			};
			fs.writeFileSync(path.join(assetsDir, 'manifest.json'), JSON.stringify(manifest, null, '\t'));

			const tarSize = (fs.statSync(tarballPath).size / (1024 * 1024)).toFixed(1);
			xLog.status(`[indexTextGraphForMilo] Tarball: ${tarballPath} (${tarSize}MB)`);
			xLog.status(`[indexTextGraphForMilo] Manifest written to ${assetsDir}/manifest.json`);
			next('', args);
		});

		// Step 4: Scaffold provider
		taskList.push((args, next) => {
			xLog.status('[indexTextGraphForMilo] Step 4: Scaffolding provider...');

			const toolNameSnake = args.providerName
				.replace(/([A-Z])/g, '_$1')
				.toLowerCase()
				.replace(/^_/, '') + '_search';

			const camelName = args.providerName.charAt(0).toLowerCase() + args.providerName.slice(1);
			const searchFileName = `${camelName}Search.js`;

			// Copy search template
			const searchTemplatePath = path.join(__dirname, 'templates', 'neo4jSearchTemplate.js');
			const searchDestPath = path.join(args.resolvedOutDir, searchFileName);
			fs.copyFileSync(searchTemplatePath, searchDestPath);
			fs.chmodSync(searchDestPath, '755');

			// Write package.json for the generated provider
			const providerPackageJson = {
				name: camelName + '-search',
				version: '1.0.0',
				description: `Neo4j-backed RAG search over ${args.providerName} documents`,
				main: searchFileName,
				author: 'TQ White II',
				license: 'ISC',
				dependencies: {
					'neo4j-driver': '^5.27.0',
					'qtools-config-file-processor': '^1.0.18',
					'qtools-parse-command-line': '^1.0.9',
				},
			};
			fs.writeFileSync(
				path.join(args.resolvedOutDir, 'package.json'),
				JSON.stringify(providerPackageJson, null, '\t')
			);

			// Write provider.json
			const providerData = {
				providerName: args.providerName,
				description: `RAG search over ${args.providerName} documents (Neo4j)`,
				startup: `node ../index-text-graph-for-milo/indexTextGraphForMilo.js -start --assetsDir=./assets`,
				startupTimeout: 30,
				tools: [
					{
						definition: {
							name: toolNameSnake,
							description: `Search ${args.providerName} documents by semantic similarity. Returns the most relevant text chunks matching the query.`,
							input_schema: {
								type: 'object',
								properties: {
									query: {
										type: 'string',
										description: 'Natural language search query',
									},
									limit: {
										type: 'integer',
										description: `Max results (default ${args.topK})`,
										default: args.topK,
									},
								},
								required: ['query'],
							},
						},
						cli: {
							command: `node ${searchFileName}`,
							positionalArgs: ['query'],
							flagArgs: { limit: '--limit' },
						},
					},
				],
			};
			fs.writeFileSync(
				path.join(args.resolvedOutDir, 'provider.json'),
				JSON.stringify(providerData, null, '\t')
			);

			xLog.status('[indexTextGraphForMilo] Provider scaffolded successfully');
			xLog.status(`[indexTextGraphForMilo] Output directory: ${args.resolvedOutDir}`);
			xLog.status('[indexTextGraphForMilo] Search .ini will be generated by -start at runtime');
			next('', args);
		});

		// Run pipeline
		const initialData = {
			sourceFiles,
			chunkStrategy,
			providerName: indexProviderName,
			resolvedOutDir,
			voyageApiKey: effectiveVoyageKey,
			anthropicApiKey,
			embeddingModel: effectiveModel,
			embeddingDimensions: effectiveDimensions,
			topK,
			boltPort: neo4jConfig.boltPort,
			neo4jPassword: neo4jConfig.password,
		};

		pipeRunner(taskList.getList(), initialData, (err, result) => {
			if (err) {
				xLog.error(`Pipeline error: ${err}`);
				process.exit(1);
			}
			xLog.status('[indexTextGraphForMilo] Complete!');
		});

		return;
	}

	// No action specified
	xLog.error('Usage: indexTextGraphForMilo -start|-stop|-status|-forceInit|-indexText [options]');
	xLog.error('Use -help for full options list');
};

// =====================================================================
// RESOLVE SOURCE FILES
// =====================================================================

const resolveSourceFiles = (pattern) => {
	const dir = path.dirname(pattern);
	const filePattern = path.basename(pattern);

	if (!fs.existsSync(dir)) {
		const { xLog } = process.global;
		xLog.error(`Source directory does not exist: ${dir}`);
		return [];
	}

	if (filePattern.includes('*')) {
		const regex = new RegExp('^' + filePattern.replace(/\*/g, '.*') + '$');
		return fs.readdirSync(dir)
			.filter(f => regex.test(f))
			.map(f => path.join(dir, f))
			.filter(f => fs.statSync(f).isFile());
	}

	const fullPath = path.resolve(pattern);
	if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
		return [fullPath];
	}

	return [];
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
