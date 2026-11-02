'use strict';
// @concept: [[CompanionPages]]
// @concept: [[SecurityFirstPattern]]
//
// companion-endpoint-registrar.js — the one shape of the companion-* endpoints (SPEC-companionPages-102826), after
// lib/rater-endpoint-registrar.js, so each endpoint file differs only in its name, roles and how it reads the request:
//   1. permission first (accessTokenHeaderTools.getValidator(roleList)); a failure is HTTP 401;
//   2. for a route in large-body-route-list.json, the body is parsed HERE, after the permission check (the global
//      parser skips the route), so a caller who fails step 1 never has a large body parsed;
//   3. the request, read by requestOf({ requestBody, authclaims }) -> { accessRequest } or { refusalText };
//   4. the access point; its error is HTTP 400 '<text> (<errorId>)';
//   5. the answer: answerKind 'array' sends the result as an array; answerKind 'file' sends the bytes with their
//      media type, Content-Disposition attachment and X-Source-Sha256.
//
//   registerCompanionEndpoint({ passThroughParameters, endpointsDotD, thisEndpointName, accessPointName, roleList, requestOf, answerKind })
//   unknownPropertyRefusalOf({ requestBody, allowedPropertyList }) -> '' or a refusal naming the unexpected properties

const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
const makeRefId = require('./make-ref-id');
const { isLargeBodyRoute, largeBodyJsonParserOf } = require('./large-body-json');

const ANSWER_KIND_LIST = ['array', 'file'];

const sendAnswerByKind = {
	array: (xRes, accessAnswer) => xRes.send(Array.isArray(accessAnswer) ? accessAnswer : [accessAnswer]),
	file: (xRes, accessAnswer) => {
		xRes.set('Content-Type', accessAnswer.mediaType);
		xRes.set('Content-Disposition', `attachment; filename="${String(accessAnswer.fileName).replace(/["\\\r\n]/g, '_')}"`);
		xRes.set('X-Source-Sha256', accessAnswer.sha256);
		xRes.send(accessAnswer.contentBuffer);
	},
};

const unknownPropertyRefusalOf = ({ requestBody, allowedPropertyList }) => {
	const unknownNameList = Object.keys(requestBody).filter((propertyName) => !allowedPropertyList.includes(propertyName));
	return unknownNameList.length ? `unexpected request propert${unknownNameList.length === 1 ? 'y' : 'ies'}: ${unknownNameList.join(', ')}` : '';
};

const registerCompanionEndpoint = ({ passThroughParameters, endpointsDotD, thisEndpointName, accessPointName, roleList, requestOf, answerKind }) => {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;
	if (!ANSWER_KIND_LIST.includes(answerKind)) {
		throw new Error(`companion-endpoint-registrar: ${thisEndpointName} answerKind '${answerKind}' is not one of ${ANSWER_KIND_LIST.join(', ')}`);
	}
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const permissionValidator = accessTokenHeaderTools.getValidator(roleList);
	const largeBodyJsonParser = isLargeBodyRoute(routePath) ? largeBodyJsonParserOf(routePath) : null;

	const serviceFunction = (xReq, xRes) => {
		const authclaims = xReq.appValueGetter('authclaims');
		const taskList = new taskListPlus();

		taskList.push((args, next) => permissionValidator(authclaims, (permissionError) => (permissionError ? next('notPermitted', { ...args, permissionError }) : next('', args))));

		taskList.push((args, next) => {
			if (!largeBodyJsonParser) {
				next('', args);
				return;
			}
			largeBodyJsonParser(xReq, xRes, (parseError) => next(parseError ? `the request body could not be read (${parseError.type || parseError.message})` : '', args));
		});

		taskList.push((args, next) => {
			const { accessRequest, refusalText } = requestOf({ requestBody: xReq.qtGetSurePath('body', {}) || {}, authclaims });
			next(refusalText || '', { ...args, accessRequest });
		});

		taskList.push((args, next) => accessPointsDotD[accessPointName](args.accessRequest, (accessError, accessAnswer) => next(accessError, { ...args, accessAnswer })));

		pipeRunner(taskList.getList(), {}, (err, args) => {
			const errorId = makeRefId(12);
			if (err === 'notPermitted') {
				xRes.status(401).send(`notPermitted: ${args.permissionError} (${errorId})`);
				return;
			}
			if (err) {
				xLog.error(`${thisEndpointName} refused (${errorId}): ${err}`);
				xRes.status(400).send(`${err} (${errorId})`);
				return;
			}
			sendAnswerByKind[answerKind](xRes, args.accessAnswer);
		});
	};

	expressApp.post(routePath, serviceFunction);
	endpointsDotD.logList.push(routePath);
};

module.exports = { registerCompanionEndpoint, unknownPropertyRefusalOf };
