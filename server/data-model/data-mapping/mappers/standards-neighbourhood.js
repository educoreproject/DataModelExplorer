#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MapperPattern]]
// @concept: [[Neo4jAbstraction]]

// standards-neighbourhood — the named Cypher and the pure transformations behind the PESC Explorer page (DEV-123).
// One question drives every screen: "show me this node's neighbourhood" — the node, its children grouped by
// relationship type, its own mapping judgments, and (for a CEDS anchor) everything every standard maps to it.
//
// Graph facts this mapper leans on (probed 2026-10-13 on GOLD_EVAL_261013_qualifiers; see DEVLOG-pescExplorer.md):
//   - every ForgedNode carries a unique stableId (index forgedNodeStableIdUnique); it is the node's identity on the wire;
//   - an element's _source equals exactly one DmeStandardRoot._source (NOT its standardKey: PESC roots read
//     _source 'PESC-CollegeTranscript-1.8.0' against standardKey 'pesccollegetranscript1v8v0');
//   - PESC and SIF map from DmeInstance, Ed-Fi from DmeProperty, so every mapping read walks HAS_INSTANCE*0..1;
//   - releaseIndependentId embeds the namespace version (':v1.19.0') and, for properties, the element's POSITION
//     ('/el/4:'), so the cross-version identity strips both (see versionIdentityOf).
//
// Two synthetic node ids exist only on the wire, never in the graph: 'family:<standardFamily>' (the catalog as a
// node) and 'standardGroup:<standardKey>@<anchorStableId>' (one standard's elements mapped to one CEDS anchor).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

// the labels this mapper's Cypher reads; the access point refuses by name when the golden lacks one
const requiredLabelList = Object.freeze(['ForgedNode', 'DmeStandardRoot', 'DmeClass', 'DmeProperty', 'HubReference']);

// a JS number reaches Neo4j as a FLOAT and a slice bound refuses a float, so the cap is an integer in the Cypher text
const GROUP_ITEM_CAP = 500;
const MATCH_EDGE_TYPE_TEXT = 'EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH';

// the outgoing relationships that make a node's children; everything else (embed texts, edit history, layers,
// concept guides) is the graph's plumbing, not the standard's structure. Order is display order.
const childRelationshipTypeList = Object.freeze([
	'HAS_CLASS',
	'HAS_PROPERTY',
	'HAS_FIELD',
	'HAS_INSTANCE',
	'HAS_CHILD',
	'HAS_OPTION_SET',
	'HAS_VALUE',
	'SUBCLASS_OF',
	'REFERENCES_TYPE',
	'REFERENCES',
	'REFERENCES_OBJECT',
	'HAS_DEFINITION',
	'HAS_SUPPORT',
]);

// the climb from a standard's root down to one of its elements, for the breadcrumb
const ancestorRelationshipTypeText = 'HAS_CLASS|HAS_PROPERTY|HAS_FIELD|HAS_INSTANCE|HAS_CHILD|HAS_OPTION_SET|HAS_VALUE|HAS_SUPPORT';

// label → page kind; the FIRST label in this list that a node carries decides (CedsProperty is also a DmeProperty)
const kindByLabelList = Object.freeze([
	{ labelName: 'HubReference', nodeKind: 'cedsAnchor' },
	{ labelName: 'CedsProperty', nodeKind: 'cedsProperty' },
	{ labelName: 'CedsClass', nodeKind: 'cedsDomain' },
	{ labelName: 'DmeStandardRoot', nodeKind: 'standard' },
	{ labelName: 'DmeClass', nodeKind: 'class' },
	{ labelName: 'DmeProperty', nodeKind: 'property' },
	{ labelName: 'DmeInstance', nodeKind: 'instance' },
	{ labelName: 'DmeOptionSet', nodeKind: 'optionSet' },
	{ labelName: 'DmeOptionValue', nodeKind: 'optionValue' },
	{ labelName: 'DmeSupport', nodeKind: 'support' },
	{ labelName: 'DmeVocabularyTerm', nodeKind: 'support' },
	{ labelName: 'HubDefinition', nodeKind: 'support' },
]);

// match edge type → the page's match kind; strengthRank orders exact > close > narrow > broad (spec §5)
const matchKindByEdgeType = Object.freeze({
	EXACT_MATCH: { matchKind: 'exact', strengthRank: 1 },
	CLOSE_MATCH: { matchKind: 'close', strengthRank: 2 },
	NARROW_MATCH: { matchKind: 'narrow', strengthRank: 3 },
	BROAD_MATCH: { matchKind: 'broad', strengthRank: 4 },
});

// the synthetic node ids; a registry, so the access point dispatches on data, not on string tests scattered about
const syntheticIdPrefixList = Object.freeze([
	{ idPrefix: 'family:', nodeKind: 'family' },
	{ idPrefix: 'standardGroup:', nodeKind: 'standardGroup' },
]);

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess }) => {
		// ================================================================================
		// NAMED CYPHER QUERIES — getCypher(queryName, params) → { cypher, params }

		const mappingSubjectText = `(subject)-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]->(anchor:HubReference)`;

		const queryBuilderByQueryName = {
			familyNameList: () => ({
				cypher: `MATCH (root:DmeStandardRoot) WHERE root.standardFamily IS NOT NULL RETURN DISTINCT root.standardFamily AS standardFamily ORDER BY standardFamily`,
				params: {},
			}),

			catalogByFamily: ({ standardFamily }) => ({
				cypher: `
					MATCH (root:DmeStandardRoot {standardFamily: $standardFamily})
					RETURN root.stableId AS stableId, root.name AS name, root.standardKey AS standardKey,
					       root.standardFamily AS standardFamily, root.releaseLabel AS releaseLabel, root.version AS version,
					       coalesce(root.description, '') AS description,
					       COUNT { (root)-[:HAS_CLASS]->() } AS classCount
					ORDER BY releaseLabel, version
				`,
				params: { standardFamily },
			}),

			nodeByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (focus:ForgedNode {stableId: $stableId})
					OPTIONAL MATCH (root:DmeStandardRoot {_source: focus._source})
					RETURN focus.stableId AS stableId, focus.name AS name, labels(focus) AS labelList,
					       coalesce(focus.definition, focus.description, focus.documentation, focus.propertyDefinition, '') AS description,
					       focus.path AS path, focus.contextText AS contextText,
					       focus.releaseIndependentId AS releaseIndependentId, focus.definitionDigest AS definitionDigest,
					       root.stableId AS rootStableId, root.name AS rootName, root.standardKey AS standardKey,
					       root.standardFamily AS standardFamily, root.releaseLabel AS releaseLabel, root.version AS version
				`,
				params: { stableId },
			}),

			nodeSummaryByStableIdList: ({ stableIdList }) => ({
				cypher: `
					MATCH (focus:ForgedNode) WHERE focus.stableId IN $stableIdList
					OPTIONAL MATCH (root:DmeStandardRoot {_source: focus._source})
					RETURN focus.stableId AS stableId, focus.name AS name, labels(focus) AS labelList,
					       root.standardKey AS standardKey, root.standardFamily AS standardFamily,
					       root.releaseLabel AS releaseLabel, root.version AS version
				`,
				params: { stableIdList },
			}),

			// children by relationship type: the true count, the first GROUP_ITEM_CAP by name, and each item's summary
			childGroupsByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (focus:ForgedNode {stableId: $stableId})-[childEdge]->(child:ForgedNode)
					WHERE type(childEdge) IN $childRelationshipTypeList
					WITH type(childEdge) AS relationshipType, child
					ORDER BY coalesce(child.name, child.stableId)
					WITH relationshipType, count(child) AS itemCount, collect(child)[0..${GROUP_ITEM_CAP}] AS cappedChildList
					UNWIND cappedChildList AS child
					WITH relationshipType, itemCount, child,
					     [(child)-[:HAS_INSTANCE*0..1]->${mappingSubjectText} |
					       { matchEdgeType: type(matchEdge), mappingConfidence: matchEdge.mappingConfidence, mappingSource: matchEdge.mappingSource,
					         anchorStableId: anchor.stableId, anchorName: anchor.name, subjectStableId: subject.stableId }] AS childMappingList
					RETURN relationshipType, itemCount, collect({
					         stableId: child.stableId, name: child.name, labelList: labels(child),
					         description: coalesce(child.definition, child.description, ''),
					         path: child.path,
					         hasStructuralChildren: EXISTS { MATCH (child)-[grandchildEdge]->(:ForgedNode) WHERE type(grandchildEdge) IN $childRelationshipTypeList },
					         propertyCount: COUNT { (child)-[:HAS_PROPERTY|HAS_FIELD]->() },
					         mappedPropertyCount: COUNT { MATCH (child)-[:HAS_PROPERTY|HAS_FIELD]->(member) WHERE EXISTS { (member)-[:HAS_INSTANCE*0..1]->()-[:${MATCH_EDGE_TYPE_TEXT}]->(:HubReference) } },
					         occurrenceCount: COUNT { (child)-[:HAS_INSTANCE]->() },
					         releaseIndependentId: child.releaseIndependentId,
					         definitionDigest: child.definitionDigest,
					         mappingList: childMappingList }) AS itemList
				`,
				params: { stableId, childRelationshipTypeList: [...childRelationshipTypeList] },
			}),

			// the node's own judgments, and its occurrences' (PESC and SIF judge occurrences, Ed-Fi the property)
			mappingsByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (focus:ForgedNode {stableId: $stableId})
					OPTIONAL MATCH (focus)-[:HAS_INSTANCE*0..1]->${mappingSubjectText}
					WITH focus, collect(CASE WHEN matchEdge IS NULL THEN null ELSE
					       { matchEdgeType: type(matchEdge), mappingConfidence: matchEdge.mappingConfidence, mappingSource: matchEdge.mappingSource,
					         anchorStableId: anchor.stableId, anchorName: anchor.name, subjectStableId: subject.stableId } END) AS mappingRowList
					RETURN mappingRowList, [(focus)-[:HAS_INSTANCE]->(occurrence) | occurrence.stableId] AS occurrenceStableIdList
				`,
				params: { stableId },
			}),

			anchorContextByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (anchor:HubReference {stableId: $stableId})
					RETURN anchor.referenceTier AS referenceTier, anchor.domainName AS domainName, anchor.propertyName AS propertyName,
					       anchor.valueName AS valueName, anchor.rangeOptionSetName AS rangeOptionSetName,
					       [(anchor)-[:HAS_CEDS_PROPERTY]->(cedsProperty) | { stableId: cedsProperty.stableId, name: cedsProperty.name, definition: coalesce(cedsProperty.definition, cedsProperty.description, ''),
					         hasStructuralChildren: EXISTS { MATCH (cedsProperty)-[grandchildEdge]->(:ForgedNode) WHERE type(grandchildEdge) IN $childRelationshipTypeList } }] AS cedsPropertyList,
					       [(anchor)-[:HAS_CEDS_DOMAIN]->(cedsDomain) | { stableId: cedsDomain.stableId, name: cedsDomain.name, definition: coalesce(cedsDomain.definition, cedsDomain.description, ''),
					         hasStructuralChildren: EXISTS { MATCH (cedsDomain)-[grandchildEdge]->(:ForgedNode) WHERE type(grandchildEdge) IN $childRelationshipTypeList } }] AS cedsDomainList
				`,
				params: { stableId, childRelationshipTypeList: [...childRelationshipTypeList] },
			}),

			// every element mapped to one anchor, gathered per owning standard and match edge type
			anchorFanOutByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (anchor:HubReference {stableId: $stableId})<-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]-(element:ForgedNode)
					MATCH (root:DmeStandardRoot {_source: element._source})
					WITH root, type(matchEdge) AS matchEdgeType, collect(DISTINCT element.stableId) AS elementStableIdList,
					     max(matchEdge.mappingConfidence) AS maximumConfidence
					RETURN root.stableId AS rootStableId, root.name AS rootName, root.standardKey AS standardKey,
					       root.standardFamily AS standardFamily, root.releaseLabel AS releaseLabel, root.version AS version,
					       matchEdgeType, elementStableIdList, maximumConfidence
				`,
				params: { stableId },
			}),

			standardGroupMembers: ({ anchorStableId, standardKey }) => ({
				cypher: `
					MATCH (root:DmeStandardRoot {standardKey: $standardKey})
					MATCH (anchor:HubReference {stableId: $anchorStableId})<-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]-(element:ForgedNode {_source: root._source})
					WITH element, matchEdge, head([(owner)-[:HAS_INSTANCE]->(element) | owner.name]) AS ownerName
					ORDER BY matchEdge.mappingConfidence DESC, element.name
					WITH count(element) AS itemCount, collect({ element: element, matchEdge: matchEdge, ownerName: ownerName })[0..${GROUP_ITEM_CAP}] AS cappedMemberList
					UNWIND cappedMemberList AS member
					WITH itemCount, member.element AS element, member.matchEdge AS matchEdge, member.ownerName AS ownerName
					RETURN itemCount, collect({
					         stableId: element.stableId, name: element.name, labelList: labels(element),
					         description: coalesce(element.definition, element.description, ''),
					         path: coalesce(element.contextPath, element.path),
					         ownerName: ownerName,
					         hasStructuralChildren: EXISTS { MATCH (element)-[grandchildEdge]->(:ForgedNode) WHERE type(grandchildEdge) IN $childRelationshipTypeList },
					         mappingList: [{ matchEdgeType: type(matchEdge), mappingConfidence: matchEdge.mappingConfidence, mappingSource: matchEdge.mappingSource,
					                         anchorStableId: $anchorStableId, anchorName: null, subjectStableId: element.stableId }] }) AS itemList
				`,
				params: { anchorStableId, standardKey, childRelationshipTypeList: [...childRelationshipTypeList] },
			}),

			// every shortest climb from the owning root; the transformation prefers the one through a class
			ancestorChainsByStableId: ({ stableId }) => ({
				cypher: `
					MATCH (focus:ForgedNode {stableId: $stableId})
					MATCH (root:DmeStandardRoot {_source: focus._source}) WHERE root <> focus
					MATCH chain = allShortestPaths((root)-[:${ancestorRelationshipTypeText}*1..8]->(focus))
					RETURN [chainNode IN nodes(chain) | { stableId: chainNode.stableId, name: chainNode.name, labelList: labels(chainNode) }] AS chainNodeList
					LIMIT 25
				`,
				params: { stableId },
			}),

			versionPeerRoots: ({ standardKey }) => ({
				cypher: `
					MATCH (root:DmeStandardRoot {standardKey: $standardKey})
					MATCH (peer:DmeStandardRoot {standardFamily: root.standardFamily, releaseLabel: root.releaseLabel})
					RETURN peer.standardKey AS standardKey, peer.version AS version, peer.stableId AS stableId
				`,
				params: { standardKey },
			}),

			classDigestsByStandardKey: ({ standardKey }) => ({
				cypher: `
					MATCH (:DmeStandardRoot {standardKey: $standardKey})-[:HAS_CLASS]->(classNode:DmeClass)
					RETURN classNode.stableId AS stableId, classNode.releaseIndependentId AS releaseIndependentId, classNode.definitionDigest AS definitionDigest
				`,
				params: { standardKey },
			}),

			propertyDigestsByClassStableId: ({ classStableId }) => ({
				cypher: `
					MATCH (:DmeClass {stableId: $classStableId})-[:HAS_PROPERTY]->(propertyNode:DmeProperty)
					RETURN propertyNode.stableId AS stableId, propertyNode.releaseIndependentId AS releaseIndependentId, propertyNode.definitionDigest AS definitionDigest
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
		// IDENTITY AND KIND

		const nodeKindOf = (labelList) => {
			const kindEntry = kindByLabelList.find((oneEntry) => (labelList || []).indexOf(oneEntry.labelName) !== -1);
			return kindEntry ? kindEntry.nodeKind : 'unclassified';
		};

		// answers { nodeKind, remainderText } for a synthetic id, or null for a graph stableId
		const parseSyntheticId = (stableId) => {
			const prefixEntry = syntheticIdPrefixList.find((oneEntry) => stableId.indexOf(oneEntry.idPrefix) === 0);
			return prefixEntry ? { nodeKind: prefixEntry.nodeKind, remainderText: stableId.slice(prefixEntry.idPrefix.length) } : null;
		};

		const familyIdOf = (standardFamily) => `family:${standardFamily}`;

		// standardGroup:<standardKey>@<anchorStableId> — standardKeys are [a-z0-9]+, so the first '@' divides
		const standardGroupIdOf = ({ standardKey, anchorStableId }) => `standardGroup:${standardKey}@${anchorStableId}`;
		const parseStandardGroupRemainder = (remainderText) => {
			const dividerIndex = remainderText.indexOf('@');
			if (dividerIndex < 1 || dividerIndex === remainderText.length - 1) {
				return null;
			}
			return { standardKey: remainderText.slice(0, dividerIndex), anchorStableId: remainderText.slice(dividerIndex + 1) };
		};

		// ================================================================================
		// MAPPINGS — one judgment row → the wire's mapping; strongest first

		const mappingOf = (mappingRow) => {
			const matchKindEntry = matchKindByEdgeType[mappingRow.matchEdgeType];
			return {
				matchKind: matchKindEntry.matchKind,
				mappingConfidence: mappingRow.mappingConfidence,
				mappingSource: mappingRow.mappingSource,
				anchor: { stableId: mappingRow.anchorStableId, name: mappingRow.anchorName },
				subjectStableId: mappingRow.subjectStableId,
			};
		};

		const strengthRankOf = (matchKind) => Object.values(matchKindByEdgeType).find((oneEntry) => oneEntry.matchKind === matchKind).strengthRank;

		const byStrength = (left, right) => strengthRankOf(left.matchKind) - strengthRankOf(right.matchKind) || (right.mappingConfidence || 0) - (left.mappingConfidence || 0);

		// one row per (matchKind, anchor), counting the occurrences that carry it and keeping the highest confidence
		const collapseMappingList = (mappingRowList) => {
			const mappingBySignature = {};
			(mappingRowList || []).filter(Boolean).forEach((oneRow) => {
				const oneMapping = mappingOf(oneRow);
				const signatureText = `${oneMapping.matchKind}\u0000${oneMapping.anchor.stableId}`;
				const existingMapping = mappingBySignature[signatureText];
				if (existingMapping) {
					existingMapping.occurrenceCount += 1;
					existingMapping.mappingConfidence = Math.max(existingMapping.mappingConfidence, oneMapping.mappingConfidence);
					return;
				}
				mappingBySignature[signatureText] = { matchKind: oneMapping.matchKind, mappingConfidence: oneMapping.mappingConfidence, mappingSource: oneMapping.mappingSource, anchor: oneMapping.anchor, occurrenceCount: 1 };
			});
			return Object.values(mappingBySignature).sort(byStrength);
		};

		// instances fold away when there is at most one, or when every one carries the same judgments (spec §6.5)
		const instanceFoldingOf = ({ mappingRowList, occurrenceStableIdList }) => {
			const occurrenceCount = (occurrenceStableIdList || []).length;
			if (occurrenceCount <= 1) {
				return { folded: true, occurrenceCount, foldingReason: occurrenceCount === 0 ? 'noOccurrences' : 'singleOccurrence' };
			}
			const signatureTextByOccurrence = {};
			occurrenceStableIdList.forEach((occurrenceStableId) => {
				signatureTextByOccurrence[occurrenceStableId] = [];
			});
			(mappingRowList || []).filter(Boolean).forEach((oneRow) => {
				if (signatureTextByOccurrence[oneRow.subjectStableId]) {
					signatureTextByOccurrence[oneRow.subjectStableId].push(`${oneRow.matchEdgeType}|${oneRow.anchorStableId}|${oneRow.mappingConfidence}`);
				}
			});
			const distinctSignatureCount = new Set(Object.values(signatureTextByOccurrence).map((signatureList) => signatureList.sort().join(','))).size;
			return distinctSignatureCount === 1
				? { folded: true, occurrenceCount, foldingReason: 'occurrencesMapIdentically' }
				: { folded: false, occurrenceCount, foldingReason: 'occurrencesMapDifferently' };
		};

		// ================================================================================
		// VERSION IDENTITY — releaseIndependentId without its namespace versions and without the element position.
		// The position strip is ours, not the spec's: on College Transcript 1.8.0 against 1.7.0 the spec's key alone
		// reads 39 properties as 'only in 1.7' that 1.8.0 still has, moved; with the position stripped there are
		// still 0 collisions (DEVLOG, Phase 1 probe).

		const versionIdentityOf = (releaseIndependentId) =>
			typeof releaseIndependentId === 'string' && releaseIndependentId !== '' ? releaseIndependentId.replace(/:v\d+\.\d+\.\d+/g, '').replace(/\/el\/\d+:/, '/el/') : null;

		const versionPartList = (versionText) => String(versionText || '').split('.').map((onePart) => parseInt(onePart, 10) || 0);
		const compareVersionText = (leftText, rightText) => {
			const leftPartList = versionPartList(leftText);
			const rightPartList = versionPartList(rightText);
			for (let partIndex = 0; partIndex < Math.max(leftPartList.length, rightPartList.length); partIndex++) {
				const partDifference = (leftPartList[partIndex] || 0) - (rightPartList[partIndex] || 0);
				if (partDifference !== 0) {
					return partDifference;
				}
			}
			return 0;
		};

		// the version to compare against: the nearest lower; for the lowest, the nearest higher; none when alone
		const comparisonPeerOf = ({ version, peerList }) => {
			const otherPeerList = (peerList || []).filter((onePeer) => compareVersionText(onePeer.version, version) !== 0);
			const lowerPeerList = otherPeerList.filter((onePeer) => compareVersionText(onePeer.version, version) < 0).sort((left, right) => compareVersionText(right.version, left.version));
			if (lowerPeerList.length) {
				return lowerPeerList[0];
			}
			const higherPeerList = otherPeerList.sort((left, right) => compareVersionText(left.version, right.version));
			return higherPeerList.length ? higherPeerList[0] : null;
		};

		// badge for each digest row against the comparison version's rows; refuses a key collision by name
		const versionBadgeByStableId = ({ digestRowList, comparisonDigestRowList, thisVersion, comparedVersion }) => {
			const comparisonDigestByIdentity = {};
			const collisionList = [];
			(comparisonDigestRowList || []).forEach((oneRow) => {
				const identityText = versionIdentityOf(oneRow.releaseIndependentId);
				if (identityText === null) {
					return;
				}
				if (comparisonDigestByIdentity[identityText] !== undefined) {
					collisionList.push(identityText);
				}
				comparisonDigestByIdentity[identityText] = oneRow.definitionDigest;
			});
			const badgeByStableId = {};
			(digestRowList || []).forEach((oneRow) => {
				const identityText = versionIdentityOf(oneRow.releaseIndependentId);
				if (identityText === null) {
					return;
				}
				const comparisonDigest = comparisonDigestByIdentity[identityText];
				const badgeState = comparisonDigest === undefined ? 'new' : comparisonDigest === oneRow.definitionDigest ? 'unchanged' : 'changed';
				badgeByStableId[oneRow.stableId] = { badgeState, thisVersion, comparedVersion };
			});
			return { badgeByStableId, collisionList };
		};

		const versionIdentityMatchOf = ({ releaseIndependentId, comparisonDigestRowList }) => {
			const identityText = versionIdentityOf(releaseIndependentId);
			return identityText === null ? null : (comparisonDigestRowList || []).find((oneRow) => versionIdentityOf(oneRow.releaseIndependentId) === identityText) || null;
		};

		// ================================================================================
		// RESULT TRANSFORMATION

		const mapNodeRecord = (nodeRecord) => ({
			stableId: nodeRecord.stableId,
			name: nodeRecord.name,
			kind: nodeKindOf(nodeRecord.labelList),
			description: nodeRecord.description,
			path: nodeRecord.contextText || nodeRecord.path || null,
			standardKey: nodeRecord.standardKey,
			standardFamily: nodeRecord.standardFamily,
			releaseLabel: nodeRecord.releaseLabel,
			version: nodeRecord.version,
			rootStableId: nodeRecord.rootStableId,
			rootName: nodeRecord.rootName,
		});

		const mapNodeSummaryRecord = (summaryRecord) => ({
			stableId: summaryRecord.stableId,
			name: summaryRecord.name,
			kind: nodeKindOf(summaryRecord.labelList),
			standardKey: summaryRecord.standardKey,
			standardFamily: summaryRecord.standardFamily,
			releaseLabel: summaryRecord.releaseLabel,
			version: summaryRecord.version,
		});

		const mapChildItem = (childRecord) => {
			const itemKind = nodeKindOf(childRecord.labelList);
			const mappingList = collapseMappingList(childRecord.mappingList);
			const childItem = {
				stableId: childRecord.stableId,
				name: childRecord.name,
				kind: itemKind,
				description: childRecord.description,
				hasChildren: Boolean(childRecord.hasStructuralChildren) || mappingList.length > 0,
			};
			if (childRecord.path !== undefined && childRecord.path !== null) {
				childItem.path = childRecord.path;
			}
			if (childRecord.ownerName) {
				childItem.ownerName = childRecord.ownerName;
			}
			if (itemKind === 'class' || itemKind === 'cedsDomain') {
				childItem.propertyCount = childRecord.propertyCount;
				childItem.mappedPropertyCount = childRecord.mappedPropertyCount;
			}
			if (itemKind === 'property' || itemKind === 'instance' || itemKind === 'cedsProperty') {
				childItem.mapping = mappingList.length ? mappingList[0] : null;
				childItem.mappingCount = mappingList.length;
				childItem.occurrenceCount = childRecord.occurrenceCount;
			}
			return childItem;
		};

		const mapChildGroupRecord = (groupRecord) => ({
			relationshipType: groupRecord.relationshipType,
			count: groupRecord.itemCount,
			truncated: groupRecord.itemCount > groupRecord.itemList.length,
			itemList: groupRecord.itemList.map(mapChildItem),
		});

		const childGroupOrderOf = (relationshipType) => {
			const orderIndex = childRelationshipTypeList.indexOf(relationshipType);
			return orderIndex === -1 ? childRelationshipTypeList.length : orderIndex;
		};

		const mapChildGroupRecordList = (groupRecordList) =>
			groupRecordList.map(mapChildGroupRecord).sort((left, right) => childGroupOrderOf(left.relationshipType) - childGroupOrderOf(right.relationshipType));

		// the anchor's fan-out, one group per owning standard; a group's single edge style is its strongest kind
		const mapAnchorFanOut = ({ fanOutRecordList, anchorStableId }) => {
			const groupByStandardKey = {};
			(fanOutRecordList || []).forEach((oneRecord) => {
				const existingGroup =
					groupByStandardKey[oneRecord.standardKey] ||
					(groupByStandardKey[oneRecord.standardKey] = {
						stableId: standardGroupIdOf({ standardKey: oneRecord.standardKey, anchorStableId }),
						name: oneRecord.rootName,
						kind: 'standardGroup',
						hasChildren: true,
						standardKey: oneRecord.standardKey,
						standardFamily: oneRecord.standardFamily,
						releaseLabel: oneRecord.releaseLabel,
						version: oneRecord.version,
						elementStableIdSet: new Set(),
						matchKindCountList: [],
						maximumConfidence: 0,
					});
				oneRecord.elementStableIdList.forEach((elementStableId) => existingGroup.elementStableIdSet.add(elementStableId));
				existingGroup.matchKindCountList.push({ matchKind: matchKindByEdgeType[oneRecord.matchEdgeType].matchKind, elementCount: oneRecord.elementStableIdList.length });
				existingGroup.maximumConfidence = Math.max(existingGroup.maximumConfidence, oneRecord.maximumConfidence || 0);
			});
			return Object.values(groupByStandardKey)
				.map(({ elementStableIdSet, ...groupFieldList }) => {
					const matchKindCountList = groupFieldList.matchKindCountList.sort((left, right) => strengthRankOf(left.matchKind) - strengthRankOf(right.matchKind));
					return { ...groupFieldList, elementCount: elementStableIdSet.size, matchKindCountList, strongestMatchKind: matchKindCountList[0].matchKind };
				})
				.sort((left, right) => right.elementCount - left.elementCount || String(left.name).localeCompare(String(right.name)));
		};

		// of every shortest climb from the root, the one through a class; ties broken by the names, so it is stable
		const chooseAncestorChain = (chainRecordList) => {
			const chainList = (chainRecordList || []).map((oneRecord) => oneRecord.chainNodeList);
			if (chainList.length === 0) {
				return [];
			}
			const throughClassScore = (oneChain) => (oneChain[1] && nodeKindOf(oneChain[1].labelList) === 'class' ? 0 : 1);
			const chainText = (oneChain) => oneChain.map((chainNode) => chainNode.name).join('/');
			const chosenChain = chainList.sort((left, right) => throughClassScore(left) - throughClassScore(right) || chainText(left).localeCompare(chainText(right)))[0];
			return chosenChain.slice(0, -1).map((chainNode) => ({ stableId: chainNode.stableId, name: chainNode.name, kind: nodeKindOf(chainNode.labelList) }));
		};

		const mapCatalogRecordList = (catalogRecordList) => {
			const releaseByLabel = {};
			catalogRecordList.forEach((oneRecord) => {
				const existingRelease = releaseByLabel[oneRecord.releaseLabel] || (releaseByLabel[oneRecord.releaseLabel] = { releaseLabel: oneRecord.releaseLabel, standardFamily: oneRecord.standardFamily, versionList: [] });
				existingRelease.versionList.push({ stableId: oneRecord.stableId, name: oneRecord.name, standardKey: oneRecord.standardKey, version: oneRecord.version, classCount: oneRecord.classCount, description: oneRecord.description });
			});
			return Object.values(releaseByLabel).map((oneRelease) => ({ ...oneRelease, versionList: oneRelease.versionList.sort((left, right) => compareVersionText(left.version, right.version)) }));
		};

		return {
			getCypher,
			requiredLabelList,
			matchKindByEdgeType,
			nodeKindOf,
			parseSyntheticId,
			familyIdOf,
			standardGroupIdOf,
			parseStandardGroupRemainder,
			collapseMappingList,
			instanceFoldingOf,
			versionIdentityOf,
			comparisonPeerOf,
			versionBadgeByStableId,
			versionIdentityMatchOf,
			mapNodeRecord,
			mapNodeSummaryRecord,
			mapChildItem,
			mapChildGroupRecordList,
			mapAnchorFanOut,
			chooseAncestorChain,
			mapCatalogRecordList,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
