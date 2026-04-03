#!/usr/bin/env node
'use strict';
// @concept: [[EdMatrixReport]]
// @concept: [[CypherQueryDispatch]]
// @concept: [[MapperPattern]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess }) => {
		process.global = process.global ? process.global : {};
		const xLog = process.global.xLog;

		// ================================================================================
		// NAMED CYPHER QUERY GENERATION
		//
		// Returns { cypher, params } tuples for Neo4j parameterized queries.
		// Access points call getCypher('queryName', { orgName: 'value' }).
		// Uses Neo4j $param syntax for safe parameterized queries.
		// All queries filter on _source = 'EdMatrix' to scope to EdMatrix data only.

		const getCypher = (queryName, queryParams = {}) => {
			const queries = {

				// ----- allStandards - all EdStandard nodes with org, types, formats, layers
				'allStandards': {
					cypher: `
						MATCH (s:EdStandard {_source: 'EdMatrix'})
						OPTIONAL MATCH (s)-[:PUBLISHED_BY]->(org:Organization)
						OPTIONAL MATCH (s)-[:HAS_TYPE]->(cat:DataCategory)
						OPTIONAL MATCH (s)-[:USES_FORMAT]->(fmt:SerializationFormat)
						OPTIONAL MATCH (s)-[:AT_LAYER]->(lyr:SpecLayer)
						WITH s, org,
							COLLECT(DISTINCT cat.name) AS types,
							COLLECT(DISTINCT fmt.name) AS formats,
							COLLECT(DISTINCT lyr.name) AS layers
						RETURN s.name AS name, org.name AS organization,
							s.description AS description, s.url AS url,
							types, formats, layers
						ORDER BY s.name
					`,
					params: {},
				},

				// ----- standardsByOrg - EdStandards filtered by organization name
				'standardsByOrg': {
					cypher: `
						MATCH (s:EdStandard {_source: 'EdMatrix'})-[:PUBLISHED_BY]->(org:Organization {name: $orgName})
						OPTIONAL MATCH (s)-[:HAS_TYPE]->(cat:DataCategory)
						OPTIONAL MATCH (s)-[:USES_FORMAT]->(fmt:SerializationFormat)
						OPTIONAL MATCH (s)-[:AT_LAYER]->(lyr:SpecLayer)
						WITH s, org,
							COLLECT(DISTINCT cat.name) AS types,
							COLLECT(DISTINCT fmt.name) AS formats,
							COLLECT(DISTINCT lyr.name) AS layers
						RETURN s.name AS name, org.name AS organization,
							s.description AS description, s.url AS url,
							types, formats, layers
						ORDER BY s.name
					`,
					params: { orgName: queryParams.orgName },
				},

				// ----- allOrganizations - distinct Organization nodes for EdMatrix
				'allOrganizations': {
					cypher: `
						MATCH (s:EdStandard {_source: 'EdMatrix'})-[:PUBLISHED_BY]->(org:Organization)
						RETURN DISTINCT org.name AS name, org.description AS description
						ORDER BY org.name
					`,
					params: {},
				},

				// ----- allCategories - DataCategory nodes for EdMatrix
				'allCategories': {
					cypher: `
						MATCH (s:EdStandard {_source: 'EdMatrix'})-[:HAS_TYPE]->(cat:DataCategory)
						RETURN DISTINCT cat.name AS name, cat.description AS description
						ORDER BY cat.name
					`,
					params: {},
				},

				// ----- standardWithRelationships - single standard with all connected nodes
				'standardWithRelationships': {
					cypher: `
						MATCH (s:EdStandard {_source: 'EdMatrix', name: $standardName})
						OPTIONAL MATCH (s)-[:PUBLISHED_BY]->(org:Organization)
						OPTIONAL MATCH (s)-[:HAS_TYPE]->(cat:DataCategory)
						OPTIONAL MATCH (s)-[:USES_FORMAT]->(fmt:SerializationFormat)
						OPTIONAL MATCH (s)-[:AT_LAYER]->(lyr:SpecLayer)
						OPTIONAL MATCH (s)-[:IN_USE_CASE]->(uc:UseCaseCategory)
						WITH s, org,
							COLLECT(DISTINCT cat.name) AS types,
							COLLECT(DISTINCT fmt.name) AS formats,
							COLLECT(DISTINCT lyr.name) AS layers,
							COLLECT(DISTINCT uc.name) AS useCases
						RETURN s.name AS name, org.name AS organization,
							s.description AS description, s.url AS url,
							types, formats, layers, useCases
					`,
					params: { standardName: queryParams.standardName },
				},

				// ----- standardsByCategory - 2-hop graph traversal demo
				// From DataCategory -> EdStandards -> Organizations
				'standardsByCategory': {
					cypher: `
						MATCH (cat:DataCategory {_source: 'EdMatrix', name: $categoryName})<-[:HAS_TYPE]-(s:EdStandard {_source: 'EdMatrix'})
						OPTIONAL MATCH (s)-[:PUBLISHED_BY]->(org:Organization)
						OPTIONAL MATCH (s)-[:HAS_TYPE]->(allCat:DataCategory)
						OPTIONAL MATCH (s)-[:USES_FORMAT]->(fmt:SerializationFormat)
						OPTIONAL MATCH (s)-[:AT_LAYER]->(lyr:SpecLayer)
						WITH s, org,
							COLLECT(DISTINCT allCat.name) AS types,
							COLLECT(DISTINCT fmt.name) AS formats,
							COLLECT(DISTINCT lyr.name) AS layers
						RETURN s.name AS name, org.name AS organization,
							s.description AS description, s.url AS url,
							types, formats, layers
						ORDER BY s.name
					`,
					params: { categoryName: queryParams.categoryName },
				},
			};

			if (!queries[queryName]) {
				xLog.error(`Unknown query name '${queryName}' in ${moduleName}`);
				return undefined;
			}

			return queries[queryName];
		};

		// ================================================================================
		// RESULT TRANSFORMATION
		//
		// Transforms raw Neo4j records into clean API response objects.
		// Provides defaults for null/undefined properties.
		// Deduplicates and coerces array values.

		const ensureArray = (val) => {
			if (!val) return [];
			if (!Array.isArray(val)) return [val];
			return [...new Set(val)].filter(v => v !== null && v !== undefined);
		};

		const mapListResult = (records) => {
			return records.map((record) => ({
				name: record.name || '',
				organization: record.organization || 'Unknown',
				description: record.description || '',
				url: record.url || '',
				types: ensureArray(record.types),
				formats: ensureArray(record.formats),
				layers: ensureArray(record.layers),
			}));
		};

		const mapDetailResult = (records) => {
			if (!records || records.length === 0) {
				return [];
			}

			const record = records[0];

			return [{
				name: record.name || '',
				organization: record.organization || 'Unknown',
				description: record.description || '',
				url: record.url || '',
				types: ensureArray(record.types),
				formats: ensureArray(record.formats),
				layers: ensureArray(record.layers),
				useCases: ensureArray(record.useCases),
			}];
		};

		// ================================================================================
		// MAPPER API EXPORT

		return {
			getCypher,
			mapList: mapListResult,
			mapDetail: mapDetailResult,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction(moduleName);
