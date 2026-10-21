#!/usr/bin/env node
'use strict';

// hub-slot-list-shared.test.js — W-D-5 (campaign P1, 2026-10-06; V2-C26). The hub decomposes through one edge per slot,
// HAS_<HUBNAME>_<SLOT>. traversal.cypher's incoming arm read all five slots and findMappings' incoming arm read two, so a
// CEDS class, range or qualifier answered in one tool and not the other. ONE declared slot list now serves both:
// toolPayloadContract.HUB_DECOMPOSITION_SLOT_LIST (INTERIM copy of educoreForge vocabulary.js HUB_DECOMPOSITION_SLOTS
// until graphContract.json carries it, P2). Asserts the copy equals the forge's declaration, traversal.cypher's incoming
// alternation and findMappings' incoming pattern both equal it, and the live graph holds no hub edge type outside it.
// ⟪ctdlHub P7⟫ a graph may hold several hubs, so neither arm carries a literal alternation any more: traversal.cypher
// reads $hubIncomingSlotEdgeTypeList and findMappings builds its pattern with allHubDecompositionEdgeTypeList, both from
// the hub list and the contract's slot lists (hubSlotList, plus hubTermSlotList once the contract carries it). The live
// check now reads every hub of the graph: each hub's HAS_<HUB>_* edge types must be declared slots of that hub.
//
//   node cli/lib.d/data-model-explorer/test/hub-slot-list-shared.test.js [pathToDataModelExplorerSearch.js]

const path = require('path');
const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-5 one declared hub-slot list for both incoming arms' });
const { assert, runQuery, finish, readText } = harness;
const searchFilePath = process.argv[2] || path.join(harness.dmeDirPath, 'dataModelExplorerSearch.js');
const contract = require(path.join(harness.dmeDirPath, 'lib', 'toolPayloadContract'));
// the sibling repo, found from this repo's root whether the test runs in the main tree or a worktree
const webdevDirPath = harness.codeRootPath.replace(/^(.*)\/educore\/system\/.*$/, '$1');
const forgeVocabularyFilePath = path.join(webdevDirPath, 'educoreForge', 'system', 'code', 'educoreForge', 'lib', 'vocabulary', 'vocabulary.js');

const declaredEdgeTypeList = contract.hubDecompositionEdgeTypeList ? contract.hubDecompositionEdgeTypeList('CEDS') : [];
const sortedText = (oneList) => JSON.stringify([...oneList].sort());
const forgeVocabulary = require(forgeVocabularyFilePath);
assert('the DME slot list equals educoreForge HUB_DECOMPOSITION_SLOTS', JSON.stringify(contract.HUB_DECOMPOSITION_SLOT_LIST) === JSON.stringify(forgeVocabulary.HUB_DECOMPOSITION_SLOTS), `${JSON.stringify(contract.HUB_DECOMPOSITION_SLOT_LIST)} vs ${JSON.stringify(forgeVocabulary.HUB_DECOMPOSITION_SLOTS)}`);
// ⟪campaign P2⟫ and it is READ from graphContract.json (hubSlotList), not held as a literal copy
assert('  read from graphContract.json hubSlotList, not a literal', /require\('\.\.\/contract\/graphContract\.json'\)\.hubSlotList/.test(readText(path.join(harness.dmeDirPath, 'lib', 'toolPayloadContract.js'))));
// ⟪ctdlHub P7⟫ hubDecompositionEdgeTypeList also carries the TERM slots once the contract declares hubTermSlotList; the
// non-term part is the forge's hubEdgeType() over HUB_DECOMPOSITION_SLOTS, and the term part is read from the contract
assert('  and hubDecompositionEdgeTypeList matches the forge hubEdgeType() (plus the contract\'s term slots)', sortedText(declaredEdgeTypeList) === sortedText(forgeVocabulary.HUB_DECOMPOSITION_SLOTS.concat(contract.HUB_TERM_SLOT_LIST).map((slotName) => forgeVocabulary.hubEdgeType('CEDS', slotName))));
assert('  the term slots are read from graphContract.json hubTermSlotList, not a literal', /hubTermSlotListOf\(require\('\.\.\/contract\/graphContract\.json'\)\)/.test(readText(path.join(harness.dmeDirPath, 'lib', 'toolPayloadContract.js'))) && JSON.stringify(contract.HUB_TERM_SLOT_LIST) === JSON.stringify(require(path.join(harness.dmeDirPath, 'contract', 'graphContract.json')).hubTermSlotList || []));

const traversalText = readText(path.join(harness.dmeDirPath, 'traversal.cypher'));
assert("traversal.cypher's incoming arm reads the declared slot edge types as $hubIncomingSlotEdgeTypeList (no literal alternation)", /OPTIONAL MATCH \(node\)<-\[slotEdge\]-\(hub:HubReference\)<-\[m:[A-Z_|]+\]-\(src:ForgedNode\)\s+WHERE type\(slotEdge\) IN \$hubIncomingSlotEdgeTypeList/.test(traversalText) && !/HAS_CEDS_/.test(traversalText));
assert('  and graphRetriever passes it from the hub list', /hubIncomingSlotEdgeTypeList: allHubDecompositionEdgeTypeList\(/.test(readText(searchFilePath)));
const searchText = readText(searchFilePath);
const literalIncomingMatch = searchText.match(/MATCH \(n\)<-\[:([A-Z_|]+)\]-\(hub:HubReference\)/);
assert('findMappings carries no literal hub-slot alternation (it is built from the declaration)', !literalIncomingMatch, literalIncomingMatch && literalIncomingMatch[1]);
assert('findMappings builds its incoming pattern from allHubDecompositionEdgeTypeList', /const incomingHubEdgePattern = allHubDecompositionEdgeTypeList\(hubNameList\)\.join\('\|'\)/.test(searchText));

runQuery("MATCH (h:HubDefinition) WITH h.hubName AS hubName MATCH ()-[r]->() WHERE type(r) STARTS WITH 'HAS_' + toUpper(hubName) + '_' RETURN hubName, collect(DISTINCT type(r)) AS edgeTypeList ORDER BY hubName", {}, (err, rowList) => {
	if (err) { finish(err); return; }
	const undeclaredEdgeTypeList = rowList.reduce((soFar, hubRow) => soFar.concat(hubRow.edgeTypeList.filter((edgeType) => contract.hubDecompositionEdgeTypeList(hubRow.hubName).indexOf(edgeType) === -1)), []);
	assert('live: every hub edge type the graph holds is a declared slot of its hub (an undeclared slot goes red)', rowList.length > 0 && undeclaredEdgeTypeList.length === 0, `undeclared: ${JSON.stringify(undeclaredEdgeTypeList)}; hubs ${JSON.stringify(rowList.map((hubRow) => hubRow.hubName))}`);
	const hubSlotEdgeTypeCount = rowList.reduce((soFar, hubRow) => soFar + hubRow.edgeTypeList.filter((edgeType) => contract.HUB_DECOMPOSITION_SLOT_LIST.some((slotName) => edgeType.endsWith(`_${slotName}`))).length, 0);
	assert('live: each hub holds every hubSlotList slot (DOMAIN..QUALIFIER) the forge declares', hubSlotEdgeTypeCount >= contract.HUB_DECOMPOSITION_SLOT_LIST.length, `${hubSlotEdgeTypeCount}`);
	finish();
});
