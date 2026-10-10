#!/usr/bin/env node
'use strict';

// graph-retriever-refusals.test.js — ruling C (TQ, 2026-10-05) for the graph retriever: a real error must reach the caller
// BY NAME — never a degraded result, never an empty list standing in for the failure. The one alternative path (no
// traversal file configured or present) returns the search hits flat and the RESULT says so (retrievalMode 'flat',
// retrievalNote). Each refusal below is asserted by its message, so a twin that answers with rows or [] instead fails.
//
// ⟪lane BM25, 2026-10-10⟫ The search moved out of lib/vectorCypherRetriever.js into lib/hybridRetrieval.js (a keyword BM25
// leg and a vector leg, fused by reciprocal rank), so the cases follow it: the search's failures (embedder, each leg's
// query, an unknown mode, the fulltext index check) are asserted on hybridRetrieval with stub sessions; the traversal's
// (a failing traversal.cypher, an unreadable path, the flat alternative path, the success control) on the retriever,
// live, from a hit list seeded with the CEDS Birthdate property — so nothing is embedded and nothing jitters.
//
//   node cli/lib.d/data-model-explorer/test/graph-retriever-refusals.test.js [dmeDirPath]

const fs = require('fs');
const os = require('os');
const path = require('path');
const dmeDirPath = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const retrieverModulePath = path.join(dmeDirPath, 'lib', 'vectorCypherRetriever.js');
const hybridRetrieval = require(path.join(dmeDirPath, 'lib', 'hybridRetrieval.js'));
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
const answerTextOf = (errorText, retrievedResult) => (errorText ? `error '${errorText}'` : `result ${JSON.stringify(retrievedResult).slice(0, 200)}`);
const { retrieve } = require(retrieverModulePath);

// ---- stubs -----------------------------------------------------------------------------------------------------
const stubRecordOf = (fieldByName) => ({ keys: Object.keys(fieldByName), get: (fieldName) => fieldByName[fieldName] });
const rejectingSessionOf = (rejectionText) => ({ run: () => Promise.reject(new Error(rejectionText)) });
const showIndexesSessionOf = (indexRowList) => ({ run: () => Promise.resolve({ records: indexRowList.map(stubRecordOf) }) });
const declaration = require(path.join(dmeDirPath, 'lib', 'graphContract.js')).contract.fulltextIndexDeclaration;
const declaredFulltextRow = (indexName) => ({ name: indexName, entityType: 'NODE', labelsOrTypes: [declaration.label], properties: declaration.propertyNameList.slice(), analyzer: declaration.analyzer });
const failingEmbedder = { embed: (textList, callback) => callback('stub embedder down') };
const stubEmbedder = { embed: (textList, callback) => callback('', [[0.1, 0.2]]) };
const searchSpecificationOf = (overrideByName) => ({ queryText: 'birth date', legWindowSize: 10, sourceList: null, vectorIndexName: 'stubVectorIndex', fulltextIndexName: 'stubFulltextIndex', ...overrideByName });

// ---- live ------------------------------------------------------------------------------------------------------
const driver = neo4j.driver(connection.boltUri, neo4j.auth.basic(connection.user, connection.password));
const liveSession = driver.session({ defaultAccessMode: neo4j.session.READ });
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'graphRetrieverRefusals-'));
const failingTraversalFilePath = path.join(scratchDirPath, 'failingTraversal.cypher');
fs.writeFileSync(failingTraversalFilePath, 'MATCH (n:ForgedNode RETURN n'); // a Cypher syntax error Neo4j rejects
const absentTraversalFilePath = path.join(scratchDirPath, 'absentTraversal.cypher');
const realTraversalFilePath = path.join(dmeDirPath, 'traversal.cypher');

console.log(`\n=== graph retriever refusals (ruling C; lane BM25) — ${dmeDirPath} ===\n`);
const taskList = new taskListPlus();

// the seeded hit list: the CEDS Birthdate property first, then two more CEDS properties, as fuseRankedLegs shapes a hit
taskList.push((args, next) => {
	liveSession.run(`MATCH (n:ForgedNode {role: 'DmeProperty', _source: 'CEDS'}) WHERE n.embedding IS NOT NULL AND n.name IN ['Birthdate', 'Last or Surname', 'First Name']
		RETURN n.stableId AS stableId, n.name AS name ORDER BY CASE n.name WHEN 'Birthdate' THEN 0 ELSE 1 END, n.name`).then(
		(queryResult) => {
			if (queryResult.records.length !== 3 || queryResult.records[0].get('name') !== 'Birthdate') { next(`the three seed CEDS properties were not found (${queryResult.records.length})`, args); return; }
			const seededHitList = queryResult.records.map((oneRecord, recordIndex) => ({ stableId: oneRecord.get('stableId'), name: oneRecord.get('name'), standard: 'CEDS', fusedScore: 1 / (60 + recordIndex + 1), foundByLegList: ['keyword'], keywordRank: recordIndex + 1, keywordScore: 9 - recordIndex, vectorRank: null, vectorScore: null }));
			next('', { ...args, seededHitList });
		},
		(queryError) => next(`seed query failed: ${queryError.message}`, args),
	);
});

// THE SEARCH (lib/hybridRetrieval.js): [caseName, (args, done) => run, assertions]
const SEARCH_CASE_LIST = [
	['embedder failure is refused by name',
		(args, done) => hybridRetrieval.runSearchLegs(searchSpecificationOf({ session: rejectingSessionOf('unused'), embedder: failingEmbedder, searchMode: 'vector' }), done),
		(errorText, searchResult) => assert('embedder failure → "Embedding the query failed: stub embedder down"', errorText === 'Embedding the query failed: stub embedder down', answerTextOf(errorText, searchResult))],
	['a failing vector leg query is refused by name',
		(args, done) => hybridRetrieval.runSearchLegs(searchSpecificationOf({ session: rejectingSessionOf('stub vector query refused'), embedder: stubEmbedder, searchMode: 'vector' }), done),
		(errorText, searchResult) => assert('vector leg failing → "the vector leg failed on stubVectorIndex: stub vector query refused"', errorText === 'the vector leg failed on stubVectorIndex: stub vector query refused', answerTextOf(errorText, searchResult))],
	['a failing keyword leg query is refused by name',
		(args, done) => hybridRetrieval.runSearchLegs(searchSpecificationOf({ session: rejectingSessionOf('stub fulltext query refused'), embedder: stubEmbedder, searchMode: 'hybrid' }), done),
		(errorText, searchResult) => assert('keyword leg failing → "the keyword (BM25) leg failed on stubFulltextIndex: stub fulltext query refused"', errorText === 'the keyword (BM25) leg failed on stubFulltextIndex: stub fulltext query refused', answerTextOf(errorText, searchResult))],
	['an unknown searchMode is refused by name, not run as some leg',
		(args, done) => hybridRetrieval.runSearchLegs(searchSpecificationOf({ session: rejectingSessionOf('unused'), embedder: stubEmbedder, searchMode: 'bm25' }), done),
		(errorText, searchResult) => assert('searchMode bm25 → "hybridRetrieval.runSearchLegs: searchMode \'bm25\' is not one of hybrid, keyword, vector"', errorText === "hybridRetrieval.runSearchLegs: searchMode 'bm25' is not one of hybrid, keyword, vector", answerTextOf(errorText, searchResult))],
	['a graph with no fulltext index is refused by name (fulltextIndexAbsent)',
		(args, done) => hybridRetrieval.checkFulltextIndex({ session: showIndexesSessionOf([]), verbName: 'search' }, done),
		(errorText, checkResult) => assert('no FULLTEXT index → refusal fulltextIndexAbsent naming the declaration and "found: none"', !errorText && checkResult.refusal && checkResult.refusal.refusalName === 'fulltextIndexAbsent' && /found: none\) — the keyword \(BM25\) leg cannot run on it/.test(checkResult.refusal.reason), answerTextOf(errorText, checkResult))],
	['a second fulltext index is refused by name, not chosen',
		(args, done) => hybridRetrieval.checkFulltextIndex({ session: showIndexesSessionOf([declaredFulltextRow('G_fulltext'), declaredFulltextRow('H_fulltext')]), verbName: 'search' }, done),
		(errorText, checkResult) => assert('two FULLTEXT indexes → refusal fulltextIndexAbsent naming both', !errorText && checkResult.refusal && checkResult.refusal.refusalName === 'fulltextIndexAbsent' && /G_fulltext .*H_fulltext/.test(checkResult.refusal.reason), answerTextOf(errorText, checkResult))],
	['the declared fulltext index is found',
		(args, done) => hybridRetrieval.checkFulltextIndex({ session: showIndexesSessionOf([declaredFulltextRow('G_fulltext')]), verbName: 'search' }, done),
		(errorText, checkResult) => assert('one declared FULLTEXT index → { fulltextIndexName: G_fulltext }', !errorText && checkResult.fulltextIndexName === 'G_fulltext', answerTextOf(errorText, checkResult))],
	['an index listing failure is refused by name',
		(args, done) => hybridRetrieval.checkFulltextIndex({ session: rejectingSessionOf('stub SHOW INDEXES refused'), verbName: 'search' }, done),
		(errorText, checkResult) => assert('SHOW INDEXES failing → "listing the graph\'s fulltext indexes failed: stub SHOW INDEXES refused"', errorText === "listing the graph's fulltext indexes failed: stub SHOW INDEXES refused", answerTextOf(errorText, checkResult))],
];

// THE TRAVERSAL (lib/vectorCypherRetriever.js): [caseName, (args) => retrievalSpecification, assertions]
const RETRIEVER_CASE_LIST = [
	['a hit list that is not a list is refused by name',
		(args) => ({ neo4jSession: liveSession, hitList: undefined, traversalFilePath: realTraversalFilePath }),
		(errorText, retrievedResult) => assert('hitList undefined → "graphRetriever: hitList must be the search\'s fused hit list (an array); got undefined."', errorText === "graphRetriever: hitList must be the search's fused hit list (an array); got undefined.", answerTextOf(errorText, retrievedResult))],
	['a traversal file that exists but fails in Neo4j is refused by name (live)',
		(args) => ({ neo4jSession: liveSession, hitList: args.seededHitList, traversalFilePath: failingTraversalFilePath }),
		(errorText, retrievedResult) => assert('traversal Cypher error → "failingTraversal.cypher failed: <Neo4j message>"', /^failingTraversal\.cypher failed: Invalid input/.test(errorText || ''), answerTextOf(errorText, retrievedResult))],
	['a traversal path that cannot be read is refused by name',
		(args) => ({ neo4jSession: liveSession, hitList: args.seededHitList, traversalFilePath: scratchDirPath }),
		(errorText, retrievedResult) => assert('traversal path is a directory → "Reading <name> failed: EISDIR…"', new RegExp(`^Reading ${path.basename(scratchDirPath)} failed: EISDIR`).test(errorText || ''), answerTextOf(errorText, retrievedResult))],
	['no traversal file present → the hits flat, and the result says so',
		(args) => ({ neo4jSession: liveSession, hitList: args.seededHitList, traversalFilePath: absentTraversalFilePath }),
		(errorText, retrievedResult) => {
			assert('absent traversal file answers without error', !errorText, answerTextOf(errorText, retrievedResult));
			assert('retrievalMode is flat, retrievalNote names the absent file', !!retrievedResult && retrievedResult.retrievalMode === 'flat' && retrievedResult.retrievalNote === 'traversal file absentTraversal.cypher not present; the search hits without graph traversal', answerTextOf(errorText, retrievedResult));
			const resultList = (retrievedResult && retrievedResult.results) || [];
			assert('flat results are the 3 hits in order, counted, each with its provenance and hitRank', resultList.length === 3 && retrievedResult.resultCount === 3 && resultList[0].name === 'Birthdate' && resultList.every((oneRow, rowIndex) => oneRow.hitRank === rowIndex + 1 && Array.isArray(oneRow.foundByLegList)), answerTextOf(errorText, retrievedResult));
		}],
	['no traversal file configured → the hits flat, and the result says so',
		(args) => ({ neo4jSession: liveSession, hitList: args.seededHitList.slice(0, 2), traversalFilePath: '' }),
		(errorText, retrievedResult) => assert('retrievalNote says no traversal file is configured', !errorText && !!retrievedResult && retrievedResult.retrievalMode === 'flat' && retrievedResult.resultCount === 2 && retrievedResult.retrievalNote === 'no traversal file configured; the search hits without graph traversal', answerTextOf(errorText, retrievedResult))],
	['control: the real traversal answers its row list, each row carrying the hit\'s provenance unchanged (live)',
		(args) => ({ neo4jSession: liveSession, hitList: args.seededHitList, traversalFilePath: realTraversalFilePath }),
		(errorText, retrievedResult) => {
			assert('traversal answers without error', !errorText, answerTextOf(errorText, retrievedResult));
			// W-D-10 (campaign P1): the traversal answers { retrievalMode, requestedHitCount, returnedHitCount, hitList }
			const hitList = (retrievedResult && retrievedResult.hitList) || [];
			assert('traversal answers hitList: 3 rows carrying graph context, counted', !!retrievedResult && retrievedResult.retrievalMode === 'traversal' && retrievedResult.requestedHitCount === 3 && retrievedResult.returnedHitCount === 3 && hitList.length === 3 && hitList.every((row) => 'mappingsIncoming' in row), answerTextOf(errorText, retrievedResult));
			assert('rows keep the hit order (hitRank 1..3, Birthdate first) and the hit provenance (foundByLegList, keywordRank, vectorRank null)', hitList.length === 3 && hitList.every((row, rowIndex) => row.hitRank === rowIndex + 1 && JSON.stringify(row.foundByLegList) === '["keyword"]' && row.keywordRank === rowIndex + 1 && row.vectorRank === null) && hitList[0].node.name === 'Birthdate', answerTextOf(errorText, retrievedResult));
		}],
];

SEARCH_CASE_LIST.forEach(([caseName, runCase, assertionsOf]) => {
	taskList.push((args, next) => {
		console.log(`- ${caseName}`);
		runCase(args, (errorText, caseResult) => {
			assertionsOf(errorText, caseResult);
			next('', args);
		});
	});
});
RETRIEVER_CASE_LIST.forEach(([caseName, specificationOf, assertionsOf]) => {
	taskList.push((args, next) => {
		console.log(`- ${caseName}`);
		retrieve(specificationOf(args), (errorText, retrievedResult) => {
			assertionsOf(errorText, retrievedResult);
			next('', args);
		});
	});
});

// -graphRetriever through the module's search(): what askMilo's CLI call meets before the retriever runs. W-D-1 (supervisor
// ruling 1, 2026-10-06): an INPUT refusal is a RESULT, { refusedByName, refusalName, reason }, written to stdout with exit 0;
// still by name, still never [] — only the channel moved.
const refusalOf = (searchResult) => (searchResult && typeof searchResult === 'object' && !Array.isArray(searchResult) ? searchResult : {});
const VERB_CASE_LIST = [
	['an empty query is refused by name, not answered with []', { query: '', limit: '3', searchMode: 'hybrid' },
		(errorText, searchResult) => assert('empty query → { refusedByName: graphRetriever, refusalName: emptyQuery, reason: "-graphRetriever requires a non-empty argument…" }', !errorText && refusalOf(searchResult).refusalName === 'emptyQuery' && /^-graphRetriever requires a non-empty argument/.test(refusalOf(searchResult).reason || ''), answerTextOf(errorText, searchResult))],
	['traversalMode (the never-built dynamic mode\'s switch) is refused by name', { query: 'birth date', limit: '3', searchMode: 'hybrid', traversalMode: 'dynamic' },
		(errorText, searchResult) => assert('traversalMode supplied → { refusalName: traversalModeRemoved, reason: "graphRetriever traversalMode was removed…" }', !errorText && refusalOf(searchResult).refusalName === 'traversalModeRemoved' && /^graphRetriever traversalMode was removed/.test(refusalOf(searchResult).reason || ''), answerTextOf(errorText, searchResult))],
	['searchMode bm25 is refused by name, with the valid modes', { query: 'birth date', limit: '3', searchMode: 'bm25' },
		(errorText, searchResult) => assert('searchMode bm25 → { refusalName: invalidSearchMode, validValueList: [hybrid, keyword, vector] }', !errorText && refusalOf(searchResult).refusalName === 'invalidSearchMode' && JSON.stringify(refusalOf(searchResult).validValueList) === '["hybrid","keyword","vector"]', answerTextOf(errorText, searchResult))],
];
VERB_CASE_LIST.forEach(([caseName, searchParams, assertionsOf]) => {
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
