#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// user-account-tokens.js — the single-use links of registration and password reset (PLAN-userRegistrationReset-112026
// 4.2). A link carries a random 32-byte token (base64url, 43 characters); the userTokens row holds only its SHA-256, so
// a leaked database yields no working link.
//
//   issueToken({ sqlDb, dataMapping, userRefId, purpose, lifetimeMinutes }, callback(errText, { tokenText, expiresAt }))
//       sweeps spent rows, then writes the new row. It does NOT retire earlier tokens (WORKORDER-accountMailFailureAnd
//       ApprovalNotice-112326): a link whose mail then fails must not have killed the one the person already holds.
//   retireEarlierTokens({ sqlDb, dataMapping, userRefId, purpose, keptTokenText }, callback(errText))
//       called once the new link's mail is SENT: every other unused token of the account and purpose is retired (a
//       second reset kills the first)
//   deleteTokensOfUser({ sqlDb, dataMapping, userRefId }, callback(errText))
//       every token of one account, for a self-registration undone because its confirmation mail failed (M6 e)
//   redeemToken({ sqlDb, dataMapping, tokenText, purpose }, callback(errText, { userRefId, refusal }))
//       an unknown, altered, used or expired token, or one of another purpose, is refused alike (linkNotValid); a good one
//       is marked used BEFORE its account is returned, so it works exactly once
//
// The read-then-mark in redeemToken is not one SQL statement, but sqlite-instance 11.0 runs every statement
// synchronously on one connection inside this one Node process, so no other request can run between them.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const crypto = require('crypto');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { refusalOf, refusalText } = require('./user-profile-rules');

const USER_TOKENS_TABLE_NAME = 'userTokens';
const TOKEN_BYTE_COUNT = 32;
const TOKEN_TEXT_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_PURPOSE_LIST = Object.freeze(['confirmEmail', 'passwordReset']);
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true });

const tokenHashOf = (tokenText) => crypto.createHash('sha256').update(String(tokenText), 'utf8').digest('hex');

const purposeProblemOf = (purpose) => (TOKEN_PURPOSE_LIST.includes(purpose) ? '' : `[${moduleName}] purpose '${purpose}' is not one of: ${TOKEN_PURPOSE_LIST.join(', ')}`);

const issueToken = ({ sqlDb, dataMapping, userRefId, purpose, lifetimeMinutes }, callback) => {
	const purposeProblem = purposeProblemOf(purpose);
	if (purposeProblem || typeof userRefId !== 'string' || !userRefId || !Number.isInteger(lifetimeMinutes) || lifetimeMinutes < 1) {
		callback(purposeProblem || `[${moduleName}] issueToken needs a userRefId and a whole-number lifetimeMinutes`, {});
		return;
	}
	const tokenText = crypto.randomBytes(TOKEN_BYTE_COUNT).toString('base64url');
	const nowText = new Date().toISOString();
	const expiresAt = new Date(Date.now() + lifetimeMinutes * MILLISECONDS_PER_MINUTE).toISOString();
	const tokenMapper = dataMapping['user-token'];
	const taskList = new taskListPlus();

	taskList.push((args, next) => sqlDb.getTable(USER_TOKENS_TABLE_NAME, mergeArgs(args, next, 'tokenTable')));
	taskList.push((args, next) => args.tokenTable.runStatement(tokenMapper.getSql('spentSweep', { nowText }), QUIET_OPTIONS, (sweepError) => next(sweepError ? `sweeping spent tokens: ${sweepError}` : '', args)));
	taskList.push((args, next) =>
		args.tokenTable.saveObject(tokenMapper.map({ userRefId, purpose, tokenHash: tokenHashOf(tokenText), expiresAt, usedAt: '' }, 'reverse'), QUIET_OPTIONS, (saveError) => next(saveError ? `writing the token: ${saveError}` : '', args)),
	);

	pipeRunner(taskList.getList(), {}, (err) => {
		if (err) {
			callback(`[${moduleName}] issueToken: ${err}`, {});
			return;
		}
		callback('', { tokenText, expiresAt });
	});
};

const retireEarlierTokens = ({ sqlDb, dataMapping, userRefId, purpose, keptTokenText }, callback) => {
	const purposeProblem = purposeProblemOf(purpose);
	if (purposeProblem || typeof userRefId !== 'string' || !userRefId || !TOKEN_TEXT_PATTERN.test(String(keptTokenText))) {
		callback(purposeProblem || `[${moduleName}] retireEarlierTokens needs a userRefId and the kept token`);
		return;
	}
	sqlDb.getTable(USER_TOKENS_TABLE_NAME, (tableError, tokenTable) => {
		if (tableError) {
			callback(`[${moduleName}] retireEarlierTokens: ${tableError}`);
			return;
		}
		tokenTable.runStatement(dataMapping['user-token'].getSql('unusedOfUserRetireExcept', { userRefId, purpose, keptTokenHash: tokenHashOf(keptTokenText), usedAt: new Date().toISOString() }), QUIET_OPTIONS, (retireError) =>
			callback(retireError ? `[${moduleName}] retiring earlier tokens: ${retireError}` : ''),
		);
	});
};

const deleteTokensOfUser = ({ sqlDb, dataMapping, userRefId }, callback) => {
	if (typeof userRefId !== 'string' || !userRefId) {
		callback(`[${moduleName}] deleteTokensOfUser needs a userRefId`);
		return;
	}
	sqlDb.getTable(USER_TOKENS_TABLE_NAME, (tableError, tokenTable) => {
		if (tableError) {
			callback(`[${moduleName}] deleteTokensOfUser: ${tableError}`);
			return;
		}
		tokenTable.runStatement(dataMapping['user-token'].getSql('ofUserDelete', { userRefId }), QUIET_OPTIONS, (deleteError) => callback(deleteError ? `[${moduleName}] deleting the account's tokens: ${deleteError}` : ''));
	});
};

const redeemToken = ({ sqlDb, dataMapping, tokenText, purpose }, callback) => {
	const purposeProblem = purposeProblemOf(purpose);
	if (purposeProblem) {
		callback(purposeProblem, {});
		return;
	}
	const linkRefusal = refusalOf('linkNotValid');
	if (typeof tokenText !== 'string' || !TOKEN_TEXT_PATTERN.test(tokenText)) {
		callback(refusalText(linkRefusal), { refusal: linkRefusal });
		return;
	}
	const nowText = new Date().toISOString();
	const tokenMapper = dataMapping['user-token'];
	const taskList = new taskListPlus();

	taskList.push((args, next) => sqlDb.getTable(USER_TOKENS_TABLE_NAME, mergeArgs(args, next, 'tokenTable')));
	taskList.push((args, next) =>
		args.tokenTable.getData(tokenMapper.getSql('byTokenHashAndPurpose', { tokenHash: tokenHashOf(tokenText), purpose }), QUIET_OPTIONS, (readError, tokenRowList = []) => {
			if (readError) {
				next(`reading the token: ${readError}`, args);
				return;
			}
			const tokenRow = tokenRowList.qtLast();
			const isRedeemable = tokenRow && !tokenRow.usedAt && String(tokenRow.expiresAt || '') > nowText;
			if (!isRedeemable) {
				next(refusalText(linkRefusal), { ...args, refusal: linkRefusal });
				return;
			}
			next('', { ...args, tokenRow });
		}),
	);
	taskList.push((args, next) => args.tokenTable.runStatement(tokenMapper.getSql('redeemByRefId', { refId: args.tokenRow.refId, usedAt: nowText }), QUIET_OPTIONS, (markError) => next(markError ? `marking the token used: ${markError}` : '', args)));

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (args && args.refusal) {
			callback(err, { refusal: args.refusal });
			return;
		}
		if (err) {
			callback(`[${moduleName}] redeemToken: ${err}`, {});
			return;
		}
		callback('', { userRefId: args.tokenRow.userRefId });
	});
};

module.exports = { issueToken, retireEarlierTokens, deleteTokensOfUser, redeemToken, tokenHashOf, TOKEN_PURPOSE_LIST };
