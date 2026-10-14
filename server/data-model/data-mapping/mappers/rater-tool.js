#!/usr/bin/env node
'use strict';

// rater-tool.js (mapper) — the CEDS Rater store's named queries and its record shapes (lane RATER, 2026-10-14).
// The store is its own sqlite file (raterTool.storeFilePath), not the main data-model database; its tables:
//   raters        raterUserName, surveyName, displayJson, raterSeedText, lastActiveAt, finishedAt
//   answers       raterUserName, elementStableId, answerJson, savedAt         (one current row per rater × element)
//   answerHistory raterUserName, elementStableId, answerJson, savedAt, historySequence   (every save)
//   searchLog     raterUserName, elementStableId, searchMode, searchJson, resultCount, searchedAt
//
// TRAP (sqlite-instance, pre-10.0 copy in this project — see code/CLAUDE.md): saveObject doubles every apostrophe in a
// string and sqlString.escape doubles it again, so "isn't" is STORED as "isn''t". Every free-text value the rater tool
// stores (notes, display names, search text) therefore travels inside a JSON column whose apostrophes are written as
// the JSON escape ': there is no apostrophe left for the module to double, and JSON.parse gives the text back
// exactly. encodeJsonColumn / decodeJsonColumn are the only way in and out.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');

const moduleFunction =
	({ moduleName }) =>
	({ safeSql }) => {
		const encodeJsonColumn = (columnValue) => JSON.stringify(columnValue).replace(/'/g, '\\u0027');
		const decodeJsonColumn = (columnText) => (typeof columnText === 'string' && columnText !== '' ? JSON.parse(columnText) : null);

		const QUERY_BY_NAME = Object.freeze({
			tableColumnList: 'PRAGMA table_info(<!tableName!>)',
			// columnName comes only from rater-tool-access STORE_COLUMN_LIST_BY_ROLE (code), never from a request
			addTextColumn: 'ALTER TABLE <!tableName!> ADD COLUMN [<!columnName!>] TEXT;',
			rowByRefId: 'SELECT * FROM <!tableName!> WHERE refId = <!refId!>',
			raterByUserName: 'SELECT * FROM <!tableName!> WHERE raterUserName = <!raterUserName!>',
			allRaters: 'SELECT * FROM <!tableName!> ORDER BY raterUserName',
			answersOfRater: 'SELECT * FROM <!tableName!> WHERE raterUserName = <!raterUserName!> ORDER BY elementStableId',
			answerOfRaterElement: 'SELECT * FROM <!tableName!> WHERE raterUserName = <!raterUserName!> AND elementStableId = <!elementStableId!>',
			allAnswers: 'SELECT * FROM <!tableName!> ORDER BY raterUserName, elementStableId',
			historyOfRaterElement: 'SELECT * FROM <!tableName!> WHERE raterUserName = <!raterUserName!> AND elementStableId = <!elementStableId!> ORDER BY CAST(historySequence AS INTEGER)',
			allHistory: 'SELECT * FROM <!tableName!> ORDER BY raterUserName, elementStableId, CAST(historySequence AS INTEGER)',
			searchesOfRater: 'SELECT * FROM <!tableName!> WHERE raterUserName = <!raterUserName!> ORDER BY searchedAt',
			allSearches: 'SELECT * FROM <!tableName!> ORDER BY raterUserName, searchedAt',
			deleteRowsOfRater: 'DELETE FROM <!tableName!> WHERE raterUserName = <!raterUserName!>',
			// the main users table: a rater account is removed only when its role is exactly 'rater'
			deleteRaterUser: "DELETE FROM <!tableName!> WHERE username = <!username!> AND role = 'rater'",
		});

		// a column NAME is an identifier, not a value: safeSql would quote it, so it is checked and placed as written
		const COLUMN_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
		const getSql = (queryName, replaceObject = {}) => {
			if (!QUERY_BY_NAME[queryName]) {
				throw new Error(`${moduleName}: unknown query name '${queryName}'; known: ${Object.keys(QUERY_BY_NAME).join(', ')}`);
			}
			if (queryName === 'addTextColumn') {
				if (!COLUMN_NAME_PATTERN.test(replaceObject.columnName || '')) {
					throw new Error(`${moduleName}: '${replaceObject.columnName}' is not a column name`);
				}
				return QUERY_BY_NAME.addTextColumn.replace('<!columnName!>', replaceObject.columnName);
			}
			return safeSql(QUERY_BY_NAME[queryName], replaceObject);
		};

		// a raters row → the rater record the access points use
		const raterOf = (raterRow) => ({
			raterRefId: raterRow.refId,
			raterUserName: raterRow.raterUserName,
			surveyName: raterRow.surveyName,
			display: decodeJsonColumn(raterRow.displayJson) || {},
			raterSeedText: raterRow.raterSeedText,
			createdAt: raterRow.createdAt,
			lastActiveAt: raterRow.lastActiveAt || null,
			finishedAt: raterRow.finishedAt || null,
		});

		// an answers / answerHistory row → { answerRefId, raterUserName, elementStableId, savedAt, ...answer }
		const answerOf = (answerRow) => ({
			answerRefId: answerRow.refId,
			raterUserName: answerRow.raterUserName,
			elementStableId: answerRow.elementStableId,
			savedAt: answerRow.savedAt,
			historySequence: answerRow.historySequence === undefined ? undefined : Number(answerRow.historySequence),
			answer: decodeJsonColumn(answerRow.answerJson),
		});

		return { getSql, encodeJsonColumn, decodeJsonColumn, raterOf, answerOf };
	};

module.exports = moduleFunction({ moduleName });
