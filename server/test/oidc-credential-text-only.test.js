#!/usr/bin/env node
'use strict';

// oidc-credential-text-only.test.js — review SF-1 of WORKORDER-userSqlAndSaveHole-111026, the OIDC half. The OAuth/OIDC
// login form (POST /oauth/interaction/:uid/login) passed body.username straight to oidc-verify-credential, whose lookup
// escapes it with safeSql. An OBJECT username escapes to `username` = 1, so WHERE username = `username` = 1 matched every
// row and the newest user was signed in on that user's password alone. startApiServer parses BOTH JSON and urlencoded
// bodies on every route, so the form accepts { "username": { "username": 1 } } as JSON.
//
// Driven END TO END on the real modules of one server tree (lib/oauth-*.js and the oidc-verify-credential access point),
// mounted as startApiServer mounts them, against a scratch sqlite file and a throwaway signing-key file. A scripted PKCE
// client starts an authorization, reads the login page's csrf, and posts the form.
//   O1  a non-text username or password (JSON object, JSON array, urlencoded bracket form) is refused by name (400
//       identifierNotText on the page) and no login is recorded: the flow does not move on to consent
//   O2  the real credentials still sign in (control: the flow moves on)
//   M1  review SF-4: an MCP bearer token issued BEFORE the user's password change is refused by the real bearer gate
//       (user access revoked); the same token passes the gate before the change (control). The change goes through the
//       real user-save-data access point, which stamps users.accessRevokedAfter.
//
// USER_HOLE_SERVER_PATH=<server dir> points it at another tree (the pinned base, to watch it fail).
//
//   /Users/tqwhite/.local/node/bin/node server/test/oidc-credential-text-only.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const SERVER_PATH = process.env.USER_HOLE_SERVER_PATH ? path.resolve(process.env.USER_HOLE_SERVER_PATH) : path.join(__dirname, '..');
const ALICE_PASSWORD = 'alice-Kestrel-4417';
const BOB_PASSWORD = 'bob-Kestrel-4417';
const BOB_NEW_PASSWORD = 'bob-Heron-5528';
// iat is whole seconds and iat >= cutoff passes, so the change waits a little over a second after the token is minted
const ONE_SECOND_AND_A_LITTLE_MS = 1100;
const SEED_USER_LIST = [
	{ username: 'alice', password: ALICE_PASSWORD, first: 'Alice', last: 'Able', emailAdr: 'alice@example.org', phone: '', source: 'test', role: 'user' },
	{ username: 'bob', password: BOB_PASSWORD, first: 'Bob', last: 'Boss', emailAdr: 'bob@example.org', phone: '', source: 'test', role: 'admin' },
];
const CLIENT_ID = 'oidc-text-only-test-client';
const SCOPE_TEXT = 'openid offline_access dme:read';

process.global = {
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, debug: () => {}, result: () => {}, color: { magentaBright: (text) => text } },
	getConfig: () => ({}),
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {}, fileList: [] },
};

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

const express = require(require.resolve('express', { paths: [SERVER_PATH] }));
const bodyParser = require(require.resolve('body-parser', { paths: [SERVER_PATH] }));
const passwordTools = require(path.join(SERVER_PATH, 'data-model', 'lib', 'password-hash'))();
const dataMapping = require(path.join(SERVER_PATH, 'data-model', 'data-mapping', 'data-mapping'))(passwordTools);
const sqlDbGen = require(path.join(SERVER_PATH, 'data-model', 'lib', 'sqlite-instance'))({});
const libModuleOf = (moduleFileName) => require(path.join(SERVER_PATH, 'lib', moduleFileName));
const makeAdapter = libModuleOf('oauth-adapter');
const makeKeys = libModuleOf('oauth-keys');
const makeProvider = libModuleOf('oauth-provider');
const makeInteractions = libModuleOf('oauth-interactions');
const makeThrottle = libModuleOf('oauth-throttle');
const makeAudit = libModuleOf('oauth-audit');
const makeMcpVerifier = libModuleOf('oauth-mcp-verifier');
const makeValidators = libModuleOf('oauth-token-validators');
const makeBearerGate = libModuleOf('oauth-bearer-gate');

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'oidcTextOnlyTest-'));
const b64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---- a cookie-jar client; no automatic redirects
const cookieJar = {};
const takeCookies = (headerObject) => (headerObject['set-cookie'] || []).forEach((cookieLine) => {
	const [pairText] = cookieLine.split(';');
	const splitIndex = pairText.indexOf('=');
	const cookieName = pairText.slice(0, splitIndex).trim();
	const cookieValue = pairText.slice(splitIndex + 1).trim();
	if (cookieValue === '') {
		delete cookieJar[cookieName];
	} else {
		cookieJar[cookieName] = cookieValue;
	}
});
const sendRequest = ({ method, url, formText, jsonBody }, callback) => {
	const requestUrl = new URL(url);
	const bodyText = jsonBody !== undefined ? JSON.stringify(jsonBody) : formText;
	const headerObject = {};
	if (Object.keys(cookieJar).length) {
		headerObject.Cookie = Object.entries(cookieJar).map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`).join('; ');
	}
	if (bodyText !== undefined) {
		headerObject['Content-Type'] = jsonBody !== undefined ? 'application/json' : 'application/x-www-form-urlencoded';
		headerObject['Content-Length'] = Buffer.byteLength(bodyText);
	}
	const httpRequest = http.request({ method, hostname: requestUrl.hostname, port: requestUrl.port, path: requestUrl.pathname + requestUrl.search, headers: headerObject }, (httpResponse) => {
		const chunkList = [];
		httpResponse.on('data', (chunk) => chunkList.push(chunk));
		httpResponse.on('end', () => {
			takeCookies(httpResponse.headers);
			callback({ statusCode: httpResponse.statusCode, headers: httpResponse.headers, bodyText: Buffer.concat(chunkList).toString('utf8') });
		});
	});
	httpRequest.on('error', (requestError) => callback({ statusCode: 0, headers: {}, bodyText: requestError.message }));
	if (bodyText !== undefined) {
		httpRequest.write(bodyText);
	}
	httpRequest.end();
};
const csrfOf = (pageText) => (pageText.match(/name="csrf" value="([^"]+)"/) || [])[1];
const interactionUidOf = (locationText) => ((locationText || '').match(/interaction\/([^/?]+)/) || [])[1];

// ---- one login attempt on a fresh authorization: authorize -> login page -> POST the given body
const attemptLogin = ({ issuerUrl, bodyOfCsrf, asJson }, callback) => {
	const codeVerifier = b64url(crypto.randomBytes(32));
	const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
	const authorizeUrl = `${issuerUrl}/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(`${issuerUrl}/cb`)}&scope=${encodeURIComponent(SCOPE_TEXT)}&code_challenge=${codeChallenge}&code_challenge_method=S256&resource=${encodeURIComponent(`${issuerUrl}/mcp`)}&state=xyz`;
	sendRequest({ method: 'GET', url: authorizeUrl }, (authorizeResponse) => {
		const interactionUid = interactionUidOf(authorizeResponse.headers.location);
		if (!interactionUid) {
			callback({ statusCode: 0, bodyText: `no interaction redirect: ${authorizeResponse.statusCode} ${authorizeResponse.bodyText.slice(0, 200)}`, headers: {} });
			return;
		}
		sendRequest({ method: 'GET', url: `${issuerUrl}/oauth/interaction/${interactionUid}` }, (loginPage) => {
			const csrfToken = csrfOf(loginPage.bodyText);
			const loginUrl = `${issuerUrl}/oauth/interaction/${interactionUid}/login`;
			const requestBody = bodyOfCsrf(csrfToken);
			if (asJson) {
				sendRequest({ method: 'POST', url: loginUrl, jsonBody: requestBody }, callback);
			} else {
				sendRequest({ method: 'POST', url: loginUrl, formText: requestBody }, callback);
			}
		});
	});
};
// the login is accepted when the form answers a redirect back into the provider (on to consent); refused = a page again
const isLoginAccepted = (response) => [302, 303].includes(response.statusCode);
const refIdByUsername = {};

// ---- the whole authorization-code flow for one user, as a browser would walk it: -> { accessToken } or { failureText }
const obtainAccessToken = ({ issuerUrl, username, password }, callback) => {
	const codeVerifier = b64url(crypto.randomBytes(32));
	const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
	const redirectUri = `${issuerUrl}/cb`;
	const absoluteOf = (locationText) => (/^https?:/.test(locationText) ? locationText : `${issuerUrl}${locationText}`);
	const followStep = (method, url, formText, hopCount) => sendRequest({ method, url, formText }, (response) => {
		if (hopCount > 20) {
			callback({ failureText: 'too many hops' });
			return;
		}
		if ([302, 303].includes(response.statusCode)) {
			const nextUrl = absoluteOf(response.headers.location);
			if (nextUrl.startsWith(`${redirectUri}?`)) {
				const authorizationCode = new URL(nextUrl).searchParams.get('code');
				sendRequest({ method: 'POST', url: `${issuerUrl}/oauth/token`, formText: new URLSearchParams({ grant_type: 'authorization_code', code: authorizationCode, redirect_uri: redirectUri, client_id: CLIENT_ID, code_verifier: codeVerifier }).toString() }, (tokenResponse) => {
					const tokenAnswer = /^\s*\{/.test(tokenResponse.bodyText) ? JSON.parse(tokenResponse.bodyText) : {};
					callback(tokenAnswer.access_token ? { accessToken: tokenAnswer.access_token } : { failureText: `token ${tokenResponse.statusCode} ${tokenResponse.bodyText.slice(0, 160)}` });
				});
				return;
			}
			followStep('GET', nextUrl, undefined, hopCount + 1);
			return;
		}
		const interactionUid = ((response.bodyText.match(/interaction\/([^/?"]+)\/(?:login|confirm)/) || [])[1]) || interactionUidOf(url);
		if (response.statusCode === 200 && /name="password"/.test(response.bodyText)) {
			followStep('POST', `${issuerUrl}/oauth/interaction/${interactionUid}/login`, new URLSearchParams({ username, password, csrf: csrfOf(response.bodyText) }).toString(), hopCount + 1);
			return;
		}
		if (response.statusCode === 200 && /\/confirm/.test(response.bodyText)) {
			followStep('POST', `${issuerUrl}/oauth/interaction/${interactionUid}/confirm`, new URLSearchParams({ decision: 'allow', csrf: csrfOf(response.bodyText) }).toString(), hopCount + 1);
			return;
		}
		callback({ failureText: `stopped at ${response.statusCode} ${url} ${response.bodyText.replace(/<[^>]+>/g, ' ').slice(0, 160)}` });
	});
	followStep('GET', `${issuerUrl}/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(SCOPE_TEXT)}&code_challenge=${codeChallenge}&code_challenge_method=S256&resource=${encodeURIComponent(`${issuerUrl}/mcp`)}&state=m1`, undefined, 0);
};

const caseList = [
	{ caseName: 'JSON object username, the newest user\'s password', asJson: true, bodyOfCsrf: (csrfToken) => ({ username: { username: 1 }, password: BOB_PASSWORD, csrf: csrfToken }), expectAccepted: false },
	{ caseName: 'JSON array username', asJson: true, bodyOfCsrf: (csrfToken) => ({ username: ['bob'], password: BOB_PASSWORD, csrf: csrfToken }), expectAccepted: false },
	{ caseName: 'JSON object password', asJson: true, bodyOfCsrf: (csrfToken) => ({ username: 'bob', password: { length: 1 }, csrf: csrfToken }), expectAccepted: false },
	{ caseName: 'urlencoded bracket username (username[username]=1)', asJson: false, bodyOfCsrf: (csrfToken) => `username%5Busername%5D=1&password=${encodeURIComponent(BOB_PASSWORD)}&csrf=${encodeURIComponent(csrfToken)}`, expectAccepted: false },
	{ caseName: 'control: the real username and password (urlencoded, as the page posts it)', asJson: false, bodyOfCsrf: (csrfToken) => `username=bob&password=${encodeURIComponent(BOB_PASSWORD)}&csrf=${encodeURIComponent(csrfToken)}`, expectAccepted: true },
];

sqlDbGen.initDatabaseInstance(path.join(scratchDirPath, 'users.sqlite3'), (dbError, sqlDb) => {
	if (dbError) {
		console.log(`FAIL scratch database: ${dbError}`);
		process.exit(1);
	}
	sqlDb.getTable('users', (tableError, userTable) => {
		const seedNext = (remainingList, seedDone) => {
			if (!remainingList.length) {
				seedDone();
				return;
			}
			const [seedUser, ...restList] = remainingList;
			userTable.saveObject({ ...seedUser, password: passwordTools.hashPassword(seedUser.password) }, { suppressStatementLog: true }, (seedError, seededRefId) => {
				refIdByUsername[seedUser.username] = seededRefId;
				seedNext(restList, seedDone);
			});
		};
		seedNext(SEED_USER_LIST, () => {
			const accessPointByName = {};
			['oidc-verify-credential', 'user-save-data'].forEach((accessPointName) => require(path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d', accessPointName))({ dotD: { logList: [], library: { add: (addedName, serviceFunction) => { accessPointByName[addedName] = serviceFunction; } } }, passThroughParameters: { sqlDb, hxAccess: {}, dataMapping } }));
			// the provider re-reads the account by its refId (sub); escaped here, never interpolated
			const sqlString = require(require.resolve('sqlstring-sqlite', { paths: [SERVER_PATH] }));
			const loadAccountBySub = (subjectRefId) => new Promise((resolve) => userTable.getData(`SELECT refId, username, role FROM <!tableName!> WHERE refId = ${sqlString.escape(String(subjectRefId))}`, { suppressStatementLog: true }, (readError, rowList = []) => resolve(rowList[0] ? { sub: rowList[0].refId, username: rowList[0].username, role: rowList[0].role } : null)));
			const expressApp = express();
			// as startApiServer: JSON and urlencoded bodies on every route
			expressApp.use(bodyParser.json());
			expressApp.use(bodyParser.urlencoded({ extended: true }));
			const httpServer = expressApp.listen(0, '127.0.0.1', () => {
				const issuerUrl = `http://127.0.0.1:${httpServer.address().port}`;
				// as startApiServer: the OAuth schema (users.disabled, users.accessRevokedAfter, ...) before the AS mounts
				libModuleOf('oauth-schema-init')({ sqlDb })((schemaError) => makeAdapter({ sqlDb })((adapterError, { Adapter } = {}) => {
					if (schemaError) {
						console.log(`FAIL oauth schema: ${schemaError}`);
						process.exit(1);
					}
					makeAudit({ sqlDb })((auditError, audit) => {
						if (adapterError || auditError) {
							console.log(`FAIL oauth assembly: ${adapterError || auditError}`);
							process.exit(1);
						}
						const { jwks, resolvePublicKey } = makeKeys({ keyFilePath: path.join(scratchDirPath, 'signing-keys.json') });
						const { provider } = makeProvider({
							issuer: issuerUrl, mcpResource: `${issuerUrl}/mcp`, Adapter, jwks, cookieKeys: ['test-cookie-1', 'test-cookie-0'], cookieSecure: false, loadAccountBySub,
							staticClients: [{ client_id: CLIENT_ID, client_name: 'Text-only test client', redirect_uris: [`${issuerUrl}/cb`], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPE_TEXT }],
						});
						// a high failure ceiling: the refusals must not lock the control out
						const throttle = makeThrottle({ maxFailures: 100, windowMs: 60000, lockoutMs: 60000 });
						makeInteractions({ provider, credentialHook: accessPointByName['oidc-verify-credential'], throttle, audit, interactionPath: '/oauth/interaction', csrfSecret: 'oidc-text-only-test-csrf' })({ expressApp });
						expressApp.get('/cb', (xReq, xRes) => xRes.send('callback'));
						const oidcHandler = provider.callback();
						expressApp.use((xReq, xRes, next) => (/^\/(oauth\/|\.well-known\/)/.test(xReq.path) && !xReq.path.startsWith('/oauth/interaction') ? oidcHandler(xReq, xRes) : next()));
						const runCase = (remainingList) => {
							if (!remainingList.length) {
								runMcpRevocation(() => {
									console.log(`\n${passCount} passed, ${failCount} failed`);
									httpServer.close();
									fs.rmSync(scratchDirPath, { recursive: true, force: true });
									process.exit(failCount === 0 ? 0 : 1);
								});
								return;
							}
							const [oneCase, ...restList] = remainingList;
							attemptLogin({ issuerUrl, bodyOfCsrf: oneCase.bodyOfCsrf, asJson: oneCase.asJson }, (response) => {
								if (oneCase.expectAccepted) {
									check(`O2 ${oneCase.caseName}: accepted, the flow moves on`, isLoginAccepted(response), `${response.statusCode} ${response.bodyText.slice(0, 160)}`);
								} else {
									check(`O1 ${oneCase.caseName}: refused 400 by name (identifierNotText), no login`, !isLoginAccepted(response) && response.statusCode === 400 && /identifierNotText/.test(response.bodyText), `${response.statusCode} ${response.headers.location || ''} ${response.bodyText.replace(/<[^>]+>/g, ' ').slice(0, 160)}`);
								}
								runCase(restList);
							});
						};
						// M1: an MCP bearer token from before a password change, through the real verifier and bearer gate
						const { verifyMcpAccessToken } = makeValidators();
						const { verifyBearer } = makeMcpVerifier({ resolvePublicKey, expectedAudience: `${issuerUrl}/mcp`, verifyMcpAccessToken });
						const { checkBearer } = makeBearerGate({ getOauthContext: () => ({ verifyBearer, sqlDb }) });
						const bearerVerdictOf = (accessToken, verdictDone) => checkBearer({ headers: { authorization: `Bearer ${accessToken}` } }, (rejectReason) => verdictDone(rejectReason || ''));
						const runMcpRevocation = (flowDone) => obtainAccessToken({ issuerUrl, username: 'bob', password: BOB_PASSWORD }, ({ accessToken, failureText }) => {
							check('M1 setup: an MCP access token is issued to bob through the whole flow', !!accessToken, failureText);
							if (!accessToken) {
								flowDone();
								return;
							}
							bearerVerdictOf(accessToken, (beforeReason) => {
								check('M1 control: before the password change the bearer gate admits the token', beforeReason === '', beforeReason);
								setTimeout(() => accessPointByName['user-save-data']({ refId: refIdByUsername.bob, password: BOB_NEW_PASSWORD, currentPassword: BOB_PASSWORD }, (saveError) => {
									check('M1 setup: bob\'s password change saves', !saveError, saveError);
									bearerVerdictOf(accessToken, (afterReason) => {
										check('M1 the token from before the change is refused by the bearer gate (user access revoked)', /user access revoked/.test(afterReason), afterReason || 'admitted');
										flowDone();
									});
								}), ONE_SECOND_AND_A_LITTLE_MS);
							});
						});
						console.log(`server tree under test: ${SERVER_PATH}`);
						runCase(caseList);
					});
				}));
			});
		});
	});
});
