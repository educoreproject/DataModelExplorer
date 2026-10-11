'use strict';
// container-connection-refusals.test.js — campaign P4a (STANDDOWN-CARDINAL_HORIZON docket 5). The first describeGraph after
// the P3 repoint refused "container … is absent, not inspectable, or has no published 7687/tcp bolt port" although the
// port was published, and ran clean on a retry. Diagnosis (code fact): the resolver turned EVERY docker failure into ''
// and discarded docker's stderr, and it read the port from NetworkSettings.Ports, which is EMPTY while a container is
// stopped or restarting (measured: an exited container shows {} there; its HostConfig.PortBindings keeps the binding). So
// four different conditions — docker failed or timed out, no such container, container not running, no bolt port —
// answered one sentence, and the transient one could not be told from the permanent ones. The cause of the P3 instance
// cannot be recovered now (code estimation: docker under load, or the container mid-restart after the promotion rename).
// Each condition is now REFUSED BY NAME (errorName), docker's own message is quoted, the transient ones carry a retry
// hint, and docker inspect runs ONCE with a timeout instead of twice with none.
//
// HERMETIC half: createContainerConnectionResolver({ runDockerInspect }) with a scripted inspector for each condition.
// LIVE half: the declared golden resolves; a plain absent name answers containerAbsent.
//
//   node server/test/container-connection-refusals.test.js

const resolverModule = require('../data-model/lib/user-graph/container-connection-resolver');
const { readGoldenContainerName } = require('./lib/goldenContainerName');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

console.log('\n=== P4a: container connection failures are refused by name, transient ones with a retry hint ===\n');

const RUNNING_PORTS_JSON = JSON.stringify({ '7474/tcp': [{ HostIp: '0.0.0.0', HostPort: '7816' }], '7687/tcp': [{ HostIp: '0.0.0.0', HostPort: '7815' }] });
const ENV_JSON = JSON.stringify(['PATH=/usr/bin', 'NEO4J_AUTH=neo4j/sec/ret']);
const inspectAnswerFor = (statusText, portsJson, envJson) => ({ exitCode: 0, stdoutText: `${statusText}\n${portsJson}\n${envJson}\n`, stderrText: '' });
const SCRIPTED_CASE_LIST = [
	{ caseName: 'docker timed out', inspectAnswer: { exitCode: null, stdoutText: '', stderrText: '', timedOut: true }, errorName: 'dockerInspectFailed', errorPattern: /timed out.*retry/i },
	{ caseName: 'docker daemon unreachable', inspectAnswer: { exitCode: 1, stdoutText: '', stderrText: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?' }, errorName: 'dockerInspectFailed', errorPattern: /Cannot connect to the Docker daemon.*retry/ },
	{ caseName: 'no such container', inspectAnswer: { exitCode: 1, stdoutText: '', stderrText: 'Error: No such object: x' }, errorName: 'containerAbsent', errorPattern: /no container named 'x'/ },
	{ caseName: 'container exited', inspectAnswer: inspectAnswerFor('exited', '{}', ENV_JSON), errorName: 'containerNotRunning', errorPattern: /is exited.*docker start/ },
	{ caseName: 'container restarting', inspectAnswer: inspectAnswerFor('restarting', '{}', ENV_JSON), errorName: 'containerNotRunning', errorPattern: /is restarting.*retry/ },
	{ caseName: 'running, no bolt port published', inspectAnswer: inspectAnswerFor('running', JSON.stringify({ '7474/tcp': [{ HostPort: '7816' }] }), ENV_JSON), errorName: 'noPublishedBoltPort', errorPattern: /publishes no 7687\/tcp/ },
	{ caseName: 'running, no credential', inspectAnswer: inspectAnswerFor('running', RUNNING_PORTS_JSON, JSON.stringify(['PATH=/usr/bin'])), errorName: 'noCredential', errorPattern: /has none of NEO4J_AUTH/ },
];

if (typeof resolverModule.createContainerConnectionResolver !== 'function') {
	ok('the resolver module exports createContainerConnectionResolver({ runDockerInspect })', false, 'absent');
} else {
	SCRIPTED_CASE_LIST.forEach(({ caseName, inspectAnswer, errorName, errorPattern }) => {
		const scriptedResolver = resolverModule.createContainerConnectionResolver({ runDockerInspect: () => inspectAnswer });
		const answer = scriptedResolver.resolveContainerConnection('x');
		ok(`${caseName}: refused by name '${errorName}'`, answer.errorName === errorName && errorPattern.test(answer.error || ''), JSON.stringify({ errorName: answer.errorName, error: answer.error }));
	});
	let inspectCallCount = 0;
	const healthyResolver = resolverModule.createContainerConnectionResolver({ runDockerInspect: () => { inspectCallCount++; return inspectAnswerFor('running', RUNNING_PORTS_JSON, ENV_JSON); } });
	const healthyAnswer = healthyResolver.resolveContainerConnection('x');
	ok('a running container with a bolt port and NEO4J_AUTH resolves (password split on the first slash), with ONE docker call', healthyAnswer.error === null && healthyAnswer.boltUri === 'bolt://localhost:7815' && healthyAnswer.user === 'neo4j' && healthyAnswer.password === 'sec/ret' && inspectCallCount === 1, JSON.stringify({ ...healthyAnswer, password: healthyAnswer.password ? '(set)' : null, inspectCallCount }));
	let failingCallCount = 0;
	const flakyResolver = resolverModule.createContainerConnectionResolver({ runDockerInspect: () => { failingCallCount++; return failingCallCount === 1 ? SCRIPTED_CASE_LIST[0].inspectAnswer : inspectAnswerFor('running', RUNNING_PORTS_JSON, ENV_JSON); } });
	ok('a transient failure is not memoized: the retry the hint asks for succeeds', flakyResolver.resolveContainerConnection('x').errorName === 'dockerInspectFailed' && flakyResolver.resolveContainerConnection('x').error === null);
}

// LIVE half (read-only: docker inspect only)
const goldenName = readGoldenContainerName();
const goldenAnswer = resolverModule.resolveContainerConnection(goldenName);
ok(`LIVE: the declared golden '${goldenName}' resolves`, goldenAnswer.error === null && /^bolt:\/\/localhost:\d+$/.test(goldenAnswer.boltUri || ''), goldenAnswer.error);
const absentAnswer = resolverModule.resolveContainerConnection('DEV_P4a_noSuchContainer_refusals');
ok('LIVE: a plain absent name is refused as containerAbsent', absentAnswer.errorName === 'containerAbsent', JSON.stringify(absentAnswer));

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
