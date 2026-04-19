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

				// ----- graphStatsLabelsBySource - per-source label counts for graphStats shaping.
				// Returns one row per (source, label) pair. The mapper's shapeGraphStats() uses
				// this to build the heterogeneous per-standard stats object (per spec §2.1).
				'graphStatsLabelsBySource': {
					cypher: `
						MATCH (n)
						WHERE n._source IS NOT NULL
						UNWIND labels(n) AS label
						RETURN n._source AS source, label, count(*) AS count
					`,
					params: {},
				},

				// ----- mapsToCountsBySource - per-source count of MAPS_TO relationships to CEDS.
				// Used for sif-mapped-fields and ceds-sif-mapped-properties counts.
				'mapsToCountsBySource': {
					cypher: `
						MATCH (src)-[:MAPS_TO]->(tgt)
						WHERE src._source IS NOT NULL AND tgt._source = 'CEDS'
						RETURN src._source AS source, count(*) AS mapsToCount
					`,
					params: {},
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
		// GRAPH-STATS SHAPING
		//
		// Per spec §2.1 graphStats is heterogeneous per standard. The access point runs
		// the graphStatsLabelsBySource and mapsToCountsBySource queries, then calls
		// shapeGraphStats() to build a { [standardName]: statsObject } lookup.
		// mergeGraphStats() then attaches graphStats per standard response item, using
		// the standard's name to look up the shape (null for standards not in the graph).

		// Maps EdMatrix standard names (what /api/standards returns) to the graph's
		// _source tag. Left column is what clients see; right column is the subgraph key.
		const standardNameToSource = {
			'CEDS': 'CEDS',
			'SIF Data Model': 'SIF',
			'SIF Infrastructure': 'SIF',
			'Ed-Fi Data Standard': 'EdFi',
			'CTDL': 'CTDL',
			'CLR': 'CLR',
			'CASE': 'CASE',
			// Phase C additions (forge names as-of 2026-04-18; refine after rebuild)
			'CIP': 'CIP',
			'JEDx': 'JEDx',
			'LIF': 'LIF',
			'IEEE P1484.2': 'LIF',
			'PESC': 'PESC',
			'SEDM': 'SEDM',
		};

		// Per-source shape builder. Given a labels→count dict for one source and the
		// MAPS_TO count (standard→CEDS) for that source, return the heterogeneous
		// graphStats object from spec §2.1.
		const shapeOneSource = (source, labelCounts, mapsToCount) => {
			const c = (label) => labelCounts[label] || 0;
			switch (source) {
				case 'CTDL':
					return { classes: c('CtdlClass'), properties: c('CtdlProperty') };
				case 'SIF':
					return {
						objects: c('SifObject'),
						fields: c('SifField'),
						cedsMappedFields: mapsToCount || 0,
					};
				case 'EdFi':
					return { entities: c('EdfiEntity'), fields: c('EdfiField') };
				case 'CEDS':
					return {
						classes: c('CedsClass'),
						properties: c('CedsProperty'),
						sifMappedProperties: 0, // computed below via reverse lookup
					};
				case 'CIP':
					return { programs: c('CipProgram') };
				case 'PESC':
					return {
						elements: c('PescElement'),
						complexTypes: c('PescComplexType'),
						simpleTypes: c('PescSimpleType'),
					};
				case 'JEDx':
					return { entities: c('JedxEntity'), fields: c('JedxField') };
				case 'CLR':
					return { classes: c('ClrClass'), properties: c('ClrProperty') };
				case 'CASE':
					return { classes: c('CaseClass'), properties: c('CaseProperty') };
				case 'LIF':
					return { entities: c('LifEntity'), properties: c('LifProperty') };
				case 'SEDM':
					return { elements: c('SedmElement') };
				default:
					return null;
			}
		};

		// labelBySourceRecords: [{ source, label, count }, ...]
		// mapsToBySourceRecords: [{ source, mapsToCount }, ...]
		// Returns a map keyed by _source → shaped graphStats object.
		const shapeGraphStats = (labelBySourceRecords, mapsToBySourceRecords) => {
			const perSourceLabels = {};
			(labelBySourceRecords || []).forEach((rec) => {
				const src = rec.source;
				if (!src) return;
				perSourceLabels[src] = perSourceLabels[src] || {};
				perSourceLabels[src][rec.label] = rec.count || 0;
			});

			const mapsToBySource = {};
			(mapsToBySourceRecords || []).forEach((rec) => {
				if (rec.source) mapsToBySource[rec.source] = rec.mapsToCount || 0;
			});

			const bySource = {};
			Object.keys(perSourceLabels).forEach((src) => {
				const shaped = shapeOneSource(src, perSourceLabels[src], mapsToBySource[src]);
				if (shaped) bySource[src] = shaped;
			});

			// CEDS.sifMappedProperties is the count of MAPS_TO edges from SIF to CEDS.
			// That's already captured as mapsToBySource['SIF'] for the SIF entry; mirror it
			// onto CEDS so the CEDS card can display it directly.
			if (bySource.CEDS && mapsToBySource.SIF !== undefined) {
				bySource.CEDS.sifMappedProperties = mapsToBySource.SIF;
			}

			return bySource;
		};

		// Attach graphStats to each standard in a list response.
		const mergeGraphStats = (standardsList, graphStatsBySource) => {
			return standardsList.map((s) => {
				const src = standardNameToSource[s.name];
				const stats = src && graphStatsBySource[src] ? graphStatsBySource[src] : null;
				return { ...s, graphStats: stats };
			});
		};

		// ================================================================================
		// MAPPER API EXPORT

		return {
			getCypher,
			mapList: mapListResult,
			mapDetail: mapDetailResult,
			shapeGraphStats,
			mergeGraphStats,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction(moduleName);
