'use strict';

// dmeSessionHarness.js — boots the DME saved-session server pieces on a scratch port, after companionServerHarness.js:
// the REAL sqlite-instance (a scratch file), data-mapping, password hashing, the user access points, the dme-session-save
// and dme-session-load access points and endpoints, the token middleware as startApiServer wires it, the login endpoint,
// the global JSON parser mounted through the same skippingLargeBodyRoutes startApiServer uses, and the real
// json-error-answer. Auto-titling is off (no Anthropic key reaches the access point), so no test calls a model.
//
//   bootDmeSessionServer({ scratchDirPath }, callback(errText, { baseUrl, sqlDb, close }))
//   httpRequest({ baseUrl, httpMethod, routePath, requestBody | rawBodyText, authtoken }, callback(errText, { statusCode, bodyText, bodyJson }))
//   loginAs({ baseUrl }, callback(errText, authtoken))     the seeded harness user (role 'user')

const fs = require('fs');
const path = require('path');
const http = require('http');

const SERVER_PATH = path.join(__dirname, '..', '..');
const ACCESS_POINT_DIR_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d');
const ENDPOINT_DIR_PATH = path.join(SERVER_PATH, 'endpoints-dot-d', 'qtDotLib.d');
const ACCESS_POINT_NAME_LIST = ['host-params', 'user-by-username', 'user-login', 'dme-session-save', 'dme-session-load'];
const ENDPOINT_NAME_LIST = ['dme-session-save', 'dme-session-load'];
const HARNESS_USERNAME = 'harnessdmeuser';
const HARNESS_PASSWORD = 'DmeSessionHarness9!';

const configBySection = {
	'access-token-header-tools': { secret: 'dme-session-harness-test-secret-not-a-real-one', authsecondsexpirationseconds: 3600 },
	'user-login': { builtinUserList: [], builtinsOnly: false, addBuiltinsToDatabase: false },
	'askmilo-utility': {},
};

const installProcessGlobal = () => {
	delete process.env.ANTHROPIC_API_KEY; // the save access point auto-titles through Anthropic when it finds a key
	process.global = {
		xLog: { status: () => {}, error: (errorText) => process.env.DME_HARNESS_VERBOSE && process.stderr.write(`harness xLog.error: ${errorText}\n`), verbose: () => {}, result: () => {}, debug: () => {}, color: {} },
		getConfig: (sectionName) => configBySection[sectionName] || {},
		rawConfig: {},
		commandLineParameters: { switches: {}, values: {}, fileList: [] },
	};
};

const bootDmeSessionServer = ({ scratchDirPath }, callback) => {
	installProcessGlobal();
	const express = require(require.resolve('express', { paths: [SERVER_PATH] }));
	const bodyParser = require(require.resolve('body-parser', { paths: [SERVER_PATH] }));
	const passwordTools = require(path.join(SERVER_PATH, 'data-model', 'lib', 'password-hash'))();
	const dataMapping = require(path.join(SERVER_PATH, 'data-model', 'data-mapping', 'data-mapping'))(passwordTools);
	const sqlDbGen = require(path.join(SERVER_PATH, 'data-model', 'lib', 'sqlite-instance'))({});
	const { skippingLargeBodyRoutes } = require(path.join(SERVER_PATH, 'lib', 'large-body-json'));
	fs.mkdirSync(scratchDirPath, { recursive: true });

	sqlDbGen.initDatabaseInstance(path.join(scratchDirPath, 'dmeSession.sqlite3'), (dbError, sqlDb) => {
		if (dbError) {
			callback(`harness: db: ${dbError}`);
			return;
		}
		const seedUser = { username: HARNESS_USERNAME, password: passwordTools.hashPassword(HARNESS_PASSWORD), first: 'Harness', last: 'User', emailAdr: 'user@example.org', phone: '', source: 'harness', role: 'user' };
		sqlDb.getTable('users', (tableError, userTable) => userTable.saveObject(seedUser, { suppressStatementLog: true }, (seedError) => {
			if (tableError || seedError) {
				callback(`harness: seeding user: ${tableError || seedError}`);
				return;
			}
			const accessPointByName = {};
			const passThroughParameters = { sqlDb, hxAccess: {}, dataMapping, accessPointsDotD: accessPointByName };
			const dotD = { logList: [], library: { add: (addedName, serviceFunction) => { accessPointByName[addedName] = serviceFunction; } } };
			ACCESS_POINT_NAME_LIST.forEach((accessPointName) => require(path.join(ACCESS_POINT_DIR_PATH, accessPointName))({ dotD, passThroughParameters }));

			const expressApp = express();
			expressApp.use(skippingLargeBodyRoutes(bodyParser.json({ extended: true })));
			const appValueManager = require(path.join(SERVER_PATH, 'lib', 'app-value-manager'));
			const accessTokenHeaderTools = require(path.join(SERVER_PATH, 'lib', 'access-token-header-tools'))({ expressApp, userByUsername: accessPointByName['user-by-username'] });
			expressApp.use((xReq, xRes, next) => {
				appValueManager({ targetObject: xReq });
				next();
			});
			expressApp.use((xReq, xRes, next) => accessTokenHeaderTools.hasValidToken(xReq, (tokenError) => (tokenError ? xRes.status(401).send(`Bad Request ${tokenError}`) : next())));
			expressApp.use((xReq, xRes, next) => accessTokenHeaderTools.refreshauthtoken({ xReq, xRes }, next));
			// an ordinary route, to show the global limit still holds everywhere else
			expressApp.post('/api/harness-echo', (xReq, xRes) => xRes.send([{ receivedPropertyCount: Object.keys(xReq.body || {}).length }]));
			const endpointsDotD = { logList: [] };
			const endpointPassThrough = { expressApp, accessTokenHeaderTools, accessPointsDotD: accessPointByName, routingPrefix: '/api/' };
			require(path.join(ENDPOINT_DIR_PATH, 'login', 'login.js'))({ dotD: endpointsDotD, passThroughParameters: endpointPassThrough });
			ENDPOINT_NAME_LIST.forEach((endpointName) => require(path.join(ENDPOINT_DIR_PATH, `${endpointName}.js`))({ dotD: endpointsDotD, passThroughParameters: endpointPassThrough }));
			expressApp.use(require(path.join(SERVER_PATH, 'lib', 'json-error-answer')));
			const httpServer = expressApp.listen(0, '127.0.0.1', () => {
				callback('', { baseUrl: `http://127.0.0.1:${httpServer.address().port}`, sqlDb, close: () => httpServer.close() });
			});
		}));
	});
};

const httpRequest = ({ baseUrl, httpMethod, routePath, requestBody, rawBodyText, authtoken }, callback) => {
	const bodyText = httpMethod === 'GET' ? '' : rawBodyText !== undefined ? rawBodyText : JSON.stringify(requestBody || {});
	const requestUrl = new URL(routePath, baseUrl);
	const headerByName = { ...(bodyText ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyText) } : {}), ...(authtoken ? { Authorization: `Bearer ${authtoken}` } : {}) };
	const outgoingRequest = http.request({ method: httpMethod, hostname: requestUrl.hostname, port: requestUrl.port, path: `${requestUrl.pathname}${requestUrl.search}`, headers: headerByName }, (httpResponse) => {
		const chunkList = [];
		httpResponse.on('data', (chunk) => chunkList.push(chunk));
		httpResponse.on('end', () => {
			const responseText = Buffer.concat(chunkList).toString('utf8');
			const isJson = /application\/json/.test(httpResponse.headers['content-type'] || '');
			callback('', { statusCode: httpResponse.statusCode, bodyText: responseText, bodyJson: isJson ? JSON.parse(responseText) : null, headerByName: httpResponse.headers });
		});
	});
	outgoingRequest.on('error', (requestError) => callback(`${httpMethod} ${routePath}: ${requestError.message}`));
	outgoingRequest.end(bodyText);
};

const loginAs = ({ baseUrl }, callback) =>
	httpRequest({ baseUrl, httpMethod: 'POST', routePath: '/api/login', requestBody: { username: HARNESS_USERNAME, password: HARNESS_PASSWORD } }, (postError, loginResponse) => {
		if (postError || loginResponse.statusCode !== 200 || !loginResponse.headerByName.authtoken) {
			callback(`login failed: ${postError || loginResponse.statusCode} ${loginResponse && loginResponse.bodyText}`);
			return;
		}
		callback('', loginResponse.headerByName.authtoken);
	});

module.exports = { bootDmeSessionServer, httpRequest, loginAs };
