'use strict';

// rater-tool-service.js — what a RATER can do (lane RATER, 2026-10-14; SPEC §3–§5). The rater access points are thin
// wrappers over these operations; the admin operations are in rater-tool-admin.js.
//
//   makeRaterToolService({ raterToolAccess, dataMapping }) -> {
//     getItem({ raterUserName, itemNumber }, cb)            the rater's item N (1-based, in the rater's own order)
//     saveAnswer({ raterUserName, answerSubmission }, cb)   validate (rater-answer-rules), save current row + history
//     search({ raterUserName, elementStableId, searchMode, queryText }, cb)   words | meaning | cedsId → cards; logged
//     browse({ raterUserName, browseMode, conceptName, classCedsId }, cb)    concepts | classesOfConcept | propertiesOfClass
//     getProgress({ raterUserName }, cb)
//     finish({ raterUserName }, cb)                         locks the rater's answers (all items must be saved)
//   }
// Every refusal is { refusal: { refusalName, refusalText } } through callback('', ...); an errText means the tool failed.
//
// NEVER SHOWN TO A RATER (SPEC §4.1): foundByMethod, scores, ranks, the dev/sealed split, the element's kind, other
// raters' anything. Payloads are built from the field whitelists below, never by passing stored records through.
// SHUFFLES: item order = seededShuffle(survey elements, rater.raterSeedText, 'itemOrder'); card order =
// seededShuffle(suggested cards, rater.raterSeedText, 'cards:' + elementStableId). Stable across reloads, different
// per rater because each rater's seed is minted at random when the account is made.

const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
const { seededShuffle } = require('./seeded-draw');
const { validateAnswer } = require('./rater-answer-rules');
const { makeRaterStore } = require('./rater-store');
const cedsCards = require('./ceds-cards');

const RATER_CARD_FIELD_LIST = Object.freeze(['cedsTupleId', 'className', 'classCedsId', 'classDefinition', 'propertyName', 'qualifierNameList', 'cedsId', 'definition', 'optionSetName', 'optionValueList', 'cedsUrl']);
const RATER_ELEMENT_FIELD_LIST = Object.freeze(['elementStableId', 'standard', 'subStandardName', 'name', 'definition', 'definitionAbsentReason', 'dataTypeText', 'optionSetName', 'optionValueSampleList', 'ownerName', 'ownerDefinition', 'ownerDefinitionAbsentReason', 'path', 'documentationUrl', 'memberCount']);
const ADDED_CARD_FOUND_BY_LIST = Object.freeze(['search', 'browseFromCard', 'browseFromConcept']);
const SEARCH_MODE_LIST = Object.freeze(['words', 'meaning', 'cedsId']);
const BROWSE_MODE_LIST = Object.freeze(['concepts', 'classesOfConcept', 'propertiesOfClass']);
const SEARCH_RESULT_CARD_COUNT = 20;
const SEARCHES_TYPED_CAP = 50;
const QUERY_TEXT_LENGTH_CAP = 500;
const CEDS_ID_PATTERN = /^P\d{6}$/;

const RATER_REFUSAL_NAME_LIST = Object.freeze(['notARater', 'itemNumberInvalid', 'elementNotInSurvey', 'answersLocked', 'addedCardInvalid', 'searchModeInvalid', 'queryTextEmpty', 'cedsIdInvalid', 'browseModeInvalid', 'unknownConcept', 'unknownClass', 'notAllItemsSaved', 'noEmbedder', 'searchIndexAbsent']);
const refusalOf = (refusalName, refusalText) => {
	if (RATER_REFUSAL_NAME_LIST.indexOf(refusalName) === -1) {
		throw new Error(`rater-tool-service: '${refusalName}' is not one of ${RATER_REFUSAL_NAME_LIST.join(', ')}`);
	}
	return { refusal: { refusalName, refusalText } };
};

const pickFields = (sourceObject, fieldNameList) => fieldNameList.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: sourceObject[fieldName] === undefined ? null : sourceObject[fieldName] }), {});
const raterCardOf = (card) => pickFields(card, RATER_CARD_FIELD_LIST);
const nowText = () => new Date().toISOString();

const makeRaterToolService = ({ raterToolAccess, dataMapping }) => {
	const raterMapper = dataMapping['rater-tool'];
	const raterStore = makeRaterStore({ raterToolAccess, raterMapper });

	// --------------------------------------------------------------------------------
	// shared steps

	const loadRater = (raterUserName, callback) => {
		raterStore.readRater(raterUserName, (readError, rater) => {
			if (readError) {
				callback(readError);
				return;
			}
			if (!rater) {
				callback('', refusalOf('notARater', `'${raterUserName}' has no rater record (no survey assigned). Ask the admin.`));
				return;
			}
			callback('', { rater });
		});
	};

	const touchRater = (rater, callback) => raterStore.saveRowVerified('raters', { refId: rater.raterRefId, lastActiveAt: nowText() }, (touchError) => callback(touchError));

	const orderedElementListOf = (rater) => seededShuffle(raterToolAccess.elementListBySurvey[rater.surveyName] || [], rater.raterSeedText, 'itemOrder');

	const suggestedCardListOf = (rater, elementStableId) => {
		const suggestedEntry = raterToolAccess.suggestedDocument.suggestedByElementStableId[elementStableId];
		const cardList = suggestedEntry ? suggestedEntry.cardList : [];
		return seededShuffle(cardList.slice().sort((cardA, cardB) => (cardA.cedsTupleId < cardB.cedsTupleId ? -1 : 1)), rater.raterSeedText, `cards:${elementStableId}`);
	};

	const readCurrentAnswerList = (rater, callback) => raterStore.readRows('answers', 'answersOfRater', { raterUserName: rater.raterUserName }, (readError, rowList) => (readError ? callback(readError) : callback('', rowList.map(raterMapper.answerOf))));

	const progressOf = (rater, currentAnswerList) => {
		const orderedElementList = orderedElementListOf(rater);
		const savedStableIdSet = new Set(currentAnswerList.map((answerRecord) => answerRecord.elementStableId));
		const nextUnratedPosition = orderedElementList.findIndex((element) => !savedStableIdSet.has(element.elementStableId));
		return {
			surveyName: rater.surveyName,
			itemCount: orderedElementList.length,
			savedCount: orderedElementList.filter((element) => savedStableIdSet.has(element.elementStableId)).length,
			nextUnratedItemNumber: nextUnratedPosition === -1 ? null : nextUnratedPosition + 1,
			finishedAt: rater.finishedAt,
			savedItemNumberList: orderedElementList.map((element, position) => (savedStableIdSet.has(element.elementStableId) ? position + 1 : null)).filter(Boolean),
		};
	};

	const withRater = (raterUserName, workFunction, callback) => {
		loadRater(raterUserName, (loadError, loadAnswer) => {
			if (loadError || loadAnswer.refusal) {
				callback(loadError, loadAnswer);
				return;
			}
			workFunction(loadAnswer.rater, callback);
		});
	};

	const withGraph = (workFunction, callback) => {
		raterToolAccess.getRaterGraph((graphError, graphAnswer) => {
			if (graphError || graphAnswer.refusal) {
				callback(graphError, graphAnswer);
				return;
			}
			workFunction(graphAnswer.raterGraph, callback);
		});
	};

	// --------------------------------------------------------------------------------
	// getItem

	const getItem = ({ raterUserName, itemNumber }, callback) =>
		withRater(raterUserName, (rater, done) => {
			const orderedElementList = orderedElementListOf(rater);
			const itemPosition = Number(itemNumber) - 1;
			if (!Number.isInteger(itemPosition) || itemPosition < 0 || itemPosition >= orderedElementList.length) {
				done('', refusalOf('itemNumberInvalid', `Item ${JSON.stringify(itemNumber)} does not exist; survey ${rater.surveyName} has items 1 to ${orderedElementList.length}.`));
				return;
			}
			const element = orderedElementList[itemPosition];
			readCurrentAnswerList(rater, (readError, currentAnswerList) => {
				if (readError) {
					done(readError);
					return;
				}
				const savedRecord = currentAnswerList.find((answerRecord) => answerRecord.elementStableId === element.elementStableId);
				touchRater(rater, (touchError) => {
					if (touchError) {
						done(touchError);
						return;
					}
					done('', {
						itemNumber: itemPosition + 1,
						itemCount: orderedElementList.length,
						surveyName: rater.surveyName,
						element: pickFields(element, RATER_ELEMENT_FIELD_LIST),
						cardList: suggestedCardListOf(rater, element.elementStableId).map(raterCardOf),
						savedAnswer: savedRecord ? raterAnswerViewOf(savedRecord) : null,
						progress: progressOf(rater, currentAnswerList),
					});
				});
			});
		}, callback);

	// what a rater gets back of their own saved answer (added cards in the order they were added, newest first)
	const raterAnswerViewOf = (answerRecord) => ({
		savedAt: answerRecord.savedAt,
		answerKind: answerRecord.answer.answerKind,
		bestCedsTupleId: answerRecord.answer.bestCedsTupleId,
		sameCedsTupleIdList: answerRecord.answer.sameCedsTupleIdList,
		note: answerRecord.answer.note,
		addedCardList: answerRecord.answer.addedCardList.map((addedCard) => ({ ...raterCardOf(addedCard), foundBy: addedCard.foundBy })),
	});

	// --------------------------------------------------------------------------------
	// saveAnswer

	const saveAnswer = ({ raterUserName, answerSubmission }, callback) =>
		withRater(raterUserName, (rater, done) => {
			if (rater.finishedAt) {
				done('', refusalOf('answersLocked', `You pressed Finish and send on ${rater.finishedAt}; your answers are locked.`));
				return;
			}
			const submission = answerSubmission || {};
			const element = raterToolAccess.elementByStableId[submission.elementStableId];
			if (!element || element.surveyName !== rater.surveyName) {
				done('', refusalOf('elementNotInSurvey', `That element is not in your survey (${rater.surveyName}).`));
				return;
			}
			const addedSubmissionList = submission.addedCardList === undefined || submission.addedCardList === null ? [] : submission.addedCardList;
			const badAddedList = !Array.isArray(addedSubmissionList) ? ['not a list'] : addedSubmissionList.filter((addedCard) => !addedCard || typeof addedCard.cedsTupleId !== 'string' || ADDED_CARD_FOUND_BY_LIST.indexOf(addedCard.foundBy) === -1);
			if (badAddedList.length > 0) {
				done('', refusalOf('addedCardInvalid', `An added card needs its cedsTupleId and foundBy (one of ${ADDED_CARD_FOUND_BY_LIST.join(', ')}).`));
				return;
			}
			const suggestedTupleIdList = suggestedCardListOf(rater, element.elementStableId).map((card) => card.cedsTupleId);
			const addedTupleIdList = addedSubmissionList.map((addedCard) => addedCard.cedsTupleId);
			const verdict = validateAnswer({ answerSubmission: submission, allowedCedsTupleIdList: suggestedTupleIdList.concat(addedTupleIdList) });
			if (verdict.refusal) {
				done('', verdict);
				return;
			}
			const taskList = new taskListPlus();
			// added cards are re-read from the gold, so what is stored is the gold's card, not the browser's copy
			taskList.push((args, next) => {
				if (addedSubmissionList.length === 0) {
					next('', { ...args, addedCardList: [] });
					return;
				}
				withGraph((raterGraph, graphDone) => cedsCards.readCardsByTupleIdList({ raterGraph, cedsTupleIdList: addedTupleIdList }, graphDone), (readError, readAnswer) => {
					if (readError || (readAnswer && readAnswer.refusal)) {
						next(readError || 'skipRestOfPipe', { ...args, refusalAnswer: readAnswer });
						return;
					}
					const cardByTupleId = readAnswer.reduce((soFar, card) => ({ ...soFar, [card.cedsTupleId]: card }), {});
					const unknownList = addedTupleIdList.filter((cedsTupleId) => !cardByTupleId[cedsTupleId]);
					if (unknownList.length > 0) {
						next('skipRestOfPipe', { ...args, refusalAnswer: refusalOf('addedCardInvalid', `${unknownList.length} added card(s) are not CEDS cards in this gold.`) });
						return;
					}
					next('', { ...args, addedCardList: addedSubmissionList.map((addedCard) => ({ ...raterCardOf(cardByTupleId[addedCard.cedsTupleId]), foundBy: addedCard.foundBy })) });
				});
			});
			taskList.push((args, next) =>
				raterStore.readRows('answers', 'answerOfRaterElement', { raterUserName: rater.raterUserName, elementStableId: element.elementStableId }, (readError, rowList) =>
					readError ? next(readError, args) : next('', { ...args, currentRow: rowList[rowList.length - 1] || null })));
			taskList.push((args, next) =>
				raterStore.readRows('answerHistory', 'historyOfRaterElement', { raterUserName: rater.raterUserName, elementStableId: element.elementStableId }, (readError, rowList) =>
					readError ? next(readError, args) : next('', { ...args, historyCount: rowList.length })));
			taskList.push((args, next) => {
				const savedAt = nowText();
				const searchesTyped = Array.isArray(submission.searchesTyped) ? submission.searchesTyped.filter((searchText) => typeof searchText === 'string').slice(0, SEARCHES_TYPED_CAP).map((searchText) => searchText.slice(0, QUERY_TEXT_LENGTH_CAP)) : [];
				const secondsOnItem = Number.isFinite(Number(submission.secondsOnItem)) && Number(submission.secondsOnItem) >= 0 ? Math.round(Number(submission.secondsOnItem)) : null;
				const answer = { ...verdict.validAnswer, addedCardList: args.addedCardList, searchesTyped, secondsOnItem };
				const answerJson = raterMapper.encodeJsonColumn(answer);
				const currentRow = { raterUserName: rater.raterUserName, elementStableId: element.elementStableId, answerJson, savedAt, ...(args.currentRow ? { refId: args.currentRow.refId } : {}) };
				raterStore.saveRowVerified('answers', currentRow, (currentError) => {
					if (currentError) {
						next(currentError, args);
						return;
					}
					raterStore.saveRowVerified('answerHistory', { raterUserName: rater.raterUserName, elementStableId: element.elementStableId, answerJson, savedAt, historySequence: `${args.historyCount + 1}` }, (historyError) =>
						historyError ? next(historyError, args) : next('', { ...args, savedAt }));
				});
			});
			taskList.push((args, next) => touchRater(rater, (touchError) => next(touchError, args)));
			taskList.push((args, next) => readCurrentAnswerList(rater, (readError, currentAnswerList) => (readError ? next(readError, args) : next('', { ...args, progress: progressOf(rater, currentAnswerList) }))));
			pipeRunner(taskList.getList(), {}, (err, args) => {
				if (err === 'skipRestOfPipe') {
					done('', args.refusalAnswer);
					return;
				}
				if (err) {
					done(err);
					return;
				}
				done('', { saved: true, savedAt: args.savedAt, elementStableId: element.elementStableId, progress: args.progress });
			});
		}, callback);

	// --------------------------------------------------------------------------------
	// search — words (the DME's AND rule; when no card has every word, any word, and the payload says so), meaning, CEDS ID

	const SEARCH_RUNNER_BY_MODE = Object.freeze({
		words: ({ raterGraph, queryText }, callback) =>
			cedsCards.resolveSearchIndexNames({ raterGraph }, (indexError, indexAnswer) => {
				if (indexError || indexAnswer.refusal) {
					callback(indexError, indexAnswer.refusal ? refusalOf('searchIndexAbsent', indexAnswer.refusal.refusalText) : undefined);
					return;
				}
				cedsCards.searchByWords({ raterGraph, fulltextIndexName: indexAnswer.fulltextIndexName, queryText, wordJoinName: 'and', windowSize: SEARCH_RESULT_CARD_COUNT }, (andError, andTupleIdList) => {
					if (andError) {
						callback(andError);
						return;
					}
					if (andTupleIdList.length > 0 || queryText.trim().split(/\s+/).length === 1) {
						callback('', { cedsTupleIdList: andTupleIdList, searchNote: null });
						return;
					}
					cedsCards.searchByWords({ raterGraph, fulltextIndexName: indexAnswer.fulltextIndexName, queryText, wordJoinName: 'or', windowSize: SEARCH_RESULT_CARD_COUNT }, (orError, orTupleIdList) =>
						orError ? callback(orError) : callback('', { cedsTupleIdList: orTupleIdList, searchNote: 'No card has every one of your words, so these have any of them.' }));
				});
			}),
		meaning: ({ raterGraph, queryText }, callback) => {
			const embedderAnswer = raterToolAccess.getEmbedder();
			if (embedderAnswer.refusal) {
				callback('', refusalOf('noEmbedder', embedderAnswer.refusal.refusalText));
				return;
			}
			cedsCards.resolveSearchIndexNames({ raterGraph }, (indexError, indexAnswer) => {
				if (indexError || indexAnswer.refusal) {
					callback(indexError, indexAnswer.refusal ? refusalOf('searchIndexAbsent', indexAnswer.refusal.refusalText) : undefined);
					return;
				}
				embedderAnswer.embedder.embed([queryText], (embedError, embeddingList) => {
					if (embedError || !Array.isArray(embeddingList) || !embeddingList[0]) {
						callback(`embedding the search failed: ${embedError || 'no embedding returned'}`);
						return;
					}
					cedsCards.searchByMeaning({ raterGraph, vectorIndexName: indexAnswer.vectorIndexName, embedding: embeddingList[0], windowSize: SEARCH_RESULT_CARD_COUNT }, (meaningError, tupleIdList) =>
						meaningError ? callback(meaningError) : callback('', { cedsTupleIdList: tupleIdList, searchNote: null }));
				});
			});
		},
		cedsId: ({ raterGraph, queryText }, callback) => {
			const cedsId = queryText.trim().toUpperCase();
			if (!CEDS_ID_PATTERN.test(cedsId)) {
				callback('', refusalOf('cedsIdInvalid', `A CEDS ID looks like P001572 (P and six digits); got '${queryText.trim()}'.`));
				return;
			}
			cedsCards.readCardsByCedsId({ raterGraph, cedsId }, (readError, cardList) => (readError ? callback(readError) : callback('', { cardList, searchNote: null })));
		},
	});

	const search = ({ raterUserName, elementStableId, searchMode, queryText }, callback) =>
		withRater(raterUserName, (rater, done) => {
			if (SEARCH_MODE_LIST.indexOf(searchMode) === -1) {
				done('', refusalOf('searchModeInvalid', `searchMode must be one of ${SEARCH_MODE_LIST.join(', ')}.`));
				return;
			}
			const cleanQueryText = typeof queryText === 'string' ? queryText.trim().slice(0, QUERY_TEXT_LENGTH_CAP) : '';
			if (cleanQueryText === '') {
				done('', refusalOf('queryTextEmpty', 'Type something to search for.'));
				return;
			}
			const element = raterToolAccess.elementByStableId[elementStableId];
			if (!element || element.surveyName !== rater.surveyName) {
				done('', refusalOf('elementNotInSurvey', `That element is not in your survey (${rater.surveyName}).`));
				return;
			}
			withGraph((raterGraph, graphDone) =>
				SEARCH_RUNNER_BY_MODE[searchMode]({ raterGraph, queryText: cleanQueryText }, (runError, runAnswer) => {
					if (runError || (runAnswer && runAnswer.refusal)) {
						graphDone(runError, runAnswer);
						return;
					}
					if (runAnswer.cardList) {
						graphDone('', { cardList: runAnswer.cardList, searchNote: runAnswer.searchNote });
						return;
					}
					cedsCards.readCardsByTupleIdList({ raterGraph, cedsTupleIdList: runAnswer.cedsTupleIdList }, (readError, cardList) => (readError ? graphDone(readError) : graphDone('', { cardList, searchNote: runAnswer.searchNote })));
				}), (searchError, searchAnswer) => {
				if (searchError || searchAnswer.refusal) {
					done(searchError, searchAnswer);
					return;
				}
				const searchLogRow = { raterUserName: rater.raterUserName, elementStableId, searchMode, searchJson: raterMapper.encodeJsonColumn({ queryText: cleanQueryText }), resultCount: `${searchAnswer.cardList.length}`, searchedAt: nowText() };
				raterStore.saveRowVerified('searchLog', searchLogRow, (logError) => {
					if (logError) {
						done(logError);
						return;
					}
					done('', { searchMode, queryText: cleanQueryText, searchNote: searchAnswer.searchNote, cardList: searchAnswer.cardList.map(raterCardOf) });
				});
			});
		}, callback);

	// --------------------------------------------------------------------------------
	// browse

	const BROWSE_RUNNER_BY_MODE = Object.freeze({
		concepts: ({ raterGraph }, callback) => cedsCards.readConceptList({ raterGraph }, callback),
		classesOfConcept: ({ raterGraph, conceptName }, callback) =>
			cedsCards.readClassesOfConcept({ raterGraph, conceptName: `${conceptName || ''}` }, (readError, readAnswer) =>
				readError ? callback(readError) : readAnswer.refusal ? callback('', refusalOf('unknownConcept', readAnswer.refusal.refusalText)) : callback('', readAnswer)),
		propertiesOfClass: ({ raterGraph, classCedsId }, callback) =>
			cedsCards.readClassInfo({ raterGraph, classCedsId: `${classCedsId || ''}` }, (infoError, classInfo) => {
				if (infoError) {
					callback(infoError);
					return;
				}
				if (!classInfo) {
					callback('', refusalOf('unknownClass', `CEDS has no class with the ID '${classCedsId}'.`));
					return;
				}
				cedsCards.readCardsOfClass({ raterGraph, classCedsId: classInfo.classCedsId }, (cardError, cardList) => (cardError ? callback(cardError) : callback('', { ...classInfo, cardList: cardList.map(raterCardOf) })));
			}),
	});

	const browse = ({ raterUserName, browseMode, conceptName, classCedsId }, callback) =>
		withRater(raterUserName, (rater, done) => {
			if (BROWSE_MODE_LIST.indexOf(browseMode) === -1) {
				done('', refusalOf('browseModeInvalid', `browseMode must be one of ${BROWSE_MODE_LIST.join(', ')}.`));
				return;
			}
			withGraph((raterGraph, graphDone) => BROWSE_RUNNER_BY_MODE[browseMode]({ raterGraph, conceptName, classCedsId }, graphDone), (browseError, browseAnswer) =>
				browseError || browseAnswer.refusal ? done(browseError, browseAnswer) : done('', { browseMode, ...browseAnswer }));
		}, callback);

	// --------------------------------------------------------------------------------
	// progress and finish

	const getProgress = ({ raterUserName }, callback) =>
		withRater(raterUserName, (rater, done) => readCurrentAnswerList(rater, (readError, currentAnswerList) => (readError ? done(readError) : done('', progressOf(rater, currentAnswerList)))), callback);

	const finish = ({ raterUserName }, callback) =>
		withRater(raterUserName, (rater, done) => {
			if (rater.finishedAt) {
				done('', refusalOf('answersLocked', `Already finished and sent on ${rater.finishedAt}.`));
				return;
			}
			readCurrentAnswerList(rater, (readError, currentAnswerList) => {
				if (readError) {
					done(readError);
					return;
				}
				const progress = progressOf(rater, currentAnswerList);
				if (progress.savedCount !== progress.itemCount) {
					done('', refusalOf('notAllItemsSaved', `${progress.itemCount - progress.savedCount} of your ${progress.itemCount} items have no saved answer yet.`));
					return;
				}
				const finishedAt = nowText();
				raterStore.saveRowVerified('raters', { refId: rater.raterRefId, finishedAt }, (saveError) => (saveError ? done(saveError) : done('', { ...progress, finishedAt })));
			});
		}, callback);

	return { getItem, saveAnswer, search, browse, getProgress, finish, raterStore, raterMapper, orderedElementListOf, suggestedCardListOf };
};

module.exports = { makeRaterToolService, RATER_CARD_FIELD_LIST, RATER_ELEMENT_FIELD_LIST, ADDED_CARD_FOUND_BY_LIST, RATER_REFUSAL_NAME_LIST };
