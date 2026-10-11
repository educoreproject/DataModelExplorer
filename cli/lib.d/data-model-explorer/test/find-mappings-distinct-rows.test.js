#!/usr/bin/env node
'use strict';

// find-mappings-distinct-rows.test.js — W-D-7 (campaign P1, 2026-10-06; V2-C11). findMappings' arms run once per matched
// node, and `n` is not a returned column, so two matched nodes reaching one (element, hub, relation) produced two
// identical rows and the totals counted occurrences. totalRowCount counts DISTINCT mappings (CONTRACTS §14).
// Asserts: no two rows agree on every FIND_MAPPINGS_ROW_IDENTITY_FIELD_LIST field, and each relation's total equals a
// distinct count the verb's own rows define.
//
//   node cli/lib.d/data-model-explorer/test/find-mappings-distinct-rows.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-7 findMappings rows are distinct mappings' });
const { assert, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];
const { FIND_MAPPINGS_ROW_IDENTITY_FIELD_LIST } = require(path.join(harness.dmeDirPath, 'lib', 'toolPayloadContract'));
const ROW_IDENTITY_FIELD_LIST = FIND_MAPPINGS_ROW_IDENTITY_FIELD_LIST;

const taskList = new taskListPlus();
['BirthDate', 'Birthdate', 'Sex', 'BirthCity'].forEach((nameText) => taskList.push((args, next) => runVerb(['-findMappings', nameText], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const rowList = payload.mappingRowList || [];
	const identityTextList = rowList.map((oneRow) => JSON.stringify(ROW_IDENTITY_FIELD_LIST.map((fieldName) => oneRow[fieldName] === undefined ? null : oneRow[fieldName])));
	const duplicateIdentityList = identityTextList.filter((identityText, rowIndex) => identityTextList.indexOf(identityText) !== rowIndex);
	assert(`${nameText}: no two of ${rowList.length} rows are the same mapping`, rowList.length > 0 && duplicateIdentityList.length === 0, duplicateIdentityList.slice(0, 2).join(' | '));
	// when nothing is truncated every row is shown, so the distinct rows shown ARE the total
	const truncatedCount = Object.values(payload.truncatedRowCountByRelation || {}).reduce((runningTotal, oneCount) => runningTotal + oneCount, 0);
	const relationTotal = Object.values(payload.totalRowCountByRelation || {}).reduce((runningTotal, oneCount) => runningTotal + oneCount, 0);
	if (truncatedCount === 0) assert(`  untruncated: Σ totalRowCountByRelation (${relationTotal}) === distinct rows shown`, relationTotal === new Set(identityTextList).size);
	else assert(`  truncated: Σ totalRowCountByRelation (${relationTotal}) === shown ${rowList.length} + truncated ${truncatedCount}`, relationTotal === rowList.length + truncatedCount);
	next('', args);
}, cliFilePath)));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
