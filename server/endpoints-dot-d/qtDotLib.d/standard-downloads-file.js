#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SecurityFirstPattern]]

// standard-downloads-file — POST /api/standard-downloads-file { downloadId } (WORKORDER-standardDownloads-101526 §3b).
// Logged-in users only, the same roles as the explorer. Answers the zip itself, NOT an array: the one endpoint here whose
// body is a file, sent as application/zip with Content-Disposition: attachment. Only a downloadId the golden's manifest
// lists as available is served, from the manifest's own file name, after the standard-downloads access point has checked
// its sha256; every refusal (unknown id, unavailable, checksum mismatch, stale manifest) is answered 400 with its text.
// The sha256 also travels in the X-Download-Sha256 header, so a client can check what it received.

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

		// STEP 2: THE FILE, BY ID ONLY
		taskList.push((args, next) => {
			args.accessPointsDotD['standard-downloads']({ action: 'file', downloadId: args.requestBody.downloadId }, (accessPointError, fileResult) => {
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
			xRes.set('Content-Type', 'application/zip');
			xRes.set('Content-Disposition', `attachment; filename="${args.fileResult.fileName}"`);
			xRes.set('X-Download-Sha256', args.fileResult.sha256);
			xRes.send(args.fileResult.contentBuffer);
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
