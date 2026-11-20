#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[JwtTokenManagement]]

// confirm-registration.js — ENDPOINT POST /api/confirmRegistration (public), body { token } (PLAN-userRegistrationReset-112026
// 4.3). The user-registration-confirm access point redeems the emailed link and activates the account; this endpoint
// signs it in, as login does. Answers [{ message, user }], or { refusalName, reason } with its status.

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
			accessPointsDotD['user-registration-confirm']({ token: requestBody.token, clientAddress: xReq.ip }, (err, { user, refusal } = {}) => next(err, { ...args, user, refusal }));
		});

		taskList.push((args, next) => accessTokenHeaderTools.refreshauthtoken({ xReq, xRes, payloadValues: { source: 'registrationConfirmed', user: args.user } }, (signError) => next(signError || '', args)));

		pipeRunner(taskList.getList(), { permissionValidator }, (err, args = {}) => {
			if (args.refusal) {
				xRes.status(args.refusal.httpStatus).send({ refusalName: args.refusal.refusalName, reason: args.refusal.reason });
				return;
			}
			if (err) {
				const errorRefId = makeRefId(12);
				xLog.error(`${moduleName} (${errorRefId}): ${err}`);
				xRes.status(500).send(`the address could not be confirmed (${errorRefId})`);
				return;
			}
			xRes.send([{ message: accountReplyOf('registrationConfirmed'), user: args.user }]);
		});
	};

	const routePath = `${routingPrefix}confirmRegistration`;
	expressApp.post(routePath, serviceFunction(accessTokenHeaderTools.getValidator(['public'])));
	endpointsDotD.logList.push(routePath);
	return {};
};

module.exports = moduleFunction;
