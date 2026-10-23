#!/usr/bin/env node
'use strict';

// find-mappings-standard-share.test.js — within each relation's share of findMappings' 30 rows, one standard must not
// crowd out the others (TQ "do those five", item 5, 2026-10-05). Before this, BirthDate's EXACT share was filled by
// 0.9-confidence rows from SIF and PESC and Ed-Fi's three 0.7 EXACT rows never showed. Live: runs the CLI against the
// graph the DME config points at. Checks, on BirthDate:
//   - every standard with a match edge into a CEDS 'Birthdate…' hub (direct count, independent of findMappings,
//     instances counted as their declaration) shows at least one row — Ed-Fi named explicitly;
//   - within each HUB and relation, the rows are shared round-robin: N rows over S standards show min(N, S) distinct
//     standards (per hub since ctdlHub P7);
//   - the result reports totalRowCountByRelationAndStandard / truncatedRowCountByRelationAndStandard, and for every
//     relation and standard shown + truncated = total, and the per-standard totals sum to totalRowCountByRelation.
//
//   node cli/lib.d/data-model-explorer/test/find-mappings-standard-share.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const { execFileSync } = require('child_process');

const searchModulePath = process.argv[2] || path.join(__dirname, '..', 'dataModelExplorerSearch.js');
// ⟪lane R6⟫ the card reaches its property through its OWN hub's slot edge, read from the contract (no hub literal)
const { cardHubSlotEdgeTypeTextFor } = require(path.join(__dirname, '..', 'lib', 'toolPayloadContract'));
const MATCH_EDGE_TYPE_LIST = ['EXACT_MATCH', 'CLOSE_MATCH', 'BROAD_MATCH', 'NARROW_MATCH'];

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
const runCli = (argumentList) => JSON.parse(execFileSync('node', [searchModulePath, ...argumentList], { cwd: path.dirname(searchModulePath), encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 }));

console.log('\n=== findMappings standard share within each relation (BirthDate) ===\n');

const directStandardList = runCli(['-rawCypher', `--query=MATCH (cedsElement:ForgedNode {_source: 'CEDS'})<-[slotEdge]-(card:HubReference)<-[:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(mappedElement:ForgedNode)
	WHERE type(slotEdge) = ${cardHubSlotEdgeTypeTextFor('card', 'PROPERTY')} AND toLower(cedsElement.name) CONTAINS 'birthdate'
	RETURN DISTINCT coalesce(head([(declaration:ForgedNode)-[:HAS_INSTANCE]->(mappedElement) | declaration._source]), mappedElement._source) AS standardName
	ORDER BY standardName`]).records.map((record) => record.standardName);
assert('the direct count finds Ed-Fi among the standards mapped to Birthdate', directStandardList.includes('EdFi'), JSON.stringify(directStandardList));

const result = runCli(['-findMappings', 'BirthDate']);
const rowRelationOf = (row) => {
	if (['BROAD_MATCH', 'NARROW_MATCH'].includes(row.mappingType)) return row.mappingType;
	if (['BROAD_MATCH', 'NARROW_MATCH'].includes(row.viaMatchType)) return row.viaMatchType;
	if (row.mappingType === 'CLOSE_MATCH' || row.viaMatchType === 'CLOSE_MATCH') return 'CLOSE_MATCH';
	return 'EXACT_MATCH';
};
const shownStandardSet = new Set(result.mappingRowList.map((row) => row.fromSource));
directStandardList.forEach((standardName) => {
	assert(`a row from ${standardName} is shown`, shownStandardSet.has(standardName));
});

const hasStandardShape = result.totalRowCountByRelationAndStandard && result.truncatedRowCountByRelationAndStandard;
assert('result carries totalRowCountByRelationAndStandard and truncatedRowCountByRelationAndStandard', !!hasStandardShape);
if (!hasStandardShape) { finish(); }

// ⟪lane zbE⟫ the round-robin runs PER HUB (ctdlHub P7): each hub's rows of a relation are shared across the standards
// mapped to THAT hub. The one shared check this test made went red on the first graph with CTDL match edges
// (DEV_b3Rehearsal), so it is made hub by hub, from findMappings' per-hub split (totalRowCountByHubRelationAndStandard)
const hasHubShape = result.totalRowCountByHubRelationAndStandard && result.truncatedRowCountByHubRelationAndStandard;
assert('result carries totalRowCountByHubRelationAndStandard and truncatedRowCountByHubRelationAndStandard', !!hasHubShape);
if (!hasHubShape) { finish(); }
Object.keys(result.totalRowCountByHubRelationAndStandard).forEach((hubName) => {
	MATCH_EDGE_TYPE_LIST.forEach((edgeType) => {
		const totalByStandard = result.totalRowCountByHubRelationAndStandard[hubName][edgeType] || {};
		const truncatedByStandard = (result.truncatedRowCountByHubRelationAndStandard[hubName] || {})[edgeType] || {};
		const relationRowList = result.mappingRowList.filter((row) => row.hubName === hubName && rowRelationOf(row) === edgeType);
		const relationStandardCount = Object.keys(totalByStandard).length;
		const shownStandardCount = new Set(relationRowList.map((row) => row.fromSource)).size;
		assert(`${hubName} ${edgeType}: ${relationRowList.length} rows over ${relationStandardCount} standards show ${shownStandardCount} = min(rows, standards)`,
			shownStandardCount === Math.min(relationRowList.length, relationStandardCount));
		Object.keys(totalByStandard).forEach((standardName) => {
			const shownCount = relationRowList.filter((row) => row.fromSource === standardName).length;
			assert(`${hubName} ${edgeType} ${standardName}: shown ${shownCount} + truncated ${truncatedByStandard[standardName]} = total ${totalByStandard[standardName]}`,
				shownCount + truncatedByStandard[standardName] === totalByStandard[standardName]);
		});
	});
});
// the summed totals still agree with the per-hub split, relation by relation and standard by standard
MATCH_EDGE_TYPE_LIST.forEach((edgeType) => {
	const totalByStandard = result.totalRowCountByRelationAndStandard[edgeType] || {};
	const standardTotalSum = Object.values(totalByStandard).reduce((runningSum, standardTotal) => runningSum + standardTotal, 0);
	assert(`${edgeType}: per-standard totals sum to the relation total (${standardTotalSum})`, standardTotalSum === (result.totalRowCountByRelation[edgeType] || 0));
	const hubSplitTotal = Object.values(result.totalRowCountByHubRelationAndStandard).reduce((runningSum, hubSplit) => runningSum + Object.values(hubSplit[edgeType] || {}).reduce((hubSum, oneCount) => hubSum + oneCount, 0), 0);
	assert(`${edgeType}: the per-hub split sums to the relation total (${hubSplitTotal})`, hubSplitTotal === (result.totalRowCountByRelation[edgeType] || 0));
});
finish();
