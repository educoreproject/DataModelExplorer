#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SecurityFirstPattern]]

// quality-report-file — POST /api/quality-report-file { reportFolderName, downloadName, certificateStem? } for the
// Certification page's download buttons (TQ 2026-11-08: "a download option is a good idea"). downloadName is one of the
// quality-reports mapper's DOWNLOAD_BY_NAME (the report as markdown, HTML or data; a certificate as markdown or HTML).
// Public, like the downloads (a bad token read as no token). Answers the file's bytes, or the access point's named refusal
// (400, with its text).

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

		// STEP 2: THE FILE, BY REGISTERED DOWNLOAD NAME ONLY (nothing from the request is used as a path)
		taskList.push((args, next) => {
			args.accessPointsDotD['quality-reports']({ action: 'file', reportFolderName: args.requestBody.reportFolderName, downloadName: args.requestBody.downloadName, certificateStem: args.requestBody.certificateStem }, (accessPointError, fileResult) => {
				if (accessPointError) {
					next(accessPointError, args);
					return;
				}
				next('', { ...args, fileResult });
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
			xRes.set('Content-Type', args.fileResult.contentType);
			xRes.set('Content-Disposition', `attachment; filename="${args.fileResult.fileName}"`);
			xRes.send(args.fileResult.contentBuffer);
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
