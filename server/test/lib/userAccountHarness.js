'use strict';

// userAccountHarness.js — boots the REAL user-account server pieces of ONE server tree on a scratch port, for the
// userSqlAndSaveHole gates (WORKORDER-userSqlAndSaveHole-111026): the real sqlite-instance (a scratch file), data-mapping,
// password hashing, the user access points (user-by-username, user-login, user-save-data, admin-create-user,
// admin-update-user, host-params), the token middleware exactly as startApiServer wires it (app-value-manager ->
// hasValidToken -> refreshauthtoken), the login endpoint and the saveUserData endpoint. Only the configuration is the
// test's own. The tree is a parameter so the same gate can be pointed at the pinned base to watch it fail.
//
// Every statement any access point sends to the users table through getData is recorded, in order, in
// statementList, so a gate can read the exact SQL a hostile value produced.
//
//   bootUserAccountServer({ serverPath, scratchDirPath, seedUserList }, callback(errText, { baseUrl, accessPointByName, statementList, userTable, close }))
//   httpPost({ baseUrl, routePath, requestBody, authtoken }, callback(errText, { statusCode, bodyText, bodyJson, authtoken, authclaimsText }))

const fs = require('fs');
const path = require('path');
const http = require('http');

const LOADED_ACCESS_POINT_NAME_LIST = ['host-params', 'user-by-username', 'user-login', 'user-save-data', 'admin-create-user', 'admin-update-user'];
const HARNESS_TOKEN_SECRET = 'user-account-harness-test-secret-not-a-real-one';

const configBySection = {
	'access-token-header-tools': { secret: HARNESS_TOKEN_SECRET, authsecondsexpirationseconds: 3600 },
	'user-login': { builtinUserList: [], builtinsOnly: false, addBuiltinsToDatabase: false },
	'data-mapping': { placeholder: true },
	'sqlite-instance': {},
	'host-params': {},
	login: {},
	startApiServer: {},
};

const installProcessGlobal = () => {
	process.global = {
		xLog: { status: () => {}, error: (errorText) => process.env.USER_HARNESS_VERBOSE && process.stderr.write(`harness xLog.error: ${errorText}\n`), verbose: () => {}, result: () => {}, debug: () => {} },
		getConfig: (sectionName) => configBySection[sectionName] || {},
		rawConfig: {},
		commandLineParameters: { switches: {}, values: {}, fileList: [] },
	};
};

// recordingSqlDbOf — the real sqlDb, with every table's getData wrapped so its statement is recorded before it runs
const recordingSqlDbOf = (sqlDb, statementList) => ({
	...sqlDb,
	getTable: (tableName, callback) =>
		sqlDb.getTable(tableName, (tableError, realTable) => {
			if (tableError) {
				callback(tableError);
				return;
			}
			callback('', {
				...realTable,
				getData: (statementText, options, dataCallback) => {
					statementList.push(statementText);
					realTable.getData(statementText, options, dataCallback);
				},
			});
		}),
});

const bootUserAccountServer = ({ serverPath, scratchDirPath, seedUserList }, callback) => {
	installProcessGlobal();
	const accessPointDirPath = path.join(serverPath, 'data-model', 'access-points-dot-d', 'accessPoints.d');
	const endpointDirPath = path.join(serverPath, 'endpoints-dot-d', 'qtDotLib.d');
	const express = require(require.resolve('express', { paths: [serverPath] }));
	const bodyParser = require(require.resolve('body-parser', { paths: [serverPath] }));
	const passwordTools = require(path.join(serverPath, 'data-model', 'lib', 'password-hash'))();
	const dataMapping = require(path.join(serverPath, 'data-model', 'data-mapping', 'data-mapping'))(passwordTools);
	const sqlDbGen = require(path.join(serverPath, 'data-model', 'lib', 'sqlite-instance'))({});
	fs.mkdirSync(scratchDirPath, { recursive: true });
	sqlDbGen.initDatabaseInstance(path.join(scratchDirPath, 'users.sqlite3'), (dbError, realSqlDb) => {
		if (dbError) {
			callback(`harness: users db: ${dbError}`);
			return;
		}
		realSqlDb.getTable('users', (tableError, userTable) => {
			if (tableError) {
				callback(`harness: users table: ${tableError}`);
				return;
			}
			const seedOne = (remainingList, seededList, seedDone) => {
				if (!remainingList.length) {
					seedDone('', seededList);
					return;
				}
				const [seedUser, ...restList] = remainingList;
				userTable.saveObject({ ...seedUser, password: passwordTools.hashPassword(seedUser.password) }, { suppressStatementLog: true }, (seedError, seededRefId) => {
					if (seedError) {
						seedDone(`harness: seeding ${seedUser.username}: ${seedError}`);
						return;
					}
					seedOne(restList, [...seededList, { ...seedUser, refId: seededRefId }], seedDone);
				});
			};
			seedOne(seedUserList, [], (seedError, seededUserList) => {
				if (seedError) {
					callback(seedError);
					return;
				}
				const statementList = [];
				const sqlDb = recordingSqlDbOf(realSqlDb, statementList);
				const accessPointByName = {};
				const passThroughParameters = { sqlDb, hxAccess: {}, dataMapping, neo4jDb: null, slackAccess: null, accessPointsDotD: accessPointByName };
				LOADED_ACCESS_POINT_NAME_LIST.forEach((accessPointName) => {
					require(path.join(accessPointDirPath, accessPointName))({ dotD: { logList: [], library: { add: (addedName, serviceFunction) => { accessPointByName[addedName] = serviceFunction; } } }, passThroughParameters });
				});
				const expressApp = express();
				expressApp.use(bodyParser.json({ limit: '5mb' }));
				const appValueManager = require(path.join(serverPath, 'lib', 'app-value-manager'));
				const accessTokenHeaderTools = require(path.join(serverPath, 'lib', 'access-token-header-tools'))({ expressApp, userByUsername: accessPointByName['user-by-username'] });
				expressApp.use((xReq, xRes, next) => {
					appValueManager({ targetObject: xReq });
					next();
				});
				expressApp.use((xReq, xRes, next) => accessTokenHeaderTools.hasValidToken(xReq, (tokenError) => (tokenError ? xRes.status(401).send(`Bad Request ${tokenError}`) : next())));
				expressApp.use((xReq, xRes, next) => accessTokenHeaderTools.refreshauthtoken({ xReq, xRes }, next));
				const endpointsDotD = { logList: [] };
				const endpointPassThrough = { expressApp, accessTokenHeaderTools, accessPointsDotD: accessPointByName, routingPrefix: '/api/' };
				require(path.join(endpointDirPath, 'login', 'login.js'))({ dotD: endpointsDotD, passThroughParameters: endpointPassThrough });
				require(path.join(endpointDirPath, 'save-user-data.js'))({ dotD: endpointsDotD, passThroughParameters: endpointPassThrough });
				const httpServer = expressApp.listen(0, '127.0.0.1', () => {
					callback('', {
						baseUrl: `http://127.0.0.1:${httpServer.address().port}`,
						accessPointByName,
						statementList,
						seededUserList,
						userTable,
						tokenSecret: HARNESS_TOKEN_SECRET,
						close: () => httpServer.close(),
					});
				});
			});
		});
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
			const bodyJson = /^\s*[[{]/.test(responseText) ? JSON.parse(responseText) : null;
			callback('', { statusCode: httpResponse.statusCode, bodyText: responseText, bodyJson, authtoken: httpResponse.headers.authtoken, authclaimsText: httpResponse.headers.authclaims });
		});
	});
	httpRequest.on('error', (requestError) => callback(`httpPost ${routePath}: ${requestError.message}`));
	httpRequest.end(bodyText);
};

module.exports = { bootUserAccountServer, httpPost };
