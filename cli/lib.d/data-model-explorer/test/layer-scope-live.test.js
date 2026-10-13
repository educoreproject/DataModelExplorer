#!/usr/bin/env node
'use strict';

// layer-scope-live.test.js — the CEDS LAYERS in the DME (lane DES, educoreForge campaign cedsRichness-101226, 2026-10-12;
// COPPER_RIVER amendment B; lane UNDES, 2026-10-13, removed the V13 structure layer, leaving guide and textRepair). Layer nodes
// carry _source CEDS and :ForgedNode, so every verb that counts or selects a standard would grow CEDS by them; each such verb
// excludes :StandardLayer (lib/layerScope.js, the label read from the graph contract).
// PROVES, against the live graph, every number from the test's OWN Cypher:
//   (a) dme_stats bySource.CEDS and dme_list_standards' CEDS nodeCount equal CEDS's :ForgedNode count WITHOUT :StandardLayer;
//       the layers are reported apart, in layerNodeCountList, at their own count
//   (b) a name only a text REPAIR bears (the IDS spelling 'Santa Inés Yatzechi Zapotec'; the CEDS node writes U+FFFD) is found
//       by NONE of findMappings, explore or grep; explore of the CEDS node's own (faithful) name shows the repair BESIDE it
//   (c) dme_structure: classConcepts names the concepts the test reads off the edges; propertyConcepts lists, in the guide's
//       order, the event-date concepts the test reads for its own chosen property; a removed mode and an unknown mode are
//       refused by name
// RED BEFORE: run with the pre-lane DME (main 2f78083) as the CLI argument, (a) and (b) fail (evidence/DES); run with lane
// DES's DME (348beb0), (c)'s propertyConcepts and the removed-mode refusal fail (evidence/UNDES).
//
//   node cli/lib.d/data-model-explorer/test/layer-scope-live.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'lanes DES and UNDES: CEDS layers are out of every standard population and reached through dme_structure and explore' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];
const REPAIR_ONLY_NAME = 'Santa Inés Yatzechi Zapotec';
const LAYER_ROLE_LIST = ['DmeLayerRoot', 'DmeConcept', 'DmeTextRepair'];

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
	assert('(a) stats byRole lists no layer role', !Object.keys(payload.byRole || {}).some((role) => LAYER_ROLE_LIST.indexOf(role) !== -1), Object.keys(payload.byRole || {}).join(','));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-listStandards'], (err, outcome) => {
	const cedsRow = ((outcome.parsedStdout || {}).standards || []).find((oneRow) => oneRow.source === 'CEDS') || {};
	assert(`(a) listStandards CEDS nodeCount === ${args.counts.cedsOwnCount}`, cedsRow.nodeCount === args.counts.cedsOwnCount, JSON.stringify(cedsRow.nodeCount));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-findMappings', REPAIR_ONLY_NAME], (err, outcome) => {
	assert(`(b) findMappings '${REPAIR_ONLY_NAME}' matches nothing (a text repair is not a standard element)`, (outcome.parsedStdout || {}).refusalName === 'nothingMatched' || (outcome.parsedStdout || {}).matchedNodeCount === 0, JSON.stringify(outcome.parsedStdout).slice(0, 200));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-explore', `--name=${REPAIR_ONLY_NAME}`], (err, outcome) => {
	assert(`(b) explore '${REPAIR_ONLY_NAME}' matches nothing`, (outcome.parsedStdout || {}).refusalName === 'nothingMatched', JSON.stringify(outcome.parsedStdout).slice(0, 200));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-grep', `--pattern=^${REPAIR_ONLY_NAME}$`], (err, outcome) => {
	assert(`(b) grep ^${REPAIR_ONLY_NAME}$ finds 0 nodes`, (outcome.parsedStdout || {}).totalRowCount === 0, JSON.stringify(outcome.parsedStdout).slice(0, 200));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runQuery(`MATCH (repair:StandardLayer {role: 'DmeTextRepair', repairedText: $repairedText, repairedPropertyName: 'name'})-[:REPAIRS_TEXT_OF]->(term) RETURN term.name AS faithfulName, repair.repairedText AS repairedText LIMIT 1`, { repairedText: REPAIR_ONLY_NAME }, (err, rowList) => {
	if (err) { next(err, args); return; }
	const faithfulName = (rowList[0] || {}).faithfulName;
	assert('(b) the graph carries the repair, and the CEDS term keeps its faithful U+FFFD text', typeof faithfulName === 'string' && faithfulName.indexOf('\uFFFD') !== -1, JSON.stringify(rowList));
	runVerb(['-explore', `--name=${faithfulName}`], (verbError, outcome) => {
		const exploreText = JSON.stringify(outcome.parsedStdout || {});
		assert(`(b) explore of the faithful name shows the repair BESIDE it (REPAIRS_TEXT_OF, repairedText '${REPAIR_ONLY_NAME}')`, exploreText.indexOf('REPAIRS_TEXT_OF') !== -1 && exploreText.indexOf(`"repairedText":"${REPAIR_ONLY_NAME}"`) !== -1, exploreText.slice(0, 300));
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
taskList.push((args, next) => runQuery(`MATCH (p:ForgedNode {role: 'DmeProperty'})-[e:HAS_EVENT_DATE_CONCEPT]->(concept) WHERE NOT p:StandardLayer WITH p, e, concept ORDER BY p.cedsId, e.conceptOrdinal WITH p, collect(concept.name) AS conceptNameList ORDER BY size(conceptNameList) DESC, p.cedsId LIMIT 1 RETURN p.cedsId AS propertyId, conceptNameList`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	const expected = rowList[0] || {};
	runVerb(['-structure', '--mode=propertyConcepts', `--name=${expected.propertyId}`], (verbError, outcome) => {
		const row = ((outcome.parsedStdout || {}).rowList || [])[0] || {};
		assert(`(c) structure propertyConcepts ${expected.propertyId} lists ${JSON.stringify(expected.conceptNameList)} in the guide's order`, JSON.stringify(row.guideV14EventDateConceptList) === JSON.stringify(expected.conceptNameList) && (expected.conceptNameList || []).length > 0, JSON.stringify(outcome.parsedStdout).slice(0, 300));
		next('', args);
	}, cliFilePath);
}));
taskList.push((args, next) => runVerb(['-structure', '--mode=areaProperties', '--name=K12 Student'], (err, outcome) => {
	assert('(c) a removed structure mode (areaProperties) is refused by name', (outcome.parsedStdout || {}).refusalName === 'invalidStructureMode', JSON.stringify(outcome.parsedStdout).slice(0, 200));
	next('', args);
}, cliFilePath));
taskList.push((args, next) => runVerb(['-structure', '--mode=nonsense'], (err, outcome) => {
	assert('(c) an unknown structure mode is refused by name', (outcome.parsedStdout || {}).refusalName === 'invalidStructureMode', JSON.stringify(outcome.parsedStdout).slice(0, 200));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
