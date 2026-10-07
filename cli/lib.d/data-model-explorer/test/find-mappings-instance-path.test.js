#!/usr/bin/env node
'use strict';

// find-mappings-instance-path.test.js — campaign P4a (acceptance iteration 2, Q9). Asked to compare SIF and Ed-Fi race,
// askMilo said SIF race lives only in xStudent and xTransferIep. The graph has race code fields in ten more SIF objects:
// their meaning is in their PATH (…/RaceList/Race/Code), and a lookup by name never sees a field named Code. findMappings
// now also matches an INSTANCE (DmeInstance: SIF Field, PESC occurrence) by a segment of its context path above its own
// name (INSTANCE_CONTEXT_PATH_RULE_LIST), and answers matchedInstanceGroupSummaryList: per standard, the groups (SIF
// objects, PESC sections) holding a matched instance.
// Asserts, against this test's own Cypher:
//   - every live DmeInstance carries a context path one of the declared rules reads (none is silently unsearchable);
//   - 'race': the SIF groups the verb names EQUAL the SIF objects owning a Field whose name or object-relative path
//     contains 'race' (measured 12 on GOLD_EVAL_261006_jevContract), and its matchedInstanceCount equals the Fields
//     (rows stay capped at 30; the group summary is uncapped up to 200 groups, so a "which objects" answer reads it);
//   - control: matchedNodeCount for 'race' grew by exactly the path-matched instances.
//
//   node cli/lib.d/data-model-explorer/test/find-mappings-instance-path.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'P4a Q9: findMappings finds an instance whose meaning is in its path' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

const FIXTURE_TERM = 'race';
const SIF_SOURCE = 'SIF260928';

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(`MATCH (i:ForgedNode {role: 'DmeInstance'})
	RETURN count(i) AS instanceCount, count(CASE WHEN i.relativePath IS NULL AND i.path IS NULL THEN 1 END) AS pathlessInstanceCount`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	assert(`every one of ${rowList[0].instanceCount} DmeInstance nodes carries relativePath or path (none silently unsearchable)`, rowList[0].instanceCount > 0 && rowList[0].pathlessInstanceCount === 0, `${rowList[0].pathlessInstanceCount} without either`);
	next('', args);
}));
taskList.push((args, next) => runQuery(`MATCH (o:ForgedNode)-[:HAS_FIELD]->(f:ForgedNode {_source: $source, role: 'DmeInstance'})
	WHERE toLower(f.relativePath) CONTAINS $term
	RETURN collect(DISTINCT o.name) AS objectNameList, count(DISTINCT f) AS fieldCount`, { source: SIF_SOURCE, term: FIXTURE_TERM }, (err, rowList) => {
	if (err) { next(err, args); return; }
	next('', { ...args, cypherObjectNameList: rowList[0].objectNameList.slice().sort(), cypherFieldCount: rowList[0].fieldCount });
}));
taskList.push((args, next) => runVerb(['-findMappings', FIXTURE_TERM], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	const sifSummary = (payload.matchedInstanceGroupSummaryList || []).find((oneSummary) => oneSummary.source === SIF_SOURCE);
	const verbObjectNameList = sifSummary ? sifSummary.groupList.slice().sort() : [];
	assert(`'${FIXTURE_TERM}': the SIF objects holding a matched instance EQUAL the ${args.cypherObjectNameList.length} the Cypher finds`,
		args.cypherObjectNameList.length > 2 && JSON.stringify(verbObjectNameList) === JSON.stringify(args.cypherObjectNameList),
		`verb ${JSON.stringify(verbObjectNameList)} vs Cypher ${JSON.stringify(args.cypherObjectNameList)}`);
	assert('  and its matchedInstanceGroupCount says how many', !!sifSummary && sifSummary.matchedInstanceGroupCount === args.cypherObjectNameList.length, JSON.stringify(sifSummary && { matchedInstanceGroupCount: sifSummary.matchedInstanceGroupCount, matchedInstanceCount: sifSummary.matchedInstanceCount }));
	assert(`  and matchedInstanceCount equals the ${args.cypherFieldCount} SIF Fields (Cypher) — the Code, Proportion and @Codeset Fields under Race among them`, !!sifSummary && sifSummary.matchedInstanceCount === args.cypherFieldCount, JSON.stringify(sifSummary && sifSummary.matchedInstanceCount));
	next('', { ...args, termPayload: payload });
}, cliFilePath));
taskList.push((args, next) => runQuery(`MATCH (n:ForgedNode) WHERE toLower(n.name) CONTAINS $term
	RETURN count(n) AS nameMatchedNodeCount`, { term: FIXTURE_TERM }, (err, rowList) => {
	if (err) { next(err, args); return; }
	const payload = args.termPayload;
	assert(`  matchedNodeCount (${payload.matchedNodeCount}) = name matches (${rowList[0].nameMatchedNodeCount}) + instancePathMatchedNodeCount (${payload.instancePathMatchedNodeCount})`,
		Number.isInteger(payload.instancePathMatchedNodeCount) && payload.instancePathMatchedNodeCount > 0 && payload.matchedNodeCount === rowList[0].nameMatchedNodeCount + payload.instancePathMatchedNodeCount);
	next('', args);
}));
// the group root is NOT a context segment: a term naming a SIF object or a PESC document root must not match every
// instance under it (SIF reads the object-relative path; PESC drops the path's first segment, the document root)
[
	{ term: 'StudentPersonal', source: SIF_SOURCE, expectedCypher: "MATCH (i:ForgedNode {_source: $source, role: 'DmeInstance'}) WHERE toLower(i.relativePath) CONTAINS toLower($term) RETURN count(i) AS expectedInstanceCount" },
	{ term: 'CollegeTranscript', source: 'PESC-CollegeTranscript-1.8.0', expectedCypher: "MATCH (i:ForgedNode {_source: $source, role: 'DmeInstance'}) WHERE any(segment IN split(i.path, '/')[1..] WHERE toLower(segment) CONTAINS toLower($term)) RETURN count(i) AS expectedInstanceCount" },
].forEach(({ term, source, expectedCypher }) => {
	taskList.push((args, next) => runQuery(expectedCypher, { source, term }, (err, rowList) => {
		if (err) { next(err, args); return; }
		runQuery("MATCH (i:ForgedNode {_source: $source, role: 'DmeInstance'}) RETURN count(i) AS allInstanceCount", { source }, (allError, allRowList) => {
			if (allError) { next(allError, args); return; }
			runVerb(['-findMappings', term], (verbError, outcome) => {
				const summary = ((outcome.parsedStdout || {}).matchedInstanceGroupSummaryList || []).find((oneSummary) => oneSummary.source === source);
				const verbInstanceCount = summary ? summary.matchedInstanceCount : 0;
				assert(`'${term}' (${source}): matched instances ${rowList[0].expectedInstanceCount} (Cypher, group root excluded), not all ${allRowList[0].allInstanceCount} under the group root`,
					verbInstanceCount === rowList[0].expectedInstanceCount && verbInstanceCount < allRowList[0].allInstanceCount, `verb ${verbInstanceCount}`);
				next('', args);
			}, cliFilePath);
		});
	}));
});
pipeRunner(taskList.getList(), {}, (err) => finish(err));
