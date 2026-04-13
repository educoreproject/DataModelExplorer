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

	// -- help text --
	if (commandLineParameters.switches.help) {
		xLog.result(`
sifSpecGraphManager -- Container management for SIF Spec Graph Neo4j database

Container Management:
  sifSpecGraphManager -start [--assetsDir=PATH]
  sifSpecGraphManager -stop
  sifSpecGraphManager -status
  sifSpecGraphManager -forceInit --confirm

Embedding:
  sifSpecGraphManager -embed [--voyageApiKey=KEY]

Options:
  --assetsDir=PATH         Directory containing neo4j-data.tar.gz and manifest.json
  --providerDir=PATH       Provider directory (default: cwd, set by providerRegistry)
  --voyageApiKey=KEY       Voyage AI API key (or set in sifSpecGraphSearch.ini)
  -help                    Show help
		`);
		return;
	}

	// -- resolve common parameters --
	const assetsDir = (commandLineParameters.values.assetsDir || [])[0] || '';

	// Provider directory: where the provider (sif-spec-graph/) lives.
	// When called from providerRegistry startup, cwd = provider dir.
	// When called manually, --providerDir can override.
	const providerDir = (commandLineParameters.values.providerDir || [])[0] || process.cwd();

	// Resolve the provider's project root (walk up from providerDir to find 'configs')
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
		xLog.error('[sifSpecGraphManager] Cannot find provider project root (directory with configs/)');
		process.exit(1);
	}

	// =====================================================================
	// CONTAINER MANAGEMENT ACTIONS
	// =====================================================================

	const { startContainer, stopContainer, statusContainer, forceInitContainer } = require('./lib/containerManager');

	if (commandLineParameters.switches.start) {
		startContainer({ providerProjectRoot, providerDir, assetsDir }, (err, result) => {
			if (err) {
				xLog.error(`[sifSpecGraphManager] Start failed: ${err}`);
				process.exit(1);
			}
			xLog.status(`[sifSpecGraphManager] Container ${result.containerName} ready (bolt:${result.boltPort} http:${result.httpPort})`);
		});
		return;
	}

	if (commandLineParameters.switches.stop) {
		stopContainer({ providerProjectRoot }, (err) => {
			if (err) {
				xLog.error(`[sifSpecGraphManager] Stop failed: ${err}`);
				process.exit(1);
			}
		});
		return;
	}

	if (commandLineParameters.switches.status) {
		statusContainer({ providerProjectRoot }, (err) => {
			if (err) {
				xLog.error(`[sifSpecGraphManager] Status failed: ${err}`);
				process.exit(1);
			}
		});
		return;
	}

	if (commandLineParameters.switches.forceInit) {
		const confirm = commandLineParameters.switches.confirm || false;
		forceInitContainer({ providerProjectRoot, confirm }, (err) => {
			if (err) {
				xLog.error(`[sifSpecGraphManager] forceInit failed: ${err}`);
				process.exit(1);
			}
		});
		return;
	}

	if (commandLineParameters.switches.embed) {
		const { createEmbeddings } = require('./lib/embedder');

		// Load config from sifSpecGraphSearch.ini for Neo4j connection + voyageApiKey
		const hostname = os.hostname();
		const configName = (hostname === 'qMini.local' || hostname === 'qbook.local') ? 'instanceSpecific/qbook' : '';
		const configDirPath = `${providerProjectRoot}/configs/${configName}/`;
		const searchConfig = configFileProcessor.getConfig('sifSpecGraphSearch.ini', configDirPath);
		const cfg = (searchConfig && searchConfig.sifSpecGraphSearch) || {};

		const voyageApiKey = (commandLineParameters.values.voyageApiKey || [])[0] || cfg.voyageApiKey;

		if (!voyageApiKey) {
			xLog.error('[sifSpecGraphManager] No voyageApiKey — set in sifSpecGraphSearch.ini or pass --voyageApiKey=KEY');
			process.exit(1);
		}

		createEmbeddings({
			neo4jBoltUri: cfg.neo4jBoltUri || 'bolt://localhost:7702',
			neo4jUser: cfg.neo4jUser || 'neo4j',
			neo4jPassword: cfg.neo4jPassword || '',
			voyageApiKey,
		}).then(() => {
			xLog.status('[sifSpecGraphManager] Embedding complete.');
		}).catch((err) => {
			xLog.error(`[sifSpecGraphManager] Embedding failed: ${err.message}`);
			process.exit(1);
		});
		return;
	}

	// No action specified
	xLog.error('Usage: sifSpecGraphManager -start|-stop|-status|-forceInit|-embed [options]');
	xLog.error('Use -help for full options list');
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

	// Accept JSON from stdin or argv[2] as override
	try {
		const stdinText = !process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : '';
		const possibleJson = process.argv[2] ? process.argv[2] : stdinText;
		commandLineParameters = JSON.parse(possibleJson);
		commandLineParameters.fromJson = true;
	} catch (err) {
		// no JSON found — use normal commandLineParameters
	}

	const getConfig = (name) => ({});

	process.global = Object.freeze({
		xLog: Object.freeze({ status: console.error, error: console.error, result: console.log }),
		getConfig,
		commandLineParameters,
		projectRoot,
	});
}

module.exports = moduleFunction({ moduleName })({});
