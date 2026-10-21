'use strict';

// vectorCypherRetriever.js — the graph retriever's traversal step: the search hits, enriched with their graph context.
//
// ⟪lane BM25, 2026-10-10⟫ This module no longer searches. The hits arrive ranked by lib/hybridRetrieval.js (a keyword BM25
// leg and/or a vector leg, per searchMode, fused by reciprocal rank), and this module walks traversal.cypher from them:
//   1. Read traversal.cypher
//   2. Run it with $hitList — one row per hit, by stableId, carrying its rank, fused score and both legs' provenance
//   3. Return the rows, each still saying which leg found it and how
// (The file keeps its name, which every caller and gate requires; the vector search it was named for moved upstream.)
//
// Ruling C (TQ, 2026-10-05). A real error — a Neo4j/query error, a traversal.cypher that exists but fails — reaches the
// callback BY NAME; it is never answered with a degraded result or with an empty list standing in for the failure. There
// is ONE alternative path: when no traversal file is configured or present, the hits are returned as they are (flat, no
// graph context) and the RESULT says so.
//
// retrieve({ neo4jSession, hitList, traversalFilePath, traversalParameterByName }, callback) answers callback(errorText) or callback('', retrievedResult):
//   traversal ran  -> retrievedResult is { retrievalMode: 'traversal', requestedHitCount, returnedHitCount, hitList }, one
//                     hitList entry per traversal.cypher record (W-D-10, campaign P1: the bare list carried no count);
//   flat           -> retrievedResult is { retrievalMode: 'flat', retrievalNote, resultCount, results }.
//
// neo4j-driver promises are met only in ./runCypherQuery.

const fs = require('fs');
const path = require('path');
const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
const { runCypherQuery } = require('./runCypherQuery');

// the fields of a fused hit traversal.cypher receives and returns unchanged (lib/hybridRetrieval.js fuseRankedLegs)
const HIT_PROVENANCE_FIELD_LIST = Object.freeze(['stableId', 'hitRank', 'fusedScore', 'foundByLegList', 'keywordRank', 'keywordScore', 'vectorRank', 'vectorScore']);

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

// hitParameterListOf — the fused rows as traversal.cypher's $hitList: each hit's provenance and its 1-based rank, nothing else
const hitParameterListOf = (hitList) =>
	hitList.map((oneHit, hitIndex) => HIT_PROVENANCE_FIELD_LIST.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: fieldName === 'hitRank' ? hitIndex + 1 : oneHit[fieldName] === undefined ? null : oneHit[fieldName] }), {}));

// =====================================================================
// STATIC TRAVERSAL (read and execute traversal.cypher)
// =====================================================================

// instanceView (traversal.cypher): present only for SIF/PESC nodes with instances or structure.
const OMIT_WHEN_NULL_COLUMN_LIST = ['instanceView'];

// ⟪ctdlHub P7⟫ traversalParameterByName: the graph's own facts traversal.cypher reads beside $hitList (the hub slot edge
// types), named by the caller; it may not name hitList
const staticTraversal = ({ neo4jSession, hitList, traversalFilePath, traversalParameterByName }, callback) => {
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
	taskList.push((args, next) => {
		runCypherQuery(neo4jSession, args.traversalCypher, { ...traversalParameterByName, hitList: hitParameterListOf(hitList) }, (queryError, queryResult) => {
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
		const traversedHitList = args.traversalResult.records.map(rec => {
			const obj = {};
			for (const columnName of rec.keys) {
				if (OMIT_WHEN_NULL_COLUMN_LIST.includes(columnName) && rec.get(columnName) === null) continue;
				obj[columnName] = serializeNeo4jValue(rec.get(columnName));
			}
			return obj;
		});
		callback('', { retrievalMode: 'traversal', requestedHitCount: hitList.length, returnedHitCount: traversedHitList.length, hitList: traversedHitList });
	});
};

// =====================================================================
// MAIN ENTRY POINT
// =====================================================================

const flatResultOf = ({ hitList, retrievalNote }) => ({ retrievalMode: 'flat', retrievalNote, resultCount: hitList.length, results: hitList.map((oneHit, hitIndex) => ({ ...oneHit, hitRank: hitIndex + 1 })) });

const retrieve = ({ neo4jSession, hitList, traversalFilePath, traversalParameterByName }, callback) => {
	if (!Array.isArray(hitList)) {
		callback(`graphRetriever: hitList must be the search's fused hit list (an array); got ${typeof hitList}.`);
		return;
	}
	if (!traversalFilePath) {
		callback('', flatResultOf({ hitList, retrievalNote: 'no traversal file configured; the search hits without graph traversal' }));
		return;
	}
	if (!fs.existsSync(traversalFilePath)) {
		callback('', flatResultOf({ hitList, retrievalNote: `traversal file ${path.basename(traversalFilePath)} not present; the search hits without graph traversal` }));
		return;
	}
	// ⟪ctdlHub P7⟫ the traversal reads the graph's hubs; checked only where a traversal will run (the flat answers need none)
	if (!traversalParameterByName || typeof traversalParameterByName !== 'object' || 'hitList' in traversalParameterByName) {
		callback(`graphRetriever: traversalParameterByName must be the object of traversal.cypher's graph parameters (the hub slot edge types), never naming hitList; got ${JSON.stringify(traversalParameterByName)}.`);
		return;
	}
	staticTraversal({ neo4jSession, hitList, traversalFilePath, traversalParameterByName }, callback);
};

module.exports = { retrieve, HIT_PROVENANCE_FIELD_LIST };
