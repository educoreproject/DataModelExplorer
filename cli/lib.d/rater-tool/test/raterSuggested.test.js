#!/usr/bin/env node
'use strict';

// raterSuggested.test.js — Phase 2 gates for `raterTool.js -buildSuggested` (lane RATER), against the live named gold.
//   T2.1 determinism: two runs, each embedding afresh (no queryEmbeddings.json), give identical suggested.json
//   T2.2 every one of the 150 has 1..20 cards; the distribution is printed
//   T2.3 no two cards in one list share class + property + qualifiers
//   T2.4 qualifiers: a list holding two cards that differ only by qualifier keeps both, each labelled
//   T2.5 card text = graph: 10 cards chosen by a seeded draw, re-read by tuple id with THIS test's Cypher, field for field
//   plus: the merge's own red twins (an identical card collapses; the cap holds; a shared tuple counts once)
//   revision 3 (gold injection): merge red twins; every gold tuple of every mapped item on its list (own Cypher); no list
//   over 20; unmapped entries byte-identical to revision 2; a mapped list changes only by injected cards in and
//   displaced non-gold cards out
//
//   /usr/local/bin/node cli/lib.d/rater-tool/test/raterSuggested.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const RATER_TOOL_PATH = path.join(__dirname, '..', 'raterTool.js');
const FROZEN_SAMPLE_PATH = path.join(__dirname, '..', 'frozenInputs', 'sample.json');
// revision 2's frozen lists, the reference the revision 3 gates compare against (code main at the end of revision 2)
const REVISION2_COMMIT = '1005e1d';

let passCount = 0;
let failCount = 0;
const check = (testName, condition, detailText) => {
	if (condition) {
		passCount++;
		console.log(`  PASS: ${testName}`);
		return;
	}
	failCount++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

// ⟪lane zbE, E4⟫ the rater reads the DME's gold (the golden pointer; GOLDEN_CONTAINER overrides), as raterTool.js does
const DME_GOLDEN_CONTAINER_NAME = require(path.join(__dirname, '..', '..', '..', '..', 'server', 'test', 'lib', 'goldenContainerName')).readGoldenContainerName();
// the frozen lists REPRODUCE only on the gold they were built from (the searches answer from the gold); since E4 the rater
// reads the DME's gold, so the build gates (determinism, committed = built, the flagless refusal) run only when the DME's gold
// IS that gold, and are reported NOT APPLICABLE by name otherwise. Every other gate reads the frozen file and the DME's gold;
// the item-by-item proof that the frozen lists read identically on the DME's gold is testData/zeroBacklog/e4.
const SAMPLE_PROVENANCE_GOLD_NAME = JSON.parse(fs.readFileSync(FROZEN_SAMPLE_PATH, 'utf8')).goldenContainerName;
const buildGatesApply = DME_GOLDEN_CONTAINER_NAME === SAMPLE_PROVENANCE_GOLD_NAME;
let notApplicableCount = 0;
const notApplicable = (testName) => {
	notApplicableCount++;
	console.log(`  NOT APPLICABLE: ${testName} — the frozen lists were built on ${SAMPLE_PROVENANCE_GOLD_NAME}; the DME's gold is ${DME_GOLDEN_CONTAINER_NAME}`);
};
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raterSuggestedTest-'));
const runBuild = (runName) => {
	const runDirPath = path.join(scratchDirPath, runName);
	fs.mkdirSync(runDirPath);
	fs.copyFileSync(FROZEN_SAMPLE_PATH, path.join(runDirPath, 'sample.json'));
	execFileSync(process.execPath, [RATER_TOOL_PATH, '-buildSuggested', `--outputDirPath=${runDirPath}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	return fs.readFileSync(path.join(runDirPath, 'suggested.json'), 'utf8');
};
const FROZEN_SUGGESTED_TEXT = fs.readFileSync(path.join(__dirname, '..', 'frozenInputs', 'suggested.json'), 'utf8');
const firstText = buildGatesApply ? runBuild('run1') : FROZEN_SUGGESTED_TEXT;
const secondText = buildGatesApply ? runBuild('run2') : FROZEN_SUGGESTED_TEXT;
const suggestedDocument = JSON.parse(firstText);
const entryList = Object.values(suggestedDocument.suggestedByElementStableId);
const sampleDocument = JSON.parse(fs.readFileSync(FROZEN_SAMPLE_PATH, 'utf8'));

console.log('T2.1 determinism');
if (buildGatesApply) {
	check('two fresh runs give identical suggested.json', firstText === secondText && firstText.length > 10000, `lengths ${firstText.length} / ${secondText.length}`);
	check('the committed frozenInputs/suggested.json is exactly what the code builds', FROZEN_SUGGESTED_TEXT === firstText);
} else {
	notApplicable('two fresh runs give identical suggested.json');
	notApplicable('the committed frozenInputs/suggested.json is exactly what the code builds');
}

console.log('T2.2 list sizes');
check('one list per sampled element (150)', entryList.length === 150 && sampleDocument.elementList.every((element) => suggestedDocument.suggestedByElementStableId[element.elementStableId]), `${entryList.length}`);
const outOfRangeList = entryList.filter((entry) => entry.cardList.length < 1 || entry.cardList.length > 20);
check('every list holds 1..20 cards', outOfRangeList.length === 0, outOfRangeList.map((entry) => `${entry.elementStableId}=${entry.cardList.length}`).join(', '));
const distribution = entryList.reduce((soFar, entry) => ({ ...soFar, [entry.cardList.length]: (soFar[entry.cardList.length] || 0) + 1 }), {});
console.log(`    distribution (cards: elements): ${JSON.stringify(distribution)}`);

console.log('T2.3 no identical cards in a list');
const signatureOf = (card) => JSON.stringify([card.className, card.propertyName, card.qualifierNameList.slice().sort()]);
const duplicateList = entryList.filter((entry) => new Set(entry.cardList.map(signatureOf)).size !== entry.cardList.length);
check('no two cards in one list share class + property + qualifiers', duplicateList.length === 0, duplicateList.map((entry) => entry.elementStableId).join(', '));
const tupleDuplicateList = entryList.filter((entry) => {
	const tupleIdList = entry.cardList.reduce((soFar, card) => soFar.concat(card.cedsTupleIdList), []);
	return new Set(tupleIdList).size !== tupleIdList.length;
});
check('no tuple id appears on two cards of one list', tupleDuplicateList.length === 0);

console.log('T2.4 qualifiers kept and labelled');
const qualifierPairList = entryList.reduce((soFar, entry) => {
	const cardListByClassProperty = entry.cardList.reduce((groupSoFar, card) => {
		const groupName = JSON.stringify([card.className, card.propertyName]);
		return { ...groupSoFar, [groupName]: (groupSoFar[groupName] || []).concat([card]) };
	}, {});
	return soFar.concat(Object.values(cardListByClassProperty).filter((groupCardList) => groupCardList.length > 1).map((groupCardList) => ({ elementStableId: entry.elementStableId, groupCardList })));
}, []);
check('at least one sample list holds two cards differing only by qualifier', qualifierPairList.length > 0, `${qualifierPairList.length} found`);
const unlabelledPairList = qualifierPairList.filter(({ groupCardList }) => groupCardList.filter((card) => card.qualifierNameList.length === 0).length > 1 || new Set(groupCardList.map((card) => card.qualifierNameList.join('|'))).size !== groupCardList.length);
check('in every such list each card is kept and its qualifier label tells it apart', unlabelledPairList.length === 0, JSON.stringify(unlabelledPairList.slice(0, 2)));
const schoolIdEntry = suggestedDocument.suggestedByElementStableId['Ed-Fi:edfi:property/domainEntitySubclass.School.SchoolId'];
if (schoolIdEntry) {
	const organizationIdentifierQualifierList = schoolIdEntry.cardList.filter((card) => card.className === 'Organization' && card.propertyName === 'Has Organization Identifier').map((card) => card.qualifierNameList.join('|'));
	console.log(`    example: Ed-Fi School.SchoolId holds Organization → Has Organization Identifier as ${JSON.stringify(organizationIdentifierQualifierList)}`);
}

console.log('merge red twins (no graph)');
const { mergeCandidateLists } = require('../lib/buildSuggested');
const fakeCardOf = (cedsTupleId, className, propertyName, qualifierNameList) => ({ cedsTupleId, className, propertyName, qualifierNameList });
const fakeCardByTupleId = {
	t1: fakeCardOf('t1', 'Person Identification', 'Person Identifier', ['Student Identifier']),
	t2: fakeCardOf('t2', 'Person Identification', 'Person Identifier', ['Student Identifier']),
	t3: fakeCardOf('t3', 'Person Identification', 'Person Identifier', ['Staff Member Identifier']),
	t4: fakeCardOf('t4', 'Organization', 'Organization Name', []),
};
const mergedOnce = mergeCandidateLists({ rankedTupleIdListByMethod: { meaning: ['t1', 't3'], words: ['t2', 't1', 't4'] }, cardByTupleId: fakeCardByTupleId, suggestRules: { methodOrderList: ['meaning', 'words'], cardCap: 20 }, goldTupleIdList: [] });
const collapsedCard = mergedOnce.cardList.find((card) => card.cedsTupleId === 't1');
check('identical cards (t1, t2) collapse into one that remembers both tuple ids and both methods', mergedOnce.cardList.length === 3 && collapsedCard && JSON.stringify(collapsedCard.cedsTupleIdList) === '["t1","t2"]' && JSON.stringify(collapsedCard.foundByMethod) === '["meaning","words"]', JSON.stringify(mergedOnce));
check('a qualifier-only difference (t1 vs t3) is NOT collapsed', mergedOnce.cardList.some((card) => card.cedsTupleId === 't3'));
const mergedCapped = mergeCandidateLists({ rankedTupleIdListByMethod: { meaning: ['t1', 't3'], words: ['t4'] }, cardByTupleId: fakeCardByTupleId, suggestRules: { methodOrderList: ['meaning', 'words'], cardCap: 2 }, goldTupleIdList: [] });
check('the cap holds, and interleaving gives words 1 a slot before meaning 2', mergedCapped.cardList.length === 2 && mergedCapped.cardList.some((card) => card.cedsTupleId === 't4') && !mergedCapped.cardList.some((card) => card.cedsTupleId === 't3'), JSON.stringify(mergedCapped.cardList.map((card) => card.cedsTupleId)));

console.log('revision 3 merge red twins: gold injection (no graph)');
const goldCardByTupleId = {
	s1: fakeCardOf('s1', 'A', 'p1', []),
	s2: fakeCardOf('s2', 'A', 'p2', []),
	s3: fakeCardOf('s3', 'A', 'p3', []),
	s4: fakeCardOf('s4', 'A', 'p4', []),
	g1: fakeCardOf('g1', 'G', 'gold one', []),
	g2: fakeCardOf('g2', 'G', 'gold two', []),
	g3: fakeCardOf('g3', 'G', 'gold three', []),
	s1twin: fakeCardOf('s1twin', 'A', 'p1', []),
};
const threeCapRules = { methodOrderList: ['meaning', 'words'], cardCap: 3 };
const searchOnlyRanked = { meaning: ['s1', 's3'], words: ['s2', 's4'] }; // interleave s1, s2, s3, s4 → capped s1, s2, s3
const noGoldMerge = mergeCandidateLists({ rankedTupleIdListByMethod: searchOnlyRanked, cardByTupleId: goldCardByTupleId, suggestRules: threeCapRules, goldTupleIdList: [] });
check('no gold: the list is the search-built list (s1, s2, s3), nothing injected or displaced', JSON.stringify(noGoldMerge.cardList.map((card) => card.cedsTupleId)) === '["s1","s2","s3"]' && noGoldMerge.mergeCountList.displacedCardCount === 0 && noGoldMerge.goldInjectedTupleIdList.length === 0, JSON.stringify(noGoldMerge.cardList.map((card) => card.cedsTupleId)));
const oneGoldMerge = mergeCandidateLists({ rankedTupleIdListByMethod: searchOnlyRanked, cardByTupleId: goldCardByTupleId, suggestRules: threeCapRules, goldTupleIdList: ['g1'] });
check('one gold tuple off the list: injected as a card with the same fields; the LAST-ranked non-gold card (s3) leaves', JSON.stringify(oneGoldMerge.cardList.map((card) => card.cedsTupleId)) === '["g1","s1","s2"]' && JSON.stringify(Object.keys(oneGoldMerge.cardList[0]).sort()) === JSON.stringify(Object.keys(oneGoldMerge.cardList[1]).sort()) && JSON.stringify(oneGoldMerge.goldInjectedTupleIdList) === '["g1"]' && oneGoldMerge.mergeCountList.displacedCardCount === 1 && oneGoldMerge.mergeCountList.goldInjectedCardCount === 1, JSON.stringify(oneGoldMerge));
const goldOnListMerge = mergeCandidateLists({ rankedTupleIdListByMethod: searchOnlyRanked, cardByTupleId: goldCardByTupleId, suggestRules: threeCapRules, goldTupleIdList: ['s3', 'g1'] });
check('a gold tuple already on the list (s3, ranked last) is never displaced; the next non-gold (s2) leaves instead; only g1 counts as injected', JSON.stringify(goldOnListMerge.cardList.map((card) => card.cedsTupleId)) === '["g1","s1","s3"]' && JSON.stringify(goldOnListMerge.goldTupleIdList) === '["g1","s3"]' && JSON.stringify(goldOnListMerge.goldInjectedTupleIdList) === '["g1"]', JSON.stringify(goldOnListMerge.cardList.map((card) => card.cedsTupleId)));
const goldBeyondCapMerge = mergeCandidateLists({ rankedTupleIdListByMethod: searchOnlyRanked, cardByTupleId: goldCardByTupleId, suggestRules: threeCapRules, goldTupleIdList: ['s4'] });
check('a gold tuple ranked by a search but beyond the cap (s4) is brought on, keeps its foundByMethod, and counts as injected', JSON.stringify(goldBeyondCapMerge.cardList.map((card) => card.cedsTupleId)) === '["s1","s2","s4"]' && JSON.stringify(goldBeyondCapMerge.cardList.find((card) => card.cedsTupleId === 's4').foundByMethod) === '["words"]' && JSON.stringify(goldBeyondCapMerge.goldInjectedTupleIdList) === '["s4"]', JSON.stringify(goldBeyondCapMerge.cardList));
const goldOverCapMerge = mergeCandidateLists({ rankedTupleIdListByMethod: searchOnlyRanked, cardByTupleId: goldCardByTupleId, suggestRules: { ...threeCapRules, cardCap: 2 }, goldTupleIdList: ['g1', 'g2', 'g3'] });
check('gold cards alone past the cap: all three kept, no non-gold card, goldCardOverCapCount 1', JSON.stringify(goldOverCapMerge.cardList.map((card) => card.cedsTupleId)) === '["g1","g2","g3"]' && goldOverCapMerge.mergeCountList.goldCardOverCapCount === 1, JSON.stringify(goldOverCapMerge.cardList.map((card) => card.cedsTupleId)));
const goldTwinMerge = mergeCandidateLists({ rankedTupleIdListByMethod: searchOnlyRanked, cardByTupleId: goldCardByTupleId, suggestRules: threeCapRules, goldTupleIdList: ['s1twin'] });
check('a gold tuple identical to a listed card (same class + property + qualifiers) joins that card instead of becoming a second one', goldTwinMerge.cardList.length === 3 && JSON.stringify(goldTwinMerge.cardList.find((card) => card.cedsTupleId === 's1').cedsTupleIdList) === '["s1","s1twin"]', JSON.stringify(goldTwinMerge.cardList));
let missingGoldListThrew = false;
let unreadGoldThrew = false;
try { mergeCandidateLists({ rankedTupleIdListByMethod: searchOnlyRanked, cardByTupleId: goldCardByTupleId, suggestRules: threeCapRules }); } catch (mergeError) { missingGoldListThrew = /goldTupleIdList must be a list/.test(mergeError.message); }
try { mergeCandidateLists({ rankedTupleIdListByMethod: searchOnlyRanked, cardByTupleId: goldCardByTupleId, suggestRules: threeCapRules, goldTupleIdList: ['nope'] }); } catch (mergeError) { unreadGoldThrew = /has no card/.test(mergeError.message); }
check('an absent goldTupleIdList, or a gold tuple with no card, is refused by name (never quietly treated as no gold)', missingGoldListThrew && unreadGoldThrew);

console.log('revision 3 gates on the built suggested.json (against revision 2 at ' + REVISION2_COMMIT + ')');
const revision2Document = JSON.parse(execFileSync('git', ['show', `${REVISION2_COMMIT}:cli/lib.d/rater-tool/frozenInputs/suggested.json`], { cwd: path.join(__dirname, '..', '..', '..', '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const elementByStableId = sampleDocument.elementList.reduce((soFar, element) => ({ ...soFar, [element.elementStableId]: element }), {});
const mappedEntryList = entryList.filter((entry) => elementByStableId[entry.elementStableId].isMappedInGold === true);
const unmappedEntryList = entryList.filter((entry) => elementByStableId[entry.elementStableId].isMappedInGold !== true);
check('120 mapped and 30 unmapped entries', mappedEntryList.length === 120 && unmappedEntryList.length === 30, `${mappedEntryList.length}/${unmappedEntryList.length}`);
const overLongList = entryList.filter((entry) => entry.cardList.length > 20 || entry.cardCount !== entry.cardList.length);
check('no list is longer than 20 (no gold-over-cap case arose), and cardCount = the list length', overLongList.length === 0, overLongList.map((entry) => entry.elementStableId).join(', '));
const changedUnmappedList = unmappedEntryList.filter((entry) => JSON.stringify(entry, null, '\t') !== JSON.stringify(revision2Document.suggestedByElementStableId[entry.elementStableId], null, '\t'));
check('every unmapped entry is byte-identical to revision 2 (30/30), and carries no gold field', changedUnmappedList.length === 0 && unmappedEntryList.every((entry) => !('goldTupleIdList' in entry) && !('goldInjectedTupleIdList' in entry)), changedUnmappedList.map((entry) => entry.elementStableId).join(', '));
check('every mapped entry carries goldTupleIdList (non-empty) and goldInjectedTupleIdList', mappedEntryList.every((entry) => Array.isArray(entry.goldTupleIdList) && entry.goldTupleIdList.length > 0 && Array.isArray(entry.goldInjectedTupleIdList)));
const cardTupleIdSetOf = (cardList) => new Set(cardList.reduce((soFar, card) => soFar.concat(card.cedsTupleIdList), []));
const badDeltaList = mappedEntryList.filter((entry) => {
	const revision2CardList = revision2Document.suggestedByElementStableId[entry.elementStableId].cardList;
	const revision2CardTextById = revision2CardList.reduce((soFar, card) => ({ ...soFar, [card.cedsTupleId]: JSON.stringify(card) }), {});
	const newCardTextById = entry.cardList.reduce((soFar, card) => ({ ...soFar, [card.cedsTupleId]: JSON.stringify(card) }), {});
	const injectedSet = new Set(entry.goldInjectedTupleIdList);
	const goldSet = new Set(entry.goldTupleIdList);
	const cameInList = entry.cardList.filter((card) => !revision2CardTextById[card.cedsTupleId]);
	const wentOutList = revision2CardList.filter((card) => !newCardTextById[card.cedsTupleId]);
	const keptChangedList = entry.cardList.filter((card) => revision2CardTextById[card.cedsTupleId] && revision2CardTextById[card.cedsTupleId] !== newCardTextById[card.cedsTupleId]);
	const revision2TupleIdSet = cardTupleIdSetOf(revision2CardList);
	const expectedInjectedList = entry.goldTupleIdList.filter((cedsTupleId) => !revision2TupleIdSet.has(cedsTupleId));
	const capHeld = revision2CardList.length + cameInList.length <= 20 ? wentOutList.length === 0 : entry.cardList.length === 20;
	return !(cameInList.every((card) => card.cedsTupleIdList.some((cedsTupleId) => injectedSet.has(cedsTupleId)))
		&& wentOutList.every((card) => !card.cedsTupleIdList.some((cedsTupleId) => goldSet.has(cedsTupleId)))
		&& keptChangedList.length === 0
		&& JSON.stringify(expectedInjectedList) === JSON.stringify(entry.goldInjectedTupleIdList)
		&& cameInList.length === entry.goldInjectedTupleIdList.length
		&& entry.cardList.length === revision2CardList.length - wentOutList.length + cameInList.length
		&& capHeld);
});
check('every mapped list = revision 2 list − displaced non-gold cards + injected gold cards; kept cards byte-identical; goldInjectedTupleIdList = gold tuples not on revision 2\'s list', badDeltaList.length === 0, badDeltaList.map((entry) => entry.elementStableId).join(', '));
const touchedCount = mappedEntryList.filter((entry) => entry.goldInjectedTupleIdList.length > 0).length;
const revision2MissCount = mappedEntryList.filter((entry) => { const revision2TupleIdSet = cardTupleIdSetOf(revision2Document.suggestedByElementStableId[entry.elementStableId].cardList); return !entry.goldTupleIdList.some((cedsTupleId) => revision2TupleIdSet.has(cedsTupleId)); }).length;
console.log(`    mapped items touched: ${touchedCount}; items whose revision 2 list held no gold tuple: ${revision2MissCount}`);

console.log('revision 3: a sample element without a true/false isMappedInGold is refused by name, never treated as unmapped');
const flaglessRunDirPath = path.join(scratchDirPath, 'flagless');
fs.mkdirSync(flaglessRunDirPath);
const flaglessSampleDocument = JSON.parse(fs.readFileSync(FROZEN_SAMPLE_PATH, 'utf8'));
delete flaglessSampleDocument.elementList[0].isMappedInGold;
fs.writeFileSync(path.join(flaglessRunDirPath, 'sample.json'), JSON.stringify(flaglessSampleDocument));
const flaglessRun = buildGatesApply ? spawnSync(process.execPath, [RATER_TOOL_PATH, '-buildSuggested', `--outputDirPath=${flaglessRunDirPath}`], { encoding: 'utf8' }) : null;
if (!buildGatesApply) notApplicable('the build exits 1 naming isMappedInGold');
if (buildGatesApply) check('the build exits 1 naming isMappedInGold, and writes no suggested.json', flaglessRun.status === 1 && /isMappedInGold/.test(flaglessRun.stderr) && !fs.existsSync(path.join(flaglessRunDirPath, 'suggested.json')), `exit ${flaglessRun.status}; ${flaglessRun.stderr.slice(-200)}`);

// T2.5 needs the gold
console.log('T2.5 card text matches the graph (10 seeded cards, this test\'s own Cypher)');
process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {} } };
const { openRaterGraph } = require('../../../../server/data-model/lib/rater-tool/rater-graph');
const { seededShuffle } = require('../../../../server/data-model/lib/rater-tool/seeded-draw');
const TUPLE_TRUTH_CYPHER = `MATCH (h:ForgedNode {stableId: $cedsTupleId})
	MATCH (h)-[:HAS_CEDS_DOMAIN]->(c)
	MATCH (h)-[:HAS_CEDS_PROPERTY]->(p)
	OPTIONAL MATCH (p)-[:HAS_OPTION_SET]->(o)
	RETURN h.referenceTier AS referenceTier, c.name AS className, c.definition AS classDefinition, h.propertyName AS propertyName,
	       coalesce(h.qualifierNames, []) AS qualifierNameList, p.cedsId AS cedsId, h.propertyDefinition AS definition, o.name AS optionSetName`;
const allCardList = entryList.reduce((soFar, entry) => soFar.concat(entry.cardList), []).sort((cardA, cardB) => (cardA.cedsTupleId < cardB.cedsTupleId ? -1 : 1));
const chosenCardList = seededShuffle(allCardList, 'raterSuggestedTest-T2.5', 'cards').slice(0, 10);
openRaterGraph({ goldenContainerName: DME_GOLDEN_CONTAINER_NAME, queryTimeoutMs: 30000 }, (openError, openResult) => {
	if (openError || openResult.refusal) {
		check('the named gold opens', false, openError || openResult.refusal.refusalText);
		finish();
		return;
	}
	const { raterGraph } = openResult;
	let remainingCount = chosenCardList.length;
	chosenCardList.forEach((card) => {
		raterGraph.runQuery(TUPLE_TRUTH_CYPHER, { cedsTupleId: card.cedsTupleId }, (queryError, rowList) => {
			const truth = (rowList || [])[0];
			const fieldNameList = ['className', 'classDefinition', 'propertyName', 'qualifierNameList', 'cedsId', 'definition', 'optionSetName'];
			const differingList = truth ? fieldNameList.filter((fieldName) => JSON.stringify(truth[fieldName] === undefined ? null : truth[fieldName]) !== JSON.stringify(card[fieldName] === undefined ? null : card[fieldName])) : ['no such tuple'];
			check(`${card.className} → ${card.propertyName}${card.qualifierNameList.length ? ` (${card.qualifierNameList.join(', ')})` : ''}: property tier, every field equal`, !queryError && truth && truth.referenceTier === 'property' && differingList.length === 0, queryError || differingList.join(', '));
			remainingCount -= 1;
			if (remainingCount === 0) {
				runGoldTruthGate(raterGraph);
			}
		});
	});
});

// revision 3: every gold tuple of every mapped element is on its list, the gold read with THIS test's Cypher (edge types
// tested with type(), PESC occurrences found by prefix), not goldTupleReader.js
const GOLD_TRUTH_CYPHER_BY_STANDARD = {
	'Ed-Fi': `MATCH (member:ForgedNode) WHERE member.stableId IN $memberStableIdList
		MATCH (member)-[edge]->(tuple:HubReference {hubName: 'CEDS'}) WHERE type(edge) IN $edgeTypeList
		RETURN collect(DISTINCT tuple.stableId) AS goldIdList, collect(DISTINCT tuple.referenceTier) AS tierList`,
	PESC: `UNWIND $memberStableIdList AS memberStableId
		MATCH (occurrence:ForgedNode) WHERE occurrence.stableId STARTS WITH memberStableId + '/at/'
		MATCH (occurrence)-[edge]->(tuple:HubReference {hubName: 'CEDS'}) WHERE type(edge) IN $edgeTypeList
		RETURN collect(DISTINCT tuple.stableId) AS goldIdList, collect(DISTINCT tuple.referenceTier) AS tierList`,
};
GOLD_TRUTH_CYPHER_BY_STANDARD.SIF = GOLD_TRUTH_CYPHER_BY_STANDARD['Ed-Fi'];
const runGoldTruthGate = (raterGraph) => {
	console.log('revision 3: every gold tuple of every mapped element is on its list (this test\'s own Cypher)');
	const mappedElementList = sampleDocument.elementList.filter((element) => element.isMappedInGold === true);
	const missList = [];
	const fieldMismatchList = [];
	const nonPropertyList = [];
	let goldTupleTotal = 0;
	let remainingCount = mappedElementList.length;
	mappedElementList.forEach((element) => {
		raterGraph.runQuery(GOLD_TRUTH_CYPHER_BY_STANDARD[element.standard], { memberStableIdList: element.memberStableIdList, edgeTypeList: ['EXACT_MATCH', 'CLOSE_MATCH', 'BROAD_MATCH', 'NARROW_MATCH'] }, (queryError, rowList) => {
			const truth = queryError ? null : rowList[0];
			const goldIdList = truth ? truth.goldIdList.slice().sort() : [];
			const entry = suggestedDocument.suggestedByElementStableId[element.elementStableId];
			const onListSet = new Set(entry.cardList.reduce((soFar, card) => soFar.concat(card.cedsTupleIdList), []));
			goldTupleTotal += goldIdList.length;
			if (queryError || goldIdList.length === 0 || !goldIdList.every((cedsTupleId) => onListSet.has(cedsTupleId))) {
				missList.push(`${element.elementStableId}${queryError ? ` (${queryError})` : ''}: ${goldIdList.filter((cedsTupleId) => !onListSet.has(cedsTupleId)).length} of ${goldIdList.length} off the list`);
			}
			if (JSON.stringify(goldIdList) !== JSON.stringify(entry.goldTupleIdList)) {
				fieldMismatchList.push(element.elementStableId);
			}
			if (truth && truth.tierList.some((tierName) => tierName !== 'property')) {
				nonPropertyList.push(element.elementStableId);
			}
			remainingCount -= 1;
			if (remainingCount === 0) {
				check(`all ${mappedElementList.length} mapped items: every gold tuple (${goldTupleTotal} in all) is on the item's list`, mappedElementList.length === 120 && missList.length === 0, missList.slice(0, 5).join('; '));
				check('goldTupleIdList in suggested.json equals the gold read here, item for item', fieldMismatchList.length === 0, fieldMismatchList.slice(0, 5).join(', '));
				check('every gold tuple is property-tier (a card)', nonPropertyList.length === 0, nonPropertyList.join(', '));
				raterGraph.close();
				finish();
			}
		});
	});
};

const finish = () => {
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	console.log(`\n=== raterSuggested (Phase 2) — Results: ${passCount} passed, ${failCount} failed${notApplicableCount ? `, ${notApplicableCount} not applicable on this gold` : ''} ===`);
	process.exit(failCount === 0 ? 0 : 1);
};
