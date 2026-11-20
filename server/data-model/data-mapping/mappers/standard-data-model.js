#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MapperPattern]]
// @concept: [[Neo4jAbstraction]]

// standard-data-model — the named Cypher behind the Standards Explorer's data model map (BD 2026-11-17: the Diagram tab "should
// show a data model view, generated from the graph in the same format as the use case model"). The access point of the same
// name runs these on the golden read-only handle and hands the rows to render-data-model-diagram.
//
// Graph facts this mapper leans on (measured 2026-11-17 on the demo gold): a standard is a DmeStandardRoot that owns its classes
// by HAS_CLASS; a class owns its properties by HAS_PROPERTY (SIF: its fields by HAS_FIELD) and sits under a parent by SUBCLASS_OF;
// a property refers to another class by REFERENCES, REFERENCES_TYPE (Ed-Fi, PESC) or REFERENCES_OBJECT (SIF); a property maps to
// a hub card by a match edge, directly or on one of its HAS_INSTANCE occurrences (SIF, PESC). Sizes run from 7 classes
// (OneRoster Resources) to 536 (MedBiquitous), and CTDL's 137 classes hold 10,574 class-to-class pairs: the whole-standard map is
// drawn only below WHOLE_MAP_CLASS_LIMIT classes and WHOLE_MAP_LINK_LIMIT pairs; above, a class's own map is offered instead.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const requiredLabelList = Object.freeze(['ForgedNode', 'DmeStandardRoot', 'DmeClass', 'DmeProperty']);

const OWNS_PROPERTY_EDGE_TEXT = 'HAS_PROPERTY|HAS_FIELD';
const REFERS_TO_CLASS_EDGE_TEXT = 'REFERENCES|REFERENCES_TYPE|REFERENCES_OBJECT';
const MATCH_EDGE_TEXT = 'EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH';
// a property is mapped when it, or one of its occurrences, carries a match edge to a hub card
const isMappedTextFor = (propertyVariableName) => `EXISTS { (${propertyVariableName})-[:HAS_INSTANCE*0..1]->(:ForgedNode)-[:${MATCH_EDGE_TEXT}]->(:HubReference) }`;

const WHOLE_MAP_CLASS_LIMIT = 60;
const WHOLE_MAP_LINK_LIMIT = 200;

// the explorer's synthetic node ids (standards-neighbourhood) that stand for a set of standards rather than a node
const FAMILY_ID_PREFIX = 'family:';
const RELEASE_ID_PREFIX = 'release:';

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess }) => {
		// ================================================================================
		// NAMED CYPHER QUERIES — getCypher(queryName, params) → { cypher, params }

		const queryBuilderByQueryName = {
			// what a stableId is: a standard's root, a class, or a property (with the class that owns it)
			focusNode: ({ focusStableId }) => ({
				cypher: `
					MATCH (focus:ForgedNode {stableId: $focusStableId})
					OPTIONAL MATCH (ownerClass:ForgedNode {role: 'DmeClass'})-[:${OWNS_PROPERTY_EDGE_TEXT}]->(focus)
					RETURN focus.stableId AS stableId, focus.role AS role, focus._source AS source, focus.name AS name,
					       focus:DmeStandardRoot AS isStandardRoot, head(collect(ownerClass.stableId)) AS ownerClassStableId
					LIMIT 1
				`,
				params: { focusStableId },
			}),

			// the standards of a family, or of one release of it
			standardListOfFamily: ({ standardFamily, releaseLabel }) => ({
				cypher: `
					MATCH (root:DmeStandardRoot {standardFamily: $standardFamily})
					WHERE $releaseLabel IS NULL OR root.releaseLabel = $releaseLabel
					RETURN root.stableId AS stableId, root._source AS source, root.name AS name, root.version AS version, root.releaseLabel AS releaseLabel
					ORDER BY root.name, root.version
				`,
				params: { standardFamily, releaseLabel: releaseLabel || null },
			}),

			// one standard and how many classes it has
			standardOfSource: ({ source }) => ({
				cypher: `
					MATCH (root:DmeStandardRoot {_source: $source})
					RETURN root.stableId AS stableId, root._source AS source, root.name AS name, root.version AS version,
					       COUNT { (root)-[:HAS_CLASS]->(:ForgedNode) } AS classCount
				`,
				params: { source },
			}),

			// every class of a standard, with its property count and how many of them map to a hub
			standardClassList: ({ source }) => ({
				cypher: `
					MATCH (:DmeStandardRoot {_source: $source})-[:HAS_CLASS]->(oneClass:ForgedNode)
					OPTIONAL MATCH (oneClass)-[:${OWNS_PROPERTY_EDGE_TEXT}]->(property:ForgedNode)
					WITH oneClass, collect(DISTINCT property) AS propertyList
					RETURN oneClass.stableId AS stableId, oneClass.name AS name, oneClass._source AS source, size(propertyList) AS propertyCount,
					       size([oneProperty IN propertyList WHERE ${isMappedTextFor('oneProperty')}]) AS mappedPropertyCount
					ORDER BY name
				`,
				params: { source },
			}),

			// how many class-to-class pairs a standard holds (to decide whether its whole map can be drawn)
			standardLinkCount: ({ source }) => ({
				cypher: `
					MATCH (:DmeStandardRoot {_source: $source})-[:HAS_CLASS]->(fromClass:ForgedNode)-[:${OWNS_PROPERTY_EDGE_TEXT}]->(:ForgedNode)-[:${REFERS_TO_CLASS_EDGE_TEXT}]->(toClass:ForgedNode {role: 'DmeClass', _source: $source})
					RETURN count(DISTINCT [fromClass.stableId, toClass.stableId]) AS linkCount
				`,
				params: { source },
			}),

			// every property of a standard's classes: its type, whether it is required, the class of THIS standard it refers to, and whether it maps
			// to a hub; the whole-standard map chooses its main classes from these and draws each as a table
			standardPropertyList: ({ source }) => ({
				cypher: `
					MATCH (:DmeStandardRoot {_source: $source})-[:HAS_CLASS]->(oneClass:ForgedNode)-[:${OWNS_PROPERTY_EDGE_TEXT}]->(property:ForgedNode)
					OPTIONAL MATCH (property)-[:${REFERS_TO_CLASS_EDGE_TEXT}]->(referencedClass:ForgedNode {role: 'DmeClass', _source: $source})
					WITH oneClass, property, head(collect(referencedClass)) AS referencedClass
					RETURN oneClass.stableId AS classStableId, property.name AS name, property.dataType AS dataType, coalesce(property.isRequired, false) AS isRequired,
					       referencedClass.stableId AS referencedClassStableId, referencedClass.name AS referencedClassName, ${isMappedTextFor('property')} AS isMapped
				`,
				params: { source },
			}),

			// one class: its name and standard
			classOfStableId: ({ classStableId }) => ({
				cypher: `
					MATCH (oneClass:ForgedNode {stableId: $classStableId}) WHERE oneClass.role = 'DmeClass'
					RETURN oneClass.stableId AS stableId, oneClass.name AS name, oneClass._source AS source
				`,
				params: { classStableId },
			}),

			// one class's properties: type, required, the class it refers to, mapped to a hub
			classPropertyList: ({ classStableId }) => ({
				cypher: `
					MATCH (:ForgedNode {stableId: $classStableId})-[:${OWNS_PROPERTY_EDGE_TEXT}]->(property:ForgedNode)
					OPTIONAL MATCH (property)-[:${REFERS_TO_CLASS_EDGE_TEXT}]->(referencedClass:ForgedNode {role: 'DmeClass'})
					WITH property, head(collect(referencedClass.name)) AS referencedClassName
					RETURN property.name AS name, property.dataType AS dataType, coalesce(property.isRequired, false) AS isRequired, referencedClassName,
					       ${isMappedTextFor('property')} AS isMapped
				`,
				params: { classStableId },
			}),

			// one class's neighbours: the classes it refers to and that refer to it (with the properties that do), its parent and its subclasses
			classNeighbourList: ({ classStableId }) => ({
				cypher: `
					MATCH (:ForgedNode {stableId: $classStableId})-[:${OWNS_PROPERTY_EDGE_TEXT}]->(property:ForgedNode)-[:${REFERS_TO_CLASS_EDGE_TEXT}]->(other:ForgedNode {role: 'DmeClass'})
					WHERE other.stableId <> $classStableId
					RETURN other.stableId AS stableId, other.name AS name, other._source AS source, 'refersTo' AS direction, collect(DISTINCT property.name) AS propertyNameList
					UNION ALL
					MATCH (other:ForgedNode {role: 'DmeClass'})-[:${OWNS_PROPERTY_EDGE_TEXT}]->(property:ForgedNode)-[:${REFERS_TO_CLASS_EDGE_TEXT}]->(:ForgedNode {stableId: $classStableId})
					WHERE other.stableId <> $classStableId
					RETURN other.stableId AS stableId, other.name AS name, other._source AS source, 'referredBy' AS direction, collect(DISTINCT property.name) AS propertyNameList
					UNION ALL
					MATCH (:ForgedNode {stableId: $classStableId})-[:SUBCLASS_OF]->(other:ForgedNode)
					RETURN other.stableId AS stableId, other.name AS name, other._source AS source, 'subclassOf' AS direction, [] AS propertyNameList
					UNION ALL
					MATCH (other:ForgedNode)-[:SUBCLASS_OF]->(:ForgedNode {stableId: $classStableId})
					RETURN other.stableId AS stableId, other.name AS name, other._source AS source, 'superclassOf' AS direction, [] AS propertyNameList
				`,
				params: { classStableId },
			}),
		};

		const getCypher = (queryName, queryParams) => {
			const queryBuilder = queryBuilderByQueryName[queryName];
			if (!queryBuilder) {
				throw new Error(`${moduleName}: no query named '${queryName}'; valid: ${Object.keys(queryBuilderByQueryName).join(', ')}`);
			}
			return queryBuilder(queryParams || {});
		};

		// ================================================================================
		// SHAPING

		// 'family:CASE' → { standardFamily: 'CASE' }; 'release:PESC-CollegeTranscript/1.8.0' → { standardFamily, releaseLabel }; else null
		const familyOfSyntheticId = (focusStableId) => {
			if (focusStableId.indexOf(FAMILY_ID_PREFIX) === 0) return { standardFamily: focusStableId.slice(FAMILY_ID_PREFIX.length), releaseLabel: null };
			if (focusStableId.indexOf(RELEASE_ID_PREFIX) === 0) {
				const familyAndRelease = focusStableId.slice(RELEASE_ID_PREFIX.length);
				const dividerIndex = familyAndRelease.indexOf('/');
				return dividerIndex === -1 ? null : { standardFamily: familyAndRelease.slice(0, dividerIndex), releaseLabel: familyAndRelease.slice(dividerIndex + 1) };
			}
			return null;
		};

		// a neighbour in another standard is drawn as such
		const mapNeighbourRecordList = (neighbourRecordList, focusSource) => neighbourRecordList.map((oneNeighbour) => ({ ...oneNeighbour, isOtherStandard: oneNeighbour.source !== focusSource }));

		// a count read from Neo4j may arrive as an Integer object; the picture wants numbers
		const numberOf = (countValue) => (countValue && typeof countValue.toNumber === 'function' ? countValue.toNumber() : Number(countValue || 0));
		const mapClassRecordList = (classRecordList) => classRecordList.map((oneClass) => ({ ...oneClass, propertyCount: numberOf(oneClass.propertyCount), mappedPropertyCount: numberOf(oneClass.mappedPropertyCount) }));

		return {
			getCypher,
			requiredLabelList,
			familyOfSyntheticId,
			mapNeighbourRecordList,
			mapClassRecordList,
			numberOf,
			WHOLE_MAP_CLASS_LIMIT,
			WHOLE_MAP_LINK_LIMIT,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
