#!/usr/bin/env node
'use strict';

// raterSuggested.test.js — Phase 2 gates for `raterTool.js -buildSuggested` (lane RATER), against the live named gold.
//   T2.1 determinism: two runs, each embedding afresh (no queryEmbeddings.json), give identical suggested.json
//   T2.2 every one of the 150 has 1..20 cards; the distribution is printed
//   T2.3 no two cards in one list share class + property + qualifiers
//   T2.4 qualifiers: a list holding two cards that differ only by qualifier keeps both, each labelled
//   T2.5 card text = graph: 10 cards chosen by a seeded draw, re-read by tuple id with THIS test's Cypher, field for field
//   plus: the merge's own red twins (an identical card collapses; the cap holds; a shared tuple counts once)
//
//   /usr/local/bin/node cli/lib.d/rater-tool/test/raterSuggested.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RATER_TOOL_PATH = path.join(__dirname, '..', 'raterTool.js');
const FROZEN_SAMPLE_PATH = path.join(__dirname, '..', 'frozenInputs', 'sample.json');

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

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raterSuggestedTest-'));
const runBuild = (runName) => {
	const runDirPath = path.join(scratchDirPath, runName);
	fs.mkdirSync(runDirPath);
	fs.copyFileSync(FROZEN_SAMPLE_PATH, path.join(runDirPath, 'sample.json'));
	execFileSync(process.execPath, [RATER_TOOL_PATH, '-buildSuggested', `--outputDirPath=${runDirPath}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	return fs.readFileSync(path.join(runDirPath, 'suggested.json'), 'utf8');
};
const firstText = runBuild('run1');
const secondText = runBuild('run2');
const suggestedDocument = JSON.parse(firstText);
const entryList = Object.values(suggestedDocument.suggestedByElementStableId);
const sampleDocument = JSON.parse(fs.readFileSync(FROZEN_SAMPLE_PATH, 'utf8'));

console.log('T2.1 determinism');
check('two fresh runs give identical suggested.json', firstText === secondText && firstText.length > 10000, `lengths ${firstText.length} / ${secondText.length}`);

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
const mergedOnce = mergeCandidateLists({ rankedTupleIdListByMethod: { meaning: ['t1', 't3'], words: ['t2', 't1', 't4'] }, cardByTupleId: fakeCardByTupleId, suggestRules: { methodOrderList: ['meaning', 'words'], cardCap: 20 } });
const collapsedCard = mergedOnce.cardList.find((card) => card.cedsTupleId === 't1');
check('identical cards (t1, t2) collapse into one that remembers both tuple ids and both methods', mergedOnce.cardList.length === 3 && collapsedCard && JSON.stringify(collapsedCard.cedsTupleIdList) === '["t1","t2"]' && JSON.stringify(collapsedCard.foundByMethod) === '["meaning","words"]', JSON.stringify(mergedOnce));
check('a qualifier-only difference (t1 vs t3) is NOT collapsed', mergedOnce.cardList.some((card) => card.cedsTupleId === 't3'));
const mergedCapped = mergeCandidateLists({ rankedTupleIdListByMethod: { meaning: ['t1', 't3'], words: ['t4'] }, cardByTupleId: fakeCardByTupleId, suggestRules: { methodOrderList: ['meaning', 'words'], cardCap: 2 } });
check('the cap holds, and interleaving gives words 1 a slot before meaning 2', mergedCapped.cardList.length === 2 && mergedCapped.cardList.some((card) => card.cedsTupleId === 't4') && !mergedCapped.cardList.some((card) => card.cedsTupleId === 't3'), JSON.stringify(mergedCapped.cardList.map((card) => card.cedsTupleId)));

// T2.5 needs the gold
console.log('T2.5 card text matches the graph (10 seeded cards, this test\'s own Cypher)');
process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {} } };
const configFileProcessor = require('qtools-config-file-processor');
const raterToolConfig = configFileProcessor.getConfig('raterTool.ini', path.join(__dirname, '..', '..', '..', '..', '..', 'configs', 'instanceSpecific', 'qbook') + '/', { resolve: true }).raterTool;
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
openRaterGraph({ goldenContainerName: raterToolConfig.goldenContainerName, queryTimeoutMs: 30000 }, (openError, openResult) => {
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
				raterGraph.close();
				finish();
			}
		});
	});
});

const finish = () => {
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	console.log(`\n=== raterSuggested (Phase 2) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
};
