#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// standards-query — GET /api/standards/v1/<routeName>, the public Query API (DESIGN-standardsQueryService-110326 section 2). One module, every route from the registry, no logic of
// its own: limit, admit, call the access point, send. The body is the core's text; the status is the core's. A mount, as the resolver's, so a wrong method or an unknown route is
// refused by name in JSON rather than by Express's HTML. A stale site token reads as no token: a public read must not refuse a visitor for what their browser remembers.
// The limiter is keyed on req.ip ONLY. Never read X-Forwarded-For here: a client writes that header, and `trust proxy 1` already made req.ip the address nginx saw.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const crypto = require('crypto');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const registry = require('../../lib/standards-query/standardsQueryOperations.json');
const { admitRequest } = require('../../lib/standards-query/admitRequest');
const { createRequestLimiter } = require('../../lib/standards-query/requestLimiter');

const API_DOOR_NAME = 'api';
const LIMIT_CONFIG_SECTION_NAME = 'standards-query-limits';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;
	const routeBasePath = `${routingPrefix}${registry.routeBasePath}`;
	const apiDoorRowList = registry.operationList.filter((registryRow) => registryRow.doorList.includes(API_DOOR_NAME));
	// a row may answer on more than one route: the bare root is an alias of about, in the registry
	const routeNameListOf = (registryRow) => [registryRow.routeName, ...(registryRow.aliasRouteNameList || [])];
	const registryRowByRouteName = apiDoorRowList.reduce((soFar, registryRow) => routeNameListOf(registryRow).reduce((soFarWithRoute, routeName) => ({ ...soFarWithRoute, [routeName]: registryRow }), soFar), {});
	const permissionValidatorByRouteName = Object.keys(registryRowByRouteName).reduce((soFar, routeName) => ({ ...soFar, [routeName]: accessTokenHeaderTools.getValidator(registryRowByRouteName[routeName].permissionList) }), {});

	const limitConfigValues = getConfig(LIMIT_CONFIG_SECTION_NAME);
	// no limits in this instance's config: the limiter is absent, and the core answers every route 503 serviceNotConfigured, so nothing runs unlimited
	const limitsAreGiven = /^[1-9][0-9]*$/.test(String(limitConfigValues.requestsPerMinute)) && /^[1-9][0-9]*$/.test(String(limitConfigValues.burstPerSecond));
	const requestLimiter = limitsAreGiven
		? createRequestLimiter({ requestsPerMinute: Number(limitConfigValues.requestsPerMinute), burstPerSecond: Number(limitConfigValues.burstPerSecond), nowMs: Date.now })
		: null;

	const sendAnswer = (xReq, xRes, { httpStatus, bodyText, cachePolicy, retryAfterSeconds }) => {
		const entityTag = `"${crypto.createHash('sha256').update(bodyText).digest('hex')}"`;
		xRes.set({
			'Cache-Control': registry.cacheControlByPolicy[cachePolicy],
			'Content-Type': JSON_CONTENT_TYPE,
			ETag: entityTag,
			...(retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {}),
		});
		if (httpStatus === 200 && xReq.get('If-None-Match') === entityTag) {
			xRes.status(304).end();
			return;
		}
		xRes.status(httpStatus).end(bodyText);
	};

	const shellRefusal = ({ refusalName, reason, retryAfterSeconds, extraFields = {} }) => ({
		httpStatus: registry.envelopeRefusalHttpStatusByName[refusalName],
		bodyText: JSON.stringify({ answer: { refusedByName: moduleName, refusalName, reason, ...extraFields } }),
		cachePolicy: 'noStore',
		retryAfterSeconds,
	});

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xReq, xRes) => {
		const taskList = new taskListPlus();
		xRes.set('Access-Control-Allow-Origin', '*'); // public, read-only, GET only; this overrides the global cors() origin list on these routes alone
		const routeName = xReq.path.replace(/^\/+|\/+$/g, '');
		const registryRow = registryRowByRouteName[routeName];

		const stopWith = (args, next, shellAnswer) => next('skipRestOfPipe', { ...args, standardsAnswer: shellAnswer });

		taskList.push((args, next) => {
			if (!registryRow) {
				stopWith(args, next, shellRefusal({ refusalName: 'unknownOperation', reason: `there is no route ${routeBasePath}/${routeName}`, extraFields: { validValueList: apiDoorRowList.map((oneRow) => oneRow.routeName) } }));
				return;
			}
			if (xReq.method !== 'GET') {
				xRes.set('Allow', 'GET');
				stopWith(args, next, shellRefusal({ refusalName: 'methodNotAllowed', reason: `${xReq.method} is not served; this API answers GET` }));
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => {
			if (!requestLimiter) {
				next('', args);
				return;
			}
			const verdict = requestLimiter.admit(xReq.ip);
			if (!verdict.isAdmitted) {
				stopWith(args, next, shellRefusal({ refusalName: 'rateLimited', reason: `this address has reached the limit of ${limitConfigValues.requestsPerMinute} requests a minute and ${limitConfigValues.burstPerSecond} a second; retry after ${verdict.retryAfterSeconds} seconds`, retryAfterSeconds: verdict.retryAfterSeconds }));
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => {
			const validatorRefusal = permissionValidatorByRouteName[routeName](xReq.appValueGetter('authclaims'));
			if (validatorRefusal) {
				stopWith(args, next, shellRefusal({ refusalName: 'notAuthorized', reason: `${registryRow.routeName} is for ${registryRow.permissionList.join(', ')} only` }));
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => admitRequest({ door: API_DOOR_NAME, credential: xReq.appValueGetter('authclaims'), operationName: registryRow.operationName, registryRow }, (admitError, admission) => {
			if (admitError) {
				next(admitError, args);
				return;
			}
			if (admission.refusal) {
				stopWith(args, next, shellRefusal({ refusalName: admission.refusal.refusalName, reason: admission.refusal.reason }));
				return;
			}
			next('', { ...args, principal: admission.principal });
		}));

		taskList.push((args, next) => accessPointsDotD['standards-query']({ operationName: registryRow.operationName, input: xReq.query, principal: args.principal }, (accessPointError, standardsAnswer) => next(accessPointError, { ...args, standardsAnswer })));

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError && pipeError !== 'skipRestOfPipe') {
				const errorRefId = makeRefId(12);
				xLog.error(`${moduleName} error (${errorRefId}): ${pipeError}`);
				sendAnswer(xReq, xRes, shellRefusal({ refusalName: 'queryFailed', reason: `the request failed (${errorRefId})` }));
				return;
			}
			sendAnswer(xReq, xRes, args.standardsAnswer);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	expressApp.use(routeBasePath, serviceFunction);
	endpointsDotD.logList.push(routeBasePath);
	accessTokenHeaderTools.declareTokenTolerantPathPrefix(`${routingPrefix}standards/`);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
