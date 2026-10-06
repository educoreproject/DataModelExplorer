#!/usr/bin/env node
'use strict';

// traversal-sif-codeset.test.js — W-D-4 (campaign P1, 2026-10-06; DME half of S3, V2-C27). The traversal must read the
// edges SIF and Ed-Fi/PESC actually write:
//   - option sets: SIF hangs a code set off the INSTANCE (Question -[:HAS_INSTANCE]-> Field -[:CONSTRAINED_BY]-> Codeset),
//     never off the Question the search hits, so optionSets needs an instance hop whatever the edge is called (S3 ruled
//     F+Q: the forge normalises to HAS_OPTION_SET in P3; the hop stays). Every SIF code set lacks `name`, so entries carry
//     path and valueCount, and optionSetCount is the list's total.
//   - intra-standard references: REFERENCES_TYPE (Ed-Fi, PESC) and REFERENCES_OBJECT (SIF) beside REFERENCES, each entry
//     naming its edge type.
// Each fixture is picked by the test's own Cypher and seeded with its own stored embedding.
//
//   node cli/lib.d/data-model-explorer/test/traversal-sif-codeset.test.js [pathToTraversal.cypher]

const path = require('path');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-4 traversal reads CONSTRAINED_BY through instances, REFERENCES_TYPE and REFERENCES_OBJECT' });
const { assert, runQuery, finish, neo4j, taskListPlus, pipeRunner, readText } = harness;
const traversalFilePath = process.argv[2] || path.join(harness.dmeDirPath, 'traversal.cypher');

const FIXTURE_CYPHER_BY_NAME = {
	// a Question whose searchText no OTHER Question shares (campaign P2, R1): the vector index is approximate, and among
	// identical-text Questions (identical vectors) its top 5 need not include the seed itself — on the R1 replay the first
	// Question by stableId shared its text with four others and was not among its own hits, though it was on the gold
	sifQuestionWithCodeset: `MATCH (s:ForgedNode {role: 'DmeProperty', _source: 'SIF260928'}) WHERE s.embedding IS NOT NULL
		WITH s.searchText AS sharedSearchText, collect(s) AS sameTextList WHERE size(sameTextList) = 1 WITH sameTextList[0] AS q
		MATCH (q)-[:HAS_INSTANCE]->(:ForgedNode)-[:CONSTRAINED_BY]->(c:ForgedNode {role: 'DmeOptionSet'})
		WITH q, count(DISTINCT c) AS expectedOptionSetCount ORDER BY q.stableId LIMIT 1
		RETURN q.stableId AS stableId, q.embedding AS embedding, expectedOptionSetCount`,
	cedsPropertyWithOptionSet: `MATCH (p:ForgedNode {role: 'DmeProperty', _source: 'CEDS'})-[:HAS_OPTION_SET]->(os:ForgedNode {role: 'DmeOptionSet'})
		WHERE p.embedding IS NOT NULL WITH p, count(DISTINCT os) AS expectedOptionSetCount ORDER BY p.stableId LIMIT 1
		RETURN p.stableId AS stableId, p.embedding AS embedding, expectedOptionSetCount`,
	edfiPropertyWithReferencesType: `MATCH (p:ForgedNode {role: 'DmeProperty', _source: 'EdFi'})-[:REFERENCES_TYPE]->(t:ForgedNode)
		WHERE p.embedding IS NOT NULL WITH p, count(DISTINCT t) AS expectedReferenceCount ORDER BY p.stableId LIMIT 1
		RETURN p.stableId AS stableId, p.embedding AS embedding, expectedReferenceCount`,
};

const runTraversalFor = (args, fixtureName, callback) => runQuery(FIXTURE_CYPHER_BY_NAME[fixtureName], {}, (err, rowList, rawRecordList) => {
	if (err) { callback(err); return; }
	if (!rowList[0]) { callback(`no fixture for ${fixtureName}`); return; }
	// k = 50, not 5 (campaign P2, R1, measured): the vector index is APPROXIMATE (HNSW, quantized), and on the R1 replay a
	// seed's own vector was missing from its top 5 (best hit 0.878) yet present at k = 50 (0.99989); the gold found it at 5.
	// This gate is about what traversal READS from a hit, not about recall — recall at small k is a P3 finding (DEVLOG-P2).
	runQuery(readText(traversalFilePath), { embedding: rawRecordList[0].get('embedding'), limit: neo4j.int(50), query: fixtureName, indexName: args.indexName }, (traversalError, hitRowList) => {
		if (traversalError) { callback(traversalError); return; }
		const fixtureHit = hitRowList.find((oneRow) => oneRow.node && oneRow.node.stableId === rowList[0].stableId);
		if (!fixtureHit) { callback(`${fixtureName} fixture ${rowList[0].stableId} not among its own hits`); return; }
		callback('', { fixtureRow: rowList[0], fixtureHit });
	});
});

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery("SHOW INDEXES YIELD name, type, labelsOrTypes, properties WHERE type = 'VECTOR' AND 'ForgedNode' IN labelsOrTypes AND 'embedding' IN properties RETURN name", {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, indexName: rowList[0].name });
}));
taskList.push((args, next) => runTraversalFor(args, 'sifQuestionWithCodeset', (err, { fixtureRow, fixtureHit } = {}) => {
	if (err) { next(err, args); return; }
	const optionSetList = fixtureHit.optionSets || [];
	assert(`SIF Question ${fixtureRow.stableId.slice(0, 40)}…: optionSets lists its Fields' code set(s)`, optionSetList.length >= 1, JSON.stringify(optionSetList).slice(0, 200));
	assert('  every entry is viaInstance: true, _source SIF260928, with a non-null path', optionSetList.length > 0 && optionSetList.every((oneSet) => oneSet.viaInstance === true && oneSet._source === 'SIF260928' && oneSet.path), JSON.stringify(optionSetList).slice(0, 300));
	assert(`  optionSetCount === ${fixtureRow.expectedOptionSetCount} (the test's count) and >= the list`, fixtureHit.optionSetCount === fixtureRow.expectedOptionSetCount && fixtureHit.optionSetCount >= optionSetList.length, `${fixtureHit.optionSetCount}`);
	next('', args);
}));
taskList.push((args, next) => runTraversalFor(args, 'cedsPropertyWithOptionSet', (err, { fixtureRow, fixtureHit } = {}) => {
	if (err) { next(err, args); return; }
	const optionSetList = fixtureHit.optionSets || [];
	assert('control: a CEDS property still lists its HAS_OPTION_SET set, viaInstance: false', optionSetList.length >= 1 && optionSetList.every((oneSet) => oneSet.viaInstance === false), JSON.stringify(optionSetList).slice(0, 200));
	assert(`  optionSetCount === ${fixtureRow.expectedOptionSetCount}`, fixtureHit.optionSetCount === fixtureRow.expectedOptionSetCount, `${fixtureHit.optionSetCount}`);
	next('', args);
}));
taskList.push((args, next) => runTraversalFor(args, 'edfiPropertyWithReferencesType', (err, { fixtureRow, fixtureHit } = {}) => {
	if (err) { next(err, args); return; }
	const referenceList = fixtureHit.referencesTo || [];
	assert(`Ed-Fi property: referencesTo carries its REFERENCES_TYPE target(s) (${fixtureRow.expectedReferenceCount})`, referenceList.filter((oneReference) => oneReference.referenceEdgeType === 'REFERENCES_TYPE').length === Math.min(fixtureRow.expectedReferenceCount, 10), JSON.stringify(referenceList).slice(0, 200));
	next('', args);
}));
taskList.push((args, next) => {
	// SIF's REFERENCES_OBJECT starts at a Field (DmeSupport, no embedding, never a vector hit), so that arm is held by text
	const traversalText = readText(traversalFilePath);
	assert('both reference arms read REFERENCES|REFERENCES_TYPE|REFERENCES_OBJECT', (traversalText.match(/\[r:REFERENCES\|REFERENCES_TYPE\|REFERENCES_OBJECT\]/g) || []).length === 2);
	next('', args);
});
pipeRunner(taskList.getList(), {}, (err) => finish(err));
