#!/usr/bin/env node
'use strict';

// find-mappings-exact-lookup-live.test.js — the claim the exact-stableId short cut in findMappings stands on (standardsQueryService P1.1), checked on the golden it runs against: an input carrying
// '/' that IS a stableId matches that one node and no other, so skipping the scan cannot change the answer. Case-insensitively, no name holds such a stableId, and no other node holds it in an
// identifier field. A context segment cannot hold it: segments are split on '/'. A golden where this stops being true fails here; the short cut must then be narrowed, not the answer changed.
//   Also: such an input answers without a CONTAINS scan, and a name that equals a path still searches by name.
//
//   node cli/lib.d/data-model-explorer/test/find-mappings-exact-lookup-live.test.js

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'P1.1 findMappings: an exact stableId with a slash matches one node, so the scan can be skipped' });
const { assert, runVerb, runQuery, finish, taskListPlus, pipeRunner } = harness;

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery('MATCH (d:StandardDefinition) WHERE d.nativeIdentifierPropertyName IS NOT NULL RETURN collect(DISTINCT d.nativeIdentifierPropertyName) AS nameList', {}, (declaredError, declaredRowList) => {
	if (declaredError) {
		next(declaredError, args);
		return;
	}
	const fieldList = ['_id', 'path', 'stableId', ...declaredRowList[0].nameList];
	runQuery(`MATCH (n:ForgedNode) RETURN n.stableId AS stableId, n.name AS name, ${fieldList.map((fieldName, fieldIndex) => `n.\`${fieldName}\` AS field${fieldIndex}`).join(', ')}`, {}, (nodeError, nodeRowList) => {
		if (nodeError) {
			next(nodeError, args);
			return;
		}
		const slashedStableIdSet = new Set(nodeRowList.map((oneRow) => oneRow.stableId).filter((stableId) => typeof stableId === 'string' && stableId.includes('/')));
		const foreignHolderList = [];
		nodeRowList.forEach((oneRow) => fieldList.forEach((fieldName, fieldIndex) => {
			const fieldText = oneRow[`field${fieldIndex}`];
			if (typeof fieldText === 'string' && slashedStableIdSet.has(fieldText) && fieldText !== oneRow.stableId) foreignHolderList.push(`${oneRow.stableId}.${fieldName}`);
		}));
		const lowerNameText = [...new Set(nodeRowList.map((oneRow) => oneRow.name).filter((nameText) => typeof nameText === 'string' && nameText.includes('/')).map((nameText) => nameText.toLowerCase()))].join('\u0001');
		const stableIdInNameList = [...slashedStableIdSet].filter((stableId) => lowerNameText.includes(stableId.toLowerCase()));
		assert(`${slashedStableIdSet.size} stableIds carry '/'; no other node holds one in an identifier field`, foreignHolderList.length === 0, foreignHolderList.slice(0, 5).join(', '));
		assert('no name holds one, case-insensitively', stableIdInNameList.length === 0, stableIdInNameList.slice(0, 5).join(', '));
		next('', args);
	});
}));
taskList.push((args, next) => {
	const startedAt = Date.now();
	runVerb(['-findMappings', 'lif:Person/MilitaryLearningExperience/inline/dischargeDate'], (err, { parsedStdout }) => {
		assert('an exact stableId: one node', parsedStdout.matchedNodeCount === 1, JSON.stringify(parsedStdout.matchedNodeCount));
		assert('it has its rows', parsedStdout.totalRowCount > 0);
		console.log(`  (answered in ${Date.now() - startedAt} ms)`);
		next('', args);
	});
});
taskList.push((args, next) => runVerb(['-findMappings', 'Race'], (err, { parsedStdout }) => {
	assert("a name that equals some node's path still searches by name: many nodes", parsedStdout.matchedNodeCount > 1, JSON.stringify(parsedStdout.matchedNodeCount));
	next('', args);
}));
pipeRunner(taskList.getList(), {}, (pipeError) => finish(pipeError));
