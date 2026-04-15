#!/usr/bin/env node
'use strict';
// @concept: [[UseCaseEditor]]
// @concept: [[PermissionValidation]]

// Use Case Editor HTTP endpoint. Dispatches on ?action= to the `use-case-editor`
// access point. Permission: ['admin'] — a power tool.

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
	const { xLog } = process.global;
	const {
		expressApp,
		accessTokenHeaderTools,
		accessPointsDotD,
		routingPrefix,
	} = passThroughParameters;

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: PERMISSION VALIDATION

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				forwardArgs({ next, args }),
			),
		);

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: EXTRACT REQUEST PAYLOAD
		// GET: action + id in query string
		// POST: action in query string, body carries the save payload

		taskList.push((args, next) => {
			const xQuery = {
				...xReq.qtGetSurePath('query', {}),
				...xReq.qtGetSurePath('body', {})
			};
			next('', { ...args, xQuery });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: DELEGATE TO ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD, xQuery } = args;
			const localCallback = (err, result) => {
				next(err, { ...args, result });
			};
			accessPointsDotD['use-case-editor'](xQuery, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION

		const initialData = { accessPointsDotD, permissionValidator };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { result } = args;

			if (err) {
				const errorId = `Q${Math.floor(Math.random() * 1e19)}`;
				const status = err.toString().match(/permission|authclaim|unauth/i) ? 401
					: err.toString().match(/not yet implemented|unknown action|invalid|requires|required|undeclared|read-only|system-managed|validation|No UseCase/i) ? 400
					: 500;
				xRes.status(status).send(`${err.toString()} (${errorId})`);
				return;
			}

			xRes.send(Array.isArray(result) ? result : [result]);
		});
	};

	// ================================================================================
	// REGISTRATION

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

	const method = 'get';
	const thisEndpointName = moduleName;
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;

	const permissionValidator = accessTokenHeaderTools.getValidator(['admin', 'super']);
	addEndpoint({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	});

	// POST variant for save payloads (Phase 3+).
	expressApp.post(routePath, serviceFunction(permissionValidator));

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
