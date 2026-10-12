#!/usr/bin/env node
'use strict';

// layer-scope-live.test.js — the CEDS LAYERS in the DME (lane DES, educoreForge campaign cedsRichness-101226, 2026-10-12;
// COPPER_RIVER amendment B). Layer nodes carry _source CEDS and :ForgedNode, so every verb that counts or selects a standard
// would grow CEDS by them; each such verb excludes :StandardLayer (lib/layerScope.js, the label read from the graph contract).
// PROVES, against the live graph, every number from the test's OWN Cypher:
//   (a) dme_stats bySource.CEDS and dme_list_standards' CEDS nodeCount equal CEDS's :ForgedNode count WITHOUT :StandardLayer;
//       the layers are reported apart, in layerNodeCountList, at their own count
//   (b) a name only a DES V13 element bears ('Staff Member Identification System', a V13 element V14 retired) is found by
//       NONE of findMappings, explore, grep or search — the layers are reached through dme_structure, which does find it
//   (c) dme_structure: areaProperties for 'K12 Student' returns the test's own count of placements under that DES entity;
//       propertyPlacements for P000255 returns the test's own count of its placements; classConcepts names the concepts
//       the test reads off the edges; an unknown mode is refused by name
// RED BEFORE: run with the pre-lane DME (main 2f78083) as the CLI argument, (a) and (b) fail (evidence/DES).
//
//   node cli/lib.d/data-model-explorer/test/layer-scope-live.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'lane DES: CEDS layers are out of every standard population and reached through dme_structure' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];
const DES_ONLY_NAME = 'Staff Member Identification System';

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(`MATCH (n:ForgedNode {_source: 'CEDS'}) RETURN count(CASE WHEN NOT n:StandardLayer THEN 1 END) AS cedsOwnCount, count(CASE WHEN n:StandardLayer THEN 1 END) AS cedsLayerCount`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, counts: rowList[0] });
}));
taskList.push((args, next) => {
	assert('the graph carries CEDS layer nodes (this gate needs a layered graph)', args.counts.cedsLayerCount > 0, JSON.stringify(args.counts));
	next('', args);
});
taskList.push((args, next) => runVerb(['-stats'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert(`(a) stats bySource.CEDS === ${args.counts.cedsOwnCount} (CEDS without its layers)`, (payload.bySource || {}).CEDS === args.counts.cedsOwnCount, JSON.stringify(payload.bySource));
	const layerTotal = (payload.layerNodeCountList || []).filter((oneRow) => oneRow.standard === 'CEDS').reduce((runningTotal, oneRow) => runningTotal + oneRow.nodeCount, 0);
	assert(`(a) stats layerNodeCountList for CEDS sums to ${args.counts.cedsLayerCount}`, layerTotal === args.counts.cedsLayerCount, JSON.stringify(payload.layerNodeCountList));
	assert('(a) stats byRole lists no layer role', !Object.keys(payload.byRole || {}).some((role) => ['DmeLayerRoot', 'DmeArea', 'DmeLayerElement', 'DmePlacement', 'DmeConcept', 'DmeTextRepair'].indexOf(role) !== -1), Object.keys(payload.byRole || {}).join(','));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-listStandards'], (err, outcome) => {
	const cedsRow = ((outcome.parsedStdout || {}).standards || []).find((oneRow) => oneRow.source === 'CEDS') || {};
	assert(`(a) listStandards CEDS nodeCount === ${args.counts.cedsOwnCount}`, cedsRow.nodeCount === args.counts.cedsOwnCount, JSON.stringify(cedsRow.nodeCount));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-findMappings', DES_ONLY_NAME], (err, outcome) => {
	assert(`(b) findMappings '${DES_ONLY_NAME}' matches nothing (a DES V13 element is not a standard element)`, (outcome.parsedStdout || {}).refusalName === 'nothingMatched' || (outcome.parsedStdout || {}).matchedNodeCount === 0, JSON.stringify(outcome.parsedStdout).slice(0, 200));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-explore', `--name=${DES_ONLY_NAME}`], (err, outcome) => {
	assert(`(b) explore '${DES_ONLY_NAME}' matches nothing`, (outcome.parsedStdout || {}).refusalName === 'nothingMatched', JSON.stringify(outcome.parsedStdout).slice(0, 200));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-grep', `--pattern=^${DES_ONLY_NAME}$`], (err, outcome) => {
	assert(`(b) grep ^${DES_ONLY_NAME}$ finds 0 nodes`, (outcome.parsedStdout || {}).totalRowCount === 0, JSON.stringify(outcome.parsedStdout).slice(0, 200));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runQuery(`MATCH (area:StandardLayer {role: 'DmeArea', name: 'K12 Student'})-[:HAS_DES_ENTITY|HAS_DES_CATEGORY*0..5]->()-[:HAS_DES_PLACEMENT]->(placement) RETURN count(placement) AS placementCount`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	runVerb(['-structure', '--mode=areaProperties', '--name=K12 Student'], (verbError, outcome) => {
		assert(`(c) structure areaProperties 'K12 Student' totalRowCount === ${rowList[0].placementCount} (the test's placements under it)`, (outcome.parsedStdout || {}).totalRowCount === rowList[0].placementCount, JSON.stringify(outcome.parsedStdout).slice(0, 200));
		next('', args);
	}, cliFilePath);
}));
taskList.push((args, next) => runQuery(`MATCH (p:ForgedNode {role: 'DmeProperty', cedsId: 'P000255'})<-[:PLACES_PROPERTY]-(placement) RETURN count(placement) AS placementCount`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	runVerb(['-structure', '--mode=propertyPlacements', '--name=P000255'], (verbError, outcome) => {
		const row = ((outcome.parsedStdout || {}).rowList || [])[0] || {};
		assert(`(c) structure propertyPlacements P000255 lists ${rowList[0].placementCount} DES placements`, (row.desPlacementList || []).length === rowList[0].placementCount, JSON.stringify(row).slice(0, 200));
		assert('(c)   and its DES V13 element prose, labelled V13', row.desV13Element && row.desV13Element.desVersion === '13', JSON.stringify(row.desV13Element));
		next('', args);
	}, cliFilePath);
}));
taskList.push((args, next) => runQuery(`MATCH (c:ForgedNode {role: 'DmeClass', cedsId: 'C200013'})-[:HAS_PRIMARY_CONCEPT]->(primaryConcept) OPTIONAL MATCH (c)-[:HAS_SECONDARY_CONCEPT]->(secondaryConcept) RETURN primaryConcept.name AS primaryConcept, secondaryConcept.name AS secondaryConcept`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	runVerb(['-structure', '--mode=classConcepts', '--name=C200013'], (verbError, outcome) => {
		const row = ((outcome.parsedStdout || {}).rowList || [])[0] || {};
		assert(`(c) structure classConcepts C200013 names ${rowList[0].primaryConcept} / ${rowList[0].secondaryConcept}`, row.primaryConcept === rowList[0].primaryConcept && row.secondaryConcept === rowList[0].secondaryConcept, JSON.stringify(row));
		next('', args);
	}, cliFilePath);
}));
taskList.push((args, next) => runVerb(['-structure', '--mode=nonsense'], (err, outcome) => {
	assert('(c) an unknown structure mode is refused by name', (outcome.parsedStdout || {}).refusalName === 'invalidStructureMode', JSON.stringify(outcome.parsedStdout).slice(0, 200));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
