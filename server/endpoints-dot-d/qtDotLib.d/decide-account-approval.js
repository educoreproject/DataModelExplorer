#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// decide-account-approval.js — ENDPOINT POST /api/decideAccountApproval (admin), body { userRefId, decisionName: 'approve'|'decline', sendDeclineEmail } (WORKORDER-adminApproval-112126).
// The admin validator is only the first screen (it reads the token's claims): the account-approval-decide access point reads the
// signed-in user's own row and refuses (notAnApprover) unless its STORED role is an approver's. Only the signed-in
// username (the identity the verified token names) and the listed body properties are passed on; a role in the body or
// the claims never reaches a decision. Answers [{ message, applicant, latestDecision }], or { refusalName, reason } with its status.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { refusalOf, refusalText } = require('../../lib/user-profile-rules');
const { accountReplyOf } = require('../../lib/user-account-mail');

const REQUEST_PROPERTY_NAME_LIST = Object.freeze(['userRefId', 'decisionName', 'sendDeclineEmail']);

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix } = passThroughParameters;

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		// a token whose claims name no approver role is refused by name, as the access point refuses one whose stored role does not
		taskList.push((args, next) =>
			args.permissionValidator(xReq.appValueGetter('authclaims'), { showDetails: false }, (validatorError) => {
				if (validatorError) {
					const refusal = refusalOf('notAnApprover');
					next(refusalText(refusal), { ...args, refusal });
					return;
				}
				next('', args);
			}),
		);

		taskList.push((args, next) => {
			const requestBody = xReq.qtGetSurePath('body', {});
			const signedInUsername = xReq.appValueGetter('authclaims').qtGetSurePath('user.username', '');
			const approvalRequest = REQUEST_PROPERTY_NAME_LIST.reduce((soFar, propertyName) => ({ ...soFar, [propertyName]: requestBody[propertyName] }), { signedInUsername });
			accessPointsDotD['account-approval-decide'](approvalRequest, (err, result = {}) => next(err, { ...args, result, refusal: result.refusal }));
		});

		pipeRunner(taskList.getList(), { permissionValidator }, (err, args = {}) => {
			if (args.refusal) {
				xRes.status(args.refusal.httpStatus).send({ refusalName: args.refusal.refusalName, reason: args.refusal.reason });
				return;
			}
			if (err) {
				const errorRefId = makeRefId(12);
				xLog.error(`${moduleName} (${errorRefId}): ${err}`);
				xRes.status(500).send(`the decision could not be recorded (${errorRefId})`);
				return;
			}
			xRes.send([{ message: accountReplyOf(args.result.latestDecision.decisionName === 'approve' ? 'accountApprovedReply' : 'accountDeclinedReply'), applicant: args.result.applicant, latestDecision: args.result.latestDecision }]);
		});
	};

	const routePath = `${routingPrefix}decideAccountApproval`;
	expressApp.post(routePath, serviceFunction(accessTokenHeaderTools.getValidator(['admin', 'super'])));
	endpointsDotD.logList.push(routePath);
	return {};
};

module.exports = moduleFunction;
