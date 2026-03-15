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

				// ----- cedsTopLevel - all CEDS classes
				'cedsTopLevel': {
					cypher: `
						MATCH (c:CedsClass)
						OPTIONAL MATCH (c)-[:HAS_PROPERTY]->(p:CedsProperty)
						RETURN c.cedsId AS id, c.label AS label, 'CedsClass' AS nodeType,
							'ceds' AS standard,
							COUNT(p) > 0 AS hasChildren, COUNT(p) AS childCount
						ORDER BY c.label
					`,
					params: {},
				},

				// ----- sifTopLevel - all SIF objects
				'sifTopLevel': {
					cypher: `
						MATCH (o:SifObject)
						OPTIONAL MATCH (o)-[:HAS_ROOT_ELEMENT]->(re:SifXmlElement)
						RETURN o.name AS id, o.name AS label, 'SifObject' AS nodeType,
							'sif' AS standard,
							COUNT(re) > 0 AS hasChildren, o.fieldCount AS childCount
						ORDER BY o.name
					`,
					params: {},
				},

				// ----- nodeDetail - find any node by cedsId or path, return its info + children
				// This is a universal lookup: given a nodeId, figure out what kind of node it is
				'nodeIdentify': {
					cypher: `
						OPTIONAL MATCH (cclass:CedsClass {cedsId: $nodeId})
						OPTIONAL MATCH (cprop:CedsProperty {cedsId: $nodeId})
						OPTIONAL MATCH (coval:CedsOptionValue {cedsId: $nodeId})
						OPTIONAL MATCH (sobj:SifObject {name: $nodeId})
						OPTIONAL MATCH (selem:SifXmlElement {path: $nodeId})
						OPTIONAL MATCH (sobjFallback:SifObject)
							WHERE sobjFallback.name = split($nodeId, '/')[-1]
						WITH
							CASE
								WHEN cclass IS NOT NULL THEN {node: cclass, nodeType: 'CedsClass', standard: 'ceds'}
								WHEN cprop IS NOT NULL THEN {node: cprop, nodeType: 'CedsProperty', standard: 'ceds'}
								WHEN coval IS NOT NULL THEN {node: coval, nodeType: 'CedsOptionValue', standard: 'ceds'}
								WHEN sobj IS NOT NULL THEN {node: sobj, nodeType: 'SifObject', standard: 'sif'}
								WHEN selem IS NOT NULL THEN {node: selem, nodeType: 'SifXmlElement', standard: 'sif'}
								WHEN sobjFallback IS NOT NULL THEN {node: sobjFallback, nodeType: 'SifObject', standard: 'sif'}
								ELSE NULL
							END AS found
						WHERE found IS NOT NULL
						RETURN found.nodeType AS nodeType, found.standard AS standard
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- cedsClassChildren - properties of a CEDS class
				'cedsClassChildren': {
					cypher: `
						MATCH (c:CedsClass {cedsId: $nodeId})-[:HAS_PROPERTY]->(p:CedsProperty)
						OPTIONAL MATCH (p)-[:HAS_OPTION_SET]->(os:CedsOptionSet)-[:HAS_VALUE]->(ov:CedsOptionValue)
						RETURN p.cedsId AS id, p.label AS label, 'CedsProperty' AS nodeType,
							'ceds' AS standard,
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
							'ceds' AS standard,
							false AS hasChildren, 0 AS childCount
						ORDER BY ov.label
					`,
					params: { nodeId: queryParams.nodeId },
				},

				// ----- sifObjectChildren - root XML elements of a SIF object
				'sifObjectChildren': {
					cypher: `
						MATCH (o:SifObject)
						WHERE o.name = $nodeId OR o.name = split($nodeId, '/')[-1]
						MATCH (o)-[:HAS_ROOT_ELEMENT]->(re:SifXmlElement)
						OPTIONAL MATCH (re)-[:CHILD_ELEMENT]->(child:SifXmlElement)
						RETURN re.name AS id, re.name AS label, 'SifXmlElement' AS nodeType,
							'sif' AS standard,
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
							'sif' AS standard,
							child.path AS path, child.depth AS depth, child.isLeaf AS isLeaf,
							COUNT(grandchild) > 0 AS hasChildren, COUNT(grandchild) AS childCount
						ORDER BY child.name
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
							'ceds' AS standard,
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

				// ----- cedsOptionValueDetail - detail for a CEDS option value
				'cedsOptionValueDetail': {
					cypher: `
						MATCH (ov:CedsOptionValue {cedsId: $nodeId})
						RETURN ov.label AS label, 'CedsOptionValue' AS nodeType,
							'ceds' AS standard,
							ov.description AS description, ov.cedsId AS cedsId,
							true AS isDetail
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
							'sif' AS standard,
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
							'sif' AS standard,
							el.path AS xpath, el.depth AS depth,
							el.isLeaf AS isLeaf,
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
				standard: record.standard || undefined,
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
				standard: record.standard || undefined,
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
