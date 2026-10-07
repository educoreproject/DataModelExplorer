#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SecurityFirstPattern]]

// dme-list-standards — GET /api/dme-list-standards for the Data Model Explorer welcome screen (WEL, 2026-10-07).
// Logged-in users only (the explorer page is behind the auth middleware). Answers [standardInventory] — the
// dme-list-standards access point's object in a one-element array. When the graph cannot answer, 503 with the refusal
// text, so the page can say "standards list unavailable: <reason>".

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

		// STEP 2: THE DME-LIST-STANDARDS ACCESS POINT
		taskList.push((args, next) => {
			args.accessPointsDotD['dme-list-standards']({}, (accessPointError, standardInventory) => {
				if (accessPointError) {
					next(accessPointError, args);
					return;
				}
				next('', { ...args, standardInventory });
			});
		});

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			permissionPassed: false,
		};

		pipeRunner(taskList.getList(), initialData, (pipeError, args) => {
			if (pipeError) {
				const errorId = makeRefId(12);
				xLog.error(`${moduleName} error (${errorId}): ${pipeError}`);
				xRes.status(args && args.permissionPassed ? 503 : 401).send(`${pipeError.toString()} (${errorId})`);
				return;
			}
			xRes.send([args.standardInventory]);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	const method = 'get';
	const routePath = `${routingPrefix}${moduleName}`;
	const permissionValidator = accessTokenHeaderTools.getValidator(['user', 'client', 'admin']);

	expressApp[method](routePath, serviceFunction(permissionValidator));
	endpointsDotD.logList.push(routePath);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
