#!/usr/bin/env node
'use strict';

// provider-input-contract.test.js — W-D-20 (campaign P1, 2026-10-06; V2-S25). Three things described one verb's inputs:
// provider.json's input_schema (what the model may send), cli.flagArgs/positionalArgs (what toolHandler passes) and the
// CLI parser (what the verb reads). They disagreed: dme_unmapped_fields declared no standard (so the model could never
// filter), dme_history declared a standard nothing read, and limit was a string in one place. One registry,
// toolPayloadContract.VERB_INPUT_CONTRACT, now drives the parser, and this hermetic gate holds provider.json to it. LIVE
// half: a flag the verb does not take is refused by name instead of silently ignored.
//
//   node cli/lib.d/data-model-explorer/test/provider-input-contract.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const fs = require('fs');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-20 provider input_schema = flagArgs ∪ positionalArgs = VERB_INPUT_CONTRACT' });
const { assert, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];
const { VERB_INPUT_CONTRACT } = require(path.join(harness.dmeDirPath, 'lib', 'toolPayloadContract'));

const providerToolList = JSON.parse(fs.readFileSync(path.join(harness.dmeDirPath, 'provider.json'), 'utf8')).tools.filter((oneTool) => /^dme_/.test(oneTool.definition.name));
const sortedText = (oneList) => JSON.stringify([...oneList].sort());
assert('VERB_INPUT_CONTRACT is declared', !!VERB_INPUT_CONTRACT);
providerToolList.forEach((oneTool) => {
	const verbName = (oneTool.cli.command.match(/dataModelExplorerSearch\.js -(\w+)/) || [])[1];
	const inputRow = (VERB_INPUT_CONTRACT || {})[verbName];
	const schemaNameList = Object.keys(oneTool.definition.input_schema.properties || {});
	const passedNameList = [...(oneTool.cli.positionalArgs || []), ...Object.keys(oneTool.cli.flagArgs || {})];
	assert(`${oneTool.definition.name}: input_schema properties = positionalArgs ∪ flagArgs`, sortedText(schemaNameList) === sortedText(passedNameList), `${sortedText(schemaNameList)} vs ${sortedText(passedNameList)}`);
	assert(`  = the registry's inputs for -${verbName}`, !!inputRow && sortedText(schemaNameList) === sortedText([...inputRow.positionalList, ...inputRow.flagList]), inputRow ? sortedText([...inputRow.positionalList, ...inputRow.flagList]) : 'no registry row');
	assert('  every flagArgs value is --<its name>', Object.entries(oneTool.cli.flagArgs || {}).every(([inputName, flagText]) => flagText === `--${inputName}`));
	const limitProperty = (oneTool.definition.input_schema.properties || {}).limit;
	if (limitProperty) assert('  limit is typed integer', limitProperty.type === 'integer', limitProperty.type);
});

const taskList = new taskListPlus();
[['-history', '--standard=EdFi'], ['-findMappings', 'BirthDate', '--standard=EdFi'], ['-stats', '--limit=3']].forEach((argumentList) => taskList.push((args, next) => runVerb(argumentList, (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert(`${argumentList.join(' ')} → refused by name (unknownFlag), not silently ignored`, outcome.status === 0 && payload.refusalName === 'unknownFlag' && /does not take --/.test(payload.reason || ''), JSON.stringify(payload).slice(0, 160));
	next('', args);
}, cliFilePath)));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
