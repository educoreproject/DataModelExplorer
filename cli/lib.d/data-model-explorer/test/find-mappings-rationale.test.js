#!/usr/bin/env node
'use strict';

// find-mappings-rationale.test.js — campaign P3, W-B-4 (a) DME read (PLAN A3: askMilo invented reasons for confidence
// values). Since P3 every judged match edge carries mappingRationale, the judge's own stated reason. findMappings returns it
// on every row (mappingRationale for the row's hop, viaMappingRationale for the queried element's own hop on a shared-hub
// row), so a reader can QUOTE it. The test picks a judged edge by its own Cypher and asks the verb for its subject.
//
//   node cli/lib.d/data-model-explorer/test/find-mappings-rationale.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-B-4: findMappings carries the judge\'s mappingRationale on every row' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

const taskList = new taskListPlus();
// a judged Ed-Fi edge: its subject is the element the DME finds directly (no instance hop), so the row is the edge itself
taskList.push((args, next) => runQuery(`MATCH (s:ForgedNode {_source: 'EdFi', role: 'DmeProperty'})-[r:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(h:HubReference)
	WHERE r.mappingKind = 'inferred' AND r.mappingRationale IS NOT NULL
	RETURN s.stableId AS subjectStableId, h.canonicalKey AS hubKey, r.mappingRationale AS rationaleText ORDER BY s.stableId LIMIT 1`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	if (!rowList[0]) { next('no judged Ed-Fi edge carries mappingRationale — the graph predates campaign P3', args); return; }
	next('', { ...args, fixture: rowList[0] });
}));
taskList.push((args, next) => runVerb(['-findMappings', args.fixture.subjectStableId], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const rowList = payload.mappingRowList || [];
	const ownRow = rowList.find((oneRow) => oneRow.direction === 'outgoing' && oneRow.toId === args.fixture.hubKey);
	assert(`the outgoing row to ${args.fixture.hubKey} carries the edge's mappingRationale verbatim`, !!ownRow && ownRow.mappingRationale === args.fixture.rationaleText, ownRow ? JSON.stringify(ownRow.mappingRationale).slice(0, 120) : `${rowList.length} rows, none outgoing to the fixture hub`);
	assert('every row carries the mappingRationale and viaMappingRationale keys (null when no rationale is recorded, never absent)', rowList.length > 0 && rowList.every((oneRow) => Object.prototype.hasOwnProperty.call(oneRow, 'mappingRationale') && Object.prototype.hasOwnProperty.call(oneRow, 'viaMappingRationale')), `${rowList.length} rows`);
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runQuery(`MATCH ()-[r:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->() WHERE r.mappingKind = 'inferred'
	RETURN count(r) AS judgedCount, count(r.mappingRationale) AS rationaleCount`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	assert(`live census: every judged edge carries a rationale (${rowList[0].rationaleCount} of ${rowList[0].judgedCount})`, rowList[0].judgedCount > 0 && rowList[0].rationaleCount === rowList[0].judgedCount);
	next('', args);
}));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
