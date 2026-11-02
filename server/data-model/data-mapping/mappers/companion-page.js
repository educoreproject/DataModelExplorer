#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[MapperPattern]]
//
// A companion page is a document attached to a standard in the Standards Explorer (SPEC-companionPages-102826). One
// row per page, named by pageSlug. A page names its standard by standardKey (stable across goldens, which is why the
// registry lives here and not on a graph node); subjectStableId pins it to one class or field instead of the whole
// standard. standardKey may be NULL for a page that belongs to the site rather than to a standard.
//
// The table has a DECLARED schema (createTable), not the all-TEXT columns saveObject grows, and the access points
// write it through insert/updateByPageSlug and runStatement rather than saveObject: this project's sqlite-instance
// still doubles apostrophes on save (its 10.0 fix is not adopted), and page text is full of them. The same precedent
// as dme-user-mapping.

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
			['pageSlug']: 'pageSlug',
			['title']: 'title',
			['summary']: 'summary',
			['audienceText']: 'audienceText',
			['standardKey']: 'standardKey',
			['subjectStableId']: 'subjectStableId',
			['targetKind']: 'targetKind',
			['externalUrl']: 'externalUrl',
			['compilerName']: 'compilerName',
			['sortOrder']: 'sortOrder',
			['isActive']: 'isActive',
			['createdAt']: 'createdAt',
			['updatedAt']: 'updatedAt',
		};

		const dataColumnList = Object.keys(inputNameMapping).filter((columnName) => !['refId', 'createdAt', 'updatedAt'].includes(columnName));

		const TARGET_KIND_LIST = ['compiled', 'externalUrl'];

		// ================================================================================
		// TRANSFORMATION

		const basicMapper = baseMappingProcess(inputNameMapping);

		const recordMapper = (inObj, direction = 'forward') => {
			const outObj = basicMapper(inObj, { direction });
			if (direction === 'forward' && outObj.isActive !== undefined) {
				outObj.isActive = Number(outObj.isActive) === 1;
			}
			if (direction === 'reverse' && outObj.isActive !== undefined) {
				if (typeof outObj.isActive !== 'boolean') {
					throw new Error(`${moduleName}: isActive must be true or false (got ${JSON.stringify(outObj.isActive)})`);
				}
				outObj.isActive = outObj.isActive ? 1 : 0;
			}
			return outObj;
		};

		const mapper = (inData, direction = 'forward') => {
			if (Array.isArray(inData)) {
				return inData.map((inObj) => recordMapper(inObj, direction));
			}
			return recordMapper(inData, direction);
		};

		// ================================================================================
		// NAMED SQL QUERY GENERATION

		const columnListText = dataColumnList.map((columnName) => `[${columnName}]`).join(', ');
		const valueListText = dataColumnList.map((columnName) => `<!${columnName}!>`).join(', ');
		const assignmentListText = dataColumnList
			.filter((columnName) => columnName !== 'pageSlug')
			.map((columnName) => `[${columnName}]=<!${columnName}!>`)
			.join(', ');
		const ORDER_TEXT = 'ORDER BY sortOrder, title';

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				createTable: `
					CREATE TABLE IF NOT EXISTS <!tableName!> (
						[refId] TEXT PRIMARY KEY,
						[createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						[updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						[pageSlug] TEXT NOT NULL UNIQUE,
						[title] TEXT NOT NULL,
						[summary] TEXT,
						[audienceText] TEXT,
						[standardKey] TEXT,
						[subjectStableId] TEXT,
						[targetKind] TEXT NOT NULL CHECK ([targetKind] IN ('compiled', 'externalUrl')),
						[externalUrl] TEXT,
						[compilerName] TEXT,
						[sortOrder] INTEGER NOT NULL,
						[isActive] INTEGER NOT NULL CHECK ([isActive] IN (0, 1))
					);
					CREATE TRIGGER IF NOT EXISTS <!tableName!>UpdateTimestamp
						AFTER UPDATE ON <!tableName!>
						FOR EACH ROW
						BEGIN
						  UPDATE <!tableName!> SET [updatedAt] = CURRENT_TIMESTAMP WHERE [refId] = NEW.[refId];
						END;`,
				byPageSlug: `SELECT * FROM <!tableName!> WHERE pageSlug = <!pageSlug!>`,
				activeForStandard: `SELECT * FROM <!tableName!> WHERE isActive = 1 AND standardKey = <!standardKey!> AND subjectStableId IS NULL ${ORDER_TEXT}`,
				activeForStandardSubject: `SELECT * FROM <!tableName!> WHERE isActive = 1 AND standardKey = <!standardKey!> AND (subjectStableId IS NULL OR subjectStableId = <!subjectStableId!>) ${ORDER_TEXT}`,
				insert: `INSERT INTO <!tableName!> ([refId], ${columnListText}) VALUES (<!refId!>, ${valueListText})`,
				updateByPageSlug: `UPDATE <!tableName!> SET ${assignmentListText} WHERE pageSlug = <!pageSlug!>`,
			};

			if (!queries[queryName]) {
				xLog.error(`Unknown query name '${queryName}' in ${moduleName}`);
				return undefined;
			}

			return safeSql(queries[queryName], replaceObject);
		};

		// ================================================================================
		// MAPPER API EXPORT

		return {
			map: mapper,
			getSql,
			dataColumnList,
			TARGET_KIND_LIST,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
