'use strict';
// public-download-token-tolerance.test.js — the downloads are public (TQ, 2026-10-30: "all public"), and a visitor whose
// browser still holds a stale, expired or garbled token must be served, not refused. The global hasValidToken middleware
// refuses a bad Authorization header (401) before any route runs, so the four download endpoints DECLARE their routes
// token-tolerant (accessTokenHeaderTools.declareTokenTolerantRoute), and on exactly those routes a bad token is read as
// no token: authclaims become the anonymous { noToken, user: { role: 'public' } }. Nowhere else.
//   1. CONTRACT: exactly the four download endpoints declare a token-tolerant route; no other endpoint source does;
//   2. on each download route a garbled token, 'Bearer undefined', an expired token and a token signed with another
//      secret are each read as no token (no error, role 'public');
//   3. a valid token on a download route keeps its own claims (a signed-in person is not demoted);
//   4. RED TWINS: the same garbled token is still refused on a non-download route (forged-use-cases, dme-cypher-query),
//      on a download route's trailing-slash or upper-case spelling, and on a download route nobody declared.
//
// No server, no database. Run: node server/test/public-download-token-tolerance.test.js

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('qtools-functional-library'); // hasValidToken calls authclaims.qtGetSurePath, as the server has it loaded

const TEST_SECRET = 'public-download-token-tolerance-test-secret';
process.global = {
	getConfig: () => ({ secret: TEST_SECRET, authsecondsexpirationseconds: 600 }),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const CODE_ROOT_PATH = path.join(__dirname, '..', '..');
const ENDPOINTS_DIR_PATH = path.join(CODE_ROOT_PATH, 'server/endpoints-dot-d/qtDotLib.d');
const TOKEN_TOOLS_PATH = path.join(CODE_ROOT_PATH, 'server/lib/access-token-header-tools.js');

const DOWNLOAD_ENDPOINT_NAME_LIST = Object.freeze(['standard-downloads-manifest', 'standard-downloads-file', 'standard-downloads-publications', 'standard-downloads-publication-file']);
const DOWNLOAD_ROUTE_PATH_LIST = Object.freeze(DOWNLOAD_ENDPOINT_NAME_LIST.map((endpointName) => `/api/${endpointName}`));
const KNOWN_USERNAME = 'tolerance-test-user';

const userByUsername = ({ username }, callback) => callback('', username === KNOWN_USERNAME ? { username } : undefined);

// the token tools as the server builds them, with the four download endpoints registered against them
const makeTokenToolsWithDownloadEndpoints = () => {
	const accessTokenHeaderTools = require(TOKEN_TOOLS_PATH)({ expressApp: {}, userByUsername });
	DOWNLOAD_ENDPOINT_NAME_LIST.forEach((endpointName) => {
		require(path.join(ENDPOINTS_DIR_PATH, `${endpointName}.js`))({
			dotD: { logList: [] },
			passThroughParameters: { expressApp: { post: () => {} }, accessTokenHeaderTools, accessPointsDotD: {}, routingPrefix: '/api/' },
		});
	});
	return accessTokenHeaderTools;
};

// one request through hasValidToken: answers { tokenError, authclaims }
const checkToken = (accessTokenHeaderTools, { requestPath, authorizationText }, callback) => {
	const appValueByName = {};
	const xReq = {
		path: requestPath,
		headers: authorizationText === undefined ? {} : { authorization: authorizationText },
		appValueSetter: (valueName, valueToSet) => { appValueByName[valueName] = valueToSet; },
		appValueGetter: (valueName) => appValueByName[valueName],
	};
	accessTokenHeaderTools.hasValidToken(xReq, (tokenError) => callback({ tokenError, authclaims: appValueByName.authclaims }));
};

const isAnonymous = ({ tokenError, authclaims }) => !tokenError && !!authclaims && authclaims.noToken === true && authclaims.user && authclaims.user.role === 'public';

const BAD_TOKEN_CASE_LIST = Object.freeze([
	{ caseName: 'a garbled token', authorizationText: 'Bearer not.a.jwt' },
	{ caseName: "'Bearer undefined'", authorizationText: 'Bearer undefined' },
	{ caseName: 'an expired token', authorizationText: `Bearer ${jwt.sign({ user: { username: KNOWN_USERNAME, role: 'user' }, exp: Math.floor(Date.now() / 1000) - 60 }, TEST_SECRET)}` },
	{ caseName: 'a token signed with another secret', authorizationText: `Bearer ${jwt.sign({ user: { username: KNOWN_USERNAME, role: 'user' } }, 'some-other-secret')}` },
]);
const VALID_TOKEN_TEXT = `Bearer ${jwt.sign({ user: { username: KNOWN_USERNAME, role: 'user' } }, TEST_SECRET, { expiresIn: 600 })}`;

console.log('\n=== public downloads: a bad token is read as no token on the download routes, and only there ===\n');

// ---- 1. contract
const declaringEndpointNameList = fs.readdirSync(ENDPOINTS_DIR_PATH, { withFileTypes: true })
	.filter((oneEntry) => oneEntry.isFile() && /\.js$/.test(oneEntry.name))
	.filter((oneEntry) => /declareTokenTolerantRoute\(/.test(fs.readFileSync(path.join(ENDPOINTS_DIR_PATH, oneEntry.name), 'utf8')))
	.map((oneEntry) => oneEntry.name.replace(/\.js$/, ''))
	.sort();
const nestedDeclaringList = fs.readdirSync(ENDPOINTS_DIR_PATH, { withFileTypes: true })
	.filter((oneEntry) => oneEntry.isDirectory())
	.flatMap((oneEntry) => fs.readdirSync(path.join(ENDPOINTS_DIR_PATH, oneEntry.name)).filter((fileName) => /\.js$/.test(fileName)).map((fileName) => path.join(oneEntry.name, fileName)))
	.filter((relativePath) => /declareTokenTolerantRoute\(/.test(fs.readFileSync(path.join(ENDPOINTS_DIR_PATH, relativePath), 'utf8')));
ok('CONTRACT: exactly the four download endpoints declare a token-tolerant route', JSON.stringify(declaringEndpointNameList) === JSON.stringify([...DOWNLOAD_ENDPOINT_NAME_LIST].sort()) && nestedDeclaringList.length === 0, `declaring: ${declaringEndpointNameList.join(', ') || 'none'}; nested: ${nestedDeclaringList.join(', ') || 'none'}`);

const toolsWithDownloads = makeTokenToolsWithDownloadEndpoints();
const toolsWithNothingDeclared = require(TOKEN_TOOLS_PATH)({ expressApp: {}, userByUsername });

const stepList = [];

// ---- 2. bad tokens on the download routes
DOWNLOAD_ROUTE_PATH_LIST.forEach((routePath) => BAD_TOKEN_CASE_LIST.forEach(({ caseName, authorizationText }) => stepList.push((next) => checkToken(toolsWithDownloads, { requestPath: routePath, authorizationText }, (answer) => {
	ok(`${routePath}: ${caseName} is read as no token (role public)`, isAnonymous(answer), `error: ${answer.tokenError}; claims: ${JSON.stringify(answer.authclaims)}`);
	next();
}))));

// ---- 3. a valid token keeps its claims
DOWNLOAD_ROUTE_PATH_LIST.forEach((routePath) => stepList.push((next) => checkToken(toolsWithDownloads, { requestPath: routePath, authorizationText: VALID_TOKEN_TEXT }, (answer) => {
	ok(`${routePath}: a valid token keeps its own claims (role user)`, !answer.tokenError && answer.authclaims && answer.authclaims.user.role === 'user' && !answer.authclaims.noToken, `error: ${answer.tokenError}; claims: ${JSON.stringify(answer.authclaims)}`);
	next();
})));

// ---- 4. red twins: the tolerance does not leak
[
	{ twinName: 'a non-download route (/api/forged-use-cases)', tokenTools: toolsWithDownloads, requestPath: '/api/forged-use-cases' },
	{ twinName: 'a non-download route (/api/dme-cypher-query)', tokenTools: toolsWithDownloads, requestPath: '/api/dme-cypher-query' },
	{ twinName: "a download route's trailing-slash spelling", tokenTools: toolsWithDownloads, requestPath: `${DOWNLOAD_ROUTE_PATH_LIST[0]}/` },
	{ twinName: "a download route's upper-case spelling", tokenTools: toolsWithDownloads, requestPath: DOWNLOAD_ROUTE_PATH_LIST[1].toUpperCase() },
	{ twinName: 'a download route nobody declared', tokenTools: toolsWithNothingDeclared, requestPath: DOWNLOAD_ROUTE_PATH_LIST[0] },
].forEach(({ twinName, tokenTools, requestPath }) => stepList.push((next) => checkToken(tokenTools, { requestPath, authorizationText: BAD_TOKEN_CASE_LIST[0].authorizationText }, (answer) => {
	ok(`RED TWIN: a garbled token is still refused on ${twinName}`, /token error/.test(String(answer.tokenError)), `error: ${answer.tokenError}`);
	next();
})));

const runStep = (stepIndex) => {
	if (stepIndex >= stepList.length) {
		console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
		process.exit(failed === 0 ? 0 : 1);
	}
	stepList[stepIndex](() => setImmediate(() => runStep(stepIndex + 1)));
};
runStep(0);
