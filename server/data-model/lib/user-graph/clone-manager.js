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

// ---------------------------------------------------------------------------
// Golden snapshot-source + atomic pointer (08). Clones copy from the CURRENT snapshot
// (a quiesced copy of golden that is never served) rather than quiescing the live
// golden on every open. Golden refresh = make a new snapshot + flip the pointer
// atomically; in-flight sessions are undisturbed, the next open lands on new golden.

const snapshotsBase = () => path.join(getUserGraphsBase(), '_snapshots');
const pointerPath = () => path.join(getUserGraphsBase(), '_currentSnapshot');

const currentSnapshotDir = () => {
	try {
		const name = fs.readFileSync(pointerPath(), 'utf8').trim();
		if (!name) return null;
		const dir = path.join(snapshotsBase(), name);
		return fs.existsSync(path.join(dir, 'data', 'databases')) ? dir : null;
	} catch (e) { return null; }
};

const flipPointer = (snapName) => {
	const tmp = pointerPath() + '.tmp';
	fs.writeFileSync(tmp, snapName);
	fs.renameSync(tmp, pointerPath()); // atomic on POSIX
};

// createSnapshot — quiesce golden ONCE, copy its data/+plugins into a new snapshot dir,
// flip the pointer atomically, restart golden. callback(err, { snapName, snapshotDir })
const createSnapshot = (callback) => {
	const { xLog } = process.global;
	const { dataDir: goldenData, pluginsDir: goldenPlugins } = getGoldenMounts();
	if (!goldenData) { callback('createSnapshot: could not resolve golden data dir'); return; }
	const snapName = `snap-${process.pid}-${process.hrtime.bigint().toString()}`;
	const snapDir = path.join(snapshotsBase(), snapName);
	['data', 'plugins'].forEach((sub) => fs.mkdirSync(path.join(snapDir, sub), { recursive: true }));
	const copyFn = () => {
		execSync(`cp -R "${goldenData}/." "${path.join(snapDir, 'data')}/"`, { encoding: 'utf-8', timeout: 180000 });
		if (goldenPlugins && fs.existsSync(goldenPlugins)) {
			execSync(`cp -R "${goldenPlugins}/." "${path.join(snapDir, 'plugins')}/"`, { encoding: 'utf-8', timeout: 60000 });
		}
	};
	withQuiescedGolden(copyFn, (err) => {
		if (err) { try { fs.rmSync(snapDir, { recursive: true, force: true }); } catch (e) {} callback(err); return; }
		flipPointer(snapName);
		if (xLog) xLog.status(`[clone-manager] snapshot ${snapName} created + pointer flipped`);
		callback('', { snapName, snapshotDir: snapDir });
	});
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

// Count only LIVE USER clones (usr_<realUser>_*), EXCLUDING idle warm spares (usr__warm_*).
// This is the number the MAX_CONCURRENT_CLONES user cap governs — warm spares live OUTSIDE
// it. A claimed warm spare is renamed to usr_<user>_<version>, so it correctly counts here.
const countUserCloneContainers = () => {
	try {
		const out = execSync(`docker ps -a --filter name=usr_ --format '{{.Names}}'`, {
			encoding: 'utf-8',
		}).trim();
		const names = out ? out.split('\n').filter(Boolean) : [];
		return names.filter((n) => !n.startsWith('usr__warm_')).length;
	} catch (e) {
		return 0;
	}
};

// docker rename — the warm-pool claim path uses this to turn an idle spare (usr__warm_*)
// into an owned user clone (usr_<userRefId>_<versionRefId>), so the container name always
// tells the truth about idle-vs-in-use (prevents re-adopting an in-use container as a spare).
const renameContainer = (oldName, newName) => {
	execSync(`docker rename ${oldName} ${newName}`, { encoding: 'utf-8' });
};

// describeWarmContainers — reconstruct descriptors for every RUNNING idle warm spare
// (usr__warm_*) from docker, so the warm pool can be ADOPTED across server restarts (the
// in-memory pool is empty on boot but the containers survive). Safe because a claimed spare
// is renamed away from usr__warm_*, so this only ever sees genuine idle spares.
const describeWarmContainers = () => {
	let names = [];
	try {
		const out = execSync(`docker ps --filter name=usr__warm_ --format '{{.Names}}'`, {
			encoding: 'utf-8',
		}).trim();
		names = out ? out.split('\n').filter(Boolean) : [];
	} catch (e) {
		return [];
	}
	const password = getGoldenPassword();
	const descriptors = [];
	names.forEach((name) => {
		try {
			const portOut = execSync(
				`docker inspect ${name} --format '{{range $p, $conf := .NetworkSettings.Ports}}{{$p}}={{(index $conf 0).HostPort}};{{end}}'`,
				{ encoding: 'utf-8' },
			).trim();
			let boltPort = null;
			let httpPort = null;
			portOut.split(';').filter(Boolean).forEach((kv) => {
				const eq = kv.indexOf('=');
				const cport = kv.slice(0, eq);
				const hport = parseInt(kv.slice(eq + 1), 10);
				if (cport.startsWith('7687')) boltPort = hport;
				if (cport.startsWith('7474')) httpPort = hport;
			});
			const mountOut = execSync(
				`docker inspect ${name} --format '{{range .Mounts}}{{.Destination}}={{.Source}}\n{{end}}'`,
				{ encoding: 'utf-8' },
			);
			let dataSrc = null;
			mountOut.split('\n').filter(Boolean).forEach((line) => {
				const eq = line.indexOf('=');
				if (line.slice(0, eq) === '/data') dataSrc = line.slice(eq + 1);
			});
			const cloneDir = dataSrc ? path.dirname(dataSrc) : null;
			if (boltPort && cloneDir) {
				// Verify the orphan is actually query-ready before adopting it. A half-booted
				// leftover (e.g. from a prior crashed prime) must never be handed to a user;
				// dead ones are torn down here so they do not accumulate across restarts.
				let ready = false;
				try {
					execSync(`docker exec ${name} cypher-shell -u neo4j -p '${password}' "RETURN 1 AS x" >/dev/null 2>&1`, { timeout: 15000 });
					ready = true;
				} catch (rdyErr) { ready = false; }
				if (ready) {
					descriptors.push({
						containerName: name,
						cloneDir,
						boltPort,
						httpPort,
						boltUri: `bolt://localhost:${boltPort}`,
						user: 'neo4j',
						password,
					});
				} else {
					if (process.global.xLog) process.global.xLog.status(`[dmeOpenTrace] clone-manager: orphan warm spare ${name} not query-ready — tearing it down (not adopting)`);
					teardownClone({ containerName: name, cloneDir }, () => {});
				}
			}
		} catch (e) {
			// skip an unreadable / half-gone container
		}
	});
	return descriptors;
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

const provisionCloneImpl = ({ userRefId, versionRefId }, callback) => {
	const { xLog } = process.global;

	if (!userRefId) { callback('provisionClone: userRefId is required'); return; }

	// The user cap governs LIVE USER graphs only; warm spares (userRefId '_warm') provision
	// outside it so priming the pool is never blocked by the user limit.
	const isWarmProvision = userRefId === '_warm';
	const currentUserCount = countUserCloneContainers();
	xLog.status(`[dmeOpenTrace] clone-manager: provisionClone entry — user clones=${currentUserCount}/${MAX_CONCURRENT_CLONES}${isWarmProvision ? ' (warm spare, outside user cap)' : ''}`);
	if (!isWarmProvision && currentUserCount >= MAX_CONCURRENT_CLONES) {
		xLog.status(`[dmeOpenTrace] clone-manager: USER CLONE CAP REACHED (${MAX_CONCURRENT_CLONES}) — refusing to provision`);
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

	// Copy the source (plain recursive cp — NO reflink on this Mac). ALWAYS copy from the
	// quiesced SNAPSHOT so the live golden is never taken down on an open. If no snapshot
	// exists yet (first open after startup, or after a deliberate golden refresh), LAZILY
	// create one — a single one-time quiesce of golden — then copy from it; every later
	// open reuses the static snapshot and never touches the live golden again.
	const copyFromSnapshot = (snapDir) => {
		const sData = path.join(snapDir, 'data');
		const sPlugins = path.join(snapDir, 'plugins');
		execSync(`cp -R "${sData}/." "${path.join(cloneDir, 'data')}/"`, { encoding: 'utf-8', timeout: 180000 });
		if (sPlugins && fs.existsSync(sPlugins)) {
			execSync(`cp -R "${sPlugins}/." "${path.join(cloneDir, 'plugins')}/"`, { encoding: 'utf-8', timeout: 60000 });
		}
	};

	const ensureSnapshotThenCopy = (cb) => {
		const existing = currentSnapshotDir();
		if (existing) {
			xLog.status(`[dmeOpenTrace] clone-manager: provisioning ${containerName} from EXISTING snapshot (no golden quiesce)`);
			let e = ''; try { copyFromSnapshot(existing); } catch (x) { e = `clone copy failed: ${x.message}`; } cb(e);
			return;
		}
		xLog.status(`[dmeOpenTrace] clone-manager: NO snapshot yet — creating one (one-time golden quiesce) before provisioning ${containerName}`);
		createSnapshot((snapErr, res) => {
			if (snapErr) { cb(`snapshot create failed: ${snapErr}`); return; }
			let e = ''; try { copyFromSnapshot(res.snapshotDir); } catch (x) { e = `clone copy failed: ${x.message}`; } cb(e);
		});
	};

	ensureSnapshotThenCopy((quiesceErr) => {
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
			xLog.status(`[dmeOpenTrace] clone-manager: port pair found boltPort=${boltPort} httpPort=${httpPort}; issuing docker run for ${containerName}`);

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

				xLog.status(`[dmeOpenTrace] clone-manager: container ${containerName} started; waiting for neo4j TCP+cypher readiness on bolt ${boltPort}`);
				waitForNeo4jReady(boltPort, 120000, (tcpErr) => {
					if (tcpErr) { xLog.status(`[dmeOpenTrace] clone-manager: TCP not ready: ${tcpErr} — tearing down ${containerName} (no leak)`); teardownClone({ containerName, cloneDir }, () => callback(tcpErr, descriptor)); return; }
					waitForCypherReady(containerName, password, 120000, (cypherErr) => {
						if (cypherErr) { xLog.status(`[dmeOpenTrace] clone-manager: cypher not ready: ${cypherErr} — tearing down ${containerName} (no leak)`); teardownClone({ containerName, cloneDir }, () => callback(cypherErr, descriptor)); return; }
						xLog.status(`[clone-manager] ${containerName} query-ready on bolt ${boltPort}`);
						callback('', descriptor);
					});
				});
			});
		});
	});
};

// ---------------------------------------------------------------------------
// Serialize ALL clone provisioning (warm + user) to concurrency 1 so a modest / shared host
// never boots multiple neo4j containers at once (the cause of the production load-13 stampede).
// Each provision waits for the prior one to fully finish (boot + readiness) before starting.
let provisionQueue = Promise.resolve();
const provisionClone = (args, callback) => {
	const cb = typeof callback === 'function' ? callback : () => {};
	provisionQueue = provisionQueue.then(
		() => new Promise((resolve) => {
			provisionCloneImpl(args, (err, descriptor) => {
				try { cb(err, descriptor); } finally { resolve(); }
			});
		}),
	);
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
	countUserCloneContainers,
	describeWarmContainers,
	renameContainer,
	containerExists,
	isContainerRunning,
	getUserGraphsBase,
	MAX_CONCURRENT_CLONES,
	createSnapshot,
	currentSnapshotDir,
	flipPointer,
	findAvailablePortPair,
	waitForNeo4jReady,
};
