#!/usr/bin/env node
'use strict';
// @concept: [[SessionPersistence]]
// @concept: [[MapperPattern]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess, safeSql }) => {
		process.global = process.global ? process.global : {};
		const xLog = process.global.xLog;

		// ================================================================================
		// FIELD MAPPING CONFIGURATION

		const inputNameMapping = {
			['refId']: 'refId',
			['userRefId']: 'userRefId',
			['sessionName']: 'sessionName',
			['sessionData']: 'sessionData',
			['createdAt']: 'createdAt',
			['updatedAt']: 'updatedAt',
		};

		// ================================================================================
		// TRANSFORMATION FUNCTION SETUP

		const basicMapper = baseMappingProcess(inputNameMapping);

		// ================================================================================
		// RECORD-LEVEL TRANSFORMATION

		const recordMapper = (inObj, direction = 'forward') => {
			const outObj = basicMapper(inObj, { direction });
			delete outObj.XXX;
			return outObj;
		};

		// ================================================================================
		// ARRAY/SINGLE OBJECT HANDLER

		const mapper = (inData, direction = 'forward') => {
			if (Array.isArray(inData)) {
				return inData.map((inObj) => recordMapper(inObj, direction));
			}
			return recordMapper(inData, direction);
		};

		// ================================================================================
		// NAMED SQL QUERY GENERATION

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				'byUser': `SELECT refId, sessionName, createdAt, updatedAt FROM <!tableName!> WHERE userRefId = <!userRefId!> ORDER BY updatedAt DESC`,
				'byRefId': `SELECT * FROM <!tableName!> WHERE refId = <!refId!>`,
				'deleteByRefId': `DELETE FROM <!tableName!> WHERE refId = <!refId!> AND userRefId = <!userRefId!>`,
			};

			if (!queries[queryName]) {
				xLog.error(`Unknown query name '${queryName}' in ${moduleName}`);
				return undefined;
			}

			const sql = queries[queryName];
			return safeSql(sql, replaceObject);
		};

		// ================================================================================
		// MAPPER API EXPORT

		return {
			map: mapper,
			getSql,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction(moduleName);
