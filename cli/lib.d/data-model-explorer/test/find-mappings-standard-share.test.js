#!/usr/bin/env node
'use strict';

// find-mappings-standard-share.test.js — within each relation's share of findMappings' 30 rows, one standard must not
// crowd out the others (TQ "do those five", item 5, 2026-10-05). Before this, BirthDate's EXACT share was filled by
// 0.9-confidence rows from SIF and PESC and Ed-Fi's three 0.7 EXACT rows never showed. Live: runs the CLI against the
// graph the DME config points at. Checks, on BirthDate:
//   - every standard with a match edge into a CEDS 'Birthdate…' hub (direct count, independent of findMappings,
//     instances counted as their declaration) shows at least one row — Ed-Fi named explicitly;
//   - within each relation, the rows are shared round-robin: a relation showing N rows over S standards shows
//     min(N, S) distinct standards;
//   - the result reports totalRowCountByRelationAndStandard / truncatedRowCountByRelationAndStandard, and for every
//     relation and standard shown + truncated = total, and the per-standard totals sum to totalRowCountByRelation.
//
//   node cli/lib.d/data-model-explorer/test/find-mappings-standard-share.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const { execFileSync } = require('child_process');

const searchModulePath = process.argv[2] || path.join(__dirname, '..', 'dataModelExplorerSearch.js');
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

const directStandardList = runCli(['-rawCypher', `--query=MATCH (cedsElement:ForgedNode {_source: 'CEDS'})<-[:HAS_CEDS_PROPERTY]-(:HubReference)<-[:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(mappedElement:ForgedNode)
	WHERE toLower(cedsElement.name) CONTAINS 'birthdate'
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

MATCH_EDGE_TYPE_LIST.forEach((edgeType) => {
	const totalByStandard = result.totalRowCountByRelationAndStandard[edgeType] || {};
	const truncatedByStandard = result.truncatedRowCountByRelationAndStandard[edgeType] || {};
	const relationRowList = result.mappingRowList.filter((row) => rowRelationOf(row) === edgeType);
	const relationStandardCount = Object.keys(totalByStandard).length;
	const shownStandardCount = new Set(relationRowList.map((row) => row.fromSource)).size;
	assert(`${edgeType}: ${relationRowList.length} rows over ${relationStandardCount} standards show ${shownStandardCount} = min(rows, standards)`,
		shownStandardCount === Math.min(relationRowList.length, relationStandardCount));
	const standardTotalSum = Object.values(totalByStandard).reduce((runningSum, standardTotal) => runningSum + standardTotal, 0);
	assert(`${edgeType}: per-standard totals sum to the relation total (${standardTotalSum})`, standardTotalSum === (result.totalRowCountByRelation[edgeType] || 0));
	Object.keys(totalByStandard).forEach((standardName) => {
		const shownCount = relationRowList.filter((row) => row.fromSource === standardName).length;
		assert(`${edgeType} ${standardName}: shown ${shownCount} + truncated ${truncatedByStandard[standardName]} = total ${totalByStandard[standardName]}`,
			shownCount + truncatedByStandard[standardName] === totalByStandard[standardName]);
	});
});
finish();
