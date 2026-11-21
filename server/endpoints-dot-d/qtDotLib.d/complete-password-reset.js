#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[JwtTokenManagement]]

// complete-password-reset.js — ENDPOINT POST /api/completePasswordReset (public), body { token, password }
// (PLAN-userRegistrationReset-112026 4.4). The password-reset-complete access point redeems the link, saves the new
// password and ends every earlier session; this endpoint then signs the user in fresh, as login does
// (refreshauthtoken reads the account's new revocation cutoff from the user row, so the new token is signed at or after
// it). Answers [{ message, user }], or { refusalName, reason } with the refusal's status.

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
			accessPointsDotD['password-reset-complete']({ token: requestBody.token, password: requestBody.password, clientAddress: xReq.ip }, (err, { user, refusal } = {}) => next(err, { ...args, user, refusal }));
		});

		taskList.push((args, next) => accessTokenHeaderTools.refreshauthtoken({ xReq, xRes, payloadValues: { source: 'passwordReset', user: args.user } }, (signError) => next(signError || '', args)));

		pipeRunner(taskList.getList(), { permissionValidator }, (err, args = {}) => {
			if (args.refusal) {
				xRes.status(args.refusal.httpStatus).send({ refusalName: args.refusal.refusalName, reason: args.refusal.reason });
				return;
			}
			if (err) {
				const errorRefId = makeRefId(12);
				xLog.error(`${moduleName} (${errorRefId}): ${err}`);
				xRes.status(500).send(`the password could not be reset (${errorRefId})`);
				return;
			}
			xRes.send([{ message: accountReplyOf('passwordResetDone'), user: args.user }]);
		});
	};

	const routePath = `${routingPrefix}completePasswordReset`;
	expressApp.post(routePath, serviceFunction(accessTokenHeaderTools.getValidator(['public'])));
	endpointsDotD.logList.push(routePath);
	return {};
};

module.exports = moduleFunction;
