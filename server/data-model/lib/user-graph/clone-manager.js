'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[UserGraphSeam]]
// @concept: [[ColdClone]]
//
// clone-manager.js — the cold-clone provisioner behind getUserGraph (design doc 03).
// Materializes a genuine per-user isolated Neo4j by copying the QUIESCED golden data
// dir into a per-user clone dir and starting a dedicated container on it. Reuses the
// proven docker-run / port-scan / wait patterns from the CLI containerManager.
//
// THIS IS A MAC: no reflink. The copy is a PLAIN recursive cp of golden's data/ (and
// plugins/). The golden must be quiesced (stopped) for a consistent copy; we stop it,
// copy, and ALWAYS restart it (even on error) so the serving golden is never left down.
// Production (08) replaces the per-open quiesce with a snapshot-source + warm pool.

const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync, exec } = require('child_process');

const GOLDEN_CONTAINER = 'rag_DataModelExplorer';
const MAX_CONCURRENT_CLONES = 3; // resource hygiene (ONYX / plan §0.12)
const NEO4J_IMAGE = 'neo4j:5-community';

// ---------------------------------------------------------------------------
// Golden discovery — authoritative, from the live container's mounts (no hardcoded paths)

const getGoldenMounts = () => {
	const out = execSync(
		`docker inspect ${GOLDEN_CONTAINER} --format '{{range .Mounts}}{{.Destination}}={{.Source}}\n{{end}}'`,
		{ encoding: 'utf-8' },
	);
	const map = {};
	out.split('\n').filter(Boolean).forEach((line) => {
		const idx = line.indexOf('=');
		map[line.slice(0, idx)] = line.slice(idx + 1);
	});
	return { dataDir: map['/data'], pluginsDir: map['/plugins'] };
};

const getUserGraphsBase = () => {
	const { dataDir } = getGoldenMounts();
	const dataStores = dataDir.split('/dataStores/')[0] + '/dataStores';
	return path.join(dataStores, 'userGraphs');
};

const cloneDirFor = (userRefId, versionRefId) =>
	path.join(getUserGraphsBase(), `uid-${userRefId}`, `ver-${versionRefId || 'new'}`);

const containerNameFor = (userRefId, versionRefId) =>
	`usr_${userRefId}_${versionRefId || 'new'}`.replace(/[^A-Za-z0-9_.-]/g, '_');

const getGoldenPassword = () => {
	const { getConfig } = process.global;
	const cfg = getConfig('dataModelExplorerSearch') || {};
	return cfg.neo4jPassword;
};

// ---------------------------------------------------------------------------
// Docker + port helpers (mirrors cli/.../containerManager.js)

const isContainerRunning = (name) => {
	try {
		return (
			execSync(`docker inspect --format '{{.State.Running}}' ${name} 2>/dev/null`, {
				encoding: 'utf-8',
			}).trim() === 'true'
		);
	} catch (e) {
		return false;
	}
};

const containerExists = (name) => {
	try {
		execSync(`docker inspect ${name} 2>/dev/null`, { encoding: 'utf-8' });
		return true;
	} catch (e) {
		return false;
	}
};

const countCloneContainers = () => {
	try {
		const out = execSync(`docker ps -a --filter name=usr_ --format '{{.Names}}'`, {
			encoding: 'utf-8',
		}).trim();
		return out ? out.split('\n').filter(Boolean).length : 0;
	} catch (e) {
		return 0;
	}
};

const getDockerBoundPorts = () => {
	try {
		const output = execSync("docker ps --format '{{.Ports}}' 2>/dev/null", {
			encoding: 'utf-8',
		});
		const ports = new Set();
		for (const m of output.matchAll(/0\.0\.0\.0:(\d+)->/g)) {
			ports.add(parseInt(m[1], 10));
		}
		return ports;
	} catch (e) {
		return new Set();
	}
};

const isPortAvailable = (port, callback) => {
	const server = net.createServer();
	server.once('error', () => callback('', false));
	server.once('listening', () => server.close(() => callback('', true)));
	server.listen(port);
};

const findAvailablePortPair = (startPort, callback) => {
	const dockerPorts = getDockerBoundPorts();
	let candidate = startPort;
	const maxPort = startPort + 300;
	const tryNext = () => {
		if (candidate >= maxPort) {
			callback('No available port pair found in range');
			return;
		}
		if (dockerPorts.has(candidate) || dockerPorts.has(candidate + 1)) {
			candidate += 2;
			tryNext();
			return;
		}
		isPortAvailable(candidate, (e, boltFree) => {
			if (!boltFree) { candidate += 2; tryNext(); return; }
			isPortAvailable(candidate + 1, (e2, httpFree) => {
				if (!httpFree) { candidate += 2; tryNext(); return; }
				callback('', { boltPort: candidate, httpPort: candidate + 1 });
			});
		});
	};
	tryNext();
};

const waitForNeo4jReady = (boltPort, maxWaitMs, callback) => {
	const startTime = Date.now();
	const poll = () => {
		if (Date.now() - startTime > maxWaitMs) {
			callback(`Neo4j did not become ready within ${maxWaitMs / 1000}s on ${boltPort}`);
			return;
		}
		const socket = new net.Socket();
		socket.setTimeout(1000);
		socket.on('connect', () => { socket.destroy(); callback(''); });
		socket.on('error', () => { socket.destroy(); setTimeout(poll, 2000); });
		socket.on('timeout', () => { socket.destroy(); setTimeout(poll, 2000); });
		socket.connect(boltPort, 'localhost');
	};
	poll();
};

// Neo4j opens the Bolt PORT before it can SERVE queries (recovery on freshly-copied
// data). TCP-ready is not query-ready, so we additionally poll a real cypher query
// inside the container until it answers — only then is the clone actually usable.
const waitForCypherReady = (containerName, password, maxWaitMs, callback) => {
	const startTime = Date.now();
	const poll = () => {
		if (Date.now() - startTime > maxWaitMs) {
			callback(`cypher not ready within ${maxWaitMs / 1000}s on ${containerName}`);
			return;
		}
		exec(
			`docker exec ${containerName} cypher-shell -u neo4j -p '${password}' "RETURN 1 AS x" 2>/dev/null`,
			(err) => {
				if (!err) { callback(''); return; }
				setTimeout(poll, 2000);
			},
		);
	};
	poll();
};

// ---------------------------------------------------------------------------
// Golden quiescence — stop, run fn, ALWAYS restart golden (even on error)

const withQuiescedGolden = (copyFn, callback) => {
	const { xLog } = process.global;
	const wasRunning = isContainerRunning(GOLDEN_CONTAINER);

	const restartGolden = (originalErr, doneCb) => {
		if (!wasRunning) { doneCb(originalErr); return; }
		try {
			execSync(`docker start ${GOLDEN_CONTAINER}`, { encoding: 'utf-8' });
		} catch (e) {
			doneCb(originalErr || `golden restart failed: ${e.message}`);
			return;
		}
		// Golden serves bolt 7706 inside the container -> host 7706.
		waitForNeo4jReady(7706, 90000, (readyErr) => {
			doneCb(originalErr || readyErr || '');
		});
	};

	if (wasRunning) {
		try {
			xLog.status(`[clone-manager] quiescing golden (${GOLDEN_CONTAINER})`);
			execSync(`docker stop ${GOLDEN_CONTAINER}`, { encoding: 'utf-8' });
		} catch (e) {
			callback(`failed to stop golden: ${e.message}`);
			return;
		}
	}

	let copyErr = '';
	try {
		copyFn();
	} catch (e) {
		copyErr = `clone copy failed: ${e.message}`;
	}

	restartGolden(copyErr, (finalErr) => {
		if (finalErr) { callback(finalErr); return; }
		xLog.status(`[clone-manager] golden restarted and ready`);
		callback('');
	});
};

// ---------------------------------------------------------------------------
// provisionClone — the cold clone (doc 03 step 2). callback(err, descriptor)

const provisionClone = ({ userRefId, versionRefId }, callback) => {
	const { xLog } = process.global;

	if (!userRefId) { callback('provisionClone: userRefId is required'); return; }

	if (countCloneContainers() >= MAX_CONCURRENT_CLONES) {
		callback(`clone cap reached (${MAX_CONCURRENT_CLONES} concurrent) — free one first`);
		return;
	}

	const { dataDir: goldenData, pluginsDir: goldenPlugins } = getGoldenMounts();
	if (!goldenData) { callback('provisionClone: could not resolve golden data dir'); return; }

	const containerName = containerNameFor(userRefId, versionRefId);
	const cloneDir = cloneDirFor(userRefId, versionRefId);
	const password = getGoldenPassword();
	if (!password) { callback('provisionClone: golden password unavailable from config'); return; }

	// Defensive clean slate: a stale container/dir for this user+version must not linger.
	if (containerExists(containerName)) {
		try { execSync(`docker rm -f ${containerName}`, { encoding: 'utf-8' }); } catch (e) {}
	}
	try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (e) {}

	['data', 'logs', 'plugins', 'import'].forEach((sub) => {
		fs.mkdirSync(path.join(cloneDir, sub), { recursive: true });
	});

	// Copy golden under quiescence (plain recursive cp — NO reflink on this Mac).
	const copyFn = () => {
		execSync(`cp -R "${goldenData}/." "${path.join(cloneDir, 'data')}/"`, {
			encoding: 'utf-8',
			timeout: 180000,
		});
		if (goldenPlugins && fs.existsSync(goldenPlugins)) {
			execSync(`cp -R "${goldenPlugins}/." "${path.join(cloneDir, 'plugins')}/"`, {
				encoding: 'utf-8',
				timeout: 60000,
			});
		}
	};

	xLog.status(`[clone-manager] provisioning ${containerName} (clone of golden)`);

	withQuiescedGolden(copyFn, (quiesceErr) => {
		if (quiesceErr) {
			try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (e) {}
			callback(quiesceErr);
			return;
		}

		findAvailablePortPair(7710, (portErr, ports) => {
			if (portErr) {
				try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (e) {}
				callback(portErr);
				return;
			}

			const { boltPort, httpPort } = ports;

			// GOTCHA: clone carries golden's system DB (and its password). Do NOT pass
			// NEO4J_AUTH — it reinitializes the system db and wipes the cloned data.
			const dockerCmd =
				`docker run -d --name ${containerName} ` +
				`-p ${boltPort}:7687 -p ${httpPort}:7474 ` +
				`-e NEO4J_PLUGINS='["apoc"]' ` +
				`-e NEO4J_dbms_security_procedures_unrestricted=apoc.* ` +
				`-e NEO4J_dbms_security_procedures_allowlist=apoc.* ` +
				`-v ${cloneDir}/data:/data -v ${cloneDir}/logs:/logs ` +
				`-v ${cloneDir}/plugins:/plugins -v ${cloneDir}/import:/var/lib/neo4j/import ` +
				`${NEO4J_IMAGE}`;

			exec(dockerCmd, (runErr, stdout, stderr) => {
				if (runErr) {
					try { execSync(`docker rm -f ${containerName}`, { encoding: 'utf-8' }); } catch (e) {}
					try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (e) {}
					callback(`docker run failed: ${runErr.message}\n${stderr}`);
					return;
				}

				const descriptor = {
					containerName,
					cloneDir,
					boltPort,
					httpPort,
					boltUri: `bolt://localhost:${boltPort}`,
					user: 'neo4j',
					password,
				};

				waitForNeo4jReady(boltPort, 120000, (tcpErr) => {
					if (tcpErr) { callback(tcpErr, descriptor); return; }
					waitForCypherReady(containerName, password, 120000, (cypherErr) => {
						if (cypherErr) { callback(cypherErr, descriptor); return; }
						xLog.status(`[clone-manager] ${containerName} query-ready on bolt ${boltPort}`);
						callback('', descriptor);
					});
				});
			});
		});
	});
};

// ---------------------------------------------------------------------------
// teardownClone — stop+remove the container and delete the clone dir. callback(err, info)

const teardownClone = ({ containerName, cloneDir }, callback) => {
	const { xLog } = process.global;
	const cb = typeof callback === 'function' ? callback : () => {};

	if (containerName && containerExists(containerName)) {
		try { execSync(`docker rm -f ${containerName}`, { encoding: 'utf-8' }); } catch (e) {
			cb(`failed to remove container ${containerName}: ${e.message}`);
			return;
		}
	}

	if (cloneDir) {
		try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (e) {
			cb(`failed to remove clone dir ${cloneDir}: ${e.message}`);
			return;
		}
		// Remove the parent uid-{userRefId} dir too, but only if it is now empty
		// (a user may hold other version clone dirs under it).
		try {
			const parent = path.dirname(cloneDir);
			if (path.basename(parent).startsWith('uid-') && fs.readdirSync(parent).length === 0) {
				fs.rmdirSync(parent);
			}
		} catch (e) { /* leave the parent if anything is off */ }
	}

	if (xLog) xLog.status(`[clone-manager] torn down ${containerName || '(no container)'}`);
	cb('', { containerName, cloneDir, removed: true });
};

module.exports = {
	provisionClone,
	teardownClone,
	cloneDirFor,
	containerNameFor,
	countCloneContainers,
	containerExists,
	isContainerRunning,
	getUserGraphsBase,
	MAX_CONCURRENT_CLONES,
};
