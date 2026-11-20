#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[PasswordHashing]]

// password-reset-complete.js — ACCESS POINT: the emailed reset link is followed and a new password chosen
// (PLAN-userRegistrationReset-112026 4.4). Behind POST /api/completePasswordReset (public).
//
//   serviceFunction({ token, password, clientAddress }, callback(errText, { user, refusal }))
//
// In order: the rate limit; the new password against the existing rule (validatePasswordStrength, 12 characters or
// more) BEFORE the link is spent, so a weak password does not burn it; the link redeemed exactly once
// (lib/user-account-tokens.js); the account still active; the password hashed by the profile-user mapper and saved;
// revokeSessionsOf (every website session and MCP OAuth grant of the account ends, the same-second case included);
// a "your password was changed" notice mailed to the address on file (a failed notice is logged, never fatal).
// The user returned is the mapped profile (no password), for the endpoint to sign in fresh.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { refusalOf, refusalText, textIdentifierRefusalOf, valueLengthRefusalOf } = require('../../../lib/user-profile-rules');
const { requestGuardOf } = require('../../../lib/user-account-request-guard');
const { redeemToken } = require('../../../lib/user-account-tokens');
const { revokeSessionsOf } = require('../../../lib/user-session-revocation');
const { accountMailOf } = require('../../../lib/user-account-mail');

const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true });

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping, emailSender, userRegistrationSettings } = passThroughParameters;
	if (!emailSender || typeof emailSender.sendEmail !== 'function') {
		throw new Error(`[${moduleName}] needs emailSender in passThroughParameters (data-model.js builds it)`);
	}
	const { validatePasswordStrength } = dataMapping['profile-user'];
	const requestGuard = requestGuardOf({ userRegistrationSettings });

	const serviceFunction = (xQuery = {}, callback) => {
		const { token, password, clientAddress } = xQuery || {};
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const refusalOfPassword = () => {
				const passwordCheck = validatePasswordStrength(password);
				return passwordCheck.isValid ? '' : refusalOf('passwordNotAccepted', { detailList: passwordCheck.errors });
			};
			const refusal = requestGuard.refusalOfRequest({ clientAddress }) || textIdentifierRefusalOf({ token, password }) || valueLengthRefusalOf({ password }) || refusalOfPassword();
			if (refusal) {
				next(refusalText(refusal), { ...args, refusal });
				return;
			}
			next('', args);
		});

		taskList.push((args, next) =>
			redeemToken({ sqlDb, dataMapping, tokenText: token, purpose: 'passwordReset' }, (redeemError, { userRefId, refusal } = {}) => next(redeemError, { ...args, userRefId, refusal })),
		);

		taskList.push((args, next) => sqlDb.getTable('users', mergeArgs(args, next, 'userTable')));

		taskList.push((args, next) =>
			args.userTable.getData(dataMapping['profile-user'].getSql('byRefId', { refId: args.userRefId }), QUIET_OPTIONS, (readError, userRowList = []) => {
				if (readError) {
					next(`reading the account: ${readError}`, args);
					return;
				}
				const userRow = userRowList.qtLast();
				// an account removed or disabled after the link was sent: the link no longer works
				if (!userRow || String(userRow.disabled || '').trim()) {
					const linkRefusal = refusalOf('linkNotValid');
					next(refusalText(linkRefusal), { ...args, refusal: linkRefusal });
					return;
				}
				next('', { ...args, userRow });
			}),
		);

		taskList.push((args, next) => {
			const passwordRecord = dataMapping['profile-user'].map({ refId: args.userRefId, password }, 'reverse');
			args.userTable.runStatement(dataMapping['profile-user'].getSql('updateByRefId', passwordRecord), QUIET_OPTIONS, (saveError) => next(saveError ? `saving the new password: ${saveError}` : '', args));
		});

		taskList.push((args, next) => revokeSessionsOf({ sqlDb, dataMapping, userRefId: args.userRefId }, (revokeError) => next(revokeError ? `ending earlier sessions: ${revokeError}` : '', args)));

		taskList.push((args, next) => {
			const { userRow } = args;
			const { publicSiteUrl } = requestGuard.registrationSettings;
			if (!String(userRow.emailAdr || '').trim()) {
				next('', args);
				return;
			}
			const changedMail = accountMailOf({ messageName: 'passwordChanged', fillByName: { firstName: userRow.first || userRow.username, username: userRow.username, forgotPasswordUrl: `${publicSiteUrl}/forgot-password`, siteUrl: publicSiteUrl } });
			emailSender.sendEmail({ toList: [String(userRow.emailAdr).trim()], ...changedMail }, (sendError) => {
				if (sendError) {
					xLog.error(`[${moduleName}] passwordChangedNoticeNotSent for ${userRow.username}: ${sendError}`);
				}
				next('', args);
			});
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
			xLog.status(`[${moduleName}] password reset completed for ${args.userRow.username}`);
			callback('', { user: dataMapping['profile-user'].map(args.userRow, 'forward') });
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
