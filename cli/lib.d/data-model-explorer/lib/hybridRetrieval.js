'use strict';

// hybridRetrieval.js — the search's two legs and their fusion (lane BM25, 2026-10-10; TQ: "No BM25/fulltext is a bug").
// dme_search and graphRetriever both rank nodes through here, so the two verbs can never disagree about what a search found.
//
//   keyword leg — BM25 over the graph's ONE fulltext index (graph-contract §10b, read from contract/graphContract.json:
//                 :ForgedNode over name and description). The query is LITERAL text: every Lucene operator character is
//                 escaped, so 'Person/BirthDate' or 'x:y' is searched for, never parsed. It asks for nodes holding EVERY
//                 word of the query (AND; the analyzer drops a stop word's clause, so 'Date of Birth' = date AND birth).
//                 MEASURED (DEVLOG-BM25, 55 questions): with OR, a paraphrase's common words filled the keyword leg with
//                 unrelated nodes and fusion pushed the right node down (RRF: paraphrase MRR 0.47 vector -> 0.32 fused);
//                 with AND the keyword leg is empty or exact for a paraphrase, and fusion equals vector there exactly,
//                 while exact-term hit@1 rises 25 -> 33 of 35. The leg is held to the nodes the vector leg can return (the
//                 declared searchedVectorSlotPropertyName is present), so the two legs rank one population.
//   vector leg  — cosine over the :ForgedNode(embedding) vector index the passport names (graphEmbeddingContract).
//   fusion      — reciprocal rank fusion: fusedScore = sum over the legs that found the node of 1 / (rrfConstant + rank),
//                 rank 1-based within that leg AFTER the standard filter. Ranks, not scores, are fused: a BM25 score is
//                 unbounded and query-relative, a cosine is bounded, and neither is a probability (DEVLOG-BM25: the
//                 incumbent's 0.4·bm25/max + 0.6·cos/max was measured against this on the benchmark).
// Every fused row carries its provenance: foundByLegList, and each leg's rank and raw score (null when that leg did not
// find it), so a reader can always say which leg found a node and how.
//
//   searchLegListFor(searchMode) -> leg list | null (pure)
//   escapeLuceneQueryText(queryText) -> text (pure)
//   keywordQueryTextFor(queryText) -> the Lucene query the keyword leg runs: each word escaped, joined with AND (pure)
//   fuseRankedLegs({ legRowListByName, rrfConstant }) -> fused rows (pure)
//   checkFulltextIndex({ session, verbName }, callback(err, { fulltextIndexName } | { refusal }))
//   resolveSearchIndexes({ session, verbName, searchMode }, callback(err, { vectorIndexName?, fulltextIndexName? } | { refusal }))
//       the checks the mode's legs need, before anything is embedded: a vector leg needs graphEmbeddingContract (passport,
//       embedder, the passport-named vector index), a keyword leg needs checkFulltextIndex; a keyword-only mode still has
//       its passport read (passportReader's refusals), so no mode runs on a graph of another contract
//   runSearchLegs({ session, queryText, embedder, searchMode, legWindowSize, sourceList, vectorIndexName, fulltextIndexName }, callback(err, { legRowListByName }))
//   searchAndFuse(same specification, callback(err, { legRowListByName, fusedRowList, legHitCountByName }))
//
// Async style: callback(errString, result); neo4j-driver promises are met only in ./runCypherQuery.

const neo4j = require('neo4j-driver');
const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
const { runCypherQuery } = require('./runCypherQuery');
const { contract } = require('./graphContract');
const { refusalFor, SEARCH_MODE_LEG_LIST_BY_NAME, SEARCH_RRF_CONSTANT } = require('./toolPayloadContract');
const { checkGraphEmbeddingContract } = require('./graphEmbeddingContract');
const { readPassport } = require('./passportReader');
// ⟪lane DES, 2026-10-12⟫ a LAYER node is out of search by declaration (design Q3), not merely by carrying no vector today
const { notLayerNodeText } = require('./layerScope');

const FULLTEXT_INDEX_DECLARATION = contract.fulltextIndexDeclaration;
if (!FULLTEXT_INDEX_DECLARATION || !Array.isArray(FULLTEXT_INDEX_DECLARATION.propertyNameList)) {
	throw new Error('hybridRetrieval: contract/graphContract.json declares no fulltextIndexDeclaration (graph-contract §10b) — re-emit it from educoreForge');
}

// the row both legs return for a node: the fields the search has always shown, read the same way by both legs
const NODE_ROW_FIELD_TEXT = 'standard: node._source, id: node._id, stableId: node.stableId, role: node.role, labels: labels(node), name: node.name, description: node.description';

const KEYWORD_LEG_CYPHER = `
	CALL db.index.fulltext.queryNodes($fulltextIndexName, $luceneQueryText) YIELD node, score
	WITH node, score
	WHERE node[$searchedVectorSlotPropertyName] IS NOT NULL AND ${notLayerNodeText('node')} AND ($sourceList IS NULL OR node._source IN $sourceList)
	WITH node, score ORDER BY score DESC, node.stableId LIMIT $legWindowSize
	RETURN collect({ ${NODE_ROW_FIELD_TEXT}, legScore: score }) AS rowList`;
const VECTOR_LEG_CYPHER = `
	CALL db.index.vector.queryNodes($vectorIndexName, $legWindowSize, $embedding) YIELD node, score
	WITH node, score
	WHERE ${notLayerNodeText('node')} AND ($sourceList IS NULL OR node._source IN $sourceList)
	WITH node, score ORDER BY score DESC, node.stableId
	RETURN collect({ ${NODE_ROW_FIELD_TEXT}, legScore: score }) AS rowList`;
const FULLTEXT_INDEX_CYPHER = "SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties, options WHERE type = 'FULLTEXT' RETURN name, entityType, labelsOrTypes, properties, options.indexConfig.`fulltext.analyzer` AS analyzer";

// the Lucene query syntax characters (classic QueryParser), each escaped with a backslash; && and || are covered by & and |
const LUCENE_SPECIAL_CHARACTER_PATTERN = /[+\-!(){}[\]^"~*?:\\/&|]/g;
const escapeLuceneQueryText = (queryText) => `${queryText}`.replace(LUCENE_SPECIAL_CHARACTER_PATTERN, (specialCharacter) => `\\${specialCharacter}`);
// a word spelled AND / OR / NOT would be read as an operator; lower-cased it is the word itself (the analyzer lower-cases
// every word anyway, and those three are stop words, so its clause drops like any other stop word's)
const LUCENE_OPERATOR_WORD_PATTERN = /^(AND|OR|NOT)$/;
const keywordQueryTextFor = (queryText) =>
	`${queryText}`
		.split(/\s+/)
		.filter((oneWord) => oneWord !== '')
		.map((oneWord) => (LUCENE_OPERATOR_WORD_PATTERN.test(oneWord) ? oneWord.toLowerCase() : escapeLuceneQueryText(oneWord)))
		.join(' AND ');

const searchLegListFor = (searchMode) => (Object.prototype.hasOwnProperty.call(SEARCH_MODE_LEG_LIST_BY_NAME, searchMode) ? SEARCH_MODE_LEG_LIST_BY_NAME[searchMode] : null);

const plainNumberOf = (candidate) => (candidate && typeof candidate.toNumber === 'function' ? candidate.toNumber() : candidate);

// fuseRankedLegs — each leg's rows arrive best first; a node is identified by stableId (unique on :ForgedNode). Ties in
// fusedScore go to the better single-leg rank, then to stableId, so the order is total and repeatable.
const fuseRankedLegs = ({ legRowListByName, rrfConstant }) => {
	if (!Number.isFinite(rrfConstant) || rrfConstant < 0) {
		throw new Error(`hybridRetrieval.fuseRankedLegs: rrfConstant must be a non-negative number; got ${rrfConstant}`);
	}
	const fusedRowByStableId = {};
	Object.keys(legRowListByName).forEach((legName) => {
		legRowListByName[legName].forEach((legRow, rowIndex) => {
			const legRank = rowIndex + 1;
			const { legScore, ...nodeFields } = legRow;
			const fusedRow = fusedRowByStableId[legRow.stableId] || (fusedRowByStableId[legRow.stableId] = { ...nodeFields, fusedScore: 0, foundByLegList: [], keywordRank: null, keywordScore: null, vectorRank: null, vectorScore: null });
			fusedRow.fusedScore += 1 / (rrfConstant + legRank);
			fusedRow.foundByLegList.push(legName);
			fusedRow[`${legName}Rank`] = legRank;
			fusedRow[`${legName}Score`] = plainNumberOf(legScore);
		});
	});
	const bestLegRankOf = (fusedRow) => Math.min(...[fusedRow.keywordRank, fusedRow.vectorRank].filter((oneRank) => oneRank !== null));
	return Object.values(fusedRowByStableId)
		.map((fusedRow) => ({ ...fusedRow, foundByLegList: fusedRow.foundByLegList.slice().sort() }))
		.sort((rowA, rowB) => rowB.fusedScore - rowA.fusedScore || bestLegRankOf(rowA) - bestLegRankOf(rowB) || (rowA.stableId < rowB.stableId ? -1 : rowA.stableId > rowB.stableId ? 1 : 0));
};

// checkFulltextIndex — the graph's FULLTEXT indexes against the contract's declaration: exactly one, on the declared label,
// over the declared properties, with the declared analyzer. Anything else refuses by name (fulltextIndexAbsent): a graph
// built before lane BM25 has none, and a keyword search on it must say so, not answer with vector rows.
const declaredIndexText = `:${FULLTEXT_INDEX_DECLARATION.label}(${FULLTEXT_INDEX_DECLARATION.propertyNameList.join(', ')}) analyzer ${FULLTEXT_INDEX_DECLARATION.analyzer}`;
const checkFulltextIndex = ({ session, verbName }, callback) => {
	runCypherQuery(session, FULLTEXT_INDEX_CYPHER, {}, (indexError, indexResult) => {
		if (indexError) {
			callback(`listing the graph's fulltext indexes failed: ${indexError}`);
			return;
		}
		const indexRowList = indexResult.records.map((oneRecord) => ({ name: oneRecord.get('name'), indexText: `:${(oneRecord.get('labelsOrTypes') || []).join(':')}(${(oneRecord.get('properties') || []).join(', ')}) analyzer ${oneRecord.get('analyzer')}` }));
		const declaredRowList = indexRowList.filter((oneRow) => oneRow.indexText === declaredIndexText && oneRow.name.endsWith(FULLTEXT_INDEX_DECLARATION.indexNameSuffix));
		if (indexRowList.length !== 1 || declaredRowList.length !== 1) {
			callback('', { refusal: refusalFor(verbName, 'fulltextIndexAbsent', `this graph does not carry exactly one fulltext index ${declaredIndexText} named <graph>${FULLTEXT_INDEX_DECLARATION.indexNameSuffix} (graph-contract §10b; found: ${indexRowList.map((oneRow) => `${oneRow.name} ${oneRow.indexText}`).join('; ') || 'none'}) — the keyword (BM25) leg cannot run on it; searchMode 'vector' can`, Object.keys(SEARCH_MODE_LEG_LIST_BY_NAME)) });
			return;
		}
		callback('', { fulltextIndexName: declaredRowList[0].name });
	});
};

// The Voyage query embedder is not deterministic: the same text comes back as one of two vectors about 0.001 apart (measured
// 2026-10-23, lane zbE), enough to swap near-tied rows between two identical asks. So the FIRST vector a query text gets is
// kept and reused for that text for the life of the process, and identical asks rank identically. One map serves every
// embedder because the reader has exactly one query-embedder declaration (queryEmbedderContract.js). Bounded: the oldest
// text is dropped past QUERY_EMBEDDING_CACHE_SIZE.
const QUERY_EMBEDDING_CACHE_SIZE = 1000;
const queryEmbeddingByText = new Map();

const embedQueryText = (queryText, embedder, callback) => {
	if (queryEmbeddingByText.has(queryText)) {
		callback('', queryEmbeddingByText.get(queryText));
		return;
	}
	embedder.embed([queryText], (embedderError, embeddingList) => {
		if (embedderError) {
			callback(`Embedding the query failed: ${embedderError}`);
			return;
		}
		if (queryEmbeddingByText.size >= QUERY_EMBEDDING_CACHE_SIZE) {
			queryEmbeddingByText.delete(queryEmbeddingByText.keys().next().value);
		}
		queryEmbeddingByText.set(queryText, embeddingList[0]);
		callback('', embeddingList[0]);
	});
};

// LEG_RUNNER_BY_NAME — one runner per leg; runSearchLegs runs the ones the mode names, in that order. THE LEG INTERFACE
// (every runner, and any leg added later): runner(searchSpecification, callback(errorText, rowList)) where rowList is best
// first, one row per node, each { standard, id, stableId, role, labels, name, description, legScore }; a leg's failure is
// errorText naming the leg and its index, never an empty list. A new leg also needs its INDEX_CHECK_BY_LEG row and its
// <leg>Rank / <leg>Score fields in fuseRankedLegs' row and SEARCH_SCORE_UNIT_BY_FIELD.
const LEG_RUNNER_BY_NAME = Object.freeze({
	keyword: ({ session, queryText, legWindowSize, sourceList, fulltextIndexName }, callback) => {
		runCypherQuery(session, KEYWORD_LEG_CYPHER, {
			fulltextIndexName,
			luceneQueryText: keywordQueryTextFor(queryText),
			searchedVectorSlotPropertyName: FULLTEXT_INDEX_DECLARATION.searchedVectorSlotPropertyName,
			sourceList,
			legWindowSize: neo4j.int(legWindowSize),
		}, (queryError, queryResult) => (queryError ? callback(`the keyword (BM25) leg failed on ${fulltextIndexName}: ${queryError}`) : callback('', queryResult.records[0].get('rowList'))));
	},
	vector: ({ session, queryText, embedder, legWindowSize, sourceList, vectorIndexName }, callback) => {
		embedQueryText(queryText, embedder, (embedError, embedding) => {
			if (embedError) {
				callback(embedError);
				return;
			}
			runCypherQuery(session, VECTOR_LEG_CYPHER, { vectorIndexName, legWindowSize: neo4j.int(legWindowSize), embedding, sourceList }, (queryError, queryResult) =>
				queryError ? callback(`the vector leg failed on ${vectorIndexName}: ${queryError}`) : callback('', queryResult.records[0].get('rowList')));
		});
	},
});

const runSearchLegs = (searchSpecification, callback) => {
	const legNameList = searchLegListFor(searchSpecification.searchMode);
	if (!legNameList) {
		callback(`hybridRetrieval.runSearchLegs: searchMode '${searchSpecification.searchMode}' is not one of ${Object.keys(SEARCH_MODE_LEG_LIST_BY_NAME).join(', ')}`);
		return;
	}
	const taskList = new taskListPlus();
	legNameList.forEach((legName) => {
		taskList.push((args, next) => {
			LEG_RUNNER_BY_NAME[legName](searchSpecification, (legError, legRowList) => (legError ? next(legError, args) : next('', { ...args, legRowListByName: { ...args.legRowListByName, [legName]: legRowList } })));
		});
	});
	pipeRunner(taskList.getList(), { legRowListByName: {} }, (err, args) => (err ? callback(err) : callback('', { legRowListByName: args.legRowListByName })));
};

// INDEX_CHECK_BY_LEG — what each leg needs proven about the graph, and the index name it hands the leg
const INDEX_CHECK_BY_LEG = Object.freeze({
	vector: ({ session, verbName }, callback) =>
		checkGraphEmbeddingContract({ session, verbName }, (contractError, contractVerdict) => (contractError ? callback(contractError) : callback('', contractVerdict.refusal ? { refusal: contractVerdict.refusal } : { vectorIndexName: contractVerdict.vectorIndexName }))),
	keyword: ({ session, verbName }, callback) =>
		readPassport({ session, verbName }, (passportError, passportRead) => {
			if (passportError) {
				callback(passportError);
				return;
			}
			if (passportRead.refusal) {
				callback('', { refusal: passportRead.refusal });
				return;
			}
			checkFulltextIndex({ session, verbName }, callback);
		}),
});

const resolveSearchIndexes = ({ session, verbName, searchMode }, callback) => {
	const legNameList = searchLegListFor(searchMode);
	if (!legNameList) {
		callback(`hybridRetrieval.resolveSearchIndexes: searchMode '${searchMode}' is not one of ${Object.keys(SEARCH_MODE_LEG_LIST_BY_NAME).join(', ')}`);
		return;
	}
	const taskList = new taskListPlus();
	legNameList.forEach((legName) => {
		taskList.push((args, next) => {
			if (args.refusal) {
				next('', args);
				return;
			}
			INDEX_CHECK_BY_LEG[legName]({ session, verbName }, (checkError, checkVerdict) => (checkError ? next(checkError, args) : next('', { ...args, ...checkVerdict })));
		});
	});
	pipeRunner(taskList.getList(), {}, (err, args) => (err ? callback(err) : callback('', args)));
};

const searchAndFuse = (searchSpecification, callback) => {
	runSearchLegs(searchSpecification, (legError, legResult) => {
		if (legError) {
			callback(legError);
			return;
		}
		const { legRowListByName } = legResult;
		callback('', {
			legRowListByName,
			fusedRowList: fuseRankedLegs({ legRowListByName, rrfConstant: SEARCH_RRF_CONSTANT }),
			legHitCountByName: Object.keys(legRowListByName).reduce((soFar, legName) => ({ ...soFar, [legName]: legRowListByName[legName].length }), {}),
		});
	});
};

module.exports = {
	resolveSearchIndexes,
	searchAndFuse, searchLegListFor, embedQueryText, escapeLuceneQueryText, keywordQueryTextFor, fuseRankedLegs, checkFulltextIndex, runSearchLegs, KEYWORD_LEG_CYPHER, VECTOR_LEG_CYPHER, FULLTEXT_INDEX_CYPHER, LUCENE_SPECIAL_CHARACTER_PATTERN };
