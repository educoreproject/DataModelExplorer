'use strict';

// elementMeaningFacts — THE ONE READER of what meanings an element takes part in (WORKORDER-meaningsClarity-111126, Addendum A; TQ 2026-11-11: "each element's page should
// match the info on its URI page"). The explorer (standards-neighbourhood: an element's node, and a meanings domain's level) and the /edc element page
// (humanPageFacts.js) both call it, so the two pages show the same sections with the same counts. Its sections, in the shared wording's order
// (html/components/standardsExplorer/meaningFactsWording.json, sectionNameList), each counting meanings (cards), never edges:
//   propertyMeanings  the property meanings whose domain it is
//   valueMeanings     the value meanings whose domain it is, one group per property meaning that holds them (and any no property meaning holds)
//   namingMeanings    the meanings of other domains that name it in another slot (as their range, property, value or qualifier), one group per own domain and
//                     first slot named in (the hub's slot order), so the groups sum to the section
//   ownTerm           its own term meanings
//   mappedTo          the meanings it is mapped to (its match edges)
// The Cypher is the walk's mapper's (named queries), so the walk's domain rows and these facts read one rule.
//
//   elementMeaningFactsFor({ mapper, runRows, elementStableId, readsInParallel }, done(errorText, { elementMeaningFacts, meaningRowsBySectionName }))
//     mapper: the standards-neighbourhood mapper (its getCypher and the meanings walk's ids); runRows(cypherText, cypherParameters, done(errorText, rowList)): plain rows
//     elementMeaningFacts: { hubName, isMeaningDomain, takesPartCount, meaningsWalkPathStableIdList, sectionList: [section] } — the field both pages draw
//       section: { sectionName, meaningCount, meaningsWalkPathStableIdList | null, ...its own lines: groupList (value or naming groups), unplacedMeaningCount, termList }
//     meaningRowsBySectionName: the listed rows, for a page that lists them: propertyMeanings [meaningRow + value counts], namingMeanings { itemCount, itemList },
//       ownTerm [meaningRow], mappedTo { itemCount, itemList }
// A count that the rows do not bear out is an error, by name: the facts never say a number the page's own lists contradict.

const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const meaningFactsWording = require('../../../html/components/standardsExplorer/meaningFactsWording.json');
const hubCardTupleRules = require('../standards-query/hubCardTupleRules.json');
// ⟪meaningsClarity, ruling 3⟫ the one wording function, shared with the explorer (an ES module, loaded by require on Node >= 22.12)
const { wordingOf } = require('../../../html/components/standardsExplorer/sharedWording.js');

const moduleName = 'elementMeaningFacts';

// a count from the driver may be a neo4j Integer
const numberOf = (countRead) => (typeof countRead === 'number' ? countRead : countRead.toNumber());

// a naming place (an incoming slot, mapper.INCOMING_SLOT_NAME_LIST, in the hub's slot order) in words, as hubCardTupleRules names each slot: RANGE is 'range'
const slotNameByNamingPlaceOf = (mapper) =>
	Object.fromEntries(mapper.INCOMING_SLOT_NAME_LIST.map((edgeSlotName) => [edgeSlotName, hubCardTupleRules.slotList.find((oneSlot) => oneSlot.edgeSlotName === edgeSlotName).slotName]));

// a slot in words: its slot name, as hubCardTupleRules names it ("range"), with its verb's number ("as its range", "as their range")
const slotWordOf = (slotName, meaningCount) => wordingOf(meaningFactsWording.namingSlotTemplateByCount[meaningCount === 1 ? 'one' : 'other'], { slotText: slotName });
// ⟪review S3⟫ what a naming group is, in words its linked level bears out: the holding meaning and its values, its values only (all or some of them), or values no
// property meaning holds
const namingGroupWhatTextOf = (oneGroup) => {
	if (!oneGroup.holderCardStableId) return wordingOf(meaningFactsWording.namingNoHolderTemplate, { valueCount: oneGroup.meaningCount });
	const valueCount = oneGroup.meaningCount - oneGroup.holderIncludedCount;
	if (oneGroup.holderIncludedCount) return valueCount ? wordingOf(meaningFactsWording.namingHolderAndValuesTemplate, { meaningName: oneGroup.holderName, valueCount }) : wordingOf(meaningFactsWording.namingHolderOnlyTemplate, { meaningName: oneGroup.holderName });
	return valueCount === oneGroup.holderValueCount
		? wordingOf(meaningFactsWording.namingAllValuesOfHolderTemplate, { meaningName: oneGroup.holderName, valueCount })
		: wordingOf(meaningFactsWording.namingSomeValuesOfHolderTemplate, { meaningName: oneGroup.holderName, valueCount, holderValueCount: oneGroup.holderValueCount });
};

// PURE: THE LINES BOTH PAGES SHOW, in the shared words: one line per section that holds a meaning (depth 0), its own lines beneath it (depth 1: a value section's groups
// by the property meaning holding them, a naming section's slots, an own-term section's terms), each with its count and its place in the Meanings explorer. The
// depth-1 lines of a section sum to its count. Both the explorer (MeaningFactsSection.vue) and the /edc element page (humanPage.js) draw exactly these.
const subLineListBySectionName = {
	valueMeanings: (oneSection) => [
		...oneSection.groupList.map((oneGroup) => ({
			lineName: 'valueGroup',
			lineText: [wordingOf(meaningFactsWording.valueGroupTemplate, { meaningName: oneGroup.name }), oneGroup.elementCount ? wordingOf(meaningFactsWording.valueGroupElementTemplate, { elementCountText: oneGroup.elementCount }) : ''].filter(Boolean).join(meaningFactsWording.lineDivider),
			meaningCount: oneGroup.meaningCount,
			meaningsWalkPathStableIdList: oneGroup.meaningsWalkPathStableIdList,
		})),
		...(oneSection.unplacedMeaningCount ? [{ lineName: 'valueGroup', lineText: meaningFactsWording.unplacedValueGroupText, meaningCount: oneSection.unplacedMeaningCount, meaningsWalkPathStableIdList: oneSection.unplacedMeaningsWalkPathStableIdList }] : []),
	],
	namingMeanings: (oneSection) =>
		oneSection.groupList.map((oneGroup) => ({
			lineName: 'namingGroup',
			lineText: [oneGroup.ownDomainName ? wordingOf(meaningFactsWording.namingGroupTemplate, { domainName: oneGroup.ownDomainName }) : meaningFactsWording.namingGroupNoDomainText, namingGroupWhatTextOf(oneGroup), slotWordOf(oneGroup.slotName, oneGroup.meaningCount)].join(meaningFactsWording.lineDivider),
			meaningCount: oneGroup.meaningCount,
			meaningsWalkPathStableIdList: oneGroup.meaningsWalkPathStableIdList,
		})),
	ownTerm: (oneSection) => oneSection.termList.map((oneTerm) => ({ lineName: 'ownTermCard', lineText: oneTerm.name, meaningCount: 1, meaningsWalkPathStableIdList: oneTerm.meaningsWalkPathStableIdList })),
};
const meaningFactLineListOf = (sectionList) =>
	sectionList
		.filter((oneSection) => oneSection.meaningCount > 0)
		.flatMap((oneSection) => [
			{ lineName: oneSection.sectionName, depth: 0, lineText: meaningFactsWording.sectionTitleByName[oneSection.sectionName], meaningCount: oneSection.meaningCount, meaningsWalkPathStableIdList: oneSection.meaningsWalkPathStableIdList },
			...(subLineListBySectionName[oneSection.sectionName] ? subLineListBySectionName[oneSection.sectionName](oneSection).map((oneLine) => ({ ...oneLine, depth: 1 })) : []),
		]);

// PURE: the place counts (elementMeaningPlaceCounts) and the rows → the facts. Exported, so a gate drives it with no graph.
const elementMeaningFactsOf = ({ mapper, elementStableId, placeCountList, namingCountList, propertyMeaningRowList, incomingRecord, termMeaningRowList, mappedRecord }) => {
	const slotNameOfPlace = slotNameByNamingPlaceOf(mapper);
	const placeCountOf = (filterOf) => placeCountList.filter(filterOf).reduce((soFar, onePlace) => soFar + numberOf(onePlace.meaningCount), 0);
	const propertyMeaningCount = placeCountOf((onePlace) => onePlace.placeSlotName === 'DOMAIN' && onePlace.referenceTier === mapper.MEANING_PROPERTY_TIER);
	const valueMeaningCount = placeCountOf((onePlace) => onePlace.placeSlotName === 'DOMAIN' && onePlace.referenceTier === mapper.MEANING_VALUE_TIER);
	const otherDomainMeaningCount = placeCountOf((onePlace) => onePlace.placeSlotName === 'DOMAIN' && onePlace.referenceTier !== mapper.MEANING_PROPERTY_TIER && onePlace.referenceTier !== mapper.MEANING_VALUE_TIER);
	const termMeaningCount = placeCountOf((onePlace) => onePlace.placeSlotName === 'TERM');
	const namingMeaningCount = placeCountOf((onePlace) => slotNameOfPlace[onePlace.placeSlotName] !== undefined);
	const namingGroupMeaningCount = namingCountList.reduce((soFar, oneGroup) => soFar + numberOf(oneGroup.meaningCount), 0);

	// every count said is the rows' own: a rule drift between the queries is refused by name
	const mismatchList = [
		otherDomainMeaningCount ? `${otherDomainMeaningCount} meaning(s) of a tier neither property nor value name it as their domain` : '',
		propertyMeaningCount !== propertyMeaningRowList.length ? `${propertyMeaningCount} property meanings placed, ${propertyMeaningRowList.length} listed` : '',
		namingMeaningCount !== numberOf(incomingRecord.itemCount) ? `${namingMeaningCount} naming meanings placed, ${incomingRecord.itemCount} listed` : '',
		namingMeaningCount !== namingGroupMeaningCount ? `${namingMeaningCount} naming meanings placed, ${namingGroupMeaningCount} counted by their own domain` : '',
		termMeaningCount !== termMeaningRowList.length ? `${termMeaningCount} own terms placed, ${termMeaningRowList.length} listed` : '',
	].filter(Boolean);
	const valueGroupMeaningCount = propertyMeaningRowList.reduce((soFar, oneRow) => soFar + numberOf(oneRow.valueMeaningCount), 0);
	if (valueGroupMeaningCount > valueMeaningCount) mismatchList.push(`${valueGroupMeaningCount} value meanings held by its property meanings, ${valueMeaningCount} placed in it`);
	if (mismatchList.length) return { errorText: `${moduleName}: the meaning facts of '${elementStableId}' do not reconcile: ${mismatchList.join('; ')}` };

	// the walk's places: one hub's walk (an element no hub's meaning names, or several hubs' meanings name, has no one place)
	const hubNameList = Array.from(new Set(placeCountList.map((onePlace) => onePlace.hubName)));
	const hubName = hubNameList.length === 1 ? hubNameList[0] : null;
	const isMeaningDomain = propertyMeaningCount > 0 || placeCountList.some((onePlace) => onePlace.placeSlotName === 'TERM' && mapper.meaningTermKindByLevel.meaningDomain.includes(onePlace.termKind));
	const domainLevelPath = hubName && isMeaningDomain ? mapper.meaningsWalkPathOf({ hubName, domainStableId: elementStableId }) : null;
	const meaningPathOf = (cardStableId) => {
		if (!hubName) return null;
		return isMeaningDomain ? mapper.meaningsWalkPathOf({ hubName, domainStableId: elementStableId, cardStableId }) : [mapper.MEANING_CATALOG_STABLE_ID, mapper.meaningIdOf(cardStableId)];
	};

	// ⟪review S3⟫ each naming group's place in the walk: the property meaning holding it (its level lists those values), or, held by none, its own domain's level
	const namingGroupList = namingCountList.map((oneGroup) => {
		const groupPath = !oneGroup.ownDomainStableId
			? null
			: mapper.meaningsWalkPathOf({ hubName: oneGroup.hubName, domainStableId: oneGroup.ownDomainStableId, ...(oneGroup.holderCardStableId ? { cardStableId: oneGroup.holderCardStableId } : {}) });
		return {
			ownDomainStableId: oneGroup.ownDomainStableId || null,
			ownDomainName: oneGroup.ownDomainName || null,
			slotName: slotNameOfPlace[oneGroup.placeSlotName],
			meaningCount: numberOf(oneGroup.meaningCount),
			holderCardStableId: oneGroup.holderCardStableId || null,
			holderName: oneGroup.holderName || null,
			holderIncludedCount: numberOf(oneGroup.holderIncludedCount),
			holderValueCount: numberOf(oneGroup.holderValueCount),
			meaningsWalkPathStableIdList: groupPath,
		};
	});
	const termPathList = termMeaningRowList.map((oneRow) => meaningPathOf(oneRow.cardStableId));

	const valueGroupList = propertyMeaningRowList
		.filter((oneRow) => numberOf(oneRow.valueMeaningCount) > 0)
		.map((oneRow) => ({ cardStableId: oneRow.cardStableId, name: oneRow.name, meaningCount: numberOf(oneRow.valueMeaningCount), elementCount: numberOf(oneRow.valueElementCount), meaningsWalkPathStableIdList: meaningPathOf(oneRow.cardStableId) }));
	const sectionByName = {
		propertyMeanings: { meaningCount: propertyMeaningCount, mappedMeaningCount: propertyMeaningRowList.filter((oneRow) => numberOf(oneRow.mappedElementCount) > 0).length, meaningsWalkPathStableIdList: domainLevelPath },
		valueMeanings: {
			meaningCount: valueMeaningCount,
			groupList: valueGroupList,
			unplacedMeaningCount: valueMeaningCount - valueGroupMeaningCount,
			// values no property meaning holds are listed nowhere but the domain's own level
			unplacedMeaningsWalkPathStableIdList: domainLevelPath,
			// ⟪review S3⟫ the one meaning holding them all, whose level lists them; held by several (or some by none), the lines beneath link each
			meaningsWalkPathStableIdList: valueGroupList.length === 1 && valueGroupMeaningCount === valueMeaningCount ? valueGroupList[0].meaningsWalkPathStableIdList : null,
		},
		namingMeanings: {
			meaningCount: namingMeaningCount,
			groupList: namingGroupList,
			// a domain's are drawn on its own level; any other element's live only in their own domains, so its section opens one place only when they share one
			meaningsWalkPathStableIdList: domainLevelPath || (namingGroupList.length === 1 ? namingGroupList[0].meaningsWalkPathStableIdList : null),
		},
		ownTerm: {
			meaningCount: termMeaningCount,
			termList: termMeaningRowList.map((oneRow, rowIndex) => ({ cardStableId: oneRow.cardStableId, name: oneRow.name, meaningsWalkPathStableIdList: termPathList[rowIndex] })),
			meaningsWalkPathStableIdList: termPathList.length === 1 ? termPathList[0] : domainLevelPath,
		},
		mappedTo: { meaningCount: numberOf(mappedRecord.itemCount), meaningsWalkPathStableIdList: null },
	};
	const sectionList = meaningFactsWording.sectionNameList.map((sectionName) => {
		if (!sectionByName[sectionName]) throw new Error(`${moduleName}: the shared wording names a section '${sectionName}' this reader does not build (${Object.keys(sectionByName).join(', ')})`);
		return { sectionName, ...sectionByName[sectionName] };
	});
	return {
		elementMeaningFacts: {
			hubName,
			isMeaningDomain,
			takesPartCount: sectionList.reduce((soFar, oneSection) => soFar + oneSection.meaningCount, 0),
			meaningsWalkPathStableIdList: domainLevelPath,
			sectionList,
			lineList: meaningFactLineListOf(sectionList),
		},
	};
};

// the reads the facts need, each a named query of the mapper and the shape its rows are kept in. They are independent of each other.
const FACT_READ_LIST = Object.freeze([
	{ queryName: 'elementMeaningPlaceCounts', resultName: 'placeCountList', shapeOf: (rowList) => rowList },
	{ queryName: 'namingMeaningCountsByElementStableId', resultName: 'namingCountList', shapeOf: (rowList) => rowList },
	{ queryName: 'meaningsByDomainStableId', resultName: 'propertyMeaningRowList', shapeOf: (rowList) => rowList.map((oneRow) => ({ ...oneRow.meaningRow, valueMeaningCount: oneRow.valueMeaningCount, valueElementCount: oneRow.valueElementCount })) },
	// a query capped with its true count answers no row when there is nothing: a count of 0
	{ queryName: 'incomingMeaningsByElementStableId', resultName: 'incomingRecord', shapeOf: (rowList) => rowList[0] || { itemCount: 0, itemList: [] } },
	{ queryName: 'termMeaningsByElementStableId', resultName: 'termMeaningRowList', shapeOf: (rowList) => rowList.map((oneRow) => oneRow.meaningRow) },
	{ queryName: 'mappedMeaningsByElementStableId', resultName: 'mappedRecord', shapeOf: (rowList) => rowList[0] || { itemCount: 0, itemList: [] } },
]);

// ⟪review S4⟫ readsInParallel (required, no default): true when runRows opens its own session per query (the golden handle's runQuery), so the reads go out at once
// and the facts cost their slowest read, not their sum; false when runRows shares one driver session (the /edc page's), which runs one query at a time
const elementMeaningFactsFor = ({ mapper, runRows, elementStableId, readsInParallel }, done) => {
	if (typeof readsInParallel !== 'boolean') throw new Error(`${moduleName}: readsInParallel must be true or false (received ${JSON.stringify(readsInParallel)})`);
	const readOne = (oneRead, next) => {
		const { cypher, params } = mapper.getCypher(oneRead.queryName, { elementStableId, domainStableId: elementStableId });
		runRows(cypher, params, (queryError, rowList) => next(queryError ? `${moduleName}: ${oneRead.queryName}: ${queryError}` : '', queryError ? null : oneRead.shapeOf(rowList || [])));
	};
	const whenAllRead = (readError, resultByName) => {
		if (readError) {
			done(readError);
			return;
		}
		const { placeCountList, namingCountList, propertyMeaningRowList, incomingRecord, termMeaningRowList, mappedRecord } = resultByName;
		const factsAnswer = elementMeaningFactsOf({ mapper, elementStableId, placeCountList, namingCountList, propertyMeaningRowList, incomingRecord, termMeaningRowList, mappedRecord });
		if (factsAnswer.errorText) {
			done(factsAnswer.errorText);
			return;
		}
		done('', { elementMeaningFacts: factsAnswer.elementMeaningFacts, meaningRowsBySectionName: { propertyMeanings: propertyMeaningRowList, namingMeanings: incomingRecord, ownTerm: termMeaningRowList, mappedTo: mappedRecord } });
	};
	if (!readsInParallel) {
		const taskList = new taskListPlus();
		FACT_READ_LIST.forEach((oneRead) => taskList.push((args, next) => readOne(oneRead, (readError, shapedResult) => next(readError, { ...args, [oneRead.resultName]: shapedResult }))));
		pipeRunner(taskList.getList(), {}, whenAllRead);
		return;
	}
	// all at once: the first failure answers, later answers are ignored; the facts are built when every read is in
	const resultByName = {};
	let outstandingCount = FACT_READ_LIST.length;
	let hasAnswered = false;
	FACT_READ_LIST.forEach((oneRead) =>
		readOne(oneRead, (readError, shapedResult) => {
			if (hasAnswered) return;
			if (readError) {
				hasAnswered = true;
				whenAllRead(readError);
				return;
			}
			resultByName[oneRead.resultName] = shapedResult;
			outstandingCount -= 1;
			if (outstandingCount === 0) {
				hasAnswered = true;
				whenAllRead('', resultByName);
			}
		}),
	);
};

module.exports = { elementMeaningFactsFor, elementMeaningFactsOf, meaningFactLineListOf, slotWordOf };
