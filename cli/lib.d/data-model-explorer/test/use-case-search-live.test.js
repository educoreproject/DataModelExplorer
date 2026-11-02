#!/usr/bin/env node
'use strict';

// use-case-search-live.test.js — the USE-CASE standard is found by meaning (use-case forge Phase 5, 2026-10-30;
// PLAN-useCaseDme-103026 gate B1). The forge embeds the use-case roles that have their own words (cases, stories, actors,
// conditions, events…), so dme_search finds them among every standard's elements, and a standard filter of the use-case
// source scopes it.
// PROVES, against the live graph:
//   (a) dme_search "issue a credential to a learner's wallet" returns a DmeUseCase or DmeUserStory in its top 10
//   (b) the same search with standard = the use-case source returns rows, every one of that source
// RED BEFORE: with the DME's previous contract (ea7d2a62) the search refuses graphContractMismatch on GOLD_EVAL_261030_useCases.
//
//   node cli/lib.d/data-model-explorer/test/use-case-search-live.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'use-case forge Phase 5 (B1): use cases are found by dme_search, and a UseCase filter scopes it' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];
const SEARCH_TEXT = "issue a credential to a learner's wallet";
const WANTED_ROLE_LIST = ['DmeUseCase', 'DmeUserStory'];
const TOP_ROW_COUNT = 10;

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(`MATCH (d:StandardDefinition {standardKind: 'useCaseCorpus'}) RETURN d.sourceKey AS sourceKey`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	assert('the graph carries one use-case standard (this gate needs a use-case graph)', rowList.length === 1, JSON.stringify(rowList));
	next(rowList.length === 1 ? '' : 'stopped: no use-case standard', { ...args, useCaseSource: (rowList[0] || {}).sourceKey });
}));
taskList.push((args, next) => runQuery(`MATCH (n:ForgedNode) WHERE n.stableId IS NOT NULL RETURN n.stableId AS stableId, n.role AS role, n._source AS source`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, nodeByStableId: Object.fromEntries(rowList.map((oneRow) => [oneRow.stableId, oneRow])) });
}));
taskList.push((args, next) => runVerb(['-search', SEARCH_TEXT], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const topRoleList = (payload.resultList || []).slice(0, TOP_ROW_COUNT).map((oneRow) => (args.nodeByStableId[oneRow.stableId] || {}).role);
	assert(`(a) search '${SEARCH_TEXT}' has a ${WANTED_ROLE_LIST.join(' or ')} in its top ${TOP_ROW_COUNT}`, topRoleList.some((role) => WANTED_ROLE_LIST.indexOf(role) !== -1), JSON.stringify(payload.refusalName ? payload : topRoleList).slice(0, 300));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-search', SEARCH_TEXT, `--standard=${args.useCaseSource}`], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const sourceList = (payload.resultList || []).map((oneRow) => (args.nodeByStableId[oneRow.stableId] || {}).source);
	assert(`(b) search with standard ${args.useCaseSource} returns rows, every one of ${args.useCaseSource}`, sourceList.length > 0 && sourceList.every((source) => source === args.useCaseSource), JSON.stringify(payload.refusalName ? payload : sourceList).slice(0, 300));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
