'use strict';
// rosetta-meaning-search-live.test.js — WORKORDER-rosettaMeanings-111026 R5's code, on the real golden (skipped by name with none): the hubMeanings pool runner
// beside hubCards, and the one config key that chooses between them. Whether hubMeanings is BETTER is not a gate here: that is the measurement in
// runs/rosettaMeanings/ (REPORT-R5-meaningSearch-111026.md), and the shipped config stays hubCards until TQ rules.
//   1. hubTargetKind is required and closed: absent or unknown, Rosetta is refused by name
//   2. a hubMeanings pool answers retrieval's pool shape, key for key, so no answer's shape moves when the key does
//   3. it searches the cards' OWN embeddings: a text whose vector is a card's own vector finds that card first, at cosine 1
//   4. it tells apart cards that share an element's text (the qualified Person Identifier cards), which hubCards ties
//   5. retrieval and the judge's runner read the same key
//   6. meaningScoringName is closed (max, sum) and each scoring combines the texts' cosines as named
//   7. hubHybrid: today's pool, with the meanings' first hybridMeaningCount cards it lacks placed straight after the judge's view; the judge's view reaches over them
//      (judgedViewLength, read by the runner's judgedCandidateListOf), and retrieval's answer never carries that field
//   8. the hybrid merge on pools built to break it (pure): today's cosine-rank-1 card stays in the judge's view from past the cap or past the pool, the pool keeps
//      poolCap, and judgedPoolCap 0 shows the judge everything
//   node server/test/rosetta-meaning-search-live.test.js

const { openHarness, LIVE_FUSE_VALUES } = require('./lib/rosettaLiveHarness');
const { rosettaFuseValuesOf, HUB_TARGET_KIND_LIST, retrievalAnswerOf } = require('../lib/standards-query/rosetta/rosettaRetrieval');
const { MEANING_SCORE_BY_NAME, hybridPoolOf } = require('../lib/standards-query/rosetta/retrieveCandidates');
const { judgedCandidateListOf } = require('../lib/standards-query/rosetta/rosettaJobRunner');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};
const finish = () => {
	console.log(`rosetta-meaning-search-live: ${passedCount} passed, ${failedCount} failed`);
	process.exit(failedCount === 0 ? 0 : 1);
};

// a card's own vector, as an embedder would give it for the text that IS that card's embedText; any other text gets the first card's
const CARD_SAMPLE_CYPHER = "MATCH (card:HubReference { hubName: 'CEDS', referenceTier: 'property' }) WHERE card.name = 'Person Identifier' RETURN card.stableId AS stableId, card.embedText AS embedText, card.embedding AS embedding, card.qualifierNames AS qualifierNames ORDER BY stableId";
const cardVectorEmbedderFor = (vectorByText) => ({ batchSize: 20, embed: (textList, done) => done('', textList.map((oneText) => vectorByText.get(oneText) || [...vectorByText.values()][0])) });

const fuseRefusalOf = (hubTargetKind, meaningScoringName = 'sum') => rosettaFuseValuesOf({ meaningScoringName, judgedPoolCap: 20, hybridMeaningCount: 1, retrievalMaxTokensPerRequest: 1, retrievalDailyTokenCeiling: 1, retrievalInFlightMax: 1, judgedDailyTokenCeiling: 1, maxUnresolvedListLength: 1, maxFieldListLength: 1, maxFieldNameChars: 1, maxFieldDefinitionChars: 1, maxFieldPathChars: 1, maxDocumentDepth: 1, maxRefExpansions: 1, hitsPerText: 1, poolCap: 1, indexWindowPerText: 1, textsPerGraphQuery: 1, strangerVectorCacheMaxRows: 1, strangerVectorRetentionDays: 1, minScore: 0.3, judgeUsdPerFieldEstimate: 0.1, rosettaStoreFilePath: '/x', ...(hubTargetKind === undefined ? {} : { hubTargetKind }) }).refusalText || '';
ok('1: hubTargetKind absent: Rosetta is refused by name', /hubTargetKind/.test(fuseRefusalOf(undefined)), fuseRefusalOf(undefined));
ok('1: hubTargetKind unknown: refused, naming the valid kinds and the value given', /hubTargetKind \(one of hubCards, hubMeanings, hubHybrid; got "hubVibes"\)/.test(fuseRefusalOf('hubVibes')), fuseRefusalOf('hubVibes'));
ok('1: each valid kind is accepted', HUB_TARGET_KIND_LIST.every((oneKind) => fuseRefusalOf(oneKind) === ''));
ok('6: meaningScoringName unknown: refused, naming max and sum', /meaningScoringName \(one of max, sum; got "mean"\)/.test(fuseRefusalOf('hubCards', 'mean')), fuseRefusalOf('hubCards', 'mean'));
// 8: synthetic pools. Today's 40 cards c1..c40, c33 its cosine-rank-1; the meanings m1..m12 and c5 (already in today's view)
const syntheticCandidateOf = (stableId, rank, rankByCosine, cosine) => ({ stableId, rank, rankByCosine, cosine });
const syntheticCardsPool = { admittedCount: 60, candidateList: Array.from({ length: 40 }, (unusedItem, cardIndex) => syntheticCandidateOf(`c${cardIndex + 1}`, cardIndex + 1, cardIndex === 32 ? 1 : cardIndex + 2, cardIndex === 32 ? 0.9 : 0.5 - cardIndex / 100)) };
const syntheticMeaningsPool = { candidateList: [syntheticCandidateOf('c5', 1, 1, 0.8), ...Array.from({ length: 12 }, (unusedItem, meaningIndex) => syntheticCandidateOf(`m${meaningIndex + 1}`, meaningIndex + 2, meaningIndex + 2, 0.7 - meaningIndex / 100))] };
const mergedOf = (overrides) => hybridPoolOf({ cardsPool: syntheticCardsPool, meaningsPool: syntheticMeaningsPool, judgedPoolCap: 20, hybridMeaningCount: 10, poolCap: 40, ...overrides });
const idsOf = (onePool) => onePool.candidateList.map((oneCandidate) => oneCandidate.stableId);
const capMerged = mergedOf({});
ok('8: the view is today\'s first 20 and its cosine-rank-1 card from past the cap, then 10 meanings it lacks (a meaning already in the view is not added twice)', JSON.stringify(idsOf(capMerged).slice(0, 31)) === JSON.stringify([...Array.from({ length: 20 }, (unusedItem, cardIndex) => `c${cardIndex + 1}`), 'c33', ...Array.from({ length: 10 }, (unusedItem, meaningIndex) => `m${meaningIndex + 1}`)]) && capMerged.judgedViewLength === 31, JSON.stringify(idsOf(capMerged).slice(0, 31)));
ok('8: the runner\'s judged list from it holds today\'s cosine-rank-1 card', judgedCandidateListOf({ pool: capMerged, judgedPoolCap: 20 }).some((oneCandidate) => oneCandidate.stableId === 'c33'));
ok('8: the pool keeps poolCap: today\'s tail gives way', capMerged.poolSize === 40 && capMerged.candidateList.every((oneCandidate, candidateIndex) => oneCandidate.rank === candidateIndex + 1), `${capMerged.poolSize}`);
const outsideMerged = hybridPoolOf({ cardsPool: { ...syntheticCardsPool, candidateList: syntheticCardsPool.candidateList.map((oneCandidate) => ({ ...oneCandidate, rankByCosine: oneCandidate.rankByCosine + 1 })), cosineRankOneOutsidePool: syntheticCandidateOf('c99', 99, 1, 0.95) }, meaningsPool: syntheticMeaningsPool, judgedPoolCap: 20, hybridMeaningCount: 10, poolCap: 40 });
ok('8: a cosine-rank-1 card from past today\'s pool is in the view too', idsOf(outsideMerged)[20] === 'c99' && outsideMerged.judgedViewLength === 31, JSON.stringify(idsOf(outsideMerged).slice(18, 23)));
const wholeMerged = mergedOf({ judgedPoolCap: 0 });
ok('8: judgedPoolCap 0: the judge sees all of today\'s pool and the 10 meanings, past poolCap', wholeMerged.poolSize === 50 && wholeMerged.judgedViewLength === 50, `${wholeMerged.poolSize} ${wholeMerged.judgedViewLength}`);
ok('6: max is the best cosine, sum the total', MEANING_SCORE_BY_NAME.max([0.5, 0.4]) === 0.5 && Math.abs(MEANING_SCORE_BY_NAME.sum([0.5, 0.4]) - 0.9) < 1e-12);

const HYBRID_MEANING_COUNT = 3;
const JUDGED_POOL_CAP = 5;
const hybridGate = ({ cardRowList, qualifiedRow }) => {
	const vectorByText = new Map(cardRowList.map((oneRow) => [oneRow.embedText, oneRow.embedding]));
	openHarness({ embedder: cardVectorEmbedderFor(vectorByText), fuseOverrideValues: { hubTargetKind: 'hubHybrid', hybridMeaningCount: HYBRID_MEANING_COUNT, judgedPoolCap: JUDGED_POOL_CAP } }, (harnessError, harness) => {
		if (harnessError) {
			ok(`harness: ${harnessError}`, false);
			finish();
			return;
		}
		const serviceFacts = harness.core.serviceFactsForGate();
		const poolFor = (targetKind, done) => harness.goldenHandle.withReadSession((session, sessionDone) => harness.rosettaRetrieval.retrieveCandidates({ session, serviceFacts, queryTextList: [qualifiedRow.embedText], target: { kind: targetKind, hubName: 'CEDS', tier: 'property' } }, sessionDone), done);
		poolFor('hubHybrid', (hybridError, hybridPool) => poolFor('hubCards', (cardsError, cardsPool) => poolFor('hubMeanings', (meaningsError, meaningsPool) => {
			ok('7: the three pools answer', !hybridError && !cardsError && !meaningsError && !hybridPool.refusal, `${hybridError} ${cardsError} ${meaningsError}`);
			const idListOf = (candidateList) => candidateList.map((oneCandidate) => oneCandidate.stableId);
			// today's judged view: its first judgedPoolCap cards and its cosine-rank-1 card, wherever that stood
			const todayCosineRankOne = cardsPool.cosineRankOneOutsidePool || cardsPool.candidateList.find((oneCandidate) => oneCandidate.rankByCosine === 1);
			const capIdList = idListOf(cardsPool.candidateList.slice(0, JUDGED_POOL_CAP));
			const viewIdList = capIdList.includes(todayCosineRankOne.stableId) ? capIdList : [...capIdList, todayCosineRankOne.stableId];
			const expectedAddedIdList = idListOf(meaningsPool.candidateList).filter((stableId) => !viewIdList.includes(stableId)).slice(0, HYBRID_MEANING_COUNT);
			const { poolCap } = LIVE_FUSE_VALUES;
			const expectedIdList = [...viewIdList, ...expectedAddedIdList, ...idListOf(cardsPool.candidateList).filter((stableId) => !viewIdList.includes(stableId) && !expectedAddedIdList.includes(stableId))].slice(0, Math.max(poolCap, viewIdList.length + expectedAddedIdList.length));
			ok('7: the hybrid pool is today\'s view (cap and cosine-rank-1), then the meanings it lacks (at most hybridMeaningCount), then the rest of today\'s pool, within poolCap', JSON.stringify(idListOf(hybridPool.candidateList)) === JSON.stringify(expectedIdList) && hybridPool.poolSize <= poolCap, JSON.stringify(idListOf(hybridPool.candidateList).slice(0, 10)));
			ok('7: today\'s cosine-rank-1 card stays in the judge\'s view: the hybrid never shows the judge less than today', idListOf(judgedCandidateListOf({ pool: hybridPool, judgedPoolCap: JUDGED_POOL_CAP })).includes(todayCosineRankOne.stableId));
			ok('7: the card the text means, which today\'s view lacks, is among those added', expectedAddedIdList.includes(qualifiedRow.stableId) || viewIdList.includes(qualifiedRow.stableId), JSON.stringify(expectedAddedIdList));
			ok('7: judgedViewLength reaches over the added meanings', hybridPool.judgedViewLength === viewIdList.length + expectedAddedIdList.length, `${hybridPool.judgedViewLength}`);
			const judgedIdList = idListOf(judgedCandidateListOf({ pool: hybridPool, judgedPoolCap: JUDGED_POOL_CAP }));
			ok('7: and the runner\'s judged list holds them all', expectedAddedIdList.every((stableId) => judgedIdList.includes(stableId)) && viewIdList.every((stableId) => judgedIdList.includes(stableId)), JSON.stringify(judgedIdList));
			ok('7: without judgedViewLength, the runner\'s list is the cap as before', judgedCandidateListOf({ pool: cardsPool, judgedPoolCap: JUDGED_POOL_CAP }).slice(0, JUDGED_POOL_CAP).length === Math.min(JUDGED_POOL_CAP, cardsPool.candidateList.length));
			const answer = retrievalAnswerOf({ submissionForm: { formatName: 'fieldList' }, parsed: { fieldList: [{ name: 'x' }], unresolvedRefList: [], unresolvedContextList: [], notWalkedList: [] }, hubRowList: [{ hubName: 'CEDS' }], poolByTargetName: { CEDS: { field0: hybridPool } }, fieldVectorList: [{ fieldRefId: 'field0' }], facts: { nothingJudgedNote: '', rankNote: '' }, fuseValues: { hitsPerText: 1, minScore: 0.3, poolCap: 1 }, detail: 'lean' });
			ok('7: retrieval\'s answer never carries judgedViewLength', !JSON.stringify(answer).includes('judgedViewLength') && answer.fieldList[0].resultList[0].candidateList.length === hybridPool.candidateList.length);
			harness.runner.stopTicking();
			harness.close(finish);
		})));
	});
};

openHarness({}, (probeError, probeHarness) => {
	if (probeError === 'noGraph') {
		console.log('SKIP: rosetta-meaning-search-live: no graph is reachable, so only the config checks ran');
		finish();
		return;
	}
	if (probeError) {
		ok(`harness: ${probeError}`, false);
		finish();
		return;
	}
	probeHarness.goldenHandle.runQuery(CARD_SAMPLE_CYPHER, {}, (sampleError, cardRowList) => probeHarness.close(() => {
		if (sampleError || cardRowList.length < 2) {
			ok(`the golden holds the qualified Person Identifier cards: ${sampleError}`, false);
			finish();
			return;
		}
		const vectorByText = new Map(cardRowList.map((oneRow) => [oneRow.embedText, oneRow.embedding]));
		openHarness({ embedder: cardVectorEmbedderFor(vectorByText), fuseOverrideValues: { hubTargetKind: 'hubMeanings' } }, (harnessError, harness) => {
			if (harnessError) {
				ok(`harness: ${harnessError}`, false);
				finish();
				return;
			}
			const serviceFacts = harness.core.serviceFactsForGate();
			const poolFor = ({ targetKind, queryTextList }, done) => harness.goldenHandle.withReadSession((session, sessionDone) => harness.rosettaRetrieval.retrieveCandidates({ session, serviceFacts, queryTextList, target: { kind: targetKind, hubName: 'CEDS', tier: 'property' } }, sessionDone), done);
			const qualifiedRow = cardRowList.find((oneRow) => [].concat(oneRow.qualifierNames || []).length > 0);
			poolFor({ targetKind: 'hubMeanings', queryTextList: [qualifiedRow.embedText] }, (meaningError, meaningPool) => poolFor({ targetKind: 'hubCards', queryTextList: [qualifiedRow.embedText] }, (cardsError, cardsPool) => {
				ok('both pools answer', !meaningError && !cardsError && !meaningPool.refusal && !cardsPool.refusal, `${meaningError} ${cardsError} ${JSON.stringify(meaningPool.refusal || cardsPool.refusal)}`);
				const keySetOf = (onePool) => JSON.stringify(Object.keys(onePool).filter((oneName) => !['cosineRankOneOutsidePool', 'target'].includes(oneName)).sort());
				const candidateKeySetOf = (onePool) => JSON.stringify(Object.keys(onePool.candidateList[0]).sort());
				ok('2: a hubMeanings pool has a hubCards pool\'s keys, and each candidate a hubCards candidate\'s', keySetOf(meaningPool) === keySetOf(cardsPool) && candidateKeySetOf(meaningPool) === candidateKeySetOf(cardsPool), `${keySetOf(meaningPool)} ${candidateKeySetOf(meaningPool)} vs ${keySetOf(cardsPool)} ${candidateKeySetOf(cardsPool)}`);
				const firstCandidate = meaningPool.candidateList[0];
				ok('3: the card whose own vector the text carries is first, at cosine 1', firstCandidate.stableId === qualifiedRow.stableId && firstCandidate.cosine > 0.9999 && firstCandidate.rank === 1 && firstCandidate.rankByCosine === 1, `${firstCandidate.stableId} ${firstCandidate.cosine}`);
				const siblingCosineList = meaningPool.candidateList.filter((oneCandidate) => cardRowList.some((oneRow) => oneRow.stableId === oneCandidate.stableId)).map((oneCandidate) => oneCandidate.cosine);
				ok('4: the qualified siblings are told apart (distinct cosines), where they share one element\'s text', new Set(siblingCosineList).size === siblingCosineList.length && siblingCosineList.length >= 2, JSON.stringify(siblingCosineList));
				ok('5: retrieval and the judge\'s runner read one key: the retrieval module names the configured kind', harness.rosettaRetrieval.hubTargetKind === 'hubMeanings');
				ok('5: and the runner asks for its pools by that name (rosettaJobRunner.js reads rosettaRetrieval.hubTargetKind)', /target: \{ kind: rosettaRetrieval\.hubTargetKind, hubName, tier: TIER_OFFERED \}/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'standards-query', 'rosetta', 'rosettaJobRunner.js'), 'utf8')));
				harness.runner.stopTicking();
				harness.close(() => hybridGate({ cardRowList, qualifiedRow }));
			}));
		});
	}));
});
