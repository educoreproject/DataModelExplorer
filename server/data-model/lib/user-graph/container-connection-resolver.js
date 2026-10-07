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
// Returns { boltUri, user, password, error, errorName }:
//   - error and errorName are null on success;
//   - otherwise errorName is one of RESOLVER_ERROR_NAME_LIST and error says what happened, quoting docker, with a retry
//     hint when the condition is transient (campaign P4a).
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

// ⟪campaign P4a, STANDDOWN-CARDINAL_HORIZON docket 5⟫ a failure is REFUSED BY NAME (errorName) and says what docker
// said. Until P4a every docker failure became '' (stderr discarded) and four conditions — docker failed or timed out, no
// such container, container not running, no bolt port — answered one sentence, so a transient refusal (the first
// describeGraph after the P3 repoint) looked like an absent graph. NetworkSettings.Ports is EMPTY while a container is
// stopped or restarting (measured on docker 28.4: an exited container shows {} there), so a not-running container is
// named as such, with its State.Status, rather than reported as having no port. A stopped container still does not
// resolve (it did not before either: the ports were read from the same empty field).
const RESOLVER_ERROR_NAME_LIST = Object.freeze(['containerNameInvalid', 'dockerInspectFailed', 'containerAbsent', 'containerNotRunning', 'noPublishedBoltPort', 'noCredential', 'credentialAmbiguous', 'credentialMalformed']);
const DOCKER_INSPECT_TIMEOUT_MS = 15000;
// ONE inspect: status, published ports and environment, one per line (both JSON documents are single-line)
const INSPECT_FORMAT_TEMPLATE = '{{.State.Status}}\n{{json .NetworkSettings.Ports}}\n{{json .Config.Env}}';
// a container in one of these states will be running shortly: the refusal says retry rather than start it
const TRANSIENT_CONTAINER_STATUS_LIST = Object.freeze(['restarting', 'created']);
const NO_SUCH_CONTAINER_PATTERN = /No such (object|container)/i;

const errResult = (errorName, message) => {
	if (RESOLVER_ERROR_NAME_LIST.indexOf(errorName) === -1) {
		throw new Error(`container-connection-resolver: '${errorName}' is not one of ${RESOLVER_ERROR_NAME_LIST.join(', ')}`);
	}
	return { boltUri: null, user: null, password: null, error: `resolveContainerConnection: ${message}`, errorName };
};

// Optional verbose logging that tolerates a standalone CLI context where process.global is unset.
const logVerbose = (message) => {
	const xLog = process.global && process.global.xLog;
	if (xLog && typeof xLog.verbose === 'function') {
		xLog.verbose(message);
	}
};

// docker inspect -> { exitCode, stdoutText, stderrText, timedOut }. Narrow try/catch ONLY to convert execFileSync's throw
// into a returned value — the boundary capture the sibling clone-manager.js uses; NOT control flow. ARGUMENT ARRAY, no
// shell (W-E-12): the name and the template reach docker as two arguments, never as shell text.
const runDockerInspectProcess = (containerName, formatTemplate) => {
	try {
		const stdoutText = execFileSync('docker', ['inspect', containerName, '--format', formatTemplate], {
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: DOCKER_INSPECT_TIMEOUT_MS,
		});
		return { exitCode: 0, stdoutText, stderrText: '', timedOut: false };
	} catch (inspectError) {
		return {
			exitCode: typeof inspectError.status === 'number' ? inspectError.status : null,
			stdoutText: String(inspectError.stdout || ''),
			stderrText: String(inspectError.stderr || inspectError.message || '').trim(),
			timedOut: inspectError.code === 'ETIMEDOUT' || inspectError.signal === 'SIGTERM',
		};
	}
};

// the JSON line docker printed, or the refusal naming the line that was not JSON (a boundary parse, as above)
const parseInspectJsonLine = (containerName, lineName, lineText) => {
	try {
		return { parsedValue: JSON.parse(lineText) };
	} catch (parseError) {
		return { refusal: errResult('dockerInspectFailed', `docker inspect of '${containerName}' printed ${lineName} that is not JSON (${JSON.stringify(String(lineText).slice(0, 80))}); retry the call — if it repeats, docker's output format changed`) };
	}
};

// createContainerConnectionResolver({ runDockerInspect }) — the resolver over an injected inspector (the test scripts each
// condition); module.exports.resolveContainerConnection is the one over the real docker
const createContainerConnectionResolver = ({ runDockerInspect }) => {
	if (typeof runDockerInspect !== 'function') {
		throw new Error('createContainerConnectionResolver: runDockerInspect(containerName, formatTemplate) is REQUIRED');
	}
	const connectionCache = {}; // memoize successful resolutions by container name; failures are not, so a retry can succeed

	// resolveContainerConnection(containerName) -> { boltUri, user, password, error, errorName }
	const resolveContainerConnection = (containerName) => {
		if (!containerName) {
			return errResult('containerNameInvalid', 'containerName is required');
		}
		if (!CONTAINER_NAME_PATTERN.test(containerName)) {
			return errResult('containerNameInvalid', `'${containerName}' is not a valid docker container name (${CONTAINER_NAME_PATTERN}); refused before docker is called`);
		}
		if (connectionCache[containerName]) {
			return connectionCache[containerName];
		}

		const inspectAnswer = runDockerInspect(containerName, INSPECT_FORMAT_TEMPLATE);
		if (inspectAnswer.exitCode !== 0) {
			if (NO_SUCH_CONTAINER_PATTERN.test(inspectAnswer.stderrText || '')) {
				return errResult('containerAbsent', `there is no container named '${containerName}' (docker: ${inspectAnswer.stderrText})`);
			}
			const dockerText = inspectAnswer.timedOut ? `timed out after ${DOCKER_INSPECT_TIMEOUT_MS} ms` : `exit ${inspectAnswer.exitCode}: ${inspectAnswer.stderrText || 'no message'}`;
			return errResult('dockerInspectFailed', `docker inspect of '${containerName}' failed (${dockerText}). This is usually transient (docker busy or restarting): retry the call`);
		}
		const [statusText, portsJsonText, envJsonText] = String(inspectAnswer.stdoutText).split('\n');
		if (statusText !== 'running') {
			const nextStepText = TRANSIENT_CONTAINER_STATUS_LIST.indexOf(statusText) !== -1 ? 'it should be running shortly: retry the call' : `start it (docker start ${containerName}) and retry`;
			return errResult('containerNotRunning', `container '${containerName}' is ${statusText || 'in an unknown state'}, not running — ${nextStepText}`);
		}
		const portsRead = parseInspectJsonLine(containerName, 'its published ports', portsJsonText);
		if (portsRead.refusal) {
			return portsRead.refusal;
		}
		// --- boltUri: the host port published for the in-container bolt port 7687/tcp ---
		const boltBindingList = Object.keys(portsRead.parsedValue || {}).filter((containerPortText) => containerPortText.startsWith('7687')).map((containerPortText) => portsRead.parsedValue[containerPortText]).find((bindingList) => Array.isArray(bindingList) && bindingList.length > 0);
		if (!boltBindingList) {
			return errResult('noPublishedBoltPort', `container '${containerName}' is running but publishes no 7687/tcp bolt port`);
		}
		const hostBoltPort = boltBindingList[0].HostPort;

		// --- user / password: from NEO4J_AUTH (golden) or DME_CLONE_NEO4J_AUTH (a user clone) in the container's Config.Env ---
		const envRead = parseInspectJsonLine(containerName, 'its environment', envJsonText);
		if (envRead.refusal) {
			return envRead.refusal;
		}
		const authLineList = (envRead.parsedValue || [])
			.map((line) => String(line).trim())
			.filter((line) => CONTAINER_AUTH_ENV_NAME_LIST.some((oneEnvName) => line.startsWith(`${oneEnvName}=`)));
		if (authLineList.length === 0) {
			return errResult('noCredential', `container '${containerName}' has none of ${CONTAINER_AUTH_ENV_NAME_LIST.join(', ')} in its environment (a user clone opened before 2026-10-06 carries neither: reopen that graph)`);
		}
		if (authLineList.length > 1) {
			return errResult('credentialAmbiguous', `container '${containerName}' carries more than one of ${CONTAINER_AUTH_ENV_NAME_LIST.join(', ')}; which credential is meant is not guessed`);
		}

		// Split on the FIRST '/' only — the neo4j user cannot contain '/', and a password legitimately can.
		const authText = authLineList[0].slice(authLineList[0].indexOf('=') + 1);
		const slashIdx = authText.indexOf('/');
		if (slashIdx < 0) {
			return errResult('credentialMalformed', `NEO4J_AUTH for '${containerName}' is malformed (expected user/password)`);
		}
		const user = authText.slice(0, slashIdx);
		const password = authText.slice(slashIdx + 1);

		const result = { boltUri: `bolt://localhost:${hostBoltPort}`, user, password, error: null, errorName: null };
		connectionCache[containerName] = result;
		logVerbose(`[container-connection-resolver] resolved '${containerName}' -> ${result.boltUri} (user '${user}')`);
		return result;
	};
	return { resolveContainerConnection };
};

const { resolveContainerConnection } = createContainerConnectionResolver({ runDockerInspect: runDockerInspectProcess });

module.exports = { resolveContainerConnection, createContainerConnectionResolver, RESOLVER_ERROR_NAME_LIST, CLONE_AUTH_ENV_NAME, CONTAINER_AUTH_ENV_NAME_LIST };
