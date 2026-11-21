#!/usr/bin/env node
'use strict';
// @concept: [[MapperPattern]]
// @concept: [[SecurityFirstPattern]]

// account-approval-decision.js — the accountApprovalDecisions table: one row per approve or decline of a self-registered
// account (WORKORDER-adminApproval-112126), recording who decided and when. Its own table, not users columns (the work
// order forbids new users columns) and not userTokens (whose spentSweep deletes used rows, which would erase the record).
// Rows are only ever added; the latest row of an applicant is its standing decision. decidedAt is ISO 8601 UTC text.
//
// The startup migration (lib/user-account-schema-migration.js) adds decisionColumnNameList where absent.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess, safeSql }) => {
		const { xLog } = process.global || {};

		const inputNameMapping = {
			['refId']: 'refId',
			['applicantUserRefId']: 'applicantUserRefId',
			['decisionName']: 'decisionName',
			['deciderUserRefId']: 'deciderUserRefId',
			['deciderUsername']: 'deciderUsername',
			['decidedAt']: 'decidedAt',
			['declineEmailSent']: 'declineEmailSent',
		};

		const decisionColumnNameList = Object.keys(inputNameMapping).filter((columnName) => columnName !== 'refId');

		const basicMapper = baseMappingProcess(inputNameMapping);
		const mapper = (inData, direction = 'forward') => (Array.isArray(inData) ? inData.map((inObj) => basicMapper(inObj, { direction })) : basicMapper(inData, { direction }));

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				// the standing decision of one applicant: its latest row (decidedAt, then the insert order, breaks ties)
				latestOfApplicant: `SELECT * FROM <!tableName!> WHERE [applicantUserRefId] = <!applicantUserRefId!> ORDER BY [decidedAt] DESC, rowid DESC LIMIT 1`,
				tableInfo: `PRAGMA table_info(<!tableName!>)`,
			};

			if (!queries[queryName]) {
				xLog && xLog.error(`Unknown query name '${queryName}' in ${moduleName}`);
				return undefined;
			}
			return safeSql(queries[queryName], replaceObject);
		};

		return { map: mapper, getSql, decisionColumnNameList };
	};

module.exports = moduleFunction({ moduleName });
