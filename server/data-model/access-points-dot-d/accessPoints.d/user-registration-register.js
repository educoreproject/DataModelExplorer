#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[PasswordHashing]]

// user-registration-register.js — ACCESS POINT: a visitor creates their own account (PLAN-userRegistrationReset-112026
// 4.3, rulings R1, R3, R7). Behind POST /api/registerUser (public).
//
//   serviceFunction({ username, password, first, last, emailAdr, clientAddress }, callback(errText, { user, isSignedIn, refusal }))
//
// Only those five properties are read: whatever else a request carries (role, disabled, refId, source) never reaches
// the row. The role is ALWAYS [user-registration] newAccountRole (the July saveUserData hole was a role taken from a
// request body). Refused by name: registration switched off; a missing, non-text, over-long or malformed value; a
// password the existing rule refuses; a username already in use or an email address already on an account, both
// compared without regard to case (R4 depends on one account per address). The username is kept separate from the
// email address (R3) and stored lower-case, as admin-create-user stores it.
//
// requireEmailConfirmation=true: the row is written with disabled='pendingConfirmation', a confirmEmail link is mailed,
// and the account cannot sign in (user-login refuses it, emailNotConfirmed) until the link is followed. false: the
// account is active at once and the endpoint signs it in. Either way the new-account notice goes to
// newAccountNoticeList (R7; an empty list sends nothing). A failed mail is logged by name and never undoes the account.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { refusalOf, refusalText, textIdentifierRefusalOf, valueLengthRefusalOf, usernameRefusalOf, PENDING_CONFIRMATION_TEXT } = require('../../../lib/user-profile-rules');
const { requestGuardOf } = require('../../../lib/user-account-request-guard');
const { issueToken } = require('../../../lib/user-account-tokens');
const { accountMailOf, lifetimeTextOf } = require('../../../lib/user-account-mail');

const REGISTRATION_PROPERTY_NAME_LIST = Object.freeze(['username', 'password', 'first', 'last', 'emailAdr']);
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NEW_ACCOUNT_SOURCE_TEXT = 'selfRegistration';
const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true });

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping, emailSender, userRegistrationSettings } = passThroughParameters;
	if (!emailSender || typeof emailSender.sendEmail !== 'function') {
		throw new Error(`[${moduleName}] needs emailSender in passThroughParameters (data-model.js builds it)`);
	}
	const { validatePasswordStrength } = dataMapping['profile-user'];
	const requestGuard = requestGuardOf({ userRegistrationSettings });

	// the registration's own record: the five properties, trimmed, and nothing else from the request
	const registrationRecordOf = (xQuery) => REGISTRATION_PROPERTY_NAME_LIST.reduce((record, propertyName) => ({ ...record, [propertyName]: xQuery[propertyName] }), {});

	const shapeRefusalOf = (registrationRecord) => {
		const presentByName = Object.fromEntries(Object.entries(registrationRecord).filter(([, propertyValue]) => propertyValue !== undefined && propertyValue !== null));
		const textRefusal = textIdentifierRefusalOf(presentByName);
		if (textRefusal) {
			return textRefusal;
		}
		const missingNameList = REGISTRATION_PROPERTY_NAME_LIST.filter((propertyName) => !String(registrationRecord[propertyName] || '').trim());
		if (missingNameList.length) {
			return refusalOf('requiredPropertyMissing', { detailList: missingNameList });
		}
		const lengthRefusal = valueLengthRefusalOf(registrationRecord);
		if (lengthRefusal) {
			return lengthRefusal;
		}
		const usernameRefusal = usernameRefusalOf(registrationRecord.username.trim());
		if (usernameRefusal) {
			return usernameRefusal;
		}
		if (!EMAIL_ADDRESS_PATTERN.test(registrationRecord.emailAdr.trim())) {
			return refusalOf('emailAdrNotValid');
		}
		const passwordCheck = validatePasswordStrength(registrationRecord.password);
		return passwordCheck.isValid ? '' : refusalOf('passwordNotAccepted', { detailList: passwordCheck.errors });
	};

	const serviceFunction = (xQuery = {}, callback) => {
		const registrationRecord = registrationRecordOf(xQuery || {});
		const clientAddress = (xQuery || {}).clientAddress;
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const guardRefusal = requestGuard.refusalOfRequest({ clientAddress, identifierText: typeof registrationRecord.username === 'string' ? registrationRecord.username : '' });
			const refusal = guardRefusal || (!requestGuard.registrationSettings.selfRegistrationEnabled ? refusalOf('registrationDisabled') : shapeRefusalOf(registrationRecord));
			if (refusal) {
				next(refusalText(refusal), { ...args, refusal });
				return;
			}
			const { requireEmailConfirmation, newAccountRole } = requestGuard.registrationSettings;
			const newUserRecord = {
				username: registrationRecord.username.trim().toLowerCase(),
				password: registrationRecord.password,
				first: registrationRecord.first.trim(),
				last: registrationRecord.last.trim(),
				emailAdr: registrationRecord.emailAdr.trim().toLowerCase(),
				phone: '',
				source: NEW_ACCOUNT_SOURCE_TEXT,
				role: newAccountRole,
			};
			next('', { ...args, newUserRecord, requireEmailConfirmation });
		});

		taskList.push((args, next) => sqlDb.getTable('users', mergeArgs(args, next, 'userTable')));

		[
			['byUsernameInsensitive', 'username', 'usernameTaken'],
			['byEmailInsensitive', 'emailAdr', 'emailAdrTaken'],
		].forEach(([queryName, propertyName, refusalCaseName]) =>
			taskList.push((args, next) =>
				args.userTable.getData(dataMapping['profile-user'].getSql(queryName, { [propertyName]: args.newUserRecord[propertyName] }), QUIET_OPTIONS, (readError, matchList = []) => {
					if (readError) {
						next(`checking ${propertyName}: ${readError}`, args);
						return;
					}
					if (matchList.length) {
						const takenRefusal = refusalOf(refusalCaseName);
						next(refusalText(takenRefusal), { ...args, refusal: takenRefusal });
						return;
					}
					next('', args);
				}),
			),
		);

		// one insert: the mapped record (the mapper hashes the password) plus the account state, never from the request
		taskList.push((args, next) => {
			const userRow = { ...dataMapping['profile-user'].map(args.newUserRecord, 'reverse'), disabled: args.requireEmailConfirmation ? PENDING_CONFIRMATION_TEXT : '' };
			args.userTable.saveObject(userRow, QUIET_OPTIONS, (saveError, userRefId) => next(saveError ? `writing the account: ${saveError}` : '', { ...args, userRefId }));
		});

		taskList.push((args, next) =>
			args.userTable.getData(dataMapping['profile-user'].getSql('byRefId', { refId: args.userRefId }), QUIET_OPTIONS, (readError, userRowList = []) => {
				if (readError || !userRowList.length) {
					next(`reading the new account back: ${readError || 'not found'}`, args);
					return;
				}
				xLog.status(`[${moduleName}] account created: ${userRowList[0].username} (${args.requireEmailConfirmation ? 'awaiting confirmation' : 'active'})`);
				next('', { ...args, userRow: userRowList[0] });
			}),
		);

		taskList.push((args, next) => {
			if (!args.requireEmailConfirmation) {
				next('', args);
				return;
			}
			const { publicSiteUrl, confirmationLinkLifetimeMinutes } = requestGuard.registrationSettings;
			issueToken({ sqlDb, dataMapping, userRefId: args.userRefId, purpose: 'confirmEmail', lifetimeMinutes: confirmationLinkLifetimeMinutes }, (issueError, { tokenText } = {}) => {
				if (issueError) {
					xLog.error(`[${moduleName}] confirmationTokenNotIssued for ${args.userRow.username}: ${issueError}`);
					next('', args);
					return;
				}
				const confirmMail = accountMailOf({
					messageName: 'confirmEmail',
					fillByName: { firstName: args.userRow.first, username: args.userRow.username, lifetimeText: lifetimeTextOf(confirmationLinkLifetimeMinutes), linkUrl: `${publicSiteUrl}/confirm?token=${tokenText}`, siteUrl: publicSiteUrl },
				});
				emailSender.sendEmail({ toList: [args.userRow.emailAdr], ...confirmMail }, (sendError) => {
					if (sendError) {
						xLog.error(`[${moduleName}] confirmationMailNotSent for ${args.userRow.username}: ${sendError}`);
					}
					next('', args);
				});
			});
		});

		taskList.push((args, next) => {
			const { newAccountNoticeList, publicSiteUrl } = requestGuard.registrationSettings;
			if (!newAccountNoticeList.length) {
				next('', args);
				return;
			}
			const noticeMail = accountMailOf({
				messageName: 'newAccountNotice',
				fillByName: { username: args.userRow.username, firstName: args.userRow.first, lastName: args.userRow.last, emailAdr: args.userRow.emailAdr, confirmationText: args.requireEmailConfirmation ? 'yes' : 'no', siteUrl: publicSiteUrl },
			});
			emailSender.sendEmail({ toList: [...newAccountNoticeList], ...noticeMail }, (sendError) => {
				if (sendError) {
					xLog.error(`[${moduleName}] newAccountNoticeNotSent for ${args.userRow.username}: ${sendError}`);
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
			callback('', { user: dataMapping['profile-user'].map(args.userRow, 'forward'), isSignedIn: !args.requireEmailConfirmation });
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
