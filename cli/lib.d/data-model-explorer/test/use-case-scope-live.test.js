#!/usr/bin/env node
'use strict';

// use-case-scope-live.test.js — the USE-CASE standard in the DME (use-case forge Phase 5, 2026-10-30; PLAN-useCaseDme-103026
// Phase A). The corpus is a standard of its own (standardKind useCaseCorpus, read from StandardDefinition); its reference
// nodes bear the names of the elements they cite, so a data-element lookup must not count them (lib/useCaseScope.js, the
// role list read from the graph contract), and a case is reached by its corpus id and shows its steps in order.
// PROVES, against the live graph, every number from the test's OWN Cypher:
//   (a) dme_list_standards lists the use-case standard with standardKind = the contract's useCaseScopeRule.standardKind,
//       and every row carries the standardKind its StandardDefinition declares
//   (b) findMappings on the name of a use-case CITATION node (one that a data element also bears) matches exactly the
//       non-use-case, non-layer nodes the test counts, while the citation is still listed apart as a declared correspondence
//   (c) explore by a case's corpus id ('uc:…') finds the case, and its HAS_STEP edges carry codedNotation and position
//       (edgeProperties), one per step the test counts
//   (d) explore of a data element shows no edgeProperties (the field is the use-case standard's alone)
// RED BEFORE: with main 21ffee8's DME (contract ea7d2a62) as the CLI argument, (a), (b) and (c) fail.
//
//   node cli/lib.d/data-model-explorer/test/use-case-scope-live.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'use-case forge Phase 5: the UseCase standard is listed by kind, kept out of element lookups, and explorable by case id' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner, dmeDirPath } = harness;
const cliFilePath = process.argv[2];
const { useCaseScopeRule } = require(require('path').join(dmeDirPath, 'contract', 'graphContract.json'));
const CASE_STABLE_ID = 'uc:ler-issuance';

const taskList = new taskListPlus();
taskList.push((args, next) => {
	const contractDeclaresRule = Boolean(useCaseScopeRule && useCaseScopeRule.standardKind && Array.isArray(useCaseScopeRule.useCaseRoleList));
	assert('the DME graph contract declares useCaseScopeRule (contract/graphContract.json from educoreForge)', contractDeclaresRule, JSON.stringify(useCaseScopeRule));
	next(contractDeclaresRule ? '' : 'stopped: no useCaseScopeRule to test against', args);
});
taskList.push((args, next) => runQuery(`MATCH (d:StandardDefinition) RETURN d.sourceKey AS sourceKey, d.standardKind AS standardKind`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	const useCaseSourceList = rowList.filter((oneRow) => oneRow.standardKind === useCaseScopeRule.standardKind).map((oneRow) => oneRow.sourceKey);
	assert(`the graph carries a ${useCaseScopeRule.standardKind} standard (this gate needs a use-case graph)`, useCaseSourceList.length === 1, JSON.stringify(useCaseSourceList));
	next('', { ...args, standardKindBySource: Object.fromEntries(rowList.map((oneRow) => [oneRow.sourceKey, oneRow.standardKind])), useCaseSource: useCaseSourceList[0] });
}));
taskList.push((args, next) => runVerb(['-listStandards'], (err, outcome) => {
	const standardList = (outcome.parsedStdout || {}).standards || [];
	const useCaseRow = standardList.find((oneRow) => oneRow.source === args.useCaseSource) || {};
	assert(`(a) listStandards ${args.useCaseSource} standardKind === '${useCaseScopeRule.standardKind}'`, useCaseRow.standardKind === useCaseScopeRule.standardKind, JSON.stringify(useCaseRow.standardKind));
	const disagreeingRowList = standardList.filter((oneRow) => oneRow.standardKind !== args.standardKindBySource[oneRow.source]);
	assert(`(a) every one of ${standardList.length} rows carries its StandardDefinition's standardKind`, standardList.length > 0 && disagreeingRowList.length === 0, JSON.stringify(disagreeingRowList.map((oneRow) => oneRow.source)));
	next('', args);
}, cliFilePath));
// a citation name a data element also bears, chosen by the test from the graph (the shortest, for a quick lookup)
taskList.push((args, next) => runQuery(`MATCH (ref:ForgedNode) WHERE ref.role IN $useCaseRoleList AND ref.name IS NOT NULL
	MATCH (element:ForgedNode {name: ref.name}) WHERE NOT element.role IN $useCaseRoleList AND NOT element:StandardLayer
	WITH ref.name AS citedName ORDER BY size(citedName), citedName RETURN citedName LIMIT 1`, { useCaseRoleList: useCaseScopeRule.useCaseRoleList }, (err, rowList) => {
	if (err) { next(err, args); return; }
	assert('a use-case node bears the name of a data element (this gate needs one)', rowList.length === 1, JSON.stringify(rowList));
	next('', { ...args, citedName: (rowList[0] || {}).citedName });
}));
taskList.push((args, next) => runQuery(`MATCH (n:ForgedNode) WHERE toLower(n.name) CONTAINS toLower($name) AND NOT n:StandardLayer
	RETURN count(CASE WHEN NOT coalesce(n.role, '') IN $useCaseRoleList THEN 1 END) AS elementCount, count(CASE WHEN n.role IN $useCaseRoleList THEN 1 END) AS useCaseNodeCount`,
{ name: args.citedName, useCaseRoleList: useCaseScopeRule.useCaseRoleList }, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, nameCounts: rowList[0] });
}));
taskList.push((args, next) => runVerb(['-findMappings', args.citedName], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert(`(b) the name '${args.citedName}' is borne by ${args.nameCounts.useCaseNodeCount} use-case node(s) (precondition)`, args.nameCounts.useCaseNodeCount > 0, JSON.stringify(args.nameCounts));
	// the verb matches by name, by identifier or by an instance's context path; the name arm is the test's own count, the
	// instance-path arm is the verb's own instancePathMatchedNodeCount, and no use-case node may add to either
	const expectedMatchedNodeCount = args.nameCounts.elementCount + (payload.instancePathMatchedNodeCount || 0);
	assert(`(b) findMappings '${args.citedName}' matchedNodeCount === ${expectedMatchedNodeCount} (elements by name + by instance path; no use-case node)`, payload.matchedNodeCount === expectedMatchedNodeCount, JSON.stringify({ matchedNodeCount: payload.matchedNodeCount, instancePathMatchedNodeCount: payload.instancePathMatchedNodeCount, ...args.nameCounts }));
	const citationList = (payload.declaredCorrespondenceList || []).filter((oneRow) => oneRow.sourceStandard === args.useCaseSource);
	assert(`(b) the citation is still listed apart, in declaredCorrespondenceList (sourceStandard ${args.useCaseSource})`, citationList.length > 0, JSON.stringify(payload.declaredCorrespondenceList).slice(0, 300));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runQuery(`MATCH (uc:ForgedNode {stableId: $caseStableId})-[step:HAS_STEP]->() RETURN count(step) AS stepCount`, { caseStableId: CASE_STABLE_ID }, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, stepCount: rowList[0].stepCount });
}));
taskList.push((args, next) => runVerb(['-explore', `--name=${CASE_STABLE_ID}`], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const caseEntry = (payload.entryList || []).find((oneEntry) => oneEntry.stableId === CASE_STABLE_ID) || {};
	assert(`(c) explore --name=${CASE_STABLE_ID} finds the case by its corpus id`, payload.matchedNodeCount === 1 && caseEntry.stableId === CASE_STABLE_ID, JSON.stringify(payload).slice(0, 300));
	const stepEdgeList = (caseEntry.outgoing || []).filter((oneEdge) => oneEdge.type === 'HAS_STEP');
	const orderedStepEdgeList = stepEdgeList.filter((oneEdge) => oneEdge.edgeProperties && typeof oneEdge.edgeProperties.codedNotation === 'string' && typeof oneEdge.edgeProperties.position === 'number');
	assert(`(c) all ${args.stepCount} HAS_STEP edges carry edgeProperties.codedNotation and position`, args.stepCount > 0 && stepEdgeList.length === args.stepCount && orderedStepEdgeList.length === args.stepCount, JSON.stringify(stepEdgeList.slice(0, 2)));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-explore', '--name=Birthdate', '--standard=CEDS'], (err, outcome) => {
	const exploreText = JSON.stringify(outcome.parsedStdout || {});
	assert('(d) explore of a CEDS element carries no edgeProperties', exploreText.indexOf('"stableId"') !== -1 && exploreText.indexOf('edgeProperties') === -1, exploreText.slice(0, 200));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
