'use strict';
// G2.4's stub half: the eleventh session of one sub is refused by name, an idle session goes after the TTL, its client sees the 404 mcp-unknown-session-404.test.js expects and can start
// again, and an instance lacking the limits refuses by name. G2.2's stub half: anonymous and a revoked grant are 401. The real server module and the real bearer gate; the verifier and store are stubs.
//
// Run: node server/test/mcp-session-limits.test.js

const assert = require('assert');
const { createMcpSessionKeeper } = require('../lib/mcp-server/mcpSessionKeeper');
const { mountMcpForTest, postRpc, deleteSession, initializeSession } = require('./lib/mcpTestHarness');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

let passCount = 0;
let failCount = 0;
const ok = (checkName, isPassing, detailText) => {
	passCount += isPassing ? 1 : 0;
	failCount += isPassing ? 0 : 1;
	console.log(`  ${isPassing ? 'PASS' : 'FAIL'}: ${checkName}${!isPassing && detailText ? ` — ${detailText}` : ''}`);
};

// ---- the keeper alone, on an injected clock
let clockMs = 1000000;
const closedSessionList = [];
const sessionKeeper = createMcpSessionKeeper({ sessionCapPerSub: 2, sessionIdleTtlMilliseconds: 1000, nowMs: () => clockMs, closeSessionByRefId: (sessionRefId) => closedSessionList.push(sessionRefId) });
const firstHold = sessionKeeper.reserveSession('userOne');
const secondHold = sessionKeeper.reserveSession('userOne');
ok('keeper: reservations count before any session opens', firstHold.isAdmitted && secondHold.isAdmitted && !sessionKeeper.reserveSession('userOne').isAdmitted);
ok('keeper: another subject has its own count', sessionKeeper.reserveSession('userTwo').isAdmitted);
secondHold.release();
secondHold.release();
const thirdHold = sessionKeeper.reserveSession('userOne');
ok('keeper: a released reservation frees its place, once', thirdHold.isAdmitted && !sessionKeeper.reserveSession('userOne').isAdmitted);
firstHold.sessionOpened('sessionOne');
firstHold.release();
thirdHold.sessionOpened('sessionTwo');
ok('keeper: an opened session keeps its place after release', sessionKeeper.openSessionCountFor('userOne') === 2 && !sessionKeeper.reserveSession('userOne').isAdmitted);
clockMs += 400;
ok('keeper: a refusal says when one goes', sessionKeeper.reserveSession('userOne').retryAfterSeconds === 1);
sessionKeeper.touchSession('sessionTwo');
clockMs += 600;
sessionKeeper.sweepIdleSessions();
ok('keeper: the sweep closes the idle one and leaves the used one', closedSessionList.join() === 'sessionOne' && sessionKeeper.openSessionCountFor('userOne') === 1);
sessionKeeper.sessionClosed('sessionTwo');
ok('keeper: a closed session frees its place', sessionKeeper.openSessionCountFor('userOne') === 0);
for (let loopbackIndex = 0; loopbackIndex < 5; loopbackIndex += 1) {
	sessionKeeper.reserveSession('').sessionOpened(`loopback${loopbackIndex}`);
}
ok('keeper: the loopback path has no sub and no cap', sessionKeeper.reserveSession('').isAdmitted);
clockMs += 1000;
sessionKeeper.sweepIdleSessions();
ok('keeper: the loopback path still goes when idle', sessionKeeper.openSessionCountFor('') === 0);
assert.throws(() => createMcpSessionKeeper({ sessionCapPerSub: 0, sessionIdleTtlMilliseconds: 1000, nowMs: () => 0, closeSessionByRefId: () => {} }), /sessionCapPerSub/);
assert.throws(() => createMcpSessionKeeper({ sessionCapPerSub: 1, sessionIdleTtlMilliseconds: undefined, nowMs: () => 0, closeSessionByRefId: () => {} }), /sessionIdleTtlMilliseconds/);
ok('keeper: a limit that is no positive integer throws by name', true);

// ---- through the real module
const accessPointsDotD = { 'dme-cypher-query': (queryData, done) => done('', [{ ok: true }]) };
const IDLE_TTL_SECONDS = 2;

const initializeMany = (port, bearerToken, sessionCount, done) => {
	const resultList = [];
	for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
		initializeSession({ port, bearerToken }, (initError, initResult) => {
			resultList.push(initError ? { status: 0, rpcMessage: { error: initError } } : initResult);
			if (resultList.length === sessionCount) {
				done('', resultList);
			}
		});
	}
};

const taskList = new taskListPlus();
taskList.push((args, next) => mountMcpForTest({ mcpConfigValues: { sessionCapPerSub: 10, sessionIdleTtlSeconds: IDLE_TTL_SECONDS }, accessPointsDotD }, (mountError, harness) => next(mountError, { ...args, harness })));
// together, so the check-then-register gap would show
taskList.push((args, next) => initializeMany(args.harness.port, 'userA:grantA', 14, (manyError, resultList) => {
	const admittedList = resultList.filter((oneResult) => oneResult.status === 200);
	const refusedList = resultList.filter((oneResult) => oneResult.status === 429);
	ok('G2.4: fourteen at once, ten admitted', admittedList.length === 10, `${admittedList.length}`);
	ok('G2.4: the rest are 429', refusedList.length === 4, JSON.stringify(resultList.map((oneResult) => oneResult.status)));
	const refusal = refusedList[0].rpcMessage.error;
	ok('G2.4: refused by name', refusal.data.refusalName === 'sessionCapReached' && /^sessionCapReached: /.test(refusal.message), JSON.stringify(refusal));
	ok('G2.4: says when to retry', Number(refusedList[0].headers['retry-after']) >= 1 && refusal.data.retryAfterSeconds >= 1);
	next(manyError, { ...args, admittedList });
}));
taskList.push((args, next) => initializeSession({ port: args.harness.port, bearerToken: 'userB:grantB' }, (initError, initResult) => {
	ok('G2.4: another sub is not held by the first', initResult.status === 200);
	next(initError, { ...args, otherSessionRefId: initResult.sessionRefId });
}));
taskList.push((args, next) => deleteSession({ port: args.harness.port, sessionRefId: args.admittedList[0].sessionRefId, bearerToken: 'userA:grantA' }, (deleteError, deleteResult) => {
	ok('a DELETE closes the session', deleteResult.status === 200);
	initializeSession({ port: args.harness.port, bearerToken: 'userA:grantA' }, (initError, initResult) => {
		ok('a DELETE frees a place', initResult.status === 200, `${initResult.status}`);
		next(deleteError || initError, args);
	});
}));
taskList.push((args, next) => {
	const loopbackDoneList = [];
	for (let loopbackIndex = 0; loopbackIndex < 12; loopbackIndex += 1) {
		initializeSession({ port: args.harness.port, isLoopback: true }, (initError, initResult) => {
			loopbackDoneList.push(initResult.status);
			if (loopbackDoneList.length === 12) {
				ok('the loopback path is not capped', loopbackDoneList.every((oneStatus) => oneStatus === 200), loopbackDoneList.join());
				next('', args);
			}
		});
	}
});
taskList.push((args, next) => postRpc({ port: args.harness.port, method: 'tools/list' }, (rpcError, rpcResult) => {
	ok('G2.2: anonymous is 401', rpcResult.status === 401);
	next(rpcError, args);
}));
taskList.push((args, next) => {
	args.harness.userGrantFacts.revokedGrantRefIdSet.add('grantB');
	postRpc({ port: args.harness.port, sessionRefId: args.otherSessionRefId, bearerToken: 'userB:grantB', method: 'tools/list' }, (rpcError, rpcResult) => {
		ok('G2.2: a revoked grant is 401, on its open session', rpcResult.status === 401, `${rpcResult.status}`);
		next(rpcError, args);
	});
});
// userC's used session outlives the TTL, the unused goes
taskList.push((args, next) => initializeMany(args.harness.port, 'userC:grantC', 2, (manyError, resultList) => {
	const [usedSession, idleSession] = resultList;
	const keepUsed = setInterval(() => postRpc({ port: args.harness.port, sessionRefId: usedSession.sessionRefId, bearerToken: 'userC:grantC', method: 'tools/list' }, () => {}), 300);
	setTimeout(() => {
		clearInterval(keepUsed);
		next(manyError, { ...args, usedSession, idleSession });
	}, (IDLE_TTL_SECONDS * 1000) + 1500);
}));
taskList.push((args, next) => postRpc({ port: args.harness.port, sessionRefId: args.idleSession.sessionRefId, bearerToken: 'userC:grantC', method: 'tools/list' }, (rpcError, rpcResult) => {
	ok('G2.4: an idle session is gone after the TTL, answering 404', rpcResult.status === 404, `${rpcResult.status}`);
	next(rpcError, args);
}));
taskList.push((args, next) => postRpc({ port: args.harness.port, sessionRefId: args.usedSession.sessionRefId, bearerToken: 'userC:grantC', method: 'tools/list' }, (rpcError, rpcResult) => {
	ok('G2.4: a used session outlives the TTL', rpcResult.status === 200, `${rpcResult.status}`);
	next(rpcError, args);
}));
taskList.push((args, next) => initializeMany(args.harness.port, 'userA:grantA', 10, (manyError, resultList) => {
	ok('G2.4: the swept sessions freed the places', resultList.every((oneResult) => oneResult.status === 200), resultList.map((oneResult) => oneResult.status).join());
	args.harness.closeServer();
	next(manyError, args);
}));
// an instance without the limits: named, and nothing unlimited
taskList.push((args, next) => {
	delete require.cache[require.resolve('../lib/mcp-server/mcp-server')];
	mountMcpForTest({ mcpConfigValues: { sessionCapPerSub: 10 }, accessPointsDotD }, (mountError, harness) => {
		initializeSession({ port: harness.port, isLoopback: true }, (initError, initResult) => {
			const refusal = initResult.rpcMessage.error;
			ok('absent limit: 503 by name', initResult.status === 503 && refusal.data.refusalName === 'sessionLimitsNotConfigured' && /sessionIdleTtlSeconds/.test(refusal.message), JSON.stringify(initResult.rpcMessage));
			harness.closeServer();
			next(mountError || initError, args);
		});
	});
});
pipeRunner(taskList.getList(), {}, (pipeError) => {
	if (pipeError) {
		ok('the run finished', false, String(pipeError));
	}
	console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===\n`);
	process.exit(failCount > 0 ? 1 : 0);
});
