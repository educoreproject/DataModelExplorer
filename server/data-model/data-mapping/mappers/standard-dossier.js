#!/usr/bin/env node
'use strict';
// @concept: [[MapperPattern]]
// @concept: [[StandardDossier]]

// Dossier entries are rich, deeply nested records (burden rubrics, sample payloads,
// compatibility notes, etc.). SQLite's saveObject only persists scalar fields, so
// the full entry lives in the dataJson TEXT column. The mapper parses it on read
// and stringifies on write, giving callers a transparent object API.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');

const moduleFunction =
	({ moduleName }) =>
	({ safeSql }) => {
		process.global = process.global ? process.global : {};
		const xLog = process.global.xLog;

		// -------------------------------------------------------------------
		// Record transformation: parse/stringify dataJson

		const toAppRecord = (dbRow) => {
			if (!dbRow) return null;
			const { refId, standardId, dataJson, createdAt, updatedAt } = dbRow;
			let data = {};
			if (dataJson) {
				try {
					data = JSON.parse(dataJson);
				} catch (err) {
					xLog.error(`standard-dossier: bad JSON for standardId=${standardId}: ${err.toString()}`);
					data = {};
				}
			}
			return { refId, standardId, createdAt, updatedAt, ...data };
		};

		const toDbRecord = (appObj) => {
			const { refId, standardId, createdAt, updatedAt, ...rest } = appObj;
			return {
				...(refId ? { refId } : {}),
				standardId,
				dataJson: JSON.stringify(rest),
			};
		};

		const mapper = (inData, direction = 'forward') => {
			if (Array.isArray(inData)) {
				return inData.map((rec) =>
					direction === 'forward' ? toAppRecord(rec) : toDbRecord(rec),
				);
			}
			return direction === 'forward' ? toAppRecord(inData) : toDbRecord(inData);
		};

		// -------------------------------------------------------------------
		// Named queries (SQLite)

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				'all': `SELECT refId, standardId, dataJson, createdAt, updatedAt FROM <!tableName!> ORDER BY standardId`,
				'byStandardId': `SELECT refId, standardId, dataJson, createdAt, updatedAt FROM <!tableName!> WHERE standardId = <!standardId!>`,
			};

			if (!queries[queryName]) {
				xLog.error(`Unknown query name '${queryName}' in ${moduleName}`);
				return undefined;
			}

			return safeSql(queries[queryName], replaceObject);
		};

		return { map: mapper, getSql };
	};

module.exports = moduleFunction(moduleName);
