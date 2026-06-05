#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SecurityFirstPattern]]

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
	// it — the standard read path stays exactly as it is. A response header marks the
	// user leg so a caller can prove the user endpoint (not the standard one) served
	// the request, without altering the response body.
	const graphModeHeaderName = 'X-DME-Graph-Mode';

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
		// STEP 2: CALL ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const xQuery = xReq.qtGetSurePath('query', {});
			const queryData = {
				action: xQuery.action || 'schema',
			};

			const localCallback = (err, result) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, result });
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

			const { result } = args;
			xRes.set(graphModeHeaderName, 'user');
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
		// STEP 2: CALL ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const body = xReq.body || {};
			const queryData = {
				action: body.action || 'query',
				query: body.query,
				params: body.params || {},
				versionRefId: body.versionRefId,
			};

			const localCallback = (err, result) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, result });
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

			const { result } = args;
			xRes.set(graphModeHeaderName, 'user');
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

	// Phase 1: public, to smoke-test the proxy against the standard graph without auth.
	// Phase 2 changes this to an authenticated validator and resolves userRefId.
	const permissionValidator = accessTokenHeaderTools.getValidator(['public']);

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
