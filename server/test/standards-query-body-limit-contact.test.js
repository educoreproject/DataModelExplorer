'use strict';
// standards-query-body-limit-contact.test.js — a body over a route's limit is refused by the endpoint itself, before the core, so it needs the same words: who to write to (TQ, cardUriAnswers-110426). The real endpoint module and the real body parser on a real Express.
// Needs no graph or store: the request stops at the body. Run: node server/test/standards-query-body-limit-contact.test.js

const http = require('http');
const express = require('express');

const CONFIGURED_ADDRESS = 'someone@gate.example';
const configBySection = { 'edc-resolver': { sizeRefusalContactAddress: CONFIGURED_ADDRESS }, 'standards-query': { requestsPerMinute: 600, burstPerSecond: 100 } };
process.global = { xLog: { status() {}, error() {}, verbose() {}, result() {}, color: {} }, getConfig: (sectionName) => configBySection[sectionName] || {}, rawConfig: {}, commandLineParameters: { switches: {}, values: {} } };

const expressApp = express();
expressApp.use((xReq, xRes, next) => {
	xReq.appValueGetter = () => ({});
	next();
});
const passValidator = () => () => '';
require('../endpoints-dot-d/qtDotLib.d/standards-query')({
	dotD: { logList: [] },
	passThroughParameters: { expressApp, accessTokenHeaderTools: { getValidator: passValidator, declareTokenTolerantPathPrefix() {} }, accessPointsDotD: { 'standards-query': (input, callback) => callback('', { httpStatus: 200, bodyText: '{}' }) }, routingPrefix: '/api/' },
});
const server = expressApp.listen(0, '127.0.0.1', () => {
	const bodyText = JSON.stringify({ fieldList: [{ name: 'x'.repeat(1100000) }] });
	const request = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST', path: '/api/standards/v1/rosetta/retrieval', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyText) } }, (response) => {
		let responseText = '';
		response.setEncoding('utf8');
		response.on('data', (oneChunk) => { responseText += oneChunk; });
		response.on('end', () => {
			const answer = JSON.parse(responseText).answer || {};
			const isGood = response.statusCode === 413 && answer.refusalName === 'inputTooLong' && answer.contact === CONFIGURED_ADDRESS && answer.reason.includes(CONFIGURED_ADDRESS);
			console.log(`  ${isGood ? 'PASS' : 'FAIL'}: a body over the route's limit says who to write to, from config${isGood ? '' : ` — ${response.statusCode} ${responseText.slice(0, 300)}`}`);
			console.log(`standards-query-body-limit-contact: ${isGood ? 1 : 0} passed, ${isGood ? 0 : 1} failed`);
			process.exit(isGood ? 0 : 1);
		});
	});
	request.end(bodyText);
});
