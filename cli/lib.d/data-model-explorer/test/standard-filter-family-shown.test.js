#!/usr/bin/env node
'use strict';

// standard-filter-family-shown.test.js — campaign P4a (STANDDOWN-CARDINAL_HORIZON docket 3). Since P3 a family name in a
// `standard` filter (SIF, PESC) EXPANDS to its releases, but the verbs never said so: liveInventory computed
// expandedFromFamily and the payload dropped it, so the model could not tell "PESC" from one release. Every verb that
// takes a standard now answers expandedFromFamily, expandedToSourceList and standardFilterNote when it expanded a
// family, and none of them when the value was an exact _source.
// Asserts, against this test's own Cypher (the family list):
//   - search, explore and unmappedFields with --standard=PESC carry expandedFromFamily 'PESC' and the family's releases;
//   - the same verbs with an exact _source carry no expandedFromFamily;
//   - the askMilo prompts tell the model to say so.
//
//   node cli/lib.d/data-model-explorer/test/standard-filter-family-shown.test.js [pathToDataModelExplorerSearch.js]

const fs = require('fs');
const path = require('path');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'P4a: a family-expanded standard filter says it was expanded (expandedFromFamily)' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

const FAMILY_NAME = 'PESC';
const EXACT_SOURCE = 'EdFi';
const VERB_CASE_LIST = [
	{ verbName: 'search', argumentListFor: (standardText) => ['-search', 'student birth date', `--standard=${standardText}`] },
	{ verbName: 'explore', argumentListFor: (standardText) => ['-explore', '--name=BirthDate', `--standard=${standardText}`] },
	{ verbName: 'unmappedFields', argumentListFor: (standardText) => ['-unmappedFields', `--standard=${standardText}`, '--limit=3'] },
];

// hermetic: both askMilo prompts name the field, so the model is told to mention the expansion
const promptDirPath = `${harness.dmeDirPath.replace(/^(.*\/system).*$/, '$1')}/configs/instanceSpecific/_globalPrompts`; // as tool-payload-contract.test.js finds them
['DataModelExplorer.ini', 'DataModelExplorerSlack.ini'].forEach((promptFileName) => {
	const promptText = fs.readFileSync(path.join(promptDirPath, promptFileName), 'utf8');
	assert(`${promptFileName} tells the model to say when a family was expanded (expandedFromFamily)`, /expandedFromFamily/.test(promptText));
});

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery('MATCH (d:StandardDefinition {standardFamily: $family}) RETURN d.sourceKey AS source ORDER BY source', { family: FAMILY_NAME }, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, familySourceList: rowList.map((oneRow) => oneRow.source) });
}));
VERB_CASE_LIST.forEach(({ verbName, argumentListFor }) => {
	taskList.push((args, next) => runVerb(argumentListFor(FAMILY_NAME), (err, outcome) => {
		const payload = outcome.parsedStdout || {};
		assert(`${verbName} --standard=${FAMILY_NAME}: expandedFromFamily '${FAMILY_NAME}' and expandedToSourceList = the ${args.familySourceList.length} releases (Cypher)`,
			args.familySourceList.length > 1 && payload.expandedFromFamily === FAMILY_NAME && JSON.stringify((payload.expandedToSourceList || []).slice().sort()) === JSON.stringify(args.familySourceList),
			JSON.stringify({ expandedFromFamily: payload.expandedFromFamily, expandedToSourceList: payload.expandedToSourceList, refusalName: payload.refusalName }));
		assert('  and standardFilterNote names the family', typeof payload.standardFilterNote === 'string' && payload.standardFilterNote.includes(FAMILY_NAME), JSON.stringify(payload.standardFilterNote));
		next('', args);
	}, cliFilePath));
	taskList.push((args, next) => runVerb(argumentListFor(EXACT_SOURCE), (err, outcome) => {
		const payload = outcome.parsedStdout || {};
		assert(`${verbName} --standard=${EXACT_SOURCE} (an exact _source): no expandedFromFamily`, outcome.status === 0 && !payload.refusedByName && payload.expandedFromFamily === undefined && payload.expandedToSourceList === undefined, JSON.stringify({ status: outcome.status, expandedFromFamily: payload.expandedFromFamily, refusalName: payload.refusalName }));
		next('', args);
	}, cliFilePath));
});
pipeRunner(taskList.getList(), {}, (err) => finish(err));
