'use strict';
// edc-resolver-shell.test.js — the parts of the edc: resolver endpoint that need no store (edcResolverEndpoint-110226). The resolver's answers themselves are gate G2, against a store copy.
//   1. declareTokenTolerantPathPrefix: under '/api/edc/' a bad token reads as no token; on '/api/edcOther', and on every other route, it is still refused;
//      a malformed prefix is refused by name.
//   2. htmlAnswer: json is the stub's exact bytes; every value on a page is escaped; a w3id link is rewritten under the public prefix, its query kept.
//   3. forgeAdapter: every absent or bad config value is refused by name, with no forge tree needed.
// No server, no database. Run: node server/test/edc-resolver-shell.test.js

const path = require('path');
const jwt = require('jsonwebtoken');
require('qtools-functional-library');

const TEST_SECRET = 'edc-resolver-shell-test-secret';
process.global = {
	getConfig: () => ({ secret: TEST_SECRET, authsecondsexpirationseconds: 600 }),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount++; console.log(`  PASS: ${testName}`); return; }
	failedCount++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const userByUsername = ({ username }, callback) => callback('', username === 'knownUser' ? { username } : undefined);
const tokenTools = require('../lib/access-token-header-tools')({ expressApp: {}, userByUsername });
const { answerTextFor } = require('../lib/edc-resolver/htmlAnswer');
const { openForgeAdapter } = require('../lib/edc-resolver/forgeAdapter');

tokenTools.declareTokenTolerantPathPrefix('/api/edc/');

const checkToken = ({ requestPath, authorizationText }, callback) => {
	const appValueByName = {};
	const xReq = { path: requestPath, headers: { authorization: authorizationText }, appValueSetter: (valueName, valueToSet) => { appValueByName[valueName] = valueToSet; }, appValueGetter: (valueName) => appValueByName[valueName] };
	tokenTools.hasValidToken(xReq, (tokenError) => callback({ tokenError, authclaims: appValueByName.authclaims }));
};

const TOKEN_CASE_LIST = [
	{ caseName: 'a garbled token under the prefix', requestPath: '/api/edc/scheme', authorizationText: 'Bearer not.a.jwt', judge: ({ tokenError, authclaims }) => !tokenError && authclaims.noToken === true },
	{ caseName: 'a garbled token at the bare route', requestPath: '/api/edc', authorizationText: 'Bearer not.a.jwt', judge: ({ tokenError, authclaims }) => !tokenError && authclaims.noToken === true },
	{ caseName: 'an expired token under the prefix', requestPath: '/api/edc/layer/jev', authorizationText: `Bearer ${jwt.sign({ user: { username: 'knownUser' } }, TEST_SECRET, { expiresIn: -10 })}`, judge: ({ tokenError, authclaims }) => !tokenError && authclaims.noToken === true },
	{ caseName: 'a valid token under the prefix keeps its claims', requestPath: '/api/edc/scheme', authorizationText: `Bearer ${jwt.sign({ user: { username: 'knownUser' } }, TEST_SECRET)}`, judge: ({ tokenError, authclaims }) => !tokenError && authclaims.noToken === undefined && authclaims.user.username === 'knownUser' },
	{ caseName: 'RED TWIN: a look-alike path is still refused', requestPath: '/api/edcOther', authorizationText: 'Bearer not.a.jwt', judge: ({ tokenError }) => /token error/.test(tokenError) },
	{ caseName: 'RED TWIN: another route is still refused', requestPath: '/api/forged-use-cases', authorizationText: 'Bearer not.a.jwt', judge: ({ tokenError }) => /token error/.test(tokenError) },
];

const runTokenCase = (caseIndex, whenDone) => {
	if (caseIndex >= TOKEN_CASE_LIST.length) { whenDone(); return; }
	const oneCase = TOKEN_CASE_LIST[caseIndex];
	checkToken(oneCase, (checked) => {
		ok(oneCase.caseName, oneCase.judge(checked), JSON.stringify(checked));
		runTokenCase(caseIndex + 1, whenDone);
	});
};

const refusalTextOf = (declareCall) => {
	try { declareCall(); return ''; } catch (thrown) { return thrown.message; }
};

runTokenCase(0, () => {
	ok('a prefix without a trailing slash is refused by name', /must be an absolute path ending/.test(refusalTextOf(() => tokenTools.declareTokenTolerantPathPrefix('/api/edc'))));

	const baseIri = 'https://w3id.org/EDUcore/';
	const hostileBody = { kind: '<script>alert(1)</script>', next: `${baseIri}manifests?page=2`, nested: { listed: [`${baseIri}layer/jev"><img src=x>`] }, error: '<b>refused</b>', other: 'https://elsewhere.example/x' };
	const pageText = answerTextFor({ answerFormat: 'html', httpStatus: 451, answerBody: hostileBody, edcIri: `${baseIri}a<script>`, publicPathPrefix: '/edc/', baseIri });
	ok('json is the stub\'s exact text', answerTextFor({ answerFormat: 'json', answerBody: { a: 1 } }) === '{\n  "a": 1\n}\n');
	ok('no raw markup from a value reaches the page', !/<script>|<img |<b>refused/.test(pageText));
	ok('the status is on the page', pageText.includes('HTTP 451'));
	ok('a w3id link is rewritten under the public prefix, its query kept', pageText.includes('<a href="/edc/manifests?page=2">'));
	ok('a nested w3id value is linked, escaped', pageText.includes('href="/edc/layer/jev&quot;&gt;&lt;img src=x&gt;"'));
	ok('a value outside the scheme is not linked', !pageText.includes('href="https://elsewhere'));
	ok('a page with no scheme known still renders its refusal', /forge is off/.test(answerTextFor({ answerFormat: 'html', httpStatus: 503, answerBody: { error: 'the forge is off' } })));

	const COMPLETE_CONFIG = { educoreForgeCodePath: '/nowhere/forge', uriContractFilePath: '/nowhere/store', publicPathPrefix: '/edc/', wholeBlockMaxBytes: '1', wholeBlockMaxOldSpaceMegabytes: '1', wholeBlockTimeoutMilliseconds: '1' };
	ok('no section at all is refused by name', /does not give educoreForgeCodePath/.test(openForgeAdapter({ configValues: { _segmentName: 'edc-resolver' } }).refusalText));
	ok('one absent value is refused, naming it', /does not give publicPathPrefix;/.test(openForgeAdapter({ configValues: { ...COMPLETE_CONFIG, publicPathPrefix: '' } }).refusalText));
	ok('a cap that is no number is refused, naming it', /wholeBlockMaxBytes must be positive/.test(openForgeAdapter({ configValues: { ...COMPLETE_CONFIG, wholeBlockMaxBytes: 'lots' } }).refusalText));
	ok('an absent forge tree is refused by path', /educoreForgeCodePath \/nowhere\/forge does not exist/.test(openForgeAdapter({ configValues: COMPLETE_CONFIG }).refusalText));

	console.log(`edc-resolver-shell: ${passedCount} passed, ${failedCount} failed`);
	process.exit(failedCount === 0 ? 0 : 1);
});
