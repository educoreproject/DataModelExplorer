'use strict';
const { readGoldenContainerName } = require('./lib/goldenContainerName');

// golden-graph-handle-live.test.js — the golden handle over the real resolver, the real driver and the declared golden: the
// hardening of read-seam-hardening.test.js, proved THROUGH the handle.
//   1. a write through runQuery is refused by Neo4j itself (READ session)
//   2. a heavy query dies at the handle's queryTimeoutMs
//   3. runTransaction refuses by name; nothing reaches the graph
//   4. a Cypher fault passes through as itself, and the handle stays connected
//   5. a failed connection attempt closes its driver (a handle retrying for days must not leave one behind each time)
//
//   node server/test/golden-graph-handle-live.test.js   (needs Docker and the golden up; GOLDEN_CONTAINER overrides the name)

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const neo4jDriverModule = require('neo4j-driver');
const { resolveContainerConnectionFresh } = require('../data-model/lib/user-graph/container-connection-resolver');
const { createGoldenGraphHandle } = require('../data-model/lib/neo4j-instance/golden-graph-handle');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const finish = () => {
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed ? 1 : 0);
};

const GOLDEN_CONTAINER = readGoldenContainerName();
const HEAVY_QUERY_TIMEOUT_MS = 2000;
const NO_SUCH_PASSWORD_TEXT = 'noSuchPassword';
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });

console.log(`\n=== the golden handle's seam, live (golden: ${GOLDEN_CONTAINER}) ===\n`);

const handle = createGoldenGraphHandle({ goldenContainerName: GOLDEN_CONTAINER, queryTimeoutMs: HEAVY_QUERY_TIMEOUT_MS, retryDelayMsList: [200], resolveConnectionFresh: resolveContainerConnectionFresh, neo4jGen });

const waitForConnection = (callback) => {
	const startedAt = Date.now();
	const tick = () => {
		if (handle.graphStateOf().graphState === 'connected' || Date.now() - startedAt > 30000) { callback(); return; }
		setTimeout(tick, 100);
	};
	tick();
};

const stepList = [
	(next) => handle.runQuery('RETURN 1 AS ping', {}, (queryError, rowList) => {
		ok('the handle reads the golden', !queryError && rowList[0].ping === 1, queryError);
		next();
	}),
	(next) => handle.runQuery("CREATE (n:GraphStartupRetryProbe {name: 'must never exist'}) RETURN n", {}, (writeError) => {
		ok('a write through the handle is refused by Neo4j (READ session)', /write|read/i.test(String(writeError)) && /access|mode|not allowed|forbidden/i.test(String(writeError)), writeError);
		ok('a refused write leaves the handle connected', handle.graphStateOf().graphState === 'connected');
		next();
	}),
	(next) => handle.runQuery('MATCH (n:GraphStartupRetryProbe) RETURN count(n) AS probeCount', {}, (countError, rowList) => {
		ok('and nothing was written', !countError && rowList[0].probeCount === 0, countError);
		next();
	}),
	(next) => {
		let isUserFunctionRun = false;
		handle.runTransaction(() => { isUserFunctionRun = true; }, (transactionError) => {
			ok('runTransaction refuses by name', /^runTransaction: .*read-only/.test(String(transactionError)), transactionError);
			ok('the caller\'s function never ran', !isUserFunctionRun);
			next();
		});
	},
	(next) => {
		const startedAt = Date.now();
		handle.runQuery('MATCH (a), (b) WHERE a.name < b.name RETURN count(*) AS pairCount', {}, (heavyError) => {
			const elapsedMs = Date.now() - startedAt;
			ok('a heavy query dies at queryTimeoutMs', /timeout|terminated/i.test(String(heavyError)) && elapsedMs < 20000, `${elapsedMs} ms: ${heavyError}`);
			ok('the timeout leaves the handle connected (the ping answered)', handle.graphStateOf().graphState === 'connected');
			next();
		});
	},
	(next) => handle.runQuery('THIS IS NOT CYPHER', {}, (cypherError) => {
		ok('a Cypher fault passes through as itself', /syntax|invalid input/i.test(String(cypherError)) && !/goldenGraphNotReady/.test(String(cypherError)), cypherError);
		ok('and leaves the handle connected', handle.graphStateOf().graphState === 'connected');
		next();
	}),
	(next) => {
		const originalDriver = neo4jDriverModule.driver;
		let driverCloseCount = 0;
		neo4jDriverModule.driver = (...driverArgumentList) => {
			const realDriver = originalDriver(...driverArgumentList);
			const originalClose = realDriver.close.bind(realDriver);
			realDriver.close = () => { driverCloseCount += 1; return originalClose(); };
			return realDriver;
		};
		// a port nothing listens on
		neo4jGen.initDatabaseInstance({ neo4jBoltUri: 'bolt://localhost:1', neo4jUser: 'neo4j', neo4jPassword: NO_SUCH_PASSWORD_TEXT, readOnly: true, queryTimeoutMs: 2000, isVerificationQuiet: true }, (openError) => {
			neo4jDriverModule.driver = originalDriver;
			ok('a failed attempt reports its fault', /Connection test failed/.test(String(openError)), openError);
			ok('and closes its driver', driverCloseCount === 1, `closed ${driverCloseCount}`);
			next();
		});
	},
];

const runStep = (stepPosition) => {
	if (stepPosition >= stepList.length) {
		handle.close();
		finish();
		return;
	}
	stepList[stepPosition](() => runStep(stepPosition + 1));
};

waitForConnection(() => {
	const { graphState } = handle.graphStateOf();
	ok('the handle connects to the live golden', graphState === 'connected', graphState);
	if (graphState !== 'connected') {
		finish();
		return;
	}
	runStep(0);
});
