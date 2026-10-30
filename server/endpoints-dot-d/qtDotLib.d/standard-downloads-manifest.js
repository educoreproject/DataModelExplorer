#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SecurityFirstPattern]]

// standard-downloads-manifest — POST /api/standard-downloads-manifest { family?, group?, standardKey?, facet? } for the
// Downloads page and the Standards Explorer's Downloads section (WORKORDER-standardDownloads-101526 §3b). Public (TQ, 2026-10-30:
// "all public"), a bad token read as no token. Answers [{ graphName, graphContractSha256, generatedAt, filterList, entryList }]
// from the standard-downloads access point, which refuses by name (400, with its text) when the downloads are not the
// golden's own, a filter is unknown, or none have been generated.

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

		// STEP 2: THE MANIFEST, FILTERED (the filters are the request body's own fields; the action is this endpoint's)
		taskList.push((args, next) => {
			args.accessPointsDotD['standard-downloads']({ ...args.requestBody, action: 'manifest' }, (accessPointError, manifestResult) => {
				if (accessPointError) {
					next(accessPointError, args);
					return;
				}
				next('', { ...args, manifestResult });
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
			xRes.send([args.manifestResult]);
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
