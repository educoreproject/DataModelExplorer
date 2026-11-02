#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[MapperPattern]]
//
// A companion source is one uploaded document a companion page is built from (Steve Saxton's dictionary tabs, the
// Arkansas pilot sheet, the Guide), kept with its provenance. A row is never rewritten in place except to clear
// isCurrent: a new upload ADDS a row and moves isCurrent to it, so every earlier compile can be traced to the bytes it
// used. "Current" is per (pageSlug, sourceRole, sourcePart); sourcePart names one file of a many-file source (a
// dictionary tab: 'TOC', 'I', 'III' ...) and is '' for a single-file role. The partial unique index makes SQLite
// itself refuse a second current row; the MoveCurrent trigger clears the old one inside the inserting statement.
//
// Written through runStatement, not saveObject, for the reason given in companion-page.js (doubled apostrophes).
// The stored file's location is storedFileName, inside companionSources/<pageSlug>/; it never leaves the server.

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
			['sourceRole']: 'sourceRole',
			['sourcePart']: 'sourcePart',
			['fileName']: 'fileName',
			['storedFileName']: 'storedFileName',
			['mediaType']: 'mediaType',
			['byteSize']: 'byteSize',
			['sha256']: 'sha256',
			['originUrl']: 'originUrl',
			['originNote']: 'originNote',
			['documentDate']: 'documentDate',
			['uploadedBy']: 'uploadedBy',
			['uploadedAt']: 'uploadedAt',
			['isCurrent']: 'isCurrent',
			['createdAt']: 'createdAt',
			['updatedAt']: 'updatedAt',
		};

		const dataColumnList = Object.keys(inputNameMapping).filter((columnName) => !['refId', 'createdAt', 'updatedAt'].includes(columnName));

		// what a browser may see of a row: everything except where the file is stored
		const publicPropertyList = Object.keys(inputNameMapping).filter((propertyName) => propertyName !== 'storedFileName');

		// ================================================================================
		// TRANSFORMATION

		const basicMapper = baseMappingProcess(inputNameMapping);

		const recordMapper = (inObj, direction = 'forward') => {
			const outObj = basicMapper(inObj, { direction });
			if (direction === 'forward' && outObj.isCurrent !== undefined) {
				outObj.isCurrent = Number(outObj.isCurrent) === 1;
			}
			if (direction === 'reverse' && outObj.isCurrent !== undefined) {
				if (typeof outObj.isCurrent !== 'boolean') {
					throw new Error(`${moduleName}: isCurrent must be true or false (got ${JSON.stringify(outObj.isCurrent)})`);
				}
				outObj.isCurrent = outObj.isCurrent ? 1 : 0;
			}
			return outObj;
		};

		const mapper = (inData, direction = 'forward') => {
			if (Array.isArray(inData)) {
				return inData.map((inObj) => recordMapper(inObj, direction));
			}
			return recordMapper(inData, direction);
		};

		const toPublic = (sourceRecord) => sourceRecord.qtSelectProperties(publicPropertyList);

		// ================================================================================
		// NAMED SQL QUERY GENERATION

		const columnListText = dataColumnList.map((columnName) => `[${columnName}]`).join(', ');
		const valueListText = dataColumnList.map((columnName) => `<!${columnName}!>`).join(', ');
		const NEWEST_FIRST_TEXT = 'ORDER BY sourceRole, sourcePart, uploadedAt DESC, createdAt DESC';

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				createTable: `
					CREATE TABLE IF NOT EXISTS <!tableName!> (
						[refId] TEXT PRIMARY KEY,
						[createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						[updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						[pageSlug] TEXT NOT NULL,
						[sourceRole] TEXT NOT NULL,
						[sourcePart] TEXT NOT NULL,
						[fileName] TEXT NOT NULL,
						[storedFileName] TEXT NOT NULL UNIQUE,
						[mediaType] TEXT NOT NULL,
						[byteSize] INTEGER NOT NULL,
						[sha256] TEXT NOT NULL,
						[originUrl] TEXT,
						[originNote] TEXT,
						[documentDate] TEXT,
						[uploadedBy] TEXT NOT NULL,
						[uploadedAt] TEXT NOT NULL,
						[isCurrent] INTEGER NOT NULL CHECK ([isCurrent] IN (0, 1))
					);
					CREATE UNIQUE INDEX IF NOT EXISTS <!tableName!>OneCurrent
						ON <!tableName!> ([pageSlug], [sourceRole], [sourcePart]) WHERE [isCurrent] = 1;
					CREATE TRIGGER IF NOT EXISTS <!tableName!>MoveCurrent
						BEFORE INSERT ON <!tableName!>
						FOR EACH ROW WHEN NEW.[isCurrent] = 1
						BEGIN
						  UPDATE <!tableName!> SET [isCurrent] = 0
							WHERE [pageSlug] = NEW.[pageSlug] AND [sourceRole] = NEW.[sourceRole] AND [sourcePart] = NEW.[sourcePart] AND [isCurrent] = 1;
						END;
					CREATE TRIGGER IF NOT EXISTS <!tableName!>UpdateTimestamp
						AFTER UPDATE ON <!tableName!>
						FOR EACH ROW
						BEGIN
						  UPDATE <!tableName!> SET [updatedAt] = CURRENT_TIMESTAMP WHERE [refId] = NEW.[refId];
						END;`,
				byRefId: `SELECT * FROM <!tableName!> WHERE refId = <!refId!>`,
				currentByPart: `SELECT * FROM <!tableName!> WHERE pageSlug = <!pageSlug!> AND sourceRole = <!sourceRole!> AND sourcePart = <!sourcePart!> AND isCurrent = 1`,
				currentForPage: `SELECT * FROM <!tableName!> WHERE pageSlug = <!pageSlug!> AND isCurrent = 1 ${NEWEST_FIRST_TEXT}`,
				historyForPage: `SELECT * FROM <!tableName!> WHERE pageSlug = <!pageSlug!> ${NEWEST_FIRST_TEXT}`,
				// ONE statement, so it is atomic: the BEFORE INSERT trigger (createTable) clears the previous current row in
				// the same statement, and a refused insert undoes that too. No explicit transaction to leave open.
				insertAsCurrent: `INSERT INTO <!tableName!> ([refId], ${columnListText}) VALUES (<!refId!>, ${valueListText})`,
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
			toPublic,
			dataColumnList,
			publicPropertyList,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
