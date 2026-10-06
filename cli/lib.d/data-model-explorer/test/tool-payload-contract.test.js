#!/usr/bin/env node
'use strict';

// tool-payload-contract.test.js — W-D-1 (campaign P0, 2026-10-06): the ONE declaration of what every dme_* verb returns,
// lib/toolPayloadContract.js, and the refusal doctrine (supervisor ruling 1: a refusal is STDOUT JSON with exit 0 and an
// explicit refusal field; an error stays stderr + exit 1).
//
// HERMETIC half: every dme_* tool in provider.json maps to a VERB_PAYLOAD_CONTRACT row; every dme_* description tells the
// model what a refusedByName object means; DataModelExplorer.ini and DataModelExplorerSlack.ini carry the three-way
// sentence and NOT the old "say the graph contains no such data"; refusalFor builds the declared shape and refuses an
// undeclared refusal name. LIVE half (dev graph, nothing written: every case is refused before any Cypher runs): each
// input refusal arrives on STDOUT as a refusedByName object with exit 0.
//
// P1 (2026-10-06) adds: the descriptions name each verb's row list and the envelope's totalRowCount, and listEnvelopeFor
// builds the declared shape.
//
//   node cli/lib.d/data-model-explorer/test/tool-payload-contract.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const dmeDirPath = path.join(__dirname, '..');
const contractModulePath = path.join(dmeDirPath, 'lib', 'toolPayloadContract.js');

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};
const finish = () => {
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed > 0 ? 1 : 0);
};

console.log('\n=== W-D-1: the DME tool payload contract ===\n');

if (!fs.existsSync(contractModulePath)) {
	assert('lib/toolPayloadContract.js exists', false, 'module absent');
	finish();
}
const toolPayloadContract = require(contractModulePath);
const { VERB_PAYLOAD_CONTRACT, REFUSAL_FIELD_LIST, REFUSAL_CHANNEL, ERROR_CHANNEL, refusalFor } = toolPayloadContract;
assert('the refusal channel is the ruled one (stdout JSON, exit 0)', REFUSAL_CHANNEL === 'stdout-json-exit-0', REFUSAL_CHANNEL);
assert('  and errors keep stderr + exit 1', ERROR_CHANNEL === 'stderr-exit-1', ERROR_CHANNEL);
assert('the refusal object fields are declared, refusalName among them', JSON.stringify(REFUSAL_FIELD_LIST) === JSON.stringify(['refusedByName', 'refusalName', 'reason', 'validValueList']), JSON.stringify(REFUSAL_FIELD_LIST));
assert('the module is frozen', Object.isFrozen(toolPayloadContract) && Object.isFrozen(VERB_PAYLOAD_CONTRACT));

const providerToolList = JSON.parse(fs.readFileSync(path.join(dmeDirPath, 'provider.json'), 'utf8')).tools.filter((oneTool) => /^dme_/.test(oneTool.definition.name));
const verbOfTool = (oneTool) => ((oneTool.cli.command.match(/dataModelExplorerSearch\.js -(\w+)/) || [])[1]);
const unmappedToolList = providerToolList.filter((oneTool) => !VERB_PAYLOAD_CONTRACT[verbOfTool(oneTool)]).map((oneTool) => oneTool.definition.name);
assert('every dme_* tool maps to a VERB_PAYLOAD_CONTRACT row by its verb', unmappedToolList.length === 0 && providerToolList.length >= 11, `unmapped: ${unmappedToolList.join(', ')}; ${providerToolList.length} tools`);
const unmentionedToolList = providerToolList.filter((oneTool) => !/refusedByName/.test(oneTool.definition.description)).map((oneTool) => oneTool.definition.name);
assert('every dme_* description tells the model what a refusedByName object means', unmentionedToolList.length === 0, unmentionedToolList.join(', '));
const verbWithoutToolList = Object.keys(VERB_PAYLOAD_CONTRACT).filter((oneVerb) => !providerToolList.some((oneTool) => verbOfTool(oneTool) === oneVerb));
assert('every VERB_PAYLOAD_CONTRACT row is a verb some dme_* tool runs', verbWithoutToolList.length === 0, verbWithoutToolList.join(', '));

// P1 (W-D-6..W-D-13, campaign 2026-10-06): the list verbs now EMIT the envelope, so every description names the field its
// rows live under, and every enveloped verb's description names totalRowCount (history's payload is V2-C04's, P2)
const { listEnvelopeFor } = toolPayloadContract;
const ENVELOPED_VERB_LIST = ['search', 'findMappings', 'compareCodesets', 'unmappedFields', 'explore'];
providerToolList.forEach((oneTool) => {
	const verbRow = VERB_PAYLOAD_CONTRACT[verbOfTool(oneTool)];
	if (!verbRow || !verbRow.rowListFieldName || verbOfTool(oneTool) === 'history') return;
	assert(`${oneTool.definition.name}: description names its row list '${verbRow.rowListFieldName}'`, oneTool.definition.description.includes(verbRow.rowListFieldName));
	if (ENVELOPED_VERB_LIST.includes(verbOfTool(oneTool))) assert(`  and names totalRowCount`, oneTool.definition.description.includes('totalRowCount'));
});
const builtEnvelope = listEnvelopeFor('search', [1, 2], 5);
assert('listEnvelopeFor builds { resultList, totalRowCount, returnedRowCount, truncatedRowCount }', JSON.stringify(builtEnvelope) === JSON.stringify({ resultList: [1, 2], totalRowCount: 5, returnedRowCount: 2, truncatedRowCount: 3 }), JSON.stringify(builtEnvelope));
let smallTotalText = '';
try { listEnvelopeFor('search', [1, 2], 1); } catch (envelopeError) { smallTotalText = envelopeError.message; }
assert('  and refuses a total smaller than the rows shown', /is not an integer >= the 2 rows returned/.test(smallTotalText), smallTotalText);

const builtRefusal = refusalFor('findMappings', 'emptyName', 'a reason', ['a', 'b']);
assert('refusalFor builds { refusedByName, refusalName, reason, validValueList }', JSON.stringify(builtRefusal) === JSON.stringify({ refusedByName: 'findMappings', refusalName: 'emptyName', reason: 'a reason', validValueList: ['a', 'b'] }), JSON.stringify(builtRefusal));
let undeclaredRefusalText = '';
try { refusalFor('findMappings', 'notADeclaredRefusal', 'x'); } catch (refusalError) { undeclaredRefusalText = refusalError.message; }
assert('  and refuses a refusal name its verb does not declare', /is not a refusal 'findMappings' declares/.test(undeclaredRefusalText), undeclaredRefusalText);

const hostName = os.hostname();
const configName = hostName === 'qMini.local' || hostName === 'qbook.local' ? 'instanceSpecific/qbook' : '';
const globalPromptsDirPath = `${dmeDirPath.replace(/^(.*\/system).*$/, '$1')}/configs/instanceSpecific/_globalPrompts`;
const NEW_SENTENCE = 'A tool result is one of three things: rows, an empty list with `totalRowCount: 0` (the graph holds no such data — say so), or a `refusedByName` object (your input matched nothing valid — say what was refused and offer the `validValueList`; never report it as absent data).';
['DataModelExplorer.ini', 'DataModelExplorerSlack.ini'].forEach((oneFileName) => {
	const promptText = fs.readFileSync(path.join(globalPromptsDirPath, oneFileName), 'utf8');
	assert(`${oneFileName} carries the three-way sentence`, promptText.includes(NEW_SENTENCE));
	assert(`  and no longer says "If a tool returns no rows, say the graph contains no such data"`, !promptText.includes('If a tool returns no rows, say the graph contains no such data'));
});

// ---- LIVE: refusals on stdout, exit 0
console.log(`\n--- live (dev graph; ${configName || 'default config'}; nothing written) ---`);
const runVerb = (argumentList) => {
	const run = spawnSync(process.execPath, [path.join(dmeDirPath, 'dataModelExplorerSearch.js'), ...argumentList], { encoding: 'utf8', timeout: 120000 });
	let parsedStdout = null;
	try { parsedStdout = JSON.parse(run.stdout); } catch (parseError) { parsedStdout = null; }
	return { status: run.status, parsedStdout, stderrText: run.stderr || '' };
};
const LIVE_REFUSAL_CASE_LIST = [
	{ argumentList: ['-search', ''], refusedByName: 'search', refusalName: 'emptyQuery' },
	{ argumentList: ['-findMappings', ''], refusedByName: 'findMappings', refusalName: 'emptyName' },
	{ argumentList: ['-compareCodesets', ''], refusedByName: 'compareCodesets', refusalName: 'emptyName' },
	{ argumentList: ['-explore', '--name='], refusedByName: 'explore', refusalName: 'emptyName' },
	{ argumentList: ['-rawCypher', '--query='], refusedByName: 'rawCypher', refusalName: 'emptyQuery' },
	{ argumentList: ['-rawCypher', '--query=CREATE (n:P0RefusalProbe) RETURN n'], refusedByName: 'rawCypher', refusalName: 'notReadOnly' },
	{ argumentList: ['-rawCypher', '--query=LOAD  CSV FROM "http://127.0.0.1:1/x" AS r RETURN r'], refusedByName: 'rawCypher', refusalName: 'notReadOnly' },
	{ argumentList: ['-graphRetriever', ''], refusedByName: 'graphRetriever', refusalName: 'emptyQuery' },
	{ argumentList: ['-graphRetriever', 'birth date', '--searchMode=bm25'], refusedByName: 'graphRetriever', refusalName: 'invalidSearchMode' },
	{ argumentList: ['-graphRetriever', 'birth date', '--limit=0'], refusedByName: 'graphRetriever', refusalName: 'invalidLimit' },
	{ argumentList: ['-graphRetriever', 'birth date', '--traversalMode=dynamic'], refusedByName: 'graphRetriever', refusalName: 'traversalModeRemoved' },
];
LIVE_REFUSAL_CASE_LIST.forEach(({ argumentList, refusedByName, refusalName }) => {
	const outcome = runVerb(argumentList);
	const refusalObject = outcome.parsedStdout || {};
	assert(`${argumentList.join(' ').slice(0, 70)} → exit 0, stdout { refusedByName: '${refusedByName}', refusalName: '${refusalName}' } with a reason`, outcome.status === 0 && refusalObject.refusedByName === refusedByName && refusalObject.refusalName === refusalName && typeof refusalObject.reason === 'string' && refusalObject.reason.length > 0, `exit ${outcome.status}; stdout ${JSON.stringify(outcome.parsedStdout)}; stderr ${outcome.stderrText.slice(0, 160)}`);
});
finish();
