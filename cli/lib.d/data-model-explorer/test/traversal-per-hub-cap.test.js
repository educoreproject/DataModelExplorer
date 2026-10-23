#!/usr/bin/env node
'use strict';

// traversal-per-hub-cap.test.js — ⟪lane zbE, E2-2 (census 60)⟫ graphRetriever's mapping lists (traversal.cypher) are capped
// at 20 entries PER HUB, as findMappings allocates its rows per hub (ctdlHub P7). Until E2-2 the cap was shared across
// hubs, so a node with many confident matches into one hub showed none of its matches into the other (P7 docket (a)).
//
// A TWO-HUB FIXTURE, written into a SCRATCH Neo4j (DME_SCRATCH_BOLT_URI + DME_SCRATCH_NEO4J_PASSWORD; refused when unset,
// and refused when the URI is the golden container's: this gate writes). One subject node holds 25 EXACT_MATCH edges
// into hub ZZHUBA cards at confidence 0.99..0.75 and 3 into hub ZZHUBB at 0.50; each card has one other-standard element
// (cross-standard arm), one instance of the subject mirrors the subject's edges (instance arm), and a leaf every card
// points at by a slot edge (incoming arm). Under a shared cap, ZZHUBB's three lose every arm; per hub they are shown.
//   1. RED on the traversal.cypher given as argv[2] (the base, c07031f): ZZHUBB absent from all four lists;
//   2. GREEN on this tree's traversal.cypher: each list holds 20 ZZHUBA entries and every ZZHUBB entry (3 per card kind:
//      x1 on the subject's own lists, x2 shared-hub pairs, x3 incoming), ZZHUBA's first, and every truncation entry
//      names its hub (ZZHUBA's left-out count; nothing of ZZHUBB).
// The fixture is deleted afterwards (its nodes carry the label ZzPerHubCapFixture).
//
//   DME_SCRATCH_BOLT_URI=bolt://localhost:7891 DME_SCRATCH_NEO4J_PASSWORD=... node test/traversal-per-hub-cap.test.js [baseTraversalCypherPath]

const fs = require('fs');
const path = require('path');
const dmeDirPath = path.join(__dirname, '..');
const neo4j = require(path.join(dmeDirPath, 'node_modules', 'neo4j-driver'));

const FIXTURE_LABEL = 'ZzPerHubCapFixture';
const SLOT_EDGE_TYPE = 'HAS_ZZHUB_SLOT';
const headTraversalFilePath = path.join(dmeDirPath, 'traversal.cypher');
const baseTraversalFilePath = process.argv[2];

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};

console.log('\n=== E2-2: graphRetriever mapping lists are capped per hub ===\n');
const scratchBoltUri = process.env.DME_SCRATCH_BOLT_URI;
const scratchPassword = process.env.DME_SCRATCH_NEO4J_PASSWORD;
if (!scratchBoltUri || !scratchPassword) {
	console.log('REFUSED: this gate writes a fixture, so it needs DME_SCRATCH_BOLT_URI and DME_SCRATCH_NEO4J_PASSWORD naming a SCRATCH Neo4j; there is no default, and never the golden graph.');
	process.exit(1);
}
if (!baseTraversalFilePath || !fs.existsSync(baseTraversalFilePath)) {
	console.log(`REFUSED: argv[2] must name the BASE traversal.cypher the red half runs (got ${JSON.stringify(baseTraversalFilePath)})`);
	process.exit(1);
}
const goldenGuardList = (process.env.DME_GOLDEN_BOLT_URI_LIST || '').split(',').filter(Boolean);
if (goldenGuardList.some((goldenBoltUri) => goldenBoltUri.replace('127.0.0.1', 'localhost') === scratchBoltUri.replace('127.0.0.1', 'localhost'))) {
	console.log(`REFUSED: DME_SCRATCH_BOLT_URI ${scratchBoltUri} is a golden container's bolt; this gate writes.`);
	process.exit(1);
}

const HUB_A_CARD_COUNT = 25;
const HUB_B_CARD_COUNT = 3;
const FIXTURE_CYPHER = `
CREATE (subject:ForgedNode:${FIXTURE_LABEL} {stableId: 'zz:subject', _id: 'zz:subject', _source: 'ZZSTD', name: 'zzSubject', role: 'DmeProperty'})
CREATE (instanceNode:ForgedNode:${FIXTURE_LABEL} {stableId: 'zz:instance', _id: 'zz:instance', _source: 'ZZSTD', name: 'zzInstance', role: 'DmeInstance', sectionPath: 'zzSection'})
CREATE (subject)-[:HAS_INSTANCE]->(instanceNode)
CREATE (leaf:ForgedNode:${FIXTURE_LABEL} {stableId: 'zz:leaf', _id: 'zz:leaf', _source: 'ZZHUBA', name: 'zzLeaf', role: 'DmeProperty'})
WITH subject, instanceNode, leaf
UNWIND [cardIndex IN range(0, ${HUB_A_CARD_COUNT - 1}) | {hubName: 'ZZHUBA', cardIndex: cardIndex, confidence: 0.99 - cardIndex * 0.01}] +
       [cardIndex IN range(0, ${HUB_B_CARD_COUNT - 1}) | {hubName: 'ZZHUBB', cardIndex: cardIndex, confidence: 0.50}] AS cardSpec
CREATE (card:HubReference:ForgedNode:${FIXTURE_LABEL} {stableId: 'zz:card:' + cardSpec.hubName + ':' + cardSpec.cardIndex, hubName: cardSpec.hubName, name: cardSpec.hubName + ' card ' + cardSpec.cardIndex, canonicalKey: cardSpec.hubName + '-' + cardSpec.cardIndex, _source: cardSpec.hubName})
CREATE (other:ForgedNode:${FIXTURE_LABEL} {stableId: 'zz:other:' + cardSpec.hubName + ':' + cardSpec.cardIndex, _id: 'zz:other:' + cardSpec.hubName + ':' + cardSpec.cardIndex, _source: 'ZZOTHER', name: 'zzOther ' + cardSpec.cardIndex, role: 'DmeProperty'})
CREATE (subject)-[:EXACT_MATCH {mappingConfidence: cardSpec.confidence, mappingKind: 'derived', mappingSource: 'zzFixture'}]->(card)
CREATE (instanceNode)-[:EXACT_MATCH {mappingConfidence: cardSpec.confidence, mappingKind: 'derived', mappingSource: 'zzFixture'}]->(card)
CREATE (other)-[:EXACT_MATCH {mappingConfidence: cardSpec.confidence, mappingKind: 'derived', mappingSource: 'zzFixture'}]->(card)
CREATE (card)-[:${SLOT_EDGE_TYPE}]->(leaf)
`;
const CLEANUP_CYPHER = `MATCH (n:${FIXTURE_LABEL}) DETACH DELETE n`;
// entries per card in each list: the subject's own lists hold one per card; a card's shared-hub pairs are its OTHER
// element AND the subject's instance (both map to it); a leaf's incoming rows are the subject, its instance and the other
const ENTRY_COUNT_PER_CARD_BY_LIST_NAME = Object.freeze({ mappingsOutgoing: 1, mappingsViaInstances: 1, crossStandardEquivalents: 2, mappingsIncoming: 3 });
const subjectHitList = [{ stableId: 'zz:subject', hitRank: 1, fusedScore: 1, foundByLegList: ['keyword'], keywordRank: 1, keywordScore: 1, vectorRank: null, vectorScore: null }];
const leafHitList = [{ ...subjectHitList[0], stableId: 'zz:leaf' }];

const driver = neo4j.driver(scratchBoltUri, neo4j.auth.basic('neo4j', scratchPassword));
const writeSession = driver.session({ defaultAccessMode: neo4j.session.WRITE });

// hubCountOf — how many entries of a mapping list name each hub (toSource on the node's own lists, hubSource on pairs)
const hubCountOf = (entryList) => (entryList || []).reduce((countByHub, oneEntry) => {
	const hubName = oneEntry.toSource || oneEntry.hubSource;
	countByHub[hubName] = (countByHub[hubName] || 0) + 1;
	return countByHub;
}, {});

const runTraversal = (traversalFilePath, hitList, callback) => {
	const readSession = driver.session({ defaultAccessMode: neo4j.session.READ });
	readSession.run(fs.readFileSync(traversalFilePath, 'utf8'), { hitList, hubIncomingSlotEdgeTypeList: [SLOT_EDGE_TYPE] }).then(
		(result) => { readSession.close().then(() => callback('', result.records[0])); },
		(queryError) => { readSession.close().then(() => callback(`traversal on ${traversalFilePath} failed: ${queryError.message}`)); },
	);
};

// listsOf — the four capped lists of one traversal: the subject's own three, and the leaf's incoming list
const listsOf = (traversalFilePath, callback) => runTraversal(traversalFilePath, subjectHitList, (subjectError, subjectRecord) => {
	if (subjectError) { callback(subjectError); return; }
	runTraversal(traversalFilePath, leafHitList, (leafError, leafRecord) => {
		if (leafError) { callback(leafError); return; }
		const instanceView = subjectRecord.get('instanceView') || {};
		callback('', {
			mappingsOutgoing: { entryList: subjectRecord.get('mappingsOutgoing'), truncationList: subjectRecord.get('mappingsOutgoingTruncatedByRelation') },
			crossStandardEquivalents: { entryList: subjectRecord.get('crossStandardEquivalents'), truncationList: subjectRecord.get('crossStandardEquivalentsTruncatedByRelation') },
			mappingsViaInstances: { entryList: instanceView.mappingsViaInstances, truncationList: instanceView.mappingsViaInstancesTruncatedByRelation },
			mappingsIncoming: { entryList: leafRecord.get('mappingsIncoming'), truncationList: leafRecord.get('mappingsIncomingTruncatedByRelation') },
		});
	});
});

const plainCountOf = (countValue) => (neo4j.isInt(countValue) ? countValue.toNumber() : countValue);
const finish = (pipeError) => {
	if (pipeError) { failed++; console.log(`  FAIL: ${pipeError}`); }
	writeSession.run(CLEANUP_CYPHER).then(() => writeSession.close()).then(() => driver.close()).then(() => {
		console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
		process.exit(failed > 0 ? 1 : 0);
	});
};

writeSession.run(CLEANUP_CYPHER).then(() => writeSession.run(FIXTURE_CYPHER)).then(
	() => listsOf(baseTraversalFilePath, (baseError, baseLists) => {
		if (baseError) { finish(baseError); return; }
		Object.keys(baseLists).forEach((listName) => {
			const countByHub = hubCountOf(baseLists[listName].entryList);
			ok(`1. RED (base): ${listName} under the shared cap shows no ZZHUBB entry (ZZHUBA ${countByHub.ZZHUBA || 0})`, !countByHub.ZZHUBB && countByHub.ZZHUBA === 20, JSON.stringify(countByHub));
		});
		listsOf(headTraversalFilePath, (headError, headLists) => {
			if (headError) { finish(headError); return; }
			Object.keys(headLists).forEach((listName) => {
				const { entryList, truncationList } = headLists[listName];
				const countByHub = hubCountOf(entryList);
				const hubOrderText = (entryList || []).map((oneEntry) => oneEntry.toSource || oneEntry.hubSource).filter((hubName, entryIndex, hubNameList) => hubNameList.indexOf(hubName) === entryIndex).join(',');
				const entryCountPerCard = ENTRY_COUNT_PER_CARD_BY_LIST_NAME[listName];
				ok(`2. ${listName}: 20 ZZHUBA + ${HUB_B_CARD_COUNT * entryCountPerCard} ZZHUBB entries, ZZHUBA's first`, countByHub.ZZHUBA === 20 && countByHub.ZZHUBB === HUB_B_CARD_COUNT * entryCountPerCard && hubOrderText === 'ZZHUBA,ZZHUBB', `${JSON.stringify(countByHub)} order ${hubOrderText}`);
				const truncationText = JSON.stringify((truncationList || []).map((oneTruncation) => ({ hub: oneTruncation.hub, relation: oneTruncation.relation, truncatedCount: plainCountOf(oneTruncation.truncatedCount) })));
				const hubATruncatedCount = HUB_A_CARD_COUNT * entryCountPerCard - 20;
				ok(`   ${listName}: truncation names its hub (ZZHUBA EXACT_MATCH ${hubATruncatedCount} left out; nothing of ZZHUBB)`, truncationText === JSON.stringify([{ hub: 'ZZHUBA', relation: 'EXACT_MATCH', truncatedCount: hubATruncatedCount }]), truncationText);
			});
			finish('');
		});
	}),
	(fixtureError) => finish(`fixture write failed: ${fixtureError.message}`),
);
