'use strict';

// graphEmbeddingContract.js — the check every vector-reading verb (search, graphRetriever) makes BEFORE it embeds a query
// (campaign P2, W-A-9 / V2-C28; ruling VIOLET_VALLEY 2026-10-06: strict — no allowance for a passport that cannot answer).
// It reads the passport through passportReader and refuses BY NAME when:
//   passportAbsent / passportShapeNotRecognised / graphContractMismatch — passportReader's own refusals (a graph finished
//       before the graph contract cannot say what model its vectors are)
//   graphHasNoVectors        — the passport declares embeddingBasis (a --vectorize=false build): there is nothing to search
//   embedderMismatch         — the passport's embeddingModelVersion x embeddingDims is not the DME's QUERY_EMBEDDER_CONTRACT
//   vectorIndexNotInPassport — the :ForgedNode(embedding) VECTOR index the graph holds is not one the passport names (it was
//                              created or renamed outside the build)
//
//   checkGraphEmbeddingContract({ session, verbName }, callback(err, { refusal } | { vectorIndexName }))

const { runCypherQuery } = require('./runCypherQuery');
const { refusalFor } = require('./toolPayloadContract');
const { readPassport } = require('./passportReader');
const { QUERY_EMBEDDER_CONTRACT } = require('./queryEmbedderContract');

const VECTOR_INDEX_CYPHER = 'SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties';

const checkGraphEmbeddingContract = ({ session, verbName }, callback) => {
	readPassport({ session, verbName }, (passportError, passportRead) => {
		if (passportError) {
			callback(passportError);
			return;
		}
		if (passportRead.refusal) {
			callback('', { refusal: passportRead.refusal });
			return;
		}
		const { passport } = passportRead;
		if (passport.embeddingBasis) {
			callback('', { refusal: refusalFor(verbName, 'graphHasNoVectors', `this graph carries no vectors (passport: ${passport.embeddingBasis}) — vector search cannot run on it`) });
			return;
		}
		if (passport.embeddingModelVersion !== QUERY_EMBEDDER_CONTRACT.model || passport.embeddingDims !== QUERY_EMBEDDER_CONTRACT.dimension) {
			callback('', { refusal: refusalFor(verbName, 'embedderMismatch', `the graph's passport declares embeddingModelVersion '${passport.embeddingModelVersion}' x ${passport.embeddingDims}; this reader embeds queries with '${QUERY_EMBEDDER_CONTRACT.model}' x ${QUERY_EMBEDDER_CONTRACT.dimension} — a query vector from another model cannot be compared with the graph's`) });
			return;
		}
		runCypherQuery(session, VECTOR_INDEX_CYPHER, {}, (indexError, indexResult) => {
			if (indexError) {
				callback(`listing the graph's indexes failed: ${indexError}`);
				return;
			}
			const discoveredNameList = indexResult.records
				.filter((oneRecord) => oneRecord.get('type') === 'VECTOR' && oneRecord.get('entityType') === 'NODE' && (oneRecord.get('labelsOrTypes') || []).includes('ForgedNode') && (oneRecord.get('properties') || []).includes('embedding'))
				.map((oneRecord) => oneRecord.get('name'));
			const unnamedList = discoveredNameList.filter((oneName) => passport.vectorIndexNameList.indexOf(oneName) === -1);
			if (discoveredNameList.length !== 1 || unnamedList.length) {
				callback('', { refusal: refusalFor(verbName, 'vectorIndexNotInPassport', `the graph's VECTOR index(es) on :ForgedNode(embedding) [${discoveredNameList.join(', ') || 'none'}] are not exactly one index the passport names (${passport.vectorIndexNameList.join(', ')}) — the index was created or renamed outside the build`) });
				return;
			}
			callback('', { vectorIndexName: discoveredNameList[0] });
		});
	});
};

module.exports = { checkGraphEmbeddingContract, VECTOR_INDEX_CYPHER };
