#!/usr/bin/env node
'use strict';
// @concept: [[SessionPersistence]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();
const { largeBodyJsonParserOf } = require('../../lib/large-body-json');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({
	dotD: endpointsDotD,
	passThroughParameters,
}) {
	// ================================================================================
	// INITIALIZATION

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
		// PERMISSION VALIDATION

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				forwardArgs({ next, args }),
			),
		);

		// --------------------------------------------------------------------------------
		// PARSE THE BODY (this route is in large-body-route-list.json, so the global JSON parser skipped it;
		// a saved DME session outgrows the global 100 kb limit after a few long answers)

		taskList.push((args, next) => {
			const { largeBodyJsonParser } = args;
			largeBodyJsonParser(xReq, xRes, (parseError) => {
				if (parseError) {
					const refusalName = parseError.type === 'entity.too.large' ? 'bodyTooLarge' : 'bodyNotParsable';
					next(refusalName, { ...args, parseErrorStatus: parseError.status || 400 });
					return;
				}
				next('', args);
			});
		});

		// --------------------------------------------------------------------------------
		// CALL ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;
			const authClaims = xReq.appValueGetter('authclaims');
			const userRefId = authClaims.qtGetSurePath('user.refId', '');
			const { refId, sessionData } = xReq.qtGetSurePath('body', {}) || {};

			if (!Array.isArray(sessionData)) {
				next('sessionData must be a list of turns', { ...args, isInputRefused: true });
				return;
			}

			const localCallback = (err, result) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, result });
			};

			accessPointsDotD['dme-session-save']({ userRefId, refId, sessionData }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// INIT AND EXECUTE THE PIPELINE

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			largeBodyJsonParser,
		};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { result, parseErrorStatus, isInputRefused } = args;

			if (err && parseErrorStatus) {
				xLog.error(`${moduleName}: request body refused (${err}, status ${parseErrorStatus})`);
				xRes.status(parseErrorStatus).json({ refusalName: err });
				return;
			}

			if (err && isInputRefused) {
				xRes.status(400).send(`${err.toString()}`);
				return;
			}

			if (err) {
				xRes.status(401).send(`${err.toString()}`);
				return;
			}

			xRes.send([result]);
		});
	};

	// ================================================================================
	// Endpoint Constructor

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
	// Do the constructing

	const method = 'post';
	const thisEndpointName = 'dmeSessionSave';
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;
	const largeBodyJsonParser = largeBodyJsonParserOf(routePath); // throws at startup if the route is missing from the registry

	const permissionValidator = accessTokenHeaderTools.getValidator([
		'user',
		'client',
		'admin',
		'super',
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
