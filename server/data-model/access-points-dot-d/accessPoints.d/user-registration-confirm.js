#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// user-registration-confirm.js — ACCESS POINT: the emailed confirmation link is followed (PLAN-userRegistrationReset-112026
// 4.3). Behind POST /api/confirmRegistration (public).
//
//   serviceFunction({ token, clientAddress }, callback(errText, { user, isAwaitingApproval, refusal }))
//
// The link is redeemed exactly once (lib/user-account-tokens.js, purpose confirmEmail). Only an account still awaiting
// confirmation is activated (disabled cleared); an account an admin has disabled since is refused like a bad link
// (linkNotValid), never re-enabled by it. The user returned is the mapped profile, for the endpoint to sign in.
//
// requireAdminApproval=true (WORKORDER-adminApproval-112126 A2): the proved address is not activated but put in
// pendingApproval, the applicant is told and the approvers are asked (lib/user-account-approval.js), and
// isAwaitingApproval is returned so the endpoint does NOT sign the account in.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { refusalOf, refusalText, isAccountDisabled, PENDING_CONFIRMATION_TEXT } = require('../../../lib/user-profile-rules');
const { requestGuardOf } = require('../../../lib/user-account-request-guard');
const { requestApprovalOf } = require('../../../lib/user-account-approval');
const { redeemToken } = require('../../../lib/user-account-tokens');

const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true });

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping, emailSender, userRegistrationSettings } = passThroughParameters;
	if (!emailSender || typeof emailSender.sendEmail !== 'function' || typeof emailSender.alertFailure !== 'function') {
		throw new Error(`[${moduleName}] needs emailSender { sendEmail, alertFailure } in passThroughParameters (data-model.js builds it)`);
	}
	const requestGuard = requestGuardOf({ userRegistrationSettings });

	const serviceFunction = (xQuery = {}, callback) => {
		const { token, clientAddress } = xQuery || {};
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const refusal = requestGuard.refusalOfRequest({ clientAddress });
			if (refusal) {
				next(refusalText(refusal), { ...args, refusal });
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => redeemToken({ sqlDb, dataMapping, tokenText: token, purpose: 'confirmEmail' }, (redeemError, { userRefId, refusal } = {}) => next(redeemError, { ...args, userRefId, refusal })));

		taskList.push((args, next) => sqlDb.getTable('users', mergeArgs(args, next, 'userTable')));

		taskList.push((args, next) =>
			args.userTable.getData(dataMapping['profile-user'].getSql('byRefId', { refId: args.userRefId }), QUIET_OPTIONS, (readError, userRowList = []) => {
				if (readError) {
					next(`reading the account: ${readError}`, args);
					return;
				}
				const userRow = userRowList.qtLast();
				const disabledText = userRow ? String(userRow.disabled === undefined || userRow.disabled === null ? '' : userRow.disabled).trim() : '';
				if (!userRow || (isAccountDisabled(disabledText) && disabledText !== PENDING_CONFIRMATION_TEXT)) {
					const linkRefusal = refusalOf('linkNotValid');
					next(refusalText(linkRefusal), { ...args, refusal: linkRefusal });
					return;
				}
				next('', { ...args, userRow });
			}),
		);

		taskList.push((args, next) => {
			const isAwaitingApproval = !!requestGuard.registrationSettings.requireAdminApproval;
			if (isAwaitingApproval) {
				requestApprovalOf({ sqlDb, dataMapping, emailSender, registrationSettings: requestGuard.registrationSettings, userRow: args.userRow }, (approvalError) => next(approvalError ? `requesting approval: ${approvalError}` : '', { ...args, isAwaitingApproval }));
				return;
			}
			args.userTable.runStatement(dataMapping['profile-user'].getSql('disabledByRefId', { refId: args.userRefId, disabled: '' }), QUIET_OPTIONS, (saveError) => next(saveError ? `activating the account: ${saveError}` : '', { ...args, isAwaitingApproval }));
		});

		pipeRunner(taskList.getList(), {}, (err, args = {}) => {
			if (args.refusal) {
				callback(err, { refusal: args.refusal });
				return;
			}
			if (err) {
				xLog.error(`[${moduleName}] ${err}`);
				callback(err, {});
				return;
			}
			xLog.status(`[${moduleName}] email confirmed, account ${args.isAwaitingApproval ? 'awaiting approval' : 'active'}: ${args.userRow.username}`);
			callback('', { user: dataMapping['profile-user'].map(args.userRow, 'forward'), isAwaitingApproval: args.isAwaitingApproval });
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
