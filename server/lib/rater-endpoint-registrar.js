'use strict';

// rater-endpoint-registrar.js — the CEDS Rater endpoints' one shape (lane RATER, 2026-10-14), so the eight rater-*
// endpoint files differ only in their name, roles and how they read the request:
//   1. permission first (accessTokenHeaderTools.getValidator(roleList));
//   2. the request, read by requestOf({ requestBody, authclaims }) — for a rater endpoint the rater is ALWAYS the
//      token's own username, never a name from the body, so one rater cannot read or write another's answers;
//   3. the access point;
//   4. the answer: an array on success; a refusal is HTTP 400 '<refusalName>: <refusalText> (<errorId>)'; a permission
//      failure 401; a tool failure 500.
//
//   registerRaterEndpoint({ passThroughParameters, endpointsDotD, thisEndpointName, accessPointName, roleList, requestOf })

const { pipeRunner, taskListPlus, forwardArgs } = new (require('qtools-asynchronous-pipe-plus'))();
const makeRefId = require('./make-ref-id');

const registerRaterEndpoint = ({ passThroughParameters, endpointsDotD, thisEndpointName, accessPointName, roleList, requestOf }) => {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;
	const permissionValidator = accessTokenHeaderTools.getValidator(roleList);

	const serviceFunction = (xReq, xRes) => {
		const authclaims = xReq.appValueGetter('authclaims');
		const taskList = new taskListPlus();
		taskList.push((args, next) => permissionValidator(authclaims, { showDetails: false }, (permissionError) => (permissionError ? next('notPermitted', { ...args, permissionError }) : next('', args))));
		taskList.push((args, next) => next('', { ...args, accessRequest: requestOf({ requestBody: xReq.qtGetSurePath('body', {}) || {}, authclaims }) }));
		taskList.push((args, next) => accessPointsDotD[accessPointName](args.accessRequest, (accessError, accessAnswer) => next(accessError, { ...args, accessAnswer })));
		pipeRunner(taskList.getList(), {}, (err, args) => {
			const errorId = makeRefId(12);
			if (err === 'notPermitted') {
				xRes.status(401).send(`notPermitted: ${args.permissionError} (${errorId})`);
				return;
			}
			if (err) {
				xLog.error(`${thisEndpointName} failed (${errorId}): ${err}`);
				xRes.status(500).send(`raterToolFailed: the rater tool could not answer; nothing was changed by this request unless it says so (${errorId})`);
				return;
			}
			if (args.accessAnswer && args.accessAnswer.refusal) {
				xRes.status(400).send(`${args.accessAnswer.refusal.refusalName}: ${args.accessAnswer.refusal.refusalText} (${errorId})`);
				return;
			}
			xRes.send(Array.isArray(args.accessAnswer) ? args.accessAnswer : [args.accessAnswer]);
		});
	};

	const routePath = `${routingPrefix}${thisEndpointName}`;
	expressApp.post(routePath, serviceFunction);
	endpointsDotD.logList.push(routePath);
};

module.exports = { registerRaterEndpoint };
