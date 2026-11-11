#!/usr/bin/env node
'use strict';

// user-sql-and-save-hole.test.js — WORKORDER-userSqlAndSaveHole-111026. Two defects in the user table:
//   (1) five queries built by string interpolation (user-by-username, user-save-data twice, admin-update-user,
//       admin-create-user), so a username or refId holding a quote rewrote the SQL;
//   (2) POST /api/saveUserData cloned the whole request body and saved it keyed on the BODY's refId: a signed-in user
//       could edit another user's record, rename themselves, or plant a quoted username that then fed (1) on every
//       request, and the refreshed token carried the stored password hash.
//
// Through the REAL server pieces (test/lib/userAccountHarness.js: scratch sqlite, real access points, the token
// middleware as startApiServer wires it, the real login and saveUserData endpoints):
//   Q1  a quoted or non-text username / refId cannot alter any of the five queries
//   Q2  no interpolated SQL text is left in the five files (static)
//   S1  a body refId other than the caller's is refused (403 notOwnRecord) and the other record is untouched
//   S2  role / username / any property outside the self-editable list is refused BY NAME (400 propertyNotSelfEditable)
//   S3  a normal profile save still works (own refId in the body is accepted; a new password logs in)
//   P1  a password change needs the CURRENT password (verified against the stored hash): absent, wrong, a weak new one,
//       or a current one with no new one are refused by name; the right one changes it (ROMANTIC_PARASOL ruling)
//   P2  no reply ever carries a password property or any stored hash or salt (body, authclaims header, decoded token)
//   T1  token refresh still works: the reply carries a fresh token naming the saved user, without the password hash,
//       and that token signs the next request
//   U1  admin create / update refuse a username outside the rule, by name (usernameNotAllowed)
//   B1  the browser's self-editable list is the server's list (loginStore.js vs lib/user-profile-rules.json)
//
// RED: USER_HOLE_SERVER_PATH points the gate at another server tree; run it at the pinned base
// (zWorktrees/userSqlAndSaveHoleBase, 83591df) to watch it fail. Unset, it tests the tree it lives in.
//
//   /Users/tqwhite/.local/node/bin/node server/test/user-sql-and-save-hole.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootUserAccountServer, httpPost } = require('./lib/userAccountHarness');

const SERVER_PATH = process.env.USER_HOLE_SERVER_PATH ? path.resolve(process.env.USER_HOLE_SERVER_PATH) : path.join(__dirname, '..');
const HTML_PATH = path.join(SERVER_PATH, '..', 'html');
const ACCESS_POINT_DIR_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d');
const FIVE_QUERY_FILE_LIST = ['user-by-username.js', 'user-save-data.js', 'admin-update-user.js', 'admin-create-user.js'];
const HOSTILE_QUOTE_TEXT = "zzz' OR '1'='1";
const HOSTILE_ROLE_REFID_TEXT = "zzz' OR role='admin";
const HOSTILE_OBJECT_IDENTIFIER = { username: 1 };
const ALICE_PASSWORD = 'alice-Kestrel-4417';
const ALICE_NEW_PASSWORD = 'alice-Heron-5528';
const BOB_PASSWORD = 'bob-Kestrel-4417';
const ADAM_PASSWORD = 'adam-Kestrel-4417';
const DORA_PASSWORD = 'dora-Kestrel-8812';
const EVE_PASSWORD = 'eve-Kestrel-8812';
const WEAK_PASSWORD = 'short';
// a colon made profile-user treat a typed password as already hashed and store it as typed (review SF-2)
const CARA_COLON_PASSWORD = 'zq:Wombat-Lantern-73';
const BOB_COLON_PASSWORD = 'bq:Heron-Lantern-58';
const APOSTROPHE_FIRST_NAME = "O'Brien";
const OVERSIZED_FIRST_NAME = 'x'.repeat(100000);
const UNKNOWN_PLAIN_REFID = 'no-such-refId-q7';
const ONE_SECOND_AND_A_LITTLE_MS = 1100;
const WENDY_PASSWORD = 'wendy-Kestrel-4417';
const WENDY_NEW_PASSWORD = 'wendy-Heron-5528';
const WENDY_RESET_PASSWORD = 'wendy-Plover-6639';
const MILLISECONDS_PER_SECOND = 1000;
const JUST_AFTER_SECOND_START_MS = 20;
// wait until just after the next whole second starts, so what follows runs inside one wall-clock second
const waitForFreshSecond = (callback) => setTimeout(callback, MILLISECONDS_PER_SECOND - (Date.now() % MILLISECONDS_PER_SECOND) + JUST_AFTER_SECOND_START_MS);
const iatOf = (authtoken) => (authtoken ? jwt.decode(authtoken).iat : undefined);
const SEED_USER_LIST = [
	{ username: 'alice', password: ALICE_PASSWORD, first: 'Alice', last: 'Able', emailAdr: 'alice@example.org', phone: '', source: 'test', role: 'user' },
	{ username: 'bob', password: BOB_PASSWORD, first: 'Bob', last: 'Baker', emailAdr: 'bob@example.org', phone: '', source: 'test', role: 'user' },
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
		console.log(`  FAIL ${testName}${detailText ? ` — ${String(detailText).replace(/\s+/g, " ").slice(0, 240)}` : ''}`);
	}
};

const jwt = require(require.resolve('jsonwebtoken', { paths: [SERVER_PATH] }));
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'userSqlAndSaveHoleTest-'));

const rowByRefIdOf = (state, refId, callback) =>
	state.harness.userTable.getData(`SELECT * FROM <!tableName!> WHERE refId = ${require(require.resolve('sqlstring-sqlite', { paths: [SERVER_PATH] })).escape(refId)}`, { suppressStatementLog: true }, (readError, rowList = []) => callback(rowList[0]));
const allRowsOf = (state, callback) => state.harness.userTable.getData('SELECT * FROM <!tableName!>', { suppressStatementLog: true }, (readError, rowList = []) => callback(rowList));
const statementsSince = (state, startIndex) => state.harness.statementList.slice(startIndex);
const rawHostileIn = (statementList, hostileText) => statementList.filter((statementText) => statementText.includes(hostileText));
const refusalNameOf = (response) => (response.bodyJson && !Array.isArray(response.bodyJson) ? response.bodyJson.refusalName : undefined);
const userOf = (state, username) => state.harness.seededUserList.find((seededUser) => seededUser.username === username);
// every reply is kept, for P2 (no reply ever carries a password or a salt)
const responseList = [];
const post = (state, routePath, requestBody, authtoken, callback) =>
	httpPost({ baseUrl: state.harness.baseUrl, routePath, requestBody, authtoken }, (postError, response) => {
		const reply = postError ? { statusCode: 0, bodyText: postError, bodyJson: null } : response;
		responseList.push({ routePath, reply });
		callback(reply);
	});
// the base access point answered (err, user); the fixed one answers (err, { user, refusal })
const savedRecordOf = (saveAnswer) => (saveAnswer && typeof saveAnswer === 'object' && 'refusal' in saveAnswer ? saveAnswer.user : saveAnswer);
// every hash:salt text stored for any user, and each half of it
const storedSecretListOf = (rowList) => rowList.filter((userRow) => userRow.password).reduce((secretList, userRow) => [...secretList, userRow.password, ...String(userRow.password).split(':')], []).filter((secretText) => secretText.length >= 16);

const stepList = [
	(state, next) => bootUserAccountServer({ serverPath: SERVER_PATH, scratchDirPath, seedUserList: SEED_USER_LIST }, (bootError, harness) => {
		if (bootError) {
			console.log(`FAIL harness did not boot: ${bootError}`);
			process.exit(1);
		}
		next({ ...state, harness });
	}),
	(state, next) => allRowsOf(state, (rowList) => next({ ...state, seededRowList: rowList })),
	(state, next) => post(state, '/api/login', { username: 'alice', password: ALICE_PASSWORD }, null, (response) => next({ ...state, aliceToken: response.authtoken })),

	// ---------------------------------------------------------------- L1 a non-text credential at /api/login (review SF-1)
	// run FIRST, while adam (admin) is the newest row: an object username escaped to `username` = 1 matched every row, and qtLast() picked the newest user: adam, the admin
	(state, next) => post(state, '/api/login', { username: HOSTILE_OBJECT_IDENTIFIER, password: ADAM_PASSWORD }, null, (response) => next({ ...state, l1ObjectUsernameLogin: response })),
	(state, next) => post(state, '/api/login', { username: 'adam', password: { length: 1 } }, null, (response) => next({ ...state, l1ObjectPasswordLogin: response })),
	(state, next) => post(state, '/api/login', { username: ['adam'], password: ADAM_PASSWORD }, null, (response) => next({ ...state, l1ArrayUsernameLogin: response })),

	// ---------------------------------------------------------------- Q1 the five queries
	(state, next) => {
		const startIndex = state.harness.statementList.length;
		state.harness.accessPointByName['user-by-username']({ username: HOSTILE_QUOTE_TEXT }, (lookupError, foundUser) => next({ ...state, q1UsernameQuote: { lookupError, foundUser, statementList: statementsSince(state, startIndex) } }));
	},
	(state, next) => {
		const startIndex = state.harness.statementList.length;
		state.harness.accessPointByName['user-by-username']({ username: HOSTILE_OBJECT_IDENTIFIER }, (lookupError, foundUser) => next({ ...state, q1UsernameObject: { lookupError, foundUser, statementList: statementsSince(state, startIndex) } }));
	},
	(state, next) => {
		const startIndex = state.harness.statementList.length;
		state.harness.accessPointByName['user-save-data']({ refId: HOSTILE_ROLE_REFID_TEXT, first: 'Mallory' }, (saveError, savedUser) => next({ ...state, q1SaveRefId: { saveError, savedUser, statementList: statementsSince(state, startIndex) } }));
	},
	(state, next) => {
		const startIndex = state.harness.statementList.length;
		state.harness.accessPointByName['admin-update-user']({ refId: HOSTILE_QUOTE_TEXT, username: 'carol', first: 'Carol', last: 'Cole', emailAdr: 'carol@example.org' }, (updateError, updateAnswer) => next({ ...state, q1AdminUpdate: { updateError, updateAnswer, statementList: statementsSince(state, startIndex) } }));
	},
	(state, next) => {
		const startIndex = state.harness.statementList.length;
		state.harness.accessPointByName['admin-create-user']({ username: 'dora', password: DORA_PASSWORD, first: 'Dora', last: 'Dunn', emailAdr: 'dora@example.org' }, (createError, createAnswer) => next({ ...state, q1AdminCreate: { createError, createAnswer, statementList: statementsSince(state, startIndex) } }));
	},

	// ---------------------------------------------------------------- S1 another user's refId
	(state, next) => post(state, '/api/saveUserData', { refId: userOf(state, 'bob').refId, first: 'Hijacked', role: 'user' }, state.aliceToken, (response) => next({ ...state, s1Response: response })),
	(state, next) => rowByRefIdOf(state, userOf(state, 'bob').refId, (bobRow) => next({ ...state, s1BobRow: bobRow })),

	// ---------------------------------------------------------------- S2 properties outside the list, by name
	(state, next) => post(state, '/api/saveUserData', { first: 'Alice', role: 'super' }, state.aliceToken, (response) => next({ ...state, s2RoleResponse: response })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Alice', username: 'alice2' }, state.aliceToken, (response) => next({ ...state, s2UsernameResponse: response })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Alice', username: "alice' OR '1'='1", role: 'admin,super', confirmPassword: 'x' }, state.aliceToken, (response) => next({ ...state, s2ManyResponse: response })),
	(state, next) => post(state, '/api/saveUserData', [{ first: 'Alice' }], state.aliceToken, (response) => next({ ...state, s2ArrayResponse: response })),
	// S4 the same attacks carrying the caller's OWN refId (review SF-5: without a refId the base never touched alice's row)
	(state, next) => post(state, '/api/saveUserData', { refId: userOf(state, 'alice').refId, role: 'super' }, state.aliceToken, (response) => next({ ...state, s4OwnRoleResponse: response })),
	(state, next) => post(state, '/api/saveUserData', { refId: userOf(state, 'alice').refId, username: 'alice2', role: 'user' }, state.aliceToken, (response) => next({ ...state, s4OwnUsernameResponse: response })),
	(state, next) => rowByRefIdOf(state, userOf(state, 'alice').refId, (aliceRow) => next({ ...state, s2AliceRow: aliceRow })),

	// ---------------------------------------------------------------- S3 + T1 a normal save, and the refreshed token
	(state, next) => post(state, '/api/saveUserData', { refId: userOf(state, 'alice').refId, first: 'Alicia', last: 'Able', emailAdr: 'alicia@example.org', phone: '5551234567' }, state.aliceToken, (response) => next({ ...state, s3Response: response })),
	(state, next) => rowByRefIdOf(state, userOf(state, 'alice').refId, (aliceRow) => next({ ...state, s3AliceRow: aliceRow })),
	// P1 a password change needs the CURRENT password; a weak new one, or a current one with no new one, is refused
	(state, next) => post(state, '/api/saveUserData', { password: ALICE_NEW_PASSWORD }, state.aliceToken, (response) => next({ ...state, p1NoCurrentResponse: response })),
	(state, next) => post(state, '/api/saveUserData', { password: ALICE_NEW_PASSWORD, currentPassword: 'not-alices-Kestrel-9' }, state.aliceToken, (response) => next({ ...state, p1WrongCurrentResponse: response })),
	(state, next) => post(state, '/api/saveUserData', { password: WEAK_PASSWORD, currentPassword: ALICE_PASSWORD }, state.aliceToken, (response) => next({ ...state, p1WeakResponse: response })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Alicia', currentPassword: ALICE_PASSWORD }, state.aliceToken, (response) => next({ ...state, p1LoneCurrentResponse: response })),
	(state, next) => post(state, '/api/login', { username: 'alice', password: ALICE_PASSWORD }, null, (response) => next({ ...state, p1OldPasswordLogin: response })),
	// T2 tokens carry iat in whole seconds and a token minted in the cutoff's own second is kept (iat >= cutoff), so the
	// change waits a little over a second after every earlier token was minted
	(state, next) => setTimeout(() => next(state), ONE_SECOND_AND_A_LITTLE_MS),
	(state, next) => post(state, '/api/saveUserData', { password: ALICE_NEW_PASSWORD, currentPassword: ALICE_PASSWORD }, state.s3Response.authtoken, (response) => next({ ...state, t1SecondResponse: response })),
	(state, next) => post(state, '/api/login', { username: 'alice', password: ALICE_NEW_PASSWORD }, null, (response) => next({ ...state, s3NewPasswordLogin: response })),
	(state, next) => post(state, '/api/login', { username: 'alice', password: ALICE_PASSWORD }, null, (response) => next({ ...state, s3OldPasswordAfterChange: response })),

	// ---------------------------------------------------------------- T2 a password change signs out every other session (review SF-4)
	(state, next) => post(state, '/api/saveUserData', { first: 'Alicia' }, state.aliceToken, (response) => next({ ...state, t2LoginTokenResponse: response })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Alicia' }, state.s3Response.authtoken, (response) => next({ ...state, t2RefreshedTokenResponse: response })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Alicia' }, state.t1SecondResponse.authtoken, (response) => next({ ...state, t2FreshTokenResponse: response })),

	// ---------------------------------------------------------------- V1 values: text only, bounded, a well-formed email (review SF-7, N-1, N-2)
	(state, next) => post(state, '/api/saveUserData', { first: { a: 1 } }, state.t2FreshTokenResponse.authtoken, (response) => next({ ...state, v1ObjectValueResponse: response })),
	(state, next) => post(state, '/api/saveUserData', { first: OVERSIZED_FIRST_NAME }, state.t2FreshTokenResponse.authtoken, (response) => next({ ...state, v1OversizedResponse: response })),
	(state, next) => post(state, '/api/login', { username: 'alice', password: ALICE_NEW_PASSWORD }, null, (response) => next({ ...state, v1LoginAfterOversized: response })),
	(state, next) => post(state, '/api/saveUserData', { emailAdr: '<script>alert(1)</script>' }, state.t2FreshTokenResponse.authtoken, (response) => next({ ...state, v1BadEmailResponse: response })),

	// ---------------------------------------------------------------- S5 an apostrophe round-trips byte for byte, twice (review SF-6)
	(state, next) => post(state, '/api/saveUserData', { first: APOSTROPHE_FIRST_NAME }, state.t2FreshTokenResponse.authtoken, (response) => next({ ...state, s5FirstSave: response })),
	(state, next) => rowByRefIdOf(state, userOf(state, 'alice').refId, (aliceRow) => next({ ...state, s5RowAfterFirst: aliceRow })),
	(state, next) => post(state, '/api/saveUserData', { first: state.s5FirstSave.authtoken ? (jwt.decode(state.s5FirstSave.authtoken).user || {}).first : APOSTROPHE_FIRST_NAME }, state.s5FirstSave.authtoken || state.t2FreshTokenResponse.authtoken, (response) => next({ ...state, s5SecondSave: response })),
	(state, next) => rowByRefIdOf(state, userOf(state, 'alice').refId, (aliceRow) => next({ ...state, s5RowAfterSecond: aliceRow })),

	// ---------------------------------------------------------------- H1 one hashing rule on every path (review SF-2)
	(state, next) => state.harness.accessPointByName['admin-create-user']({ username: 'cara', password: CARA_COLON_PASSWORD, first: 'Cara', last: 'Cole', emailAdr: 'cara@example.org' }, (createError, createAnswer) => next({ ...state, h1CreateError: createError, h1CaraRefId: createAnswer && createAnswer.user && createAnswer.user.refId })),
	(state, next) => post(state, '/api/login', { username: 'cara', password: CARA_COLON_PASSWORD }, null, (response) => next({ ...state, h1CaraLogin: response })),
	(state, next) => state.harness.accessPointByName['admin-update-user']({ refId: userOf(state, 'bob').refId, username: 'bob', password: BOB_COLON_PASSWORD, first: 'Bob', last: 'Baker', emailAdr: 'bob@example.org' }, (updateError) => next({ ...state, h1UpdateError: updateError })),
	(state, next) => post(state, '/api/login', { username: 'bob', password: BOB_COLON_PASSWORD }, null, (response) => next({ ...state, h1BobLogin: response })),
	(state, next) => state.harness.accessPointByName['admin-create-user']({ username: 'obrien', password: DORA_PASSWORD, first: APOSTROPHE_FIRST_NAME, last: 'Admin', emailAdr: 'obrien@example.org' }, (createError, createAnswer) => next({ ...state, h1ApostropheCreate: { createError, createAnswer } })),


	// ---------------------------------------------------------------- Q3 an unknown plain refId is refused, never saved as success (replaces a check that held on base)
	(state, next) => state.harness.accessPointByName['user-save-data']({ refId: UNKNOWN_PLAIN_REFID, first: 'Ghost' }, (saveError, saveAnswer) => next({ ...state, q3UnknownSave: { saveError, saveAnswer } })),

	// ---------------------------------------------------------------- U1 the username rule on admin create / update
	(state, next) => state.harness.accessPointByName['admin-create-user']({ username: "eve'name", password: EVE_PASSWORD, first: 'Eve', last: 'Evans', emailAdr: 'eve@example.org' }, (createError) => next({ ...state, u1CreateError: createError })),
	(state, next) => state.harness.accessPointByName['admin-update-user']({ refId: userOf(state, 'bob').refId, username: "bob'name", first: 'Bob', last: 'Baker', emailAdr: 'bob@example.org' }, (updateError) => next({ ...state, u1UpdateError: updateError })),
	// ---------------------------------------------------------------- W1 the same-second race (re-verification SF-4 (1))
	// a token minted in the SAME second as the change must not survive; only the changer's fresh token does
	(state, next) => state.harness.accessPointByName['admin-create-user']({ username: 'wendy', password: WENDY_PASSWORD, first: 'Wendy', last: 'Wren', emailAdr: 'wendy@example.org' }, (createError, createAnswer) => next({ ...state, wendyRefId: createAnswer && createAnswer.user && createAnswer.user.refId })),
	(state, next) => waitForFreshSecond(() => next(state)),
	(state, next) => post(state, '/api/login', { username: 'wendy', password: WENDY_PASSWORD }, null, (response) => next({ ...state, w1ThiefLogin: response })),
	(state, next) => post(state, '/api/login', { username: 'wendy', password: WENDY_PASSWORD }, null, (response) => next({ ...state, w1ChangerLogin: response })),
	(state, next) => post(state, '/api/saveUserData', { password: WENDY_NEW_PASSWORD, currentPassword: WENDY_PASSWORD }, state.w1ChangerLogin.authtoken, (response) => next({ ...state, w1Change: response, w1ChangeSecond: Math.floor(Date.now() / MILLISECONDS_PER_SECOND) })),
	(state, next) => rowByRefIdOf(state, state.wendyRefId, (wendyRow) => next({ ...state, w1CutoffSeconds: Number((wendyRow || {}).accessRevokedAfter || 0) })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Thief' }, state.w1ThiefLogin.authtoken, (response) => next({ ...state, w1ThiefAfter: response })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Wendy' }, state.w1Change.authtoken, (response) => next({ ...state, w1ChangerNext: response })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Wendy' }, state.w1ChangerNext.authtoken, (response) => next({ ...state, w1ChangerNextNext: response })),
	// a sign-in with the NEW password in the change's own second must give a token that works (it is signed at the cutoff)
	(state, next) => post(state, '/api/login', { username: 'wendy', password: WENDY_NEW_PASSWORD }, null, (response) => next({ ...state, w1LoginRightAfter: response, w1LoginRightAfterSecond: Math.floor(Date.now() / MILLISECONDS_PER_SECOND) })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Wendy' }, state.w1LoginRightAfter.authtoken, (response) => next({ ...state, w1LoginRightAfterSave: response })),

	// ---------------------------------------------------------------- W2 an admin password reset ends the user's sessions (re-verification SF-4 (3))
	// a fresh second first, so W1's cutoff cannot be what refuses the token below
	(state, next) => waitForFreshSecond(() => setTimeout(() => next(state), MILLISECONDS_PER_SECOND)),
	(state, next) => post(state, '/api/login', { username: 'wendy', password: WENDY_NEW_PASSWORD }, null, (response) => next({ ...state, w2WendyLogin: response })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Wendy' }, state.w2WendyLogin.authtoken, (response) => next({ ...state, w2BeforeReset: response })),
	(state, next) => state.harness.accessPointByName['admin-update-user']({ refId: state.wendyRefId, username: 'wendy', password: WENDY_RESET_PASSWORD, first: 'Wendy', last: 'Wren', emailAdr: 'wendy@example.org' }, (updateError) => next({ ...state, w2ResetError: updateError })),
	(state, next) => post(state, '/api/saveUserData', { first: 'Wendy' }, state.w2WendyLogin.authtoken, (response) => next({ ...state, w2AfterReset: response })),
	(state, next) => post(state, '/api/login', { username: 'wendy', password: WENDY_RESET_PASSWORD }, null, (response) => next({ ...state, w2ResetLogin: response })),

	// ---------------------------------------------------------------- A1 admin saves refuse unknown properties by name (re-verification nit)
	(state, next) => state.harness.accessPointByName['admin-update-user']({ refId: state.wendyRefId, username: 'wendy', first: 'Wendy', last: 'Wren', emailAdr: 'wendy@example.org', disabled: '1' }, (updateError) => next({ ...state, a1UpdateError: updateError })),
	(state, next) => state.harness.accessPointByName['admin-create-user']({ username: 'xena', password: DORA_PASSWORD, first: 'Xena', last: 'Xu', emailAdr: 'xena@example.org', accessRevokedAfter: '1' }, (createError) => next({ ...state, a1CreateError: createError })),
	(state, next) => allRowsOf(state, (rowList) => next({ ...state, finalRowList: rowList })),

	// ---------------------------------------------------------------- N3 admin-create refuses a non-text username by name
	// LAST, because an unfixed tree THROWS here ('userData.username?.trim is not a function'), synchronously and
	// uncaught; the throw is recorded as the result so the report still runs
	(state, next) => {
		const recordThrow = (thrownError) => next({ ...state, n3CreateError: `threw: ${thrownError.message}` });
		process.once('uncaughtException', recordThrow);
		state.harness.accessPointByName['admin-create-user']({ username: { a: 1 }, password: DORA_PASSWORD, first: 'Nina', last: 'Null', emailAdr: 'nina@example.org' }, (createError) => {
			process.removeListener('uncaughtException', recordThrow);
			next({ ...state, n3CreateError: createError });
		});
	},
];

const report = (state) => {
	console.log(`server tree under test: ${SERVER_PATH}`);

	console.log('Q1 a quoted or non-text identifier cannot alter any of the five queries');
	check('user-by-username: a quoted username finds no user', !state.q1UsernameQuote.foundUser, JSON.stringify(state.q1UsernameQuote.foundUser && state.q1UsernameQuote.foundUser.username));
	check('user-by-username: the quoted username never reaches SQL unescaped', rawHostileIn(state.q1UsernameQuote.statementList, HOSTILE_QUOTE_TEXT).length === 0, state.q1UsernameQuote.statementList.join(' | '));
	check('user-by-username: a non-text username finds no user and is refused by name', !state.q1UsernameObject.foundUser && /identifierNotText/.test(String(state.q1UsernameObject.lookupError)), `${state.q1UsernameObject.lookupError} / ${state.q1UsernameObject.statementList.join(' | ')}`);
	check('user-save-data: a quoted refId is refused by name (noSuchUser), inheriting no role', /noSuchUser/.test(String(state.q1SaveRefId.saveError)) && !savedRecordOf(state.q1SaveRefId.savedUser), `${state.q1SaveRefId.saveError} / ${JSON.stringify(state.q1SaveRefId.savedUser)}`);
	check('user-save-data: the quoted refId never reaches SQL unescaped (both queries)', rawHostileIn(state.q1SaveRefId.statementList, HOSTILE_ROLE_REFID_TEXT).length === 0, state.q1SaveRefId.statementList.join(' | '));
	check('admin-update-user: the quoted refId never reaches SQL unescaped', state.q1AdminUpdate.statementList.length > 0 && rawHostileIn(state.q1AdminUpdate.statementList, HOSTILE_QUOTE_TEXT).length === 0, `${state.q1AdminUpdate.updateError} / ${state.q1AdminUpdate.statementList.join(' | ')}`);
	check('admin-create-user: still creates a user, and reads it back by an escaped refId', !state.q1AdminCreate.createError && state.q1AdminCreate.createAnswer.user && state.q1AdminCreate.createAnswer.user.username === 'dora', `${state.q1AdminCreate.createError}`);
	check('user-save-data: an unknown plain refId is refused by name (noSuchUser), never answered as a save', /noSuchUser/.test(String(state.q3UnknownSave.saveError)) && !savedRecordOf(state.q3UnknownSave.saveAnswer) && !state.finalRowList.some((userRow) => userRow.refId === UNKNOWN_PLAIN_REFID), `${state.q3UnknownSave.saveError} / ${JSON.stringify(state.q3UnknownSave.saveAnswer)}`);

	console.log('Q2 no interpolated SQL is left in the five files');
	FIVE_QUERY_FILE_LIST.forEach((fileName) => {
		const sourceText = fs.readFileSync(path.join(ACCESS_POINT_DIR_PATH, fileName), 'utf8');
		const interpolatedList = sourceText.match(/`[^`]*<!tableName!>[^`]*\$\{[^`]*`/g) || [];
		check(`${fileName}: no SQL template carries \${...}`, interpolatedList.length === 0, interpolatedList.join(' | '));
	});

	console.log('S1 a body refId other than the caller\'s is refused');
	check('refused 403 notOwnRecord', state.s1Response.statusCode === 403 && refusalNameOf(state.s1Response) === 'notOwnRecord', `${state.s1Response.statusCode} ${state.s1Response.bodyText}`);
	check('the other user\'s record is untouched', state.s1BobRow && state.s1BobRow.first === 'Bob', JSON.stringify(state.s1BobRow && state.s1BobRow.first));

	console.log('S2 role / username / anything outside the list is refused by name');
	check('role: refused 400 propertyNotSelfEditable naming role', state.s2RoleResponse.statusCode === 400 && refusalNameOf(state.s2RoleResponse) === 'propertyNotSelfEditable' && /\brole\b/.test(state.s2RoleResponse.bodyJson.reason), `${state.s2RoleResponse.statusCode} ${state.s2RoleResponse.bodyText}`);
	check('username: refused 400 propertyNotSelfEditable naming username', state.s2UsernameResponse.statusCode === 400 && refusalNameOf(state.s2UsernameResponse) === 'propertyNotSelfEditable' && /\busername\b/.test(state.s2UsernameResponse.bodyJson.reason), `${state.s2UsernameResponse.statusCode} ${state.s2UsernameResponse.bodyText}`);
	check('several at once: every one is named', state.s2ManyResponse.statusCode === 400 && ['username', 'role', 'confirmPassword'].every((propertyName) => new RegExp(`\\b${propertyName}\\b`).test((state.s2ManyResponse.bodyJson || {}).reason || '')), `${state.s2ManyResponse.statusCode} ${state.s2ManyResponse.bodyText}`);
	check('a body that is not an object: refused 400 bodyNotAnObject', state.s2ArrayResponse.statusCode === 400 && refusalNameOf(state.s2ArrayResponse) === 'bodyNotAnObject', `${state.s2ArrayResponse.statusCode} ${state.s2ArrayResponse.bodyText}`);
	check('the caller\'s own record kept its role and username', state.s2AliceRow && state.s2AliceRow.role === 'user' && state.s2AliceRow.username === 'alice', JSON.stringify(state.s2AliceRow && { role: state.s2AliceRow.role, username: state.s2AliceRow.username }));

	console.log('S4 the same attacks with the caller\'s own refId');
	check('own refId + role: refused 400 propertyNotSelfEditable naming role', state.s4OwnRoleResponse.statusCode === 400 && refusalNameOf(state.s4OwnRoleResponse) === 'propertyNotSelfEditable' && /\brole\b/.test(state.s4OwnRoleResponse.bodyJson.reason), `${state.s4OwnRoleResponse.statusCode} ${state.s4OwnRoleResponse.bodyText}`);
	check('own refId + username: refused 400 propertyNotSelfEditable naming username', state.s4OwnUsernameResponse.statusCode === 400 && refusalNameOf(state.s4OwnUsernameResponse) === 'propertyNotSelfEditable' && /\busername\b/.test(state.s4OwnUsernameResponse.bodyJson.reason), `${state.s4OwnUsernameResponse.statusCode} ${state.s4OwnUsernameResponse.bodyText}`);

	console.log('S3 a normal profile save still works');
	check('200, answering the caller\'s own refId', state.s3Response.statusCode === 200 && Array.isArray(state.s3Response.bodyJson) && state.s3Response.bodyJson[0].refID === userOf(state, 'alice').refId, `${state.s3Response.statusCode} ${state.s3Response.bodyText}`);
	check('the record holds the new values', state.s3AliceRow && state.s3AliceRow.first === 'Alicia' && state.s3AliceRow.emailAdr === 'alicia@example.org' && state.s3AliceRow.phone === '5551234567', JSON.stringify(state.s3AliceRow));
	check('role, username and password hash are unchanged by it', state.s3AliceRow && state.s3AliceRow.role === 'user' && state.s3AliceRow.username === 'alice' && state.s3AliceRow.password === state.s2AliceRow.password);
	check('a password change saves, and the new password logs in', state.t1SecondResponse.statusCode === 200 && state.s3NewPasswordLogin.statusCode === 200 && !!state.s3NewPasswordLogin.authtoken, `${state.t1SecondResponse.statusCode} ${state.t1SecondResponse.bodyText} / login ${state.s3NewPasswordLogin.statusCode}`);

	console.log('P1 a password change needs the current password');
	check('no current password: refused 400 currentPasswordRequired', state.p1NoCurrentResponse.statusCode === 400 && refusalNameOf(state.p1NoCurrentResponse) === 'currentPasswordRequired', `${state.p1NoCurrentResponse.statusCode} ${state.p1NoCurrentResponse.bodyText}`);
	check('a wrong current password: refused 403 currentPasswordWrong', state.p1WrongCurrentResponse.statusCode === 403 && refusalNameOf(state.p1WrongCurrentResponse) === 'currentPasswordWrong', `${state.p1WrongCurrentResponse.statusCode} ${state.p1WrongCurrentResponse.bodyText}`);
	check('a weak new password: refused 400 passwordNotAccepted', state.p1WeakResponse.statusCode === 400 && refusalNameOf(state.p1WeakResponse) === 'passwordNotAccepted', `${state.p1WeakResponse.statusCode} ${state.p1WeakResponse.bodyText}`);
	check('a current password with no new one: refused 400 propertyNotSelfEditable naming currentPassword', state.p1LoneCurrentResponse.statusCode === 400 && refusalNameOf(state.p1LoneCurrentResponse) === 'propertyNotSelfEditable' && /\bcurrentPassword\b/.test(state.p1LoneCurrentResponse.bodyJson.reason), `${state.p1LoneCurrentResponse.statusCode} ${state.p1LoneCurrentResponse.bodyText}`);
	check('after the refused changes the old password still logs in', state.p1OldPasswordLogin.statusCode === 200, `${state.p1OldPasswordLogin.statusCode}`);
	check('the old password no longer logs in after the change (while the new one does)', state.s3NewPasswordLogin.statusCode === 200 && state.s3OldPasswordAfterChange && state.s3OldPasswordAfterChange.statusCode !== 200, `${state.s3OldPasswordAfterChange && state.s3OldPasswordAfterChange.statusCode}`);

	console.log('P2 no reply ever carries a password or a salt');
	const storedSecretList = storedSecretListOf([...state.seededRowList, ...state.finalRowList]);
	const leakingReplyList = responseList.filter(({ reply }) => {
		const replyText = [reply.bodyText, reply.authclaimsText, reply.authtoken ? JSON.stringify(jwt.decode(reply.authtoken)) : ''].join('\n');
		return /"password"\s*:/.test(replyText) || storedSecretList.some((secretText) => replyText.includes(secretText));
	});
	check(`none of the ${responseList.length} replies (body, authclaims header, decoded token) carries a password property or any stored hash or salt`, responseList.length > 0 && storedSecretList.length > 0 && leakingReplyList.length === 0, leakingReplyList.map(({ routePath, reply }) => `${routePath} ${reply.statusCode}`).join(', '));

	console.log('T1 token refresh still works');
	const refreshedClaims = state.s3Response.authtoken ? jwt.verify(state.s3Response.authtoken, state.harness.tokenSecret, { algorithms: ['HS256'] }) : {};
	check('the reply carries a fresh token naming the saved user', refreshedClaims.user && refreshedClaims.user.refId === userOf(state, 'alice').refId && refreshedClaims.user.first === 'Alicia' && refreshedClaims.user.role === 'user', JSON.stringify(refreshedClaims.user && { refId: refreshedClaims.user.refId, first: refreshedClaims.user.first, role: refreshedClaims.user.role }));
	check('the refreshed token and the authclaims header carry no password hash', state.s3Response.statusCode === 200 && refreshedClaims.user && !('password' in refreshedClaims.user) && !/"password"/.test(state.s3Response.authclaimsText || ''), refreshedClaims.user && Object.keys(refreshedClaims.user).join(','));
	check('the refreshed token signs the next request', state.t1SecondResponse.statusCode === 200, `${state.t1SecondResponse.statusCode}`);

	console.log('L1 a non-text credential at /api/login is refused by name, before any lookup');
	[['object username', state.l1ObjectUsernameLogin], ['object password', state.l1ObjectPasswordLogin], ['array username', state.l1ArrayUsernameLogin]].forEach(([caseName, response]) =>
		check(`${caseName}: 401 identifierNotText, no token for anyone`, response.statusCode === 401 && /identifierNotText/.test(response.bodyText) && !(response.authtoken && (jwt.decode(response.authtoken).user || {}).username), `${response.statusCode} ${response.bodyText}`));

	console.log('T2 a password change signs out every other session');
	check('the token from before the change (the login token) is refused 401 sessionRevoked', state.t2LoginTokenResponse.statusCode === 401 && /sessionRevoked/.test(state.t2LoginTokenResponse.bodyText), `${state.t2LoginTokenResponse.statusCode} ${state.t2LoginTokenResponse.bodyText}`);
	check('a refreshed token from before the change is refused too', state.t2RefreshedTokenResponse.statusCode === 401 && /sessionRevoked/.test(state.t2RefreshedTokenResponse.bodyText), `${state.t2RefreshedTokenResponse.statusCode} ${state.t2RefreshedTokenResponse.bodyText}`);
	check('the changer\'s fresh token (from the change reply) still works', state.t2FreshTokenResponse.statusCode === 200, `${state.t2FreshTokenResponse.statusCode} ${state.t2FreshTokenResponse.bodyText}`);

	console.log('V1 values are text, bounded and well formed');
	check('an object value for an allowed property: refused 400 propertyValueNotText naming first', state.v1ObjectValueResponse.statusCode === 400 && refusalNameOf(state.v1ObjectValueResponse) === 'propertyValueNotText' && /\bfirst\b/.test(state.v1ObjectValueResponse.bodyJson.reason), `${state.v1ObjectValueResponse.statusCode} ${state.v1ObjectValueResponse.bodyText}`);
	check('a 100000-character first name: refused 400 propertyTooLong naming first, before any save', state.v1OversizedResponse.statusCode === 400 && refusalNameOf(state.v1OversizedResponse) === 'propertyTooLong' && /\bfirst\b/.test(state.v1OversizedResponse.bodyJson.reason), `${state.v1OversizedResponse.statusCode} ${String(state.v1OversizedResponse.bodyText).slice(0, 120)}`);
	check('the account is not locked: alice still logs in after the oversized attempt', state.v1LoginAfterOversized.statusCode === 200, `${state.v1LoginAfterOversized.statusCode}`);
	check('a malformed email: refused 400 emailAdrNotValid', state.v1BadEmailResponse.statusCode === 400 && refusalNameOf(state.v1BadEmailResponse) === 'emailAdrNotValid', `${state.v1BadEmailResponse.statusCode} ${state.v1BadEmailResponse.bodyText}`);

	console.log('S5 an apostrophe round-trips byte for byte');
	check(`the first save stores ${APOSTROPHE_FIRST_NAME} exactly`, state.s5FirstSave.statusCode === 200 && state.s5RowAfterFirst && state.s5RowAfterFirst.first === APOSTROPHE_FIRST_NAME, `${state.s5FirstSave.statusCode} stored ${JSON.stringify(state.s5RowAfterFirst && state.s5RowAfterFirst.first)}`);
	check('saving the token\'s value back stores it exactly again (no compounding)', state.s5SecondSave.statusCode === 200 && state.s5RowAfterSecond && state.s5RowAfterSecond.first === APOSTROPHE_FIRST_NAME, `${state.s5SecondSave.statusCode} stored ${JSON.stringify(state.s5RowAfterSecond && state.s5RowAfterSecond.first)}`);
	check(`admin-create-user stores a first name of ${APOSTROPHE_FIRST_NAME} exactly`, !state.h1ApostropheCreate.createError && state.h1ApostropheCreate.createAnswer.user && state.h1ApostropheCreate.createAnswer.user.first === APOSTROPHE_FIRST_NAME, `${state.h1ApostropheCreate.createError} ${JSON.stringify(state.h1ApostropheCreate.createAnswer && state.h1ApostropheCreate.createAnswer.user && state.h1ApostropheCreate.createAnswer.user.first)}`);

	console.log('H1 one hashing rule: a typed password with a colon is hashed on every path');
	const caraRow = state.finalRowList.find((userRow) => userRow.username === 'cara') || {};
	const bobRow = state.finalRowList.find((userRow) => userRow.username === 'bob') || {};
	check('admin-create-user: stored as a hash, not as typed, and it logs in', !state.h1CreateError && caraRow.password !== CARA_COLON_PASSWORD && state.h1CaraLogin.statusCode === 200, `${state.h1CreateError} plaintext=${caraRow.password === CARA_COLON_PASSWORD} login ${state.h1CaraLogin.statusCode}`);
	check('admin-update-user: stored as a hash, not as typed, and it logs in', !state.h1UpdateError && bobRow.password !== BOB_COLON_PASSWORD && state.h1BobLogin.statusCode === 200, `${state.h1UpdateError} plaintext=${bobRow.password === BOB_COLON_PASSWORD} login ${state.h1BobLogin.statusCode}`);

	console.log('W1 the same-second race: only the changer\'s fresh token survives');
	const { w1CutoffSeconds } = state;
	check('setup: the thief\'s token was minted in the same second as the change', iatOf(state.w1ThiefLogin.authtoken) === state.w1ChangeSecond && state.w1Change.statusCode === 200, `thief iat ${iatOf(state.w1ThiefLogin.authtoken)} change second ${state.w1ChangeSecond} change ${state.w1Change.statusCode}`);
	check('the same-second thief token is refused 401 sessionRevoked', state.w1ThiefAfter.statusCode === 401 && /sessionRevoked/.test(state.w1ThiefAfter.bodyText), `${state.w1ThiefAfter.statusCode} ${state.w1ThiefAfter.bodyText}`);
	check('the changer\'s fresh token works, and so does the token after it (never signed below the cutoff)', state.w1ChangerNext.statusCode === 200 && state.w1ChangerNextNext.statusCode === 200 && iatOf(state.w1ChangerNext.authtoken) >= w1CutoffSeconds, `${state.w1ChangerNext.statusCode} ${state.w1ChangerNextNext.statusCode} iat ${iatOf(state.w1ChangerNext.authtoken)} cutoff ${w1CutoffSeconds}`);

	check('a sign-in with the new password in the change\'s own second gets a working token', state.w1LoginRightAfter.statusCode === 200 && state.w1LoginRightAfterSave.statusCode === 200, `login ${state.w1LoginRightAfter.statusCode} (second ${state.w1LoginRightAfterSecond}, cutoff ${w1CutoffSeconds}) then save ${state.w1LoginRightAfterSave.statusCode} ${state.w1LoginRightAfterSave.bodyText.slice(0, 80)}`);

	console.log('W2 an admin password reset ends the user\'s sessions (W1 cutoff long past)');
	check('control: the token works before the reset', state.w2BeforeReset.statusCode === 200, `${state.w2BeforeReset.statusCode} ${state.w2BeforeReset.bodyText.slice(0, 80)}`);
	check('the user\'s token from before the reset is refused 401 sessionRevoked', !state.w2ResetError && state.w2WendyLogin.statusCode === 200 && state.w2AfterReset.statusCode === 401 && /sessionRevoked/.test(state.w2AfterReset.bodyText), `${state.w2ResetError} login ${state.w2WendyLogin.statusCode} after ${state.w2AfterReset.statusCode} ${state.w2AfterReset.bodyText}`);
	check('the reset password logs in', state.w2ResetLogin.statusCode === 200, `${state.w2ResetLogin.statusCode}`);

	console.log('A1 admin saves refuse unknown properties by name');
	check('admin-update-user: refused propertyNotAdminEditable naming disabled', /propertyNotAdminEditable/.test(String(state.a1UpdateError)) && /\bdisabled\b/.test(String(state.a1UpdateError)), String(state.a1UpdateError));
	check('admin-create-user: refused propertyNotAdminEditable naming accessRevokedAfter', /propertyNotAdminEditable/.test(String(state.a1CreateError)) && /\baccessRevokedAfter\b/.test(String(state.a1CreateError)), String(state.a1CreateError));

	console.log('N3 admin-create-user refuses a non-text username by name');
	check('refused identifierNotText', /identifierNotText/.test(String(state.n3CreateError)), String(state.n3CreateError));

	console.log('U1 the username rule refuses by name');
	check('admin-create-user refuses a quoted username: usernameNotAllowed', /usernameNotAllowed/.test(String(state.u1CreateError)), String(state.u1CreateError));
	check('admin-update-user refuses a quoted username: usernameNotAllowed', /usernameNotAllowed/.test(String(state.u1UpdateError)), String(state.u1UpdateError));

	console.log('B1 the browser sends only what the server allows');
	const rulesFilePath = path.join(SERVER_PATH, 'lib', 'user-profile-rules.json');
	const serverPropertyList = fs.existsSync(rulesFilePath) ? JSON.parse(fs.readFileSync(rulesFilePath, 'utf8')).selfEditablePropertyList : undefined;
	const storeSourceText = fs.readFileSync(path.join(HTML_PATH, 'stores', 'loginStore.js'), 'utf8');
	const storeListMatch = storeSourceText.match(/SELF_EDITABLE_PROPERTY_LIST\s*=\s*(\[[^\]]*\])/);
	const browserPropertyList = storeListMatch ? JSON.parse(storeListMatch[1].replace(/'/g, '"')) : undefined;
	check('loginStore.js SELF_EDITABLE_PROPERTY_LIST equals lib/user-profile-rules.json selfEditablePropertyList', Array.isArray(serverPropertyList) && JSON.stringify(browserPropertyList) === JSON.stringify(serverPropertyList), `browser ${JSON.stringify(browserPropertyList)} server ${JSON.stringify(serverPropertyList)}`);

	console.log(`\n${passCount} passed, ${failCount} failed`);
	state.harness.close();
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	process.exit(failCount === 0 ? 0 : 1);
};

const runSteps = (remainingList, state) => {
	if (!remainingList.length) {
		report(state);
		return;
	}
	const [oneStep, ...restList] = remainingList;
	oneStep(state, (nextState) => runSteps(restList, nextState));
};

runSteps(stepList, {});
