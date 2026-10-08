'use strict';
// login-post-and-log-redaction.test.js — the login keeps credentials out of the logs (2026-10-08).
//   Part 1 (hermetic): redactLoggedQuery never prints a credential-looking value, and leaves other values readable.
//   Part 2 (live, against the running API on 127.0.0.1:7790): POST /api/login with the credentials in the body logs in;
//   a POST with the credentials only in the query string is refused (the body is the only POST credential path);
//   GET /api/login still logs in for old callers.
// The live part reads its login from DME_TEST_USERNAME / DME_TEST_PASSWORD (never a literal) and is skipped by name when
// they are unset.
//
// Run: node server/test/login-post-and-log-redaction.test.js

const http = require('http');
const { redactLoggedQuery } = require('../lib/redact-logged-query');

const resultList = [];
const ok = (checkName, passed) => resultList.push({ checkName, passed: !!passed });

// Part 1 -------------------------------------------------------------------------
const redactedLoginText = redactLoggedQuery({ username: 'someone', password: 'not-for-logs' });
ok('password value is not printed', !redactedLoginText.includes('not-for-logs'));
ok('username stays readable', redactedLoginText.includes('username=someone'));
ok('secret, token, key and auth keys are redacted', ['clientSecret', 'accessToken', 'apiKey', 'authCode'].every((keyName) => !redactLoggedQuery({ [keyName]: 'hidden-value' }).includes('hidden-value')));
ok('an empty query prints nothing', redactLoggedQuery({}) === '');

// Part 2 -------------------------------------------------------------------------
const loginUsername = process.env.DME_TEST_USERNAME;
const loginPassword = process.env.DME_TEST_PASSWORD;

const requestLogin = ({ method, pathText, bodyObject }, callback) => {
	const bodyText = bodyObject ? JSON.stringify(bodyObject) : undefined;
	const request = http.request(
		{ host: '127.0.0.1', port: 7790, method, path: pathText, headers: bodyText ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyText) } : {}, timeout: 20000 },
		(response) => {
			response.resume();
			response.on('end', () => callback('', { statusCode: response.statusCode, authToken: response.headers.authtoken }));
		},
	);
	request.on('error', (err) => callback(err));
	if (bodyText) request.write(bodyText);
	request.end();
};

const finish = () => {
	console.log('\n=== login POST and log redaction ===\n');
	resultList.forEach(({ checkName, passed }) => console.log(`${passed ? 'PASS' : 'FAIL'} - ${checkName}`));
	const failedCount = resultList.filter(({ passed }) => !passed).length;
	console.log(`\n=== Results: ${resultList.length - failedCount} passed, ${failedCount} failed ===\n`);
	process.exit(failedCount === 0 ? 0 : 1);
};

if (!loginUsername || !loginPassword) {
	console.log('live part SKIPPED: DME_TEST_USERNAME / DME_TEST_PASSWORD are not set');
	finish();
} else {
	const encodedQueryText = `username=${encodeURIComponent(loginUsername)}&password=${encodeURIComponent(loginPassword)}`;
	requestLogin({ method: 'POST', pathText: '/api/login', bodyObject: { username: loginUsername, password: loginPassword } }, (postErr, postResult) => {
		ok('POST with credentials in the body logs in', !postErr && postResult.statusCode === 200 && postResult.authToken);
		requestLogin({ method: 'POST', pathText: `/api/login?${encodedQueryText}`, bodyObject: {} }, (queryPostErr, queryPostResult) => {
			ok('POST with credentials only in the query string is refused', !queryPostErr && queryPostResult.statusCode === 401);
			requestLogin({ method: 'GET', pathText: `/api/login?${encodedQueryText}` }, (getErr, getResult) => {
				ok('GET login still works for old callers', !getErr && [200, 304].includes(getResult.statusCode) && getResult.authToken);
				finish();
			});
		});
	});
}
