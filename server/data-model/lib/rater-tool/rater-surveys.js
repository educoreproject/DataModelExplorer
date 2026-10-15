'use strict';

// rater-surveys.js — revision 5: the admin screen's Surveys section, pure (no store, no clock). One card per survey of
// the frozen sample: its item count split by standard, the raters on it with their progress, a coverage colour against
// the design target (DESIGN-humanTruthSet-101326.md §5: two raters per survey at least, three preferred), and which
// survey to fill next. Also the survey's items, read-only, as a rater sees the target (never the candidates, the gold,
// isMappedInGold or any machine result).
//
//   buildSurveySummary({ surveyNameList, elementListBySurvey, raterList, answerList, moveRefusalOf })
//       -> { surveyList, nextSurveyName, nextRaterUserName } | { problemText } (a survey with no elements in the sample)
//     surveyList, in surveyNameList order: { surveyName, itemCount, itemCountByStandardList: [{ standard, itemCount }],
//       raterCount, coverageColour, raterList: [{ raterUserName, whoText, surveyName, savedCount, itemCount, finishedAt,
//       answerCount, moveRefusal }] }
//     savedCount = targets of the rater's CURRENT survey with a current saved answer (as the raters table shows it);
//       answerCount = every answer row the rater has, which is what the move rule reads
//     moveRefusal = moveRefusalOf({ rater, answerCount }): the admin's own survey-change rule (rater-tool-admin.js), so
//       the picker shows the same refusal the server would give; null when the move is allowed
//     nextSurveyName = the survey with the fewest raters; a tie goes to the earlier survey in surveyNameList (A, B, C)
//     nextRaterUserName = rater-NN, one past the highest NN in use (two digits at least)
//   surveyItemListOf({ surveyName, elementListBySurvey }) -> { itemList } | { problemText }
//     itemList: the survey's targets in the survey's frozen order (each rater sees their own shuffle of it), each with
//       only SURVEY_ITEM_FIELD_LIST plus itemNumber

const SURVEY_COVERAGE_AMBER_MINIMUM_RATER_COUNT = 2;
const SURVEY_COVERAGE_GREEN_MINIMUM_RATER_COUNT = 3;
// highest threshold first: the first rule a survey's rater count reaches gives its colour
const SURVEY_COVERAGE_RULE_LIST = Object.freeze([
	{ coverageColour: 'green', minimumRaterCount: SURVEY_COVERAGE_GREEN_MINIMUM_RATER_COUNT },
	{ coverageColour: 'amber', minimumRaterCount: SURVEY_COVERAGE_AMBER_MINIMUM_RATER_COUNT },
	{ coverageColour: 'red', minimumRaterCount: 0 },
]);
const SURVEY_ITEM_FIELD_LIST = Object.freeze(['elementStableId', 'standard', 'ownerName', 'name', 'definition', 'definitionAbsentReason']);
const SEQUENTIAL_RATER_NAME_PATTERN = /^rater-(\d+)$/;
const SEQUENTIAL_RATER_NAME_PREFIX = 'rater-';
const SEQUENTIAL_RATER_NUMBER_WIDTH = 2;

const coverageColourOf = (raterCount) => SURVEY_COVERAGE_RULE_LIST.find((coverageRule) => raterCount >= coverageRule.minimumRaterCount).coverageColour;

const nextRaterUserNameOf = (raterList) => {
	const highestNumber = raterList.reduce((soFar, rater) => {
		const matched = `${rater.raterUserName}`.match(SEQUENTIAL_RATER_NAME_PATTERN);
		return matched ? Math.max(soFar, parseInt(matched[1], 10)) : soFar;
	}, 0);
	return `${SEQUENTIAL_RATER_NAME_PREFIX}${`${highestNumber + 1}`.padStart(SEQUENTIAL_RATER_NUMBER_WIDTH, '0')}`;
};

const buildSurveySummary = ({ surveyNameList, elementListBySurvey, raterList, answerList, moveRefusalOf }) => {
	const absentSurveyNameList = surveyNameList.filter((surveyName) => !elementListBySurvey[surveyName]);
	if (absentSurveyNameList.length > 0) {
		return { problemText: `rater-surveys: the frozen sample has no elements for survey '${absentSurveyNameList.join("', '")}'` };
	}
	const answerListByRater = answerList.reduce((soFar, answerRecord) => ({ ...soFar, [answerRecord.raterUserName]: (soFar[answerRecord.raterUserName] || []).concat([answerRecord]) }), {});
	const surveyList = surveyNameList.map((surveyName) => {
		const surveyElementList = elementListBySurvey[surveyName];
		const surveyStableIdSet = new Set(surveyElementList.map((element) => element.elementStableId));
		const itemCountByStandardList = surveyElementList.reduce((soFar, element) => {
			const standardEntry = soFar.find((entry) => entry.standard === element.standard);
			return standardEntry ? soFar.map((entry) => (entry === standardEntry ? { ...entry, itemCount: entry.itemCount + 1 } : entry)) : soFar.concat([{ standard: element.standard, itemCount: 1 }]);
		}, []);
		const surveyRaterList = raterList
			.filter((rater) => rater.surveyName === surveyName)
			.map((rater) => {
				const raterAnswerList = answerListByRater[rater.raterUserName] || [];
				return {
					raterUserName: rater.raterUserName,
					whoText: (rater.display || {}).whoText || '',
					surveyName,
					savedCount: raterAnswerList.filter((answerRecord) => surveyStableIdSet.has(answerRecord.elementStableId)).length,
					itemCount: surveyElementList.length,
					finishedAt: rater.finishedAt || null,
					answerCount: raterAnswerList.length,
					moveRefusal: moveRefusalOf({ rater, answerCount: raterAnswerList.length }),
				};
			})
			.sort((raterA, raterB) => (raterA.raterUserName < raterB.raterUserName ? -1 : 1));
		return { surveyName, itemCount: surveyElementList.length, itemCountByStandardList, raterCount: surveyRaterList.length, coverageColour: coverageColourOf(surveyRaterList.length), raterList: surveyRaterList };
	});
	const nextSurvey = surveyList.reduce((soFar, survey) => (soFar === null || survey.raterCount < soFar.raterCount ? survey : soFar), null);
	return { surveyList, nextSurveyName: nextSurvey ? nextSurvey.surveyName : null, nextRaterUserName: nextRaterUserNameOf(raterList) };
};

const surveyItemListOf = ({ surveyName, elementListBySurvey }) => {
	const surveyElementList = elementListBySurvey[surveyName];
	if (!surveyElementList) {
		return { problemText: `rater-surveys: there is no survey '${surveyName}' in the frozen sample` };
	}
	return {
		itemList: surveyElementList.map((element, position) => SURVEY_ITEM_FIELD_LIST.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: element[fieldName] === undefined ? null : element[fieldName] }), { itemNumber: position + 1 })),
	};
};

module.exports = { buildSurveySummary, surveyItemListOf, coverageColourOf, nextRaterUserNameOf, SURVEY_COVERAGE_AMBER_MINIMUM_RATER_COUNT, SURVEY_COVERAGE_GREEN_MINIMUM_RATER_COUNT, SURVEY_COVERAGE_RULE_LIST, SURVEY_ITEM_FIELD_LIST };
