'use strict';

// raterServerHarness.js — boots the CEDS Rater's REAL server pieces on a scratch port for the Phase 3 gates: the real
// sqlite-instance (scratch files), data-mapping, password hashing, the user access points (user-by-username, user-login,
// admin-create-user, host-params), the rater access points, the token middleware exactly as startApiServer wires it
// (app-value-manager → hasValidToken → refreshauthtoken), the login endpoint, and the rater endpoints. Only the
// configuration is the test's own. The gold is whatever raterToolConfig names (the real one, or a wrong one on purpose).
//
//   bootRaterServer({ scratchDirPath, raterToolConfig }, callback(errText, { baseUrl, accessPointByName, raterToolAccess, close }))
//   httpPost({ baseUrl, routePath, requestBody, authtoken }, callback(errText, { statusCode, bodyText, bodyJson, authtoken }))

const fs = require('fs');
const path = require('path');
const http = require('http');

const SERVER_PATH = path.join(__dirname, '..', '..');
const ACCESS_POINT_DIR_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d');
const ENDPOINT_DIR_PATH = path.join(SERVER_PATH, 'endpoints-dot-d', 'qtDotLib.d');
const LOADED_ACCESS_POINT_NAME_LIST = ['host-params', 'user-by-username', 'user-login', 'admin-create-user', 'rater-item-get', 'rater-answer-save', 'rater-search', 'rater-browse', 'rater-progress', 'rater-finish', 'rater-admin'];
const RATER_ENDPOINT_FILE_LIST = ['rater-item-get', 'rater-answer-save', 'rater-search', 'rater-browse', 'rater-progress', 'rater-finish', 'rater-admin'];

const configBySection = {
	'access-token-header-tools': { secret: 'rater-harness-test-secret-not-a-real-one', authsecondsexpirationseconds: 3600 },
	'user-login': { builtinUserList: [], builtinsOnly: false, addBuiltinsToDatabase: false },
	'data-mapping': { placeholder: true },
	'sqlite-instance': {},
	'host-params': {},
	login: {},
	startApiServer: {},
};

const installProcessGlobal = () => {
	if (process.global && process.global.raterHarness) {
		return;
	}
	process.global = {
		raterHarness: true,
		xLog: { status: () => {}, error: (errorText) => process.env.RATER_HARNESS_VERBOSE && process.stderr.write(`harness xLog.error: ${errorText}\n`), verbose: () => {}, result: () => {}, debug: () => {} },
		getConfig: (sectionName) => configBySection[sectionName] || {},
		rawConfig: {},
		commandLineParameters: { switches: {}, values: {}, fileList: [] },
	};
};

const bootRaterServer = ({ scratchDirPath, raterToolConfig }, callback) => {
	installProcessGlobal();
	const express = require(require.resolve('express', { paths: [SERVER_PATH] }));
	const bodyParser = require(require.resolve('body-parser', { paths: [SERVER_PATH] }));
	const passwordTools = require(path.join(SERVER_PATH, 'data-model', 'lib', 'password-hash'))();
	const dataMapping = require(path.join(SERVER_PATH, 'data-model', 'data-mapping', 'data-mapping'))(passwordTools);
	const sqlDbGen = require(path.join(SERVER_PATH, 'data-model', 'lib', 'sqlite-instance'))({});
	const { initRaterToolAccess } = require(path.join(SERVER_PATH, 'data-model', 'lib', 'rater-tool', 'rater-tool-access'));
	fs.mkdirSync(scratchDirPath, { recursive: true });
	sqlDbGen.initDatabaseInstance(path.join(scratchDirPath, 'users.sqlite3'), (dbError, sqlDb) => {
		if (dbError) {
			callback(`harness: users db: ${dbError}`);
			return;
		}
		// a fresh users table has only refId/createdAt/updatedAt until its first save; the real server's first login seeds
		// it with the builtin users (addBuiltinsToDatabase). The harness seeds one user of its own, so the columns exist.
		sqlDb.getTable('users', (tableError, userTable) => userTable.saveObject({ username: 'harness-seed', password: passwordTools.hashPassword(require('crypto').randomBytes(24).toString('hex')), first: 'Harness', last: 'Seed', emailAdr: 'harness-seed@example.org', phone: '', source: 'harness', role: 'user' }, { suppressStatementLog: true }, (seedError) => {
		if (tableError || seedError) {
			callback(`harness: seeding users: ${tableError || seedError}`);
			return;
		}
		initRaterToolAccess({ raterToolConfig, sqlDbGen, dataMapping }, (accessError, raterToolAccess) => {
			if (accessError) {
				callback(`harness: rater tool access: ${accessError}`);
				return;
			}
			const accessPointByName = {};
			const passThroughParameters = { sqlDb, hxAccess: {}, dataMapping, neo4jDb: null, slackAccess: null, raterToolAccess, accessPointsDotD: accessPointByName };
			LOADED_ACCESS_POINT_NAME_LIST.forEach((accessPointName) => {
				require(path.join(ACCESS_POINT_DIR_PATH, accessPointName))({ dotD: { logList: [], library: { add: (addedName, serviceFunction) => { accessPointByName[addedName] = serviceFunction; } } }, passThroughParameters });
			});
			const expressApp = express();
			expressApp.use(bodyParser.json({ limit: '5mb' }));
			const appValueManager = require(path.join(SERVER_PATH, 'lib', 'app-value-manager'));
			const accessTokenHeaderTools = require(path.join(SERVER_PATH, 'lib', 'access-token-header-tools'))({ expressApp, userByUsername: accessPointByName['user-by-username'] });
			expressApp.use((xReq, xRes, next) => {
				appValueManager({ targetObject: xReq });
				next();
			});
			expressApp.use((xReq, xRes, next) => accessTokenHeaderTools.hasValidToken(xReq, (tokenError) => (tokenError ? xRes.status(401).send(`Bad Request ${tokenError}`) : next())));
			expressApp.use((xReq, xRes, next) => accessTokenHeaderTools.refreshauthtoken({ xReq, xRes }, next));
			const endpointsDotD = { logList: [] };
			const endpointPassThrough = { expressApp, accessTokenHeaderTools, accessPointsDotD: accessPointByName, routingPrefix: '/api/' };
			require(path.join(ENDPOINT_DIR_PATH, 'login', 'login.js'))({ dotD: endpointsDotD, passThroughParameters: endpointPassThrough });
			RATER_ENDPOINT_FILE_LIST.forEach((endpointFileName) => require(path.join(ENDPOINT_DIR_PATH, `${endpointFileName}.js`))({ dotD: endpointsDotD, passThroughParameters: endpointPassThrough }));
			const httpServer = expressApp.listen(0, '127.0.0.1', () => {
				callback('', {
					baseUrl: `http://127.0.0.1:${httpServer.address().port}`,
					accessPointByName,
					raterToolAccess,
					close: () => {
						httpServer.close();
						raterToolAccess.getRaterGraph && raterToolAccess.getRaterGraph((graphError, graphAnswer) => graphAnswer && graphAnswer.raterGraph && graphAnswer.raterGraph.close());
					},
				});
			});
		});
		}));
	});
};

const httpPost = ({ baseUrl, routePath, requestBody, authtoken }, callback) => {
	const bodyText = JSON.stringify(requestBody || {});
	const requestUrl = new URL(routePath, baseUrl);
	const httpRequest = http.request({ method: 'POST', hostname: requestUrl.hostname, port: requestUrl.port, path: requestUrl.pathname, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyText), ...(authtoken ? { Authorization: `Bearer ${authtoken}` } : {}) } }, (httpResponse) => {
		const chunkList = [];
		httpResponse.on('data', (chunk) => chunkList.push(chunk));
		httpResponse.on('end', () => {
			const responseText = Buffer.concat(chunkList).toString('utf8');
			let bodyJson = null;
			if (/^\s*[[{]/.test(responseText)) {
				bodyJson = JSON.parse(responseText);
			}
			callback('', { statusCode: httpResponse.statusCode, bodyText: responseText, bodyJson, authtoken: httpResponse.headers.authtoken });
		});
	});
	httpRequest.on('error', (requestError) => callback(`httpPost ${routePath}: ${requestError.message}`));
	httpRequest.end(bodyText);
};

module.exports = { bootRaterServer, httpPost };
