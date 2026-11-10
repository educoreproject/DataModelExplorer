#!/usr/bin/env node
'use strict';

// login-credential-text-only.test.js — review SF-1 of WORKORDER-userSqlAndSaveHole-111026, the /api/login half (the
// OIDC form half is oidc-credential-text-only.test.js). A JSON body can carry { "username": { "username": 1 } }; safeSql
// escaped that object to `username` = 1, the lookup read WHERE username = `username` = 1 (every row), and qtLast()
// picked the NEWEST user: a sign-in as that user knowing only that user's password.
//
// Through the real login endpoint and user-login access point of one server tree (test/lib/userAccountHarness.js,
// scratch sqlite). The admin is seeded LAST, so on an unfixed tree the object username signs in as the admin.
//   L1  an object username, an object password and an array username are each refused 401 by name (identifierNotText),
//       and no token naming a user is issued
//   L2  control: the real username and password still sign in
//
// USER_HOLE_SERVER_PATH=<server dir> points it at another tree (the pinned base, to watch it fail).
//
//   /Users/tqwhite/.local/node/bin/node server/test/login-credential-text-only.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootUserAccountServer, httpPost } = require('./lib/userAccountHarness');

const SERVER_PATH = process.env.USER_HOLE_SERVER_PATH ? path.resolve(process.env.USER_HOLE_SERVER_PATH) : path.join(__dirname, '..');
const ALICE_PASSWORD = 'alice-Kestrel-4417';
const ADAM_PASSWORD = 'adam-Kestrel-4417';
const SEED_USER_LIST = [
	{ username: 'alice', password: ALICE_PASSWORD, first: 'Alice', last: 'Able', emailAdr: 'alice@example.org', phone: '', source: 'test', role: 'user' },
	{ username: 'adam', password: ADAM_PASSWORD, first: 'Adam', last: 'Admin', emailAdr: 'adam@example.org', phone: '', source: 'test', role: 'admin' },
];

let passCount = 0;
let failCount = 0;
const check = (testName, condition, detailText) => {
	if (condition) {
		passCount++;
		console.log(`  PASS ${testName}`);
	} else {
		failCount++;
		console.log(`  FAIL ${testName}${detailText ? ` — ${String(detailText).replace(/\s+/g, ' ').slice(0, 240)}` : ''}`);
	}
};

const jwt = require(require.resolve('jsonwebtoken', { paths: [SERVER_PATH] }));
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'loginTextOnlyTest-'));
const signedInUsernameOf = (response) => (response.authtoken ? (jwt.decode(response.authtoken).user || {}).username : undefined);

const caseList = [
	{ caseName: 'object username with the newest user\'s password', requestBody: { username: { username: 1 }, password: ADAM_PASSWORD }, expectSignedIn: false },
	{ caseName: 'object password', requestBody: { username: 'adam', password: { length: 1 } }, expectSignedIn: false },
	{ caseName: 'array username', requestBody: { username: ['adam'], password: ADAM_PASSWORD }, expectSignedIn: false },
	{ caseName: 'control: the real username and password', requestBody: { username: 'alice', password: ALICE_PASSWORD }, expectSignedIn: true },
];

bootUserAccountServer({ serverPath: SERVER_PATH, scratchDirPath, seedUserList: SEED_USER_LIST }, (bootError, harness) => {
	if (bootError) {
		console.log(`FAIL harness did not boot: ${bootError}`);
		process.exit(1);
	}
	console.log(`server tree under test: ${SERVER_PATH}`);
	const runCase = (remainingList) => {
		if (!remainingList.length) {
			console.log(`\n${passCount} passed, ${failCount} failed`);
			harness.close();
			fs.rmSync(scratchDirPath, { recursive: true, force: true });
			process.exit(failCount === 0 ? 0 : 1);
		}
		const [oneCase, ...restList] = remainingList;
		httpPost({ baseUrl: harness.baseUrl, routePath: '/api/login', requestBody: oneCase.requestBody }, (postError, response) => {
			if (oneCase.expectSignedIn) {
				check(`L2 ${oneCase.caseName}: 200, signed in as alice`, response.statusCode === 200 && signedInUsernameOf(response) === 'alice', `${response.statusCode} ${response.bodyText}`);
			} else {
				check(`L1 ${oneCase.caseName}: 401 identifierNotText, no token naming a user`, response.statusCode === 401 && /identifierNotText/.test(response.bodyText) && !signedInUsernameOf(response), `${response.statusCode} signed in as ${signedInUsernameOf(response)}: ${response.bodyText}`);
			}
			runCase(restList);
		});
	};
	runCase(caseList);
});
