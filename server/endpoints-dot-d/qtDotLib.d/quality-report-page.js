#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SecurityFirstPattern]]

// quality-report-page — POST /api/quality-report-page { reportFolderName } for the Certification page (TQ 2026-11-08): one
// report's catalog entry and its report and certificates as document blocks, exactly as the generator wrote them. Public, like
// the downloads (a bad token read as no token). Answers [page] from the quality-reports access point, which refuses by name
// (400, with its text) a folder that is not a readable report.

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

		// STEP 2: THE PAGE, BY FOLDER NAME ONLY (the access point finds it among the catalog's own folders)
		taskList.push((args, next) => {
			args.accessPointsDotD['quality-reports']({ action: 'page', reportFolderName: args.requestBody.reportFolderName }, (accessPointError, pageResult) => {
				if (accessPointError) {
					next(accessPointError, args);
					return;
				}
				next('', { ...args, pageResult });
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
			xRes.send([args.pageResult]);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	const method = 'post';
	const routePath = `${routingPrefix}${moduleName}`;
	// public (TQ, 2026-10-30: "all public"); a stale or garbled token is read as no token on this route
	const permissionValidator = accessTokenHeaderTools.getValidator(['public']);
	accessTokenHeaderTools.declareTokenTolerantRoute(routePath);

	expressApp[method](routePath, serviceFunction(permissionValidator));
	endpointsDotD.logList.push(routePath);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
