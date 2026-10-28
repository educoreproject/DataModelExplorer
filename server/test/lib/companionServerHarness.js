'use strict';

// companionServerHarness.js — boots the Companion Pages server pieces on a scratch port for the Phase 1 gates
// (SPEC-companionPages-102826), after raterServerHarness.js: the REAL sqlite-instance (a scratch file), data-mapping,
// password hashing, the user access points, the companion-* access points and endpoints, the token middleware exactly
// as startApiServer wires it, the login endpoint, and the global JSON parser mounted through the same
// skippingLargeBodyRoutes startApiServer uses. Only the configuration is the test's own; the companion source files go
// to a scratch directory. Seeded users, one per role the gates need (password HARNESS_PASSWORD for all):
// admin, super, user, client, subadministrator.
//
//   bootCompanionServer({ scratchDirPath, accessPointModulePathByName, dataMappingModule, isLargeBodySkipOff }, callback(errText, { baseUrl, accessPointByName, companionSourcesDirPath, sqlDb, dataMapping, close }))
//     red twins: accessPointModulePathByName replaces a companion access point (a path or a loaded module function);
//     dataMappingModule replaces data-mapping.js; isLargeBodySkipOff mounts the global JSON parser on every route
//   httpPost({ baseUrl, routePath, requestBody | rawBodyText, authtoken }, callback(errText, { statusCode, bodyText, bodyJson, bodyBuffer, headerByName }))
//   HARNESS_PASSWORD, SEEDED_ROLE_LIST

const fs = require('fs');
const path = require('path');
const http = require('http');

const SERVER_PATH = path.join(__dirname, '..', '..');
const ACCESS_POINT_DIR_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d');
const ENDPOINT_DIR_PATH = path.join(SERVER_PATH, 'endpoints-dot-d', 'qtDotLib.d');
const USER_ACCESS_POINT_NAME_LIST = ['host-params', 'user-by-username', 'user-login'];
const COMPANION_ACCESS_POINT_NAME_LIST = ['companion-page-list', 'companion-page-save', 'companion-source-upload', 'companion-source-list', 'companion-source-file'];
const COMPANION_ENDPOINT_NAME_LIST = ['companion-page-list', 'companion-page-save', 'companion-source-upload', 'companion-source-list', 'companion-source-history', 'companion-source-file'];
const HARNESS_PASSWORD = 'CompanionHarness9!';
const SEEDED_ROLE_LIST = ['admin', 'super', 'user', 'client', 'subadministrator'];

const configBySection = {
	'access-token-header-tools': { secret: 'companion-harness-test-secret-not-a-real-one', authsecondsexpirationseconds: 3600 },
	'user-login': { builtinUserList: [], builtinsOnly: false, addBuiltinsToDatabase: false },
	'data-mapping': { placeholder: true },
	'sqlite-instance': {},
	'host-params': {},
	login: {},
	startApiServer: {},
};

const installProcessGlobal = () => {
	if (process.global && process.global.companionHarness) {
		return;
	}
	process.global = {
		companionHarness: true,
		xLog: { status: () => {}, error: (errorText) => process.env.COMPANION_HARNESS_VERBOSE && process.stderr.write(`harness xLog.error: ${errorText}\n`), verbose: () => {}, result: () => {}, debug: () => {} },
		getConfig: (sectionName) => configBySection[sectionName] || {},
		rawConfig: {},
		commandLineParameters: { switches: {}, values: {}, fileList: [] },
	};
};

const bootCompanionServer = ({ scratchDirPath, accessPointModulePathByName = {}, dataMappingModule, isLargeBodySkipOff = false }, callback) => {
	installProcessGlobal();
	const express = require(require.resolve('express', { paths: [SERVER_PATH] }));
	const bodyParser = require(require.resolve('body-parser', { paths: [SERVER_PATH] }));
	const passwordTools = require(path.join(SERVER_PATH, 'data-model', 'lib', 'password-hash'))();
	const dataMapping = (dataMappingModule || require(path.join(SERVER_PATH, 'data-model', 'data-mapping', 'data-mapping')))(passwordTools);
	const sqlDbGen = require(path.join(SERVER_PATH, 'data-model', 'lib', 'sqlite-instance'))({});
	const { skippingLargeBodyRoutes } = require(path.join(SERVER_PATH, 'lib', 'large-body-json'));
	const companionSourcesDirPath = path.join(scratchDirPath, 'companionSources');
	fs.mkdirSync(scratchDirPath, { recursive: true });

	sqlDbGen.initDatabaseInstance(path.join(scratchDirPath, 'companion.sqlite3'), (dbError, sqlDb) => {
		if (dbError) {
			callback(`harness: db: ${dbError}`);
			return;
		}
		const seedUserList = SEEDED_ROLE_LIST.map((roleName) => ({ username: `harness${roleName}`, password: passwordTools.hashPassword(HARNESS_PASSWORD), first: 'Harness', last: roleName, emailAdr: `${roleName}@example.org`, phone: '', source: 'harness', role: roleName }));
		sqlDb.getTable('users', (tableError, userTable) => userTable.saveObject(seedUserList, { suppressStatementLog: true }, (seedError) => {
			if (tableError || seedError) {
				callback(`harness: seeding users: ${tableError || seedError}`);
				return;
			}
			const accessPointByName = {};
			const passThroughParameters = { sqlDb, hxAccess: {}, dataMapping, neo4jDb: null, slackAccess: null, companionSourcesDirPath, accessPointsDotD: accessPointByName };
			const dotD = { logList: [], library: { add: (addedName, serviceFunction) => { accessPointByName[addedName] = serviceFunction; } } };
			USER_ACCESS_POINT_NAME_LIST.forEach((accessPointName) => require(path.join(ACCESS_POINT_DIR_PATH, accessPointName))({ dotD, passThroughParameters }));
			COMPANION_ACCESS_POINT_NAME_LIST.forEach((accessPointName) => {
				const modulePath = accessPointModulePathByName[accessPointName] || path.join(ACCESS_POINT_DIR_PATH, accessPointName);
				const moduleExport = typeof modulePath === 'function' ? modulePath : require(modulePath);
				moduleExport({ dotD, passThroughParameters });
			});

			const expressApp = express();
			const globalJsonParser = bodyParser.json({ extended: true });
			expressApp.use(isLargeBodySkipOff ? globalJsonParser : skippingLargeBodyRoutes(globalJsonParser));
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
			COMPANION_ENDPOINT_NAME_LIST.forEach((endpointName) => require(path.join(ENDPOINT_DIR_PATH, `${endpointName}.js`))({ dotD: endpointsDotD, passThroughParameters: endpointPassThrough }));
			// the error handler body-parser's refusals reach (413 for a body over the limit)
			expressApp.use((parseError, xReq, xRes, next) => xRes.status(parseError.status || 500).send(`harness: ${parseError.type || parseError.message}`));
			const httpServer = expressApp.listen(0, '127.0.0.1', () => {
				callback('', { baseUrl: `http://127.0.0.1:${httpServer.address().port}`, accessPointByName, companionSourcesDirPath, sqlDb, dataMapping, close: () => httpServer.close() });
			});
		}));
	});
};

const httpPost = ({ baseUrl, routePath, requestBody, rawBodyText, authtoken }, callback) => {
	const bodyText = rawBodyText !== undefined ? rawBodyText : JSON.stringify(requestBody || {});
	const requestUrl = new URL(routePath, baseUrl);
	const httpRequest = http.request({ method: 'POST', hostname: requestUrl.hostname, port: requestUrl.port, path: requestUrl.pathname, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyText), ...(authtoken ? { Authorization: `Bearer ${authtoken}` } : {}) } }, (httpResponse) => {
		const chunkList = [];
		httpResponse.on('data', (chunk) => chunkList.push(chunk));
		httpResponse.on('end', () => {
			const bodyBuffer = Buffer.concat(chunkList);
			const responseText = bodyBuffer.toString('utf8');
			const isJson = /application\/json/.test(httpResponse.headers['content-type'] || '');
			callback('', { statusCode: httpResponse.statusCode, bodyText: responseText, bodyJson: isJson ? JSON.parse(responseText) : null, bodyBuffer, headerByName: httpResponse.headers });
		});
	});
	httpRequest.on('error', (requestError) => callback(`httpPost ${routePath}: ${requestError.message}`));
	httpRequest.end(bodyText);
};

// logs each seeded role in; callback(errText, tokenByRoleName)
const loginEveryRole = ({ baseUrl }, callback) => {
	const tokenByRoleName = {};
	const loginNext = (remainingRoleList) => {
		if (!remainingRoleList.length) {
			callback('', tokenByRoleName);
			return;
		}
		const roleName = remainingRoleList[0];
		httpPost({ baseUrl, routePath: '/api/login', requestBody: { username: `harness${roleName}`, password: HARNESS_PASSWORD } }, (postError, loginResponse) => {
			if (postError || loginResponse.statusCode !== 200 || !loginResponse.headerByName.authtoken) {
				callback(`login as ${roleName} failed: ${postError || loginResponse.statusCode}`);
				return;
			}
			tokenByRoleName[roleName] = loginResponse.headerByName.authtoken;
			loginNext(remainingRoleList.slice(1));
		});
	};
	loginNext(SEEDED_ROLE_LIST);
};

module.exports = { bootCompanionServer, httpPost, loginEveryRole, HARNESS_PASSWORD, SEEDED_ROLE_LIST };
