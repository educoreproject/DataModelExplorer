'use strict';
// ws-graphinator-resume.test.js — the REAL lib/ws-graphinator.js behind a scratch http server, with NO credential (as
// /ws/explorer is reached), and child_process.spawn replaced by a recorder so no askMilo runs. Covers the 2026-11-19
// adversarial review of fix/dmeSessionResume:
//   B-1  one malformed message must not take the API process down
//   P-1  no conversation is resumed by name without the proof this server issued for it
//   P-2  a path-like resume name never reaches askMilo
//   and the proof itself: askMilo's "Session saved: NAME" line, even split across stderr chunks, comes back with a proof
//   that then resumes NAME.
// Run: node server/test/ws-graphinator-resume.test.js

const http = require('http');
const path = require('path');
const { EventEmitter } = require('events');
const childProcess = require('child_process');

const SERVER_PATH = path.join(__dirname, '..');
const WebSocket = require(require.resolve('ws', { paths: [SERVER_PATH] }));

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

process.global = {
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, debug: () => {}, color: {} },
	getConfig: (sectionName) => ({ 'access-token-header-tools': { secret: 'ws-resume-test-secret-not-a-real-one' } })[sectionName] || {},
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {}, fileList: [] },
};

// the recorder: every askMilo spawn is kept, with the JSON it was given on stdin; tests drive its stderr and close
const spawnList = [];
childProcess.spawn = () => {
	const fakeChild = new EventEmitter();
	fakeChild.pid = 999999;
	fakeChild.stdout = new EventEmitter();
	fakeChild.stderr = new EventEmitter();
	fakeChild.kill = () => {};
	let stdinText = '';
	fakeChild.stdin = { write: (text) => { stdinText += text; }, end: () => { fakeChild.askMiloInput = JSON.parse(stdinText); } };
	spawnList.push(fakeChild);
	return fakeChild;
};

let processExitCode = null;
const realExit = process.exit;
process.on('uncaughtException', (uncaughtError) => {
	// what Node would do without this listener: print and exit 1. Recorded so the check can say so instead of dying.
	processExitCode = 1;
	check('no uncaught exception reached the process', false, String(uncaughtError && uncaughtError.stack));
});

const wssExplorer = require('../lib/ws-graphinator')({ server: null });
const proofOf = require('../lib/dme-resume-context')({ resumeProofSecret: 'ws-resume-test-secret-not-a-real-one', limitByName: require('../lib/dme-resume-limits.json') }).resumeProofOf;

const httpServer = http.createServer();
httpServer.on('upgrade', (request, socket, head) => wssExplorer.handleUpgrade(request, socket, head, (ws) => wssExplorer.emit('connection', ws, request)));

// opens a connection, sends one message, collects what comes back until 'done' (or a quiet second), then closes
const exchange = (port, message, callback) => {
	const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/explorer`);
	const receivedList = [];
	const spawnCountBefore = spawnList.length;
	let isFinished = false;
	const finish = () => {
		if (isFinished) return;
		isFinished = true;
		ws.close();
		// only prompt runs count: each connection also spawns askMilo once for its config defaults (no stdin prompt)
		callback({ receivedList, newSpawnList: spawnList.slice(spawnCountBefore).filter((child) => child.askMiloInput && !child.askMiloInput.switches.getDefaults) });
	};
	ws.on('open', () => ws.send(typeof message === 'string' ? message : JSON.stringify(message)));
	ws.on('message', (raw) => {
		const received = JSON.parse(raw.toString());
		receivedList.push(received);
		if (received.channel === 'done') finish();
	});
	ws.on('error', () => finish());
	setTimeout(finish, 1500);
};
const textOf = (receivedList) => receivedList.map((received) => received.delta || received.noticeText || '').join(' ');
const promptOf = (overrideByName) => ({ type: 'prompt', text: 'next question', settings: { newSession: false, ...overrideByName.settings }, ...(overrideByName.savedTurnList !== undefined ? { savedTurnList: overrideByName.savedTurnList } : {}) });

const stepList = [
	// B-1
	(port, next) => exchange(port, promptOf({ settings: {}, savedTurnList: [null] }), ({ receivedList, newSpawnList }) => {
		check('B-1: savedTurnList [null] is refused by name, the process lives, nothing spawned', processExitCode === null && /saved turn 1 is not a \{prompt, stdout\} record/.test(textOf(receivedList)) && newSpawnList.length === 0, textOf(receivedList));
		next();
	}),
	(port, next) => exchange(port, '{"type":"prompt","text":{"length":500},"settings":null}', ({ receivedList }) => {
		check('B-1: a message that throws inside the handler ends that prompt with a visible error and exit code 1; the process lives', processExitCode === null && receivedList.some((received) => received.channel === 'done' && received.exitCode === 1), JSON.stringify(receivedList));
		next();
	}),
	(port, next) => exchange(port, 'null', () => {
		check('B-1: a JSON null message does not take the process down', processExitCode === null);
		next();
	}),
	// P-2
	(port, next) => exchange(port, promptOf({ settings: { resumeSessionName: '../../../../tmp/zzOverwriteProbe' } }), ({ receivedList, newSpawnList }) => {
		check('P-2: a path-like resume name is refused and never reaches askMilo', newSpawnList.length === 0 && /could not be confirmed/.test(textOf(receivedList)), textOf(receivedList));
		next();
	}),
	// P-1
	(port, next) => exchange(port, promptOf({ settings: { resumeSessionName: 'noble_cedar' } }), ({ receivedList, newSpawnList }) => {
		check("P-1: someone else's conversation name with no proof is refused, nothing spawned", newSpawnList.length === 0 && /could not be confirmed/.test(textOf(receivedList)), textOf(receivedList));
		next();
	}),
	(port, next) => exchange(port, promptOf({ settings: { resumeSessionName: 'noble_cedar', resumeProof: proofOf('amber_arch') } }), ({ newSpawnList }) => {
		check("P-1: a proof issued for a different name does not unlock this one", newSpawnList.length === 0);
		next();
	}),
	(port, next) => exchange(port, promptOf({ settings: { resumeSessionName: 'noble_cedar' }, savedTurnList: [{ prompt: 'my own turn', stdout: 'my answer' }] }), ({ newSpawnList }) => {
		const askMiloInput = (newSpawnList[0] || {}).askMiloInput || { values: {}, fileList: [] };
		check('P-1: an unproven name with saved turns runs a NEW askMilo session rebuilt from the sender\'s own turns', newSpawnList.length === 1 && !askMiloInput.values.resumeSession && /PROMPT: my own turn/.test(askMiloInput.fileList[0]), JSON.stringify(askMiloInput.values));
		next();
	}),
	// the proof round trip
	(port, next) => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/explorer`);
		const receivedList = [];
		ws.on('open', () => ws.send(JSON.stringify({ type: 'prompt', text: 'first question', settings: { newSession: true } })));
		ws.on('message', (raw) => receivedList.push(JSON.parse(raw.toString())));
		setTimeout(() => {
			const child = [...spawnList].reverse().find((spawned) => spawned.askMiloInput && !spawned.askMiloInput.switches.getDefaults);
			child.stderr.emit('data', Buffer.from('[askMilo] working\nSession sa'));
			child.stderr.emit('data', Buffer.from('ved: ivory_tide\n'));
			child.emit('close', 0);
			setTimeout(() => {
				const savedMessage = receivedList.find((received) => received.channel === 'askMiloSessionSaved') || {};
				check('a "Session saved:" line split across two stderr chunks still comes back as askMiloSessionSaved with its proof', savedMessage.askMiloSessionName === 'ivory_tide' && savedMessage.resumeProof === proofOf('ivory_tide'), JSON.stringify(savedMessage));
				ws.close();
				exchange(port, promptOf({ settings: { resumeSessionName: 'ivory_tide', resumeProof: savedMessage.resumeProof } }), ({ newSpawnList }) => {
					const askMiloInput = (newSpawnList[0] || {}).askMiloInput || { values: {} };
					check('the proven name is resumed: askMilo gets --resumeSession=ivory_tide', newSpawnList.length === 1 && JSON.stringify(askMiloInput.values.resumeSession) === '["ivory_tide"]', JSON.stringify(askMiloInput.values));
					next();
				});
			}, 200);
		}, 300);
	},
];

httpServer.listen(0, '127.0.0.1', () => {
	const port = httpServer.address().port;
	const runFrom = (stepIndex) => {
		if (stepIndex >= stepList.length) {
			const failedCount = resultList.filter((passed) => !passed).length;
			console.log(`ws-graphinator-resume: ${resultList.length - failedCount} passed, ${failedCount} failed`);
			httpServer.close();
			realExit(failedCount ? 1 : 0);
		}
		stepList[stepIndex](port, () => runFrom(stepIndex + 1));
	};
	runFrom(0);
});
