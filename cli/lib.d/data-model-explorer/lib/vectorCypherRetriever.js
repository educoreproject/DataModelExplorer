'use strict';

// vectorCypherRetriever.js — Shared retrieval engine for VectorCypherRetriever pattern
//
// Chains vector similarity search with Cypher graph traversal:
//   1. Embed query via embedder object (provider-agnostic)
//   2. Load traversal.cypher (or generate dynamically)
//   3. Execute against Neo4j
//   4. Return enriched results with graph context
//
// Implements fallback chain: dynamic -> static -> flat hybrid search
//
// The embedder object is created by embeddingClient.create() and passed in.
// It provides embed(texts, callback), dimension, batchSize, and metadata().

const fs = require('fs');

// =====================================================================
// EMBEDDING (via embedder object)
// =====================================================================

const embedQuery = (text, embedder) => new Promise((resolve, reject) => {
	embedder.embed([text], (err, embeddings) => {
		if (err) { reject(new Error(`Embedding failed: ${err}`)); return; }
		resolve(embeddings[0]);
	});
});

// =====================================================================
// RESULT SERIALIZATION
// =====================================================================

const toNumber = (val) => {
	if (val === null || val === undefined) return 0;
	if (typeof val === 'number') return val;
	if (typeof val.toNumber === 'function') return val.toNumber();
	return Number(val);
};

// =====================================================================
// VECTOR INDEX DISCOVERY
// =====================================================================
//
// The builder names the vector index <graphName>_vector (replay-engine
// contract), so the name changes on every rebuild. It is discovered live
// from SHOW INDEXES, cached per process, never hardcoded.

let discoveredVectorIndex = null;

const resolveVectorIndex = async (neo4jSession) => {
	if (discoveredVectorIndex) return discoveredVectorIndex;
	const result = await neo4jSession.run(
		'SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties'
	);
	const candidates = result.records
		.map(rec => ({
			name: rec.get('name'),
			type: rec.get('type'),
			entityType: rec.get('entityType'),
			labels: rec.get('labelsOrTypes') || [],
			properties: rec.get('properties') || [],
		}))
		.filter(row =>
			row.type === 'VECTOR' && row.entityType === 'NODE' &&
			row.labels.includes('ForgedNode') && row.properties.includes('embedding')
		);
	if (candidates.length === 0) {
		throw new Error('No VECTOR index on :ForgedNode(embedding) exists on this graph — vector search cannot run.');
	}
	if (candidates.length > 1) {
		throw new Error(`Ambiguous VECTOR indexes on :ForgedNode(embedding): ${candidates.map(row => row.name).join(', ')} — cannot choose safely.`);
	}
	discoveredVectorIndex = candidates[0].name;
	return discoveredVectorIndex;
};

const serializeNeo4jValue = (val) => {
	if (val === null || val === undefined) return null;
	if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;
	if (typeof val.toNumber === 'function') return val.toNumber();
	if (Array.isArray(val)) return val.map(serializeNeo4jValue);
	if (val.properties) return serializeNeo4jValue(val.properties);
	if (typeof val === 'object') {
		const result = {};
		for (const [k, v] of Object.entries(val)) {
			if (k === 'embedding') continue; // Skip large embedding arrays
			result[k] = serializeNeo4jValue(v);
		}
		return result;
	}
	return val;
};

// =====================================================================
// FLAT HYBRID SEARCH (fallback)
// =====================================================================

const flatHybridSearch = async ({ neo4jSession, queryText, embedder, limit, searchMode, schemaFilePath }) => {
	const neo4j = require('neo4j-driver');

	let schema = null;
	if (schemaFilePath && fs.existsSync(schemaFilePath)) {
		schema = JSON.parse(fs.readFileSync(schemaFilePath, 'utf8'));
	}

	const results = new Map();
	const limitInt = neo4j.int(limit);

	// The forge graph carries ONE vector index on :ForgedNode(embedding) and no
	// fulltext index. There is no BM25 leg: search is a single vector query over
	// the unified index. The index name is discovered live (SHOW INDEXES) — the
	// stale schema-summary name is not trusted.
	const goldenVectorIndexName = await resolveVectorIndex(neo4jSession);

	// Vector search (single unified vector index)
	if (searchMode !== 'bm25' && embedder) {
		const queryEmbedding = await embedQuery(queryText, embedder);

		try {
			const vecResult = await neo4jSession.run(`
				CALL db.index.vector.queryNodes($idxName, $limit, $embedding) YIELD node, score
				RETURN node, labels(node) AS labels, score AS vecScore
			`, { idxName: goldenVectorIndexName, limit: limitInt, embedding: queryEmbedding });

			for (const rec of vecResult.records) {
				const node = rec.get('node');
				const id = node.identity.toString();
				if (results.has(id)) {
					results.get(id).vecScore = Math.max(results.get(id).vecScore, toNumber(rec.get('vecScore')));
				} else {
					results.set(id, {
						node: serializeNeo4jValue(node.properties),
						labels: rec.get('labels'),
						vecScore: toNumber(rec.get('vecScore')),
						ftScore: 0,
					});
				}
			}
		} catch (err) {
			process.stderr.write(`[vectorCypherRetriever] Vector error (${goldenVectorIndexName}): ${err.message}\n`);
		}
	}

	// Rank
	const ranked = [...results.values()]
		.map(r => ({
			...r,
			combinedScore: (r.ftScore > 0 ? 0.5 : 0) + (r.vecScore > 0 ? r.vecScore * 0.5 : 0),
			_fallback: 'flat',
		}))
		.sort((a, b) => b.combinedScore - a.combinedScore)
		.slice(0, limit);

	return ranked;
};

// =====================================================================
// STATIC TRAVERSAL (read and execute traversal.cypher)
// =====================================================================

const staticTraversal = async ({ neo4jSession, queryText, embedder, traversalFilePath, limit, searchMode }) => {
	const neo4j = require('neo4j-driver');

	if (!traversalFilePath || !fs.existsSync(traversalFilePath)) {
		return null; // Trigger fallback
	}

	const cypher = fs.readFileSync(traversalFilePath, 'utf8');

	// Embed query
	const embedding = await embedQuery(queryText, embedder);

	// The traversal takes the vector index name as $indexName (discovered live)
	const indexName = await resolveVectorIndex(neo4jSession);

	// Execute the complete traversal query
	const result = await neo4jSession.run(cypher, {
		embedding,
		limit: neo4j.int(limit),
		query: queryText,
		indexName,
	});

	// Serialize results
	return result.records.map(rec => {
		const obj = {};
		for (const key of rec.keys) {
			obj[key] = serializeNeo4jValue(rec.get(key));
		}
		return obj;
	});
};

// =====================================================================
// MAIN ENTRY POINT
// =====================================================================

const retrieve = async ({
	neo4jSession,
	queryText,
	embedder,
	traversalFilePath,
	schemaFilePath,
	limit = 10,
	traversalMode = 'static',
	searchMode = 'hybrid',
}) => {
	// Fallback chain: dynamic -> static -> flat
	let results = null;
	let mode = traversalMode;

	// Dynamic mode: TODO — stub for now, fall through to static
	if (mode === 'dynamic') {
		process.stderr.write('[vectorCypherRetriever] Dynamic mode not yet implemented. Falling back to static.\n');
		mode = 'static';
	}

	// Static mode
	if (mode === 'static') {
		try {
			results = await staticTraversal({
				neo4jSession,
				queryText,
				embedder,
				traversalFilePath,
				limit,
				searchMode,
			});
		} catch (err) {
			process.stderr.write(`[vectorCypherRetriever] Static traversal failed: ${err.message}. Falling back to flat.\n`);
			results = null;
		}
	}

	// Flat fallback
	if (!results) {
		process.stderr.write('[vectorCypherRetriever] Using flat hybrid search (no traversal).\n');
		try {
			results = await flatHybridSearch({
				neo4jSession,
				queryText,
				embedder,
				limit,
				searchMode,
				schemaFilePath,
			});
		} catch (err) {
			process.stderr.write(`[vectorCypherRetriever] Flat search also failed: ${err.message}\n`);
			results = [];
		}
	}

	return results;
};

module.exports = { retrieve, embedQuery };
