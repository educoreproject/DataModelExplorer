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

// THE USE-CASE STANDARD (BD 2026-11-20: "why can't I see the use case data model on the website?"). Its root's standardKind is
// USE_CASE_STANDARD_KIND, and it has no DmeClass or DmeProperty: its nodes are cases, stories, actors, conditions and the citations
// of other standards (schema-provider's description of it). Its map is drawn from the KINDS of node it holds (each node's role) and
// the relationships between them, measured from the graph; the forge's own bookkeeping keys are no part of the model.
const USE_CASE_STANDARD_KIND = 'useCaseCorpus';
const USE_CASE_KIND_ID_PREFIX = 'useCaseKind:';
const forgeBookkeepingKeyList = Object.freeze(['_id', '_source', 'path', 'parentId', 'depth', 'role', 'crossRefs', 'searchText', 'embedding', 'embeddingModelVersion', 'usecaseStableId', 'formatVersionSource', 'sourceFileName']);
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
					RETURN root.stableId AS stableId, root._source AS source, root.name AS name, root.version AS version, root.standardKind AS standardKind,
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

			// the use-case standard: each kind of node (its role) and how many nodes are of it
			useCaseKindList: ({ source }) => ({
				cypher: `
					MATCH (node:ForgedNode {_source: $source}) WHERE NOT node:DmeStandardRoot AND node.role IS NOT NULL
					RETURN node.role AS role, count(*) AS nodeCount
					ORDER BY role
				`,
				params: { source },
			}),

			// ... each kind's own properties (bookkeeping aside): on how many of its nodes, and one value to read the type from
			useCaseKeyList: ({ source }) => ({
				cypher: `
					MATCH (node:ForgedNode {_source: $source}) WHERE NOT node:DmeStandardRoot AND node.role IS NOT NULL
					UNWIND [oneKey IN keys(node) WHERE NOT oneKey IN $bookkeepingKeyList] AS propertyName
					RETURN node.role AS role, propertyName, count(*) AS nodeWithCount, head(collect(node[propertyName])) AS sampleValue
					ORDER BY role, propertyName
				`,
				params: { source, bookkeepingKeyList: [...forgeBookkeepingKeyList] },
			}),

			// ... and the relationships leaving each kind: to which kind of this standard (null: a node of another standard), on how
			// many of its nodes, the most one node has, and how many there are
			useCaseRelationshipList: ({ source }) => ({
				cypher: `
					MATCH (fromNode:ForgedNode {_source: $source})-[relationship]->(toNode)
					WHERE NOT fromNode:DmeStandardRoot AND fromNode.role IS NOT NULL
					WITH fromNode, type(relationship) AS relationshipName, CASE WHEN toNode._source = $source THEN toNode.role ELSE null END AS toRole, count(*) AS perNodeCount
					RETURN fromNode.role AS fromRole, relationshipName, toRole, count(fromNode) AS fromNodeCount, max(perNodeCount) AS mostPerNode, sum(perNodeCount) AS relationshipCount
					ORDER BY fromRole, relationshipCount DESC, relationshipName
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

		// ---- the use-case model, from the three useCase* queries: a "class" per kind of node, a row per relationship and per property
		const kindNameOf = (role) => String(role || '').replace(/^Dme/, '');
		const kindStableIdOf = (role) => `${USE_CASE_KIND_ID_PREFIX}${role}`;
		const dataTypeOfValue = (sampleValue) => {
			if (Array.isArray(sampleValue)) return 'array';
			if (sampleValue && typeof sampleValue.toNumber === 'function') return 'integer';
			if (typeof sampleValue === 'number') return Number.isInteger(sampleValue) ? 'integer' : 'number';
			if (typeof sampleValue === 'boolean') return 'boolean';
			return 'string';
		};
		const isStandardKindUseCase = (standard) => Boolean(standard) && standard.standardKind === USE_CASE_STANDARD_KIND;

		const mapUseCaseModel = ({ kindRecordList, keyRecordList, relationshipRecordList }) => {
			const nodeCountByRole = Object.fromEntries(kindRecordList.map((oneKind) => [oneKind.role, numberOf(oneKind.nodeCount)]));
			const classList = kindRecordList.map((oneKind) => ({ stableId: kindStableIdOf(oneKind.role), name: kindNameOf(oneKind.role), source: null }));
			// the kinds with the most relationships first, so the main ones lead the picture
			const relationshipRowList = [...relationshipRecordList]
				.filter((oneRelationship) => nodeCountByRole[oneRelationship.fromRole] !== undefined)
				.sort((left, right) => numberOf(right.relationshipCount) - numberOf(left.relationshipCount))
				.map((oneRelationship) => {
					const isOwnKind = oneRelationship.toRole && nodeCountByRole[oneRelationship.toRole] !== undefined;
					return {
						classStableId: kindStableIdOf(oneRelationship.fromRole),
						name: oneRelationship.relationshipName,
						dataType: numberOf(oneRelationship.mostPerNode) > 1 ? 'array' : null,
						isRequired: numberOf(oneRelationship.fromNodeCount) === nodeCountByRole[oneRelationship.fromRole],
						referencedClassStableId: isOwnKind ? kindStableIdOf(oneRelationship.toRole) : null,
						referencedClassName: isOwnKind ? kindNameOf(oneRelationship.toRole) : 'another standard',
						isMapped: false,
					};
				});
			const keyRowList = keyRecordList
				.filter((oneKey) => nodeCountByRole[oneKey.role] !== undefined)
				.map((oneKey) => ({
					classStableId: kindStableIdOf(oneKey.role),
					name: oneKey.propertyName,
					dataType: dataTypeOfValue(oneKey.sampleValue),
					isRequired: numberOf(oneKey.nodeWithCount) === nodeCountByRole[oneKey.role],
					isIdentifier: oneKey.propertyName === 'stableId',
					referencedClassStableId: null,
					referencedClassName: null,
					isMapped: false,
				}));
			const nodeCount = Object.values(nodeCountByRole).reduce((total, oneCount) => total + oneCount, 0);
			return { classList, propertyList: [...relationshipRowList, ...keyRowList], nodeCount };
		};

		return {
			getCypher,
			isStandardKindUseCase,
			mapUseCaseModel,
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
