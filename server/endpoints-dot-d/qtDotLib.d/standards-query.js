#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// standards-query — /api/standards/v1/<routeName>, GET or POST as its registry row says, the public Query API (DESIGN-standardsQueryService-110326 section 2). One module, every route from the registry, no logic of
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
const { largeBodyJsonParserOf } = require('../../lib/large-body-json');
const { refusalWithSizeContact } = require('../../lib/standards-query/sizeRefusalContact');

const API_DOOR_NAME = 'api';
const LIMIT_CONFIG_SECTION_NAME = 'standards-query-limits';
const EDC_CONFIG_SECTION_NAME = 'edc-resolver';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const BODY_TOO_LARGE_ERROR_TYPE = 'entity.too.large';
const INPUT_READER_BY_HTTP_METHOD = Object.freeze({ GET: (xReq) => xReq.query, POST: (xReq) => xReq.body });

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

	// every spelling of a POST route that reaches serviceFunction with a body: the route, and the route with a trailing slash
	const largeBodyParserByRoutePath = apiDoorRowList.filter((registryRow) => registryRow.httpMethod === 'POST').flatMap((registryRow) => [`${routeBasePath}/${registryRow.routeName}`, `${routeBasePath}/${registryRow.routeName}/`]).reduce((soFar, routePath) => ({ ...soFar, [routePath.replace(routeBasePath, '')]: largeBodyJsonParserOf(routePath) }), {});

	const limitConfigValues = getConfig(LIMIT_CONFIG_SECTION_NAME);
	// no limits in this instance's config: the limiter is absent, and the core answers every route 503 serviceNotConfigured, so nothing runs unlimited
	const limitsAreGiven = /^[1-9][0-9]*$/.test(String(limitConfigValues.requestsPerMinute)) && /^[1-9][0-9]*$/.test(String(limitConfigValues.burstPerSecond));
	const requestLimiter = limitsAreGiven
		? createRequestLimiter({ requestsPerMinute: Number(limitConfigValues.requestsPerMinute), burstPerSecond: Number(limitConfigValues.burstPerSecond), nowMs: Date.now })
		: null;

	// a row that spends per request (rosetta/interpret calls a model) declares its own per-address limit in the registry, its numbers in config: a second limiter of the same kind,
	// keyed on req.ip as the first is. Numbers absent or bad leave that row refusing serviceNotConfigured by name, never running unlimited.
	const perAddressLimiterByRouteName = apiDoorRowList.filter((registryRow) => registryRow.perAddressLimit).reduce((soFar, registryRow) => {
		const { configSectionName, requestsPerMinuteSettingName, burstPerSecondSettingName } = registryRow.perAddressLimit;
		const sectionValues = getConfig(configSectionName) || {};
		const numberTextList = [sectionValues[requestsPerMinuteSettingName], sectionValues[burstPerSecondSettingName]];
		if (!numberTextList.every((numberText) => /^[1-9][0-9]*$/.test(String(numberText)))) {
			const absentReason = `[${configSectionName}] must give ${requestsPerMinuteSettingName} and ${burstPerSecondSettingName} as positive integers`;
			xLog.error(`${moduleName}: ${registryRow.routeName} is off: ${absentReason}`);
			return { ...soFar, [registryRow.routeName]: { absentReason } };
		}
		const [requestsPerMinute, burstPerSecond] = numberTextList.map(Number);
		return { ...soFar, [registryRow.routeName]: { requestsPerMinute, burstPerSecond, requestLimiter: createRequestLimiter({ requestsPerMinute, burstPerSecond, nowMs: Date.now }) } };
	}, {});

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
		bodyText: JSON.stringify({ answer: refusalWithSizeContact({ registry, contactAddress: (getConfig(EDC_CONFIG_SECTION_NAME) || {}).sizeRefusalContactAddress, refusal: { refusedByName: moduleName, refusalName, reason, ...extraFields } }) }),
		cachePolicy: 'noStore',
		retryAfterSeconds,
	});

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xReq, xRes) => {
		const taskList = new taskListPlus();
		xRes.set('Access-Control-Allow-Origin', '*'); // public and read-only; this overrides the global cors() origin list on these routes alone
		const routeName = xReq.path.replace(/^\/+|\/+$/g, '');
		const registryRow = registryRowByRouteName[routeName];

		const stopWith = (args, next, shellAnswer) => next('skipRestOfPipe', { ...args, standardsAnswer: shellAnswer });

		taskList.push((args, next) => {
			if (!registryRow) {
				stopWith(args, next, shellRefusal({ refusalName: 'unknownOperation', reason: `there is no route ${routeBasePath}/${routeName}`, extraFields: { validValueList: apiDoorRowList.map((oneRow) => oneRow.routeName) } }));
				return;
			}
			if (xReq.method !== registryRow.httpMethod) {
				xRes.set('Allow', registryRow.httpMethod);
				stopWith(args, next, shellRefusal({ refusalName: 'methodNotAllowed', reason: `${xReq.method} is not served here; ${registryRow.routeName} answers ${registryRow.httpMethod}` }));
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
			const perAddressLimit = perAddressLimiterByRouteName[registryRow.routeName];
			if (!perAddressLimit) {
				next('', args);
				return;
			}
			if (perAddressLimit.absentReason) {
				stopWith(args, next, shellRefusal({ refusalName: 'serviceNotConfigured', reason: `${registryRow.routeName} is off here: ${perAddressLimit.absentReason}` }));
				return;
			}
			const verdict = perAddressLimit.requestLimiter.admit(xReq.ip);
			if (!verdict.isAdmitted) {
				stopWith(args, next, shellRefusal({ refusalName: 'rateLimited', reason: `this address has reached the limit for ${registryRow.routeName} of ${perAddressLimit.requestsPerMinute} a minute and ${perAddressLimit.burstPerSecond} a second; retry after ${verdict.retryAfterSeconds} seconds`, retryAfterSeconds: verdict.retryAfterSeconds }));
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

		taskList.push((args, next) => admitRequest({ door: API_DOOR_NAME, credential: xReq.appValueGetter('authclaims'), clientAddress: xReq.ip, operationName: registryRow.operationName, registryRow }, (admitError, admission) => {
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

		// a body is read only here, after the limiter and admission, under the route's own limit (lib/large-body-route-list.json). A body over it, or not JSON, is refused by name in this API's form.
		taskList.push((args, next) => {
			if (registryRow.httpMethod !== 'POST') {
				next('', args);
				return;
			}
			largeBodyParserByRoutePath[xReq.path](xReq, xRes, (parseError) => {
				if (!parseError) {
					next('', args);
					return;
				}
				stopWith(args, next, parseError.type === BODY_TOO_LARGE_ERROR_TYPE
					? shellRefusal({ refusalName: 'inputTooLong', reason: `this request's body is over the ${registryRow.routeName} limit of ${registryRow.bodyLimitText}`, extraFields: { maxLength: registryRow.bodyLimitText } })
					: shellRefusal({ refusalName: 'invalidInput', reason: 'the request body is not JSON' }));
			});
		});

		taskList.push((args, next) => {
			const operationInput = INPUT_READER_BY_HTTP_METHOD[registryRow.httpMethod](xReq);
			if (operationInput === null || typeof operationInput !== 'object' || Array.isArray(operationInput)) {
				stopWith(args, next, shellRefusal({ refusalName: 'invalidInput', reason: 'the request body must be one JSON object' }));
				return;
			}
			accessPointsDotD['standards-query']({ operationName: registryRow.operationName, input: operationInput, principal: args.principal }, (accessPointError, standardsAnswer) => next(accessPointError, { ...args, standardsAnswer }));
		});

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
