#!/usr/bin/env node
'use strict';
// @concept: [[SpecificationViewer]]
// @concept: [[MapperPattern]]
// @concept: [[Neo4jAbstraction]]

// schema-equivalents — the Specification Viewer's live graph lookup, PORTED to the current graph (campaign P4b, A11 /
// W-E-8, 2026-10-07). It replaced a browser-built Cypher string POSTed to the internal-only /api/dme-cypher-query
// (401 for a browser since SEC-2) that read retired labels (SifField, CtdlProperty, EdfiField, LifProperty) and
// retired edges (MAPS_TO, IMPLIED_MAPPING), so it could only ever return nothing.
//
// The current model: every standard's elements are ForgedNode:DmeProperty (or :DmeClass), named by `name`, owned by
// `_source`. A mapping is a JUDGMENT edge — EXACT_MATCH, CLOSE_MATCH, BROAD_MATCH or NARROW_MATCH — from an element
// (Ed-Fi) or one of its instances (SIF, PESC: element -HAS_INSTANCE-> instance) to a hub's :HubReference card, which
// names its hub property through its hub's slot edge (HAS_<HUB>_PROPERTY). Every edge carries mappingConfidence, mappingKind and
// mappingSource; none is "authoritative", so the wire says what the judgment is instead.
//
// Equivalents are read in both directions:
//   towardHub     — a non-hub element's own judgments, reported as the hub properties its cards name;
//   fromStandard  — a hub property's incoming judgments, reported as the judged elements (an instance reports its
//                   owning element's name).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

// the labels this mapper's Cypher reads; the access point refuses by name when the golden lacks one
const requiredLabelList = Object.freeze(['ForgedNode', 'DmeProperty', 'DmeClass', 'HubReference', 'StandardDefinition']);

// a JS number reaches Neo4j as a FLOAT and LIMIT refuses a float, so the limit is an integer in the Cypher text
const CANDIDATE_LIMIT = 20;
const MATCH_EDGE_TYPE_TEXT = 'EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH';
// ⟪ctdlHub P7⟫ every hub of the graph: a card names its property through its OWN hub's PROPERTY slot (it was
// HAS_CEDS_PROPERTY), a hub standard's element ranks as the headline (it was the literal CEDS), and each judgment names
// its card's hub (hubName)
const { cardHubSlotEdgeTypeTextFor, HUB_SOURCE_LIST_CYPHER_TEXT } = require('../../../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');
const { sourceIdentifierCypherTextFor } = require('../../../../cli/lib.d/data-model-explorer/lib/nativeIdentifier');
const CARD_PROPERTY_SLOT_EDGE_TYPE_TEXT = cardHubSlotEdgeTypeTextFor('hubCard', 'PROPERTY');

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess }) => {
		// ================================================================================
		// NAMED CYPHER QUERIES — getCypher(queryName, params) → { cypher, params }

		const queryBuilderByQueryName = {
			// candidates whose name holds at least minimumHitCount of the words, ranked: word coverage first, then
			// tightness (fewer extra words), then property over class, then a hub standard's element (the headline equivalence)
			// ⟪lane zbE, E1-1⟫ sourceId by the candidate's OWN standard's declared identifier (nativeIdentifierDeclarationList, read
			// from the graph by the access point), else stableId; stableId rides beside it
			equivalentsByWordList: ({ wordList, minimumHitCount, nativeIdentifierDeclarationList }) => ({
				cypher: `
					WITH $wordList AS wordList, $minimumHitCount AS minimumHitCount
					MATCH (candidate:ForgedNode)
					WHERE (candidate:DmeProperty OR candidate:DmeClass)
					  AND size([oneWord IN wordList WHERE toLower(coalesce(candidate.name, '')) CONTAINS oneWord]) >= minimumHitCount
					WITH candidate,
					     size([oneWord IN wordList WHERE toLower(coalesce(candidate.name, '')) CONTAINS oneWord]) AS hitCount,
					     size(split(trim(toLower(coalesce(candidate.name, ''))), ' ')) AS candidateWordCount
					WITH candidate,
					     hitCount * 100
					       + toInteger(round(10.0 * hitCount / (CASE WHEN candidateWordCount > hitCount THEN candidateWordCount ELSE hitCount END)))
					       + CASE WHEN candidate:DmeProperty THEN 1 ELSE 0 END
					       + CASE WHEN candidate._source IN ${HUB_SOURCE_LIST_CYPHER_TEXT} THEN 2 ELSE 0 END AS relevanceScore
					ORDER BY relevanceScore DESC, candidate.name
					LIMIT ${CANDIDATE_LIMIT}
					OPTIONAL MATCH (standardDefinition:StandardDefinition {sourceKey: candidate._source})
					RETURN candidate.name AS name,
					       candidate._source AS source,
					       standardDefinition.standardFamily AS standardFamily,
					       candidate.role AS role,
					       coalesce(candidate.definition, candidate.description, '') AS description,
					       ${sourceIdentifierCypherTextFor('candidate', nativeIdentifierDeclarationList)} AS sourceId,
					       candidate.stableId AS stableId,
					       relevanceScore,
					       candidate._source IN ${HUB_SOURCE_LIST_CYPHER_TEXT} AS isHubStandard,
					       [(candidate)-[:HAS_INSTANCE*0..1]->(subjectNode)-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]->(hubCard:HubReference)-[propertySlotEdge]->(hubProperty) WHERE type(propertySlotEdge) = ${CARD_PROPERTY_SLOT_EDGE_TYPE_TEXT} |
					         { relation: type(matchEdge), name: hubProperty.name, source: hubProperty._source, mappingConfidence: matchEdge.mappingConfidence, mappingKind: matchEdge.mappingKind, mappingSource: matchEdge.mappingSource, hubName: hubCard.hubName }] AS towardHubList,
					       [(candidate)<-[propertySlotEdge]-(hubCard:HubReference)<-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]-(subjectNode) WHERE type(propertySlotEdge) = ${CARD_PROPERTY_SLOT_EDGE_TYPE_TEXT} |
					         { relation: type(matchEdge), name: coalesce(head([(ownerNode)-[:HAS_INSTANCE]->(subjectNode) | ownerNode.name]), subjectNode.name), source: subjectNode._source, mappingConfidence: matchEdge.mappingConfidence, mappingKind: matchEdge.mappingKind, mappingSource: matchEdge.mappingSource, hubName: hubCard.hubName }] AS fromStandardList
					ORDER BY relevanceScore DESC, name
				`,
				params: { wordList, minimumHitCount },
			}),
		};

		const getCypher = (queryName, queryParams) => {
			const queryBuilder = queryBuilderByQueryName[queryName];
			if (!queryBuilder) {
				throw new Error(`${moduleName}: no query named '${queryName}'; valid: ${Object.keys(queryBuilderByQueryName).join(', ')}`);
			}
			return queryBuilder(queryParams);
		};

		// ================================================================================
		// RESULT TRANSFORMATION — one row per candidate; its judgments grouped by (relation, name, source), each
		// group reporting how many edges it stands for and the highest mappingConfidence among them

		const summarizeJudgmentList = (judgmentList) => {
			const summaryByGroupText = {};
			(judgmentList || []).forEach((oneJudgment) => {
				const groupText = [oneJudgment.relation, oneJudgment.source, oneJudgment.name, oneJudgment.mappingKind, oneJudgment.mappingSource, oneJudgment.hubName].join('\u0000');
				const existingSummary = summaryByGroupText[groupText];
				if (existingSummary) {
					existingSummary.edgeCount += 1;
					existingSummary.mappingConfidence = Math.max(existingSummary.mappingConfidence, oneJudgment.mappingConfidence);
					return;
				}
				summaryByGroupText[groupText] = { relation: oneJudgment.relation, name: oneJudgment.name, source: oneJudgment.source, mappingConfidence: oneJudgment.mappingConfidence, mappingKind: oneJudgment.mappingKind, mappingSource: oneJudgment.mappingSource, edgeCount: 1, hubName: oneJudgment.hubName };
			});
			return Object.values(summaryByGroupText).sort((left, right) => right.mappingConfidence - left.mappingConfidence || left.name.localeCompare(right.name));
		};

		const mapEquivalentRows = (recordList) =>
			recordList.map((oneRecord) => ({
				name: oneRecord.name,
				source: oneRecord.source,
				standardFamily: oneRecord.standardFamily,
				role: oneRecord.role,
				description: oneRecord.description,
				sourceId: oneRecord.sourceId,
				stableId: oneRecord.stableId,
				relevanceScore: oneRecord.relevanceScore,
				related: summarizeJudgmentList((oneRecord.towardHubList || []).concat(oneRecord.fromStandardList || [])),
				isHubStandard: oneRecord.isHubStandard,
			}));

		return { getCypher, mapEquivalentRows, requiredLabelList };
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
