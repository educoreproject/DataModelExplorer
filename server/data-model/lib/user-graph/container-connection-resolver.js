'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[UserGraphSeam]]
//
// container-connection-resolver.js — single-source-of-truth connection resolver for the
// unified DME golden graph. Given a docker container NAME, derives the bolt connection
// triple { boltUri, user, password } by shelling `docker inspect`. The container name becomes
// the ONLY connection value that must be maintained by hand; boltUri / user / password are
// derived at runtime from the live container, so they can never drift out of sync.
//
// PURE module: child_process.execFileSync + Node built-ins only — no neo4j-driver, no node_modules
// dependency — so it is requireable identically from the SERVER (clone-manager / user-graph)
// and from the standalone CLI tools, regardless of each subtree's node_modules. Matches the
// docker-inspect style of its sibling clone-manager.js (both by argument array since W-E-12) (getGoldenMounts et al.).
//
// Returns { boltUri, user, password, error }:
//   - error is null on success;
//   - error is a descriptive string when the container is absent / not inspectable, has no
//     published 7687/tcp bolt port, or carries no/malformed NEO4J_AUTH.
// It NEVER silently produces a bad connection. Successful resolutions are memoized by name
// (failures are not, so a later call after the container starts can still succeed).

const { execFileSync } = require('child_process');

// a plain docker container name; anything else is refused BY NAME before docker is called (W-E-12, 2026-10-06)
const CONTAINER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
// where a container's neo4j credential is read from, in its own environment. A golden carries NEO4J_AUTH. A user CLONE
// cannot (passing NEO4J_AUTH would reinitialise the copied system db), so clone-manager launches it with
// DME_CLONE_NEO4J_AUTH, a variable Neo4j ignores (W-E-12, ruling B, VIOLET_VALLEY 2026-10-06). Exactly one must be present.
const CLONE_AUTH_ENV_NAME = 'DME_CLONE_NEO4J_AUTH';
const CONTAINER_AUTH_ENV_NAME_LIST = Object.freeze(['NEO4J_AUTH', CLONE_AUTH_ENV_NAME]);

const connectionCache = {}; // memoize successful resolutions by container name

const errResult = (message) => ({ boltUri: null, user: null, password: null, error: message });

// Optional verbose logging that tolerates a standalone CLI context where process.global is unset.
const logVerbose = (message) => {
	const xLog = process.global && process.global.xLog;
	if (xLog && typeof xLog.verbose === 'function') {
		xLog.verbose(message);
	}
};

// docker inspect with a --format template; returns trimmed stdout, or '' on any docker failure
// (absent container, docker down). Narrow try/catch ONLY to convert execFileSync's throw into a
// returned value — the same boundary-capture the sibling clone-manager.js uses; NOT control flow.
// ARGUMENT ARRAY, no shell (W-E-12): the name and the template reach docker as two arguments, never as shell text.
const dockerInspectFormat = (containerName, formatTemplate) => {
	let out = '';
	try {
		out = execFileSync('docker', ['inspect', containerName, '--format', formatTemplate], {
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
	} catch (e) {
		return '';
	}
	return out.trim();
};

// resolveContainerConnection(containerName) -> { boltUri, user, password, error }
const resolveContainerConnection = (containerName) => {
	if (!containerName) {
		return errResult('resolveContainerConnection: containerName is required');
	}
	if (!CONTAINER_NAME_PATTERN.test(containerName)) {
		return errResult(`resolveContainerConnection: '${containerName}' is not a valid docker container name (${CONTAINER_NAME_PATTERN}); refused before docker is called`);
	}

	if (connectionCache[containerName]) {
		return connectionCache[containerName];
	}

	// --- boltUri: host port mapped to the in-container bolt port 7687/tcp ---
	// Use `inspect` (not `port`) so a STOPPED container still resolves. Dump every published
	// port as "cport=hport;" and pick the 7687 one in JS (mirrors clone-manager.describeWarmContainers).
	const portOut = dockerInspectFormat(
		containerName,
		'{{range $p, $conf := .NetworkSettings.Ports}}{{if $conf}}{{$p}}={{(index $conf 0).HostPort}};{{end}}{{end}}',
	);
	let hostBoltPort = null;
	portOut
		.split(';')
		.filter(Boolean)
		.forEach((kv) => {
			const eqIdx = kv.indexOf('=');
			const cport = kv.slice(0, eqIdx);
			const hport = kv.slice(eqIdx + 1);
			if (cport.startsWith('7687')) {
				hostBoltPort = hport;
			}
		});
	if (!hostBoltPort) {
		return errResult(
			`resolveContainerConnection: container '${containerName}' is absent, not inspectable, or has no published 7687/tcp bolt port`,
		);
	}

	// --- user / password: from NEO4J_AUTH (golden) or DME_CLONE_NEO4J_AUTH (a user clone) in the container's
	// Config.Env (works stopped; no docker exec) ---
	const envOut = dockerInspectFormat(containerName, '{{range .Config.Env}}{{println .}}{{end}}');
	const authLineList = envOut
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => CONTAINER_AUTH_ENV_NAME_LIST.some((oneEnvName) => line.startsWith(`${oneEnvName}=`)));
	if (authLineList.length === 0) {
		return errResult(
			`resolveContainerConnection: container '${containerName}' has none of ${CONTAINER_AUTH_ENV_NAME_LIST.join(', ')} in its environment (a user clone opened before 2026-10-06 carries neither: reopen that graph)`,
		);
	}
	if (authLineList.length > 1) {
		return errResult(
			`resolveContainerConnection: container '${containerName}' carries more than one of ${CONTAINER_AUTH_ENV_NAME_LIST.join(', ')}; which credential is meant is not guessed`,
		);
	}

	// Split on the FIRST '/' only — the neo4j user cannot contain '/', and a password legitimately can.
	const authValue = authLineList[0].slice(authLineList[0].indexOf('=') + 1);
	const slashIdx = authValue.indexOf('/');
	if (slashIdx < 0) {
		return errResult(
			`resolveContainerConnection: NEO4J_AUTH for '${containerName}' is malformed (expected user/password)`,
		);
	}
	const user = authValue.slice(0, slashIdx);
	const password = authValue.slice(slashIdx + 1);

	const result = { boltUri: `bolt://localhost:${hostBoltPort}`, user, password, error: null };
	connectionCache[containerName] = result;
	logVerbose(
		`[container-connection-resolver] resolved '${containerName}' -> ${result.boltUri} (user '${user}')`,
	);
	return result;
};

module.exports = { resolveContainerConnection, CLONE_AUTH_ENV_NAME, CONTAINER_AUTH_ENV_NAME_LIST };
