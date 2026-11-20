#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// password-reset-request.js — ACCESS POINT: someone asks for a password reset link (PLAN-userRegistrationReset-112026
// 4.4, ruling R4). Behind POST /api/requestPasswordReset (public).
//
//   serviceFunction({ identifier, clientAddress }, callback(errText, { refusal }))
//
// The account is found by exact username OR by email address without regard to case. Whatever is found, the caller
// gets the SAME answer (no error, no refusal), so the form cannot be used to learn who has an account. Only these
// refuse, and none of them depends on whether an account exists: registration not configured, over the rate limit, an
// identifier that is not text or is blank or too long.
//
// A link is mailed only when exactly one account matches, it is active (disabled blank: an admin-disabled or
// unconfirmed account gets nothing) and it has an email address. The link goes to the address ON FILE, never to the
// address typed. Every case that sends nothing is logged by name (and by username where there is one), never with the
// address. A failed send is logged by name and the answer is still the same.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { refusalOf, refusalText, textIdentifierRefusalOf } = require('../../../lib/user-profile-rules');
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
			const identifierRefusal = textIdentifierRefusalOf({ identifier });
			const shapeRefusal = identifierRefusal || (!identifier.trim() ? refusalOf('requiredPropertyMissing', { detailList: ['identifier'] }) : identifier.length > MAXIMUM_IDENTIFIER_LENGTH ? refusalOf('propertyTooLong', { detailList: ['identifier'] }) : '');
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
				next('', { ...args, userRowList });
			}),
		);

		// decide whether to send; every no is logged by name and ends the pipe with the same answer as a yes
		taskList.push((args, next) => {
			const { userRowList } = args;
			const noSendOf = (logText) => {
				xLog.status(`[${moduleName}] no reset link sent: ${logText}`);
				next('skipRestOfPipe', args);
			};
			if (!userRowList.length) {
				noSendOf('noMatchingAccount');
				return;
			}
			if (userRowList.length > 1) {
				noSendOf(`resetIdentifierAmbiguous: ${userRowList.length} accounts match (${userRowList.map((userRow) => userRow.username).join(', ')}); an admin must give them distinct email addresses`);
				return;
			}
			const [userRow] = userRowList;
			if (String(userRow.disabled || '').trim()) {
				noSendOf(`accountNotActive: ${userRow.username} (${userRow.disabled === 'pendingConfirmation' ? 'awaiting email confirmation' : 'disabled'})`);
				return;
			}
			if (!String(userRow.emailAdr || '').trim()) {
				noSendOf(`accountHasNoEmail: ${userRow.username}`);
				return;
			}
			next('', { ...args, userRow });
		});

		taskList.push((args, next) =>
			issueToken({ sqlDb, dataMapping, userRefId: args.userRow.refId, purpose: 'passwordReset', lifetimeMinutes: requestGuard.registrationSettings.resetLinkLifetimeMinutes }, (issueError, { tokenText } = {}) => {
				// a failure here happens only for a matched account, so it is logged and answered like every other case
				if (issueError) {
					xLog.error(`[${moduleName}] resetTokenNotIssued for ${args.userRow.username}: ${issueError}`);
					next('skipRestOfPipe', args);
					return;
				}
				next('', { ...args, tokenText });
			}),
		);

		taskList.push((args, next) => {
			const { userRow, tokenText } = args;
			const { publicSiteUrl, resetLinkLifetimeMinutes } = requestGuard.registrationSettings;
			const resetMail = accountMailOf({
				messageName: 'passwordReset',
				fillByName: { firstName: userRow.first || userRow.username, username: userRow.username, lifetimeText: lifetimeTextOf(resetLinkLifetimeMinutes), linkUrl: `${publicSiteUrl}/reset-password?token=${tokenText}`, siteUrl: publicSiteUrl },
			});
			emailSender.sendEmail({ toList: [String(userRow.emailAdr).trim()], ...resetMail }, (sendError, { messageId } = {}) => {
				if (sendError) {
					xLog.error(`[${moduleName}] resetMailNotSent for ${userRow.username}: ${sendError}`);
				} else {
					xLog.status(`[${moduleName}] reset link sent for ${userRow.username} (message ${messageId})`);
				}
				next('', args);
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
