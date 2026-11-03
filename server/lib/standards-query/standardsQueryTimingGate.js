#!/usr/bin/env node
'use strict';

// standardsQueryTimingGate.js — the standing timing gate of the standards query service: one table per route, first call and warm, each against its stated bound. Run on every demo deploy, straight
// after the restart and before anything else asks, so the first-call column is a cold one; a run later than that still works, and its first-call column then means less. It exists because the gates
// of P1 measured bytes and URIs, and a route twenty times slower than its verb passed all of them.
//
//   node server/lib/standards-query/standardsQueryTimingGate.js <baseUrl> <routePrefix> <outFile> [--boundScale=<number>]
//     e.g. node server/lib/standards-query/standardsQueryTimingGate.js https://demo.educore.dev standards/v1 runs/timing.txt
//     Exit 0: every row within its bound. Exit 1: a row over, named. Exit 2: bad arguments, or the service never came up.
//     --boundScale multiplies every bound: 0.001 proves the gate can fail.
//
// Warm is the median of three calls after the first. Calls are spaced to stay under the service's own limit of 60 a minute. Each call counts in usageCounts: a demo's counts include these runs.

const fs = require('fs');
const http = require('http');
const https = require('https');

const bounds = require('./standardsQueryTimingBounds.json');
const registry = require('./standardsQueryOperations.json');

const argumentList = process.argv.slice(2);
const boundScaleArgument = argumentList.find((oneArgument) => oneArgument.startsWith('--boundScale='));
const [baseUrl, routePrefix, outFilePath] = argumentList.filter((oneArgument) => !oneArgument.startsWith('--'));
const boundScale = boundScaleArgument ? Number(boundScaleArgument.split('=')[1]) : 1;
if (!baseUrl || !routePrefix || !outFilePath || !(boundScale > 0)) {
	process.stderr.write('usage: standardsQueryTimingGate.js <baseUrl> <routePrefix> <outFile> [--boundScale=<number>]\n');
	process.exit(2);
}

const SPACING_MILLISECONDS = 1200;
const WARM_CALL_COUNT = 3;
const UP_POLL_MILLISECONDS = 3000;
const UP_POLL_LIMIT = 60;
const client = baseUrl.startsWith('https') ? https : http;
const routeNameOf = (operationName) => registry.operationList.find((oneRow) => oneRow.operationName === operationName).routeName;

const encodedQueryOf = (queryText) => (queryText === '' ? '' : `?${new URLSearchParams(queryText.split('&').map((onePair) => {
	const splitAt = onePair.indexOf('=');
	return [onePair.slice(0, splitAt), onePair.slice(splitAt + 1)];
})).toString()}`);

const timedGet = (routeText, done) => {
	const startedAt = process.hrtime.bigint();
	client.get(`${baseUrl}/${routePrefix}/${routeText}`, (res) => {
		res.resume();
		res.on('end', () => done({ httpStatus: res.statusCode, seconds: Number(process.hrtime.bigint() - startedAt) / 1e9 }));
	}).on('error', () => done({ httpStatus: 0, seconds: 0 }));
};

const median = (numberList) => numberList.slice().sort((left, right) => left - right)[Math.floor(numberList.length / 2)];

// a 503 right after a restart is the URI promise gate still proving itself: wait for it on a route that needs it and reads almost nothing, so no row of the table is warmed
const waitUntilServing = (attemptCount, done) => timedGet('search?q=zzqqUpProbe&mode=keyword', ({ httpStatus }) => {
	if (httpStatus === 200) {
		done(true);
		return;
	}
	if (attemptCount >= UP_POLL_LIMIT) {
		done(false);
		return;
	}
	setTimeout(() => waitUntilServing(attemptCount + 1, done), UP_POLL_MILLISECONDS);
});

const resultList = [];
const measureRow = (rowIndex, done) => {
	if (rowIndex >= bounds.rowList.length) {
		done();
		return;
	}
	const oneRow = bounds.rowList[rowIndex];
	const routeText = `${routeNameOf(oneRow.operationName)}${encodedQueryOf(oneRow.queryText)}`;
	const callList = [];
	const callNext = () => timedGet(routeText, (oneCall) => {
		callList.push(oneCall);
		if (callList.length < WARM_CALL_COUNT + 1) {
			setTimeout(callNext, SPACING_MILLISECONDS);
			return;
		}
		const firstCall = callList[0];
		const warmSeconds = median(callList.slice(1).map((one) => one.seconds));
		const firstBound = (oneRow.firstCallBoundSeconds || bounds.defaultFirstCallBoundSeconds) * boundScale;
		const warmBound = (oneRow.warmBoundSeconds || bounds.defaultWarmBoundSeconds) * boundScale;
		const statusList = [...new Set(callList.map((one) => one.httpStatus))];
		const faultList = [
			...(statusList.length === 1 && statusList[0] === 200 ? [] : [`status ${statusList.join(',')}`]),
			...(firstCall.seconds > firstBound ? [`first call over ${firstBound}`] : []),
			...(warmSeconds > warmBound ? [`warm over ${warmBound}`] : []),
		];
		resultList.push({ label: oneRow.label, firstSeconds: firstCall.seconds, firstBound, warmSeconds, warmBound, knownSlow: oneRow.knownSlow, faultList });
		setTimeout(() => measureRow(rowIndex + 1, done), SPACING_MILLISECONDS);
	});
	callNext();
};

const cell = (numberValue) => numberValue.toFixed(2).padStart(7);
waitUntilServing(0, (isServing) => {
	if (!isServing) {
		process.stderr.write(`standardsQueryTimingGate: ${baseUrl} never came up\n`);
		process.exit(2);
	}
	measureRow(0, () => {
		const overList = resultList.filter((one) => one.faultList.length > 0);
		const lineList = [
			`standards query timing, ${baseUrl}, ${new Date().toISOString()}${boundScale === 1 ? '' : `, bounds scaled by ${boundScale}`}`,
			`${'route'.padEnd(28)} ${'first s'.padStart(7)} ${'bound'.padStart(7)} ${'warm s'.padStart(7)} ${'bound'.padStart(7)}  verdict`,
			...resultList.map((one) => `${one.label.padEnd(28)} ${cell(one.firstSeconds)} ${cell(one.firstBound)} ${cell(one.warmSeconds)} ${cell(one.warmBound)}  ${one.faultList.length ? `OVER: ${one.faultList.join('; ')}` : 'ok'}${one.knownSlow ? ' (known slow)' : ''}`),
			overList.length === 0 ? `every one of ${resultList.length} rows within its bound` : `${overList.length} of ${resultList.length} rows OVER: ${overList.map((one) => one.label).join(', ')}`,
		];
		fs.writeFileSync(outFilePath, `${lineList.join('\n')}\n`);
		process.stdout.write(`${lineList.join('\n')}\n`);
		process.exit(overList.length === 0 ? 0 : 1);
	});
});
