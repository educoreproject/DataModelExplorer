#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[JwtTokenManagement]]

// register-user.js — ENDPOINT POST /api/registerUser (public), body { username, password, first, last, emailAdr }
// (PLAN-userRegistrationReset-112026 4.3). Only those five are passed on: a role, disabled or refId in the body never
// reaches the access point (user-registration-register), which sets the role from configuration.
// With requireEmailConfirmation the reply is [{ message }] ("check your email"); without it the new account is signed in
// here, as login does, and the reply is [{ message, user }]. A refusal answers { refusalName, reason } with its status.
// With requireAdminApproval (WORKORDER-adminApproval-112126) the account is never signed in here: the reply says the
// application goes to an approver after confirmation, or (confirmation off) [{ message, isAwaitingApproval: true }].

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus, forwardArgs } = new require('qtools-asynchronous-pipe-plus')();
const { accountReplyOf } = require('../../lib/user-account-mail');

// the five, and A8's optional applicationComment (WORKORDER-adminApproval-112126)
const REGISTRATION_PROPERTY_NAME_LIST = Object.freeze(['username', 'password', 'first', 'last', 'emailAdr', 'applicationComment']);

// the reply for each outcome (WORKORDER-adminApproval-112126 adds the two that await an approver); only a signed-in reply
// carries the user. isAwaitingApproval says the page should tell the visitor their application is out for approval;
// isApprovalAfterConfirmation that it will be once the address is confirmed (WORKORDER-accountMailFailureAndApprovalNotice-
// 112326 M4: the page sets either message apart). mailOutcome 'accountMailNotSent' (M3): the account exists but its
// confirmation mail did not go, so the message says to ask for a new link.
const replyOfRegistration = ({ isSignedIn, isAwaitingApproval, isApprovalAfterConfirmation, mailOutcome, user }) => {
	if (isSignedIn) {
		return { message: accountReplyOf('registeredSignedIn'), user };
	}
	if (isAwaitingApproval) {
		return { message: accountReplyOf('registeredAwaitingApproval'), isAwaitingApproval: true };
	}
	const approvalFlagObject = isApprovalAfterConfirmation ? { isApprovalAfterConfirmation: true } : {};
	if (mailOutcome === 'accountMailNotSent') {
		return { message: accountReplyOf('registeredConfirmationNotSent'), mailOutcome, ...approvalFlagObject };
	}
	return { message: accountReplyOf(isApprovalAfterConfirmation ? 'registeredCheckEmailThenApproval' : 'registeredCheckEmail'), ...approvalFlagObject };
};

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => args.permissionValidator(xReq.appValueGetter('authclaims'), forwardArgs({ next, args })));

		taskList.push((args, next) => {
			const requestBody = xReq.qtGetSurePath('body', {});
			const registrationRequest = REGISTRATION_PROPERTY_NAME_LIST.reduce((soFar, propertyName) => ({ ...soFar, [propertyName]: requestBody[propertyName] }), { clientAddress: xReq.ip });
			accessPointsDotD['user-registration-register'](registrationRequest, (err, { user, isSignedIn, isAwaitingApproval, isApprovalAfterConfirmation, mailOutcome, refusal } = {}) => next(err, { ...args, user, isSignedIn, isAwaitingApproval, isApprovalAfterConfirmation, mailOutcome, refusal }));
		});

		taskList.push((args, next) => {
			if (!args.isSignedIn) {
				next('', args);
				return;
			}
			accessTokenHeaderTools.refreshauthtoken({ xReq, xRes, payloadValues: { source: 'registration', user: args.user } }, (signError) => next(signError || '', args));
		});

		pipeRunner(taskList.getList(), { permissionValidator }, (err, args = {}) => {
			if (args.refusal) {
				xRes.status(args.refusal.httpStatus).send({ refusalName: args.refusal.refusalName, reason: args.refusal.reason });
				return;
			}
			if (err) {
				const errorRefId = makeRefId(12);
				xLog.error(`${moduleName} (${errorRefId}): ${err}`);
				xRes.status(500).send(`the account could not be created (${errorRefId})`);
				return;
			}
			xRes.send([replyOfRegistration(args)]);
		});
	};

	const routePath = `${routingPrefix}registerUser`;
	expressApp.post(routePath, serviceFunction(accessTokenHeaderTools.getValidator(['public'])));
	endpointsDotD.logList.push(routePath);
	return {};
};

module.exports = moduleFunction;
