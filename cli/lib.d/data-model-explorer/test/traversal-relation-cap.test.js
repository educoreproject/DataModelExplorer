#!/usr/bin/env node
'use strict';

// traversal-relation-cap.test.js — traversal.cypher's mapping lists (20 entries) must never silently drop a whole
// match relation, and their <list>TruncatedByRelation reports must be EXACT (ruling 2026-10-04). Live: runs
// traversal.cypher against the graph the DME config points at, seeding the vector search with the CEDS Birthdate
// property's OWN embedding so that node is a hit, then checks its mappingsIncoming against a direct count:
//   - BROAD_MATCH entries are present (PESC 'Birthday' maps BROAD to Birthdate);
//   - for every relation, entries shown + truncatedCount = the direct count of such edges.
// The count check exists because the first version counted leftovers with `entry IN list`, which is never true
// for maps holding nulls in Cypher, so it over-reported truncation and a presence-only check stayed green.
//
//   node cli/lib.d/data-model-explorer/test/traversal-relation-cap.test.js [pathToTraversal.cypher]

const fs = require('fs');
const os = require('os');
const path = require('path');
const dmeDirPath = path.join(__dirname, '..');
const traversalFilePath = process.argv[2] || path.join(dmeDirPath, 'traversal.cypher');
const neo4j = require(path.join(dmeDirPath, 'node_modules', 'neo4j-driver'));
const configFileProcessor = require(path.join(dmeDirPath, 'node_modules', 'qtools-config-file-processor'));
const codeRootPath = path.join(dmeDirPath, '..', '..', '..');
const { resolveContainerConnection } = require(path.join(codeRootPath, 'server/data-model/lib/user-graph/container-connection-resolver'));

const hostName = os.hostname();
const configName = hostName === 'qMini.local' || hostName === 'qbook.local' ? 'instanceSpecific/qbook' : '';
const dmeConfig = configFileProcessor.getConfig('dataModelExplorerSearch.ini', path.join(codeRootPath, '..', 'configs', configName) + '/').dataModelExplorerSearch;
const connection = resolveContainerConnection(dmeConfig.goldenContainerName);
if (connection.error) { console.error(connection.error); process.exit(2); }

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};

const { pipeRunner, taskListPlus } = new (require(path.join(dmeDirPath, '..', '..', 'node_modules', 'qtools-asynchronous-pipe-plus')))();

const driver = neo4j.driver(connection.boltUri, neo4j.auth.basic(connection.user, connection.password));
const session = driver.session({ defaultAccessMode: neo4j.session.READ });

// session.run returns a promise; each task turns it into an explicit next(err, args) step.
const runQuery = (queryText, queryParams, callback) => {
	session.run(queryText, queryParams).then(
		(result) => callback('', result.records),
		(err) => callback(`query failed: ${err.message}`),
	);
};

console.log('\n=== traversal relation cap (CEDS Birthdate, mappingsIncoming) ===\n');
const taskList = new taskListPlus();

taskList.push((args, next) => {
	runQuery(
		`MATCH (n:ForgedNode {role: 'DmeProperty', _source: 'CEDS'}) WHERE n.name = 'Birthdate' AND n.embedding IS NOT NULL
		 RETURN elementId(n) AS seedElementId, n.embedding AS embedding LIMIT 1`,
		{},
		(err, records) => {
			if (err) { next(err, args); return; }
			if (!records[0]) { next('CEDS Birthdate property with an embedding not found', args); return; }
			next('', { ...args, seedElementId: records[0].get('seedElementId'), seedEmbedding: records[0].get('embedding') });
		},
	);
});

taskList.push((args, next) => {
	runQuery("SHOW INDEXES YIELD name, type, labelsOrTypes, properties WHERE type = 'VECTOR' AND 'ForgedNode' IN labelsOrTypes AND 'embedding' IN properties RETURN name", {}, (err, records) => {
		if (err) { next(err, args); return; }
		next('', { ...args, indexName: records[0].get('name') });
	});
});

taskList.push((args, next) => {
	runQuery(fs.readFileSync(traversalFilePath, 'utf8'), { embedding: args.seedEmbedding, limit: neo4j.int(5), query: 'Birthdate', indexName: args.indexName }, (err, records) => {
		if (err) { next(err, args); return; }
		const seedRecord = records.find((record) => record.get('node').elementId === args.seedElementId);
		assert('the seeded node is among the hits', !!seedRecord);
		if (!seedRecord) { next('seeded node not among the hits', args); return; }
		const incomingList = seedRecord.get('mappingsIncoming');
		const truncationList = seedRecord.keys.includes('mappingsIncomingTruncatedByRelation') ? seedRecord.get('mappingsIncomingTruncatedByRelation') : null;
		assert('mappingsIncomingTruncatedByRelation is returned', Array.isArray(truncationList));
		assert('at most 20 entries', incomingList.length <= 20, `${incomingList.length}`);
		assert('BROAD_MATCH entries are present (PESC Birthday)', incomingList.some((entry) => entry.mappingType === 'BROAD_MATCH'));
		next('', { ...args, incomingList, truncationList });
	});
});

taskList.push((args, next) => {
	runQuery(
		`MATCH (n) WHERE elementId(n) = $seedElementId
		 MATCH (n)<-[:HAS_CEDS_DOMAIN|HAS_CEDS_PROPERTY|HAS_CEDS_RANGE|HAS_CEDS_VALUE|HAS_CEDS_QUALIFIER]-(:HubReference)<-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(:ForgedNode)
		 RETURN type(m) AS relation, count(*) AS totalCount`,
		{ seedElementId: args.seedElementId },
		(err, records) => {
			if (err) { next(err, args); return; }
			records.forEach((record) => {
				const relation = record.get('relation');
				const totalCount = record.get('totalCount').toNumber();
				const shownCount = args.incomingList.filter((entry) => entry.mappingType === relation).length;
				const truncation = (args.truncationList || []).find((oneTruncation) => oneTruncation.relation === relation);
				const truncatedCount = truncation ? Number(truncation.truncatedCount) : 0;
				assert(`${relation}: shown ${shownCount} + truncated ${truncatedCount} = total ${totalCount}`, shownCount + truncatedCount === totalCount);
				assert(`${relation}: shown >= min(total, 5)`, shownCount >= Math.min(totalCount, 5));
			});
			next('', args);
		},
	);
});

pipeRunner(taskList.getList(), {}, (err) => {
	if (err) { failed++; console.log(`  FAIL: ${err}`); }
	session.close().then(() => driver.close()).then(() => {
		console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
		process.exit(failed > 0 ? 1 : 0);
	});
});
