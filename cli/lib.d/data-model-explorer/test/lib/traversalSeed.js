'use strict';

// traversalSeed.js — lane BM25 (2026-10-10): traversal.cypher no longer searches; it walks from $hitList, the fused hits
// lib/hybridRetrieval.js ranks. The traversal gates seed it as they always did — a node's OWN embedding through the vector
// index, so the seed is hit first and nothing is embedded — and shape the rows with the DME's own fusion (a vector-only
// hit list), so the gate drives traversal.cypher with exactly the parameter the retriever passes.
//
//   runTraversalFromVectorSeed(runQuery, traversalText, { embedding, limit, indexName }, callback(err, rowList, rawRecordList))

const path = require('path');
const { fuseRankedLegs } = require(path.join(__dirname, '..', '..', 'lib', 'hybridRetrieval'));
const { SEARCH_RRF_CONSTANT } = require(path.join(__dirname, '..', '..', 'lib', 'toolPayloadContract'));
const { HIT_PROVENANCE_FIELD_LIST } = require(path.join(__dirname, '..', '..', 'lib', 'vectorCypherRetriever'));

const VECTOR_SEED_CYPHER = 'CALL db.index.vector.queryNodes($indexName, $limit, $embedding) YIELD node, score RETURN node.stableId AS stableId, score AS legScore ORDER BY legScore DESC, stableId';

const runTraversalFromVectorSeed = (runQuery, traversalText, { embedding, limit, indexName }, callback) => {
	runQuery(VECTOR_SEED_CYPHER, { embedding, limit, indexName }, (seedError, seedRowList) => {
		if (seedError) {
			callback(`the vector seed failed: ${seedError}`);
			return;
		}
		// a gate's runQuery answers plain rows (liveGraphHarness) or driver records (the older gates' own runner): read both
		const vectorRowList = seedRowList.map((oneRow) => (typeof oneRow.get === 'function' ? { stableId: oneRow.get('stableId'), legScore: oneRow.get('legScore') } : oneRow));
		const hitList = fuseRankedLegs({ legRowListByName: { vector: vectorRowList }, rrfConstant: SEARCH_RRF_CONSTANT })
			.map((oneHit, hitIndex) => HIT_PROVENANCE_FIELD_LIST.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: fieldName === 'hitRank' ? hitIndex + 1 : oneHit[fieldName] === undefined ? null : oneHit[fieldName] }), {}));
		runQuery(traversalText, { hitList }, callback);
	});
};

module.exports = { runTraversalFromVectorSeed, VECTOR_SEED_CYPHER };
