#!/usr/bin/env node
'use strict';

// rater-admin-main-login.test.js — revision 6 gate (WORKORDER-RATER6): the rater admin moved into the main /admin page,
// whose calls are signed with the MAIN SITE's login (loginStore: POST /api/login { username, password }, the token from
// the authtoken header). Through the real server (harness, scratch store, the named gold), for EVERY /api/raterAdmin
// action (list, surveys, surveyItems, results, add, passwordReset, surveyChange, remove, download):
//   M6.1 a main-site admin token is accepted, and so is a super token
//   M6.2 a rater token is refused (401 notPermitted) and nothing is changed
//   M6.3 an anonymous call is refused (401 notPermitted) and nothing is changed
//
//   /usr/local/bin/node server/test/rater-admin-main-login.test.js

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootRaterServer, httpPost } = require('./lib/raterServerHarness');

const CODE_PATH = path.join(__dirname, '..', '..');
const FROZEN_INPUT_DIR_PATH = path.join(CODE_PATH, 'cli', 'lib.d', 'rater-tool', 'frozenInputs');
const configFileProcessor = require(require.resolve('qtools-config-file-processor', { paths: [path.join(__dirname, '..')] }));
const realRaterToolConfig = configFileProcessor.getConfig('raterTool.ini', path.join(CODE_PATH, '..', 'configs', 'instanceSpecific', 'qbook') + '/', { resolve: true }).raterTool;

let passCount = 0;
let failCount = 0;
const check = (testName, condition, detailText) => {
	if (condition) {
		passCount++;
		console.log(`  PASS ${testName}`);
	} else {
		failCount++;
		console.log(`  FAIL ${testName}${detailText ? ` — ${detailText}` : ''}`);
	}
};

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raterAdminMainLoginTest-'));
const raterToolConfig = { goldenContainerName: realRaterToolConfig.goldenContainerName, storeFilePath: path.join(scratchDirPath, 'rater.sqlite3'), frozenInputDirPath: FROZEN_INPUT_DIR_PATH, queryTimeoutMs: realRaterToolConfig.queryTimeoutMs, voyageApiKey: realRaterToolConfig.voyageApiKey };

// main-site accounts, made through the real admin-create-user access point as /admin's Add/Edit User does; passwords are
// made per run (no password literals in tests: noContainerLiterals.test.js)
const passwordOfRun = () => crypto.randomBytes(12).toString('hex');
const MAIN_ACCOUNT_LIST = [
	{ username: 'ml-admin', accountPassword: passwordOfRun(), role: 'admin', tokenName: 'adminToken' },
	{ username: 'ml-super', accountPassword: passwordOfRun(), role: 'super', tokenName: 'superToken' },
];
const RATER_PASSWORD = passwordOfRun();
const KEPT_RATER_USER_NAME = 'ml-kept'; // the rater the refused calls aim at; it must survive them unchanged

// every action, with the request the admin, the rater and the anonymous caller each send. The admin sequence is
// ordered so each action has something to act on: add makes ml-new, which is reset, moved and finally removed.
const ADMIN_ACTION_CASE_LIST = [
	{ adminAction: 'list', requestBody: { adminAction: 'list' } },
	{ adminAction: 'surveys', requestBody: { adminAction: 'surveys' } },
	{ adminAction: 'surveyItems', requestBody: { adminAction: 'surveyItems', surveyName: 'A' } },
	{ adminAction: 'results', requestBody: { adminAction: 'results', resultsFormat: 'json' } },
	{ adminAction: 'add', requestBody: { adminAction: 'add', raterUserName: 'ml-new', whoText: 'Main-login test', surveyName: 'A' }, refusedRequestBody: { adminAction: 'add', raterUserName: 'ml-intruder', whoText: 'should not exist', surveyName: 'A' } },
	{ adminAction: 'passwordReset', requestBody: { adminAction: 'passwordReset', raterUserName: 'ml-new' }, refusedRequestBody: { adminAction: 'passwordReset', raterUserName: KEPT_RATER_USER_NAME } },
	{ adminAction: 'surveyChange', requestBody: { adminAction: 'surveyChange', raterUserName: 'ml-new', surveyName: 'B' }, refusedRequestBody: { adminAction: 'surveyChange', raterUserName: KEPT_RATER_USER_NAME, surveyName: 'C' } },
	{ adminAction: 'download', requestBody: { adminAction: 'download', downloadFormat: 'json' } },
	{ adminAction: 'remove', requestBody: { adminAction: 'remove', raterUserName: 'ml-new' }, refusedRequestBody: { adminAction: 'remove', raterUserName: KEPT_RATER_USER_NAME } },
];

const postAs = (state, routePath, requestBody, authtoken, callback) => httpPost({ baseUrl: state.baseUrl, routePath, requestBody, authtoken }, (postError, response) => callback(postError ? { statusCode: 0, bodyText: postError, bodyJson: null } : response));
// a tiny sequential runner, as in rater-surveys.test.js: each step is (state, next(nextState))
const runSteps = (stepList, state, finalStep) => (stepList.length === 0 ? finalStep(state) : stepList[0](state, (nextState) => runSteps(stepList.slice(1), nextState, finalStep)));
const adminPostStep = (requestBody, tokenOf, responseName) => (state, next) => postAs(state, '/api/raterAdmin', requestBody, tokenOf(state), (response) => next({ ...state, [responseName]: response }));
const bodyOf = (response) => ((response.bodyJson || [{}])[0] || {});
const keptRaterOf = (listResponse) => (bodyOf(listResponse).raterList || []).find((rater) => rater.raterUserName === KEPT_RATER_USER_NAME);

const serverStepList = [
	...MAIN_ACCOUNT_LIST.map((account) => (state, next) =>
		state.harness.accessPointByName['admin-create-user']({ username: account.username, password: account.accountPassword, first: 'Main', last: 'Login', emailAdr: `${account.username}@example.org`, role: account.role }, () =>
			postAs(state, '/api/login', { username: account.username, password: account.accountPassword }, null, (response) => next({ ...state, [account.tokenName]: response.authtoken })))),
	adminPostStep({ adminAction: 'add', raterUserName: KEPT_RATER_USER_NAME, whoText: 'Kept rater', password: RATER_PASSWORD, surveyName: 'A' }, (state) => state.adminToken, 'keptAddResponse'),
	(state, next) => postAs(state, '/api/login', { username: KEPT_RATER_USER_NAME, password: RATER_PASSWORD }, null, (response) => next({ ...state, raterToken: response.authtoken })),
	adminPostStep({ adminAction: 'list' }, (state) => state.adminToken, 'listBeforeResponse'),
	// M6.2 and M6.3 first, so a wrongly accepted refused call would show in the list read after them
	...ADMIN_ACTION_CASE_LIST.reduce((soFar, actionCase) => soFar.concat([
		adminPostStep(actionCase.refusedRequestBody || actionCase.requestBody, (state) => state.raterToken, `raterCall_${actionCase.adminAction}`),
		adminPostStep(actionCase.refusedRequestBody || actionCase.requestBody, () => null, `anonymousCall_${actionCase.adminAction}`),
	]), []),
	adminPostStep({ adminAction: 'list' }, (state) => state.adminToken, 'listAfterRefusedResponse'),
	// M6.1 the main-site admin token, then the super token on the read-only actions
	...ADMIN_ACTION_CASE_LIST.map((actionCase) => adminPostStep(actionCase.requestBody, (state) => state.adminToken, `adminCall_${actionCase.adminAction}`)),
	...ADMIN_ACTION_CASE_LIST.filter((actionCase) => !actionCase.refusedRequestBody).map((actionCase) => adminPostStep(actionCase.requestBody, (state) => state.superToken, `superCall_${actionCase.adminAction}`)),
	(state, next) => {
		console.log('fixture');
		check('the main-site admin and super log in through /api/login and get tokens', !!state.adminToken && !!state.superToken);
		check('the kept rater is made and logs in', state.keptAddResponse.statusCode === 200 && !!state.raterToken, state.keptAddResponse.bodyText.slice(0, 120));

		console.log('M6.1 a main-site admin token is accepted on every action');
		ADMIN_ACTION_CASE_LIST.forEach((actionCase) => {
			const adminCall = state[`adminCall_${actionCase.adminAction}`];
			check(`${actionCase.adminAction}: accepted for the main-site admin`, adminCall.statusCode === 200 && Array.isArray(adminCall.bodyJson), `${adminCall.statusCode} ${adminCall.bodyText.slice(0, 120)}`);
		});
		check('add issued ml-new a password; remove removed it', !!bodyOf(state.adminCall_add).issuedPassword && bodyOf(state.adminCall_remove).raterUserName === 'ml-new', `${state.adminCall_add.bodyText.slice(0, 80)} | ${state.adminCall_remove.bodyText.slice(0, 80)}`);
		check('surveyChange moved ml-new to B', bodyOf(state.adminCall_surveyChange).surveyName === 'B', state.adminCall_surveyChange.bodyText.slice(0, 120));
		ADMIN_ACTION_CASE_LIST.filter((actionCase) => !actionCase.refusedRequestBody).forEach((actionCase) => {
			const superCall = state[`superCall_${actionCase.adminAction}`];
			check(`${actionCase.adminAction}: accepted for super`, superCall.statusCode === 200 && Array.isArray(superCall.bodyJson), `${superCall.statusCode} ${superCall.bodyText.slice(0, 120)}`);
		});

		console.log('M6.2–M6.3 a rater token and an anonymous call are refused on every action');
		ADMIN_ACTION_CASE_LIST.forEach((actionCase) => {
			const raterCall = state[`raterCall_${actionCase.adminAction}`];
			const anonymousCall = state[`anonymousCall_${actionCase.adminAction}`];
			check(`${actionCase.adminAction}: a rater token is refused`, raterCall.statusCode === 401 && /^notPermitted/.test(raterCall.bodyText), `${raterCall.statusCode} ${raterCall.bodyText.slice(0, 80)}`);
			check(`${actionCase.adminAction}: an anonymous call is refused`, anonymousCall.statusCode === 401 && /^notPermitted/.test(anonymousCall.bodyText), `${anonymousCall.statusCode} ${anonymousCall.bodyText.slice(0, 80)}`);
		});
		const keptBefore = keptRaterOf(state.listBeforeResponse);
		const keptAfter = keptRaterOf(state.listAfterRefusedResponse);
		const nameListAfter = (bodyOf(state.listAfterRefusedResponse).raterList || []).map((rater) => rater.raterUserName);
		check('the refused calls changed nothing: the kept rater is still on A, and no ml-intruder exists', !!keptBefore && !!keptAfter && keptAfter.surveyName === 'A' && JSON.stringify(nameListAfter) === JSON.stringify([KEPT_RATER_USER_NAME]), JSON.stringify(nameListAfter));
		next(state);
	},
	// the kept rater's password was not reset by the refused calls: it still logs in
	(state, next) => postAs(state, '/api/login', { username: KEPT_RATER_USER_NAME, password: RATER_PASSWORD }, null, (response) => {
		check('the refused passwordReset changed nothing: the kept rater still logs in with its password', response.statusCode === 200 && !!response.authtoken, `${response.statusCode}`);
		next(state);
	}),
];

const finish = (harness) => {
	if (harness) {
		harness.close();
	}
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	console.log(`\n=== rater-admin-main-login (revision 6) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
};

bootRaterServer({ scratchDirPath, raterToolConfig }, (bootError, harness) => {
	if (bootError) {
		check('the harness boots', false, bootError);
		finish(null);
		return;
	}
	runSteps(serverStepList, { harness, baseUrl: harness.baseUrl }, () => finish(harness));
});
