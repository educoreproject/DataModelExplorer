'use strict';

// containerManager.js — Docker lifecycle management for DataModelExplorer Neo4j container
// Derived from index-ontology14-for-milo/lib/containerManager.js

const fs = require('fs');
const path = require('path');
const net = require('net');
const os = require('os');
const { execSync, exec } = require('child_process');
const crypto = require('crypto');
const configFileProcessor = require('qtools-config-file-processor');

const moduleName = 'containerManager';
const INSTANCE_DIR_NAME = 'index-data-model-explorer-for-milo';
const CONTAINER_NAME = 'rag_DataModelExplorer';
const SEARCH_MODULE_NAME = 'dataModelExplorerSearch';

// =====================================================================
// PORT SCANNING
// =====================================================================

// getDockerBoundPorts — Collect host-side ports already claimed by Docker containers.
// Docker's port binding is asynchronous: `docker run -d` returns before the port is
// fully bound at the OS level. A net.createServer check can see the port as "free"
// even though Docker is about to bind it. Querying `docker ps` catches these ports
// because Docker tracks them internally as soon as the container is created.
const getDockerBoundPorts = () => {
	try {
		const output = execSync(
			"docker ps --format '{{.Ports}}' 2>/dev/null",
			{ encoding: 'utf-8' }
		);
		const ports = new Set();
		const matches = output.matchAll(/0\.0\.0\.0:(\d+)->/g);
		for (const match of matches) {
			ports.add(parseInt(match[1], 10));
		}
		return ports;
	} catch (err) {
		return new Set();
	}
};

const isPortAvailable = (port, callback) => {
	const server = net.createServer();
	server.once('error', () => {
		callback('', false);
	});
	server.once('listening', () => {
		server.close(() => {
			callback('', true);
		});
	});
	server.listen(port);
};

const findAvailablePortPair = (startPort, callback) => {
	const { xLog } = process.global;
	const dockerPorts = getDockerBoundPorts();
	let candidate = startPort;
	const maxPort = startPort + 200;

	const tryNext = () => {
		if (candidate >= maxPort) {
			callback('No available port pair found in range');
			return;
		}

		// Skip ports already claimed by Docker (catches async binding race)
		if (dockerPorts.has(candidate) || dockerPorts.has(candidate + 1)) {
			candidate += 2;
			tryNext();
			return;
		}

		isPortAvailable(candidate, (err, boltFree) => {
			if (!boltFree) {
				candidate += 2;
				tryNext();
				return;
			}

			isPortAvailable(candidate + 1, (err, httpFree) => {
				if (!httpFree) {
					candidate += 2;
					tryNext();
					return;
				}

				callback('', { boltPort: candidate, httpPort: candidate + 1 });
			});
		});
	};

	tryNext();
};

// =====================================================================
// DOCKER HELPERS
// =====================================================================

const isContainerRunning = (containerName) => {
	try {
		const result = execSync(
			`docker inspect --format '{{.State.Running}}' ${containerName} 2>/dev/null`,
			{ encoding: 'utf-8' }
		).trim();
		return result === 'true';
	} catch (err) {
		return false;
	}
};

const containerExists = (containerName) => {
	try {
		execSync(`docker inspect ${containerName} 2>/dev/null`, { encoding: 'utf-8' });
		return true;
	} catch (err) {
		return false;
	}
};

const waitForNeo4jReady = (boltPort, maxWaitMs, callback) => {
	const { xLog } = process.global;
	const startTime = Date.now();
	const pollInterval = 2000;

	const poll = () => {
		const elapsed = Date.now() - startTime;
		if (elapsed > maxWaitMs) {
			callback(`Neo4j did not become ready within ${maxWaitMs / 1000}s`);
			return;
		}

		const socket = new net.Socket();
		socket.setTimeout(1000);

		socket.on('connect', () => {
			socket.destroy();
			xLog.status(`[containerManager] Neo4j ready on bolt port ${boltPort} (${Math.round(elapsed / 1000)}s)`);
			callback('');
		});

		socket.on('error', () => {
			socket.destroy();
			setTimeout(poll, pollInterval);
		});

		socket.on('timeout', () => {
			socket.destroy();
			setTimeout(poll, pollInterval);
		});

		socket.connect(boltPort, 'localhost');
	};

	xLog.status('[containerManager] Waiting for Neo4j to become ready...');
	poll();
};

// =====================================================================
// CONFIG HELPERS
// =====================================================================

const getConfigDir = (providerProjectRoot) => {
	const hostname = os.hostname();
	const configName = (hostname === 'qMini.local' || hostname === 'qbook.local') ? 'instanceSpecific/qbook' : '';
	return path.join(providerProjectRoot, 'configs', configName);
};

const getSearchIniPath = (providerProjectRoot) => {
	return path.join(getConfigDir(providerProjectRoot), `${SEARCH_MODULE_NAME}.ini`);
};

const getDataStoreBase = (providerProjectRoot) => {
	return path.join(providerProjectRoot, 'dataStores', 'instanceSpecific', INSTANCE_DIR_NAME);
};

const getInstanceConfigPath = (providerProjectRoot) => {
	return path.join(getDataStoreBase(providerProjectRoot), `${INSTANCE_DIR_NAME}.ini`);
};

// =====================================================================
// ACTIONS
// =====================================================================

const startContainer = ({ voyageApiKey, providerProjectRoot, providerDir, assetsDir }, callback) => {
	const { xLog } = process.global;

	const dataStoreBase = getDataStoreBase(providerProjectRoot);
	const instanceConfigPath = getInstanceConfigPath(providerProjectRoot);

	// Case 1: instanceConfig exists — container previously managed by us
	if (fs.existsSync(instanceConfigPath)) {
		const existingConfig = configFileProcessor.getConfig(
			`${INSTANCE_DIR_NAME}.ini`,
			dataStoreBase + '/',
			{ resolve: false }
		);
		const neo4jConfig = existingConfig['neo4j'] || {};
		const containerName = neo4jConfig.containerName;

		if (!containerName) {
			callback('instanceConfig exists but has no containerName');
			return;
		}

		const embeddingConfig = existingConfig['embedding'] || {};

		const ensureSearchIni = () => {
			generateSearchIni({
				providerProjectRoot,
				boltPort: neo4jConfig.boltPort,
				neo4jPassword: neo4jConfig.password,
				voyageApiKey: embeddingConfig.voyageApiKey || voyageApiKey || '',
			});
		};

		if (isContainerRunning(containerName)) {
			xLog.status(`[containerManager] ${containerName} is already running`);
			ensureSearchIni();
			callback('', { containerName, boltPort: neo4jConfig.boltPort, httpPort: neo4jConfig.httpPort });
			return;
		}

		if (containerExists(containerName)) {
			xLog.status(`[containerManager] Starting stopped container ${containerName}...`);
			try {
				execSync(`docker start ${containerName}`, { encoding: 'utf-8' });
			} catch (err) {
				callback(`Failed to start container: ${err.message}`);
				return;
			}

			waitForNeo4jReady(parseInt(neo4jConfig.boltPort, 10), 60000, (err) => {
				if (err) {
					callback(err);
					return;
				}
				ensureSearchIni();
				callback('', { containerName, boltPort: neo4jConfig.boltPort, httpPort: neo4jConfig.httpPort });
			});
			return;
		}

		xLog.status(`[containerManager] Container ${containerName} not found, recreating...`);
	}

	// -----------------------------------------------------------------
	// Resolve assets directory for tarball-based cold start
	// -----------------------------------------------------------------

	let assetManifest = null;
	const resolvedAssetsDir = assetsDir
		? (path.isAbsolute(assetsDir) ? assetsDir : path.join(providerDir, assetsDir))
		: null;
	const manifestPath = resolvedAssetsDir ? path.join(resolvedAssetsDir, 'manifest.json') : null;
	const assetTarball = resolvedAssetsDir ? path.join(resolvedAssetsDir, 'neo4j-data.tar.gz') : null;

	if (manifestPath && fs.existsSync(manifestPath)) {
		assetManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
	}

	// Case 2: Search .ini already exists — container previously set up
	const searchIniPath = getSearchIniPath(providerProjectRoot);
	if (fs.existsSync(searchIniPath)) {
		xLog.status(`[containerManager] Search config already exists: ${searchIniPath}`);
		xLog.status('[containerManager] Skipping initialization — existing database may contain additional data.');
		try {
			const existingSearchConfig = configFileProcessor.getConfig(
				`${SEARCH_MODULE_NAME}.ini`,
				getConfigDir(providerProjectRoot) + '/',
				{ resolve: false }
			);
			const searchSection = existingSearchConfig[SEARCH_MODULE_NAME] || {};
			const boltUri = searchSection.neo4jBoltUri || 'bolt://localhost:7687';
			const portMatch = boltUri.match(/:(\d+)$/);
			const boltPort = portMatch ? portMatch[1] : '7687';
			callback('', { containerName: 'external', boltPort, httpPort: 'unknown' });
		} catch (err) {
			callback('', { containerName: 'external', boltPort: 'unknown', httpPort: 'unknown' });
		}
		return;
	}

	// -----------------------------------------------------------------
	// Case 3: Fresh installation — create from tarball or empty
	// -----------------------------------------------------------------

	const hasTarball = assetManifest && assetTarball && fs.existsSync(assetTarball);

	if (!hasTarball && !assetManifest) {
		// No tarball, no manifest — create empty container with generated password
		xLog.status('[containerManager] No assets found — creating empty container');
	} else if (!hasTarball) {
		callback('manifest.json found but neo4j-data.tar.gz missing from assets');
		return;
	} else {
		xLog.status(`[containerManager] Found pre-built assets for ${assetManifest.providerName}`);
	}

	try {
		execSync('which docker', { encoding: 'utf-8' });
	} catch (err) {
		callback('docker not found in PATH. Install Docker first.');
		return;
	}

	findAvailablePortPair(7700, (err, ports) => {
		if (err) {
			callback(err);
			return;
		}

		const { boltPort, httpPort } = ports;
		const password = hasTarball ? assetManifest.password : crypto.randomBytes(16).toString('hex');
		const dataDir = path.join(dataStoreBase, 'neo4j-DataModelExplorer');

		xLog.status(`[containerManager] Initializing ${CONTAINER_NAME} on ports bolt:${boltPort} http:${httpPort}`);

		// Create directory structure
		if (!fs.existsSync(dataStoreBase)) {
			fs.mkdirSync(dataStoreBase, { recursive: true });
		}

		if (hasTarball) {
			// Extract pre-built data from tarball into dataDir/data/
			const dataSubDir = path.join(dataDir, 'data');
			if (!fs.existsSync(dataSubDir)) {
				fs.mkdirSync(dataSubDir, { recursive: true });
			}
			xLog.status('[containerManager] Extracting pre-built Neo4j data from tarball...');
			try {
				execSync(`tar -xzf "${assetTarball}" -C "${dataSubDir}"`, { encoding: 'utf-8', timeout: 120000 });
			} catch (cpErr) {
				callback(`Failed to extract asset tarball: ${cpErr.message}`);
				return;
			}
			// Create empty dirs for logs/plugins/import
			['logs', 'plugins', 'import'].forEach((sub) => {
				const subPath = path.join(dataDir, sub);
				if (!fs.existsSync(subPath)) {
					fs.mkdirSync(subPath, { recursive: true });
				}
			});
			xLog.status('[containerManager] Pre-built data extracted');
		} else {
			// Create empty directory structure
			['data', 'logs', 'plugins', 'import'].forEach((sub) => {
				const subPath = path.join(dataDir, sub);
				if (!fs.existsSync(subPath)) {
					fs.mkdirSync(subPath, { recursive: true });
				}
			});
		}

		// Write instanceConfig
		const instanceConfigContent = `[neo4j]
providerName=DataModelExplorer
containerName=${CONTAINER_NAME}
boltPort=${boltPort}
httpPort=${httpPort}
password=${password}
dataDir=${dataDir}
searchModuleName=${SEARCH_MODULE_NAME}

[embedding]
voyageApiKey=${voyageApiKey || ''}
`;

		fs.writeFileSync(instanceConfigPath, instanceConfigContent);
		xLog.status(`[containerManager] Wrote instanceConfig to ${instanceConfigPath}`);

		// When starting from tarball, do NOT pass NEO4J_AUTH — the tarball's system database
		// already has auth configured. Passing NEO4J_AUTH triggers Neo4j's password init
		// routine which reinitializes the system database and wipes the pre-built data.
		const authEnv = hasTarball ? '' : `-e NEO4J_AUTH=neo4j/${password} `;

		const dockerCmd = `docker run -d --name ${CONTAINER_NAME} --restart unless-stopped ` +
			`-p ${boltPort}:7687 -p ${httpPort}:7474 ` +
			`${authEnv}` +
			`-e NEO4J_PLUGINS='["apoc"]' ` +
			`-e NEO4J_dbms_security_procedures_unrestricted=apoc.* ` +
			`-e NEO4J_dbms_security_procedures_allowlist=apoc.* ` +
			`-v ${dataDir}/data:/data -v ${dataDir}/logs:/logs ` +
			`-v ${dataDir}/plugins:/plugins -v ${dataDir}/import:/var/lib/neo4j/import ` +
			`neo4j:5-community`;

		exec(dockerCmd, (execErr, stdout, stderr) => {
			if (execErr) {
				callback(`Docker run failed: ${execErr.message}\n${stderr}`);
				return;
			}

			xLog.status(`[containerManager] Container ${CONTAINER_NAME} created`);

			waitForNeo4jReady(boltPort, 90000, (waitErr) => {
				if (waitErr) {
					callback(waitErr);
					return;
				}

				if (hasTarball) {
					xLog.status('[containerManager] Pre-built data loaded, skipping index creation');
				}

				generateSearchIni({
					providerProjectRoot,
					boltPort: String(boltPort),
					neo4jPassword: password,
					voyageApiKey: voyageApiKey || '',
				});

				callback('', { containerName: CONTAINER_NAME, boltPort: String(boltPort), httpPort: String(httpPort) });
			});
		});
	});
};

// ---------------------------------------------------------------------
// generateSearchIni

const generateSearchIni = ({ providerProjectRoot, boltPort, neo4jPassword, voyageApiKey }) => {
	const { xLog } = process.global;

	const configDestDir = getConfigDir(providerProjectRoot);
	const searchIniPath = path.join(configDestDir, `${SEARCH_MODULE_NAME}.ini`);

	const searchIniContent = `[_substitutions]

neo4jBoltUri=bolt://localhost:${boltPort}
neo4jUser=neo4j
neo4jPassword=${neo4jPassword}
voyageApiKey=${voyageApiKey}

[${SEARCH_MODULE_NAME}]
neo4jBoltUri=<!neo4jBoltUri!>
neo4jUser=<!neo4jUser!>
neo4jPassword=<!neo4jPassword!>
voyageApiKey=<!voyageApiKey!>
`;

	if (!fs.existsSync(configDestDir)) {
		fs.mkdirSync(configDestDir, { recursive: true });
	}
	fs.writeFileSync(searchIniPath, searchIniContent);
	xLog.status(`[containerManager] Search config written: ${searchIniPath}`);
};

// ---------------------------------------------------------------------
// stopContainer

const stopContainer = ({ providerProjectRoot }, callback) => {
	const { xLog } = process.global;

	const containerName = resolveContainerName({ providerProjectRoot });
	if (!containerName) {
		callback('Cannot determine container name. Run -start first.');
		return;
	}

	if (!isContainerRunning(containerName)) {
		xLog.status(`[containerManager] ${containerName} is not running`);
		callback('');
		return;
	}

	try {
		execSync(`docker stop ${containerName}`, { encoding: 'utf-8' });
		xLog.status(`[containerManager] ${containerName} stopped`);
		callback('');
	} catch (err) {
		callback(`Failed to stop container: ${err.message}`);
	}
};

// ---------------------------------------------------------------------
// statusContainer

const statusContainer = ({ providerProjectRoot }, callback) => {
	const { xLog } = process.global;

	const instanceConfigPath = getInstanceConfigPath(providerProjectRoot);

	if (!fs.existsSync(instanceConfigPath)) {
		xLog.status('[containerManager] No instanceConfig found. Run -start first.');
		callback('');
		return;
	}

	const existingConfig = configFileProcessor.getConfig(
		`${INSTANCE_DIR_NAME}.ini`,
		getDataStoreBase(providerProjectRoot) + '/',
		{ resolve: false }
	);
	const neo4jConfig = existingConfig['neo4j'] || {};
	const containerName = neo4jConfig.containerName;

	const running = isContainerRunning(containerName);
	xLog.status(`[containerManager] Container: ${containerName}`);
	xLog.status(`[containerManager] Status: ${running ? 'RUNNING' : 'STOPPED'}`);
	xLog.status(`[containerManager] Bolt port: ${neo4jConfig.boltPort}`);
	xLog.status(`[containerManager] HTTP port: ${neo4jConfig.httpPort}`);
	xLog.status(`[containerManager] Data dir: ${neo4jConfig.dataDir}`);

	callback('', { containerName, running, ...neo4jConfig });
};

// ---------------------------------------------------------------------
// forceInitContainer

const forceInitContainer = ({ providerProjectRoot, confirm }, callback) => {
	const { xLog } = process.global;

	if (!confirm) {
		callback('forceInit requires --confirm flag to proceed');
		return;
	}

	const dataStoreBase = getDataStoreBase(providerProjectRoot);
	const instanceConfigPath = getInstanceConfigPath(providerProjectRoot);

	let containerName = null;

	if (fs.existsSync(instanceConfigPath)) {
		const existingConfig = configFileProcessor.getConfig(
			`${INSTANCE_DIR_NAME}.ini`,
			dataStoreBase + '/',
			{ resolve: false }
		);
		containerName = (existingConfig['neo4j'] || {}).containerName;
	}

	if (containerName) {
		if (isContainerRunning(containerName)) {
			xLog.status(`[containerManager] Stopping ${containerName}...`);
			try { execSync(`docker stop ${containerName}`, { encoding: 'utf-8' }); } catch (err) { /* ignore */ }
		}
		if (containerExists(containerName)) {
			xLog.status(`[containerManager] Removing container ${containerName}...`);
			try { execSync(`docker rm ${containerName}`, { encoding: 'utf-8' }); } catch (err) { /* ignore */ }
		}
	}

	if (fs.existsSync(dataStoreBase)) {
		xLog.status(`[containerManager] Removing ${dataStoreBase}...`);
		fs.rmSync(dataStoreBase, { recursive: true, force: true });
	}

	const searchIniPath = getSearchIniPath(providerProjectRoot);
	if (fs.existsSync(searchIniPath)) {
		xLog.status(`[containerManager] Removing ${searchIniPath}...`);
		fs.unlinkSync(searchIniPath);
	}

	xLog.status('[containerManager] Destroyed. Run -start to recreate.');
	callback('');
};

// =====================================================================
// HELPERS
// =====================================================================

const resolveContainerName = ({ providerProjectRoot }) => {
	const instanceConfigPath = getInstanceConfigPath(providerProjectRoot);
	if (fs.existsSync(instanceConfigPath)) {
		const existingConfig = configFileProcessor.getConfig(
			`${INSTANCE_DIR_NAME}.ini`,
			getDataStoreBase(providerProjectRoot) + '/',
			{ resolve: false }
		);
		return (existingConfig['neo4j'] || {}).containerName;
	}
	return null;
};

module.exports = { startContainer, stopContainer, statusContainer, forceInitContainer };
