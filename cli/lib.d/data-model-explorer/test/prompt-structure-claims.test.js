#!/usr/bin/env node
'use strict';

// prompt-structure-claims.test.js — W-D-16 live half (campaign P1, 2026-10-06; V2-C32, V2-P07). The prompts' structure
// paragraph used to claim edges universally that the graph does not have (DmeProperty -[:HAS_SUPPORT]->, HAS_PROPERTY and
// HAS_OPTION_SET in SIF). Each structural claim the paragraph now makes is checked against the live graph, so a forge
// change that falsifies one reddens here first (campaign P3 restated the SIF, instance and rationale claims for its graph;
// the prompt edits are evidence/P3/applyPromptEditsAtMerge.py in educoreForge, applied at the merge).
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
	// ⟪campaign P3⟫ W-C-1 gives the SIF root HAS_PROPERTY to its Questions; S3 makes HAS_OPTION_SET the one option-set edge;
	// W-B-12 (a) moves the instances to DmeInstance; W-B-4 (a) puts the judge's reason on the edge
	{ claimText: 'SIF objects own Fields by HAS_FIELD', countCypher: "MATCH (:ForgedNode {_source: 'SIF260928', role: 'DmeClass'})-[r:HAS_FIELD]->() RETURN count(r) AS claimCount", expectation: 'positive' },
	{ claimText: 'a SIF Question hangs on the standard root, which owns it by HAS_PROPERTY', countCypher: "MATCH (:ForgedNode {_source: 'SIF260928', role: 'DmeStandardRoot'})-[r:HAS_PROPERTY]->(:ForgedNode {role: 'DmeProperty'}) RETURN count(r) AS claimCount", expectation: 'positive' },
	{ claimText: 'the edge to an option set is HAS_OPTION_SET in every standard', countCypher: "MATCH ()-[r:CONSTRAINED_BY]->() RETURN count(r) AS claimCount", expectation: 'zero' },
	{ claimText: 'for SIF it is read through the Question\'s Fields', countCypher: "MATCH (:ForgedNode {_source: 'SIF260928', role: 'DmeProperty'})-[:HAS_INSTANCE]->()-[r:HAS_OPTION_SET]->(:ForgedNode {role: 'DmeOptionSet'}) RETURN count(r) AS claimCount", expectation: 'positive' },
	{ claimText: 'every SIF code set is named from the elements that use it', countCypher: "MATCH (c:ForgedNode {_source: 'SIF260928', role: 'DmeOptionSet'}) WHERE c.name IS NULL OR c.name = '' RETURN count(c) AS claimCount", expectation: 'zero' },
	{ claimText: 'They never carry mappings: the INSTANCE nodes that carry SIF\'s and PESC\'s mappings are DmeInstance', countCypher: "MATCH (:ForgedNode {role: 'DmeSupport'})-[r:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->() RETURN count(r) AS claimCount", expectation: 'zero' },
	{ claimText: 'the INSTANCE nodes that carry SIF\'s and PESC\'s mappings are DmeInstance', countCypher: "MATCH (:ForgedNode {role: 'DmeInstance'})-[r:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->() RETURN count(r) AS claimCount", expectation: 'positive' },
	{ claimText: 'mappingRationale — on judged edges, the judge\'s own stated reason', countCypher: "MATCH ()-[r:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->() WHERE r.mappingKind = 'inferred' AND r.mappingRationale IS NOT NULL RETURN count(r) AS claimCount", expectation: 'positive' },
];
const taskList = new taskListPlus();
PROMPT_CLAIM_LIST.forEach(({ claimText, countCypher, expectation }) => taskList.push((args, next) => runQuery(countCypher, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	const claimCount = rowList[0].claimCount;
	assert(`the prompt says "${claimText.slice(0, 70)}" and the graph agrees (${expectation}: ${claimCount})`, promptText.includes(claimText) && (expectation === 'zero' ? claimCount === 0 : claimCount > 0));
	next('', args);
})));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
