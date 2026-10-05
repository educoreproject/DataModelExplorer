'use strict';

// vectorCypherRetriever.js — Shared retrieval engine for VectorCypherRetriever pattern
//
// Chains vector similarity search with Cypher graph traversal:
//   1. Embed query via embedder object (provider-agnostic)
//   2. Read traversal.cypher
//   3. Execute against Neo4j
//   4. Return enriched results with graph context
//
// Ruling C (TQ, 2026-10-05). A real error — a Neo4j/query error, a missing or ambiguous vector index, an embedder
// failure, a traversal.cypher that exists but fails — reaches the callback BY NAME; it is never answered with a
// degraded result or with an empty list standing in for the failure. There is ONE alternative path: when no
// traversal file is configured or present, a flat vector search runs and the RESULT says so.
//
// retrieve(retrievalSpecification, callback) answers callback(errorText) or callback('', retrievedResult):
//   traversal ran  -> retrievedResult is the traversal's row list (one object per traversal.cypher record);
//   flat search    -> retrievedResult is { retrievalMode: 'flat', retrievalNote, resultCount, results }.
// The traversal shape is kept as the bare list so every answer that succeeded before ruling C is byte-identical.
//
// The embedder object is created by embeddingClient.create() and passed in.
// It provides embed(texts, callback), dimension, batchSize, and metadata().
// neo4j-driver promises are met only in ./runCypherQuery.

const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');
const { pipeRunner, taskListPlus, mergeArgs } = new (require('qtools-asynchronous-pipe-plus'))();
const { runCypherQuery } = require('./runCypherQuery');

// The graph carries ONE vector index on :ForgedNode(embedding) and no fulltext index, so every runnable searchMode
// runs that one vector query. 'bm25' (and anything else) is refused by name rather than answered with vector rows.
const RUNNABLE_SEARCH_MODE_LIST = ['hybrid', 'vector'];

// =====================================================================
// EMBEDDING (via embedder object)
// =====================================================================

const embedQuery = (queryText, embedder, callback) => {
	if (!embedder) {
		callback('No embedder configured — vector search cannot run. Check voyageApiKey in dataModelExplorerSearch.ini.');
		return;
	}
	embedder.embed([queryText], (embedderError, embeddingList) => {
		if (embedderError) {
			callback(`Embedding the query failed: ${embedderError}`);
			return;
		}
		callback('', embeddingList[0]);
	});
};

// =====================================================================
// RESULT SERIALIZATION
// =====================================================================

const serializeNeo4jValue = (val) => {
	if (val === null || val === undefined) return null;
	if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;
	if (typeof val.toNumber === 'function') return val.toNumber();
	if (Array.isArray(val)) return val.map(serializeNeo4jValue);
	if (val.properties) return serializeNeo4jValue(val.properties);
	if (typeof val === 'object') {
		const result = {};
		for (const [propertyName, propertyValue] of Object.entries(val)) {
			if (propertyName === 'embedding') continue; // Skip large embedding arrays
			result[propertyName] = serializeNeo4jValue(propertyValue);
		}
		return result;
	}
	return val;
};

// =====================================================================
// VECTOR INDEX DISCOVERY
// =====================================================================
//
// The builder names the vector index <graphName>_vector (replay-engine
// contract), so the name changes on every rebuild. It is discovered live
// from SHOW INDEXES, cached per process, never hardcoded.

let discoveredVectorIndex = null;

const resolveVectorIndex = (neo4jSession, callback) => {
	if (discoveredVectorIndex) {
		callback('', discoveredVectorIndex);
		return;
	}
	runCypherQuery(neo4jSession, 'SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties', {}, (queryError, queryResult) => {
		if (queryError) {
			callback(`Listing the graph's indexes failed: ${queryError}`);
			return;
		}
		const candidates = queryResult.records
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
			callback('No VECTOR index on :ForgedNode(embedding) exists on this graph — vector search cannot run.');
			return;
		}
		if (candidates.length > 1) {
			callback(`Ambiguous VECTOR indexes on :ForgedNode(embedding): ${candidates.map(row => row.name).join(', ')} — cannot choose safely.`);
			return;
		}
		discoveredVectorIndex = candidates[0].name;
		callback('', discoveredVectorIndex);
	});
};

// =====================================================================
// FLAT VECTOR SEARCH (the one alternative path: no traversal file)
// =====================================================================

const flatVectorSearch = ({ neo4jSession, queryText, embedder, limit, retrievalNote }, callback) => {
	const taskList = new taskListPlus();
	taskList.push((args, next) => embedQuery(queryText, embedder, mergeArgs(args, next, 'queryEmbedding')));
	taskList.push((args, next) => resolveVectorIndex(neo4jSession, mergeArgs(args, next, 'vectorIndexName')));
	taskList.push((args, next) => {
		runCypherQuery(neo4jSession, `
			CALL db.index.vector.queryNodes($idxName, $limit, $embedding) YIELD node, score
			RETURN node, labels(node) AS labels, score AS vecScore
		`, { idxName: args.vectorIndexName, limit: neo4j.int(limit), embedding: args.queryEmbedding }, (queryError, queryResult) => {
			if (queryError) {
				next(`Flat vector search failed (index ${args.vectorIndexName}): ${queryError}`, args);
				return;
			}
			next('', { ...args, vecResult: queryResult });
		});
	});

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(err);
			return;
		}
		const results = args.vecResult.records.map(rec => ({
			node: serializeNeo4jValue(rec.get('node').properties),
			labels: rec.get('labels'),
			vecScore: serializeNeo4jValue(rec.get('vecScore')),
		}));
		callback('', { retrievalMode: 'flat', retrievalNote, resultCount: results.length, results });
	});
};

// =====================================================================
// STATIC TRAVERSAL (read and execute traversal.cypher)
// =====================================================================

// instanceView (traversal.cypher): present only for SIF/PESC nodes with instances or structure.
const OMIT_WHEN_NULL_COLUMN_LIST = ['instanceView'];

const staticTraversal = ({ neo4jSession, queryText, embedder, traversalFilePath, limit }, callback) => {
	const traversalFileName = path.basename(traversalFilePath);

	const taskList = new taskListPlus();
	taskList.push((args, next) => {
		fs.readFile(traversalFilePath, 'utf8', (readError, traversalCypher) => {
			if (readError) {
				next(`Reading ${traversalFileName} failed: ${readError.message}`, args);
				return;
			}
			next('', { ...args, traversalCypher });
		});
	});
	taskList.push((args, next) => embedQuery(queryText, embedder, mergeArgs(args, next, 'queryEmbedding')));
	// The traversal takes the vector index name as $indexName (discovered live)
	taskList.push((args, next) => resolveVectorIndex(neo4jSession, mergeArgs(args, next, 'vectorIndexName')));
	taskList.push((args, next) => {
		runCypherQuery(neo4jSession, args.traversalCypher, {
			embedding: args.queryEmbedding,
			limit: neo4j.int(limit),
			query: queryText,
			indexName: args.vectorIndexName,
		}, (queryError, queryResult) => {
			if (queryError) {
				next(`${traversalFileName} failed: ${queryError}`, args);
				return;
			}
			next('', { ...args, traversalResult: queryResult });
		});
	});

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(err);
			return;
		}
		// A column named in OMIT_WHEN_NULL_COLUMN_LIST is left out when null, so a traversal column that only
		// some standards populate adds no property to the others' results.
		callback('', args.traversalResult.records.map(rec => {
			const obj = {};
			for (const columnName of rec.keys) {
				if (OMIT_WHEN_NULL_COLUMN_LIST.includes(columnName) && rec.get(columnName) === null) continue;
				obj[columnName] = serializeNeo4jValue(rec.get(columnName));
			}
			return obj;
		}));
	});
};

// =====================================================================
// MAIN ENTRY POINT
// =====================================================================

const retrieve = ({ neo4jSession, queryText, embedder, traversalFilePath, limit, searchMode }, callback) => {
	if (!Number.isInteger(limit) || limit < 1) {
		callback(`graphRetriever limit must be a positive integer; got ${limit}.`);
		return;
	}
	if (!RUNNABLE_SEARCH_MODE_LIST.includes(searchMode)) {
		callback(`graphRetriever searchMode '${searchMode}' cannot run: this graph carries only the vector index on :ForgedNode(embedding) and no fulltext index, so searchMode must be one of ${RUNNABLE_SEARCH_MODE_LIST.join(', ')} (both run that one vector search).`);
		return;
	}

	if (!traversalFilePath) {
		flatVectorSearch({ neo4jSession, queryText, embedder, limit, retrievalNote: 'no traversal file configured; flat vector search without graph traversal' }, callback);
		return;
	}
	if (!fs.existsSync(traversalFilePath)) {
		flatVectorSearch({ neo4jSession, queryText, embedder, limit, retrievalNote: `traversal file ${path.basename(traversalFilePath)} not present; flat vector search without graph traversal` }, callback);
		return;
	}
	staticTraversal({ neo4jSession, queryText, embedder, traversalFilePath, limit }, callback);
};

module.exports = { retrieve };
