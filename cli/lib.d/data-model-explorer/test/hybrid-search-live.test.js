#!/usr/bin/env node
'use strict';

// hybrid-search-live.test.js — lane BM25 (2026-10-10), live on the graph dataModelExplorerSearch.ini points at. TQ: "No
// BM25/fulltext is a bug." The search verbs run a keyword (BM25) leg and a vector leg and fuse them (hybrid, the default):
//   (a) an exact element name the vector leg buries is found: -search LEAInfo (hybrid, the default) returns the SIF LEAInfo
//       class on the page, found by the keyword leg; --searchMode=keyword ranks it first. MEASURED on two true replays of
//       the ct17 manifest: the vector leg alone did not have it in its 100 nearest (LEAInfoRefId copies crowd it out)
//   (b) the payload says what it did: searchMode, legHitCountByName, rrfConstant, scoreUnitByField; every row carries
//       foundByLegList and both legs' rank and score fields (null where a leg did not find it)
//   (c) a paraphrase is not harmed: when the keyword leg finds nothing (it asks for every word), the hybrid page IS the (⟪lane zbE⟫ checked in one answer: vector rank order 1..n)
//       vector page, row for row
//   (d) -graphRetriever runs the same search: --searchMode=keyword --limit=3 on LEAInfo answers the class first, its
//       traversal context attached and its provenance unchanged
//   (e) an unknown mode is refused by name with the valid modes (search and graphRetriever)
//
//   node cli/lib.d/data-model-explorer/test/hybrid-search-live.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'lane BM25 hybrid search (keyword BM25 + vector, fused)' });
const { assert, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

const rowSummaryOf = (resultList) => JSON.stringify((resultList || []).slice(0, 5).map((oneRow) => [oneRow.name, oneRow.standard, oneRow.role, oneRow.foundByLegList, oneRow.keywordRank, oneRow.vectorRank]));
const leaInfoClassOf = (resultList) => (resultList || []).find((oneRow) => oneRow.name === 'LEAInfo' && oneRow.standard === 'SIF260928' && oneRow.role === 'DmeClass');

const taskList = new taskListPlus();
taskList.push((args, next) => runVerb(['-search', 'LEAInfo'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const leaInfoRow = leaInfoClassOf(payload.resultList);
	assert('(a) hybrid (the default) finds the SIF LEAInfo class on the page, through the keyword leg', payload.searchMode === 'hybrid' && !!leaInfoRow && leaInfoRow.foundByLegList.includes('keyword') && leaInfoRow.keywordRank === 1, rowSummaryOf(payload.resultList));
	assert('(b) the payload says what it did: searchMode, legHitCountByName (keyword, vector), rrfConstant, scoreUnitByField', Number.isInteger((payload.legHitCountByName || {}).keyword) && Number.isInteger((payload.legHitCountByName || {}).vector) && Number.isFinite(payload.rrfConstant) && typeof (payload.scoreUnitByField || {}).fusedScore === 'string', JSON.stringify({ searchMode: payload.searchMode, legHitCountByName: payload.legHitCountByName, rrfConstant: payload.rrfConstant }));
	assert('(b) every row carries foundByLegList and both legs\' rank and score fields', Array.isArray(payload.resultList) && payload.resultList.length > 0 && payload.resultList.every((oneRow) => Array.isArray(oneRow.foundByLegList) && oneRow.foundByLegList.length > 0 && ['keywordRank', 'keywordScore', 'vectorRank', 'vectorScore', 'fusedScore'].every((fieldName) => fieldName in oneRow)), rowSummaryOf(payload.resultList));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-search', 'LEAInfo', '--searchMode=keyword'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const firstRow = (payload.resultList || [])[0] || {};
	assert('(a) keyword mode ranks the LEAInfo class first, and runs no vector leg', payload.searchMode === 'keyword' && firstRow.name === 'LEAInfo' && firstRow.role === 'DmeClass' && JSON.stringify(firstRow.foundByLegList) === '["keyword"]' && !('vector' in (payload.legHitCountByName || {})), rowSummaryOf(payload.resultList));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-search', 'when was the student born'], (err, outcome) => {
	const hybridPayload = outcome.parsedStdout || {};
	runVerb(['-search', 'when was the student born', '--searchMode=vector'], (vectorErr, vectorOutcome) => {
		const vectorPayload = vectorOutcome.parsedStdout || {};
		const stableIdListOf = (payload) => (payload.resultList || []).map((oneRow) => oneRow.stableId);
		// ⟪lane zbE⟫ the two calls embed the query SEPARATELY, and the query embedder does not answer byte-identically every
		// time (measured on GOLD_EVAL_261023_zeroBacklog: two alternating embeddings, scores apart by ~0.001, so near-tie
		// rows swap and the page edge moves). So 'the hybrid page IS the vector page' is checked inside ONE answer: every
		// hybrid row was found by the vector leg alone, in vector rank order 1..n; and the two pages share their top row.
		const hybridRowList = hybridPayload.resultList || [];
		const vectorOrderedPage = hybridRowList.length > 0 && hybridRowList.every((oneRow, rowIndex) => JSON.stringify(oneRow.foundByLegList) === '["vector"]' && oneRow.vectorRank === rowIndex + 1 && oneRow.keywordRank === null);
		assert('(c) a paraphrase: the keyword leg found nothing (every word required), so the hybrid page is the vector leg\'s page, in vector rank order, and both pages share their top row', (hybridPayload.legHitCountByName || {}).keyword === 0 && vectorOrderedPage && stableIdListOf(hybridPayload)[0] === stableIdListOf(vectorPayload)[0], `keyword hits ${(hybridPayload.legHitCountByName || {}).keyword}; hybrid ${rowSummaryOf(hybridPayload.resultList)} vs vector ${rowSummaryOf(vectorPayload.resultList)}`);
		next('', args);
	}, cliFilePath);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-graphRetriever', 'LEAInfo', '--searchMode=keyword', '--limit=3'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const firstHit = (payload.hitList || [])[0] || {};
	assert('(d) -graphRetriever runs the same search: the LEAInfo class first, with traversal context and its provenance', payload.retrievalMode === 'traversal' && payload.returnedHitCount === 3 && firstHit.hitRank === 1 && (firstHit.node || {}).name === 'LEAInfo' && JSON.stringify(firstHit.foundByLegList) === '["keyword"]' && firstHit.keywordRank === 1 && firstHit.vectorRank === null && 'mappingsIncoming' in firstHit && payload.searchMode === 'keyword', JSON.stringify(payload).slice(0, 300));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-search', 'LEAInfo', '--searchMode=bm25'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	runVerb(['-graphRetriever', 'LEAInfo', '--searchMode=semantic'], (retrieverErr, retrieverOutcome) => {
		const retrieverPayload = retrieverOutcome.parsedStdout || {};
		assert('(e) an unknown mode is refused by name with the valid modes, by both verbs', payload.refusalName === 'invalidSearchMode' && JSON.stringify(payload.validValueList) === '["hybrid","keyword","vector"]' && retrieverPayload.refusalName === 'invalidSearchMode', `${JSON.stringify(payload).slice(0, 160)} | ${JSON.stringify(retrieverPayload).slice(0, 160)}`);
		next('', args);
	}, cliFilePath);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
