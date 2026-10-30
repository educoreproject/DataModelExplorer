#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MapperPattern]]
// @concept: [[Neo4jAbstraction]]

// forged-use-cases — the named Cypher and the pure shaping behind the web pages that show the FORGED use cases (use-case
// forge Phase 5, 2026-10-30; PLAN-useCaseDme-103026 Phase C). The EDUcore use-case standard is a standard in the gold
// (_source UseCase; educoreForge SPEC-useCaseForge-102926 §3.2): a UcUseCase owns its steps by HAS_STEP {codedNotation,
// position, kind} to shared UcUserStory nodes, and cites data through UcDataReference nodes; an external reference whose
// element is in the graph carries ONE DECLARED_CORRESPONDENCE edge to the cited standard's own node.
//
// Graph facts this mapper leans on (measured 2026-10-30 on GOLD_EVAL_261030_useCases): 7 cases, 73 HAS_STEP edges (kind
// main 56, exception 13, extension 4); every story has one PERFORMED_BY actor; 50 references (26 resolved to CEDS, 7 orphan,
// 3 whole-standard, 8 intermediate, 6 artifact). The cross-case edges (SIBLING, INVOKES, INCLUDES, DUPLICATE, PARENT, CHILD)
// are left out of the citation walk: they multiply paths (261 to 1,293 on the C200079 question).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

// the labels this mapper's Cypher reads; the access point refuses by name when the gold holds no use cases
const requiredLabelList = Object.freeze(['ForgedNode', 'UcUseCase', 'UcUserStory', 'UcDataReference']);

// the edges a case reaches its data references by (its own steps, subjects and requirements), 1 to CITATION_WALK_DEPTH hops
const citationWalkEdgeTypeList = Object.freeze([
	'HAS_SUBJECT',
	'HAS_STEP',
	'HAS_CONSTITUENT',
	'COMPRISES',
	'CONSUMES',
	'PRODUCES',
	'REQUIRES',
	'GOVERNS',
	'REQUIRES_ORPHAN',
	'REQUIRES_STANDARD',
	'REQUIRES_ARTIFACT',
]);
const CITATION_WALK_DEPTH = 3;
// the edges a story names its data by
const storyDataEdgeTypeList = Object.freeze(['CONSUMES', 'PRODUCES']);

// ⟪Phase C3, TQ 2026-10-30: the old pages had swimlanes and t-charts⟫ the case's own context edges, each with the page section
// that shows it (data, not a branch): who takes part, what it assumes and guarantees, what starts it, what it serves, what it
// is about, the cases it relates to, and its sources. The order here is display order within a section.
const caseContextSectionList = Object.freeze([
	{ edgeType: 'HAS_PRIMARY_ACTOR', sectionName: 'primaryActor' },
	{ edgeType: 'HAS_ACTOR', sectionName: 'actor' },
	{ edgeType: 'HAS_INTERESTED_PARTY', sectionName: 'interestedParty' },
	{ edgeType: 'ALIGNS_WITH', sectionName: 'valueDriver' },
	{ edgeType: 'HAS_SUBJECT', sectionName: 'subject' },
	{ edgeType: 'TRIGGERED_BY', sectionName: 'trigger' },
	{ edgeType: 'ASSUMES', sectionName: 'precondition' },
	{ edgeType: 'GUARANTEES', sectionName: 'guarantee' },
	{ edgeType: 'PARENT', sectionName: 'relatedCase' },
	{ edgeType: 'CHILD', sectionName: 'relatedCase' },
	{ edgeType: 'SIBLING', sectionName: 'relatedCase' },
	{ edgeType: 'INVOKES', sectionName: 'relatedCase' },
	{ edgeType: 'INCLUDES', sectionName: 'relatedCase' },
	{ edgeType: 'EXTENDS', sectionName: 'relatedCase' },
	{ edgeType: 'DUPLICATE', sectionName: 'relatedCase' },
	{ edgeType: 'HAS_RESOURCE', sectionName: 'resource' },
]);
// the hub slots by which a hub card reaches a cited element (a CEDS class is a card's domain, a property its property, a
// code its value); each card names its own hub, so the text works for any hub (toolPayloadContract)
const { cardHubSlotEdgeTypeTextFor } = require('../../../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');
const citedElementSlotNameList = Object.freeze(['DOMAIN', 'PROPERTY', 'VALUE']);
const MATCH_EDGE_TYPE_TEXT = 'EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH';

// ⟪Structure tab, PLAN-useCaseStructureTab-103026⟫ THE CASE AS THE GRAPH HOLDS IT. The walk follows outgoing edges from the
// case through nodes that are use-case parts (a Uc label, and not another UcUseCase) and stops at the first node that is
// not one: a cited element of another standard, or another case. Measured 2026-10-30 over all 7 cases: the walk closes at
// 4 hops (fs002-package-submission: HAS_STEP → PRODUCES → COMPRISES → DECLARED_CORRESPONDENCE); the bound is a guard.
const STRUCTURE_WALK_DEPTH = 6;
const USE_CASE_PART_LABEL_PREFIX = 'Uc';
// machinery, not meaning: left out of the outline AND the extracted JSON (the page says so once)
const structureExcludedPropertyNameList = Object.freeze(['embedding', 'searchText', 'embeddingModelVersion']);
// the properties a node's own line already shows, so its property list does not repeat them
const structureHeadPropertyNameList = Object.freeze(['name', 'stableId']);
// every edge the walk can meet, in display order, with its plain words (data, not a branch). An edge type absent here is
// still shown, NAMED as unworded (structureUnwordedGroupLabel), and the live test fails on it.
const structureEdgeWordingList = Object.freeze([
	{ edgeType: 'HAS_PRIMARY_ACTOR', groupLabel: 'Primary actor' },
	{ edgeType: 'HAS_ACTOR', groupLabel: 'Actors (the cast)' },
	{ edgeType: 'HAS_INTERESTED_PARTY', groupLabel: 'Interested parties' },
	{ edgeType: 'ALIGNS_WITH', groupLabel: 'Value drivers it serves' },
	{ edgeType: 'HAS_SUBJECT', groupLabel: 'What it is about' },
	{ edgeType: 'TRIGGERED_BY', groupLabel: 'What starts it' },
	{ edgeType: 'ASSUMES', groupLabel: 'Preconditions' },
	{ edgeType: 'HAS_STEP', groupLabel: 'Steps' },
	{ edgeType: 'GUARANTEES', groupLabel: 'Guarantees' },
	{ edgeType: 'REQUIRES', groupLabel: 'Data it requires' },
	{ edgeType: 'REQUIRES_STANDARD', groupLabel: 'Whole standards it requires' },
	{ edgeType: 'REQUIRES_ARTIFACT', groupLabel: 'Artifacts it requires' },
	{ edgeType: 'REQUIRES_ORPHAN', groupLabel: 'Data no standard holds (a gap)' },
	{ edgeType: 'PERFORMED_BY', groupLabel: 'Performed by' },
	{ edgeType: 'CONSUMES', groupLabel: 'Data it reads' },
	{ edgeType: 'PRODUCES', groupLabel: 'Data it produces' },
	{ edgeType: 'HAS_CONSTITUENT', groupLabel: 'Its parts' },
	{ edgeType: 'COMPRISES', groupLabel: 'Made up of' },
	{ edgeType: 'GOVERNS', groupLabel: 'Data it governs' },
	{ edgeType: 'DECLARED_CORRESPONDENCE', groupLabel: 'Cites, in another standard' },
	{ edgeType: 'PARENT', groupLabel: 'Parent case' },
	{ edgeType: 'CHILD', groupLabel: 'Child cases' },
	{ edgeType: 'SIBLING', groupLabel: 'Sibling cases' },
	{ edgeType: 'INVOKES', groupLabel: 'Cases it invokes' },
	{ edgeType: 'INCLUDES', groupLabel: 'Cases it includes' },
	{ edgeType: 'EXTENDS', groupLabel: 'Cases it extends' },
	{ edgeType: 'DUPLICATE', groupLabel: 'Duplicate cases' },
	{ edgeType: 'HAS_RESOURCE', groupLabel: 'Sources' },
]);
const structureUnwordedGroupLabel = 'An edge this page has no wording for';
// the case's own source file inside the standard's source download (educoreForge downloadArtifacts): the zip holds
// source/<sourceFileName> and source/SHA256SUMS, whose lines name the same relative path
const SOURCE_ZIP_ENTRY_PREFIX = 'source/';
const SOURCE_CHECKSUM_ENTRY_NAME = 'source/SHA256SUMS';
const SOURCE_DOWNLOAD_FACET = 'source';
const SOURCE_FILE_NAME_PATTERN = /^cases\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const EXTRACTED_DOCUMENT_FORMAT = 'educoreUseCaseSubgraph/1';

// a reference's resolution state, from its own properties and its DECLARED_CORRESPONDENCE edge; the FIRST entry whose test
// holds decides, and the last always holds (a reference the forge carried with no kind the table knows is said so)
const citationStateRuleList = Object.freeze([
	{ citationState: 'resolved', stateLabel: 'cites an element in the graph', holdsFor: (citationRow) => Boolean(citationRow.citedStableId) },
	{ citationState: 'gap', stateLabel: 'a confirmed standards gap (orphan)', holdsFor: (citationRow) => citationRow.referenceKind === 'orphan' },
	{ citationState: 'documentAnchored', stateLabel: 'cites a whole standard published as a document', holdsFor: (citationRow) => citationRow.resolutionAnchor === 'document' },
	{ citationState: 'wholeStandard', stateLabel: 'cites a whole standard', holdsFor: (citationRow) => citationRow.referenceKind === 'standardWholesale' },
	{ citationState: 'unresolved', stateLabel: 'cites an element the graph does not hold', holdsFor: (citationRow) => citationRow.resolutionAnchor === 'graph' },
	{ citationState: 'corpus', stateLabel: 'data the use cases themselves define', holdsFor: (citationRow) => ['intermediate', 'artifact'].indexOf(citationRow.referenceKind) !== -1 },
	{ citationState: 'unclassified', stateLabel: 'a reference of a kind this page does not know', holdsFor: () => true },
]);

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess }) => {
		// ================================================================================
		// NAMED CYPHER QUERIES — getCypher(queryName, params) → { cypher, params }

		const citationWalkText = `${citationWalkEdgeTypeList.join('|')}*1..${CITATION_WALK_DEPTH}`;

		const queryBuilderByQueryName = {
			// every forged case, with its step and citation counts
			caseList: () => ({
				cypher: `
					MATCH (useCase:UcUseCase)
					OPTIONAL MATCH (root:DmeStandardRoot {_source: useCase._source})
					CALL {
						WITH useCase
						OPTIONAL MATCH (useCase)-[step:HAS_STEP]->()
						RETURN count(step) AS stepCount
					}
					CALL {
						WITH useCase
						OPTIONAL MATCH (useCase)-[:${citationWalkText}]->(reference:UcDataReference)
						WITH DISTINCT reference
						RETURN count(reference) AS referenceCount, count(CASE WHEN (reference)-[:DECLARED_CORRESPONDENCE]->() THEN 1 END) AS resolvedReferenceCount
					}
					RETURN useCase.stableId AS caseStableId, useCase.shortName AS shortName, useCase.name AS longName, useCase.level AS level,
					       useCase.scope AS scope, useCase.formatVersion AS formatVersion, useCase._source AS standardSource,
					       root.version AS releaseVersion, stepCount, referenceCount, resolvedReferenceCount
					ORDER BY shortName
				`,
				params: {},
			}),

			// ⟪Phase C2, TQ 2026-10-30: the old catalogue is replaced⟫ every standard the cases CITE (the author's citedStandard,
			// as written), with the cases that cite it and whether the graph resolves those citations to its elements
			caseListByCitedStandard: () => ({
				cypher: `
					MATCH (useCase:UcUseCase)-[:${citationWalkText}]->(reference:UcDataReference)
					WHERE reference.citedStandard IS NOT NULL
					WITH reference.citedStandard AS citedStandard, useCase, reference
					WITH citedStandard, useCase, count(DISTINCT reference) AS referenceCount,
					     count(DISTINCT CASE WHEN (reference)-[:DECLARED_CORRESPONDENCE]->() THEN reference END) AS resolvedReferenceCount
					WITH citedStandard, collect({caseStableId: useCase.stableId, shortName: useCase.shortName, longName: useCase.name,
					     referenceCount: referenceCount, resolvedReferenceCount: resolvedReferenceCount}) AS caseList
					RETURN citedStandard, caseList, size(caseList) AS caseCount
					ORDER BY caseCount DESC, citedStandard
				`,
				params: {},
			}),

			// the case's context edges (caseContextSectionList), each with its own properties and its target
			caseContextList: ({ caseStableId }) => ({
				cypher: `
					MATCH (:UcUseCase {stableId: $caseStableId})-[contextEdge]->(target)
					WHERE type(contextEdge) IN $contextEdgeTypeList
					RETURN type(contextEdge) AS edgeType, contextEdge.role AS edgeRole, contextEdge.interest AS interest,
					       contextEdge.notes AS notes, contextEdge.partyKind AS partyKind, contextEdge.listPosition AS listPosition,
					       target.stableId AS targetStableId, target.name AS targetName, target.shortName AS targetShortName,
					       target.motivation AS motivation, target.url AS url
					ORDER BY edgeType, listPosition
				`,
				params: { caseStableId, contextEdgeTypeList: caseContextSectionList.map((oneSection) => oneSection.edgeType) },
			}),

			// the Implementation Guide: for every element the case cites, the standards whose elements a judge mapped to that
			// element's hub card, by relation. Each row is a JUDGED mapping of the CITED element, never of the case.
			caseImplementationGuide: ({ caseStableId }) => ({
				cypher: `
					MATCH (:UcUseCase {stableId: $caseStableId})-[:${citationWalkText}]->(:UcDataReference)-[:DECLARED_CORRESPONDENCE]->(cited)
					WITH DISTINCT cited
					OPTIONAL MATCH (hub:HubReference)-[slot]->(cited)
					WHERE type(slot) IN [${citedElementSlotNameList.map((slotName) => cardHubSlotEdgeTypeTextFor('hub', slotName)).join(', ')}]
					OPTIONAL MATCH (element:ForgedNode)-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]->(hub)
					WITH cited, element._source AS standard, type(matchEdge) AS relation, count(DISTINCT element) AS elementCount
					RETURN cited.stableId AS citedStableId, cited.name AS citedName, cited.role AS citedRole, cited._source AS citedSource,
					       standard, relation, elementCount
					ORDER BY citedName, standard, relation
				`,
				params: { caseStableId },
			}),

			// one case's own properties, its standard's release and its primary actor
			caseByStableId: ({ caseStableId }) => ({
				cypher: `
					MATCH (useCase:UcUseCase {stableId: $caseStableId})
					OPTIONAL MATCH (root:DmeStandardRoot {_source: useCase._source})
					OPTIONAL MATCH (useCase)-[:HAS_PRIMARY_ACTOR]->(primaryActor)
					RETURN useCase.stableId AS caseStableId, useCase.shortName AS shortName, useCase.name AS longName, useCase.level AS level,
					       useCase.scope AS scope, useCase.frequency AS frequency, useCase.formatVersion AS formatVersion,
					       useCase.editorialExplanation AS editorialExplanation, useCase._source AS standardSource,
					       root.version AS releaseVersion, root.standardName AS standardName, primaryActor.name AS primaryActorName
				`,
				params: { caseStableId },
			}),

			// the case's steps, each with its story, its actor and the data the story names
			caseStepList: ({ caseStableId }) => ({
				cypher: `
					MATCH (:UcUseCase {stableId: $caseStableId})-[step:HAS_STEP]->(story)
					OPTIONAL MATCH (story)-[:PERFORMED_BY]->(actor)
					OPTIONAL MATCH (story)-[dataEdge:${storyDataEdgeTypeList.join('|')}]->(dataNode)
					WITH step, story, actor, collect(CASE WHEN dataNode IS NULL THEN NULL ELSE {dataEdgeType: type(dataEdge), dataName: dataNode.name, dataStableId: dataNode.stableId, dataRole: dataNode.role} END) AS dataList
					RETURN step.codedNotation AS codedNotation, step.position AS position, step.kind AS stepKind,
					       story.stableId AS storyStableId, story.name AS action, story.intention AS intention, story.benefit AS benefit,
					       actor.name AS actorName, dataList
					ORDER BY position, codedNotation
				`,
				params: { caseStableId },
			}),

			// ⟪Structure tab⟫ the case's whole subgraph in ONE read: every edge the walk meets (once) with its properties, and
			// every node at either end with its properties less the machinery. The case node is returned on its own as well, so
			// a case with no edges still answers.
			caseStructure: ({ caseStableId }) => ({
				cypher: `
					MATCH (useCase:UcUseCase {stableId: $caseStableId})
					OPTIONAL MATCH (root:DmeStandardRoot {_source: useCase._source})
					CALL {
						WITH useCase
						OPTIONAL MATCH walk = (useCase)-[*1..${STRUCTURE_WALK_DEPTH}]->()
						WHERE all(between IN nodes(walk)[1..-1] WHERE NOT between:UcUseCase AND any(labelName IN labels(between) WHERE labelName STARTS WITH $partLabelPrefix))
						UNWIND coalesce(relationships(walk), []) AS walkEdge
						WITH DISTINCT walkEdge
						WITH collect(walkEdge) AS walkEdgeList
						CALL {
							WITH walkEdgeList
							UNWIND walkEdgeList AS endEdge
							UNWIND [startNode(endEdge), endNode(endEdge)] AS endNode
							WITH DISTINCT endNode
							RETURN collect({stableId: endNode.stableId, labelList: labels(endNode),
							       propertyPairList: [propertyName IN keys(endNode) WHERE NOT propertyName IN $excludedPropertyNameList | [propertyName, endNode[propertyName]]]}) AS nodeList
						}
						RETURN [oneEdge IN walkEdgeList | {edgeType: type(oneEdge), fromStableId: startNode(oneEdge).stableId, toStableId: endNode(oneEdge).stableId,
						       propertyPairList: [propertyName IN keys(oneEdge) | [propertyName, oneEdge[propertyName]]]}] AS edgeList, nodeList
					}
					RETURN {stableId: useCase.stableId, labelList: labels(useCase),
					        propertyPairList: [propertyName IN keys(useCase) WHERE NOT propertyName IN $excludedPropertyNameList | [propertyName, useCase[propertyName]]]} AS caseNode,
					       root.standardName AS standardName, root.version AS releaseVersion, edgeList, nodeList
				`,
				params: { caseStableId, partLabelPrefix: USE_CASE_PART_LABEL_PREFIX, excludedPropertyNameList: [...structureExcludedPropertyNameList] },
			}),

			// ⟪Structure tab⟫ where the case's own source file is: its sourceFileName and the standard it belongs to
			caseSourceFileName: ({ caseStableId }) => ({
				cypher: `
					MATCH (useCase:UcUseCase {stableId: $caseStableId})
					RETURN useCase.stableId AS caseStableId, useCase.sourceFileName AS sourceFileName, useCase._source AS standardSource
				`,
				params: { caseStableId },
			}),

			// every data reference the case reaches, with the element it cites when the graph holds one
			caseCitationList: ({ caseStableId }) => ({
				cypher: `
					MATCH (:UcUseCase {stableId: $caseStableId})-[walk:${citationWalkText}]->(reference:UcDataReference)
					WITH reference, collect(DISTINCT type(last(walk))) AS reachedByList
					OPTIONAL MATCH (reference)-[citation:DECLARED_CORRESPONDENCE]->(cited)
					RETURN reference.stableId AS referenceStableId, reference.name AS referenceName, reference.role AS referenceRole,
					       reference.referenceKind AS referenceKind, reference.citedStandard AS citedStandard, reference.citedIdentifier AS citedIdentifier,
					       reference.resolutionAnchor AS resolutionAnchor, reference.linkageStatus AS linkageStatus, reachedByList,
					       cited.stableId AS citedStableId, cited.name AS citedName, cited._source AS citedSource, cited.role AS citedRole,
					       citation.sourcePredicate AS sourcePredicate
					ORDER BY citedStandard, referenceName
				`,
				params: { caseStableId },
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

		const citationStateOf = (citationRow) => {
			const stateRule = citationStateRuleList.find((oneRule) => oneRule.holdsFor(citationRow));
			return { citationState: stateRule.citationState, citationStateLabel: stateRule.stateLabel };
		};

		const mapCitationRecordList = (citationRecordList) => citationRecordList.map((citationRecord) => ({ ...citationRecord, ...citationStateOf(citationRecord) }));

		// every state the page may show, with how many of this case's citations are in it (zero states included)
		const citationStateCountListOf = (citationList) =>
			citationStateRuleList.map(({ citationState, stateLabel }) => ({
				citationState,
				stateLabel,
				citationCount: citationList.filter((oneCitation) => oneCitation.citationState === citationState).length,
			}));

		// the context rows grouped by page section: { primaryActor: [...], actor: [...], ... }, every section present
		const mapContextRecordList = (contextRecordList) => {
			const sectionNameByEdgeType = Object.fromEntries(caseContextSectionList.map((oneSection) => [oneSection.edgeType, oneSection.sectionName]));
			const contextBySection = Object.fromEntries(caseContextSectionList.map((oneSection) => [oneSection.sectionName, []]));
			contextRecordList.forEach((contextRecord) => contextBySection[sectionNameByEdgeType[contextRecord.edgeType]].push(contextRecord));
			return contextBySection;
		};

		// the guide by STANDARD: each standard with the cited elements it holds (by relation) — the page's chips and table
		const mapImplementationGuideRecordList = (guideRecordList) => {
			const citedElementList = [];
			const standardByName = {};
			guideRecordList.forEach((guideRecord) => {
				if (!citedElementList.some((oneElement) => oneElement.citedStableId === guideRecord.citedStableId)) {
					citedElementList.push({ citedStableId: guideRecord.citedStableId, citedName: guideRecord.citedName, citedRole: guideRecord.citedRole, citedSource: guideRecord.citedSource });
				}
				if (!guideRecord.standard) return;
				const standardEntry = (standardByName[guideRecord.standard] ||= { standard: guideRecord.standard, elementCount: 0, citedElementByStableId: {} });
				standardEntry.elementCount += guideRecord.elementCount;
				const holdingEntry = (standardEntry.citedElementByStableId[guideRecord.citedStableId] ||= { citedStableId: guideRecord.citedStableId, citedName: guideRecord.citedName, relationCountList: [] });
				holdingEntry.relationCountList.push({ relation: guideRecord.relation, elementCount: guideRecord.elementCount });
			});
			const standardList = Object.values(standardByName)
				.map((standardEntry) => ({ standard: standardEntry.standard, elementCount: standardEntry.elementCount, citedElementList: Object.values(standardEntry.citedElementByStableId) }))
				.sort((leftEntry, rightEntry) => (rightEntry.citedElementList.length - leftEntry.citedElementList.length) || leftEntry.standard.localeCompare(rightEntry.standard));
			return { citedElementList, standardList };
		};

		const mapStepRecordList = (stepRecordList) => stepRecordList.map((stepRecord) => ({ ...stepRecord, dataList: (stepRecord.dataList || []).filter(Boolean) }));

		// ================================================================================
		// ⟪Structure tab⟫ SHAPING: the subgraph as an outline (for reading) and as one JSON document (for downloading)

		const groupLabelByEdgeType = Object.fromEntries(structureEdgeWordingList.map((oneWording) => [oneWording.edgeType, oneWording.groupLabel]));
		const edgeTypeDisplayOrderOf = (edgeType) => (groupLabelByEdgeType[edgeType] ? structureEdgeWordingList.findIndex((oneWording) => oneWording.edgeType === edgeType) : structureEdgeWordingList.length);
		const isUseCasePart = (labelList) => labelList.some((labelName) => labelName.startsWith(USE_CASE_PART_LABEL_PREFIX));

		// a step's position and codedNotation, then a list position, then the name: reading order within one group
		const compareChildOrder = (leftChild, rightChild) => {
			const leftEdge = leftChild.edgePropertyMap;
			const rightEdge = rightChild.edgePropertyMap;
			const numberOrder = (fieldName) => (leftEdge[fieldName] ?? Infinity) - (rightEdge[fieldName] ?? Infinity) || 0;
			return numberOrder('position') || `${leftEdge.codedNotation ?? ''}`.localeCompare(`${rightEdge.codedNotation ?? ''}`) || numberOrder('listPosition') || `${leftChild.childNode.nodeName}`.localeCompare(`${rightChild.childNode.nodeName}`);
		};

		// mapStructureRecord — the caseStructure row as { outline, extractedDocument, citationCount, resolvedCitationCount, ... }
		const mapStructureRecord = (structureRecord) => {
			const nodeByStableId = {};
			[structureRecord.caseNode, ...structureRecord.nodeList].forEach((nodeRecord) => {
				nodeByStableId[nodeRecord.stableId] = { stableId: nodeRecord.stableId, labelList: nodeRecord.labelList, propertyMap: Object.fromEntries(nodeRecord.propertyPairList) };
			});
			const edgeList = structureRecord.edgeList.map((edgeRecord, edgeIndex) => ({ edgeIndex, edgeType: edgeRecord.edgeType, fromStableId: edgeRecord.fromStableId, toStableId: edgeRecord.toStableId, propertyMap: Object.fromEntries(edgeRecord.propertyPairList) }));
			const outgoingEdgeListByStableId = {};
			edgeList.forEach((oneEdge) => (outgoingEdgeListByStableId[oneEdge.fromStableId] ||= []).push(oneEdge));
			const caseStableId = structureRecord.caseNode.stableId;

			const nodeKindOf = (graphNode, ancestorStableIdList) => {
				if (graphNode.stableId === caseStableId && !ancestorStableIdList.length) return 'useCase';
				if (graphNode.labelList.includes('UcUseCase')) return 'otherCase';
				if (!isUseCasePart(graphNode.labelList)) return 'citedElement';
				if (ancestorStableIdList.includes(graphNode.stableId)) return 'shownAbove';
				return 'part';
			};

			// one outline node; only the case and its parts open into groups, so a cited element or another case is a leaf
			// and the outline cannot loop
			const outlineNodeOf = (stableId, ancestorStableIdList) => {
				const graphNode = nodeByStableId[stableId];
				const nodeKind = nodeKindOf(graphNode, ancestorStableIdList);
				const outlineNode = {
					nodeStableId: stableId,
					nodeName: graphNode.propertyMap.name ?? graphNode.propertyMap.shortName ?? null,
					nodeRole: graphNode.propertyMap.role ?? null,
					labelList: graphNode.labelList,
					standardSource: graphNode.propertyMap._source ?? null,
					nodeKind,
					propertyList: Object.keys(graphNode.propertyMap).filter((propertyName) => !structureHeadPropertyNameList.includes(propertyName)).sort().map((propertyName) => ({ propertyName, propertyValue: graphNode.propertyMap[propertyName] })),
					groupList: [],
				};
				if (nodeKind !== 'useCase' && nodeKind !== 'part') return outlineNode;
				const childAncestorList = [...ancestorStableIdList, stableId];
				const childListByEdgeType = {};
				(outgoingEdgeListByStableId[stableId] || []).forEach((oneEdge) => {
					(childListByEdgeType[oneEdge.edgeType] ||= []).push({ edgeIndex: oneEdge.edgeIndex, edgeType: oneEdge.edgeType, edgePropertyMap: oneEdge.propertyMap, childNode: outlineNodeOf(oneEdge.toStableId, childAncestorList) });
				});
				outlineNode.groupList = Object.keys(childListByEdgeType)
					.sort((leftType, rightType) => edgeTypeDisplayOrderOf(leftType) - edgeTypeDisplayOrderOf(rightType) || leftType.localeCompare(rightType))
					.map((edgeType) => ({
						edgeType,
						groupLabel: groupLabelByEdgeType[edgeType] || structureUnwordedGroupLabel,
						isWorded: Boolean(groupLabelByEdgeType[edgeType]),
						childList: childListByEdgeType[edgeType].sort(compareChildOrder).map((oneChild) => ({ ...oneChild, edgePropertyList: Object.keys(oneChild.edgePropertyMap).sort().map((propertyName) => ({ propertyName, propertyValue: oneChild.edgePropertyMap[propertyName] })) })),
					}));
				return outlineNode;
			};

			const referenceNodeList = Object.values(nodeByStableId).filter((graphNode) => graphNode.labelList.includes('UcDataReference'));
			const resolvedReferenceCount = referenceNodeList.filter((graphNode) => (outgoingEdgeListByStableId[graphNode.stableId] || []).some((oneEdge) => oneEdge.edgeType === 'DECLARED_CORRESPONDENCE')).length;
			const nodeList = Object.values(nodeByStableId);
			return {
				caseStableId,
				sourceFileName: nodeByStableId[caseStableId].propertyMap.sourceFileName ?? null,
				standardName: structureRecord.standardName,
				releaseVersion: structureRecord.releaseVersion,
				excludedPropertyNameList: [...structureExcludedPropertyNameList],
				nodeCount: nodeList.length,
				edgeCount: edgeList.length,
				citationCount: referenceNodeList.length,
				resolvedCitationCount: resolvedReferenceCount,
				outline: outlineNodeOf(caseStableId, []),
				extractedDocument: {
					documentFormat: EXTRACTED_DOCUMENT_FORMAT,
					caseStableId,
					standardName: structureRecord.standardName,
					releaseVersion: structureRecord.releaseVersion,
					walkRule: `outgoing edges from the case, through use-case parts (a ${USE_CASE_PART_LABEL_PREFIX}* label, not another UcUseCase), up to ${STRUCTURE_WALK_DEPTH} hops; a cited element or another case ends the walk`,
					excludedPropertyNameList: [...structureExcludedPropertyNameList],
					nodeCount: nodeList.length,
					edgeCount: edgeList.length,
					nodeList,
					edgeList: edgeList.map(({ edgeType, fromStableId, toStableId, propertyMap }) => ({ edgeType, fromStableId, toStableId, propertyMap })),
				},
			};
		};

		// the save name of an extracted document beside its source: cases/lerIssuance.json → lerIssuance.extracted.json
		const extractedFileNameOf = (sourceFileName, caseStableId) => (sourceFileName ? sourceFileName.split('/').pop().replace(/\.json$/, '.extracted.json') : `${caseStableId.replace(/[^A-Za-z0-9._-]/g, '_')}.extracted.json`);

		// a SHA256SUMS text as { relativePath: sha256 }; a line that is not '<64 hex>  <path>' is not a checksum and is ignored
		const checksumByRelativePathOf = (checksumText) =>
			Object.fromEntries(
				checksumText
					.split('\n')
					.map((oneLine) => oneLine.match(/^([0-9a-f]{64}) [ *]?(\S.*)$/))
					.filter(Boolean)
					.map((lineMatch) => [lineMatch[2], lineMatch[1]]),
			);

		return {
			mapStructureRecord,
			extractedFileNameOf,
			checksumByRelativePathOf,
			structureEdgeWordingList,
			structureExcludedPropertyNameList,
			SOURCE_ZIP_ENTRY_PREFIX,
			SOURCE_CHECKSUM_ENTRY_NAME,
			SOURCE_DOWNLOAD_FACET,
			SOURCE_FILE_NAME_PATTERN,
			getCypher,
			requiredLabelList,
			citationWalkEdgeTypeList,
			citationStateRuleList,
			mapCitationRecordList,
			citationStateCountListOf,
			mapStepRecordList,
			caseContextSectionList,
			mapContextRecordList,
			mapImplementationGuideRecordList,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
