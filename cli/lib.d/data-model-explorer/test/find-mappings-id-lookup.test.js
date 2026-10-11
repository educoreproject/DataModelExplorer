#!/usr/bin/env node
'use strict';

// find-mappings-id-lookup.test.js — W-D-6 (campaign P1, 2026-10-06; V2-C10, PLAN A9). findMappings accepts the hub's
// canonical key — the CEDS Global ID (cedsId on the CEDS leaf, canonicalKey on the HubReference) — and says by name when
// an input matches NOTHING. `-findMappings P000033` used to answer an empty envelope indistinguishable from "matched,
// unmapped". The envelope now carries matchedNodeCount and the §14 totals.
//
//   node cli/lib.d/data-model-explorer/test/find-mappings-id-lookup.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-6 findMappings by CEDS Global ID; nothingMatched by name' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery("MATCH (n:ForgedNode {cedsId: 'P000033'}) RETURN count(n) AS cedsIdNodeCount", {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, cedsIdNodeCount: rowList[0].cedsIdNodeCount });
}));
taskList.push((args, next) => runVerb(['-findMappings', 'P000033'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const rowList = payload.mappingRowList || [];
	const relationTotal = Object.values(payload.totalRowCountByRelation || {}).reduce((runningTotal, oneCount) => runningTotal + oneCount, 0);
	assert(`P000033: matchedNodeCount >= ${args.cedsIdNodeCount} (the CEDS leaf carrying cedsId P000033)`, payload.matchedNodeCount >= args.cedsIdNodeCount && args.cedsIdNodeCount >= 1, `${payload.matchedNodeCount}`);
	assert('  at least one incoming row whose toId is P000033', rowList.some((oneRow) => oneRow.toId === 'P000033' && oneRow.direction === 'incoming'), `${rowList.length} rows`);
	assert('  totalRowCount === Σ totalRowCountByRelation, returnedRowCount === rows, truncatedRowCount === Σ truncatedRowCountByRelation', payload.totalRowCount === relationTotal && payload.returnedRowCount === rowList.length && payload.truncatedRowCount === Object.values(payload.truncatedRowCountByRelation || {}).reduce((runningTotal, oneCount) => runningTotal + oneCount, 0), JSON.stringify({ totalRowCount: payload.totalRowCount, relationTotal, returnedRowCount: payload.returnedRowCount, truncatedRowCount: payload.truncatedRowCount }));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-findMappings', 'P000033x'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert('P000033x: refusedByName findMappings, refusalName nothingMatched, exit 0', outcome.status === 0 && payload.refusedByName === 'findMappings' && payload.refusalName === 'nothingMatched', JSON.stringify(payload).slice(0, 200));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-findMappings', 'Birthdate'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert('control: a name that matches answers rows and matchedNodeCount > 0', payload.matchedNodeCount > 0 && (payload.mappingRowList || []).length > 0, JSON.stringify(payload).slice(0, 160));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
