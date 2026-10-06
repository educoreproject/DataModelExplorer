#!/usr/bin/env node
'use strict';

// traversal-no-mapping-hit.test.js — W-D-3 (campaign P1, 2026-10-06; V2-C05, PLAN A7). A search hit with NO match edge of
// its own must answer EMPTY mapping lists, never one phantom entry. The outgoing, cross-standard and incoming arms of
// traversal.cypher OPTIONAL MATCH their edge and then collect a map holding a constant (toSource: 'CEDS'), so a missing
// edge used to become one non-null map of nulls — which the model read as a 'candidateEquivalent'.
// Fixture: the SIF Question BirthDate (Demographics/BirthDate): 0 own match edges, 6 HAS_INSTANCE Fields that carry them.
// Seeded with its OWN stored embedding (no embedding service is called). Control: instanceView still lists the instance-
// carried mappings, counted by the test's own Cypher, so a fix that over-filters goes red too.
//
//   node cli/lib.d/data-model-explorer/test/traversal-no-mapping-hit.test.js [pathToTraversal.cypher]

const path = require('path');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-3 traversal: a hit without mappings has no phantom entries' });
const { assert, runQuery, finish, neo4j, taskListPlus, pipeRunner, readText } = harness;
const traversalFilePath = process.argv[2] || path.join(harness.dmeDirPath, 'traversal.cypher');
const FIXTURE_STABLE_ID = 'sif260928:question/77778159015aa9d8b4bfc223cb156fda47a1ef45584313d177383cc2398d8388';
const MAPPING_LIST_NAME_LIST = ['mappingsOutgoing', 'crossStandardEquivalents', 'mappingsIncoming'];
const TRUNCATION_LIST_NAME_LIST = ['mappingsOutgoingTruncatedByRelation', 'crossStandardEquivalentsTruncatedByRelation', 'crossStandardEquivalentsTruncatedByRelationAndStandard', 'mappingsIncomingTruncatedByRelation', 'mappingsIncomingTruncatedByRelationAndStandard'];

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(
	`MATCH (n:ForgedNode {stableId: $stableId}) RETURN n.embedding AS embedding,
	        COUNT { (n)-[:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference) } AS ownMatchCount,
	        COUNT { (n)-[:HAS_INSTANCE]->() } AS instanceCount`,
	{ stableId: FIXTURE_STABLE_ID }, (err, rowList, rawRecordList) => {
		if (err) { next(err, args); return; }
		if (!rowList[0]) { next(`fixture ${FIXTURE_STABLE_ID} not in the graph`, args); return; }
		assert('fixture has no match edge of its own (precondition)', rowList[0].ownMatchCount === 0, `${rowList[0].ownMatchCount}`);
		next('', { ...args, seedEmbedding: rawRecordList[0].get('embedding'), fixtureInstanceCount: rowList[0].instanceCount });
	}));
taskList.push((args, next) => runQuery(
	`MATCH (n:ForgedNode {stableId: $stableId})-[:HAS_INSTANCE]->(i:ForgedNode)-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub:HubReference)
	 RETURN count(DISTINCT [elementId(hub), type(m), m.mappingConfidence, m.predicate, m.mappingKind, m.mappingSource]) AS viaInstanceGroupCount`,
	{ stableId: FIXTURE_STABLE_ID }, (err, rowList) => {
		if (err) { next(err, args); return; }
		next('', { ...args, viaInstanceGroupCount: rowList[0].viaInstanceGroupCount });
	}));
taskList.push((args, next) => runQuery("SHOW INDEXES YIELD name, type, labelsOrTypes, properties WHERE type = 'VECTOR' AND 'ForgedNode' IN labelsOrTypes AND 'embedding' IN properties RETURN name", {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, indexName: rowList[0].name });
}));
taskList.push((args, next) => runQuery(readText(traversalFilePath), { embedding: args.seedEmbedding, limit: neo4j.int(5), query: 'BirthDate', indexName: args.indexName }, (err, rowList) => {
	if (err) { next(err, args); return; }
	const fixtureRow = rowList.find((oneRow) => oneRow.node && oneRow.node.stableId === FIXTURE_STABLE_ID);
	assert('the fixture is among the hits', !!fixtureRow);
	if (!fixtureRow) { next('fixture not among the hits', args); return; }
	MAPPING_LIST_NAME_LIST.forEach((listName) => assert(`${listName} is [] (no phantom entry)`, Array.isArray(fixtureRow[listName]) && fixtureRow[listName].length === 0, JSON.stringify(fixtureRow[listName]).slice(0, 300)));
	TRUNCATION_LIST_NAME_LIST.forEach((listName) => assert(`${listName} is []`, Array.isArray(fixtureRow[listName]) && fixtureRow[listName].length === 0, JSON.stringify(fixtureRow[listName])));
	const nullEntryList = [];
	rowList.forEach((oneRow) => {
		MAPPING_LIST_NAME_LIST.forEach((listName) => (oneRow[listName] || []).forEach((oneEntry) => {
			if (oneEntry.toId === null || oneEntry.hubKey === null) nullEntryList.push(`${oneRow.node.stableId} ${listName}`);
		}));
		((oneRow.instanceView || {}).mappingsViaInstances || []).forEach((oneEntry) => { if (oneEntry.toId === null) nullEntryList.push(`${oneRow.node.stableId} mappingsViaInstances`); });
	});
	assert('no entry in any hit has toId or hubKey null', nullEntryList.length === 0, nullEntryList.join('; '));
	const instanceView = fixtureRow.instanceView || {};
	assert(`control: instanceView.instanceTotal === ${args.fixtureInstanceCount} (the test's count)`, instanceView.instanceTotal === args.fixtureInstanceCount, `${instanceView.instanceTotal}`);
	assert(`control: mappingsViaInstances has ${args.viaInstanceGroupCount} entr(y/ies) (the test's distinct count)`, (instanceView.mappingsViaInstances || []).length === args.viaInstanceGroupCount, `${(instanceView.mappingsViaInstances || []).length}`);
	next('', args);
}));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
