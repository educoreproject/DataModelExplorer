#!/usr/bin/env node
'use strict';

// match-edge-confidence-reads.test.js — W-B-2 STEP A (campaign P1, 2026-10-06; V1-C09, CONTRACTS §6). The forge will stop
// writing the duplicate `confidence` on match edges (STEP B, P3); mappingConfidence is the one judged-edge confidence. So
// every DME reader moves to mappingConfidence FIRST, keeping its payload alias: after STEP B a reader still on
// `.confidence` would sort on null and print nothing. Hermetic: no source the DME or the Slack card runs may read
// `<matchEdgeVariable>.confidence`. Live control: on today's graph both properties are equal on every match edge, so the
// move changes no answer (measured: 0 of 12,681 differ).
//
//   node cli/lib.d/data-model-explorer/test/match-edge-confidence-reads.test.js [extraSourcePath ...]

const path = require('path');
const fs = require('fs');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-B-2 step A: the DME reads mappingConfidence, never the retiring confidence' });
const { assert, runQuery, finish } = harness;

const READER_SOURCE_PATH_LIST = [
	path.join(harness.dmeDirPath, 'dataModelExplorerSearch.js'),
	path.join(harness.dmeDirPath, 'traversal.cypher'),
	path.join(harness.codeRootPath, 'server', 'data-model', 'data-mapping', 'mappers', 'dme-slack.js'),
	...process.argv.slice(2),
];
// every variable a match edge is bound to in those sources (m, mNear, mFar, peerMatch); a new alias joins this list
const RETIRED_CONFIDENCE_READ_PATTERN = /\b(m|mNear|mFar|peerMatch)\.confidence\b/g;

READER_SOURCE_PATH_LIST.forEach((sourcePath) => {
	const hitList = [];
	fs.readFileSync(sourcePath, 'utf8').split('\n').forEach((lineText, lineIndex) => {
		if ((lineText.match(RETIRED_CONFIDENCE_READ_PATTERN) || []).length > 0) hitList.push(`${lineIndex + 1}: ${lineText.trim().slice(0, 90)}`);
	});
	assert(`${path.basename(sourcePath)} reads no match edge's .confidence`, hitList.length === 0, `${hitList.length} read(s): ${hitList.slice(0, 4).join(' | ')}`);
});

runQuery(`MATCH ()-[r:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference)
	RETURN count(r) AS edgeCount, count(r.mappingConfidence) AS mappingConfidenceCount,
	       count(CASE WHEN r.confidence IS NOT NULL AND r.confidence <> r.mappingConfidence THEN 1 END) AS differingCount`, {}, (err, rowList) => {
	if (err) { finish(err); return; }
	const censusRow = rowList[0];
	assert(`live control: every match edge carries mappingConfidence (${censusRow.mappingConfidenceCount} of ${censusRow.edgeCount})`, censusRow.edgeCount > 0 && censusRow.mappingConfidenceCount === censusRow.edgeCount);
	assert('live control: no edge where confidence differs from mappingConfidence (the move changes no answer today)', censusRow.differingCount === 0, `${censusRow.differingCount}`);
	finish();
});
