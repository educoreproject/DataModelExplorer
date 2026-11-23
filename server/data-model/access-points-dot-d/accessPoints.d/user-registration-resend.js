#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// user-registration-resend.js — ACCESS POINT: a new confirmation link for an account that has not confirmed its email
// (PLAN-userRegistrationReset-112026 4.3). Behind POST /api/resendConfirmation (public), offered by the login form when
// a sign-in is refused emailNotConfirmed.
//
//   serviceFunction({ identifier, clientAddress }, callback(errText, { refusal }))
//
// Like a reset request, the caller gets the SAME answer whether or not an account matched. A link is mailed only when
// exactly one account matches the username or address and it is awaiting confirmation; issuing it retires the
// account's earlier confirmation links. Each case that sends nothing is logged by name. A mail that fails to go (after
// email-sender's one retry) is answered as the refusal accountMailNotSent (WORKORDER-accountMailFailureAndApprovalNotice-
// 112326 M3), as on the reset form.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { refusalOf, refusalText, textIdentifierRefusalOf, PENDING_CONFIRMATION_TEXT } = require('../../../lib/user-profile-rules');
const { requestGuardOf } = require('../../../lib/user-account-request-guard');
const { issueToken } = require('../../../lib/user-account-tokens');
const { accountMailOf, lifetimeTextOf } = require('../../../lib/user-account-mail');

const MAXIMUM_IDENTIFIER_LENGTH = 254;
const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true });

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping, emailSender, userRegistrationSettings } = passThroughParameters;
	if (!emailSender || typeof emailSender.sendEmail !== 'function') {
		throw new Error(`[${moduleName}] needs emailSender in passThroughParameters (data-model.js builds it)`);
	}
	const requestGuard = requestGuardOf({ userRegistrationSettings });

	const serviceFunction = (xQuery = {}, callback) => {
		const { identifier, clientAddress } = xQuery || {};
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const guardRefusal = requestGuard.refusalOfRequest({ clientAddress, identifierText: typeof identifier === 'string' ? identifier : '' });
			const shapeRefusal = textIdentifierRefusalOf({ identifier }) || (!identifier.trim() ? refusalOf('requiredPropertyMissing', { detailList: ['identifier'] }) : identifier.length > MAXIMUM_IDENTIFIER_LENGTH ? refusalOf('propertyTooLong', { detailList: ['identifier'] }) : '');
			const refusal = guardRefusal || shapeRefusal;
			if (refusal) {
				next(refusalText(refusal), { ...args, refusal });
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => sqlDb.getTable('users', mergeArgs(args, next, 'userTable')));

		taskList.push((args, next) =>
			args.userTable.getData(dataMapping['profile-user'].getSql('byUsernameOrEmail', { identifier: identifier.trim() }), QUIET_OPTIONS, (readError, userRowList = []) => {
				if (readError) {
					next(`looking up the account: ${readError}`, args);
					return;
				}
				const noSendOf = (logText) => {
					xLog.status(`[${moduleName}] no confirmation link sent: ${logText}`);
					next('skipRestOfPipe', args);
				};
				if (userRowList.length !== 1) {
					noSendOf(userRowList.length ? `resendIdentifierAmbiguous: ${userRowList.length} accounts match (${userRowList.map((userRow) => userRow.username).join(', ')})` : 'noMatchingAccount');
					return;
				}
				const [userRow] = userRowList;
				if (String(userRow.disabled === undefined || userRow.disabled === null ? '' : userRow.disabled).trim() !== PENDING_CONFIRMATION_TEXT || !String(userRow.emailAdr || '').trim()) {
					noSendOf(`accountNotAwaitingConfirmation: ${userRow.username}`);
					return;
				}
				next('', { ...args, userRow });
			}),
		);

		taskList.push((args, next) => {
			const { userRow } = args;
			const { publicSiteUrl, confirmationLinkLifetimeMinutes } = requestGuard.registrationSettings;
			issueToken({ sqlDb, dataMapping, userRefId: userRow.refId, purpose: 'confirmEmail', lifetimeMinutes: confirmationLinkLifetimeMinutes }, (issueError, { tokenText } = {}) => {
				if (issueError) {
					xLog.error(`[${moduleName}] confirmationTokenNotIssued for ${userRow.username}: ${issueError}`);
					next('skipRestOfPipe', args);
					return;
				}
				const confirmMail = accountMailOf({
					messageName: 'confirmEmail',
					fillByName: { firstName: userRow.first || userRow.username, username: userRow.username, lifetimeText: lifetimeTextOf(confirmationLinkLifetimeMinutes), linkUrl: `${publicSiteUrl}/confirm?token=${tokenText}`, siteUrl: publicSiteUrl },
				});
				emailSender.sendEmail({ toList: [String(userRow.emailAdr).trim()], ...confirmMail }, (sendError) => {
					if (sendError) {
						xLog.error(`[${moduleName}] confirmationMailNotSent for ${userRow.username}: ${sendError}`);
						const refusal = refusalOf('accountMailNotSent');
						next(refusalText(refusal), { ...args, refusal });
						return;
					}
					next('', args);
				});
			});
		});

		pipeRunner(taskList.getList(), {}, (err, args = {}) => {
			if (args.refusal) {
				callback(err, { refusal: args.refusal });
				return;
			}
			if (err && err !== 'skipRestOfPipe') {
				xLog.error(`[${moduleName}] ${err}`);
				callback(err, {});
				return;
			}
			callback('', {});
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
