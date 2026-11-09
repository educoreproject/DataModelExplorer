#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// edc-resolve — GET /api/edc/<edc path> (edcResolverEndpoint-110226, briefing section 2). Public and read-only. It departs from the house on purpose:
// the body is the resolver's own object, byte-identical to stubResolverServer.js, not an array; the status is the resolver's own (200, 400, 404, 451, 500,
// 501), never the house 401 + text; this shell adds 405 and 406 and the access point adds 413, 503 and 504, each refused by name. It passes the request's
// path VERBATIM, never a decoded parameter: an edc: path may carry %XX, and the resolver reads ?page=N itself. Every status has a page for a browser.
// A stale token is read as no token here, since a public read must not refuse a visitor for what their browser remembers.
// ?format=json or ?format=html wins over Accept (WORKORDER-edcHumanPages-110926); it is taken out of the path before the resolver sees it, and a bad value is a 400 by name.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, forwardArgs } = new require('qtools-asynchronous-pipe-plus')();
const { answerTextFor, CONTENT_TYPE_BY_FORMAT } = require('../../lib/edc-resolver/htmlAnswer');
const { formatOverrideOf } = require('../../lib/edc-resolver/formatOverride');

const ANSWER_FORMAT_LIST = Object.keys(CONTENT_TYPE_BY_FORMAT);
const ROUTE_NAME = 'edc';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;
	const routeBasePath = `${routingPrefix}${ROUTE_NAME}`;

	const sendAnswer = (xRes, { httpStatus, contentType, extraHeaderByName, bodyText, deliverTo }) => {
		xRes.status(httpStatus);
		xRes.set({ ...extraHeaderByName, 'Content-Type': contentType });
		if (deliverTo) {
			deliverTo(xRes);
			return;
		}
		xRes.end(bodyText);
	};

	// a client may already have gone by the time a child is spawned, when 'close' will not fire again
	const whenClientGoneOf = (xRes) => (handler) => {
		if (xRes.destroyed) {
			handler();
			return;
		}
		xRes.on('close', handler);
	};

	// a refusal this shell makes itself, in the negotiated form
	const refusalAnswerFor = ({ httpStatus, errorText, answerFormat, requestPath, extraHeaderByName = {} }) => ({
		httpStatus,
		contentType: CONTENT_TYPE_BY_FORMAT[answerFormat],
		extraHeaderByName,
		bodyText: answerTextFor({ answerFormat, httpStatus, answerBody: { error: errorText }, requestPath }),
	});

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (permissionValidator) => (xReq, xRes) => {
		const taskList = new taskListPlus();

		xRes.vary('Accept');
		xRes.set('Access-Control-Allow-Origin', '*'); // public, read-only, GET only (ruling R5); this overrides the global cors() origin list

		// originalUrl with the route's own prefix cut off by length (routing is case-insensitive); an empty remainder is the root
		const urlRemainder = xReq.originalUrl.slice(routeBasePath.length);
		const formatOverride = formatOverrideOf({ edcRequestPath: urlRemainder.startsWith('/') ? urlRemainder : `/${urlRemainder}`, answerFormatList: ANSWER_FORMAT_LIST });
		const requestPath = formatOverride.refusalText === undefined ? formatOverride.edcRequestPath : `/${urlRemainder.replace(/^\//, '').split('?')[0]}`;

		// ?format= wins; else the first entry is the form when the client states no preference (*/*); no acceptable form is refused, never guessed
		const negotiatedFormat = formatOverride.overrideFormat || xReq.accepts(ANSWER_FORMAT_LIST);

		taskList.push((args, next) =>
			args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })),
		);

		taskList.push((args, next) => {
			if (formatOverride.refusalText !== undefined) {
				next('skipRestOfPipe', { ...args, resolverAnswer: refusalAnswerFor({ httpStatus: 400, answerFormat: negotiatedFormat || ANSWER_FORMAT_LIST[0], requestPath, errorText: formatOverride.refusalText }) });
				return;
			}
			if (negotiatedFormat === false) {
				next('skipRestOfPipe', { ...args, resolverAnswer: refusalAnswerFor({ httpStatus: 406, answerFormat: ANSWER_FORMAT_LIST[0], requestPath, errorText: `this resolver answers ${ANSWER_FORMAT_LIST.join(' or ')}; the Accept header '${xReq.get('Accept')}' takes neither` }) });
				return;
			}
			if (xReq.method !== 'GET') {
				next('skipRestOfPipe', { ...args, resolverAnswer: refusalAnswerFor({ httpStatus: 405, answerFormat: negotiatedFormat, requestPath, extraHeaderByName: { Allow: 'GET' }, errorText: `${xReq.method} is not served; the resolver answers GET` }) });
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => {
			args.accessPointsDotD['edc-resolver']({ edcRequestPath: args.edcRequestPath, answerFormat: negotiatedFormat, whenClientGone: whenClientGoneOf(xRes) }, (accessPointError, resolverAnswer) => {
				next(accessPointError, { ...args, resolverAnswer });
			});
		});

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			edcRequestPath: requestPath,
		};

		pipeRunner(taskList.getList(), initialData, (pipeError, args) => {
			if (pipeError && pipeError !== 'skipRestOfPipe') {
				const errorId = makeRefId(12);
				xLog.error(`${moduleName} error (${errorId}): ${pipeError}`);
				sendAnswer(xRes, refusalAnswerFor({ httpStatus: 500, answerFormat: negotiatedFormat || ANSWER_FORMAT_LIST[0], requestPath, errorText: `${moduleName}: the request failed (${errorId})` }));
				return;
			}
			sendAnswer(xRes, args.resolverAnswer);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	const permissionValidator = accessTokenHeaderTools.getValidator(['public']);
	// A mount, not a route with a named wildcard: Express decodes route parameters before any handler, so '/api/edc/{*edcPath}' answered a malformed
	// escape (%ZZ) with its own HTML 400 where the resolver must refuse it by name. A mount decodes nothing, takes every method and stops at a path boundary.
	expressApp.use(routeBasePath, serviceFunction(permissionValidator));
	endpointsDotD.logList.push(routeBasePath);
	accessTokenHeaderTools.declareTokenTolerantPathPrefix(`${routeBasePath}/`);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
