#!/usr/bin/env node
'use strict';

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
		// Access points call getCypher('queryName', { nodeId: 'value' }).
		// Uses Neo4j $param syntax for safe parameterized queries.

		const getCypher = (queryName, queryParams = {}) => {
			const queries = {

				// ----- standards - hardcoded root list
				'standards': {
					cypher: `RETURN 'done' AS done`,
					params: {},
					hardcoded: [
						{ id: 'sif', label: 'SIF', nodeType: 'standard', hasChildren: true },
						{ id: 'ceds', label: 'CEDS v14', nodeType: 'standard', hasChildren: true },
					],
				},

				// ----- sifTopLevel - all SIF objects
				'sifTopLevel': {
					cypher: `
						MATCH (o:SifObject)
						OPTIONAL MATCH (o)-[:HAS_ROOT_ELEMENT]->(re:SifXmlElement)
						RETURN o.name AS id, o.name AS label, 'SifObject' AS nodeType,
							COUNT(re) > 0 AS hasChildren, o.fieldCount AS childCount
						ORDER BY o.name
					`,
					params: {},
				},

				// ----- cedsTopLevel - all CEDS classes
				'cedsTopLevel': {
					cypher: `
						MATCH (c:CedsClass)
						OPTIONAL MATCH (c)-[:HAS_PROPERTY]->(p:CedsProperty)
						RETURN c.cedsId AS id, c.label AS label, 'CedsClass' AS nodeType,
							COUNT(p) > 0 AS hasChildren, COUNT(p) AS childCount
						ORDER BY c.label
					`,
					params: {},
				},

				// ----- sifObjectChildren - root XML elements of a SIF object
				'sifObjectChildren': {
					cypher: `
						MATCH (o:SifObject {name: $nodeId})-[:HAS_ROOT_ELEMENT]->(re:SifXmlElement)
						OPTIONAL MATCH (re)-[:CHILD_ELEMENT]->(child:SifXmlElement)
						RETURN re.name AS id, re.name AS label, 'SifXmlElement' AS nodeType,
							re.path AS path, re.depth AS depth,
							COUNT(child) > 0 AS hasChildren, COUNT(child) AS childCount
						ORDER BY re.name
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- sifElementChildren - child XML elements of an XML element
				'sifElementChildren': {
					cypher: `
						MATCH (parent:SifXmlElement {path: $nodeId})-[:CHILD_ELEMENT]->(child:SifXmlElement)
						OPTIONAL MATCH (child)-[:CHILD_ELEMENT]->(grandchild:SifXmlElement)
						RETURN child.name AS id, child.name AS label, 'SifXmlElement' AS nodeType,
							child.path AS path, child.depth AS depth, child.isLeaf AS isLeaf,
							COUNT(grandchild) > 0 AS hasChildren, COUNT(grandchild) AS childCount
						ORDER BY child.name
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- cedsClassChildren - properties of a CEDS class
				'cedsClassChildren': {
					cypher: `
						MATCH (c:CedsClass {cedsId: $nodeId})-[:HAS_PROPERTY]->(p:CedsProperty)
						OPTIONAL MATCH (p)-[:HAS_OPTION_SET]->(os:CedsOptionSet)-[:HAS_VALUE]->(ov:CedsOptionValue)
						RETURN p.cedsId AS id, p.label AS label, 'CedsProperty' AS nodeType,
							COUNT(ov) > 0 AS hasChildren, COUNT(ov) AS childCount
						ORDER BY p.label
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- cedsPropertyChildren - option values of a CEDS property
				'cedsPropertyChildren': {
					cypher: `
						MATCH (p:CedsProperty {cedsId: $nodeId})-[:HAS_OPTION_SET]->(os:CedsOptionSet)-[:HAS_VALUE]->(ov:CedsOptionValue)
						RETURN ov.cedsId AS id, ov.label AS label, 'CedsOptionValue' AS nodeType,
							false AS hasChildren, 0 AS childCount
						ORDER BY ov.label
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- sifLeafDetail - detail for a leaf SIF XML element (via REALIZED_BY -> SifField)
				'sifLeafDetail': {
					cypher: `
						MATCH (el:SifXmlElement {path: $nodeId})-[:REALIZED_BY]->(f:SifField)
						OPTIONAL MATCH (f)-[:HAS_TYPE]->(t)
						OPTIONAL MATCH (f)-[:CONSTRAINED_BY]->(cs:SifCodeset)
						OPTIONAL MATCH (f)-[:MAPS_TO]->(cp:CedsProperty)
						OPTIONAL MATCH (cp)<-[:HAS_PROPERTY]-(cc:CedsClass)
						RETURN f.name AS label, 'SifField' AS nodeType,
							f.description AS description, f.xpath AS xpath,
							labels(t)[0] AS typeName, t.name AS typeLabel,
							f.mandatory AS mandatory, f.cedsId AS cedsId, f.depth AS depth,
							cs.values AS codesetValues, cs.valueCount AS codesetValueCount,
							COLLECT(DISTINCT {
								target: cp.label,
								targetId: cp.cedsId,
								targetClass: cc.label,
								standard: 'CEDS',
								confidence: 1.0,
								source: 'spec-annotation'
							}) AS mappings
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- sifNonLeafDetail - detail for a non-leaf SIF XML element (no SifField)
				'sifNonLeafDetail': {
					cypher: `
						MATCH (el:SifXmlElement {path: $nodeId})
						RETURN el.name AS label, 'SifXmlElement' AS nodeType,
							el.path AS xpath, el.depth AS depth,
							el.isLeaf AS isLeaf,
							true AS isDetail
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- cedsPropertyDetail - detail for a CEDS property
				'cedsPropertyDetail': {
					cypher: `
						MATCH (p:CedsProperty {cedsId: $nodeId})
						OPTIONAL MATCH (p)-[:HAS_OPTION_SET]->(os:CedsOptionSet)-[:HAS_VALUE]->(ov:CedsOptionValue)
						OPTIONAL MATCH (f:SifField)-[:MAPS_TO]->(p)
						OPTIONAL MATCH (f)<-[:REALIZED_BY]-(el:SifXmlElement)<-[:HAS_ROOT_ELEMENT|CHILD_ELEMENT*]-(obj:SifObject)
						RETURN p.label AS label, 'CedsProperty' AS nodeType,
							p.description AS description, p.cedsId AS cedsId,
							p.notation AS notation,
							COLLECT(DISTINCT {label: ov.label, cedsId: ov.cedsId, description: ov.description}) AS optionValues,
							COLLECT(DISTINCT {
								target: f.name,
								targetXpath: f.xpath,
								targetObject: obj.name,
								standard: 'SIF',
								source: 'spec-annotation'
							}) AS mappings
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- cedsPropertyByName - find CEDS property by label (for AI search results)
				'cedsPropertyByName': {
					cypher: `
						MATCH (p:CedsProperty)
						WHERE toLower(p.label) = toLower($nodeId) OR p.label CONTAINS $nodeId
						WITH p LIMIT 1
						OPTIONAL MATCH (p)-[:HAS_OPTION_SET]->(os:CedsOptionSet)-[:HAS_VALUE]->(ov:CedsOptionValue)
						OPTIONAL MATCH (f:SifField)-[:MAPS_TO]->(p)
						OPTIONAL MATCH (f)<-[:REALIZED_BY]-(el:SifXmlElement)<-[:HAS_ROOT_ELEMENT|CHILD_ELEMENT*]-(obj:SifObject)
						RETURN p.label AS label, 'CedsProperty' AS nodeType,
							p.description AS description, p.cedsId AS cedsId,
							p.notation AS notation,
							COLLECT(DISTINCT {label: ov.label, cedsId: ov.cedsId, description: ov.description}) AS optionValues,
							COLLECT(DISTINCT {
								target: f.name,
								targetXpath: f.xpath,
								targetObject: obj.name,
								standard: 'SIF',
								source: 'spec-annotation'
							}) AS mappings
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- sifFieldByName - find SIF field by name (for AI search results)
				'sifFieldByName': {
					cypher: `
						MATCH (f:SifField)
						WHERE toLower(f.name) = toLower($nodeId) OR f.name CONTAINS $nodeId
						WITH f LIMIT 1
						OPTIONAL MATCH (obj:SifObject)-[:HAS_FIELD]->(f)
						OPTIONAL MATCH (f)-[:HAS_TYPE]->(t)
						OPTIONAL MATCH (f)-[:CONSTRAINED_BY]->(cs:SifCodeset)
						OPTIONAL MATCH (f)-[:MAPS_TO]->(p:CedsProperty)
						OPTIONAL MATCH (p)<-[:HAS_PROPERTY]-(cc:CedsClass)
						RETURN f.name AS label, 'SifField' AS nodeType,
							f.description AS description, f.xpath AS xpath,
							f.cedsId AS cedsId, f.mandatory AS mandatory,
							f.depth AS depth,
							t.name AS typeName,
							obj.name AS objectName,
							cs.values AS codesetValues, cs.valueCount AS codesetValueCount,
							COLLECT(DISTINCT {
								target: p.label,
								targetId: p.cedsId,
								targetClass: cc.label,
								standard: 'CEDS',
								source: 'mapped'
							}) AS mappings
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- cedsClassByName - find CEDS class by label (for AI search results)
				'cedsClassByName': {
					cypher: `
						MATCH (c:CedsClass)
						WHERE toLower(c.label) = toLower($nodeId) OR c.label CONTAINS $nodeId
						WITH c LIMIT 1
						OPTIONAL MATCH (c)-[:HAS_PROPERTY]->(p:CedsProperty)
						RETURN c.label AS label, 'CedsClass' AS nodeType,
							c.description AS description, c.cedsId AS cedsId,
							COLLECT(DISTINCT {label: p.label, cedsId: p.cedsId}) AS properties
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- cedsOptionValueDetail - detail for a CEDS option value
				'cedsOptionValueDetail': {
					cypher: `
						MATCH (ov:CedsOptionValue {cedsId: $nodeId})
						RETURN ov.label AS label, 'CedsOptionValue' AS nodeType,
							ov.description AS description, ov.cedsId AS cedsId,
							true AS isDetail
					`,
					params: { nodeId: queryParams.nodeId },
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
		// Handles list results and detail results differently.

		const mapListResult = (records) => {
			return records.map((record) => ({
				id: record.id,
				label: record.label,
				nodeType: record.nodeType,
				hasChildren: record.hasChildren || false,
				childCount: typeof record.childCount === 'number' ? record.childCount : 0,
				path: record.path || undefined,
			}));
		};

		const mapDetailResult = (records) => {
			if (!records || records.length === 0) {
				return [];
			}

			const record = records[0];

			const detail = {
				label: record.label,
				nodeType: record.nodeType,
				description: record.description || null,
				isDetail: true,
			};

			if (record.xpath !== undefined) detail.xpath = record.xpath;
			if (record.cedsId !== undefined) detail.cedsId = record.cedsId;
			if (record.notation !== undefined) detail.notation = record.notation;
			if (record.mandatory !== undefined) detail.mandatory = record.mandatory;
			if (record.depth !== undefined) detail.depth = record.depth;
			if (record.typeName !== undefined) detail.type = record.typeLabel || record.typeName;

			if (record.mappings) {
				detail.mappings = record.mappings.filter(
					(m) => m.target !== null && m.target !== undefined,
				);
			}

			if (record.optionValues) {
				detail.optionValues = record.optionValues.filter(
					(v) => v.label !== null && v.label !== undefined,
				);
			}

			if (record.codesetValues) {
				detail.codeset = {
					values: record.codesetValues,
					valueCount: record.codesetValueCount,
				};
			} else {
				detail.codeset = null;
			}

			return [detail];
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
