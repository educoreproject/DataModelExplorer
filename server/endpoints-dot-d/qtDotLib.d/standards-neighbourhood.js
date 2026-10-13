#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SecurityFirstPattern]]

// standards-neighbourhood — POST /api/standards-neighbourhood { action, ... } for the PESC Explorer page (DEV-123).
// Logged-in users only. The browser sends an action and its parameters (a family name, a stableId, a list of
// stableIds), never Cypher: the queries are the standards-neighbourhood mapper's, run on the golden read-only handle.
// A refusal (an unknown action or stableId, a family the graph does not hold, a graph lacking a required label) is
// answered 400 with its text, so the page shows why instead of a blank screen. Answers [result].

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, forwardArgs } = new require('qtools-asynchronous-pipe-plus')();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		// STEP 1: PERMISSION VALIDATION (a failure here is answered 401)
		taskList.push((args, next) =>
			args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })),
		);
		taskList.push((args, next) => next('', { ...args, permissionPassed: true }));

		// STEP 2: THE STANDARDS-NEIGHBOURHOOD ACCESS POINT
		taskList.push((args, next) => {
			args.accessPointsDotD['standards-neighbourhood'](args.requestBody, (accessPointError, neighbourhoodResult) => {
				if (accessPointError) {
					next(accessPointError, args);
					return;
				}
				next('', { ...args, neighbourhoodResult });
			});
		});

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			requestBody: xReq.qtGetSurePath('body', {}),
			permissionPassed: false,
		};

		pipeRunner(taskList.getList(), initialData, (pipeError, args) => {
			if (pipeError) {
				const errorId = makeRefId(12);
				xLog.error(`${moduleName} error (${errorId}): ${pipeError}`);
				xRes.status(args && args.permissionPassed ? 400 : 401).send(`${pipeError.toString()} (${errorId})`);
				return;
			}
			xRes.send([args.neighbourhoodResult]);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	const method = 'post';
	const routePath = `${routingPrefix}${moduleName}`;
	const permissionValidator = accessTokenHeaderTools.getValidator(['user', 'client', 'admin']);

	expressApp[method](routePath, serviceFunction(permissionValidator));
	endpointsDotD.logList.push(routePath);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
