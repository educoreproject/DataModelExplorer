#!/usr/bin/env node
'use strict';

// find-mappings-relation-cap.test.js — findMappings must never silently drop a whole match relation
// (ruling 2026-10-04). Runs the CLI against the graph the DME config points at (live), so it needs that
// graph up. Checks, on Birthdate (a hub with 300+ EXACT rows, which once crowded every BROAD row out):
//   - the result carries mappingRowList, totalRowCountByRelation, truncatedRowCountByRelation;
//   - PESC 'Birthday' (BROAD_MATCH to Birthdate) is among the rows;
//   - every relation present got min(its total, the per-relation share) rows;
//   - shown + truncated = total, per relation, and the cap holds.
//
//   node cli/lib.d/data-model-explorer/test/find-mappings-relation-cap.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const { execFileSync } = require('child_process');

const searchModulePath = process.argv[2] || path.join(__dirname, '..', 'dataModelExplorerSearch.js');
const ROW_CAP = 30;
const MATCH_EDGE_TYPE_LIST = ['EXACT_MATCH', 'CLOSE_MATCH', 'BROAD_MATCH', 'NARROW_MATCH'];
const ROWS_PER_RELATION = Math.floor(ROW_CAP / MATCH_EDGE_TYPE_LIST.length);

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};

const outputText = execFileSync('node', [searchModulePath, '-findMappings', 'BirthDate'], { cwd: path.dirname(searchModulePath), encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
const result = JSON.parse(outputText);

console.log('\n=== findMappings relation cap (BirthDate) ===\n');
const hasShape = result && Array.isArray(result.mappingRowList) && result.truncatedRowCountByRelation && result.totalRowCountByRelation;
assert('result carries mappingRowList, totalRowCountByRelation, truncatedRowCountByRelation', hasShape, Array.isArray(result) ? 'got a bare array' : '');
if (!hasShape) { finish(); }

const rowRelationOf = (row) => {
	if (['BROAD_MATCH', 'NARROW_MATCH'].includes(row.mappingType)) return row.mappingType;
	if (['BROAD_MATCH', 'NARROW_MATCH'].includes(row.viaMatchType)) return row.viaMatchType;
	if (row.mappingType === 'CLOSE_MATCH' || row.viaMatchType === 'CLOSE_MATCH') return 'CLOSE_MATCH';
	return 'EXACT_MATCH';
};
const shownCountByRelation = {};
MATCH_EDGE_TYPE_LIST.forEach((edgeType) => { shownCountByRelation[edgeType] = 0; });
result.mappingRowList.forEach((row) => { shownCountByRelation[rowRelationOf(row)] += 1; });

assert(`at most ${ROW_CAP} rows`, result.mappingRowList.length <= ROW_CAP, `${result.mappingRowList.length}`);
assert("PESC 'Birthday' BROAD_MATCH row is shown",
	result.mappingRowList.some((row) => row.fromName === 'Birthday' && /^PESC/.test(row.fromSource) && rowRelationOf(row) === 'BROAD_MATCH'));
MATCH_EDGE_TYPE_LIST.forEach((edgeType) => {
	const totalCount = result.totalRowCountByRelation[edgeType] || 0;
	assert(`${edgeType}: shown ${shownCountByRelation[edgeType]} >= min(total ${totalCount}, ${ROWS_PER_RELATION})`,
		shownCountByRelation[edgeType] >= Math.min(totalCount, ROWS_PER_RELATION));
	assert(`${edgeType}: shown + truncated = total`,
		shownCountByRelation[edgeType] + result.truncatedRowCountByRelation[edgeType] === totalCount,
		`${shownCountByRelation[edgeType]} + ${result.truncatedRowCountByRelation[edgeType]} vs ${totalCount}`);
});
finish();

function finish() {
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed > 0 ? 1 : 0);
}
