#!/usr/bin/env node
'use strict';

// raterGraphCorrectnessCheck.js — ⟪lane zbE, E4 (TQ ruling 2026-10-23)⟫ before the CEDS Rater stops pinning its own gold and
// reads the DME's, prove what a rater SEES and what SCORING READS is unchanged between the two graphs, item by item. Read-only
// on both graphs, through the rater's OWN reads (rater-graph.js openRaterGraph, ceds-cards.js), so the comparison is of the
// cards the tool would serve, not of a parallel query.
//
//   node raterGraphCorrectnessCheck.js <codeRootPath> <oldContainerName> <newContainerName> <outputFilePath>
//
// For every frozen item:
//   TARGETS (sample.json elementList): each member stableId must resolve on both graphs, and the element fields the rater
//     page shows (name, definition, path) must equal the frozen ones on both (the page shows the frozen text; a target that
//     no longer resolves, or whose graph text drifted, is listed).
//   CANDIDATES (suggested.json, every card of every list): readCardsByTupleIdList on each graph; every field of the card the
//     rater sees (toCard's fields) and the two scoring reads (cedsId and qualifierNameList: card-property-identity) compared
//     between the graphs and against the frozen card.
//   LIVE SEARCH (a rater's own search, not frozen): for every element, the words leg and the meaning leg (the frozen query
//     embedding) on each graph, window 15; ranked tuple-id lists compared. Reported as a named difference, not a failure:
//     the search answers from whatever gold the rater reads.
// Writes a JSON report and prints a summary; exit 0 when targets and candidates are identical, 1 otherwise.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [codeRootPath, oldContainerName, newContainerName, outputFilePath] = process.argv.slice(2);
if (!codeRootPath || !oldContainerName || !newContainerName || !outputFilePath) {
	console.error('usage: raterGraphCorrectnessCheck.js <codeRootPath> <oldContainerName> <newContainerName> <outputFilePath>');
	process.exit(2);
}
process.global = { getConfig: () => ({}), xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} }, rawConfig: {}, commandLineParameters: { switches: {}, values: {} } };
const { openRaterGraph } = require(path.join(codeRootPath, 'server/data-model/lib/rater-tool/rater-graph'));
const cedsCards = require(path.join(codeRootPath, 'server/data-model/lib/rater-tool/ceds-cards'));
const { propertyIdentityOf } = require(path.join(codeRootPath, 'server/data-model/lib/rater-tool/card-property-identity'));
const frozenDirPath = path.join(codeRootPath, 'cli/lib.d/rater-tool/frozenInputs');
const sampleDocument = JSON.parse(fs.readFileSync(path.join(frozenDirPath, 'sample.json'), 'utf8'));
const suggestedDocument = JSON.parse(fs.readFileSync(path.join(frozenDirPath, 'suggested.json'), 'utf8'));
const queryEmbeddingDocument = JSON.parse(fs.readFileSync(path.join(frozenDirPath, 'queryEmbeddings.json'), 'utf8'));
const suggestRules = JSON.parse(fs.readFileSync(path.join(codeRootPath, 'cli/lib.d/rater-tool/config/suggestRules.json'), 'utf8'));

const CARD_FIELD_LIST = ['cedsTupleId', 'className', 'classCedsId', 'classDefinition', 'propertyName', 'qualifierNameList', 'cedsId', 'definition', 'optionSetName', 'optionValueList', 'optionValueCount', 'cedsUrl'];
const TARGET_FIELD_LIST = ['name', 'description', 'path'];
const SEARCH_WINDOW_SIZE = suggestRules.perMethodCount;
const QUERY_TIMEOUT_MS = 120000;

const cardFieldTextOf = (card) => JSON.stringify(CARD_FIELD_LIST.map((fieldName) => card[fieldName]));
const scoringTextOf = (card) => { try { return propertyIdentityOf(card); } catch (identityError) { return `UNSCORABLE: ${identityError.message}`; } };

const openBoth = (callback) => openRaterGraph({ goldenContainerName: oldContainerName, queryTimeoutMs: QUERY_TIMEOUT_MS }, (oldError, oldResult) => {
	if (oldError || oldResult.refusal) { callback(`old graph: ${oldError || oldResult.refusal.refusalText}`); return; }
	openRaterGraph({ goldenContainerName: newContainerName, queryTimeoutMs: QUERY_TIMEOUT_MS }, (newError, newResult) => {
		if (newError || newResult.refusal) { callback(`new graph: ${newError || newResult.refusal.refusalText}`); return; }
		callback('', { oldGraph: oldResult.raterGraph, newGraph: newResult.raterGraph });
	});
});

const readTargets = (raterGraph, stableIdList, callback) => raterGraph.runQuery('MATCH (n:ForgedNode) WHERE n.stableId IN $stableIdList RETURN n.stableId AS stableId, n.name AS name, n.description AS description, n.path AS path', { stableIdList }, (err, rowList) => {
	if (err) { callback(err); return; }
	const rowByStableId = {};
	rowList.forEach((oneRow) => { rowByStableId[oneRow.stableId] = oneRow; });
	callback('', rowByStableId);
});

const report = { oldContainerName, newContainerName, targets: {}, candidates: {}, liveSearch: {} };

openBoth((openError, { oldGraph, newGraph } = {}) => {
	if (openError) { console.error(openError); process.exit(2); }
	const finish = (exitCode) => { oldGraph.close(); newGraph.close(); fs.writeFileSync(outputFilePath, `${JSON.stringify(report, null, '\t')}\n`); process.exit(exitCode); };

	// ---- TARGETS
	const memberStableIdList = [...new Set(sampleDocument.elementList.reduce((soFar, oneElement) => soFar.concat(oneElement.memberStableIdList), []))];
	readTargets(oldGraph, memberStableIdList, (oldTargetError, oldTargetByStableId) => {
		readTargets(newGraph, memberStableIdList, (newTargetError, newTargetByStableId) => {
			if (oldTargetError || newTargetError) { console.error(oldTargetError || newTargetError); finish(2); return; }
			const targetDiffList = [];
			memberStableIdList.forEach((stableId) => {
				const oldRow = oldTargetByStableId[stableId];
				const newRow = newTargetByStableId[stableId];
				if (!oldRow || !newRow) { targetDiffList.push({ stableId, kind: 'unresolved', onOld: !!oldRow, onNew: !!newRow }); return; }
				TARGET_FIELD_LIST.forEach((fieldName) => {
					if (JSON.stringify(oldRow[fieldName]) !== JSON.stringify(newRow[fieldName])) targetDiffList.push({ stableId, kind: 'fieldDiffers', fieldName, oldValue: oldRow[fieldName], newValue: newRow[fieldName] });
				});
			});
			report.targets = { memberCount: memberStableIdList.length, elementCount: sampleDocument.elementList.length, diffList: targetDiffList };

			// ---- CANDIDATES
			const frozenCardByTupleId = {};
			Object.values(suggestedDocument.suggestedByElementStableId).forEach((oneList) => oneList.cardList.forEach((oneCard) => { (oneCard.cedsTupleIdList || [oneCard.cedsTupleId]).forEach((tupleId) => { frozenCardByTupleId[tupleId] = frozenCardByTupleId[tupleId] || oneCard; }); }));
			const tupleIdList = Object.keys(frozenCardByTupleId).sort();
			cedsCards.readCardsByTupleIdList({ raterGraph: oldGraph, cedsTupleIdList: tupleIdList }, (oldCardError, oldCardList) => {
				cedsCards.readCardsByTupleIdList({ raterGraph: newGraph, cedsTupleIdList: tupleIdList }, (newCardError, newCardList) => {
					if (oldCardError || newCardError) { console.error(oldCardError || newCardError); finish(2); return; }
					const oldCardByTupleId = Object.fromEntries(oldCardList.map((oneCard) => [oneCard.cedsTupleId, oneCard]));
					const newCardByTupleId = Object.fromEntries(newCardList.map((oneCard) => [oneCard.cedsTupleId, oneCard]));
					const candidateDiffList = [];
					tupleIdList.forEach((tupleId) => {
						const oldCard = oldCardByTupleId[tupleId];
						const newCard = newCardByTupleId[tupleId];
						if (!oldCard || !newCard) { candidateDiffList.push({ tupleId, kind: 'unresolved', onOld: !!oldCard, onNew: !!newCard }); return; }
						CARD_FIELD_LIST.forEach((fieldName) => {
							if (JSON.stringify(oldCard[fieldName]) !== JSON.stringify(newCard[fieldName])) candidateDiffList.push({ tupleId, kind: 'seenFieldDiffers', fieldName, oldValue: oldCard[fieldName], newValue: newCard[fieldName] });
						});
						if (scoringTextOf(oldCard) !== scoringTextOf(newCard)) candidateDiffList.push({ tupleId, kind: 'scoringIdentityDiffers', oldValue: scoringTextOf(oldCard), newValue: scoringTextOf(newCard) });
					});
					const frozenDriftCount = tupleIdList.filter((tupleId) => newCardByTupleId[tupleId] && frozenCardByTupleId[tupleId].cedsTupleId === tupleId && CARD_FIELD_LIST.filter((fieldName) => fieldName !== 'cedsTupleId').some((fieldName) => JSON.stringify(frozenCardByTupleId[tupleId][fieldName]) !== JSON.stringify(newCardByTupleId[tupleId][fieldName]))).length;
					report.candidates = { tupleCount: tupleIdList.length, diffList: candidateDiffList, frozenCardDriftOnNewCount: frozenDriftCount };

					// ---- LIVE SEARCH (named, informational)
					cedsCards.resolveSearchIndexNames({ raterGraph: oldGraph }, (oldIndexError, oldIndexNames) => {
						cedsCards.resolveSearchIndexNames({ raterGraph: newGraph }, (newIndexError, newIndexNames) => {
							if (oldIndexError || newIndexError) { report.liveSearch = { error: String(oldIndexError || newIndexError) }; summarize(); return; }
							const elementIdList = Object.keys(suggestedDocument.suggestedByElementStableId);
							const searchSummary = { elementCount: elementIdList.length, wordsIdenticalCount: 0, wordsSameSetCount: 0, meaningIdenticalCount: 0, meaningSameSetCount: 0, meaningOverlapTotal: 0, meaningSkippedCount: 0, differingExampleList: [] };
							const sameSetOf = (leftList, rightList) => JSON.stringify((leftList || []).slice().sort()) === JSON.stringify((rightList || []).slice().sort());
							const searchNext = (elementIndex) => {
								if (elementIndex >= elementIdList.length) { report.liveSearch = searchSummary; summarize(); return; }
								const suggestion = suggestedDocument.suggestedByElementStableId[elementIdList[elementIndex]];
								const wordsArgs = { queryText: suggestion.queryText, wordJoinName: suggestRules.wordJoinName, windowSize: SEARCH_WINDOW_SIZE };
								cedsCards.searchByWords({ raterGraph: oldGraph, fulltextIndexName: oldIndexNames.fulltextIndexName, ...wordsArgs }, (oldWordsError, oldWordsList) => {
									cedsCards.searchByWords({ raterGraph: newGraph, fulltextIndexName: newIndexNames.fulltextIndexName, ...wordsArgs }, (newWordsError, newWordsList) => {
										const wordsSame = !oldWordsError && !newWordsError && JSON.stringify(oldWordsList) === JSON.stringify(newWordsList);
										if (wordsSame) searchSummary.wordsIdenticalCount += 1;
										if (sameSetOf(oldWordsList, newWordsList)) searchSummary.wordsSameSetCount += 1;
										// the frozen embedding, keyed as buildSuggested.js keys it: sha256 of the embedder metadata text and the query text
										const embedding = (queryEmbeddingDocument.embeddingBySignature || {})[crypto.createHash('sha256').update(`${JSON.stringify(queryEmbeddingDocument.model)}\n${suggestion.queryText}`).digest('hex')];
										if (!embedding) {
											searchSummary.meaningSkippedCount += 1;
											if (!wordsSame && searchSummary.differingExampleList.length < 10) searchSummary.differingExampleList.push({ elementStableId: elementIdList[elementIndex], leg: 'words', oldList: oldWordsList, newList: newWordsList });
											searchNext(elementIndex + 1);
											return;
										}
										cedsCards.searchByMeaning({ raterGraph: oldGraph, vectorIndexName: oldIndexNames.vectorIndexName, embedding, windowSize: SEARCH_WINDOW_SIZE }, (oldMeaningError, oldMeaningList) => {
											cedsCards.searchByMeaning({ raterGraph: newGraph, vectorIndexName: newIndexNames.vectorIndexName, embedding, windowSize: SEARCH_WINDOW_SIZE }, (newMeaningError, newMeaningList) => {
												const meaningSame = !oldMeaningError && !newMeaningError && JSON.stringify(oldMeaningList) === JSON.stringify(newMeaningList);
												if (meaningSame) searchSummary.meaningIdenticalCount += 1;
												if (sameSetOf(oldMeaningList, newMeaningList)) searchSummary.meaningSameSetCount += 1;
												searchSummary.meaningOverlapTotal += (newMeaningList || []).filter((tupleId) => (oldMeaningList || []).includes(tupleId)).length;
												if ((!wordsSame || !meaningSame) && searchSummary.differingExampleList.length < 10) searchSummary.differingExampleList.push({ elementStableId: elementIdList[elementIndex], wordsSame, meaningSame, oldWords: oldWordsList, newWords: newWordsList, oldMeaning: oldMeaningList, newMeaning: newMeaningList });
												searchNext(elementIndex + 1);
											});
										});
									});
								});
							};
							searchNext(0);
						});
					});
				});
			});
		});
	});

	const summarize = () => {
		const identical = report.targets.diffList.length === 0 && report.candidates.diffList.length === 0;
		console.log(`targets: ${report.targets.elementCount} elements, ${report.targets.memberCount} members, ${report.targets.diffList.length} difference(s)`);
		console.log(`candidates: ${report.candidates.tupleCount} tuples, ${report.candidates.diffList.length} difference(s) between the graphs; ${report.candidates.frozenCardDriftOnNewCount} differ from the frozen card`);
		console.log(`live search: ${JSON.stringify({ ...report.liveSearch, differingExampleList: undefined })}`);
		console.log(identical ? 'VERDICT: IDENTICAL (targets and candidates)' : 'VERDICT: DIFFERENCES (see the report)');
		finish(identical ? 0 : 1);
	};
});
