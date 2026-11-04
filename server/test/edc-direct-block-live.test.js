'use strict';
// edc-direct-block-live.test.js — a block over the cap is sent as the store holds it (TQ Q39, cardUriAnswers-110426 Addendum A1), through the real access point and runner, against the real store. Skips by
// name when the store is absent. Every block over the cap downloads with a sha256 equal to its name or answers its licence hold; a slow client is ended at the timeout, with its sqlite3; a second request is
// refused busy; a hash that does not match is logged by name; a bad name is refused before anything runs. Read-only. Set EDC_DIRECT_FORGE_PATH to the forge checkout to test.

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SYSTEM_PATH = path.join(__dirname, '..', '..', '..');
const FORGE_CODE_PATH = process.env.EDC_DIRECT_FORGE_PATH || path.join(SYSTEM_PATH, '..', '..', 'educoreForge', 'system', 'code', 'educoreForge');
const URI_CONTRACT_FILE_PATH = path.join(SYSTEM_PATH, '..', '..', 'educoreForge', 'system', 'dataStores', 'uriContract', 'uriContract.sqlite');
if (!fs.existsSync(URI_CONTRACT_FILE_PATH)) {
	console.log('  SKIP: edc-direct-block-live: no uriContract.sqlite');
	process.exit(0);
}

const CAP_BYTES = 67108864;
const SMALLEST_OVER_CAP_SCHEMA_BLOCK = '4002ade8ba2d8c3297bf17ec8008a622c6bd46d35205302d1beddd4c242afed3'; // SIF, 74.9 MB
const OVER_CAP_BLOCK_LIST = Object.freeze([
	{ pathText: 'schemaBlock/sha256/fa44bccf2a36c7da27775d97f4de75e6f2b8867f7df4f1ea7ac0b874ec3853fa', blockIdentity: 'fa44bccf2a36c7da27775d97f4de75e6f2b8867f7df4f1ea7ac0b874ec3853fa' },
	{ pathText: `schemaBlock/sha256/${SMALLEST_OVER_CAP_SCHEMA_BLOCK}`, blockIdentity: SMALLEST_OVER_CAP_SCHEMA_BLOCK },
	{ pathText: 'schemaBlock/sha256/58d2e3928feffab62911126f55c287c5d04991827344eb15821d96c651732d3c', blockIdentity: '58d2e3928feffab62911126f55c287c5d04991827344eb15821d96c651732d3c' },
	{ pathText: 'decisionSchemaBlock/sha256/255e62eac1bd497d20032a310c2ec9ccc4ee7416052eecdefb7eec0271759b69', blockIdentity: '255e62eac1bd497d20032a310c2ec9ccc4ee7416052eecdefb7eec0271759b69' },
	{ pathText: 'decisionSchemaBlock/sha256/faa48e3965fd5a9c2e7725c1ddcc3613f06ab4ad4c901d85dddded0f12a591c4', blockIdentity: 'faa48e3965fd5a9c2e7725c1ddcc3613f06ab4ad4c901d85dddded0f12a591c4' },
	{ pathText: 'decisionSchemaBlock/sha256/19a9fe9da26acbabc3d60b0a119615df129eb36e9db9924b4f6e80f03341d9d7', blockIdentity: '19a9fe9da26acbabc3d60b0a119615df129eb36e9db9924b4f6e80f03341d9d7' },
	{ pathText: 'decisionSchemaBlock/sha256/4fbf473aca97ef69ac132eda524dac156b484ba13334e7b1afab4d33c589a8ee', blockIdentity: '4fbf473aca97ef69ac132eda524dac156b484ba13334e7b1afab4d33c589a8ee' },
]);
const HELD_OVER_CAP_DECISION_BLOCK = '1a1e9d161672c044778dbd92862263ea9b1a852109b8e65ff969d2699291e583'; // Ed-Fi, 67.4 MB, under licence hold

const errorLineList = [];
process.global = { xLog: { status() {}, verbose() {}, result() {}, error: (errorText) => errorLineList.push(String(errorText)) }, getConfig: () => configValues, rawConfig: {}, commandLineParameters: { switches: {}, values: {} } };
let configValues = { educoreForgeCodePath: FORGE_CODE_PATH, uriContractFilePath: URI_CONTRACT_FILE_PATH, publicPathPrefix: '/edc/', wholeBlockMaxBytes: CAP_BYTES, wholeBlockMaxOldSpaceMegabytes: 768, wholeBlockTimeoutMilliseconds: 60000, directBlockMaxBytes: 536870912, directBlockTimeoutMilliseconds: 600000, directBlockSqliteCommandPath: '/usr/bin/sqlite3' };

let failedCount = 0;
let passedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

// the real access point, behind what the endpoint does with its answer
const accessPointFor = (overrideValues) => {
	configValues = { ...configValues, ...overrideValues };
	const library = {};
	const accessPointPath = path.join(__dirname, '..', 'data-model', 'access-points-dot-d', 'accessPoints.d', 'edc-resolver.js');
	delete require.cache[require.resolve(accessPointPath)];
	require(accessPointPath)({ dotD: { library: { add: (moduleName, serviceFunction) => { library.serviceFunction = serviceFunction; } } }, passThroughParameters: {} });
	return library.serviceFunction;
};
const serverFor = (serviceFunction, done) => {
	const server = http.createServer((request, response) => serviceFunction({ edcRequestPath: request.url, answerFormat: 'json', whenClientGone: (handler) => response.on('close', handler) }, (accessPointError, answer) => {
		response.statusCode = answer.httpStatus;
		Object.entries(answer.extraHeaderByName || {}).forEach(([headerName, headerValue]) => response.setHeader(headerName, headerValue));
		response.setHeader('Content-Type', answer.contentType);
		if (answer.deliverTo) { answer.deliverTo(response); return; }
		response.end(answer.bodyText);
	}));
	server.listen(0, '127.0.0.1', () => done(server, server.address().port));
};
// a client that has every byte can ask again before the child has ended, and is told busy: this one waits, as Retry-After asks
const downloadWhenFree = (port, pathText, done) => download(port, pathText, (downloaded) => {
	if (downloaded.httpStatus === 503) {
		setTimeout(() => downloadWhenFree(port, pathText, done), 200);
		return;
	}
	done(downloaded);
});
const download = (port, pathText, done) => {
	const startMs = Date.now();
	http.get({ port, path: `/${pathText}`, host: '127.0.0.1' }, (response) => {
		const byteHash = crypto.createHash('sha256');
		let byteCount = 0;
		const headChunkList = [];
		response.on('data', (oneChunk) => { byteHash.update(oneChunk); byteCount += oneChunk.length; if (byteCount < 4000) { headChunkList.push(oneChunk); } });
		response.on('end', () => done({ httpStatus: response.statusCode, headers: response.headers, sha256: byteHash.digest('hex'), byteCount, headText: Buffer.concat(headChunkList).toString('utf8'), milliseconds: Date.now() - startMs }));
		response.on('error', (responseError) => done({ httpStatus: response.statusCode, headers: response.headers, responseError }));
	}).on('error', (requestError) => done({ requestError }));
};
const sqliteProcessCount = () => execSync(`pgrep -f "sqlite3 -init /dev/null -readonly" | wc -l`).toString().trim();

const serviceFunction = accessPointFor({});
serverFor(serviceFunction, (server, port) => {
	const runBlock = (blockIndex) => {
		if (blockIndex >= OVER_CAP_BLOCK_LIST.length) {
			runHeldBlock();
			return;
		}
		const oneBlock = OVER_CAP_BLOCK_LIST[blockIndex];
		downloadWhenFree(port, oneBlock.pathText, (downloaded) => {
			ok(`${oneBlock.pathText.slice(0, 40)}: 200, ${downloaded.byteCount} bytes in ${downloaded.milliseconds} ms, sha256 equals its name`, downloaded.httpStatus === 200 && downloaded.sha256 === oneBlock.blockIdentity, JSON.stringify(downloaded).slice(0, 300));
			ok('  it carries the expected hash, the length and the words that checking is the client\'s', downloaded.headers['x-edc-expected-sha256'] === oneBlock.blockIdentity && Number(downloaded.headers['content-length']) === downloaded.byteCount && /not checked before it is sent/.test(downloaded.headers['x-edc-verification']));
			runBlock(blockIndex + 1);
		});
	};
	const runHeldBlock = () => downloadWhenFree(port, `decisionSchemaBlock/sha256/${HELD_OVER_CAP_DECISION_BLOCK}`, (held) => {
		const body = JSON.parse(held.headText);
		ok('a held block over the cap answers 451 with its reason and its metadata, no bytes of it', held.httpStatus === 451 && body.textWithheld === true && body.decisionBlockHash === HELD_OVER_CAP_DECISION_BLOCK && /Ed-Fi/.test(body.withheldReasonList[0].unavailableReason) && body.text === undefined, held.headText.slice(0, 300));
		download(port, `schemaBlock/sha256/${'0'.repeat(64)}`, (absent) => {
			ok('a block nothing holds still answers 404, before any child', absent.httpStatus === 404 && /is not in uriContract/.test(JSON.parse(absent.headText).error), absent.headText.slice(0, 200));
			runBusyAndClientGone();
		});
	});
	// a client that reads nothing holds the one slot; a second request is refused busy; it goes, and its child and sqlite3 go with it
	const runBusyAndClientGone = () => {
		const holdingRequest = http.get({ port, path: `/${OVER_CAP_BLOCK_LIST[0].pathText}`, host: '127.0.0.1' }, (holdingResponse) => {
			holdingResponse.pause();
			download(port, OVER_CAP_BLOCK_LIST[1].pathText, (second) => {
				ok('a second request while one runs is refused busy, with Retry-After', second.httpStatus === 503 && second.headers['retry-after'] === '5' && /one at a time/.test(second.headText), second.headText);
				holdingRequest.destroy();
				setTimeout(() => {
					ok('a client that goes away ends the child and its sqlite3', sqliteProcessCount() === '0', `${sqliteProcessCount()} sqlite3 left`);
					server.close();
					runTimeout();
				}, 1500);
			});
		});
		holdingRequest.on('error', () => {});
	};
	const runTimeout = () => {
		serverFor(accessPointFor({ directBlockTimeoutMilliseconds: 3000 }), (timeoutServer, timeoutPort) => {
			const startMs = Date.now();
			const slowRequest = http.get({ port: timeoutPort, path: `/${OVER_CAP_BLOCK_LIST[0].pathText}`, host: '127.0.0.1' }, (slowResponse) => {
				slowResponse.pause();
				slowResponse.on('error', () => {});
				setTimeout(() => {
					ok('a slow client is ended at the timeout, with its sqlite3, and the slot is free again', sqliteProcessCount() === '0', `${sqliteProcessCount()} sqlite3 left after ${Date.now() - startMs} ms`);
					ok('  and the stop is logged by name', errorLineList.some((oneLine) => /timedOut=true/.test(oneLine)), errorLineList.join(' | ').slice(0, 300));
					download(timeoutPort, OVER_CAP_BLOCK_LIST[3].pathText, (afterTimeout) => {
						ok('  with the slow client still connected, the next request is served, not refused busy', afterTimeout.httpStatus !== 503, `status ${afterTimeout.httpStatus}`);
						slowRequest.destroy();
						timeoutServer.close();
						runMismatch();
					});
				}, 5000);
			});
			slowRequest.on('error', () => {});
		});
	};
	// a sqlite3 that gives other bytes: the block's name cannot be matched, and that is logged by name
	const runMismatch = () => {
		const scriptPath = path.join(os.tmpdir(), `directBlockWrongBytes-${process.pid}.sh`);
		fs.writeFileSync(scriptPath, '#!/bin/sh\nprintf \'{"standardKey":"sif"}\\nnot the block\\n\'\n', { mode: 0o700 });
		serverFor(accessPointFor({ directBlockTimeoutMilliseconds: 60000, directBlockSqliteCommandPath: scriptPath }), (mismatchServer, mismatchPort) => {
			download(mismatchPort, `schemaBlock/sha256/${SMALLEST_OVER_CAP_SCHEMA_BLOCK}`, () => {
				setTimeout(() => {
					ok('bytes that do not hash to the name are logged by name', errorLineList.some((oneLine) => /HASH MISMATCH on schemaBlock/.test(oneLine)), errorLineList.join(' | ').slice(0, 400));
					fs.unlinkSync(scriptPath);
					mismatchServer.close();
					console.log(`edc-direct-block-live: ${passedCount} passed, ${failedCount} failed`);
					process.exit(failedCount === 0 ? 0 : 1);
				}, 500);
			});
		});
	};
	runBlock(0);
});
