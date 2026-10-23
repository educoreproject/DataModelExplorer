#!/usr/bin/env node
'use strict';
// @concept: [[StandardsIntegration]]
// @concept: [[SecurityFirstPattern]]

/**
 * ENDPOINT: CEDS ONTOLOGY
 *
 * Accepts a JSON body describing a CEDS ontology action and delegates
 * to the ceds-ontology access point, which spawns ceds1.js.
 *
 * Route: POST /api/cedsOntology
 * Permission: ['user', 'client', 'admin']
 *
 * Request body: { action: "lookup", args: ["student"], options: { limit: ["5"] } }
 * Response: JSON array containing the ceds1 result object
 */

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
	const localConfig = getConfig(moduleName);

	const {
		expressApp,
		accessTokenHeaderTools,
		accessPointsDotD,
		routingPrefix,
	} = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
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
		// STEP 2: CALL CEDS-ONTOLOGY ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD, requestBody } = args;

			const localCallback = (err, result) => {
				if (err) {
					next(`CEDS ontology query failed: ${err}`, args);
					return;
				}
				next('', { ...args, result });
			};

			accessPointsDotD['ceds-ontology'](requestBody, localCallback);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE AND HANDLE RESPONSE

		const requestBody = xReq.body || {};

		const initialData = {
			accessPointsDotD,
			requestBody,
			permissionValidator,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = makeRefId(12);
				xLog.error(`CEDS ontology error (${errorId}): ${err}`);
				xRes.status(401).send(`${err.toString()} (${errorId})`);
				return;
			}

			const { result } = args;
			const cedsResult = result.cedsResult || {};

			// Always return array for consistent client handling
			xRes.send(Array.isArray(cedsResult) ? cedsResult : [cedsResult]);
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

	const method = 'post';
	const thisEndpointName = moduleName;
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;

	const permissionValidator = accessTokenHeaderTools.getValidator([
		'user',
		'client',
		'admin',
	]);

	addEndpoint({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	});

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
