#!/usr/bin/env node
'use strict';

/**
 * ENDPOINT: GET LIBRARY PAGE
 *
 * Returns the HTML content of a single document from the upload library.
 * Requires user authentication. Validates the filename parameter for safety.
 *
 * Route: GET /api/getLibraryPage?filename=X
 * Permission: ['user']
 *
 * Error cases:
 * - Missing filename: 400 "filename parameter required"
 * - Path traversal attempt: 400 "invalid filename"
 * - File not found: 404 "file not found"
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
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
		// STEP 2: VALIDATE FILENAME PARAMETER

		taskList.push((args, next) => {
			const { xQuery } = args;
			const filename = xQuery.filename;

			if (!filename) {
				next('filename parameter required', args);
				return;
			}

			// Reject path traversal attempts at the endpoint level too
			if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
				next('invalid filename', args);
				return;
			}

			next('', { ...args, filename });
		});

		// --------------------------------------------------------------------------------
		// STEP 3: FETCH PAGE CONTENT VIA ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD, filename } = args;

			const localCallback = (err, result) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, result });
			};

			accessPointsDotD['library-page']({ filename }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE AND HANDLE RESPONSE

		const xQuery = xReq.qtGetSurePath('query', {});
		const initialData = {
			accessPointsDotD,
			permissionValidator,
			xQuery,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = Math.random().toString().slice(2);
				const errString = err.toString();

				// Map specific errors to appropriate HTTP status codes
				if (errString === 'filename parameter required' || errString === 'invalid filename') {
					xRes.status(400).send(`${errString} (${errorId})`);
					return;
				}

				if (errString === 'file not found') {
					xRes.status(404).send(`${errString} (${errorId})`);
					return;
				}

				// Permission errors and other failures
				xLog.error(`Library page error (${errorId}): ${err}`);
				xRes.status(401).send(`${errString} (${errorId})`);
				return;
			}

			const { result } = args;

			// Always return array for consistent client handling
			xRes.send([result]);
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

	const method = 'get';
	const thisEndpointName = moduleName;
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;

	const permissionValidator = accessTokenHeaderTools.getValidator(['user', 'client', 'admin']);

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
