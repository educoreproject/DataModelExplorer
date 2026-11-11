#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]
// @concept: [[OidcIdentityProvider]]

// user-session-revocation.js — ends every session of one account (review SF-4 of WORKORDER-userSqlAndSaveHole-111026,
// ROMANTIC_PARASOL rulings 2026-11-10). Called on a self-service password change (user-save-data) and on an admin
// password reset (admin-update-user).
//
//   revokeSessionsOf({ sqlDb, dataMapping, userRefId }, callback(errText, { accessRevokedAfterSeconds }))
//
// THE CUTOFF IS THE NEXT WHOLE SECOND. users.accessRevokedAfter (epoch seconds, the unit of a JWT iat) is stamped with
// floor(now) + 1, and the rule everywhere stays "iat >= cutoff passes": hasValidToken for website tokens, the MCP bearer
// gate for OAuth access tokens. So every token minted before the change, INCLUDING one minted earlier in the same
// second, has iat < cutoff and is refused. refreshauthtoken never signs a token of the account below its cutoff (it reads
// the cutoff from the user row: hasValidToken on every request, a lookup when a login or a profile save signs a user), so
// the changer's fresh token, a sign-in with the new password in that same second, and every later token are valid. (With cutoff = floor(now) and iat >= cutoff, a token minted in the change's second survived, and an active
// thief re-minting every second could keep the session: the re-verification reproduced it.)
//
// MCP OAUTH: where the OAuth adapter store exists, the account's grant families are deleted (refresh tokens and codes by
// grantId, then its Grant and Session rows), as refresh-token reuse detection does, so a refresh token from before the
// change fails at the provider and a provider login session cannot mint a new grant without the new password.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();

const MILLISECONDS_PER_SECOND = 1000;
const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true });
const USERS_TABLE_NAME = 'users';
const OAUTH_ADAPTER_TABLE_NAME = 'oauthAdapterStore';

const revokeSessionsOf = ({ sqlDb, dataMapping, userRefId }, callback) => {
	if (typeof userRefId !== 'string' || !userRefId) {
		callback(`[${moduleName}] revokeSessionsOf: userRefId must be a non-empty text, got ${JSON.stringify(userRefId)}`);
		return;
	}
	const accessRevokedAfterSeconds = Math.floor(Date.now() / MILLISECONDS_PER_SECOND) + 1;
	const taskList = new taskListPlus();

	// the website and bearer-gate cutoff; saveObject adds the column where a table lacks it (the value is digits only)
	taskList.push((args, next) => sqlDb.getTable(USERS_TABLE_NAME, mergeArgs(args, next, 'userTable')));
	taskList.push((args, next) => args.userTable.saveObject({ refId: userRefId, accessRevokedAfter: String(accessRevokedAfterSeconds) }, QUIET_OPTIONS, (stampError) => next(stampError ? `stamping accessRevokedAfter: ${stampError}` : '', args)));

	// the MCP OAuth grant families, only where the adapter store exists (getTable would create it)
	taskList.push((args, next) => sqlDb.checkTableExists(OAUTH_ADAPTER_TABLE_NAME, (checkError, isAdapterPresent) => next(checkError ? `checking ${OAUTH_ADAPTER_TABLE_NAME}: ${checkError}` : '', { ...args, isAdapterPresent })));
	taskList.push((args, next) => {
		if (!args.isAdapterPresent) {
			next('', args);
			return;
		}
		sqlDb.getTable(OAUTH_ADAPTER_TABLE_NAME, mergeArgs(args, next, 'adapterTable'));
	});
	['grantFamilyTokensOfAccountDelete', 'grantsAndSessionsOfAccountDelete'].forEach((queryName) =>
		taskList.push((args, next) => {
			if (!args.isAdapterPresent) {
				next('', args);
				return;
			}
			args.adapterTable.runStatement(dataMapping['oauth-admin'].getSql(queryName, { accountRefId: userRefId }), QUIET_OPTIONS, (deleteError) => next(deleteError ? `${queryName}: ${deleteError}` : '', args));
		}),
	);

	pipeRunner(taskList.getList(), {}, (err) => callback(err || '', { accessRevokedAfterSeconds }));
};

module.exports = { revokeSessionsOf };
