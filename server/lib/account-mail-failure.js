#!/usr/bin/env node
'use strict';

// account-mail-failure.js — what a person is told when the account mail they are waiting for failed for good
// (WORKORDER-accountMailFailureAndApprovalNotice-112326 M3, M6). The words and names are data: user-profile-rules.json
// mailFailureRefusalNameByFlow and refusalByCase.
//
//   mailFailureRefusalOf({ flowName, failureName }) -> { refusalName, httpStatus, reason }
//       flowName 'accountMail' (reset request, resend confirmation) or 'registration' (sign-up, account undone);
//       failureName is email-sender's (providerUnreachable, providerRefused, ...); a transient one says "try again in a
//       few minutes", any other "a problem on our side". An unknown flowName throws: a code fault.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const path = require('path');
const { refusalOf } = require('./user-profile-rules');
const { isTransientMailFailure } = require('./email-sender');

const RULES_FILE_PATH = path.join(__dirname, 'user-profile-rules.json');
const { mailFailureRefusalNameByFlow, refusalByCase } = require(RULES_FILE_PATH);
Object.entries(mailFailureRefusalNameByFlow || {}).forEach(([flowName, refusalNameByKind]) => {
	['transient', 'other'].forEach((kindName) => {
		if (!refusalNameByKind || !(refusalByCase || {})[refusalNameByKind[kindName]]) {
			throw new Error(`[${moduleName}] ${RULES_FILE_PATH}: mailFailureRefusalNameByFlow.${flowName}.${kindName} must name a refusal in refusalByCase`);
		}
	});
});

const mailFailureRefusalOf = ({ flowName, failureName }) => {
	const refusalNameByKind = (mailFailureRefusalNameByFlow || {})[flowName];
	if (!refusalNameByKind) {
		throw new Error(`[${moduleName}] mailFailureRefusalOf: '${flowName}' is not one of: ${Object.keys(mailFailureRefusalNameByFlow || {}).join(', ')}`);
	}
	return refusalOf(refusalNameByKind[isTransientMailFailure(failureName) ? 'transient' : 'other']);
};

module.exports = { mailFailureRefusalOf };
