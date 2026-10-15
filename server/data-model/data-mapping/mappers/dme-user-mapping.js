#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
// @concept: [[MapperPattern]]
//
// A user mapping is one accepted equivalence in the Schema Verifier's curated
// crosswalk: SOURCE element (the thing being mapped, identified by mappingKey)
// → TARGET element in another specification, plus an optional TRANSFORMATION
// RULE describing how a value moves from source to target.
//
// Mappings are proposals visible to every logged-in user. Each carries a review
// status (proposed → accepted | rejected) that an admin sets; accepted rows are
// what the graph-ingestion export emits by default.
//
// Identity of a mapping (for upsert) is (userRefId, mappingKey, targetStandard,
// targetName) — the same identity the browser store uses.

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
			['mappingKey']: 'mappingKey',
			['sourceStandard']: 'sourceStandard',
			['sourceName']: 'sourceName',
			['sourceId']: 'sourceId',
			['sourcePath']: 'sourcePath',
			['targetStandard']: 'targetStandard',
			['targetName']: 'targetName',
			['targetSourceId']: 'targetSourceId',
			['targetPath']: 'targetPath',
			['rel']: 'rel',
			['detail']: 'detail',
			['transformType']: 'transformType',
			['transformRule']: 'transformRule',
			['transformNotes']: 'transformNotes',
			['status']: 'status',
			['reviewedBy']: 'reviewedBy',
			['reviewedAt']: 'reviewedAt',
			['reviewNote']: 'reviewNote',
			['createdAt']: 'createdAt',
			['updatedAt']: 'updatedAt',
		};

		// Columns the table must carry beyond the refId/createdAt/updatedAt that
		// sqlite-instance creates for every table. All TEXT; SQLite is untyped enough
		// that this is the honest declaration.
		const dataColumns = Object.keys(inputNameMapping).filter(
			(name) => !['refId', 'createdAt', 'updatedAt'].includes(name),
		);

		const REVIEW_STATUSES = ['proposed', 'accepted', 'rejected'];

		// ================================================================================
		// TRANSFORMATION FUNCTION SETUP

		const basicMapper = baseMappingProcess(inputNameMapping);

		const recordMapper = (inObj, direction = 'forward') => basicMapper(inObj, { direction });

		const mapper = (inData, direction = 'forward') => {
			if (Array.isArray(inData)) {
				return inData.map((inObj) => recordMapper(inObj, direction));
			}
			return recordMapper(inData, direction);
		};

		// ================================================================================
		// NAMED SQL QUERY GENERATION
		//
		// <!tableName!> is left for sqlite-instance to substitute; every other token
		// is a user value and is escaped by safeSql.

		const identityColumns = ['userRefId', 'mappingKey', 'targetStandard', 'targetName'];
		const columnList = dataColumns.map((name) => `[${name}]`).join(', ');
		const valueList = dataColumns.map((name) => `<!${name}!>`).join(', ');
		const assignmentList = dataColumns
			.filter((name) => !identityColumns.includes(name))
			.map((name) => `[${name}]=<!${name}!>`)
			.join(', ');

		const ORDER = `ORDER BY sourceStandard, mappingKey, targetStandard, targetName`;

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				byUser: `SELECT * FROM <!tableName!> WHERE userRefId = <!userRefId!> ${ORDER}`,
				all: `SELECT * FROM <!tableName!> ${ORDER}`,
				allByStatus: `SELECT * FROM <!tableName!> WHERE status = <!status!> ${ORDER}`,
				byRefId: `SELECT * FROM <!tableName!> WHERE refId = <!refId!>`,
				byIdentity: `SELECT * FROM <!tableName!> WHERE userRefId = <!userRefId!> AND mappingKey = <!mappingKey!> AND targetStandard = <!targetStandard!> AND targetName = <!targetName!>`,
				insert: `INSERT INTO <!tableName!> ([refId], ${columnList}) VALUES (<!refId!>, ${valueList})`,
				updateByRefId: `UPDATE <!tableName!> SET ${assignmentList} WHERE refId = <!refId!> AND userRefId = <!userRefId!>`,
				setStatus: `UPDATE <!tableName!> SET [status] = <!status!>, [reviewedBy] = <!reviewedBy!>, [reviewedAt] = <!reviewedAt!>, [reviewNote] = <!reviewNote!> WHERE refId = <!refId!>`,
				deleteByRefId: `DELETE FROM <!tableName!> WHERE refId = <!refId!> AND userRefId = <!userRefId!>`,
				deleteByRefIdAny: `DELETE FROM <!tableName!> WHERE refId = <!refId!>`,
				deleteByIdentity: `DELETE FROM <!tableName!> WHERE userRefId = <!userRefId!> AND mappingKey = <!mappingKey!> AND targetStandard = <!targetStandard!> AND targetName = <!targetName!>`,
				countByStatus: `SELECT status, COUNT(*) AS n FROM <!tableName!> GROUP BY status`,
			};

			if (!queries[queryName]) {
				xLog.error(`Unknown query name '${queryName}' in ${moduleName}`);
				return undefined;
			}

			// Every data column must resolve to a literal, so absent fields become ''
			// rather than an unreplaced token.
			const filled = { ...replaceObject };
			if (['insert', 'updateByRefId'].includes(queryName)) {
				dataColumns.forEach((name) => {
					if (filled[name] === undefined || filled[name] === null) filled[name] = '';
				});
			}

			return safeSql(queries[queryName], filled);
		};

		// ================================================================================
		// MAPPER API EXPORT

		return {
			map: mapper,
			getSql,
			dataColumns,
			REVIEW_STATUSES,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction(moduleName);
