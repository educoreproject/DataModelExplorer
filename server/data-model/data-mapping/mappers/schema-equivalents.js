#!/usr/bin/env node
'use strict';
// @concept: [[SchemaVerifier]]
// @concept: [[MapperPattern]]
// @concept: [[Neo4jAbstraction]]

// schema-equivalents — the Schema Verifier's live graph lookup, PORTED to the current graph (campaign P4b, A11 /
// W-E-8, 2026-10-07). It replaced a browser-built Cypher string POSTed to the internal-only /api/dme-cypher-query
// (401 for a browser since SEC-2) that read retired labels (SifField, CtdlProperty, EdfiField, LifProperty) and
// retired edges (MAPS_TO, IMPLIED_MAPPING), so it could only ever return nothing.
//
// The current model: every standard's elements are ForgedNode:DmeProperty (or :DmeClass), named by `name`, owned by
// `_source`. A mapping is a JUDGMENT edge — EXACT_MATCH, CLOSE_MATCH, BROAD_MATCH or NARROW_MATCH — from an element
// (Ed-Fi) or one of its instances (SIF, PESC: element -HAS_INSTANCE-> instance) to a CEDS :HubReference card, which
// names its CEDS property through HAS_CEDS_PROPERTY. Every edge carries mappingConfidence, mappingKind and
// mappingSource; none is "authoritative", so the wire says what the judgment is instead.
//
// Equivalents are read in both directions:
//   towardHub     — a non-CEDS element's own judgments, reported as the CEDS properties its cards name;
//   fromStandard  — a CEDS property's incoming judgments, reported as the judged elements (an instance reports its
//                   owning element's name).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

// the labels this mapper's Cypher reads; the access point refuses by name when the golden lacks one
const requiredLabelList = Object.freeze(['ForgedNode', 'DmeProperty', 'DmeClass', 'HubReference', 'StandardDefinition']);

// a JS number reaches Neo4j as a FLOAT and LIMIT refuses a float, so the limit is an integer in the Cypher text
const CANDIDATE_LIMIT = 20;
const MATCH_EDGE_TYPE_TEXT = 'EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH';

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess }) => {
		// ================================================================================
		// NAMED CYPHER QUERIES — getCypher(queryName, params) → { cypher, params }

		const queryBuilderByQueryName = {
			// candidates whose name holds at least minimumHitCount of the words, ranked: word coverage first, then
			// tightness (fewer extra words), then property over class, then CEDS (the headline equivalence)
			equivalentsByWordList: ({ wordList, minimumHitCount }) => ({
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
					       + CASE WHEN candidate._source = 'CEDS' THEN 2 ELSE 0 END AS relevanceScore
					ORDER BY relevanceScore DESC, candidate.name
					LIMIT ${CANDIDATE_LIMIT}
					OPTIONAL MATCH (standardDefinition:StandardDefinition {sourceKey: candidate._source})
					RETURN candidate.name AS name,
					       candidate._source AS source,
					       standardDefinition.standardFamily AS standardFamily,
					       candidate.role AS role,
					       coalesce(candidate.definition, candidate.description, '') AS description,
					       coalesce(candidate.cedsId, '') AS sourceId,
					       relevanceScore,
					       [(candidate)-[:HAS_INSTANCE*0..1]->(subjectNode)-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]->(:HubReference)-[:HAS_CEDS_PROPERTY]->(cedsProperty) |
					         { relation: type(matchEdge), name: cedsProperty.name, source: cedsProperty._source, mappingConfidence: matchEdge.mappingConfidence, mappingKind: matchEdge.mappingKind, mappingSource: matchEdge.mappingSource }] AS towardHubList,
					       [(candidate)<-[:HAS_CEDS_PROPERTY]-(:HubReference)<-[matchEdge:${MATCH_EDGE_TYPE_TEXT}]-(subjectNode) |
					         { relation: type(matchEdge), name: coalesce(head([(ownerNode)-[:HAS_INSTANCE]->(subjectNode) | ownerNode.name]), subjectNode.name), source: subjectNode._source, mappingConfidence: matchEdge.mappingConfidence, mappingKind: matchEdge.mappingKind, mappingSource: matchEdge.mappingSource }] AS fromStandardList
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
				const groupText = [oneJudgment.relation, oneJudgment.source, oneJudgment.name, oneJudgment.mappingKind, oneJudgment.mappingSource].join('\u0000');
				const existingSummary = summaryByGroupText[groupText];
				if (existingSummary) {
					existingSummary.edgeCount += 1;
					existingSummary.mappingConfidence = Math.max(existingSummary.mappingConfidence, oneJudgment.mappingConfidence);
					return;
				}
				summaryByGroupText[groupText] = { relation: oneJudgment.relation, name: oneJudgment.name, source: oneJudgment.source, mappingConfidence: oneJudgment.mappingConfidence, mappingKind: oneJudgment.mappingKind, mappingSource: oneJudgment.mappingSource, edgeCount: 1 };
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
				relevanceScore: oneRecord.relevanceScore,
				related: summarizeJudgmentList((oneRecord.towardHubList || []).concat(oneRecord.fromStandardList || [])),
			}));

		return { getCypher, mapEquivalentRows, requiredLabelList };
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
