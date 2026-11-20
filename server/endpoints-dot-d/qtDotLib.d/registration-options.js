#!/usr/bin/env node
'use strict';

// registration-options.js — ENDPOINT GET /api/registrationOptions (public) (PLAN-userRegistrationReset-112026 4.1): tells
// the login page whether to offer "Create an account", and the register page whether to expect a confirmation step.
// Answers [{ selfRegistrationEnabled, requireEmailConfirmation, passwordResetEnabled }]. (The login form offers
// "Forgot password?" always; on a server without [user-registration] that request is refused registrationNotConfigured.)

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus, forwardArgs } = new require('qtools-asynchronous-pipe-plus')();

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();
		taskList.push((args, next) => args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })));
		taskList.push((args, next) => accessPointsDotD['user-registration-options']({}, (err, { registrationOptions } = {}) => next(err, { ...args, registrationOptions })));
		pipeRunner(taskList.getList(), { permissionValidator }, (err, args = {}) => {
			if (err) {
				xRes.status(500).send(`the registration options could not be read`);
				return;
			}
			xRes.send([args.registrationOptions]);
		});
	};

	const routePath = `${routingPrefix}registrationOptions`;
	expressApp.get(routePath, serviceFunction(accessTokenHeaderTools.getValidator(['public'])));
	endpointsDotD.logList.push(routePath);
	return {};
};

module.exports = moduleFunction;
