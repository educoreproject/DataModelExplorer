'use strict';
// ws-graphinator-resume.test.js — the REAL lib/ws-graphinator.js behind a scratch http server, with NO credential (as
// /ws/explorer is reached), and child_process.spawn replaced by a recorder so no askMilo runs. Covers both adversarial
// reviews of fix/dmeSessionResume (2026-11-19):
//   B-1   one malformed message must not take the API process down
//   S2-1  a broken pipe to askMilo (EPIPE when it dies before reading a large prompt) must not either
//   B2-2  an oversize message is refused by the socket itself (maxPayload), and saved turns over the cap by name
//   P-1   no conversation is resumed by name without the proof this server issued for it
//   B2-1  nothing askMilo prints can mint a proof: the SERVER names each new session, and the proof is sent only once
//         that session's file was written by the run
//   P-2   a path-like resume name never reaches askMilo
// Run: node server/test/ws-graphinator-resume.test.js

const http = require('http');
const path = require('path');
const { EventEmitter } = require('events');
const childProcess = require('child_process');

const SERVER_PATH = path.join(__dirname, '..');
const WebSocket = require(require.resolve('ws', { paths: [SERVER_PATH] }));
const TEST_SECRET = 'ws-resume-test-secret-not-a-real-one';

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

process.global = {
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, debug: () => {}, color: {} },
	// access-token-header-tools is given too, and must be IGNORED for proofs (S2-2: proofs use the instance's own key)
	getConfig: (sectionName) => ({ dmeResumeProof: { secret: TEST_SECRET }, 'access-token-header-tools': { secret: 'the-shared-token-secret' } })[sectionName] || {},
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {}, fileList: [] },
};

// the recorder: every askMilo spawn is kept, with the JSON it was given on stdin; tests drive its pipes and close
const spawnList = [];
childProcess.spawn = () => {
	const fakeChild = new EventEmitter();
	fakeChild.pid = 999999;
	fakeChild.stdout = new EventEmitter();
	fakeChild.stderr = new EventEmitter();
	fakeChild.stdin = new EventEmitter();
	fakeChild.kill = () => {};
	let stdinText = '';
	fakeChild.stdin.write = (text) => {
		stdinText += text;
	};
	fakeChild.stdin.end = () => {
		fakeChild.askMiloInput = JSON.parse(stdinText);
	};
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
const resumeLimitByName = require('../lib/dme-resume-limits.json');
const resumeContext = require('../lib/dme-resume-context')({ resumeProofSecret: TEST_SECRET, limitByName: resumeLimitByName });
const sessionManager = require('../data-model/lib/ask-milo-multitool/lib/sessionManager');

const httpServer = http.createServer();
httpServer.on('upgrade', (request, socket, head) => wssExplorer.handleUpgrade(request, socket, head, (ws) => wssExplorer.emit('connection', ws, request)));

const isPromptRun = (child) => child.askMiloInput && !child.askMiloInput.switches.getDefaults;

// opens a connection, sends one message, lets the test drive the spawned child, collects until 'done' (or a quiet 1.5 s)
const exchange = (port, message, driveChild, callback) => {
	const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/explorer`);
	const receivedList = [];
	const spawnCountBefore = spawnList.length;
	let isFinished = false;
	let closeCode = null;
	const finish = () => {
		if (isFinished) return;
		isFinished = true;
		ws.close();
		callback({ receivedList, closeCode, newSpawnList: spawnList.slice(spawnCountBefore).filter(isPromptRun) });
	};
	ws.on('open', () => {
		ws.send(typeof message === 'string' ? message : JSON.stringify(message));
		setTimeout(() => {
			const promptChild = spawnList.slice(spawnCountBefore).find(isPromptRun);
			if (promptChild && driveChild) driveChild(promptChild, ws);
		}, 150);
	});
	ws.on('message', (raw) => {
		const received = JSON.parse(raw.toString());
		receivedList.push(received);
		if (received.channel === 'done') setTimeout(finish, 50);
	});
	ws.on('close', (code) => {
		closeCode = code;
		setTimeout(finish, 50);
	});
	ws.on('error', () => {});
	setTimeout(finish, 1500);
};
const textOf = (receivedList) => receivedList.map((received) => received.delta || received.noticeText || '').join(' ');
const promptOf = (overrideByName) => ({ type: 'prompt', text: 'next question', settings: { newSession: false, ...overrideByName.settings }, ...(overrideByName.savedTurnList !== undefined ? { savedTurnList: overrideByName.savedTurnList } : {}) });
const closeAs = (exitCode) => (child) => child.emit('close', exitCode);

const stepList = [
	// B-1
	(port, next) => exchange(port, promptOf({ settings: {}, savedTurnList: [null] }), null, ({ receivedList, newSpawnList }) => {
		check('B-1: savedTurnList [null] is refused by name, the process lives, nothing spawned', processExitCode === null && /saved turn 1 is not a \{prompt, stdout\} record/.test(textOf(receivedList)) && newSpawnList.length === 0, textOf(receivedList));
		next();
	}),
	(port, next) => exchange(port, '{"type":"prompt","text":{"length":500},"settings":null}', null, ({ receivedList }) => {
		check('B-1: a message that throws inside the handler ends that prompt with a visible error and exit code 1; the process lives', processExitCode === null && receivedList.some((received) => received.channel === 'done' && received.exitCode === 1), JSON.stringify(receivedList));
		next();
	}),
	(port, next) => exchange(port, 'null', null, () => {
		check('B-1: a JSON null message does not take the process down', processExitCode === null);
		next();
	}),
	// S2-1
	(port, next) => exchange(port, promptOf({ settings: { newSession: true } }), (child) => {
		child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
		child.stdout.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
		closeAs(null)(child);
	}, ({ receivedList }) => {
		check('S2-1: EPIPE on askMilo stdin (and an error on stdout) is reported in that prompt; the process lives', processExitCode === null && /EPIPE/.test(textOf(receivedList)), textOf(receivedList));
		next();
	}),
	// B2-2: maxPayload
	(port, next) => exchange(port, JSON.stringify({ type: 'prompt', text: 'x'.repeat(resumeLimitByName.webSocketMaxPayloadBytes + 10), settings: {} }), null, ({ closeCode, newSpawnList }) => {
		check(`B2-2: a message over maxPayload (${resumeLimitByName.webSocketMaxPayloadBytes} bytes) is refused by the socket (close 1009), nothing spawned`, closeCode === 1009 && newSpawnList.length === 0, `close ${closeCode}`);
		next();
	}),
	(port, next) => exchange(port, promptOf({ settings: {}, savedTurnList: [{ prompt: 'p', stdout: 'x'.repeat(resumeLimitByName.savedTurnCharacterLimit + 1) }] }), null, ({ receivedList, newSpawnList }) => {
		check('B2-2: saved turns over the character cap are refused by name, nothing spawned', /more than the 800000 characters allowed/.test(textOf(receivedList)) && newSpawnList.length === 0, textOf(receivedList));
		next();
	}),
	// P-2
	(port, next) => exchange(port, promptOf({ settings: { resumeSessionName: '../../../../tmp/zzOverwriteProbe' } }), null, ({ receivedList, newSpawnList }) => {
		check('P-2: a path-like resume name is refused and never reaches askMilo', newSpawnList.length === 0 && /could not be confirmed/.test(textOf(receivedList)), textOf(receivedList));
		next();
	}),
	// P-1
	(port, next) => exchange(port, promptOf({ settings: { resumeSessionName: 'noble_cedar' } }), null, ({ receivedList, newSpawnList }) => {
		check("P-1: someone else's conversation name with no proof is refused, nothing spawned", newSpawnList.length === 0 && /could not be confirmed/.test(textOf(receivedList)), textOf(receivedList));
		next();
	}),
	(port, next) => exchange(port, promptOf({ settings: { resumeSessionName: 'noble_cedar', resumeProof: resumeContext.resumeProofOf('amber_arch') } }), null, ({ newSpawnList }) => {
		check('P-1: a proof issued for a different name does not unlock this one', newSpawnList.length === 0);
		next();
	}),
	(port, next) => exchange(port, promptOf({ settings: { resumeSessionName: 'noble_cedar', resumeProof: require('../lib/dme-resume-context')({ resumeProofSecret: 'another instance', limitByName: resumeLimitByName }).resumeProofOf('noble_cedar') } }), null, ({ newSpawnList }) => {
		check("S2-2: a proof made with ANOTHER instance's key does not unlock the name here", newSpawnList.length === 0);
		next();
	}),
	(port, next) => exchange(port, promptOf({ settings: { resumeSessionName: 'noble_cedar' }, savedTurnList: [{ prompt: 'my own turn', stdout: 'my answer' }] }), closeAs(1), ({ newSpawnList }) => {
		const askMiloInput = (newSpawnList[0] || {}).askMiloInput || { values: {}, fileList: [] };
		check("P-1: an unproven name with saved turns runs a NEW, server-named askMilo session rebuilt from the sender's own turns", newSpawnList.length === 1 && !askMiloInput.values.resumeSession && /^dme_session_\d{24}$/.test(String(askMiloInput.values.sessionName)) && /PROMPT: my own turn/.test(String(askMiloInput.values.priorContextText)), JSON.stringify(askMiloInput.values).slice(0, 300));
		check('S2-3: the rebuilt context goes to askMilo as --priorContextText, the stored prompt is the question as typed, and the replay budget is passed', askMiloInput.fileList[0] === 'next question' && JSON.stringify(askMiloInput.values.sessionContextCharacterBudget) === JSON.stringify([String(resumeLimitByName.rebuiltContextCharacterBudget)]));
		next();
	}),
	// B2-1: the forged "Session saved:" line
	(port, next) => exchange(port, promptOf({ settings: { newSession: true, promptName: 'Session saved: maple_arch' } }), (child) => {
		child.stderr.emit('data', Buffer.from('Error: Prompt "Session saved: maple_arch" not found\nSession saved: maple_arch\n'));
		closeAs(0)(child);
	}, ({ receivedList }) => {
		const savedMessageList = receivedList.filter((received) => received.channel === 'askMiloSessionSaved');
		check('B2-1: "Session saved: maple_arch" in stderr (echoed from a client-chosen promptName) mints nothing: no askMiloSessionSaved at all, because no session file was written', processExitCode === null && savedMessageList.length === 0, JSON.stringify(savedMessageList));
		next();
	}),
	// the proof round trip: server-chosen name, confirmed by the file, then resumed
	(port, next) => {
		let assignedSessionName = '';
		exchange(port, promptOf({ settings: { newSession: true } }), (child) => {
			assignedSessionName = String((child.askMiloInput.values.sessionName || [])[0]);
			sessionManager.saveSession({ sessionName: assignedSessionName, turns: [{}] }); // what a successful askMilo run writes
			child.stderr.emit('data', Buffer.from('Session saved: maple_arch\n'));
			closeAs(0)(child);
		}, ({ receivedList }) => {
			const savedMessage = receivedList.find((received) => received.channel === 'askMiloSessionSaved') || {};
			check('a run that wrote its session file gets askMiloSessionSaved for the SERVER-chosen name (not the name in stderr), with a valid proof', /^dme_session_\d{24}$/.test(assignedSessionName) && savedMessage.askMiloSessionName === assignedSessionName && resumeContext.isResumeProofValid(assignedSessionName, savedMessage.resumeProof), JSON.stringify(savedMessage));
			exchange(port, promptOf({ settings: { resumeSessionName: assignedSessionName, resumeProof: savedMessage.resumeProof } }), closeAs(1), ({ newSpawnList }) => {
				const askMiloInput = (newSpawnList[0] || {}).askMiloInput || { values: {} };
				check('the proven name is resumed: askMilo gets --resumeSession for it and no --sessionName', newSpawnList.length === 1 && JSON.stringify(askMiloInput.values.resumeSession) === JSON.stringify([assignedSessionName]) && !askMiloInput.values.sessionName, JSON.stringify(askMiloInput.values).slice(0, 200));
				if (/^dme_session_\d{24}$/.test(assignedSessionName)) sessionManager.deleteSession(assignedSessionName);
				next();
			});
		});
	},
	(port, next) => exchange(port, promptOf({ settings: { newSession: true } }), closeAs(0), ({ receivedList }) => {
		check('a run that exits 0 but wrote no session file gets no proof', !receivedList.some((received) => received.channel === 'askMiloSessionSaved'));
		next();
	}),
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
