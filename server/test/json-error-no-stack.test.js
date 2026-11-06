'use strict';
// json-error-no-stack.test.js — an error no route answered (a body over the parser's limit, a body that is not JSON, a route that
// passes an error on) is answered in JSON by name, with no stack and no file path (todo 794a45ec: POST /mcp over 100 KB with no
// credential answered Express's HTML page, the stack and the server's paths in it). The real body parser, mounted as
// startApiServer.js mounts it, the real error module, and a contract check that startApiServer.js mounts that module after every route.
// Needs no graph or store. Run: node server/test/json-error-no-stack.test.js

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');

const errorLogList = [];
process.global = { xLog: { status() {}, error: (logText) => errorLogList.push(String(logText)), verbose() {}, result() {}, color: {} }, getConfig: () => ({}), rawConfig: {}, commandLineParameters: { switches: {}, values: {} } };

const { skippingLargeBodyRoutes } = require('../lib/large-body-json');
const jsonErrorAnswer = require('../lib/json-error-answer');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

// what an answer must never carry: a stack frame or a path on the server
const LEAK_PATTERN_LIST = [/\bat [^\s]+ \(/, /\.js:\d+/, /node_modules/, /\/home\//, /\/Users\//, /Error:/];
const leakOf = (bodyText) => LEAK_PATTERN_LIST.filter((onePattern) => onePattern.test(bodyText)).map(String);

const expressApp = express();
expressApp.use(skippingLargeBodyRoutes(bodyParser.json({ extended: true })));
expressApp.use(bodyParser.urlencoded({ extended: true }));
expressApp.post('/mcp', (xReq, xRes) => xRes.json({ reached: true }));
expressApp.get('/api/passesAnError', (xReq, xRes, next) => next(new Error(`a failure naming ${__filename}`)));
expressApp.use(jsonErrorAnswer);

const send = ({ port, httpMethod, routePath, bodyText, contentType = 'application/json' }, done) => {
	const request = http.request({ host: '127.0.0.1', port, method: httpMethod, path: routePath, headers: bodyText === undefined ? {} : { 'content-type': contentType, 'content-length': Buffer.byteLength(bodyText) } }, (response) => {
		let responseText = '';
		response.setEncoding('utf8');
		response.on('data', (oneChunk) => { responseText += oneChunk; });
		response.on('end', () => done({ status: response.statusCode, contentType: String(response.headers['content-type'] || ''), bodyText: responseText }));
	});
	request.on('error', (requestError) => done({ status: 0, contentType: '', bodyText: String(requestError) }));
	request.end(bodyText);
};
const parsedOf = (answer) => (answer.contentType.includes('application/json') ? JSON.parse(answer.bodyText) : {});
const isNamedJsonAnswer = (answer, httpStatus, refusalName) => answer.status === httpStatus && answer.contentType.includes('application/json') && parsedOf(answer).refusalName === refusalName && /^[0-9a-zA-Z]+$/.test(String(parsedOf(answer).errorId || ''));
const describe = (answer) => `${answer.status} ${answer.contentType} ${answer.bodyText.slice(0, 200).replace(/\s+/g, ' ')}`;

const server = expressApp.listen(0, '127.0.0.1', () => {
	const port = server.address().port;
	const overLimitBodyText = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { pad: 'x'.repeat(150 * 1024) } });
	send({ port, httpMethod: 'POST', routePath: '/mcp', bodyText: overLimitBodyText }, (tooLargeAnswer) => {
		check('POST /mcp over 100 KB, no credential: 413 in JSON, refusalName bodyTooLarge, with an errorId', isNamedJsonAnswer(tooLargeAnswer, 413, 'bodyTooLarge'), describe(tooLargeAnswer));
		check('the 413 carries no stack and no path', leakOf(tooLargeAnswer.bodyText).length === 0, leakOf(tooLargeAnswer.bodyText).join(' '));
		send({ port, httpMethod: 'POST', routePath: '/mcp', bodyText: '{"jsonrpc": "2.0", nope' }, (notJsonAnswer) => {
			check('a body that is not JSON: 400 in JSON, refusalName bodyNotParsable', isNamedJsonAnswer(notJsonAnswer, 400, 'bodyNotParsable'), describe(notJsonAnswer));
			check('the 400 carries no stack, no path, and not the parser\'s own words', leakOf(notJsonAnswer.bodyText).length === 0 && !notJsonAnswer.bodyText.includes('nope'), leakOf(notJsonAnswer.bodyText).join(' '));
			send({ port, httpMethod: 'POST', routePath: '/mcp', bodyText: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }) }, (smallAnswer) => {
				check('a body under the limit still reaches the route', smallAnswer.status === 200 && parsedOf(smallAnswer).reached === true, describe(smallAnswer));
				send({ port, httpMethod: 'GET', routePath: '/api/passesAnError' }, (routeErrorAnswer) => {
					check('an error a route passes on: 500 in JSON, refusalName internalError', isNamedJsonAnswer(routeErrorAnswer, 500, 'internalError'), describe(routeErrorAnswer));
					check('the 500 says nothing of the error: no message, no stack, no path', leakOf(routeErrorAnswer.bodyText).length === 0 && !routeErrorAnswer.bodyText.includes('a failure naming'), leakOf(routeErrorAnswer.bodyText).join(' '));
					const answeredErrorId = parsedOf(routeErrorAnswer).errorId;
					check('the server log keeps what the answer leaves out, under the same errorId', errorLogList.some((logText) => logText.includes(String(answeredErrorId)) && logText.includes('a failure naming')), errorLogList.slice(-2).join(' | '));

					// the contract: startApiServer.js mounts the module once, after the last route mount, so no route can come after it
					const serverSourceText = fs.readFileSync(path.join(__dirname, '..', 'startApiServer.js'), 'utf8');
					const mountIndex = serverSourceText.indexOf("expressApp.use(require('./lib/json-error-answer'))");
					const lastRouteMountIndex = serverSourceText.lastIndexOf("require('./lib/askmilo-utility')");
					check('startApiServer.js mounts json-error-answer once, after the last route mount (askmilo-utility)', mountIndex !== -1 && mountIndex === serverSourceText.lastIndexOf("expressApp.use(require('./lib/json-error-answer'))") && lastRouteMountIndex !== -1 && mountIndex > lastRouteMountIndex, `mountIndex ${mountIndex}, lastRouteMountIndex ${lastRouteMountIndex}`);

					const failedCount = resultList.filter((passed) => !passed).length;
					console.log(`json-error-no-stack: ${resultList.length - failedCount} passed, ${failedCount} failed`);
					server.close();
					process.exit(failedCount ? 1 : 0);
				});
			});
		});
	});
});
