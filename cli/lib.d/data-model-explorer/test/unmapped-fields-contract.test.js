#!/usr/bin/env node
'use strict';

// unmapped-fields-contract.test.js — W-D-9 (campaign P1, 2026-10-06; V2-C13, A10 ruled excludeHub). dme_unmapped_fields
// could not pass `standard` (provider.json declared only limit, as a string), so `--standard=EdFi` printed CEDS rows; and
// the hub's own properties filled the backlog and the coverage denominator although the hub does not map to itself. Now:
// the standard filter is declared and resolved (unknown → refused), the hub is read from :HubDefinition and excluded,
// and every number equals the test's own Cypher.
//
//   node cli/lib.d/data-model-explorer/test/unmapped-fields-contract.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const fs = require('fs');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-9 unmappedFields / stats: standard, totals, the hub excluded' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

const providerTool = JSON.parse(fs.readFileSync(path.join(harness.dmeDirPath, 'provider.json'), 'utf8')).tools.find((oneTool) => oneTool.definition.name === 'dme_unmapped_fields');
const propertyNameList = Object.keys(providerTool.definition.input_schema.properties);
assert('provider: dme_unmapped_fields declares standard and limit, both passed as flags', propertyNameList.includes('standard') && propertyNameList.every((propertyName) => Object.keys(providerTool.cli.flagArgs).includes(propertyName)), JSON.stringify(providerTool.cli.flagArgs));
assert('  limit is an integer', (providerTool.definition.input_schema.properties.limit || {}).type === 'integer');

const MAPPED_TEST = '((f)-->(:HubReference) OR (f)-[:HAS_INSTANCE]->(:ForgedNode)-->(:HubReference))';
const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(`MATCH (h:HubDefinition) WITH h._source AS hubSource
	MATCH (f:ForgedNode {role: 'DmeProperty'})
	RETURN hubSource,
	       count(CASE WHEN f._source = 'EdFi' AND NOT ${MAPPED_TEST} THEN 1 END) AS edfiUnmappedCount,
	       count(CASE WHEN f._source <> hubSource THEN 1 END) AS nonHubPropertyCount,
	       count(CASE WHEN f._source <> hubSource AND ${MAPPED_TEST} THEN 1 END) AS nonHubMappedCount,
	       count(CASE WHEN f._source = hubSource THEN 1 END) AS hubPropertyCount,
	       count(CASE WHEN f._source <> hubSource AND NOT ${MAPPED_TEST} THEN 1 END) AS nonHubUnmappedCount`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, expected: rowList[0] });
}));
taskList.push((args, next) => runVerb(['-unmappedFields', '--standard=EdFi', '--limit=3'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const rowList = payload.unmappedRowList || [];
	assert(`--standard=EdFi: every row is EdFi, totalRowCount === ${args.expected.edfiUnmappedCount}`, rowList.length === 3 && rowList.every((oneRow) => oneRow.standard === 'EdFi') && payload.totalRowCount === args.expected.edfiUnmappedCount, JSON.stringify(payload).slice(0, 200));
	assert('  envelope: returnedRowCount 3, truncatedRowCount = total − 3', payload.returnedRowCount === 3 && payload.truncatedRowCount === payload.totalRowCount - 3);
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-unmappedFields', '--limit=5'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert(`no filter: the hub (${args.expected.hubSource}) is excluded — no row from it, totalRowCount === ${args.expected.nonHubUnmappedCount}`, (payload.unmappedRowList || []).every((oneRow) => oneRow.standard !== args.expected.hubSource) && payload.totalRowCount === args.expected.nonHubUnmappedCount && payload.hubStandard === args.expected.hubSource && payload.hubPolicy === 'excludeHub', JSON.stringify(payload).slice(0, 220));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-unmappedFields', '--limit=abc'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert('--limit=abc is refused by name (invalidLimit)', payload.refusedByName === 'unmappedFields' && payload.refusalName === 'invalidLimit', JSON.stringify(payload).slice(0, 160));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-stats'], (err, outcome) => {
	const coverage = (outcome.parsedStdout || {}).coverage || {};
	assert(`stats coverage: hubStandard ${args.expected.hubSource}, totalProperties ${args.expected.nonHubPropertyCount}, mapped ${args.expected.nonHubMappedCount}, hubPropertyCount ${args.expected.hubPropertyCount}`, coverage.hubStandard === args.expected.hubSource && coverage.totalProperties === args.expected.nonHubPropertyCount && coverage.mappedProperties === args.expected.nonHubMappedCount && coverage.hubPropertyCount === args.expected.hubPropertyCount && coverage.hubPolicy === 'excludeHub', JSON.stringify(coverage));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
