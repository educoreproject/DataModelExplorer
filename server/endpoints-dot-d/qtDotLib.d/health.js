#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]

// GET /api/health, public. The process is alive if this answers, so the status is 200 whatever the graph is doing, and the
// body carries the graph's state: { graphState: 'connected' } | { graphState: 'waiting', goldenContainerName } |
// { graphState: 'notConfigured' }. See accessPoints.d/health.js.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, forwardArgs } = new require('qtools-asynchronous-pipe-plus')();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })));

		taskList.push((args, next) => {
			args.accessPointsDotD[moduleName]({}, (accessPointError, healthReport) => {
				if (accessPointError) {
					next(accessPointError, args);
					return;
				}
				next('', { ...args, healthReport });
			});
		});

		pipeRunner(taskList.getList(), { accessPointsDotD, permissionValidator }, (pipeError, args) => {
			if (pipeError) {
				const errorId = makeRefId(12);
				xLog.error(`${moduleName} error (${errorId}): ${pipeError}`);
				xRes.status(500).send(`${pipeError.toString()} (${errorId})`);
				return;
			}
			xRes.set('Cache-Control', 'no-store').send(args.healthReport);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	const method = 'get';
	const routePath = `${routingPrefix}${moduleName}`;
	const permissionValidator = accessTokenHeaderTools.getValidator(['public']);

	expressApp[method](routePath, serviceFunction(permissionValidator));
	endpointsDotD.logList.push(routePath);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
