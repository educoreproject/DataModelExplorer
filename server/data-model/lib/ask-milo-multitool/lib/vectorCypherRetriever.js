'use strict';

// vectorCypherRetriever.js — Shared retrieval engine for VectorCypherRetriever pattern
//
// Chains vector similarity search with Cypher graph traversal:
//   1. Embed query via Voyage AI
//   2. Load traversal.cypher (or generate dynamically)
//   3. Execute against Neo4j
//   4. Return enriched results with graph context
//
// Implements fallback chain: dynamic -> static -> flat hybrid search

const fs = require('fs');
const https = require('https');

// =====================================================================
// VOYAGE AI EMBEDDING
// =====================================================================

const embedQuery = (text, apiKey) => new Promise((resolve, reject) => {
	const body = JSON.stringify({
		model: 'voyage-3',
		input: [text],
		input_type: 'query',
	});

	const req = https.request({
		hostname: 'api.voyageai.com',
		path: '/v1/embeddings',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`,
		},
	}, (res) => {
		let data = '';
		res.on('data', chunk => data += chunk);
		res.on('end', () => {
			if (res.statusCode !== 200) {
				reject(new Error(`Voyage API ${res.statusCode}: ${data}`));
				return;
			}
			resolve(JSON.parse(data).data[0].embedding);
		});
	});
	req.on('error', reject);
	req.write(body);
	req.end();
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

const flatHybridSearch = async ({ neo4jSession, queryText, voyageApiKey, limit, searchMode, schemaFilePath }) => {
	const neo4j = require('neo4j-driver');

	let schema = null;
	if (schemaFilePath && fs.existsSync(schemaFilePath)) {
		schema = JSON.parse(fs.readFileSync(schemaFilePath, 'utf8'));
	}

	const results = new Map();
	const limitInt = neo4j.int(limit);

	// BM25 fulltext search
	if (searchMode !== 'vector' && schema) {
		for (const ftIdx of schema.fulltextIndexes) {
			try {
				const ftResult = await neo4jSession.run(`
					CALL db.index.fulltext.queryNodes($idxName, $query) YIELD node, score
					RETURN node, labels(node) AS labels, score AS ftScore LIMIT $limit
				`, { idxName: ftIdx.name, query: queryText, limit: limitInt });

				for (const rec of ftResult.records) {
					const node = rec.get('node');
					const id = node.identity.toString();
					if (results.has(id)) {
						results.get(id).ftScore = Math.max(results.get(id).ftScore, toNumber(rec.get('ftScore')));
					} else {
						results.set(id, {
							node: serializeNeo4jValue(node.properties),
							labels: rec.get('labels'),
							vecScore: 0,
							ftScore: toNumber(rec.get('ftScore')),
						});
					}
				}
			} catch (err) {
				process.stderr.write(`[vectorCypherRetriever] BM25 error (${ftIdx.name}): ${err.message}\n`);
			}
		}
	}

	// Vector search
	if (searchMode !== 'bm25' && voyageApiKey && schema) {
		const queryEmbedding = await embedQuery(queryText, voyageApiKey);

		for (const vecIdx of schema.vectorIndexes) {
			try {
				const vecResult = await neo4jSession.run(`
					CALL db.index.vector.queryNodes($idxName, $limit, $embedding) YIELD node, score
					RETURN node, labels(node) AS labels, score AS vecScore
				`, { idxName: vecIdx.name, limit: limitInt, embedding: queryEmbedding });

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
				process.stderr.write(`[vectorCypherRetriever] Vector error (${vecIdx.name}): ${err.message}\n`);
			}
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

const staticTraversal = async ({ neo4jSession, queryText, voyageApiKey, traversalFilePath, limit, searchMode }) => {
	const neo4j = require('neo4j-driver');

	if (!traversalFilePath || !fs.existsSync(traversalFilePath)) {
		return null; // Trigger fallback
	}

	const cypher = fs.readFileSync(traversalFilePath, 'utf8');

	// Embed query
	const embedding = await embedQuery(queryText, voyageApiKey);

	// Execute the complete traversal query
	const result = await neo4jSession.run(cypher, {
		embedding,
		limit: neo4j.int(limit),
		query: queryText,
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
	voyageApiKey,
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
				voyageApiKey,
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
				voyageApiKey,
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
