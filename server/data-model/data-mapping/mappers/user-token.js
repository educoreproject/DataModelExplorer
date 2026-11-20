#!/usr/bin/env node
'use strict';
// @concept: [[MapperPattern]]
// @concept: [[SecurityFirstPattern]]

// user-token.js — the userTokens table: single-use links for email confirmation and password reset
// (PLAN-userRegistrationReset-112026 4.2). A row never holds the token itself, only its SHA-256 hash (tokenHash), so a
// leaked database yields no working link. Timestamps (expiresAt, usedAt) are ISO 8601 UTC text, which sorts and compares
// as text, so every comparison here is a plain string comparison against a caller-supplied ISO time.
//
// The token lifecycle that uses these queries lives in lib/user-account-tokens.js.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess, safeSql }) => {
		const { xLog } = process.global || {};

		const inputNameMapping = {
			['refId']: 'refId',
			['userRefId']: 'userRefId',
			['purpose']: 'purpose',
			['tokenHash']: 'tokenHash',
			['expiresAt']: 'expiresAt',
			['usedAt']: 'usedAt',
		};

		// the token columns the startup migration makes sure exist (userTokens is created by getTable with refId, createdAt, updatedAt)
		const tokenColumnNameList = Object.keys(inputNameMapping).filter((columnName) => columnName !== 'refId');

		const basicMapper = baseMappingProcess(inputNameMapping);
		const mapper = (inData, direction = 'forward') => (Array.isArray(inData) ? inData.map((inObj) => basicMapper(inObj, { direction })) : basicMapper(inData, { direction }));

		const UNUSED_CONDITION_TEXT = `([usedAt] IS NULL OR [usedAt] = '')`;

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				// the one row a presented token can match, for its purpose only (a reset token never confirms an email)
				byTokenHashAndPurpose: `SELECT * FROM <!tableName!> WHERE [tokenHash] = <!tokenHash!> AND [purpose] = <!purpose!>`,
				// a new link of a purpose retires every earlier unused one of the account (a second reset kills the first)
				unusedOfUserRetire: `UPDATE <!tableName!> SET [usedAt] = <!usedAt!> WHERE [userRefId] = <!userRefId!> AND [purpose] = <!purpose!> AND ${UNUSED_CONDITION_TEXT}`,
				// redemption: marks one row used only if it is still unused
				redeemByRefId: `UPDATE <!tableName!> SET [usedAt] = <!usedAt!> WHERE [refId] = <!refId!> AND ${UNUSED_CONDITION_TEXT}`,
				// used and expired rows are deleted at startup and on each issue; they can never be redeemed
				spentSweep: `DELETE FROM <!tableName!> WHERE NOT ${UNUSED_CONDITION_TEXT} OR [expiresAt] < <!nowText!>`,
				tableInfo: `PRAGMA table_info(<!tableName!>)`,
			};

			if (!queries[queryName]) {
				xLog && xLog.error(`Unknown query name '${queryName}' in ${moduleName}`);
				return undefined;
			}
			return safeSql(queries[queryName], replaceObject);
		};

		return { map: mapper, getSql, tokenColumnNameList };
	};

module.exports = moduleFunction({ moduleName });
