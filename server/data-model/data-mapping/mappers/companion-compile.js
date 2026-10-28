#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
// @concept: [[MapperPattern]]
//
// A companion compile is one build of a compiled companion page's data (SPEC-companionPages-102826, Phase 3), stamped
// with what it was built from: the golden's name and graph contract, the hash of the page's current sources, and the
// compiler's version. A compile is current only while all four stamps equal the live values. Only successful compiles
// are stored (statusText 'compiled'); the newest row for a page is therefore also its last good compile.
//
// Declared schema, written with insert and runStatement (not saveObject), as companion-page and companion-source are:
// this project's sqlite-instance still doubles apostrophes on save, and the payload is full of them.
//
// Also holds the Cypher the compile reads on the golden's READ-ONLY handle: the passport (the same query
// standard-downloads proves its manifest with) and the JEDx row sets the jedxDictionary compiler joins.

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
			['graphName']: 'graphName',
			['graphContractSha256']: 'graphContractSha256',
			['sourceSetSha256']: 'sourceSetSha256',
			['compiledAt']: 'compiledAt',
			['compilerVersion']: 'compilerVersion',
			['payloadJson']: 'payloadJson',
			['statusText']: 'statusText',
			['createdAt']: 'createdAt',
			['updatedAt']: 'updatedAt',
		};

		const dataColumnList = Object.keys(inputNameMapping).filter((columnName) => !['refId', 'createdAt', 'updatedAt'].includes(columnName));

		// the stamps a compile is judged current by, in the order a stale answer names them
		const FRESHNESS_STAMP_NAME_LIST = ['graphName', 'graphContractSha256', 'sourceSetSha256', 'compilerVersion'];

		// ================================================================================
		// TRANSFORMATION

		const basicMapper = baseMappingProcess(inputNameMapping);

		const mapper = (inData, direction = 'forward') => {
			if (Array.isArray(inData)) {
				return inData.map((inObj) => basicMapper(inObj, { direction }));
			}
			return basicMapper(inData, { direction });
		};

		// ================================================================================
		// NAMED SQL QUERY GENERATION

		const columnListText = dataColumnList.map((columnName) => `[${columnName}]`).join(', ');
		const valueListText = dataColumnList.map((columnName) => `<!${columnName}!>`).join(', ');

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				createTable: `
					CREATE TABLE IF NOT EXISTS <!tableName!> (
						[refId] TEXT PRIMARY KEY,
						[createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						[updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						[pageSlug] TEXT NOT NULL,
						[graphName] TEXT NOT NULL,
						[graphContractSha256] TEXT NOT NULL,
						[sourceSetSha256] TEXT NOT NULL,
						[compiledAt] TEXT NOT NULL,
						[compilerVersion] TEXT NOT NULL,
						[payloadJson] TEXT NOT NULL,
						[statusText] TEXT NOT NULL CHECK ([statusText] IN ('compiled'))
					);
					CREATE INDEX IF NOT EXISTS <!tableName!>ByPage ON <!tableName!> ([pageSlug], [compiledAt]);
					CREATE TRIGGER IF NOT EXISTS <!tableName!>UpdateTimestamp
						AFTER UPDATE ON <!tableName!>
						FOR EACH ROW
						BEGIN
						  UPDATE <!tableName!> SET [updatedAt] = CURRENT_TIMESTAMP WHERE [refId] = NEW.[refId];
						END;`,
				newestForPage: `SELECT * FROM <!tableName!> WHERE pageSlug = <!pageSlug!> ORDER BY compiledAt DESC, rowid DESC LIMIT 1`,
				insert: `INSERT INTO <!tableName!> ([refId], ${columnListText}) VALUES (<!refId!>, ${valueListText})`,
			};

			if (!queries[queryName]) {
				xLog.error(`Unknown query name '${queryName}' in ${moduleName}`);
				return undefined;
			}

			return safeSql(queries[queryName], replaceObject);
		};

		// ================================================================================
		// NAMED CYPHER (golden, read only)

		const CYPHER_BY_NAME = Object.freeze({
			goldenPassport: 'MATCH (p:GraphProvenance) RETURN p.graphName AS graphName, p.graphContractSha256 AS graphContractSha256',
			jedxRootList: 'MATCH (r:JedxRoot) RETURN r.version AS jedxVersion',
			jedxPropertyList: `MATCH (s:JedxSchema)-[:HAS_PROPERTY]->(p:JedxProperty)
				OPTIONAL MATCH (p)-[:REFERENCES]->(t:JedxSchema)
				RETURN s.name AS schemaName, p.name AS propertyName, p.stableId AS stableId, t.name AS targetSchemaName
				ORDER BY schemaName, propertyName, stableId, targetSchemaName`,
			jedxSchemaReferenceList: `MATCH (a:JedxSchema)-[:REFERENCES]->(b:JedxSchema)
				RETURN a.name AS schemaName, b.name AS referencedSchemaName
				ORDER BY schemaName, referencedSchemaName`,
			jedxMatchList: `MATCH (p:JedxProperty)-[r:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(h:HubReference)
				RETURN p.stableId AS stableId, type(r) AS relationshipType, h.name AS matchName, h.stableId AS matchStableId, h.hubName AS hubName,
					r.mappingMethod AS mappingMethod, r.mappingSource AS mappingSource, r.mappingConfidence AS mappingConfidence, r.mappingRationale AS mappingRationale
				ORDER BY stableId, relationshipType, matchStableId`,
		});

		const getCypher = (queryName) => {
			if (!CYPHER_BY_NAME[queryName]) {
				throw new Error(`${moduleName}: unknown query name '${queryName}'; known: ${Object.keys(CYPHER_BY_NAME).join(', ')}`);
			}
			return { cypher: CYPHER_BY_NAME[queryName], params: {} };
		};

		// ================================================================================
		// MAPPER API EXPORT

		return {
			map: mapper,
			getSql,
			getCypher,
			dataColumnList,
			FRESHNESS_STAMP_NAME_LIST,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
