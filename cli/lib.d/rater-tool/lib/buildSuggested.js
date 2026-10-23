'use strict';

// buildSuggested.js — the -buildSuggested action: for every element of sample.json, its candidate CEDS cards.
//   1. the query text (suggestRules.json: name split into words + definition + owner name split into words)
//   2. top perMethodCount tuples by meaning (vector) and by words (BM25), from the gold's own indexes (ceds-cards.js)
//   3. interleave meaning 1, words 1, meaning 2, ...: a tuple already taken, or a card identical to a taken card (same
//      class + property + qualifiers), joins that card (memberTupleIdList, foundByMethod) instead of taking a slot; new
//      cards stop at cardCap
//   4. cards stored UNORDERED (sorted by tuple id), each carrying foundByMethod for later analysis; the UI never reads it
//   5. revision 3, TQ-approved exception to "no machine results": a mapped element (isMappedInGold) also gets every
//      property-tier tuple the gold maps it to (goldTupleReader.js, the isMappedInGold member rule) as an ordinary card;
//      on overflow the lowest-ranked non-gold cards leave, never a gold card. suggested.json records goldTupleIdList and
//      goldInjectedTupleIdList per mapped element; neither, nor anything marking a card as gold, reaches a rater.
// Writes suggested.json and suggested-report.md. The query embeddings are kept in queryEmbeddings.json beside them and
// reused when present for the same model and query text, so a rebuild never depends on the embedding service answering
// identically twice (the frozen inputs are frozen).
//
//   buildSuggested({ raterToolConfig, goldenContainerName, outputDirPath, readConfigJson }, callback(errText, resultText))

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
const { openRaterGraph } = require('../../../../server/data-model/lib/rater-tool/rater-graph');
const cedsCards = require('../../../../server/data-model/lib/rater-tool/ceds-cards');
const { createRaterEmbedder } = require('../../../../server/data-model/lib/rater-tool/rater-embedder');
const { writeSuggestedReport } = require('./suggestedReport');
const { readGoldTupleList } = require('./goldTupleReader');

// a card is a property-tier tuple (ceds-cards.js); a gold tuple of any other tier could not be a card and is reported
const CARD_REFERENCE_TIER = 'property';

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

// mergeCandidateLists — pure: the two ranked tuple lists, the cards read for them and the element's gold tuples (revision
// 3; [] when the element has none) → the suggested cards.
//   1. every search card in interleave order, uncapped; its first cardCap cards are exactly the list the searches alone
//      build (revisions 1 and 2), so an element with no gold tuple gets that list unchanged
//   2. each gold tuple not already on a search card becomes a card built like any other (an identical card absorbs it)
//   3. the list = every gold card + the highest-ranked non-gold cards, up to cardCap; a gold card is never dropped, so a
//      list whose gold cards alone pass cardCap keeps them all (goldCardOverCapCount reports it)
// Throws when goldTupleIdList is not a list or names a tuple with no card: the caller reads every gold tuple's card first.
const mergeCandidateLists = ({ rankedTupleIdListByMethod, cardByTupleId, suggestRules, goldTupleIdList }) => {
	const { methodOrderList, cardCap } = suggestRules;
	if (!Array.isArray(goldTupleIdList)) {
		throw new Error(`mergeCandidateLists: goldTupleIdList must be a list ([] for an element with no gold tuple); got ${JSON.stringify(goldTupleIdList)}`);
	}
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
	const searchCardList = [];
	const keptCardBySignature = {};
	const keptCardByTupleId = {};
	let duplicateTupleCount = 0;
	let collapsedTupleCount = 0;
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
		const keptCard = { ...card, cedsTupleIdList: [cedsTupleId], foundByMethodSet: { [methodName]: true } };
		searchCardList.push(keptCard);
		keptCardBySignature[signature] = keptCard;
		keptCardByTupleId[cedsTupleId] = keptCard;
	});
	const searchListCardList = searchCardList.slice(0, cardCap);
	const searchListTupleIdSet = new Set(searchListCardList.reduce((soFar, card) => soFar.concat(card.cedsTupleIdList), []));

	const sortedGoldTupleIdList = Array.from(new Set(goldTupleIdList)).sort();
	const goldCardSet = new Set();
	sortedGoldTupleIdList.forEach((cedsTupleId) => {
		const searchCard = keptCardByTupleId[cedsTupleId];
		if (searchCard) {
			goldCardSet.add(searchCard);
			return;
		}
		const card = cardByTupleId[cedsTupleId];
		if (!card) {
			throw new Error(`mergeCandidateLists: gold tuple '${cedsTupleId}' has no card in cardByTupleId`);
		}
		const signature = cedsCards.cardSignatureOf(card);
		const identicalCard = keptCardBySignature[signature];
		if (identicalCard) {
			collapsedTupleCount += 1;
			identicalCard.cedsTupleIdList.push(cedsTupleId);
			keptCardByTupleId[cedsTupleId] = identicalCard;
			goldCardSet.add(identicalCard);
			return;
		}
		const injectedCard = { ...card, cedsTupleIdList: [cedsTupleId], foundByMethodSet: {} };
		keptCardBySignature[signature] = injectedCard;
		keptCardByTupleId[cedsTupleId] = injectedCard;
		goldCardSet.add(injectedCard);
	});
	const nonGoldCardList = searchCardList.filter((card) => !goldCardSet.has(card));
	const keptNonGoldCardList = nonGoldCardList.slice(0, Math.max(0, cardCap - goldCardSet.size));
	const keptCardSet = new Set([...goldCardSet, ...keptNonGoldCardList]);
	const goldInjectedTupleIdList = sortedGoldTupleIdList.filter((cedsTupleId) => !searchListTupleIdSet.has(cedsTupleId));

	const cardList = Array.from(keptCardSet)
		.map(({ foundByMethodSet, ...cardFields }) => ({ ...cardFields, cedsTupleIdList: cardFields.cedsTupleIdList.slice().sort(), foundByMethod: methodOrderList.filter((methodName) => foundByMethodSet[methodName]) }))
		.sort((cardA, cardB) => byText(cardA.cedsTupleId, cardB.cedsTupleId));
	const mergeCountList = {
		duplicateTupleCount,
		collapsedTupleCount,
		overCapCount: searchCardList.length - searchListCardList.length,
		goldTupleCount: sortedGoldTupleIdList.length,
		goldInjectedTupleCount: goldInjectedTupleIdList.length,
		goldInjectedCardCount: Array.from(goldCardSet).filter((card) => searchListCardList.indexOf(card) === -1).length,
		displacedCardCount: searchListCardList.filter((card) => !keptCardSet.has(card)).length,
		goldCardOverCapCount: Math.max(0, goldCardSet.size - cardCap),
	};
	return { cardList, goldTupleIdList: sortedGoldTupleIdList, goldInjectedTupleIdList, mergeCountList };
};

const buildSuggested = ({ raterToolConfig, goldenContainerName, outputDirPath, readConfigJson }, callback) => {
	const { xLog } = process.global;
	const suggestRules = readConfigJson('suggestRules.json');
	const sampleFilePath = path.join(outputDirPath, 'sample.json');
	if (!fs.existsSync(sampleFilePath)) {
		callback(`no sample.json in ${outputDirPath}: run -buildSample first`);
		return;
	}
	const sampleDocument = JSON.parse(fs.readFileSync(sampleFilePath, 'utf8'));
	// revision 3 reads isMappedInGold to decide whether to ask the gold; an element without a true/false flag is refused,
	// never taken for unmapped
	const flaglessStableIdList = sampleDocument.elementList.filter((element) => typeof element.isMappedInGold !== 'boolean').map((element) => element.elementStableId);
	if (flaglessStableIdList.length > 0) {
		callback(`sampleFlagAbsent: ${flaglessStableIdList.length} sample element(s) carry no true/false isMappedInGold (a revision 2 sample.json has it on every element), eg ${flaglessStableIdList[0]}`);
		return;
	}
	const memberRuleNameByStandard = suggestRules.goldInjection ? suggestRules.goldInjection.memberRuleNameByStandard : undefined;
	const unruledStandardList = Array.from(new Set(sampleDocument.elementList.filter((element) => element.isMappedInGold === true && !(memberRuleNameByStandard || {})[element.standard]).map((element) => element.standard)));
	if (!memberRuleNameByStandard || unruledStandardList.length > 0) {
		callback(`suggestRules.json goldInjection.memberRuleNameByStandard names no member rule for: ${unruledStandardList.join(', ') || '(goldInjection is absent)'}`);
		return;
	}
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
		openRaterGraph({ goldenContainerName, queryTimeoutMs: parseInt(raterToolConfig.queryTimeoutMs, 10) }, (openError, openResult) => {
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
				next(`sample.json was drawn from '${sampleDocument.goldenContainerName}' but the DME's gold is '${openResult.raterGraph.goldenContainerName}'; one build's frozen inputs must come from one gold (rebuild the sample on this gold first)`, args);
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
			// revision 3: the gold's own tuples for a mapped element (an unmapped element has none and is not asked)
			legTaskList.push((legArgs, legNext) => {
				if (element.isMappedInGold !== true) {
					legNext('', { ...legArgs, goldTupleIdList: [], goldNonCardTupleIdList: [] });
					return;
				}
				readGoldTupleList({ raterGraph: args.raterGraph, memberRuleName: memberRuleNameByStandard[element.standard], mappingEdgeTypeList: suggestRules.goldInjection.mappingEdgeTypeList, memberStableIdList: element.memberStableIdList }, (goldError, goldTupleList) => {
					if (goldError) {
						legNext(goldError, legArgs);
						return;
					}
					const goldTupleIdList = goldTupleList.filter((goldTuple) => goldTuple.referenceTier === CARD_REFERENCE_TIER).map((goldTuple) => goldTuple.cedsTupleId);
					const goldNonCardTupleIdList = goldTupleList.filter((goldTuple) => goldTuple.referenceTier !== CARD_REFERENCE_TIER).map((goldTuple) => goldTuple.cedsTupleId);
					if (goldTupleIdList.length === 0) {
						legNext(`goldTuplesAbsent: isMappedInGold is true but the gold maps no member to a property-tier tuple (${goldNonCardTupleIdList.length} of other tiers)`, legArgs);
						return;
					}
					legNext('', { ...legArgs, goldTupleIdList, goldNonCardTupleIdList });
				});
			});
			legTaskList.push((legArgs, legNext) =>
				cedsCards.searchByMeaning({ raterGraph: args.raterGraph, vectorIndexName: args.vectorIndexName, embedding, windowSize: suggestRules.perMethodCount }, (meaningError, tupleIdList) =>
					meaningError ? legNext(meaningError, legArgs) : legNext('', { ...legArgs, rankedTupleIdListByMethod: { ...legArgs.rankedTupleIdListByMethod, meaning: tupleIdList } })));
			legTaskList.push((legArgs, legNext) =>
				cedsCards.searchByWords({ raterGraph: args.raterGraph, fulltextIndexName: args.fulltextIndexName, queryText, wordJoinName: suggestRules.wordJoinName, windowSize: suggestRules.perMethodCount }, (wordsError, tupleIdList) =>
					wordsError ? legNext(wordsError, legArgs) : legNext('', { ...legArgs, rankedTupleIdListByMethod: { ...legArgs.rankedTupleIdListByMethod, words: tupleIdList } })));
			legTaskList.push((legArgs, legNext) => {
				const unionTupleIdList = Array.from(new Set([...legArgs.rankedTupleIdListByMethod.meaning, ...legArgs.rankedTupleIdListByMethod.words, ...legArgs.goldTupleIdList])).sort();
				cedsCards.readCardsByTupleIdList({ raterGraph: args.raterGraph, cedsTupleIdList: unionTupleIdList }, (readError, cardList) => {
					if (readError) {
						legNext(readError, legArgs);
						return;
					}
					const cardByTupleId = cardList.reduce((soFar, card) => ({ ...soFar, [card.cedsTupleId]: card }), {});
					const unreadGoldTupleIdList = legArgs.goldTupleIdList.filter((cedsTupleId) => !cardByTupleId[cedsTupleId]);
					if (unreadGoldTupleIdList.length > 0) {
						legNext(`goldTupleUnreadable: no card could be read for gold tuple(s) ${unreadGoldTupleIdList.join(', ')}`, legArgs);
						return;
					}
					legNext('', { ...legArgs, cardByTupleId });
				});
			});
			pipeRunner(legTaskList.getList(), { rankedTupleIdListByMethod: {} }, (legError, legArgs) => {
				if (legError) {
					next(`${element.elementStableId}: ${legError}`, args);
					return;
				}
				const { cardList, goldTupleIdList, goldInjectedTupleIdList, mergeCountList } = mergeCandidateLists({ rankedTupleIdListByMethod: legArgs.rankedTupleIdListByMethod, cardByTupleId: legArgs.cardByTupleId, suggestRules, goldTupleIdList: legArgs.goldTupleIdList });
				if (mergeCountList.goldCardOverCapCount > 0) {
					xLog.status(`${element.elementStableId}: its gold cards alone pass the cap of ${suggestRules.cardCap} by ${mergeCountList.goldCardOverCapCount}; all are kept`);
				}
				// an unmapped element's entry is exactly what revision 2 wrote; only a mapped element carries the two gold fields
				const suggestedEntry = element.isMappedInGold === true
					? { elementStableId: element.elementStableId, queryText, cardCount: cardList.length, cardList, goldTupleIdList, goldInjectedTupleIdList }
					: { elementStableId: element.elementStableId, queryText, cardCount: cardList.length, cardList };
				const legReport = { elementStableId: element.elementStableId, standard: element.standard, isMappedInGold: element.isMappedInGold === true, rankedCountByMethod: { meaning: legArgs.rankedTupleIdListByMethod.meaning.length, words: legArgs.rankedTupleIdListByMethod.words.length }, goldNonCardTupleIdList: legArgs.goldNonCardTupleIdList, ...mergeCountList };
				next('', { ...args, suggestedEntryList: args.suggestedEntryList.concat([suggestedEntry]), legReportList: args.legReportList.concat([legReport]) });
			});
		});
	});

	taskList.push((args, next) => {
		args.raterGraph.close();
		const suggestedDocument = {
			suggestedFormatVersion: 2,
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
