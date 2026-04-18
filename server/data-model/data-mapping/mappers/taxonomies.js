#!/usr/bin/env node
'use strict';
// @concept: [[MapperPattern]]
// @concept: [[Taxonomies]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');

const moduleFunction =
	({ moduleName }) =>
	({ safeSql }) => {
		process.global = process.global ? process.global : {};
		const xLog = process.global.xLog;

		const toAppRecord = (dbRow) => {
			if (!dbRow) return null;
			const { refId, slug, dataJson, createdAt, updatedAt } = dbRow;
			let data = null;
			if (dataJson) {
				try {
					data = JSON.parse(dataJson);
				} catch (err) {
					xLog.error(`taxonomies: bad JSON for slug=${slug}: ${err.toString()}`);
					data = null;
				}
			}
			return { refId, slug, data, createdAt, updatedAt };
		};

		const mapper = (inData, direction = 'forward') => {
			if (direction !== 'forward') return inData;
			if (Array.isArray(inData)) return inData.map(toAppRecord);
			return toAppRecord(inData);
		};

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				'all': `SELECT refId, slug, dataJson, createdAt, updatedAt FROM <!tableName!> ORDER BY slug`,
				'bySlug': `SELECT refId, slug, dataJson, createdAt, updatedAt FROM <!tableName!> WHERE slug = <!slug!>`,
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
