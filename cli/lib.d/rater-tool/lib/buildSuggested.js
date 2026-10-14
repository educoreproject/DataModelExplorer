'use strict';

// buildSuggested.js — the -buildSuggested action: for every element of sample.json, its candidate CEDS cards.
//   1. the query text (suggestRules.json: name split into words + definition + owner name split into words)
//   2. top perMethodCount tuples by meaning (vector) and by words (BM25), from the gold's own indexes (ceds-cards.js)
//   3. interleave meaning 1, words 1, meaning 2, ...: a tuple already taken, or a card identical to a taken card (same
//      class + property + qualifiers), joins that card (memberTupleIdList, foundByMethod) instead of taking a slot; new
//      cards stop at cardCap
//   4. cards stored UNORDERED (sorted by tuple id), each carrying foundByMethod for later analysis; the UI never reads it
// Writes suggested.json and suggested-report.md. The query embeddings are kept in queryEmbeddings.json beside them and
// reused when present for the same model and query text, so a rebuild never depends on the embedding service answering
// identically twice (the frozen inputs are frozen).
//
//   buildSuggested({ raterToolConfig, outputDirPath, readConfigJson }, callback(errText, resultText))

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
const { openRaterGraph } = require('../../../../server/data-model/lib/rater-tool/rater-graph');
const cedsCards = require('../../../../server/data-model/lib/rater-tool/ceds-cards');
const { createRaterEmbedder } = require('../../../../server/data-model/lib/rater-tool/rater-embedder');
const { writeSuggestedReport } = require('./suggestedReport');

const byText = (textA, textB) => (textA < textB ? -1 : textA > textB ? 1 : 0);

// 'StudentSchoolAssociation' -> 'Student School Association'; '@RefId' -> 'Ref Id'; 'SIF_Metadata' -> 'SIF Metadata'
const wordsOfName = (nameText) =>
	`${nameText || ''}`
		.replace(/^@/, '')
		.replace(/_/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.trim();

const queryTextOf = (element) => [wordsOfName(element.name), element.definition || '', wordsOfName(element.ownerName)].filter((part) => part !== '').join(' ');

const embeddingCacheSignatureOf = (modelText, queryText) => crypto.createHash('sha256').update(`${modelText}\n${queryText}`).digest('hex');

// mergeCandidateLists — pure: the two ranked tuple lists and the cards read for them → the suggested cards
const mergeCandidateLists = ({ rankedTupleIdListByMethod, cardByTupleId, suggestRules }) => {
	const { methodOrderList, cardCap } = suggestRules;
	const interleavedList = [];
	const longestLength = Math.max(...methodOrderList.map((methodName) => rankedTupleIdListByMethod[methodName].length));
	for (let rankPosition = 0; rankPosition < longestLength; rankPosition++) {
		methodOrderList.forEach((methodName) => {
			const cedsTupleId = rankedTupleIdListByMethod[methodName][rankPosition];
			if (cedsTupleId !== undefined) {
				interleavedList.push({ methodName, cedsTupleId });
			}
		});
	}
	const keptCardList = [];
	const keptCardBySignature = {};
	const keptCardByTupleId = {};
	let duplicateTupleCount = 0;
	let collapsedTupleCount = 0;
	let overCapCount = 0;
	interleavedList.forEach(({ methodName, cedsTupleId }) => {
		const card = cardByTupleId[cedsTupleId];
		if (!card) {
			return;
		}
		const sameTupleCard = keptCardByTupleId[cedsTupleId];
		if (sameTupleCard) {
			duplicateTupleCount += 1;
			sameTupleCard.foundByMethodSet[methodName] = true;
			return;
		}
		const signature = cedsCards.cardSignatureOf(card);
		const identicalCard = keptCardBySignature[signature];
		if (identicalCard) {
			collapsedTupleCount += 1;
			identicalCard.cedsTupleIdList.push(cedsTupleId);
			identicalCard.foundByMethodSet[methodName] = true;
			keptCardByTupleId[cedsTupleId] = identicalCard;
			return;
		}
		if (keptCardList.length >= cardCap) {
			overCapCount += 1;
			return;
		}
		const keptCard = { ...card, cedsTupleIdList: [cedsTupleId], foundByMethodSet: { [methodName]: true } };
		keptCardList.push(keptCard);
		keptCardBySignature[signature] = keptCard;
		keptCardByTupleId[cedsTupleId] = keptCard;
	});
	const cardList = keptCardList
		.map(({ foundByMethodSet, ...cardFields }) => ({ ...cardFields, cedsTupleIdList: cardFields.cedsTupleIdList.slice().sort(), foundByMethod: methodOrderList.filter((methodName) => foundByMethodSet[methodName]) }))
		.sort((cardA, cardB) => byText(cardA.cedsTupleId, cardB.cedsTupleId));
	return { cardList, mergeCountList: { duplicateTupleCount, collapsedTupleCount, overCapCount } };
};

const buildSuggested = ({ raterToolConfig, outputDirPath, readConfigJson }, callback) => {
	const suggestRules = readConfigJson('suggestRules.json');
	const sampleFilePath = path.join(outputDirPath, 'sample.json');
	if (!fs.existsSync(sampleFilePath)) {
		callback(`no sample.json in ${outputDirPath}: run -buildSample first`);
		return;
	}
	const sampleDocument = JSON.parse(fs.readFileSync(sampleFilePath, 'utf8'));
	const elementList = sampleDocument.elementList.slice().sort((elementA, elementB) => byText(elementA.elementStableId, elementB.elementStableId));
	const embedderAnswer = createRaterEmbedder({ voyageApiKey: raterToolConfig.voyageApiKey });
	if (embedderAnswer.refusal) {
		callback(`${embedderAnswer.refusal.refusalName}: ${embedderAnswer.refusal.refusalText}`);
		return;
	}
	const embedder = embedderAnswer.embedder;
	const modelText = JSON.stringify(embedder.metadata());
	const embeddingCacheFilePath = path.join(outputDirPath, 'queryEmbeddings.json');
	const embeddingCache = fs.existsSync(embeddingCacheFilePath) ? JSON.parse(fs.readFileSync(embeddingCacheFilePath, 'utf8')) : { embeddingBySignature: {} };
	const taskList = new taskListPlus();

	taskList.push((args, next) => {
		openRaterGraph({ goldenContainerName: raterToolConfig.goldenContainerName, queryTimeoutMs: parseInt(raterToolConfig.queryTimeoutMs, 10) }, (openError, openResult) => {
			if (openError) {
				next(openError, args);
				return;
			}
			if (openResult.refusal) {
				next(`${openResult.refusal.refusalName}: ${openResult.refusal.refusalText}`, args);
				return;
			}
			if (openResult.raterGraph.goldenContainerName !== sampleDocument.goldenContainerName) {
				openResult.raterGraph.close();
				next(`sample.json was drawn from '${sampleDocument.goldenContainerName}' but raterTool.ini names '${openResult.raterGraph.goldenContainerName}'; the frozen inputs must come from one gold`, args);
				return;
			}
			next('', { ...args, raterGraph: openResult.raterGraph });
		});
	});

	taskList.push((args, next) => {
		cedsCards.resolveSearchIndexNames({ raterGraph: args.raterGraph }, (indexError, indexAnswer) => {
			if (indexError || indexAnswer.refusal) {
				next(indexError || indexAnswer.refusal.refusalText, args);
				return;
			}
			next('', { ...args, ...indexAnswer });
		});
	});

	// the query embeddings: from the cache when the model and text match, the rest asked of the embedder in one batch call
	taskList.push((args, next) => {
		const queryTextList = elementList.map(queryTextOf);
		const missingQueryTextList = queryTextList.filter((queryText) => !embeddingCache.embeddingBySignature[embeddingCacheSignatureOf(modelText, queryText)]);
		const keepEmbeddingList = (embeddingList) => {
			missingQueryTextList.forEach((queryText, position) => {
				embeddingCache.embeddingBySignature[embeddingCacheSignatureOf(modelText, queryText)] = embeddingList[position];
			});
			const usedSignatureList = queryTextList.map((queryText) => embeddingCacheSignatureOf(modelText, queryText)).sort();
			const keptCache = { model: embedder.metadata(), embeddingBySignature: usedSignatureList.reduce((soFar, signature) => ({ ...soFar, [signature]: embeddingCache.embeddingBySignature[signature] }), {}) };
			fs.writeFileSync(embeddingCacheFilePath, `${JSON.stringify(keptCache)}\n`);
			next('', { ...args, queryTextList, embeddedCount: missingQueryTextList.length });
		};
		if (missingQueryTextList.length === 0) {
			keepEmbeddingList([]);
			return;
		}
		embedder.embed(missingQueryTextList, (embedError, embeddingList) => {
			if (embedError || !Array.isArray(embeddingList) || embeddingList.length !== missingQueryTextList.length) {
				next(`embedding the query texts failed: ${embedError || 'wrong number of embeddings returned'}`, args);
				return;
			}
			keepEmbeddingList(embeddingList);
		});
	});

	elementList.forEach((element, elementPosition) => {
		taskList.push((args, next) => {
			const queryText = args.queryTextList[elementPosition];
			const embedding = embeddingCache.embeddingBySignature[embeddingCacheSignatureOf(modelText, queryText)];
			const legTaskList = new taskListPlus();
			legTaskList.push((legArgs, legNext) =>
				cedsCards.searchByMeaning({ raterGraph: args.raterGraph, vectorIndexName: args.vectorIndexName, embedding, windowSize: suggestRules.perMethodCount }, (meaningError, tupleIdList) =>
					meaningError ? legNext(meaningError, legArgs) : legNext('', { ...legArgs, rankedTupleIdListByMethod: { ...legArgs.rankedTupleIdListByMethod, meaning: tupleIdList } })));
			legTaskList.push((legArgs, legNext) =>
				cedsCards.searchByWords({ raterGraph: args.raterGraph, fulltextIndexName: args.fulltextIndexName, queryText, wordJoinName: suggestRules.wordJoinName, windowSize: suggestRules.perMethodCount }, (wordsError, tupleIdList) =>
					wordsError ? legNext(wordsError, legArgs) : legNext('', { ...legArgs, rankedTupleIdListByMethod: { ...legArgs.rankedTupleIdListByMethod, words: tupleIdList } })));
			legTaskList.push((legArgs, legNext) => {
				const unionTupleIdList = Array.from(new Set([...legArgs.rankedTupleIdListByMethod.meaning, ...legArgs.rankedTupleIdListByMethod.words])).sort();
				cedsCards.readCardsByTupleIdList({ raterGraph: args.raterGraph, cedsTupleIdList: unionTupleIdList }, (readError, cardList) =>
					readError ? legNext(readError, legArgs) : legNext('', { ...legArgs, cardByTupleId: cardList.reduce((soFar, card) => ({ ...soFar, [card.cedsTupleId]: card }), {}) }));
			});
			pipeRunner(legTaskList.getList(), { rankedTupleIdListByMethod: {} }, (legError, legArgs) => {
				if (legError) {
					next(`${element.elementStableId}: ${legError}`, args);
					return;
				}
				const { cardList, mergeCountList } = mergeCandidateLists({ rankedTupleIdListByMethod: legArgs.rankedTupleIdListByMethod, cardByTupleId: legArgs.cardByTupleId, suggestRules });
				const suggestedEntry = { elementStableId: element.elementStableId, queryText, cardCount: cardList.length, cardList };
				const legReport = { elementStableId: element.elementStableId, standard: element.standard, rankedCountByMethod: { meaning: legArgs.rankedTupleIdListByMethod.meaning.length, words: legArgs.rankedTupleIdListByMethod.words.length }, ...mergeCountList };
				next('', { ...args, suggestedEntryList: args.suggestedEntryList.concat([suggestedEntry]), legReportList: args.legReportList.concat([legReport]) });
			});
		});
	});

	taskList.push((args, next) => {
		args.raterGraph.close();
		const suggestedDocument = {
			suggestedFormatVersion: 1,
			goldenContainerName: sampleDocument.goldenContainerName,
			sampleSeedText: sampleDocument.sampleSeedText,
			suggestRules,
			elementCount: args.suggestedEntryList.length,
			suggestedByElementStableId: args.suggestedEntryList.reduce((soFar, entry) => ({ ...soFar, [entry.elementStableId]: entry }), {}),
		};
		const suggestedFilePath = path.join(outputDirPath, 'suggested.json');
		fs.writeFileSync(suggestedFilePath, `${JSON.stringify(suggestedDocument, null, '\t')}\n`);
		const reportFilePath = path.join(outputDirPath, 'suggested-report.md');
		writeSuggestedReport({ reportFilePath, suggestedDocument, legReportList: args.legReportList, sampleDocument });
		next('', { ...args, resultText: `wrote ${suggestedFilePath} (${args.suggestedEntryList.length} elements; ${args.embeddedCount} query texts embedded now, the rest from queryEmbeddings.json) and ${reportFilePath}` });
	});

	pipeRunner(taskList.getList(), { suggestedEntryList: [], legReportList: [] }, (err, args) => {
		if (err) {
			if (args && args.raterGraph) {
				args.raterGraph.close();
			}
			callback(err);
			return;
		}
		callback('', args.resultText);
	});
};

module.exports = buildSuggested;
module.exports.mergeCandidateLists = mergeCandidateLists;
module.exports.queryTextOf = queryTextOf;
