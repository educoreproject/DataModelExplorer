#!/usr/bin/env node
'use strict';

// explore-contract.test.js — W-D-11 and W-D-12 (campaign P1, 2026-10-06; V2-C07, V2-C08, PLAN A8/A2). dme_explore keyed its
// entries by labels + name, so the 15 SIF260928 nodes named exactly BirthDate (5 Questions, 10 Fields) collapsed into 2
// entries, each holding the LAST record's edges. Entries are now keyed by stableId — one per node — with matchedNodeCount,
// and an exact lookup reports its case-variant siblings (SIF splits one concept into BirthDate and birthDate) so the model
// can widen with nameMatch=caseInsensitive. Every count is the test's own Cypher.
//
//   node cli/lib.d/data-model-explorer/test/explore-contract.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-11/12 dme_explore: one entry per node; case variants reported' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(`
	MATCH (n:ForgedNode {_source: 'SIF260928'}) WHERE toLower(n.name) = 'birthdate'
	RETURN n.stableId AS stableId, n.name AS name, n.role AS role,
	       COUNT { (n)-[]->(:ForgedNode) } AS outgoingTotal, COUNT { (:ForgedNode)-[]->(n) } AS incomingTotal`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, exactRowList: rowList.filter((oneRow) => oneRow.name === 'BirthDate'), caseVariantRowList: rowList.filter((oneRow) => oneRow.name !== 'BirthDate'), allRowList: rowList });
}));
taskList.push((args, next) => runVerb(['-explore', '--name=BirthDate', '--standard=SIF260928'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const entryList = payload.entryList || [];
	assert(`exact: matchedNodeCount === ${args.exactRowList.length} (the test's count), one entry per node`, payload.matchedNodeCount === args.exactRowList.length && entryList.length === args.exactRowList.length, `matchedNodeCount ${payload.matchedNodeCount}; ${Array.isArray(payload) ? payload.length + ' entries (bare array)' : entryList.length + ' entries'}`);
	assert('  every entry carries a distinct stableId', entryList.length > 0 && new Set(entryList.map((oneEntry) => oneEntry.stableId)).size === entryList.length);
	const degreeMismatchList = entryList.filter((oneEntry) => {
		const expectedRow = args.exactRowList.find((oneRow) => oneRow.stableId === oneEntry.stableId);
		return !expectedRow || expectedRow.outgoingTotal !== oneEntry.outgoingTotal || expectedRow.incomingTotal !== oneEntry.incomingTotal;
	});
	assert('  each entry\'s outgoingTotal / incomingTotal equal that node\'s own degree', entryList.length > 0 && degreeMismatchList.length === 0, degreeMismatchList.slice(0, 2).map((oneEntry) => `${oneEntry.stableId} ${oneEntry.outgoingTotal}/${oneEntry.incomingTotal}`).join('; '));
	const expectedVariantNameList = [...new Set(args.caseVariantRowList.map((oneRow) => oneRow.name))].sort();
	assert(`  caseVariantNodeCount === ${args.caseVariantRowList.length}, caseVariantNameList ${JSON.stringify(expectedVariantNameList)}`, payload.caseVariantNodeCount === args.caseVariantRowList.length && JSON.stringify([...(payload.caseVariantNameList || [])].sort()) === JSON.stringify(expectedVariantNameList), JSON.stringify({ caseVariantNodeCount: payload.caseVariantNodeCount, caseVariantNameList: payload.caseVariantNameList }));
	assert('  envelope: totalRowCount === matchedNodeCount, nameMatchMode exact', payload.totalRowCount === payload.matchedNodeCount && payload.returnedRowCount === entryList.length && payload.nameMatchMode === 'exact');
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-explore', '--name=BirthDate', '--standard=SIF260928', '--nameMatch=caseInsensitive'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert(`caseInsensitive: matchedNodeCount === ${args.allRowList.length} (every case variant)`, payload.matchedNodeCount === args.allRowList.length && (payload.entryList || []).length === args.allRowList.length && payload.nameMatchMode === 'caseInsensitive', `${payload.matchedNodeCount}`);
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-explore', '--name=BirthDate', '--nameMatch=fuzzy'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert('--nameMatch=fuzzy is refused by name (invalidNameMatch) with the valid modes', payload.refusedByName === 'explore' && payload.refusalName === 'invalidNameMatch' && JSON.stringify(payload.validValueList) === JSON.stringify(['exact', 'caseInsensitive']), JSON.stringify(payload).slice(0, 160));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-explore', '--name=zzzNoSuchNodeName'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert('a name no node bears is refused by name (nothingMatched)', payload.refusedByName === 'explore' && payload.refusalName === 'nothingMatched', JSON.stringify(payload).slice(0, 160));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
