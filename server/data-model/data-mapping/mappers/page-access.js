#!/usr/bin/env node
'use strict';
// @concept: [[ActivityTracking]]
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
			['path']: 'path',
			['pageRefId']: 'pageRefId',
			['userRefId']: 'userRefId',
			['accessedAt']: 'accessedAt',
		};

		// ================================================================================
		// TRANSFORMATION FUNCTION SETUP

		const basicMapper = baseMappingProcess(inputNameMapping);

		// ================================================================================
		// RECORD-LEVEL TRANSFORMATION

		const recordMapper = (inObj, direction = 'forward') => {
			const outObj = basicMapper(inObj, {direction});
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
				'byPath': `SELECT * FROM <!tableName!> WHERE path = <!path!>`,
				'accessesByPage': `SELECT * FROM <!tableName!> WHERE pageRefId = <!pageRefId!> ORDER BY accessedAt DESC`,
				'accessesByUser': `SELECT * FROM <!tableName!> WHERE userRefId = <!userRefId!> ORDER BY accessedAt DESC`,
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
