#!/usr/bin/env node
'use strict';

// prompt-structure-claims.test.js — W-D-16 live half (campaign P1, 2026-10-06; V2-C32, V2-P07). The prompts' structure
// paragraph used to claim edges universally that the graph does not have (DmeProperty -[:HAS_SUPPORT]->, HAS_PROPERTY and
// HAS_OPTION_SET in SIF). Each structural claim the paragraph now makes is checked against the live graph, so a forge
// change that falsifies one (S3's normalisation in P3 will flip the SIF option-set claim) reddens here first.
//
//   node cli/lib.d/data-model-explorer/test/prompt-structure-claims.test.js

const path = require('path');
const fs = require('fs');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-16 every structural claim in the prompt holds on the live graph' });
const { assert, runQuery, finish, taskListPlus, pipeRunner } = harness;
const promptText = fs.readFileSync(path.join(harness.codeRootPath, '..', 'configs', 'instanceSpecific', '_globalPrompts', 'DataModelExplorer.ini'), 'utf8');

// claim text in the prompt -> the Cypher count that must be zero (or positive) for the claim to hold
const PROMPT_CLAIM_LIST = [
	{ claimText: 'No DmeProperty has HAS_SUPPORT.', countCypher: "MATCH (:ForgedNode {role: 'DmeProperty'})-[r:HAS_SUPPORT]->() RETURN count(r) AS claimCount", expectation: 'zero' },
	{ claimText: 'HAS_SUPPORT edges start only at a DmeStandardRoot.', countCypher: "MATCH (n:ForgedNode)-[r:HAS_SUPPORT]->() WHERE n.role <> 'DmeStandardRoot' RETURN count(r) AS claimCount", expectation: 'zero' },
	{ claimText: 'SIF objects own Fields by HAS_FIELD and have no HAS_PROPERTY', countCypher: "MATCH (:ForgedNode {_source: 'SIF260928'})-[r:HAS_PROPERTY]->() RETURN count(r) AS claimCount", expectation: 'zero' },
	{ claimText: 'SIF objects own Fields by HAS_FIELD', countCypher: "MATCH (:ForgedNode {_source: 'SIF260928', role: 'DmeClass'})-[r:HAS_FIELD]->() RETURN count(r) AS claimCount", expectation: 'positive' },
	{ claimText: 'HAS_OPTION_SET in CEDS, Ed-Fi and PESC and is read for SIF through the Question\'s Fields', countCypher: "MATCH (:ForgedNode {_source: 'SIF260928'})-[r:HAS_OPTION_SET]->() RETURN count(r) AS claimCount", expectation: 'zero' },
	{ claimText: 'is read for SIF through the Question\'s Fields', countCypher: "MATCH (:ForgedNode {_source: 'SIF260928', role: 'DmeProperty'})-[:HAS_INSTANCE]->()-[r:CONSTRAINED_BY|HAS_OPTION_SET]->(:ForgedNode {role: 'DmeOptionSet'}) RETURN count(r) AS claimCount", expectation: 'positive' },
];
const taskList = new taskListPlus();
PROMPT_CLAIM_LIST.forEach(({ claimText, countCypher, expectation }) => taskList.push((args, next) => runQuery(countCypher, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	const claimCount = rowList[0].claimCount;
	assert(`the prompt says "${claimText.slice(0, 70)}" and the graph agrees (${expectation}: ${claimCount})`, promptText.includes(claimText) && (expectation === 'zero' ? claimCount === 0 : claimCount > 0));
	next('', args);
})));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
