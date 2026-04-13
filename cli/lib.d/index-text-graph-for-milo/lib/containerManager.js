'use strict';

// containerManager.js — Docker lifecycle management for Neo4j RAG containers
// Actions: start (idempotent), stop, status, forceInit

const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync, exec } = require('child_process');
const crypto = require('crypto');
const configFileProcessor = require('qtools-config-file-processor');

const moduleName = 'containerManager';

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

// ---------------------------------------------------------------------
// isPortAvailable — Check if a TCP port is free

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

// ---------------------------------------------------------------------
// findAvailablePortPair — Scan from startPort for two consecutive free ports

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

// ---------------------------------------------------------------------
// isContainerRunning — Check Docker container state

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

// ---------------------------------------------------------------------
// containerExists — Check if container exists (running or stopped)

const containerExists = (containerName) => {
	try {
		execSync(`docker inspect ${containerName} 2>/dev/null`, { encoding: 'utf-8' });
		return true;
	} catch (err) {
		return false;
	}
};

// ---------------------------------------------------------------------
// waitForNeo4jReady — Poll bolt port until Neo4j responds

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
// ACTIONS
// =====================================================================

// ---------------------------------------------------------------------
// startContainer — Idempotent container startup

const startContainer = ({ providerName, voyageApiKey, embeddingModel, embeddingDimensions, projectRoot, assetsDir }, callback) => {
	const { xLog } = process.global;

	const dataStoreBase = path.join(projectRoot, 'dataStores', 'instanceSpecific', 'index-text-graph-for-milo');
	const instanceConfigPath = path.join(dataStoreBase, 'index-text-graph-for-milo.ini');

	// If instanceConfig exists, container was previously initialized
	if (fs.existsSync(instanceConfigPath)) {
		const existingConfig = configFileProcessor.getConfig(
			'index-text-graph-for-milo.ini',
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
		const searchConfig = existingConfig['search'] || {};

		// Ensure search .ini exists (idempotent)
		const ensureSearchIni = () => {
			generateSearchIni({
				projectRoot,
				providerName: neo4jConfig.containerName.replace(/^rag_/, ''),
				boltPort: neo4jConfig.boltPort,
				neo4jPassword: neo4jConfig.password,
				voyageApiKey: embeddingConfig.voyageApiKey || voyageApiKey || '',
				embeddingModel: embeddingConfig.embeddingModel || 'voyage-4',
				embeddingDimensions: embeddingConfig.embeddingDimensions || '1024',
				topK: searchConfig.topK || 10,
			});
		};

		if (isContainerRunning(containerName)) {
			xLog.status(`[containerManager] ${containerName} is already running`);
			ensureSearchIni();
			callback('', { containerName, boltPort: neo4jConfig.boltPort, httpPort: neo4jConfig.httpPort });
			return;
		}

		// Container exists but stopped — start it
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

		// instanceConfig exists but container is gone — recreate
		xLog.status(`[containerManager] Container ${containerName} not found, recreating...`);
	}

	// First-time initialization

	// Check for pre-built assets (portable database from -indexText)
	let assetManifest = null;
	const manifestPath = assetsDir ? path.join(assetsDir, 'manifest.json') : null;
	const assetTarball = assetsDir ? path.join(assetsDir, 'neo4j-data.tar.gz') : null;

	if (manifestPath && fs.existsSync(manifestPath) && assetTarball && fs.existsSync(assetTarball)) {
		assetManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
		xLog.status(`[containerManager] Found pre-built assets for ${assetManifest.providerName}`);
	}

	// Resolve providerName from assets if not provided via CLI
	const resolvedProviderName = providerName || (assetManifest && assetManifest.providerName) || null;

	if (!resolvedProviderName) {
		callback('--name (providerName) is required for first-time init (or provide --assetsDir with manifest)');
		return;
	}

	// Check for docker in PATH
	try {
		execSync('which docker', { encoding: 'utf-8' });
	} catch (err) {
		callback('docker not found in PATH. Install Docker first.');
		return;
	}

	// Find available ports
	findAvailablePortPair(7700, (err, ports) => {
		if (err) {
			callback(err);
			return;
		}

		const { boltPort, httpPort } = ports;
		const containerName = `rag_${resolvedProviderName}`;
		const generatedPassword = assetManifest ? assetManifest.neo4jPassword : crypto.randomBytes(16).toString('hex');
		const dataDir = path.join(dataStoreBase, `neo4j-${resolvedProviderName}`);

		// Resolve defaults (assets take precedence over CLI args)
		const resolvedModel = (assetManifest && assetManifest.embeddingModel) || embeddingModel || 'voyage-4';
		const resolvedDimensions = (assetManifest && String(assetManifest.embeddingDimensions)) || embeddingDimensions || '1024';
		const resolvedVoyageKey = voyageApiKey || '';

		xLog.status(`[containerManager] Initializing ${containerName} on ports bolt:${boltPort} http:${httpPort}`);

		// Create directory structure
		if (!fs.existsSync(dataStoreBase)) {
			fs.mkdirSync(dataStoreBase, { recursive: true });
		}

		if (assetManifest && assetTarball) {
			// Extract pre-built data from tarball
			xLog.status(`[containerManager] Extracting pre-built Neo4j data from tarball...`);
			if (!fs.existsSync(dataDir)) {
				fs.mkdirSync(dataDir, { recursive: true });
			}
			try {
				execSync(`tar -xzf "${assetTarball}" -C "${dataDir}"`, { encoding: 'utf-8', timeout: 120000 });
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
			// Fresh init — create all empty dirs
			['data', 'logs', 'plugins', 'import'].forEach((sub) => {
				const subPath = path.join(dataDir, sub);
				if (!fs.existsSync(subPath)) {
					fs.mkdirSync(subPath, { recursive: true });
				}
			});
		}

		// Write instanceConfig from template
		const templatePath = path.join(__dirname, '..', 'assets', 'instanceConfig.template.ini');
		let templateContent = fs.readFileSync(templatePath, 'utf-8');

		const substitutions = {
			providerName: resolvedProviderName,
			containerName,
			boltPort: String(boltPort),
			httpPort: String(httpPort),
			generatedPassword,
			dataDir,
			voyageApiKey: resolvedVoyageKey,
			embeddingModel: resolvedModel,
			embeddingDimensions: resolvedDimensions,
		};

		Object.keys(substitutions).forEach((key) => {
			const token = new RegExp(`<!${key}!>`, 'g');
			templateContent = templateContent.replace(token, substitutions[key]);
		});

		fs.writeFileSync(instanceConfigPath, templateContent);
		xLog.status(`[containerManager] Wrote instanceConfig to ${instanceConfigPath}`);

		// Build and execute docker run command
		const dockerTemplatePath = path.join(__dirname, '..', 'assets', 'docker-run.template.sh');
		let dockerCmd = fs.readFileSync(dockerTemplatePath, 'utf-8');

		Object.keys(substitutions).forEach((key) => {
			const token = new RegExp(`<!${key}!>`, 'g');
			dockerCmd = dockerCmd.replace(token, substitutions[key]);
		});

		// Execute docker run
		exec(dockerCmd.replace(/\\\n\s*/g, ' '), (execErr, stdout, stderr) => {
			if (execErr) {
				callback(`Docker run failed: ${execErr.message}\n${stderr}`);
				return;
			}

			xLog.status(`[containerManager] Container ${containerName} created`);

			// Wait for Neo4j to be ready
			waitForNeo4jReady(boltPort, 60000, (waitErr) => {
				if (waitErr) {
					callback(waitErr);
					return;
				}

				// afterReady — generate search .ini and return
				const afterReady = () => {
					// Generate search .ini in configs
					generateSearchIni({
						projectRoot,
						providerName: resolvedProviderName,
						boltPort: String(boltPort),
						neo4jPassword: generatedPassword,
						voyageApiKey: resolvedVoyageKey,
						embeddingModel: resolvedModel,
						embeddingDimensions: resolvedDimensions,
						topK: (assetManifest && assetManifest.topK) || 10,
					});

					callback('', { containerName, boltPort: String(boltPort), httpPort: String(httpPort), password: generatedPassword });
				};

				if (assetManifest) {
					// Data already has vector index from the source — just verify
					xLog.status('[containerManager] Pre-built data loaded, skipping index creation');
					afterReady();
				} else {
					// Fresh init — create vector index
					const createIndexQuery = `CREATE VECTOR INDEX chunk_vector_index IF NOT EXISTS FOR (c:Chunk) ON (c.embedding) OPTIONS {indexConfig: {\\\`vector.dimensions\\\`: ${resolvedDimensions}, \\\`vector.similarity_function\\\`: 'cosine'}}`;
					const createIndexCmd = `docker exec ${containerName} cypher-shell -u neo4j -p ${generatedPassword} -a bolt://localhost:7687 "${createIndexQuery}"`;

					const attemptCreateIndex = (attemptsLeft) => {
						exec(createIndexCmd, (indexErr, indexStdout, indexStderr) => {
							if (indexErr && attemptsLeft > 0) {
								xLog.status('[containerManager] Neo4j not ready for queries yet, retrying...');
								setTimeout(() => attemptCreateIndex(attemptsLeft - 1), 3000);
								return;
							}
							if (indexErr) {
								callback(`Vector index creation failed: ${indexErr.message}\n${indexStderr}`);
								return;
							}

							xLog.status(`[containerManager] Vector index created (${resolvedDimensions} dimensions, cosine)`);
							afterReady();
						});
					};

					attemptCreateIndex(5);
				}
			});
		});
	});
};

// ---------------------------------------------------------------------
// generateSearchIni — Write the search tool .ini to configs/instanceSpecific/

const generateSearchIni = ({ projectRoot, providerName, boltPort, neo4jPassword, voyageApiKey, embeddingModel, embeddingDimensions, topK }) => {
	const { xLog } = process.global;
	const os = require('os');

	const camelName = providerName.charAt(0).toLowerCase() + providerName.slice(1);
	const configName = os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDestDir = path.join(projectRoot, 'configs', configName);
	const searchIniPath = path.join(configDestDir, `${camelName}Search.ini`);

	const searchIniContent = `[${camelName}Search]
neo4jBoltUri=bolt://localhost:${boltPort}
neo4jUser=neo4j
neo4jPassword=${neo4jPassword}
voyageApiKey=${voyageApiKey}
embeddingModel=${embeddingModel}
embeddingDimensions=${embeddingDimensions}
topK=${topK}
sourceLabel=${providerName}
`;

	if (!fs.existsSync(configDestDir)) {
		fs.mkdirSync(configDestDir, { recursive: true });
	}
	fs.writeFileSync(searchIniPath, searchIniContent);
	xLog.status(`[containerManager] Search config written: ${searchIniPath}`);
};

// ---------------------------------------------------------------------
// stopContainer — Stop the container

const stopContainer = ({ providerName, projectRoot }, callback) => {
	const { xLog } = process.global;

	const containerName = resolveContainerName({ providerName, projectRoot });
	if (!containerName) {
		callback('Cannot determine container name. Provide --name or ensure instanceConfig exists.');
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
// statusContainer — Report container status

const statusContainer = ({ providerName, projectRoot }, callback) => {
	const { xLog } = process.global;

	const dataStoreBase = path.join(projectRoot, 'dataStores', 'instanceSpecific', 'index-text-graph-for-milo');
	const instanceConfigPath = path.join(dataStoreBase, 'index-text-graph-for-milo.ini');

	if (!fs.existsSync(instanceConfigPath)) {
		xLog.status('[containerManager] No instanceConfig found. Run -start first.');
		callback('');
		return;
	}

	const existingConfig = configFileProcessor.getConfig(
		'index-text-graph-for-milo.ini',
		dataStoreBase + '/',
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

	if (running) {
		const countCmd = `docker exec ${containerName} cypher-shell -u neo4j -p ${neo4jConfig.password} "MATCH (c:Chunk) RETURN count(c) AS total"`;
		exec(countCmd, (err, stdout) => {
			if (!err && stdout) {
				const match = stdout.match(/(\d+)/);
				if (match) {
					xLog.status(`[containerManager] Chunk count: ${match[1]}`);
				}
			}
			callback('', { containerName, running, ...neo4jConfig });
		});
	} else {
		callback('', { containerName, running, ...neo4jConfig });
	}
};

// ---------------------------------------------------------------------
// forceInitContainer — Destroy everything and start fresh

const forceInitContainer = ({ providerName, projectRoot, confirm }, callback) => {
	const { xLog } = process.global;

	if (!confirm) {
		callback('forceInit requires --confirm flag to proceed');
		return;
	}

	const dataStoreBase = path.join(projectRoot, 'dataStores', 'instanceSpecific', 'index-text-graph-for-milo');
	const instanceConfigPath = path.join(dataStoreBase, 'index-text-graph-for-milo.ini');

	let containerName = providerName ? `rag_${providerName}` : null;

	// Try to read container name from config if not provided
	if (!containerName && fs.existsSync(instanceConfigPath)) {
		const existingConfig = configFileProcessor.getConfig(
			'index-text-graph-for-milo.ini',
			dataStoreBase + '/',
			{ resolve: false }
		);
		containerName = (existingConfig['neo4j'] || {}).containerName;
	}

	if (containerName) {
		// Stop if running
		if (isContainerRunning(containerName)) {
			xLog.status(`[containerManager] Stopping ${containerName}...`);
			try {
				execSync(`docker stop ${containerName}`, { encoding: 'utf-8' });
			} catch (err) {
				// ignore stop errors
			}
		}

		// Remove container
		if (containerExists(containerName)) {
			xLog.status(`[containerManager] Removing container ${containerName}...`);
			try {
				execSync(`docker rm ${containerName}`, { encoding: 'utf-8' });
			} catch (err) {
				// ignore remove errors
			}
		}
	}

	// Delete dataStore directory
	if (fs.existsSync(dataStoreBase)) {
		xLog.status(`[containerManager] Removing ${dataStoreBase}...`);
		fs.rmSync(dataStoreBase, { recursive: true, force: true });
	}

	xLog.status('[containerManager] Destroyed. Run -start to recreate.');
	callback('');
};

// =====================================================================
// HELPERS
// =====================================================================

// ---------------------------------------------------------------------
// resolveContainerName — Get container name from args or config

const resolveContainerName = ({ providerName, projectRoot }) => {
	if (providerName) return `rag_${providerName}`;

	const dataStoreBase = path.join(projectRoot, 'dataStores', 'instanceSpecific', 'index-text-graph-for-milo');
	const instanceConfigPath = path.join(dataStoreBase, 'index-text-graph-for-milo.ini');

	if (fs.existsSync(instanceConfigPath)) {
		const existingConfig = configFileProcessor.getConfig(
			'index-text-graph-for-milo.ini',
			dataStoreBase + '/',
			{ resolve: false }
		);
		return (existingConfig['neo4j'] || {}).containerName;
	}

	return null;
};

// =====================================================================
// EXPORTS
// =====================================================================

module.exports = { startContainer, stopContainer, statusContainer, forceInitContainer };
