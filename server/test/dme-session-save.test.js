'use strict';
// dme-session-save.test.js — the DME saved-session write path (BRIEF-dmeSessionFixes-111926, defects 2 and 3).
// John Lovell's session stopped saving at 20:38 UTC on 2026-11-19 (413 bodyTooLarge, seen only in the browser
// console), and every save doubled each apostrophe in it. Real sqlite-instance on a scratch file, real access points,
// endpoints, token middleware and error answer (test/lib/dmeSessionHarness.js). Calls no model, needs no graph.
// Run: node server/test/dme-session-save.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootDmeSessionServer, httpRequest, loginAs } = require('./lib/dmeSessionHarness');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const turnOf = (promptText, stdoutSize) => ({ prompt: promptText, stdout: `${'x'.repeat(stdoutSize)}`, stderr: 'Session saved: noble_cedar\n', timestamp: 1763584718000, askMiloSessionName: 'noble_cedar' });
const describe = (answer) => `${answer.statusCode} ${String(answer.bodyText).slice(0, 160)}`;

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'dmeSessionSaveTest-'));

// each step: (state, next(errText, state))
const stepList = [
	(state, next) => loginAs(state, (loginError, authtoken) => next(loginError, { ...state, authtoken })),

	// defect 2a: a session past the global 100 kb JSON limit is saved (John's 5-turn session was about 120 kb)
	(state, next) => {
		const sessionData = [turnOf('first question', 60 * 1024), turnOf('second question', 60 * 1024), turnOf('third question', 60 * 1024)];
		httpRequest({ ...state, httpMethod: 'POST', routePath: '/api/dmeSessionSave', requestBody: { sessionData } }, (requestError, answer) => {
			check('a 180 kb session (over the global 100 kb limit) saves: 200 with a refId', !requestError && answer.statusCode === 200 && answer.bodyJson && answer.bodyJson[0] && !!answer.bodyJson[0].refId, requestError || describe(answer));
			next(requestError, { ...state, largeSessionRefId: answer.bodyJson && answer.bodyJson[0] && answer.bodyJson[0].refId, largeSessionData: sessionData });
		});
	},
	(state, next) => httpRequest({ ...state, httpMethod: 'GET', routePath: `/api/dmeSessionLoad?refId=${state.largeSessionRefId}` }, (requestError, answer) => {
		const loaded = answer.bodyJson && answer.bodyJson[0];
		check('it loads back whole: three turns, the stdout lengths and askMiloSessionName intact', !requestError && loaded && loaded.sessionData.length === 3 && loaded.sessionData.every((turn) => turn.stdout.length === 60 * 1024 && turn.askMiloSessionName === 'noble_cedar'), requestError || describe(answer));
		next(requestError, state);
	}),

	// defect 2a, the other side: the raised limit is a limit, answered in JSON by name
	(state, next) => httpRequest({ ...state, httpMethod: 'POST', routePath: '/api/dmeSessionSave', requestBody: { sessionData: [turnOf('huge', 6 * 1024 * 1024)] } }, (requestError, answer) => {
		check('a 6 mb session is refused: 413, JSON, refusalName bodyTooLarge (what the store turns into a visible message)', !requestError && answer.statusCode === 413 && answer.bodyJson && answer.bodyJson.refusalName === 'bodyTooLarge', requestError || describe(answer));
		next(requestError, state);
	}),

	// security: the large parse happens AFTER the permission check
	(state, next) => httpRequest({ ...state, authtoken: '', httpMethod: 'POST', routePath: '/api/dmeSessionSave', requestBody: { sessionData: [turnOf('anonymous', 200 * 1024)] } }, (requestError, answer) => {
		check('with no credential a 200 kb body is refused before it is parsed: 401, not 200', !requestError && answer.statusCode === 401, requestError || describe(answer));
		next(requestError, state);
	}),

	// the raise is for this one route only
	(state, next) => httpRequest({ ...state, httpMethod: 'POST', routePath: '/api/harness-echo', requestBody: { pad: 'x'.repeat(150 * 1024) } }, (requestError, answer) => {
		check('another route keeps the global limit: 150 kb to /api/harness-echo is 413', !requestError && answer.statusCode === 413, requestError || describe(answer));
		next(requestError, state);
	}),

	// absent input is refused by name, not crashed on
	(state, next) => httpRequest({ ...state, httpMethod: 'POST', routePath: '/api/dmeSessionSave', requestBody: { refId: state.largeSessionRefId } }, (requestError, answer) => {
		check('a save with no sessionData is refused by name, as a bad request (400)', !requestError && answer.statusCode === 400 && /sessionData must be a list of turns/.test(answer.bodyText), requestError || describe(answer));
		next(requestError, state);
	}),

	// defect 3: save, load, save, load leaves John's unchanged
	(state, next) => {
		const sessionData = [{ prompt: "John's proposal: isn't it 'ContainerOnly'?", stdout: "It's John's design.", stderr: '', timestamp: 1763584718000 }];
		httpRequest({ ...state, httpMethod: 'POST', routePath: '/api/dmeSessionSave', requestBody: { sessionData } }, (requestError, answer) => next(requestError, { ...state, apostropheRefId: answer.bodyJson && answer.bodyJson[0] && answer.bodyJson[0].refId, apostropheSessionData: sessionData }));
	},
	(state, next) => httpRequest({ ...state, httpMethod: 'GET', routePath: `/api/dmeSessionLoad?refId=${state.apostropheRefId}` }, (requestError, answer) => {
		const loadedTurn = answer.bodyJson && answer.bodyJson[0] && answer.bodyJson[0].sessionData[0];
		check("first save and load: John's unchanged", !requestError && loadedTurn && loadedTurn.prompt === state.apostropheSessionData[0].prompt && loadedTurn.stdout === state.apostropheSessionData[0].stdout, requestError || JSON.stringify(loadedTurn));
		next(requestError, { ...state, firstLoadedSessionData: answer.bodyJson && answer.bodyJson[0] && answer.bodyJson[0].sessionData });
	}),
	(state, next) => httpRequest({ ...state, httpMethod: 'POST', routePath: '/api/dmeSessionSave', requestBody: { refId: state.apostropheRefId, sessionData: state.firstLoadedSessionData } }, (requestError) => next(requestError, state)),
	(state, next) => httpRequest({ ...state, httpMethod: 'GET', routePath: `/api/dmeSessionLoad?refId=${state.apostropheRefId}` }, (requestError, answer) => {
		const loadedTurn = answer.bodyJson && answer.bodyJson[0] && answer.bodyJson[0].sessionData[0];
		check("save, load, save, load: John's still unchanged (no compounding)", !requestError && loadedTurn && loadedTurn.prompt === state.apostropheSessionData[0].prompt, requestError || JSON.stringify(loadedTurn));
		next(requestError, state);
	}),
];

bootDmeSessionServer({ scratchDirPath }, (bootError, server) => {
	if (bootError) {
		console.log(`dme-session-save: harness did not boot: ${bootError}`);
		process.exit(1);
	}
	const runFrom = (stepIndex, state) => {
		if (stepIndex >= stepList.length) {
			const failedCount = resultList.filter((passed) => !passed).length;
			console.log(`dme-session-save: ${resultList.length - failedCount} passed, ${failedCount} failed`);
			server.close();
			fs.rmSync(scratchDirPath, { recursive: true, force: true });
			process.exit(failedCount ? 1 : 0);
		}
		stepList[stepIndex](state, (stepError, nextState) => {
			if (stepError) {
				check(`step ${stepIndex} ran`, false, stepError);
			}
			runFrom(stepIndex + 1, nextState || state);
		});
	};
	runFrom(0, { baseUrl: server.baseUrl });
});
