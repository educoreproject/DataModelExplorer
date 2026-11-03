'use strict';
// mcpTestHarness — mounts the REAL mcp-server.js and the REAL bearer gate on an Express app, with stubs only behind them (the access points, and the token verifier and store the gate reads).
//   mountMcpForTest({ mcpConfigValues, accessPointsDotD }, callback('', { port, closeServer, userGrantFacts }))
//   postRpc({ port, sessionRefId, bearerToken, isLoopback, method, params }, callback('', { status, headers, rpcMessage, bodyText }))
// A bearer token here is "<sub>:<grantRefId>"; the stub verifier reads it as the claims, and the real gate then reads the stub store for the user and the grant.

const http = require('http');

const TEST_INTERNAL_SECRET = 'mcpTestSecret'.padEnd(64, '0');

const mountMcpForTest = ({ mcpConfigValues, accessPointsDotD }, callback) => {
	process.global = {
		getConfig: (sectionName) => ({
			dmeUserGraphInternalAuth: { internalAuthSecret: TEST_INTERNAL_SECRET },
			'mcp-server': { enabled: true, mcpPath: '/mcp', ...mcpConfigValues },
		}[sectionName] || {}),
		xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
		rawConfig: {},
		commandLineParameters: { switches: {}, values: {} },
	};
	const express = require('express');
	const bodyParser = require('body-parser');
	const expressApp = express();
	expressApp.use(bodyParser.json({ extended: true }));

	const userGrantFacts = { revokedGrantRefIdSet: new Set() };
	const tableStubByName = {
		users: { getData: (statementText, options, done) => done('', [{ refId: statementText.match(/refId='([^']*)'/)[1], username: 'testUser', role: 'user', disabled: '', accessRevokedAfter: 0 }]) },
		oauthAdapterStore: { getData: (statementText, options, done) => {
			const grantRefId = statementText.match(/id='([^']*)'/)[1];
			done('', userGrantFacts.revokedGrantRefIdSet.has(grantRefId) ? [] : [{ payload: '{}' }]);
		} },
	};
	expressApp.set('oauthServer', {
		verifyBearer: (headerText) => {
			const tokenParts = String(headerText || '').replace(/^Bearer /, '').split(':');
			return tokenParts.length === 2 ? { valid: true, claims: { sub: tokenParts[0], gid: tokenParts[1], jti: `jti-${tokenParts[1]}`, iat: 1, client_id: 'testClient' } } : { valid: false, reason: 'not a test token' };
		},
		sqlDb: { getTable: (tableName, done) => done('', tableStubByName[tableName]) },
	});

	require('../../lib/mcp-server/mcp-server')({ expressApp, accessPointsDotD });
	const listeningServer = expressApp.listen(0, () => callback('', {
		port: listeningServer.address().port,
		closeServer: () => listeningServer.close(),
		userGrantFacts,
	}));
};

const messageFromBody = (bodyText) => {
	const dataLine = bodyText.split('\n').find((oneLine) => oneLine.startsWith('data: '));
	const messageText = dataLine ? dataLine.slice('data: '.length) : bodyText;
	return messageText.startsWith('{') ? JSON.parse(messageText) : null;
};

const requestRpc = ({ port, httpMethod, sessionRefId, bearerToken, isLoopback, bodyText }, callback) => {
	const clientRequest = http.request({
		host: '127.0.0.1',
		port,
		path: '/mcp',
		method: httpMethod,
		agent: false,
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			...(isLoopback ? { 'x-dme-internal-secret': TEST_INTERNAL_SECRET } : {}),
			...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
			...(sessionRefId ? { 'mcp-session-id': sessionRefId } : {}),
			'content-length': Buffer.byteLength(bodyText),
		},
	}, (serverResponse) => {
		let receivedText = '';
		serverResponse.on('data', (chunkText) => { receivedText += chunkText; });
		serverResponse.on('end', () => callback('', { status: serverResponse.statusCode, headers: serverResponse.headers, bodyText: receivedText, rpcMessage: messageFromBody(receivedText) }));
	});
	clientRequest.on('error', (requestError) => callback(String(requestError)));
	clientRequest.end(bodyText);
};

const postRpc = ({ port, sessionRefId, bearerToken, isLoopback, method, params }, callback) => requestRpc({ port, httpMethod: 'POST', sessionRefId, bearerToken, isLoopback, bodyText: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || {} }) }, callback);
const deleteSession = ({ port, sessionRefId, bearerToken, isLoopback }, callback) => requestRpc({ port, httpMethod: 'DELETE', sessionRefId, bearerToken, isLoopback, bodyText: '' }, callback);

const INITIALIZE_PARAMS = Object.freeze({ protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'mcpTestHarness', version: '1' } });
const initializeSession = ({ port, bearerToken, isLoopback }, callback) => postRpc({ port, bearerToken, isLoopback, method: 'initialize', params: INITIALIZE_PARAMS }, (rpcError, rpcResult) => {
	if (rpcError) {
		callback(rpcError);
		return;
	}
	if (rpcResult.status !== 200) {
		callback('', { ...rpcResult, sessionRefId: '' });
		return;
	}
	const sessionRefId = rpcResult.headers['mcp-session-id'];
	postRpc({ port, sessionRefId, bearerToken, isLoopback, method: 'notifications/initialized' }, () => callback('', { ...rpcResult, sessionRefId }));
});

module.exports = { mountMcpForTest, postRpc, deleteSession, initializeSession };
