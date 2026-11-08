'use strict';

// agreementScorer.js — how often the graph's answer agrees with a human rater's, pure (no graph, no store, no clock).
//
// THE UNIT is one rater's CURRENT answer to one sampled element (the answers table, never the history), counted only when
// the rater is still assigned to the element's survey (rater-results.js' rule: a moved rater's kept answer is not counted).
// THE GRAPH'S ANSWER for an element is the set of hub cards its members (or, for PESC, their occurrences) carry a match
// edge to, read by the CEDS Rater's own rule (goldTupleReader.js); an element with no such card is the graph abstaining.
//
// Each answer gets exactly one verdict, from VERDICT_RULE_LIST in order (the first whose test holds):
//   humanUnsure               the rater answered Unsure: counted, never scored
//   bothChoseSameCard         the rater's Best card is one of the graph's cards
//   sameCedsPropertyOtherCard the Best card is not the graph's, but it is the same CEDS property with the same qualifiers
//                             (the class differs): card-property-identity.js' identity, the one rater-results.js scores by
//   differentCard             the rater and the graph both chose a card, and no card of the graph's shares its property
//   graphAbstainedHumanChose  the rater chose a card; the graph maps the element to nothing
//   bothSayNoMatch            the rater said No match in CEDS; the graph maps the element to nothing
//   graphMappedHumanNoMatch   the rater said No match; the graph maps the element anyway
// and, apart from the verdict, acceptsGraphCard: the graph holds a card the rater marked Best OR ticked Same.
//
// Agreement rates are taken over the SCORED answers (every verdict but humanUnsure), each with its 95% Wilson interval:
//   cardAgreement     bothChoseSameCard + bothSayNoMatch
//   propertyAgreement cardAgreement + sameCedsPropertyOtherCard
//
//   scoreAgreement({ elementList, graphAnswerByElementStableId, propertyIdentityByTupleId, raterList, answerList, zScore })
//     -> { answerVerdictList, verdictCountByName, rateByName, scoredAnswerCount, ... } | { problemText }
//   wilsonIntervalOf({ successCount, trialCount, zScore }) -> { lowerRate, upperRate } | null when trialCount is 0

const VERDICT_RULE_LIST = Object.freeze([
	{ verdictName: 'humanUnsure', isScored: false, test: ({ answer }) => answer.answerKind === 'unsure' },
	{ verdictName: 'bothChoseSameCard', isScored: true, test: ({ answer, graphAnswer }) => answer.answerKind === 'cards' && graphAnswer.cedsTupleIdList.indexOf(answer.bestCedsTupleId) !== -1 },
	{ verdictName: 'sameCedsPropertyOtherCard', isScored: true, test: ({ answer, graphAnswer, identityOf }) => answer.answerKind === 'cards' && graphAnswer.cedsTupleIdList.length > 0 && graphAnswer.cedsTupleIdList.map(identityOf).indexOf(identityOf(answer.bestCedsTupleId)) !== -1 },
	{ verdictName: 'differentCard', isScored: true, test: ({ answer, graphAnswer }) => answer.answerKind === 'cards' && graphAnswer.cedsTupleIdList.length > 0 },
	{ verdictName: 'graphAbstainedHumanChose', isScored: true, test: ({ answer }) => answer.answerKind === 'cards' },
	{ verdictName: 'bothSayNoMatch', isScored: true, test: ({ answer, graphAnswer }) => answer.answerKind === 'noMatch' && graphAnswer.cedsTupleIdList.length === 0 },
	{ verdictName: 'graphMappedHumanNoMatch', isScored: true, test: ({ answer }) => answer.answerKind === 'noMatch' },
]);

const VERDICT_NAME_LIST = Object.freeze(VERDICT_RULE_LIST.map((oneRule) => oneRule.verdictName));

const RATE_RULE_BY_NAME = Object.freeze({
	cardAgreement: ['bothChoseSameCard', 'bothSayNoMatch'],
	propertyAgreement: ['bothChoseSameCard', 'sameCedsPropertyOtherCard', 'bothSayNoMatch'],
});

const wilsonIntervalOf = ({ successCount, trialCount, zScore }) => {
	if (trialCount === 0) {
		return null;
	}
	const observedRate = successCount / trialCount;
	const zSquared = zScore * zScore;
	const centre = (observedRate + zSquared / (2 * trialCount)) / (1 + zSquared / trialCount);
	const halfWidth = (zScore * Math.sqrt((observedRate * (1 - observedRate)) / trialCount + zSquared / (4 * trialCount * trialCount))) / (1 + zSquared / trialCount);
	return { lowerRate: Math.max(0, centre - halfWidth), upperRate: Math.min(1, centre + halfWidth) };
};

const countByVerdictOf = (answerVerdictList) => Object.fromEntries(VERDICT_NAME_LIST.map((verdictName) => [verdictName, answerVerdictList.filter((oneVerdict) => oneVerdict.verdictName === verdictName).length]));

const ratesOf = ({ answerVerdictList, zScore }) => {
	const verdictCountByName = countByVerdictOf(answerVerdictList);
	const scoredAnswerCount = answerVerdictList.filter((oneVerdict) => oneVerdict.isScored).length;
	const rateByName = Object.fromEntries(Object.keys(RATE_RULE_BY_NAME).map((rateName) => {
		const successCount = RATE_RULE_BY_NAME[rateName].reduce((soFar, verdictName) => soFar + verdictCountByName[verdictName], 0);
		return [rateName, { successCount, trialCount: scoredAnswerCount, rate: scoredAnswerCount === 0 ? null : successCount / scoredAnswerCount, interval: wilsonIntervalOf({ successCount, trialCount: scoredAnswerCount, zScore }) }];
	}));
	const acceptsGraphCardCount = answerVerdictList.filter((oneVerdict) => oneVerdict.acceptsGraphCard).length;
	return { answerCount: answerVerdictList.length, scoredAnswerCount, verdictCountByName, rateByName, acceptsGraphCardCount };
};

const scoreAgreement = ({ elementList, graphAnswerByElementStableId, propertyIdentityByTupleId, raterList, answerList, zScore }) => {
	const problemList = [];
	const surveyNameByRaterUserName = Object.fromEntries(raterList.map((oneRater) => [oneRater.raterUserName, oneRater.surveyName]));
	const elementByStableId = Object.fromEntries(elementList.map((oneElement) => [oneElement.elementStableId, oneElement]));
	const identityOf = (cedsTupleId) => {
		if (!propertyIdentityByTupleId[cedsTupleId]) {
			problemList.push(`card ${cedsTupleId} has no property identity in this graph`);
			return `absent:${cedsTupleId}`;
		}
		return propertyIdentityByTupleId[cedsTupleId];
	};
	const countedAnswerList = answerList.filter((oneAnswer) => elementByStableId[oneAnswer.elementStableId] && surveyNameByRaterUserName[oneAnswer.raterUserName] === elementByStableId[oneAnswer.elementStableId].surveyName);
	const answerVerdictList = countedAnswerList.map((oneAnswer) => {
		const element = elementByStableId[oneAnswer.elementStableId];
		const graphAnswer = graphAnswerByElementStableId[oneAnswer.elementStableId];
		if (!graphAnswer) {
			problemList.push(`element ${oneAnswer.elementStableId} has no graph answer`);
			return null;
		}
		const matchedRule = VERDICT_RULE_LIST.find((oneRule) => oneRule.test({ answer: oneAnswer.answer, graphAnswer, identityOf }));
		if (!matchedRule) {
			problemList.push(`an answer for ${oneAnswer.elementStableId} has answerKind ${JSON.stringify(oneAnswer.answer.answerKind)}, which no verdict rule reads`);
			return null;
		}
		const acceptedTupleIdList = oneAnswer.answer.answerKind === 'cards' ? [oneAnswer.answer.bestCedsTupleId].concat(oneAnswer.answer.sameCedsTupleIdList || []) : [];
		return {
			elementStableId: oneAnswer.elementStableId,
			standard: element.standard,
			splitHalf: element.splitHalf,
			verdictName: matchedRule.verdictName,
			isScored: matchedRule.isScored,
			acceptsGraphCard: acceptedTupleIdList.some((cedsTupleId) => graphAnswer.cedsTupleIdList.indexOf(cedsTupleId) !== -1),
			graphStrongestConfidence: graphAnswer.strongestConfidence,
			graphRelationNameList: graphAnswer.relationNameList,
		};
	});
	if (problemList.length > 0) {
		return { problemText: `agreementScorer: ${problemList.length} answer(s) cannot be scored: ${problemList.slice(0, 5).join('; ')}` };
	}
	const groupRatesBy = (fieldName) => [...new Set(answerVerdictList.map((oneVerdict) => oneVerdict[fieldName]))].sort().map((groupValue) => ({ groupValue, ...ratesOf({ answerVerdictList: answerVerdictList.filter((oneVerdict) => oneVerdict[fieldName] === groupValue), zScore }) }));
	return {
		answerVerdictList,
		...ratesOf({ answerVerdictList, zScore }),
		elementCount: new Set(answerVerdictList.map((oneVerdict) => oneVerdict.elementStableId)).size,
		ratesByStandard: groupRatesBy('standard'),
		ratesBySplitHalf: groupRatesBy('splitHalf'),
		ratesByGraphConfidence: groupRatesBy('graphStrongestConfidence'),
	};
};

module.exports = { scoreAgreement, wilsonIntervalOf, VERDICT_NAME_LIST, VERDICT_RULE_LIST, RATE_RULE_BY_NAME };
