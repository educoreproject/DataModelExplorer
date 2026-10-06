#!/usr/bin/env node
'use strict';

// graph-retriever-refusals.test.js — ruling C (TQ, 2026-10-05) for lib/vectorCypherRetriever.js and -graphRetriever.
// A real error must reach the caller BY NAME — never a degraded result, never an empty list standing in for the
// failure. The one alternative path (no traversal file configured or present) runs a flat vector search and the
// RESULT says so (retrievalMode 'flat', retrievalNote). Each refusal below is asserted by its message, so a twin
// that answers with rows or [] instead fails.
//
// Live for the cases that need the graph (traversal that fails in Neo4j, flat-with-note, bm25, the success control);
// the others drive the retriever with a stub session or stub embedder. The live cases embed nothing: a recorded
// embedder serves the CEDS Birthdate property's OWN embedding, so no embedding service is called and nothing jitters.
//
//   node cli/lib.d/data-model-explorer/test/graph-retriever-refusals.test.js [dmeDirPath]
//
// dmeDirPath (default: this test's parent) is the directory holding dataModelExplorerSearch.js and lib/; pass a
// baseline copy's directory to watch the twins fail on code from before ruling C (its promise API is adapted below).

const fs = require('fs');
const os = require('os');
const path = require('path');
const dmeDirPath = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const retrieverModulePath = path.join(dmeDirPath, 'lib', 'vectorCypherRetriever.js');
const neo4j = require(path.join(dmeDirPath, 'node_modules', 'neo4j-driver'));
const configFileProcessor = require(path.join(dmeDirPath, 'node_modules', 'qtools-config-file-processor'));
const codeRootPath = path.join(dmeDirPath, '..', '..', '..');
const { resolveContainerConnection } = require(path.join(codeRootPath, 'server/data-model/lib/user-graph/container-connection-resolver'));
const { pipeRunner, taskListPlus } = new (require(path.join(dmeDirPath, '..', '..', 'node_modules', 'qtools-asynchronous-pipe-plus')))();

const hostName = os.hostname();
const configName = hostName === 'qMini.local' || hostName === 'qbook.local' ? 'instanceSpecific/qbook' : '';
const dmeConfig = configFileProcessor.getConfig('dataModelExplorerSearch.ini', path.join(codeRootPath, '..', 'configs', configName) + '/').dataModelExplorerSearch;
const connection = resolveContainerConnection(dmeConfig.goldenContainerName);
if (connection.error) { console.error(connection.error); process.exit(2); }

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};
const answerTextOf = (errorText, retrievedResult) => (errorText ? `error '${errorText}'` : `result ${JSON.stringify(retrievedResult).slice(0, 160)}`);

// A fresh module per case: the retriever caches the discovered vector index per process, and a stub index name
// cached by one case must not leak into the next. Code from before ruling C answered with a promise; it is adapted
// to callback(errorText, result) so its answer can be measured against the same assertions.
const retrieveFresh = (retrievalSpecification, callback) => {
	delete require.cache[require.resolve(retrieverModulePath)];
	const { retrieve } = require(retrieverModulePath);
	const promiseOrNothing = retrieve(retrievalSpecification, callback);
	if (promiseOrNothing && typeof promiseOrNothing.then === 'function') {
		promiseOrNothing.then((retrievedResult) => callback('', retrievedResult), (retrieveError) => callback(retrieveError.message));
	}
};

// ---- stubs -----------------------------------------------------------------------------------------------------
const stubRecordOf = (fieldByName) => ({ keys: Object.keys(fieldByName), get: (fieldName) => fieldByName[fieldName] });
const forgedNodeIndexRecordOf = (indexName) => stubRecordOf({ name: indexName, type: 'VECTOR', entityType: 'NODE', labelsOrTypes: ['ForgedNode'], properties: ['embedding'] });
const stubSessionOf = ({ showIndexesAnswer, otherQueryRejectionText }) => ({
	run: (cypherText) => {
		if (/SHOW INDEXES/.test(cypherText)) return showIndexesAnswer();
		return Promise.reject(new Error(otherQueryRejectionText));
	},
});
const oneForgedNodeIndex = () => Promise.resolve({ records: [forgedNodeIndexRecordOf('stubVectorIndex')] });
const stubEmbedderOf = (embedding) => ({ embed: (textList, callback) => callback('', [embedding]) });
const failingEmbedder = { embed: (textList, callback) => callback('stub embedder down') };

// ---- live ------------------------------------------------------------------------------------------------------
const driver = neo4j.driver(connection.boltUri, neo4j.auth.basic(connection.user, connection.password));
const liveSession = driver.session({ defaultAccessMode: neo4j.session.READ });
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'graphRetrieverRefusals-'));
const failingTraversalFilePath = path.join(scratchDirPath, 'failingTraversal.cypher');
fs.writeFileSync(failingTraversalFilePath, 'MATCH (n:ForgedNode RETURN n'); // a Cypher syntax error Neo4j rejects
const absentTraversalFilePath = path.join(scratchDirPath, 'absentTraversal.cypher');
const realTraversalFilePath = path.join(dmeDirPath, 'traversal.cypher');

console.log(`\n=== graph retriever refusals (ruling C) — ${dmeDirPath} ===\n`);
const taskList = new taskListPlus();

taskList.push((args, next) => {
	liveSession.run(`MATCH (n:ForgedNode {role: 'DmeProperty', _source: 'CEDS'}) WHERE n.name = 'Birthdate' AND n.embedding IS NOT NULL
		RETURN n.embedding AS embedding LIMIT 1`).then(
		(queryResult) => {
			if (!queryResult.records[0]) { next('CEDS Birthdate property with an embedding not found', args); return; }
			next('', { ...args, recordedEmbedder: stubEmbedderOf(queryResult.records[0].get('embedding')) });
		},
		(queryError) => next(`seed query failed: ${queryError.message}`, args),
	);
});

// Every case: [caseName, (args) => retrievalSpecification, (errorText, retrievedResult) => assertions]
const CASE_LIST = [
	['embedder failure is refused by name',
		(args) => ({ neo4jSession: stubSessionOf({ showIndexesAnswer: oneForgedNodeIndex, otherQueryRejectionText: 'unused' }), queryText: 'birth date', embedder: failingEmbedder, traversalFilePath: realTraversalFilePath, limit: 3, searchMode: 'hybrid' }),
		(errorText, retrievedResult) => assert('embedder failure → "Embedding the query failed: stub embedder down"', errorText === 'Embedding the query failed: stub embedder down', answerTextOf(errorText, retrievedResult))],
	['missing vector index is refused by name',
		(args) => ({ neo4jSession: stubSessionOf({ showIndexesAnswer: () => Promise.resolve({ records: [stubRecordOf({ name: 'otherIndex', type: 'RANGE', entityType: 'NODE', labelsOrTypes: ['ForgedNode'], properties: ['name'] })] }), otherQueryRejectionText: 'unused' }), queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: realTraversalFilePath, limit: 3, searchMode: 'hybrid' }),
		(errorText, retrievedResult) => assert('no :ForgedNode(embedding) VECTOR index → "No VECTOR index on :ForgedNode(embedding) exists…"', /^No VECTOR index on :ForgedNode\(embedding\) exists on this graph/.test(errorText || ''), answerTextOf(errorText, retrievedResult))],
	['ambiguous vector index is refused by name',
		(args) => ({ neo4jSession: stubSessionOf({ showIndexesAnswer: () => Promise.resolve({ records: [forgedNodeIndexRecordOf('indexA'), forgedNodeIndexRecordOf('indexB')] }), otherQueryRejectionText: 'unused' }), queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: realTraversalFilePath, limit: 3, searchMode: 'hybrid' }),
		(errorText, retrievedResult) => assert('two :ForgedNode(embedding) VECTOR indexes → "Ambiguous VECTOR indexes … indexA, indexB"', /^Ambiguous VECTOR indexes on :ForgedNode\(embedding\): indexA, indexB/.test(errorText || ''), answerTextOf(errorText, retrievedResult))],
	['index listing failure is refused by name',
		(args) => ({ neo4jSession: stubSessionOf({ showIndexesAnswer: () => Promise.reject(new Error('stub SHOW INDEXES refused')), otherQueryRejectionText: 'unused' }), queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: realTraversalFilePath, limit: 3, searchMode: 'hybrid' }),
		(errorText, retrievedResult) => assert('SHOW INDEXES failing → "Listing the graph\'s indexes failed: stub SHOW INDEXES refused"', errorText === "Listing the graph's indexes failed: stub SHOW INDEXES refused", answerTextOf(errorText, retrievedResult))],
	['a traversal file that exists but fails in Neo4j is refused by name (live)',
		(args) => ({ neo4jSession: liveSession, queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: failingTraversalFilePath, limit: 3, searchMode: 'hybrid' }),
		(errorText, retrievedResult) => assert('traversal Cypher error → "failingTraversal.cypher failed: <Neo4j message>"', /^failingTraversal\.cypher failed: Invalid input/.test(errorText || ''), answerTextOf(errorText, retrievedResult))],
	['a traversal path that cannot be read is refused by name',
		(args) => ({ neo4jSession: liveSession, queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: scratchDirPath, limit: 3, searchMode: 'hybrid' }),
		(errorText, retrievedResult) => assert('traversal path is a directory → "Reading <name> failed: EISDIR…"', new RegExp(`^Reading ${path.basename(scratchDirPath)} failed: EISDIR`).test(errorText || ''), answerTextOf(errorText, retrievedResult))],
	['inside flat search, a vector failure is refused by name',
		(args) => ({ neo4jSession: stubSessionOf({ showIndexesAnswer: oneForgedNodeIndex, otherQueryRejectionText: 'stub vector query refused' }), queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: absentTraversalFilePath, limit: 3, searchMode: 'hybrid' }),
		(errorText, retrievedResult) => assert('flat vector query failing → "Flat vector search failed (index stubVectorIndex): stub vector query refused"', errorText === 'Flat vector search failed (index stubVectorIndex): stub vector query refused', answerTextOf(errorText, retrievedResult))],
	['searchMode bm25 is refused by name (live; no fulltext index exists)',
		(args) => ({ neo4jSession: liveSession, queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: realTraversalFilePath, limit: 3, searchMode: 'bm25' }),
		(errorText, retrievedResult) => assert('searchMode bm25 → "graphRetriever searchMode \'bm25\' cannot run…"', /^graphRetriever searchMode 'bm25' cannot run: this graph carries only the vector index/.test(errorText || ''), answerTextOf(errorText, retrievedResult))],
	['a limit that is not a positive integer is refused by name',
		(args) => ({ neo4jSession: liveSession, queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: realTraversalFilePath, limit: NaN, searchMode: 'hybrid' }),
		(errorText, retrievedResult) => assert('limit NaN → "graphRetriever limit must be a positive integer; got NaN."', errorText === 'graphRetriever limit must be a positive integer; got NaN.', answerTextOf(errorText, retrievedResult))],
	['no traversal file present → flat search, and the result says so (live)',
		(args) => ({ neo4jSession: liveSession, queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: absentTraversalFilePath, limit: 3, searchMode: 'hybrid' }),
		(errorText, retrievedResult) => {
			assert('absent traversal file answers without error', !errorText, answerTextOf(errorText, retrievedResult));
			assert('retrievalMode is flat', !!retrievedResult && retrievedResult.retrievalMode === 'flat', answerTextOf(errorText, retrievedResult));
			assert('retrievalNote names the absent file', !!retrievedResult && retrievedResult.retrievalNote === 'traversal file absentTraversal.cypher not present; flat vector search without graph traversal', answerTextOf(errorText, retrievedResult));
			const resultList = (retrievedResult && retrievedResult.results) || [];
			assert('flat results hold limit (3) rows, counted in resultCount', resultList.length === 3 && retrievedResult.resultCount === 3, answerTextOf(errorText, retrievedResult));
			assert('the seeded CEDS Birthdate property is the first flat row', !!resultList[0] && resultList[0].node.name === 'Birthdate' && resultList[0].node._source === 'CEDS', answerTextOf(errorText, retrievedResult));
		}],
	['no traversal file configured → flat search, and the result says so (live)',
		(args) => ({ neo4jSession: liveSession, queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: '', limit: 2, searchMode: 'vector' }),
		(errorText, retrievedResult) => {
			assert('unconfigured traversal answers without error', !errorText, answerTextOf(errorText, retrievedResult));
			assert('retrievalNote says no traversal file is configured', !!retrievedResult && retrievedResult.retrievalMode === 'flat' && retrievedResult.retrievalNote === 'no traversal file configured; flat vector search without graph traversal', answerTextOf(errorText, retrievedResult));
		}],
	['control: the real traversal still answers with its row list (live)',
		(args) => ({ neo4jSession: liveSession, queryText: 'birth date', embedder: args.recordedEmbedder, traversalFilePath: realTraversalFilePath, limit: 3, searchMode: 'hybrid' }),
		(errorText, retrievedResult) => {
			assert('traversal answers without error', !errorText, answerTextOf(errorText, retrievedResult));
			// W-D-10 (campaign P1): the traversal answers { retrievalMode, requestedHitCount, returnedHitCount, hitList }
			assert('traversal answers hitList: 3 rows carrying graph context, counted', !!retrievedResult && retrievedResult.retrievalMode === 'traversal' && retrievedResult.requestedHitCount === 3 && retrievedResult.returnedHitCount === 3 && Array.isArray(retrievedResult.hitList) && retrievedResult.hitList.length === 3 && retrievedResult.hitList.every((row) => 'mappingsIncoming' in row), answerTextOf(errorText, retrievedResult));
		}],
];

CASE_LIST.forEach(([caseName, specificationOf, assertionsOf]) => {
	taskList.push((args, next) => {
		console.log(`- ${caseName}`);
		retrieveFresh(specificationOf(args), (errorText, retrievedResult) => {
			assertionsOf(errorText, retrievedResult);
			next('', args);
		});
	});
});

// -graphRetriever through the module's search(): what askMilo's CLI call meets before the retriever runs. W-D-1 (supervisor
// ruling 1, 2026-10-06): an INPUT refusal is a RESULT, { refusedByName, refusalName, reason }, written to stdout with exit 0;
// still by name, still never [] — only the channel moved.
const refusalOf = (searchResult) => (searchResult && typeof searchResult === 'object' && !Array.isArray(searchResult) ? searchResult : {});
const SEARCH_CASE_LIST = [
	['an empty query is refused by name, not answered with []', { query: '', limit: '3', searchMode: 'hybrid' },
		(errorText, searchResult) => assert('empty query → { refusedByName: graphRetriever, refusalName: emptyQuery, reason: "-graphRetriever requires a non-empty argument…" }', !errorText && refusalOf(searchResult).refusalName === 'emptyQuery' && /^-graphRetriever requires a non-empty argument/.test(refusalOf(searchResult).reason || ''), answerTextOf(errorText, searchResult))],
	['traversalMode (the never-built dynamic mode\'s switch) is refused by name', { query: 'birth date', limit: '3', searchMode: 'hybrid', traversalMode: 'dynamic' },
		(errorText, searchResult) => assert('traversalMode supplied → { refusalName: traversalModeRemoved, reason: "graphRetriever traversalMode was removed…" }', !errorText && refusalOf(searchResult).refusalName === 'traversalModeRemoved' && /^graphRetriever traversalMode was removed/.test(refusalOf(searchResult).reason || ''), answerTextOf(errorText, searchResult))],
];
SEARCH_CASE_LIST.forEach(([caseName, searchParams, assertionsOf]) => {
	taskList.push((args, next) => {
		console.log(`- ${caseName}`);
		require(path.join(dmeDirPath, 'dataModelExplorerSearch.js')).search('graphRetriever', searchParams, (errorText, searchResult) => {
			assertionsOf(errorText, searchResult);
			next('', args);
		});
	});
});

pipeRunner(taskList.getList(), {}, (err) => {
	fs.rmSync(scratchDirPath, { recursive: true });
	liveSession.close().then(() => driver.close()).then(() => {
		if (err) { console.log(`\nABORTED: ${err}`); process.exit(1); }
		console.log(`\n${passed} passed, ${failed} failed`);
		process.exit(failed > 0 ? 1 : 0);
	});
});
