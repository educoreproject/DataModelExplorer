#!/usr/bin/env node
'use strict';

// hub-slot-list-shared.test.js — W-D-5 (campaign P1, 2026-10-06; V2-C26). The hub decomposes through one edge per slot,
// HAS_<HUBNAME>_<SLOT>. traversal.cypher's incoming arm read all five slots and findMappings' incoming arm read two, so a
// CEDS class, range or qualifier answered in one tool and not the other. ONE declared slot list now serves both:
// toolPayloadContract.HUB_DECOMPOSITION_SLOT_LIST (INTERIM copy of educoreForge vocabulary.js HUB_DECOMPOSITION_SLOTS
// until graphContract.json carries it, P2). Asserts the copy equals the forge's declaration, traversal.cypher's incoming
// alternation and findMappings' incoming pattern both equal it, and the live graph holds no hub edge type outside it.
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
assert('the DME copy equals educoreForge HUB_DECOMPOSITION_SLOTS (interim until graphContract.json)', JSON.stringify(contract.HUB_DECOMPOSITION_SLOT_LIST) === JSON.stringify(forgeVocabulary.HUB_DECOMPOSITION_SLOTS), `${JSON.stringify(contract.HUB_DECOMPOSITION_SLOT_LIST)} vs ${JSON.stringify(forgeVocabulary.HUB_DECOMPOSITION_SLOTS)}`);
assert('  and hubDecompositionEdgeTypeList matches the forge hubEdgeType()', sortedText(declaredEdgeTypeList) === sortedText(forgeVocabulary.HUB_DECOMPOSITION_SLOTS.map((slotName) => forgeVocabulary.hubEdgeType('CEDS', slotName))));

const traversalIncomingMatch = readText(path.join(harness.dmeDirPath, 'traversal.cypher')).match(/OPTIONAL MATCH \(node\)<-\[:([A-Z_|]+)\]-\(hub:HubReference\)<-\[m:/);
assert("traversal.cypher's incoming alternation equals the declared list", traversalIncomingMatch && sortedText(traversalIncomingMatch[1].split('|')) === sortedText(declaredEdgeTypeList), traversalIncomingMatch && traversalIncomingMatch[1]);
const searchText = readText(searchFilePath);
const literalIncomingMatch = searchText.match(/MATCH \(n\)<-\[:([A-Z_|]+)\]-\(hub:HubReference\)/);
assert('findMappings carries no literal hub-slot alternation (it is built from the declaration)', !literalIncomingMatch, literalIncomingMatch && literalIncomingMatch[1]);
assert('findMappings builds its incoming pattern from hubDecompositionEdgeTypeList', /hubDecompositionEdgeTypeList\(/.test(searchText));

runQuery("MATCH (h:HubDefinition) WITH h.hubName AS hubName MATCH ()-[r]->() WHERE type(r) STARTS WITH 'HAS_' + toUpper(hubName) + '_' RETURN DISTINCT type(r) AS edgeType", {}, (err, rowList) => {
	if (err) { finish(err); return; }
	assert('live: the graph holds exactly the declared hub edge types (a sixth slot goes red)', sortedText(rowList.map((oneRow) => oneRow.edgeType)) === sortedText(declaredEdgeTypeList), JSON.stringify(rowList.map((oneRow) => oneRow.edgeType)));
	finish();
});
