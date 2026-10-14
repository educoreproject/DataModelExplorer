'use strict';

// sampleBuilder.js — from the three frames to sample.json: group, classify, exclude, draw, split, deal. Pure functions of
// (frame rows, published config, seed): no clock, no graph, no randomness but seeded-draw's, every list sorted before use,
// so two runs with one seed are byte-identical.
//
//   groupFrame({ standardName, memberRowList, groupSignatureOf }) -> elementList (one per element, members folded in)
//   classifyKind({ standardName, element, kindRuleRegistry }) -> kind name
//   applyExclusions({ elementList, exclusionList }) -> { keptElementList, exclusionReportList }
//   allocateKindCounts({ kindCountByName, drawCount, minimumPerKindCount, kindNameList }) -> drawCountByKind
//   drawStandard({ standardName, elementList, drawConfig }) -> { drawnElementList, drawCountByKind }
//   splitDevSealed({ standardName, drawnElementList, drawConfig }) -> drawn list with splitHalf set
//   dealSurveys({ drawnElementListByStandard, drawConfig }) -> drawn lists with surveyName set

const { seededShuffle } = require('../../../../server/data-model/lib/rater-tool/seeded-draw');

const MEMBER_PATH_LIST_CAP = 12;
const byText = (textA, textB) => (textA < textB ? -1 : textA > textB ? 1 : 0);

const groupFrame = ({ standardName, memberRowList, groupSignatureOf }) => {
	const memberRowListBySignature = {};
	memberRowList.forEach((memberRow) => {
		const groupSignature = groupSignatureOf(memberRow);
		(memberRowListBySignature[groupSignature] = memberRowListBySignature[groupSignature] || []).push(memberRow);
	});
	return Object.keys(memberRowListBySignature)
		.map((groupSignature) => {
			const groupMemberList = memberRowListBySignature[groupSignature].slice().sort((rowA, rowB) => byText(rowA.pathText, rowB.pathText) || byText(rowA.memberStableId, rowB.memberStableId));
			const representative = groupMemberList[0];
			return {
				elementStableId: `${standardName}:${representative.memberStableId}`,
				standard: standardName,
				subStandardName: representative.subStandardName,
				name: representative.name,
				definition: representative.definition,
				definitionAbsentReason: representative.definition === null ? `No definition published by ${standardName}` : null,
				dataTypeText: representative.dataTypeText,
				typeNameList: representative.typeNameList,
				optionSetName: representative.optionSetName,
				optionValueSampleList: representative.optionValueSampleList || [],
				ownerName: representative.ownerName,
				ownerDefinition: representative.ownerDefinition,
				ownerDefinitionAbsentReason: representative.ownerDefinition === null ? `No definition published by ${standardName}` : null,
				path: representative.pathText,
				documentationUrl: null,
				memberCount: groupMemberList.length,
				isMappedInGold: groupMemberList.some((oneRow) => oneRow.memberIsMapped === true),
				memberStableIdList: groupMemberList.map((oneRow) => oneRow.memberStableId),
				memberPathList: groupMemberList.slice(0, MEMBER_PATH_LIST_CAP).map((oneRow) => oneRow.pathText),
				memberExclusionMatchList: groupMemberList.map((oneRow) => ({ ...oneRow.exclusionMatch, name: oneRow.name, definition: oneRow.definition })),
			};
		})
		.sort((elementA, elementB) => byText(elementA.elementStableId, elementB.elementStableId));
};

// KIND_TEST_BY_NAME — one test per kind; classifyKind tries them in kindPrecedenceList order
const KIND_TEST_BY_NAME = Object.freeze({
	identifier: ({ element, standardRule, identifierNamePattern }) => identifierNamePattern.test(element.name.replace(/^@/, '')) || typeMatches(element, standardRule, 'identifier'),
	indicator: ({ element, standardRule, indicatorOptionValueList }) =>
		typeMatches(element, standardRule, 'indicator') ||
		(element.optionSetName !== null && element.optionValueSampleList.length > 0 && element.optionValueSampleList.length <= 4 && element.optionValueSampleList.every((optionValue) => indicatorOptionValueList.indexOf(`${optionValue}`.toLowerCase()) !== -1)),
	code: ({ element, standardRule }) => element.optionSetName !== null || typeMatches(element, standardRule, 'code'),
	dateTime: ({ element, standardRule }) => typeMatches(element, standardRule, 'dateTime'),
	number: ({ element, standardRule }) => typeMatches(element, standardRule, 'number'),
	freeText: () => true,
});

const typeMatches = (element, standardRule, kindName) => {
	const typeNameList = standardRule.typeNameByKind[kindName] || [];
	const typePatternList = (standardRule.typePatternListByKind[kindName] || []).map((patternText) => new RegExp(patternText));
	return element.typeNameList.some((typeName) => typeNameList.indexOf(typeName) !== -1 || typePatternList.some((typePattern) => typePattern.test(typeName)));
};

const classifyKind = ({ standardName, element, kindRuleRegistry }) => {
	const standardRule = kindRuleRegistry.standardRuleByName[standardName];
	if (!standardRule) {
		throw new Error(`sampleBuilder.classifyKind: kindRuleRegistry has no rule for standard '${standardName}'`);
	}
	const identifierNamePattern = new RegExp(kindRuleRegistry.identifierNamePattern);
	const kindName = kindRuleRegistry.kindPrecedenceList.find((candidateKindName) =>
		KIND_TEST_BY_NAME[candidateKindName]({ element, standardRule, identifierNamePattern, indicatorOptionValueList: kindRuleRegistry.indicatorOptionValueList }));
	return kindName;
};

// EXCLUSION_TEST_BY_STANDARD — does one member of an element match one exclusion entry
const EXCLUSION_TEST_BY_STANDARD = Object.freeze({
	'Ed-Fi': (memberMatch, exclusion) => memberMatch.edFiPath === exclusion.edFiPath,
	SIF: (memberMatch, exclusion) => memberMatch.sifXpath === exclusion.sifXpath,
	PESC: (memberMatch, exclusion) => memberMatch.pescSourceName === exclusion.pescSourceName && memberMatch.name === exclusion.elementName && memberMatch.definition === exclusion.definition,
});

const applyExclusions = ({ elementList, exclusionList }) => {
	const exclusionReportList = exclusionList.map((exclusion) => ({ exclusion, removedElementStableIdList: [] }));
	const keptElementList = elementList.filter((element) => {
		const matchingReportList = exclusionReportList.filter((exclusionReport) =>
			exclusionReport.exclusion.standard === element.standard &&
			element.memberExclusionMatchList.some((memberMatch) => EXCLUSION_TEST_BY_STANDARD[element.standard](memberMatch, exclusionReport.exclusion)));
		matchingReportList.forEach((exclusionReport) => exclusionReport.removedElementStableIdList.push(element.elementStableId));
		return matchingReportList.length === 0;
	});
	return { keptElementList, exclusionReportList };
};

// allocateKindCounts — drawCount spread over kinds in proportion to the frame (largest remainder), each kind given at least
// min(minimumPerKindCount, its frame count); a kind never gets more than the frame has. Ties go to kindNameList order.
const allocateKindCounts = ({ kindCountByName, drawCount, minimumPerKindCount, kindNameList }) => {
	const presentKindNameList = kindNameList.filter((kindName) => (kindCountByName[kindName] || 0) > 0);
	const frameCount = presentKindNameList.reduce((soFar, kindName) => soFar + kindCountByName[kindName], 0);
	if (frameCount < drawCount) {
		throw new Error(`sampleBuilder.allocateKindCounts: the frame holds ${frameCount} elements, fewer than the ${drawCount} to draw`);
	}
	const quotaByKind = presentKindNameList.reduce((soFar, kindName) => ({ ...soFar, [kindName]: (drawCount * kindCountByName[kindName]) / frameCount }), {});
	const floorByKind = presentKindNameList.reduce((soFar, kindName) => ({ ...soFar, [kindName]: Math.min(minimumPerKindCount, kindCountByName[kindName]) }), {});
	const drawCountByKind = presentKindNameList.reduce((soFar, kindName) => ({ ...soFar, [kindName]: Math.max(floorByKind[kindName], Math.floor(quotaByKind[kindName])) }), {});
	const totalOf = () => presentKindNameList.reduce((soFar, kindName) => soFar + drawCountByKind[kindName], 0);
	while (totalOf() > drawCount) {
		// take back from the kind furthest above its quota that is still above its floor
		const donorKindName = presentKindNameList
			.filter((kindName) => drawCountByKind[kindName] > floorByKind[kindName])
			.sort((kindA, kindB) => (drawCountByKind[kindB] - quotaByKind[kindB]) - (drawCountByKind[kindA] - quotaByKind[kindA]) || kindNameList.indexOf(kindA) - kindNameList.indexOf(kindB))[0];
		drawCountByKind[donorKindName] -= 1;
	}
	while (totalOf() < drawCount) {
		const receiverKindName = presentKindNameList
			.filter((kindName) => drawCountByKind[kindName] < kindCountByName[kindName])
			.sort((kindA, kindB) => (quotaByKind[kindB] - drawCountByKind[kindB]) - (quotaByKind[kindA] - drawCountByKind[kindA]) || kindNameList.indexOf(kindA) - kindNameList.indexOf(kindB))[0];
		drawCountByKind[receiverKindName] += 1;
	}
	return drawCountByKind;
};

const elementListByKindOf = (elementList, kindNameList) =>
	kindNameList.reduce((soFar, kindName) => ({ ...soFar, [kindName]: elementList.filter((element) => element.kind === kindName) }), {});

// drawStandard — revision 2: two parts, MAPPED and UNMAPPED (drawConfig.drawCountByPart, 40 + 10), each kind-stratified on
// its own (drawConfig.minimumPerKindCountByPart: at least 4 per kind in the mapped part where available, none required
// in the unmapped part); each part's draw is a seeded shuffle within kind, its label naming standard, part and kind
const PART_NAME_LIST = Object.freeze(['mapped', 'unmapped']);
const partNameOf = (element) => (element.isMappedInGold ? 'mapped' : 'unmapped');

const drawStandard = ({ standardName, elementList, drawConfig }) => {
	const partReportByName = {};
	const drawnElementList = PART_NAME_LIST.reduce((soFar, partName) => {
		const partElementList = elementList.filter((element) => partNameOf(element) === partName);
		const elementListByKind = elementListByKindOf(partElementList, drawConfig.kindNameList);
		const kindCountByName = drawConfig.kindNameList.reduce((countSoFar, kindName) => ({ ...countSoFar, [kindName]: elementListByKind[kindName].length }), {});
		const drawCountByKind = allocateKindCounts({ kindCountByName, drawCount: drawConfig.drawCountByPart[partName], minimumPerKindCount: drawConfig.minimumPerKindCountByPart[partName], kindNameList: drawConfig.kindNameList });
		partReportByName[partName] = { frameCount: partElementList.length, kindCountByName, drawCountByKind };
		return soFar.concat(Object.keys(drawCountByKind).reduce((kindSoFar, kindName) =>
			kindSoFar.concat(seededShuffle(elementListByKind[kindName], drawConfig.sampleSeedText, `draw:${standardName}:${partName}:${kindName}`).slice(0, drawCountByKind[kindName])), []));
	}, []);
	return { drawnElementList, partReportByName };
};

// the layout the split and the deal walk: part by part, kind by kind, a seeded shuffle within each cell
const laidOutByPartAndKind = (elementList, drawConfig, labelText) =>
	PART_NAME_LIST.reduce((soFar, partName) => soFar.concat(drawConfig.kindNameList.reduce((kindSoFar, kindName) =>
		kindSoFar.concat(seededShuffle(elementList.filter((element) => partNameOf(element) === partName && element.kind === kindName).sort((elementA, elementB) => byText(elementA.elementStableId, elementB.elementStableId)), drawConfig.sampleSeedText, `${labelText}:${partName}:${kindName}`)), [])), []);

// splitDevSealed — kind-stratified 25/25: within each kind the drawn elements are shuffled, the kinds are laid end to end,
// and the halves alternate down that list from a seeded start, so each kind divides as evenly as its count allows
const splitDevSealed = ({ standardName, drawnElementList, drawConfig }) => {
	if (drawnElementList.length !== drawConfig.devSealedHalfCount * 2) {
		throw new Error(`sampleBuilder.splitDevSealed: ${standardName} drew ${drawnElementList.length} elements; the split needs exactly ${drawConfig.devSealedHalfCount * 2}`);
	}
	const laidOutList = laidOutByPartAndKind(drawnElementList, drawConfig, `split:${standardName}`);
	const startHalfName = seededShuffle(['dev', 'sealed'], drawConfig.sampleSeedText, `splitStart:${standardName}`)[0];
	const otherHalfName = startHalfName === 'dev' ? 'sealed' : 'dev';
	return laidOutList.map((element, position) => ({ ...element, splitHalf: position % 2 === 0 ? startHalfName : otherHalfName }));
};

// dealSurveys — all 150 laid out kind by kind (within a kind, a seeded shuffle across the three standards); each element goes
// to the survey that still has room for its standard (drawConfig.surveyStandardCountByName) and holds the fewest of its
// kind so far, then the fewest elements, then survey order. Greedy, and never stuck: a standard's remaining room always
// equals its remaining elements. So every survey gets each kind as evenly as the counts allow.
const dealSurveys = ({ drawnElementListByStandard, drawConfig }) => {
	const { surveyNameList, surveyStandardCountByName, standardNameList } = drawConfig;
	const allElementList = standardNameList.reduce((soFar, standardName) => soFar.concat(drawnElementListByStandard[standardName]), []);
	const laidOutList = laidOutByPartAndKind(allElementList, drawConfig, 'deal');
	const roomBySurveyAndStandard = surveyNameList.reduce((soFar, surveyName) => ({ ...soFar, [surveyName]: { ...surveyStandardCountByName[surveyName] } }), {});
	const kindCountBySurvey = surveyNameList.reduce((soFar, surveyName) => ({ ...soFar, [surveyName]: {} }), {});
	const totalCountBySurvey = surveyNameList.reduce((soFar, surveyName) => ({ ...soFar, [surveyName]: 0 }), {});
	const dealtList = laidOutList.map((element) => {
		const cellName = `${partNameOf(element)}:${element.kind}`;
		const surveyName = surveyNameList
			.filter((candidateSurveyName) => roomBySurveyAndStandard[candidateSurveyName][element.standard] > 0)
			.sort((surveyA, surveyB) => (kindCountBySurvey[surveyA][cellName] || 0) - (kindCountBySurvey[surveyB][cellName] || 0) || totalCountBySurvey[surveyA] - totalCountBySurvey[surveyB] || surveyNameList.indexOf(surveyA) - surveyNameList.indexOf(surveyB))[0];
		roomBySurveyAndStandard[surveyName][element.standard] -= 1;
		kindCountBySurvey[surveyName][cellName] = (kindCountBySurvey[surveyName][cellName] || 0) + 1;
		totalCountBySurvey[surveyName] += 1;
		return { ...element, surveyName };
	});
	return standardNameList.reduce((soFar, standardName) => ({ ...soFar, [standardName]: dealtList.filter((element) => element.standard === standardName) }), {});
};

module.exports = { PART_NAME_LIST, groupFrame, classifyKind, applyExclusions, allocateKindCounts, drawStandard, splitDevSealed, dealSurveys, KIND_TEST_BY_NAME };
