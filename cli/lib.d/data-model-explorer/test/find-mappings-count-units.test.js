#!/usr/bin/env node
'use strict';

// find-mappings-count-units.test.js — campaign P4a (acceptance iteration 2, Q1). askMilo said Birthdate had "94 rows, 60
// EXACT" while the graph holds 71 match edges into P000033 (34 EXACT, 36 BROAD, 1 NARROW). Both numbers were right about
// different things: a findMappings ROW is one (direction, element, CEDS tuple, relation, via-relation) view, so one graph
// edge is a row more than once ('incoming' through the CEDS leaf AND 'equivalent' through another matched element) and an
// instanced element is one row for all its instances. The payload never said which unit a total counted.
// Asserts, against this test's own Cypher:
//   - every count field in the payload (any key containing 'Count', at any depth) is named in countUnitByField, and the
//     envelope's rowUnit says what a row is;
//   - totalRowCountByDirection sums to totalRowCount;
//   - hubTupleSummaryList's entry for P000033 carries the graph's edges by relation (edgeCountByRelation), the distinct
//     mapped elements (an instanced element once) and the instance-carried edges, each equal to the Cypher count.
//
//   node cli/lib.d/data-model-explorer/test/find-mappings-count-units.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'P4a Q1: every findMappings total says what it counts (rows vs edges vs elements vs instances)' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

const FIXTURE_NAME = 'Birthdate';
const FIXTURE_HUB_ID = 'P000033';

// every key at any depth whose name contains 'Count' (map keys that are data — relation and standard names — never do)
const countFieldNameListOf = (payloadValue, foundNameSet = new Set()) => {
	if (Array.isArray(payloadValue)) {
		payloadValue.forEach((oneItem) => countFieldNameListOf(oneItem, foundNameSet));
		return foundNameSet;
	}
	if (payloadValue && typeof payloadValue === 'object') {
		Object.keys(payloadValue).forEach((fieldName) => {
			if (/Count/.test(fieldName)) foundNameSet.add(fieldName);
			countFieldNameListOf(payloadValue[fieldName], foundNameSet);
		});
	}
	return foundNameSet;
};

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(`MATCH (subject:ForgedNode)-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference {canonicalKey: $hubId})
	OPTIONAL MATCH (declaration:ForgedNode)-[:HAS_INSTANCE]->(subject)
	RETURN type(m) AS relation, count(*) AS edgeCount, count(DISTINCT coalesce(declaration, subject)) AS elementCount, count(declaration) AS instanceEdgeCount`, { hubId: FIXTURE_HUB_ID }, (err, rowList) => {
	if (err) { next(err, args); return; }
	const cypherByRelation = {};
	rowList.forEach((oneRow) => { cypherByRelation[oneRow.relation] = oneRow; });
	next('', { ...args, cypherByRelation });
}));
taskList.push((args, next) => runQuery(`MATCH (subject:ForgedNode)-[:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference {canonicalKey: $hubId})
	OPTIONAL MATCH (declaration:ForgedNode)-[:HAS_INSTANCE]->(subject)
	RETURN count(*) AS edgeCount, count(DISTINCT coalesce(declaration, subject)) AS elementCount`, { hubId: FIXTURE_HUB_ID }, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, cypherTotal: rowList[0] });
}));
taskList.push((args, next) => runVerb(['-findMappings', FIXTURE_NAME], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const countUnitByField = payload.countUnitByField || {};
	const undefinedCountFieldList = [...countFieldNameListOf(payload)].filter((fieldName) => fieldName !== 'countUnitByField' && typeof countUnitByField[fieldName] !== 'string');
	assert(`${FIXTURE_NAME}: every count field in the payload is named in countUnitByField`, payload.countUnitByField && undefinedCountFieldList.length === 0, `undefined: ${undefinedCountFieldList.join(', ') || '(countUnitByField absent)'}`);
	assert('  the envelope says what a row is (rowUnit), and that one edge can be more than one row', typeof payload.rowUnit === 'string' && /edge/.test(payload.rowUnit), JSON.stringify(payload.rowUnit));

	const directionTotal = Object.values(payload.totalRowCountByDirection || {}).reduce((runningTotal, oneCount) => runningTotal + oneCount, 0);
	assert(`  totalRowCountByDirection sums to totalRowCount (${payload.totalRowCount})`, payload.totalRowCountByDirection && directionTotal === payload.totalRowCount, JSON.stringify(payload.totalRowCountByDirection));

	const hubSummary = (payload.hubTupleSummaryList || []).find((oneSummary) => oneSummary.toId === FIXTURE_HUB_ID);
	assert(`  hubTupleSummaryList names ${FIXTURE_HUB_ID}`, !!hubSummary, `${(payload.hubTupleSummaryList || []).length} summaries`);
	if (hubSummary) {
		Object.keys(args.cypherByRelation).forEach((relation) => {
			const cypherRow = args.cypherByRelation[relation];
			assert(`  ${FIXTURE_HUB_ID} ${relation}: edges ${cypherRow.edgeCount}, elements ${cypherRow.elementCount} (Cypher)`,
				(hubSummary.edgeCountByRelation || {})[relation] === cypherRow.edgeCount && (hubSummary.elementCountByRelation || {})[relation] === cypherRow.elementCount,
				JSON.stringify({ edgeCountByRelation: hubSummary.edgeCountByRelation, elementCountByRelation: hubSummary.elementCountByRelation }));
		});
		const cypherInstanceEdgeCount = Object.values(args.cypherByRelation).reduce((runningTotal, oneRow) => runningTotal + oneRow.instanceEdgeCount, 0);
		assert(`  ${FIXTURE_HUB_ID}: edgeCount ${args.cypherTotal.edgeCount}, elementCount ${args.cypherTotal.elementCount}, instanceEdgeCount ${cypherInstanceEdgeCount} (Cypher)`,
			hubSummary.edgeCount === args.cypherTotal.edgeCount && hubSummary.elementCount === args.cypherTotal.elementCount && hubSummary.instanceEdgeCount === cypherInstanceEdgeCount,
			JSON.stringify({ edgeCount: hubSummary.edgeCount, elementCount: hubSummary.elementCount, instanceEdgeCount: hubSummary.instanceEdgeCount }));
		assert('  and the row total is NOT the edge total here (the reason the units must be named)', payload.totalRowCount !== hubSummary.edgeCount, `${payload.totalRowCount} rows, ${hubSummary.edgeCount} edges`);
	}
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
