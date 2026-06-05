#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SecurityFirstPattern]]
// @concept: [[UserGraphSeam]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({
	dotD: endpointsDotD,
	passThroughParameters,
}) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const {
		expressApp,
		accessTokenHeaderTools,
		accessPointsDotD,
		routingPrefix,
	} = passThroughParameters;

	// The User-mode graph leg. Parallel to dme-cypher-query, never a modification of
	// it. The access point now runs through the getUserGraph seam (03) and returns
	// { result, identityMarker, containerName } alongside the query result. We surface
	// the (non-secret) identity fields as response headers so a caller can verify the
	// seam's handle without the body changing and without the bolt secret ever leaving
	// the server — graphConnection is NOT part of identityMarker.
	const setHandleHeaders = (xRes, identityMarker, containerName) => {
		const marker = identityMarker || {};
		xRes.set('X-DME-Graph-Mode', 'user');
		xRes.set('X-DME-User-RefId', marker.userRefId || '');
		xRes.set('X-DME-Username', marker.username || '');
		xRes.set('X-DME-Version-RefId', marker.versionRefId || '');
		xRes.set('X-DME-Version-Name', marker.versionName || '');
		xRes.set('X-DME-Container', containerName || '');
	};

	// ================================================================================
	// SERVICE FUNCTION (GET — schema retrieval)

	const getServiceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// STEP 1: PERMISSION VALIDATION

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				forwardArgs({ next, args }),
			),
		);

		// --------------------------------------------------------------------------------
		// STEP 2: RESOLVE userRefId FROM JWT + CALL ACCESS POINT (via the seam)

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const authClaims = xReq.appValueGetter('authclaims');
			const userRefId = authClaims.qtGetSurePath('user.refId', '');
			const username = authClaims.qtGetSurePath('user.username', '');

			const xQuery = xReq.qtGetSurePath('query', {});
			const queryData = {
				action: xQuery.action || 'schema',
				versionRefId: xQuery.versionRefId,
				userRefId,
				username,
			};

			const localCallback = (err, payload) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, payload });
			};

			accessPointsDotD['dme-user-cypher-query'](queryData, localCallback);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE AND HANDLE RESPONSE

		const initialData = {
			accessPointsDotD,
			permissionValidator,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`dme-user-cypher-query GET error (${errorId}): ${err}`);
				xRes.status(401).send(`${err.toString()} (${errorId})`);
				return;
			}

			const { payload } = args;
			const { result, identityMarker, containerName } = payload || {};
			setHandleHeaders(xRes, identityMarker, containerName);
			xRes.send(Array.isArray(result) ? result : [result]);
		});
	};

	// ================================================================================
	// SERVICE FUNCTION (POST — query execution)

	const postServiceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// STEP 1: PERMISSION VALIDATION

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				forwardArgs({ next, args }),
			),
		);

		// --------------------------------------------------------------------------------
		// STEP 2: RESOLVE userRefId FROM JWT + CALL ACCESS POINT (via the seam)

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const authClaims = xReq.appValueGetter('authclaims');
			const userRefId = authClaims.qtGetSurePath('user.refId', '');
			const username = authClaims.qtGetSurePath('user.username', '');

			const body = xReq.body || {};
			const queryData = {
				action: body.action || 'query',
				query: body.query,
				params: body.params || {},
				versionRefId: body.versionRefId,
				userRefId,
				username,
			};

			const localCallback = (err, payload) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, payload });
			};

			accessPointsDotD['dme-user-cypher-query'](queryData, localCallback);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE AND HANDLE RESPONSE

		const initialData = {
			accessPointsDotD,
			permissionValidator,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`dme-user-cypher-query POST error (${errorId}): ${err}`);
				xRes.status(401).send(`${err.toString()} (${errorId})`);
				return;
			}

			const { payload } = args;
			const { result, identityMarker, containerName } = payload || {};
			setHandleHeaders(xRes, identityMarker, containerName);
			xRes.send(Array.isArray(result) ? result : [result]);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	const addEndpoint = ({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	}) => {
		expressApp[method](routePath, serviceFunction(permissionValidator));
		endpointsDotD.logList.push(name);
	};

	// ================================================================================
	// ENDPOINT CONFIGURATION

	const thisEndpointName = moduleName;
	const routePath = `${routingPrefix}${thisEndpointName}`;

	// Authenticated. A logged-in user is required; the access point receives the
	// JWT-resolved userRefId. Same role set as the per-user session endpoints.
	const permissionValidator = accessTokenHeaderTools.getValidator([
		'user',
		'client',
		'admin',
		'super',
	]);

	// Register GET route (schema retrieval)
	addEndpoint({
		name: `${routePath} [GET]`,
		method: 'get',
		routePath,
		serviceFunction: getServiceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	});

	// Register POST route (query execution)
	addEndpoint({
		name: `${routePath} [POST]`,
		method: 'post',
		routePath,
		serviceFunction: postServiceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	});

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
