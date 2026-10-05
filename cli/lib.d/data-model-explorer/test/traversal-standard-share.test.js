#!/usr/bin/env node
'use strict';

// traversal-standard-share.test.js — within each relation's share of a traversal mapping list (20 entries), one
// standard must not crowd out the others (TQ "do those five", item 5, 2026-10-05). Live: runs traversal.cypher
// against the graph the DME config points at, seeding the vector search with a node's OWN embedding so it is a hit.
//   - CEDS Birthdate, mappingsIncoming: every standard with an edge into it (direct count) is shown, Ed-Fi named;
//     a relation showing N entries over S standards shows min(N, S) standards; and for every relation and standard
//     shown + truncated (mappingsIncomingTruncatedByRelationAndStandard) = the direct count.
//   - Ed-Fi BirthDate, crossStandardEquivalents: the same three checks against a direct count of the pairs.
// Before this, both lists' EXACT share was filled by PESC AcademicEportfolio (9 of 14) and Ed-Fi never showed.
//
//   node cli/lib.d/data-model-explorer/test/traversal-standard-share.test.js [pathToTraversal.cypher]

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

// one seeded list check: the seed's own record, the list, its per-standard truncation report, a direct count
const LIST_CHECK_LIST = [
	{
		seedName: 'Birthdate', seedSource: 'CEDS', listName: 'mappingsIncoming', standardFieldName: 'fromSource', relationFieldName: 'mappingType',
		directCountCypher: `MATCH (n) WHERE elementId(n) = $seedElementId
			MATCH (n)<-[:HAS_CEDS_DOMAIN|HAS_CEDS_PROPERTY|HAS_CEDS_RANGE|HAS_CEDS_VALUE|HAS_CEDS_QUALIFIER]-(:HubReference)<-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(src:ForgedNode)
			RETURN type(m) AS relation, src._source AS standardName, count(*) AS totalCount`,
	},
	{
		seedName: 'BirthDate', seedSource: 'EdFi', listName: 'crossStandardEquivalents', standardFieldName: 'otherSource', relationFieldName: null,
		directCountCypher: `MATCH (n) WHERE elementId(n) = $seedElementId
			MATCH (n)-[mNear:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference)<-[mFar:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(other:ForgedNode)
			WHERE other <> n
			RETURN CASE WHEN type(mFar) IN ['BROAD_MATCH', 'NARROW_MATCH'] THEN type(mFar) WHEN type(mNear) IN ['BROAD_MATCH', 'NARROW_MATCH'] THEN type(mNear)
			            WHEN type(mNear) = 'CLOSE_MATCH' OR type(mFar) = 'CLOSE_MATCH' THEN 'CLOSE_MATCH' ELSE 'EXACT_MATCH' END AS relation,
			       other._source AS standardName, count(*) AS totalCount`,
	},
];

// crossStandardEquivalents entries carry both hops; their relation is derived the same way the traversal does it
const entryRelationOf = (listCheck, entry) => {
	if (listCheck.relationFieldName) return entry[listCheck.relationFieldName];
	if (['BROAD_MATCH', 'NARROW_MATCH'].includes(entry.farMatchType)) return entry.farMatchType;
	if (['BROAD_MATCH', 'NARROW_MATCH'].includes(entry.nearMatchType)) return entry.nearMatchType;
	if (entry.nearMatchType === 'CLOSE_MATCH' || entry.farMatchType === 'CLOSE_MATCH') return 'CLOSE_MATCH';
	return 'EXACT_MATCH';
};

const taskList = new taskListPlus();

taskList.push((args, next) => {
	runQuery("SHOW INDEXES YIELD name, type, labelsOrTypes, properties WHERE type = 'VECTOR' AND 'ForgedNode' IN labelsOrTypes AND 'embedding' IN properties RETURN name", {}, (err, records) => {
		if (err) { next(err, args); return; }
		next('', { ...args, indexName: records[0].get('name') });
	});
});

LIST_CHECK_LIST.forEach((listCheck) => {
	taskList.push((args, next) => {
		console.log(`\n=== ${listCheck.seedSource} ${listCheck.seedName}: ${listCheck.listName} ===\n`);
		runQuery(
			`MATCH (n:ForgedNode {role: 'DmeProperty', _source: $seedSource}) WHERE n.name = $seedName AND n.embedding IS NOT NULL
			 RETURN elementId(n) AS seedElementId, n.embedding AS embedding LIMIT 1`,
			{ seedSource: listCheck.seedSource, seedName: listCheck.seedName },
			(err, records) => {
				if (err) { next(err, args); return; }
				if (!records[0]) { next(`${listCheck.seedSource} ${listCheck.seedName} with an embedding not found`, args); return; }
				next('', { ...args, seedElementId: records[0].get('seedElementId'), seedEmbedding: records[0].get('embedding') });
			},
		);
	});

	taskList.push((args, next) => {
		runQuery(fs.readFileSync(traversalFilePath, 'utf8'), { embedding: args.seedEmbedding, limit: neo4j.int(5), query: listCheck.seedName, indexName: args.indexName }, (err, records) => {
			if (err) { next(err, args); return; }
			const seedRecord = records.find((record) => record.get('node').elementId === args.seedElementId);
			assert('the seeded node is among the hits', !!seedRecord);
			if (!seedRecord) { next('seeded node not among the hits', args); return; }
			const truncationFieldName = `${listCheck.listName}TruncatedByRelationAndStandard`;
			const truncationList = seedRecord.keys.includes(truncationFieldName) ? seedRecord.get(truncationFieldName) : null;
			assert(`${truncationFieldName} is returned`, Array.isArray(truncationList));
			next('', { ...args, entryList: seedRecord.get(listCheck.listName), truncationList: truncationList || [] });
		});
	});

	taskList.push((args, next) => {
		runQuery(listCheck.directCountCypher, { seedElementId: args.seedElementId }, (err, records) => {
			if (err) { next(err, args); return; }
			const totalCountByRelationAndStandard = {};
			records.forEach((record) => {
				const relation = record.get('relation');
				totalCountByRelationAndStandard[relation] = totalCountByRelationAndStandard[relation] || {};
				totalCountByRelationAndStandard[relation][record.get('standardName')] = record.get('totalCount').toNumber();
			});
			const directStandardSet = new Set(records.map((record) => record.get('standardName')));
			const shownStandardSet = new Set(args.entryList.map((entry) => entry[listCheck.standardFieldName]));
			assert('Ed-Fi is among the standards the direct count finds', directStandardSet.has('EdFi') || listCheck.seedSource === 'EdFi');
			[...directStandardSet].sort().forEach((standardName) => {
				assert(`an entry from ${standardName} is shown`, shownStandardSet.has(standardName));
			});
			Object.keys(totalCountByRelationAndStandard).forEach((relation) => {
				const relationEntryList = args.entryList.filter((entry) => entryRelationOf(listCheck, entry) === relation);
				const relationStandardList = Object.keys(totalCountByRelationAndStandard[relation]);
				const relationShownStandardCount = new Set(relationEntryList.map((entry) => entry[listCheck.standardFieldName])).size;
				assert(`${relation}: ${relationEntryList.length} entries over ${relationStandardList.length} standards show ${relationShownStandardCount} = min(entries, standards)`,
					relationShownStandardCount === Math.min(relationEntryList.length, relationStandardList.length));
				relationStandardList.forEach((standardName) => {
					const shownCount = relationEntryList.filter((entry) => entry[listCheck.standardFieldName] === standardName).length;
					const truncation = args.truncationList.find((oneTruncation) => oneTruncation.relation === relation && oneTruncation.standard === standardName);
					const truncatedCount = truncation ? Number(truncation.truncatedCount) : 0;
					const totalCount = totalCountByRelationAndStandard[relation][standardName];
					assert(`${relation} ${standardName}: shown ${shownCount} + truncated ${truncatedCount} = total ${totalCount}`, shownCount + truncatedCount === totalCount);
				});
			});
			next('', args);
		});
	});
});

pipeRunner(taskList.getList(), {}, (err) => {
	if (err) { failed++; console.log(`  FAIL: ${err}`); }
	session.close().then(() => driver.close()).then(() => {
		console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
		process.exit(failed > 0 ? 1 : 0);
	});
});
