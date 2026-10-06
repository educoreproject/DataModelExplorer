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
const { execFileSync, execFile, spawnSync } = require('child_process');

// W-E-12 (X4 mechanics, campaign P0, 2026-10-06): docker and cp are invoked with ARGUMENT ARRAYS (execFile /
// execFileSync), never a shell string, and every container name is checked against DOCKER_CONTAINER_NAME_PATTERN before
// it reaches docker. Until 2026-10-06 names, paths and the golden password were interpolated into shell strings.
const DOCKER_CONTAINER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const dockerSafeContainerName = (containerName) => {
	if (typeof containerName !== 'string' || !DOCKER_CONTAINER_NAME_PATTERN.test(containerName)) {
		throw new Error(`clone-manager: '${containerName}' is not a valid docker container name (${DOCKER_CONTAINER_NAME_PATTERN}); refused before docker is called`);
	}
	return containerName;
};
const DOCKER_QUIET_OPTIONS = Object.freeze({ encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
const { CLONE_AUTH_ENV_NAME } = require('./container-connection-resolver');

const MAX_CONCURRENT_CLONES = 3; // resource hygiene (ONYX / plan §0.12)
const NEO4J_IMAGE = 'neo4j:5-community';

// The golden container NAME is the SINGLE SOURCE OF TRUTH (config key goldenContainerName in
// dataModelExplorerSearch.ini). Everything else about golden's connection — boltUri, user,
// password, host bolt port — is DERIVED from it at runtime by container-connection-resolver;
// nothing is hardcoded here. Read at CALL time (not require time) because process.global is
// not populated when this module first loads.
const getGoldenContainerName = () => {
	const { getConfig } = process.global;
	const cfg = getConfig('dataModelExplorerSearch') || {};
	return cfg.goldenContainerName;
};

// Golden's host bolt port, DERIVED from the container name (no hardcoded port). Returns null
// when the container cannot be inspected.
const getGoldenBoltPort = () => {
	const { resolveContainerConnection } = require('./container-connection-resolver');
	const { boltUri } = resolveContainerConnection(getGoldenContainerName());
	return boltUri ? parseInt(boltUri.split(':').pop(), 10) : null;
};

// ---------------------------------------------------------------------------
// Golden discovery — authoritative, from the live container's mounts (no hardcoded paths)

// spawnSync, NOT execSync: this is reached from inside a promise executor, where a thrown
// exception becomes an unhandled rejection and Node kills the whole API server. A golden
// container that is missing, renamed, or reaped is an ORDINARY runtime condition — TQ flips
// the golden weekly and scratch-graph cleanup reaps containers — so it must come back as
// data. Every caller already guards on a falsy dataDir. Returns {} when golden cannot be
// inspected for any reason.
//
// Each mount is reported as { type, source, name } because the COPY needs the mount's docker
// IDENTITY, not a host path: a named volume's Source lives inside the Docker VM and does not
// exist on the host at all (on macOS there is no /var/lib/docker whatsoever).
const getGoldenMounts = () => {
	const golden = getGoldenContainerName();
	if (!golden) return {};
	const res = spawnSync(
		'docker',
		['inspect', golden, '--format',
			'{{range .Mounts}}{{.Destination}}|{{.Type}}|{{.Source}}|{{.Name}}\n{{end}}'],
		{ encoding: 'utf-8' },
	);
	if (res.error || res.status !== 0) return {};
	const map = {};
	(res.stdout || '').split('\n').filter(Boolean).forEach((line) => {
		const [destination, type, source, name] = line.split('|');
		map[destination] = { type, source, name };
	});
	const data = map['/data'];
	const plugins = map['/plugins'];
	return {
		dataDir: data ? data.source : undefined,
		pluginsDir: plugins ? plugins.source : undefined,
		dataMount: data,
		pluginsMount: plugins,
	};
};

// The docker reference for a mount, suitable as the SOURCE half of a `docker run -v src:dst`.
// A named volume is referenced by NAME (its Source path is meaningless outside the Docker VM);
// a bind mount is referenced by its host path. Returns null when neither is available.
const mountDockerRef = (mount) => {
	if (!mount) return null;
	if (mount.type === 'volume') return mount.name || null;
	return mount.source || null;
};

// Where snapshots, warm spares and per-user clones live ON THE HOST. This is DECLARED, not
// derived. It used to be reverse-engineered out of golden's own mount source by splitting on
// '/dataStores/' — which silently produced a path INSIDE the golden volume the moment golden
// became a named volume, because String.split returns the whole string when the separator is
// absent. Returns null when unconfigured; callers refuse by name rather than guessing.
const getUserGraphsBase = () => {
	const { getConfig } = process.global;
	const cfg = getConfig('dataModelExplorerSearch') || {};
	const configured = cfg.userGraphsDirPath;
	if (!configured) return null;
	// An UNSUBSTITUTED token means the config was loaded without a projectRoot, which yields a
	// confident-looking wrong path rather than an error. Observed while building this: loading
	// the ini through a bare qtools-config-file-processor resolved <!projectRoot!> against the
	// LIBRARY's own directory. Refuse rather than mkdir somewhere arbitrary.
	if (configured.indexOf('<!') !== -1) return null;
	if (!path.isAbsolute(configured)) return null;
	return configured;
};

// ---------------------------------------------------------------------------
// Golden snapshot-source + atomic pointer (08). Clones copy from the CURRENT snapshot
// (a quiesced copy of golden that is never served) rather than quiescing the live
// golden on every open. Golden refresh = make a new snapshot + flip the pointer
// atomically; in-flight sessions are undisturbed, the next open lands on new golden.

const snapshotsBase = () => {
	const base = getUserGraphsBase();
	return base ? path.join(base, '_snapshots') : null;
};
const pointerPath = () => {
	const base = getUserGraphsBase();
	return base ? path.join(base, '_currentSnapshot') : null;
};

// Every snapshot records the golden it was cut from. Without this, flipping the golden and
// restarting left the pointer aimed at a snapshot of the PREVIOUS graph, and every new user
// graph was silently built from it — the restart did not mean what it appeared to mean.
const stampPath = (snapDir) => path.join(snapDir, 'source.json');

const readSnapshotStamp = (snapDir) => {
	try {
		return JSON.parse(fs.readFileSync(stampPath(snapDir), 'utf8'));
	} catch (e) { return null; }
};

// Returns the current snapshot dir ONLY when it is complete AND was cut from the golden that
// is configured right now. A stale or unstamped snapshot reads as "no snapshot", which makes
// the next open rebuild it from current golden.
const currentSnapshotDir = () => {
	try {
		const pointer = pointerPath();
		if (!pointer) return null;
		const name = fs.readFileSync(pointer, 'utf8').trim();
		if (!name) return null;
		const dir = path.join(snapshotsBase(), name);
		if (!fs.existsSync(path.join(dir, 'data', 'databases'))) return null;
		const stamp = readSnapshotStamp(dir);
		if (!stamp || stamp.goldenContainerName !== getGoldenContainerName()) return null;
		return dir;
	} catch (e) { return null; }
};

const flipPointer = (snapName) => {
	const tmp = pointerPath() + '.tmp';
	fs.writeFileSync(tmp, snapName);
	fs.renameSync(tmp, pointerPath()); // atomic on POSIX
};

// Copy one docker mount's contents into a host directory FROM INSIDE A CONTAINER. The old
// host-side `cp -R "${mount.source}/." dst/` only worked when golden was bind-mounted from a
// host directory: a named volume's source is unreachable on macOS (no /var/lib/docker on the
// host) and, on Linux, the derived destination landed inside the source so cp refused to copy
// a directory into itself. Mounting both ends into a throwaway container works identically on
// both platforms and for both mount types. NEO4J_IMAGE is reused deliberately — it is already
// present on any machine that has ever run a graph, so this never pulls.
const copyMountToHostDir = (mount, hostDir, timeoutMs, callback) => {
	const srcRef = mountDockerRef(mount);
	if (!srcRef) { callback(`copyMountToHostDir: golden mount has no usable docker reference`); return; }
	const args = [
		'run', '--rm',
		'-v', `${srcRef}:/qtSrc:ro`,
		'-v', `${hostDir}:/qtDst`,
		'--entrypoint', 'sh',
		NEO4J_IMAGE,
		'-c', 'cp -a /qtSrc/. /qtDst/',
	];
	const child = spawnSync('docker', args, { encoding: 'utf-8', timeout: timeoutMs });
	if (child.error) { callback(`copyMountToHostDir: ${child.error.message}`); return; }
	if (child.status !== 0) {
		callback(`copyMountToHostDir: docker exited ${child.status}: ${(child.stderr || '').trim()}`);
		return;
	}
	callback('');
};

// createSnapshot — quiesce golden ONCE, copy its data/+plugins into a new snapshot dir,
// flip the pointer atomically, restart golden. callback(err, { snapName, snapshotDir })
const createSnapshot = (callback) => {
	const { xLog } = process.global;
	const golden = getGoldenContainerName();
	if (!golden) {
		callback('createSnapshot: no goldenContainerName configured in [dataModelExplorerSearch]');
		return;
	}
	const base = snapshotsBase();
	if (!base) {
		callback('createSnapshot: userGraphsDirPath is not configured in [dataModelExplorerSearch]');
		return;
	}
	const { dataMount, pluginsMount } = getGoldenMounts();
	if (!dataMount) {
		callback(`createSnapshot: golden container '${golden}' could not be inspected — is it running?`);
		return;
	}
	const snapName = `snap-${process.pid}-${process.hrtime.bigint().toString()}`;
	const snapDir = path.join(base, snapName);
	['data', 'plugins'].forEach((sub) => fs.mkdirSync(path.join(snapDir, sub), { recursive: true }));

	// The copy runs inside a container, so it is indifferent to whether golden is a named
	// volume or a bind mount and works the same on macOS and Linux. spawnSync makes it
	// synchronous, which is what withQuiescedGolden's copyFn contract expects; the error is
	// carried out in a closure rather than thrown, so golden is still restarted either way.
	let copyErr = '';
	const copyFn = () => {
		copyMountToHostDir(dataMount, path.join(snapDir, 'data'), 180000, (dataErr) => {
			copyErr = dataErr;
		});
		if (copyErr || !pluginsMount) return;
		copyMountToHostDir(pluginsMount, path.join(snapDir, 'plugins'), 60000, (pluginsErr) => {
			copyErr = pluginsErr;
		});
	};

	withQuiescedGolden(copyFn, (err) => {
		const failure = err || copyErr;
		if (failure) {
			try { fs.rmSync(snapDir, { recursive: true, force: true }); } catch (e) {}
			callback(failure);
			return;
		}
		// Stamp BEFORE flipping the pointer: an unstamped snapshot reads as absent, so a crash
		// between the two leaves the pointer aimed at something currentSnapshotDir rejects
		// rather than at an anonymous copy of an unknown graph.
		fs.writeFileSync(
			stampPath(snapDir),
			JSON.stringify({ goldenContainerName: golden, createdAt: new Date().toISOString() }, null, 2),
		);
		flipPointer(snapName);
		if (xLog) xLog.status(`[clone-manager] snapshot ${snapName} created from golden '${golden}' + pointer flipped`);
		callback('', { snapName, snapshotDir: snapDir });
	});
};

// Returns null when userGraphsDirPath is unconfigured — callers refuse by name. path.join
// would throw on a null base, and this is reached from inside a promise executor.
const cloneDirFor = (userRefId, versionRefId) => {
	const base = getUserGraphsBase();
	if (!base) return null;
	return path.join(base, `uid-${userRefId}`, `ver-${versionRefId || 'new'}`);
};

const containerNameFor = (userRefId, versionRefId) =>
	`usr_${userRefId}_${versionRefId || 'new'}`.replace(/[^A-Za-z0-9_.-]/g, '_');

// Golden's password, DERIVED from the container name via the resolver (NEO4J_AUTH in the
// container env) — no longer read from a redundant config field. Returns null on failure;
// callers already guard on a falsy password.
const getGoldenPassword = () => {
	const { resolveContainerConnection } = require('./container-connection-resolver');
	const { password } = resolveContainerConnection(getGoldenContainerName());
	return password;
};

// ---------------------------------------------------------------------------
// Docker + port helpers (mirrors cli/.../containerManager.js)

const isContainerRunning = (name) => {
	try {
		return (
			execFileSync('docker', ['inspect', '--format', '{{.State.Running}}', dockerSafeContainerName(name)], DOCKER_QUIET_OPTIONS).trim() === 'true'
		);
	} catch (e) {
		return false;
	}
};

const containerExists = (name) => {
	try {
		execFileSync('docker', ['inspect', dockerSafeContainerName(name)], DOCKER_QUIET_OPTIONS);
		return true;
	} catch (e) {
		return false;
	}
};

const countCloneContainers = () => {
	try {
		const out = execFileSync('docker', ['ps', '-a', '--filter', 'name=usr_', '--format', '{{.Names}}'], DOCKER_QUIET_OPTIONS).trim();
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
		const out = execFileSync('docker', ['ps', '-a', '--filter', 'name=usr_', '--format', '{{.Names}}'], DOCKER_QUIET_OPTIONS).trim();
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
	execFileSync('docker', ['rename', dockerSafeContainerName(oldName), dockerSafeContainerName(newName)], DOCKER_QUIET_OPTIONS);
};

// describeWarmContainers — reconstruct descriptors for every RUNNING idle warm spare
// (usr__warm_*) from docker, so the warm pool can be ADOPTED across server restarts (the
// in-memory pool is empty on boot but the containers survive). Safe because a claimed spare
// is renamed away from usr__warm_*, so this only ever sees genuine idle spares.
const describeWarmContainers = () => {
	let names = [];
	try {
		const out = execFileSync('docker', ['ps', '--filter', 'name=usr__warm_', '--format', '{{.Names}}'], DOCKER_QUIET_OPTIONS).trim();
		names = out ? out.split('\n').filter(Boolean) : [];
	} catch (e) {
		return [];
	}
	const password = getGoldenPassword();
	const descriptors = [];
	names.forEach((name) => {
		try {
			const portOut = execFileSync(
				'docker',
				['inspect', dockerSafeContainerName(name), '--format', '{{range $p, $conf := .NetworkSettings.Ports}}{{if $conf}}{{$p}}={{(index $conf 0).HostPort}};{{end}}{{end}}'],
				DOCKER_QUIET_OPTIONS,
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
			const mountOut = execFileSync(
				'docker',
				['inspect', dockerSafeContainerName(name), '--format', '{{range .Mounts}}{{.Destination}}={{.Source}}\n{{end}}'],
				DOCKER_QUIET_OPTIONS,
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
				// Fast TCP probe on the published bolt port (milliseconds, no JVM) — far less
				// flaky than `docker exec cypher-shell` (which has ~4s JVM startup and timed out
				// under restart load, wrongly reaping healthy spares). Port open == neo4j alive.
				// W-E-12 (ruling B): a spare launched before 2026-10-06 carries no DME_CLONE_NEO4J_AUTH, so once claimed
				// no reader could reach it; it is torn down here rather than adopted and handed to a user
				const { resolveContainerConnection } = require('./container-connection-resolver');
				const carriesCloneCredential = !resolveContainerConnection(name).error;
				let ready = false;
				try {
					execFileSync('bash', ['-c', `exec 3<>/dev/tcp/127.0.0.1/${Number(boltPort)}`], { timeout: 4000, stdio: 'ignore' });
					ready = true;
				} catch (rdyErr) { ready = false; }
				if (ready && carriesCloneCredential) {
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
					if (process.global.xLog) process.global.xLog.status(`[dmeOpenTrace] clone-manager: orphan warm spare ${name} ${carriesCloneCredential ? 'not query-ready' : 'carries no DME_CLONE_NEO4J_AUTH (launched before W-E-12)'} — tearing it down (not adopting)`);
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
		const output = execFileSync('docker', ['ps', '--format', '{{.Ports}}'], DOCKER_QUIET_OPTIONS);
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
		execFile(
			'docker',
			['exec', dockerSafeContainerName(containerName), 'cypher-shell', '-u', 'neo4j', '-p', password, 'RETURN 1 AS x'],
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
	const golden = getGoldenContainerName();
	const wasRunning = isContainerRunning(golden);

	const restartGolden = (originalErr, doneCb) => {
		if (!wasRunning) { doneCb(originalErr); return; }
		try {
			execFileSync('docker', ['start', dockerSafeContainerName(golden)], DOCKER_QUIET_OPTIONS);
		} catch (e) {
			doneCb(originalErr || `golden restart failed: ${e.message}`);
			return;
		}
		// Golden's host bolt port is DERIVED from its container name (not hardcoded) so the
		// readiness wait always targets the real golden, never a stale/other container.
		const goldenBoltPort = getGoldenBoltPort();
		if (!goldenBoltPort) { doneCb(originalErr || `could not resolve golden bolt port for '${golden}'`); return; }
		waitForNeo4jReady(goldenBoltPort, 90000, (readyErr) => {
			doneCb(originalErr || readyErr || '');
		});
	};

	if (wasRunning) {
		try {
			xLog.status(`[clone-manager] quiescing golden (${golden})`);
			execFileSync('docker', ['stop', dockerSafeContainerName(golden)], DOCKER_QUIET_OPTIONS);
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

	const provisionStartTs = Date.now(); // timed end-to-end; logged on query-ready

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

	// Refuse BY NAME. A golden that has been reaped, renamed, or never existed is an ordinary
	// condition here, and the operator's next move is to edit one line of _goldenContainer.ini
	// — so the message says which container and which file.
	const { dataMount } = getGoldenMounts();
	if (!dataMount) {
		callback(`provisionClone: golden container '${getGoldenContainerName()}' could not be inspected — check goldenContainerName in _goldenContainer.ini`);
		return;
	}

	const containerName = containerNameFor(userRefId, versionRefId);
	const cloneDir = cloneDirFor(userRefId, versionRefId);
	if (!cloneDir) {
		callback('provisionClone: userGraphsDirPath is not configured in [dataModelExplorerSearch]');
		return;
	}
	const password = getGoldenPassword();
	if (!password) { callback('provisionClone: golden password unavailable from config'); return; }

	// Defensive clean slate: a stale container/dir for this user+version must not linger.
	if (containerExists(containerName)) {
		try { execFileSync('docker', ['rm', '-f', dockerSafeContainerName(containerName)], DOCKER_QUIET_OPTIONS); } catch (e) {}
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
	// ASYNC copy (child process) — the ~GB cp must NOT block the Node event loop. The old
	// execSync (a synchronous copy) froze the whole server during a copy, so a user's own open (its marker-inject
	// query needs the loop) stalled behind a warm-spare refill's copy. callback(err).
	const copyFromSnapshot = (snapDir, done) => {
		const sData = path.join(snapDir, 'data');
		const sPlugins = path.join(snapDir, 'plugins');
		execFile('cp', ['-R', `${sData}/.`, `${path.join(cloneDir, 'data')}/`], { timeout: 180000 }, (e1) => {
			if (e1) { done(`clone copy failed: ${e1.message}`); return; }
			if (sPlugins && fs.existsSync(sPlugins)) {
				execFile('cp', ['-R', `${sPlugins}/.`, `${path.join(cloneDir, 'plugins')}/`], { timeout: 60000 }, (e2) => {
					done(e2 ? `clone plugins copy failed: ${e2.message}` : '');
				});
			} else { done(''); }
		});
	};

	const ensureSnapshotThenCopy = (cb) => {
		const existing = currentSnapshotDir();
		if (existing) {
			xLog.status(`[dmeOpenTrace] clone-manager: provisioning ${containerName} from EXISTING snapshot (no golden quiesce)`);
			copyFromSnapshot(existing, cb);
			return;
		}
		xLog.status(`[dmeOpenTrace] clone-manager: NO snapshot yet — creating one (one-time golden quiesce) before provisioning ${containerName}`);
		createSnapshot((snapErr, res) => {
			if (snapErr) { cb(`snapshot create failed: ${snapErr}`); return; }
			copyFromSnapshot(res.snapshotDir, cb);
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
			// DME_CLONE_NEO4J_AUTH (W-E-12, ruling B, VIOLET_VALLEY 2026-10-06): the clone's credential travels WITH the
			// clone, in a variable Neo4j ignores, so container-connection-resolver derives it from the clone's own name
			// exactly as it derives golden's from NEO4J_AUTH. The graph_state_versions row no longer stores it.
			const dockerRunArgumentList = [
				'run', '-d', '--name', dockerSafeContainerName(containerName),
				'-p', `${Number(boltPort)}:7687`, '-p', `${Number(httpPort)}:7474`,
				'-e', 'NEO4J_PLUGINS=["apoc"]',
				'-e', 'NEO4J_dbms_security_procedures_unrestricted=apoc.*',
				'-e', 'NEO4J_dbms_security_procedures_allowlist=apoc.*',
				'-e', `${CLONE_AUTH_ENV_NAME}=neo4j/${password}`,
				'-v', `${cloneDir}/data:/data`, '-v', `${cloneDir}/logs:/logs`,
				'-v', `${cloneDir}/plugins:/plugins`, '-v', `${cloneDir}/import:/var/lib/neo4j/import`,
				NEO4J_IMAGE,
			];

			execFile('docker', dockerRunArgumentList, (runErr, stdout, stderr) => {
				if (runErr) {
					try { execFileSync('docker', ['rm', '-f', dockerSafeContainerName(containerName)], DOCKER_QUIET_OPTIONS); } catch (e) {}
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
						xLog.status(`[clone-manager] ${containerName} query-ready on bolt ${boltPort} — provisioned in ${((Date.now() - provisionStartTs) / 1000).toFixed(1)}s`);
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
	// BACKSTOP. A synchronous throw inside the executor above is captured as a REJECTION, not
	// propagated to the caller — so cb never fires, the HTTP request hangs, and Node kills the
	// process on the unhandled rejection. That is exactly how a reaped golden container took
	// the whole API server down. Nothing should throw here any more, but one user action must
	// never again be able to end the process for everyone.
	).catch((e) => {
		const { xLog } = process.global;
		if (xLog) xLog.error(`[clone-manager] provision queue absorbed an unexpected throw: ${e && e.message}`);
		cb(`provisionClone failed unexpectedly: ${e && e.message}`);
	});
};

// ---------------------------------------------------------------------------
// teardownClone — stop+remove the container and delete the clone dir. callback(err, info)

const teardownClone = ({ containerName, cloneDir }, callback) => {
	const { xLog } = process.global;
	const cb = typeof callback === 'function' ? callback : () => {};

	if (containerName && containerExists(containerName)) {
		try { execFileSync('docker', ['rm', '-f', dockerSafeContainerName(containerName)], DOCKER_QUIET_OPTIONS); } catch (e) {
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
	getGoldenMounts,
	MAX_CONCURRENT_CLONES,
	createSnapshot,
	currentSnapshotDir,
	flipPointer,
	findAvailablePortPair,
	waitForNeo4jReady,
};
