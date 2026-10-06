#!/usr/bin/env node
'use strict';

// search-contract.test.js — W-D-10 (campaign P1, 2026-10-06; V2-C14). A filtered dme_search over-fetched only 5× the page
// and then filtered, so `--standard=SIF260928` returned 3 of 20 (measured in the survey) — a short page the model read
// as "SIF has 3 such elements". The search now over-fetches SEARCH_OVER_FETCH_FACTOR× (capped), answers the §14
// envelope, and names a short page as short. The graph retriever answers { retrievalMode, requestedHitCount,
// returnedHitCount, hitList } instead of a bare array. ONE embedding call per verb run (the query text is embedded).
//
//   node cli/lib.d/data-model-explorer/test/search-contract.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-10 dme_search over-fetch, envelope, short page named; retriever hitList' });
const { assert, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];
const { SEARCH_PAGE_SIZE } = require(path.join(harness.dmeDirPath, 'lib', 'toolPayloadContract'));

const taskList = new taskListPlus();
taskList.push((args, next) => runVerb(['-search', 'student birth date', '--standard=SIF260928'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const resultList = payload.resultList || [];
	assert('filtered search answers the envelope (resultList, totalRowCount, returnedRowCount, truncatedRowCount)', Array.isArray(payload.resultList) && Number.isInteger(payload.totalRowCount) && payload.returnedRowCount === resultList.length && payload.truncatedRowCount === payload.totalRowCount - resultList.length, JSON.stringify(payload).slice(0, 200));
	assert(`  a full page of ${SEARCH_PAGE_SIZE}, or a shortPageNote naming the short page`, resultList.length === SEARCH_PAGE_SIZE || typeof payload.shortPageNote === 'string', `${resultList.length} rows; note ${payload.shortPageNote}`);
	assert('  every row is from SIF260928', resultList.length > 0 && resultList.every((oneRow) => oneRow.standard === 'SIF260928'));
	assert('  overFetchWindow is reported', Number.isInteger(payload.overFetchWindow) && payload.overFetchWindow > SEARCH_PAGE_SIZE, `${payload.overFetchWindow}`);
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-graphRetriever', 'student birth date', '--limit=3'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert('retriever: { retrievalMode: traversal, requestedHitCount 3, returnedHitCount === hitList.length }', payload.retrievalMode === 'traversal' && payload.requestedHitCount === 3 && Array.isArray(payload.hitList) && payload.returnedHitCount === payload.hitList.length && payload.hitList.length > 0, JSON.stringify(payload).slice(0, 160));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
