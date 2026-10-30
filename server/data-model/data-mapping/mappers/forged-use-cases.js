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

		const mapStepRecordList = (stepRecordList) => stepRecordList.map((stepRecord) => ({ ...stepRecord, dataList: (stepRecord.dataList || []).filter(Boolean) }));

		return {
			getCypher,
			requiredLabelList,
			citationWalkEdgeTypeList,
			citationStateRuleList,
			mapCitationRecordList,
			citationStateCountListOf,
			mapStepRecordList,
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
