#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// resend-confirmation.js — ENDPOINT POST /api/resendConfirmation (public), body { identifier }: a username or an
// email address (PLAN-userRegistrationReset-112026 4.3). The work is in the user-registration-resend access point.
//
// THE ANSWER IS THE SAME whether or not an account matched: 200 and [{ message }] with the vocabulary's
// confirmationResent text, byte for byte. Only a refusal that cannot depend on the account (tooManyRequests, a malformed identifier,
// registration not configured) answers otherwise, as { refusalName, reason } with its status; and, as on the reset form
// (WORKORDER-accountMailFailureAndApprovalNotice-112326 M3), a link whose mail failed to go answers 503
// accountMailNotSent. The client address is
// req.ip, which `trust proxy 1` in startApiServer.js makes the address nginx saw; no header is read here.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, forwardArgs } = new require('qtools-asynchronous-pipe-plus')();
const { accountReplyOf } = require('../../lib/user-account-mail');

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })));

		taskList.push((args, next) => {
			const requestBody = xReq.qtGetSurePath('body', {});
			accessPointsDotD['user-registration-resend']({ identifier: requestBody.identifier, clientAddress: xReq.ip }, (err, { refusal } = {}) => next(err, { ...args, refusal }));
		});

		pipeRunner(taskList.getList(), { permissionValidator }, (err, args = {}) => {
			if (args.refusal) {
				xRes.status(args.refusal.httpStatus).send({ refusalName: args.refusal.refusalName, reason: args.refusal.reason });
				return;
			}
			if (err) {
				const errorRefId = makeRefId(12);
				xLog.error(`${moduleName} (${errorRefId}): ${err}`);
				xRes.status(500).send(`the request could not be completed (${errorRefId})`);
				return;
			}
			xRes.send([{ message: accountReplyOf('confirmationResent') }]);
		});
	};

	const routePath = `${routingPrefix}resendConfirmation`;
	expressApp.post(routePath, serviceFunction(accessTokenHeaderTools.getValidator(['public'])));
	endpointsDotD.logList.push(routePath);
	return {};
};

module.exports = moduleFunction;
