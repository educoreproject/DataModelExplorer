'use strict';

// answerSummaries — what rowDetail=summary makes of a verb's finished answer: small enough for a model to read, still answering the question, and saying by count what it left out. Pure: it reads the
// full answer and builds a new object. The field lists and caps are DATA in the registry (summaryShape); nothing here names a field to keep. What was left out is computed by comparing the summary with
// the full answer, never typed, so a field added to the full answer later shows up as left out rather than vanishing.
//
//   THE SHAPER INTERFACE: shaper({ answer, summaryShape }) → the summary object. A registry row names its shaper in summaryShaperName; a new kind of summary is one line in SUMMARY_SHAPER_BY_NAME.
//   A full answer's row names the same field the same way here (fromName, fromUri, toId): a reader moving between the two forms learns one vocabulary.

const OWN_ROW_DIRECTION_LIST = Object.freeze(['outgoing', 'outgoingViaInstance']);
const EDGE_TYPE_OF_MATCH_PATTERN = /_MATCH$/;
const SUMMARY_ROW_DETAIL_NAME = 'summary';

const pickFields = (sourceObject, fieldNameList) => fieldNameList.reduce((soFar, fieldName) => (sourceObject[fieldName] === undefined ? soFar : { ...soFar, [fieldName]: sourceObject[fieldName] }), {});
const countInto = (countByName, nameText) => ({ ...countByName, [nameText]: (countByName[nameText] || 0) + 1 });
const URI_COMPANION_NAME_PATTERN = /UriKind$|ResolvesHere$|^uriKind$|^resolvesHere$/;
const fieldNamesOutside = (objectList, keptFieldNameList) => [...new Set(objectList.flatMap((oneObject) => Object.keys(oneObject)))].filter((fieldName) => !keptFieldNameList.includes(fieldName) && !URI_COMPANION_NAME_PATTERN.test(fieldName)).sort();

// every standard gets a turn before any standard gets two, so a cap on a long list still shows which standards are in it
const takeRoundRobin = (itemList, groupNameOf, itemCap) => {
	const itemListByGroup = itemList.reduce((soFar, oneItem) => {
		const groupName = groupNameOf(oneItem);
		return { ...soFar, [groupName]: [...(soFar[groupName] || []), oneItem] };
	}, {});
	const groupList = Object.values(itemListByGroup);
	const takenList = [];
	for (let turnIndex = 0; takenList.length < Math.min(itemCap, itemList.length); turnIndex += 1) {
		groupList.forEach((groupItemList) => {
			if (groupItemList[turnIndex] !== undefined && takenList.length < itemCap) {
				takenList.push(groupItemList[turnIndex]);
			}
		});
	}
	return takenList;
};

const declaredCorrespondenceFieldsOf = ({ answer, summaryShape }) => {
	const shownList = answer.declaredCorrespondenceList.slice(0, summaryShape.declaredCorrespondenceListCap);
	return {
		declaredCorrespondenceCount: answer.declaredCorrespondenceCount,
		declaredCorrespondenceList: shownList,
		...(shownList.length > 0 ? { declaredCorrespondenceRowUnit: answer.declaredCorrespondenceRowUnit } : {}),
	};
};

// the uriNote states the rule (an edc uri, resolving here); a row says so only when it is the exception
const withoutUsualUriFacts = (oneElement) => {
	const { uriKind, resolvesHere, ...elementFacts } = oneElement;
	return resolvesHere === true ? elementFacts : oneElement;
};

const cardUrisOfRow = (oneRow) => [...(oneRow.uri ? [oneRow.uri] : []), ...(oneRow.cardList || []).map((oneCard) => oneCard.uri)];
const hubCardNameOf = ({ hubName, toId }) => `${hubName}\u0000${toId}`;

// a row names its card by (hubName, toId). Where that pair is one card, the card's uri sits once in hubTupleSummaryList; where it stands for several, the row keeps its own uri, since only the row can say which
const cardFactsOf = (rowList) => {
	const cardUriSetByHubCard = rowList.reduce((soFar, oneRow) => {
		const hubCardName = hubCardNameOf(oneRow);
		return { ...soFar, [hubCardName]: new Set([...(soFar[hubCardName] || []), ...cardUrisOfRow(oneRow)]) };
	}, {});
	return { cardUriSetByHubCard, isAmbiguous: (oneRow) => (cardUriSetByHubCard[hubCardNameOf(oneRow)] || new Set()).size > 1 };
};

// the verb's list is capped and a row can reach a card past that cap: such a card joins the list with what the row knows, so no card a row names is left without its uri
const hubTupleListWithRowCards = ({ answer, cardUriSetByHubCard }) => {
	const listedNameSet = new Set((answer.hubTupleSummaryList || []).map(hubCardNameOf));
	const unlistedRowList = answer.mappingRowList.filter((oneRow, rowIndex, rowList) => !listedNameSet.has(hubCardNameOf(oneRow)) && rowList.findIndex((otherRow) => hubCardNameOf(otherRow) === hubCardNameOf(oneRow)) === rowIndex);
	return [
		...(answer.hubTupleSummaryList || []),
		...unlistedRowList.map((oneRow) => ({ toId: oneRow.toId, toName: oneRow.toName, hubName: oneRow.hubName, cardUriList: [...cardUriSetByHubCard[hubCardNameOf(oneRow)]].sort() })),
	];
};

const rowCountsOfStandard = ({ answer, hubName, standardName }) => {
	const rowCountByRelation = {};
	Object.entries((answer.totalRowCountByHubRelationAndStandard || {})[hubName] || {}).forEach(([relationName, rowCountByStandard]) => {
		if (rowCountByStandard[standardName] !== undefined) {
			rowCountByRelation[relationName] = rowCountByStandard[standardName];
		}
	});
	return { rowCount: Object.values(rowCountByRelation).reduce((soFar, oneCount) => soFar + oneCount, 0), rowCountByRelation };
};

// a row reaching several cards (only through instances, and no winner is picked) counts them: their uris are in hubTupleSummaryList under the row's (hubName, toId)
const cardUriFieldsOf = (oneRow) => (oneRow.cardList ? { cardUriCount: oneRow.cardList.length } : pickFields(oneRow, ['uri']));
const rowOfStandardOf = ({ oneRow, isAmbiguous, summaryShape }) => ({ ...pickFields(oneRow, summaryShape.standardRowFieldList), ...(isAmbiguous(oneRow) || oneRow.cardList ? cardUriFieldsOf(oneRow) : {}) });

// which standards hold equivalents and how many (over every row, shown or not), with the shown rows under their standard, so a long standard name is written once
const standardCountListOf = ({ answer, otherRowList, isAmbiguous, summaryShape }) => {
	const shownOtherRowList = takeRoundRobin(otherRowList, (oneRow) => `${oneRow.hubName}\u0000${oneRow.fromSource}`, summaryShape.shownRowCap);
	const hubNameList = Object.keys(answer.totalRowCountByHubRelationAndStandard || {});
	return hubNameList.flatMap((hubName) => {
		const standardNameSet = new Set(Object.values(answer.totalRowCountByHubRelationAndStandard[hubName]).flatMap((rowCountByStandard) => Object.keys(rowCountByStandard)));
		return [...standardNameSet].sort().map((standardName) => {
			const shownRowList = shownOtherRowList.filter((oneRow) => oneRow.hubName === hubName && oneRow.fromSource === standardName).map((oneRow) => rowOfStandardOf({ oneRow, isAmbiguous, summaryShape }));
			return { hubName, standard: standardName, ...rowCountsOfStandard({ answer, hubName, standardName }), shownRowList };
		});
	});
};

const mappingsSummaryOf = ({ answer, summaryShape }) => {
	const rowList = answer.mappingRowList;
	const ownRowList = rowList.filter((oneRow) => OWN_ROW_DIRECTION_LIST.includes(oneRow.direction));
	const shownOwnRowList = ownRowList.slice(0, summaryShape.ownRowCap);
	const otherRowList = rowList.filter((oneRow) => !OWN_ROW_DIRECTION_LIST.includes(oneRow.direction));
	const { cardUriSetByHubCard, isAmbiguous } = cardFactsOf(rowList);
	const matchedElementShownList = takeRoundRobin(answer.matchedElementList, (oneElement) => oneElement.standard, summaryShape.matchedElementListCap).map((oneElement) => withoutUsualUriFacts(pickFields(oneElement, summaryShape.matchedElementFieldList)));
	const keptRowFieldNameSet = new Set([...(ownRowList.length > 0 ? [...summaryShape.ownRowFieldList, 'mappingRationale'] : []), ...summaryShape.standardRowFieldList, 'uri', 'cardList']);
	const summaryBody = {
		rowDetail: SUMMARY_ROW_DETAIL_NAME,
		...pickFields(answer, summaryShape.mappingsTopFieldList),
		rowUnit: summaryShape.mappingRowUnit,
		matchedElementCountByStandard: answer.matchedElementList.reduce((soFar, oneElement) => countInto(soFar, oneElement.standard), {}),
		matchedElementList: matchedElementShownList,
		hubTupleSummaryList: hubTupleListWithRowCards({ answer, cardUriSetByHubCard }).map((oneTuple) => pickFields(oneTuple, summaryShape.hubTupleFieldList)),
		ownMappingRowList: shownOwnRowList.map((oneRow, rowIndex) => ({ ...pickFields(oneRow, summaryShape.ownRowFieldList), ...(rowIndex < summaryShape.ownRowRationaleCap ? pickFields(oneRow, ['mappingRationale']) : {}), ...cardUriFieldsOf(oneRow) })),
		standardCountList: standardCountListOf({ answer, otherRowList, isAmbiguous, summaryShape }),
		...declaredCorrespondenceFieldsOf({ answer, summaryShape }),
		standardElementListByName: answer.standardElementListByName,
	};
	const shownOtherRowCount = summaryBody.standardCountList.reduce((soFar, oneStandard) => soFar + oneStandard.shownRowList.length, 0);
	const shownAssertionUriCount = summaryBody.ownMappingRowList.filter((oneRow) => oneRow.assertion).length;
	const assertionUriCount = (oneRow) => (oneRow.assertion ? 1 : 0) + (oneRow.assertionList || []).length + (oneRow.cardList || []).reduce((soFar, oneCard) => soFar + (oneCard.assertion ? 1 : 0) + (oneCard.assertionList || []).length, 0);
	return {
		...summaryBody,
		leftOutOfSummary: {
			howToAsk: summaryShape.howToAskForFull,
			matchedElementsNotListed: answer.matchedNodeCount - matchedElementShownList.length,
			rowsTheFullAnswerShowsAndThisDoesNot: rowList.length - shownOwnRowList.length - shownOtherRowCount,
			matchedElementsTheFullAnswerAlsoOmits: answer.matchedNodeCount - answer.matchedElementList.length,
			rationalesNotShown: rowList.filter((oneRow) => oneRow.mappingRationale).length - summaryBody.ownMappingRowList.filter((oneRow) => oneRow.mappingRationale).length,
			assertionUrisNotShown: rowList.reduce((soFar, oneRow) => soFar + assertionUriCount(oneRow), 0) - shownAssertionUriCount,
			questionUrisNotShown: rowList.filter((oneRow) => oneRow.question).length,
			declaredCorrespondencesNotListed: answer.declaredCorrespondenceList.length - summaryBody.declaredCorrespondenceList.length,
			rowsTheFullAnswerAlsoOmits: answer.truncatedRowCount,
			rowFieldNameList: fieldNamesOutside(rowList, [...keptRowFieldNameSet]),
			answerFieldNameList: fieldNamesOutside([answer], Object.keys(summaryBody)),
		},
	};
};

const edgeCountByTypeOf = (edgeList) => edgeList.reduce((soFar, oneEdge) => countInto(soFar, oneEdge.type), {});
const mappingEdgesOf = (oneEntry) => oneEntry.outgoing.filter((oneEdge) => EDGE_TYPE_OF_MATCH_PATTERN.test(oneEdge.type));

// few entries: each says what it is and which cards it reaches. Many: each says only which element it is, and hubCardList says which cards they reach between them. Either way every entry keeps its uri.
const entryIdentityOf = ({ oneEntry, summaryShape }) => ({ ...withoutUsualUriFacts(pickFields(oneEntry, summaryShape.entryUriFieldList)), ...pickFields(oneEntry.node, summaryShape.entryNodeFieldList) });
const detailedEntryOf = ({ oneEntry, summaryShape }) => ({
	...entryIdentityOf({ oneEntry, summaryShape }),
	...pickFields(oneEntry, summaryShape.detailedEntryFieldList),
	...pickFields(oneEntry.node, summaryShape.detailedEntryNodeFieldList),
	outgoingCountByType: edgeCountByTypeOf(oneEntry.outgoing),
	incomingCountByType: edgeCountByTypeOf(oneEntry.incoming),
	mappingEdgeList: mappingEdgesOf(oneEntry).map((oneEdge) => pickFields(oneEdge, summaryShape.mappingEdgeFieldList)),
});

const hubCardListOf = (entryList) => {
	const hubCardByUri = {};
	entryList.forEach((oneEntry) => mappingEdgesOf(oneEntry).forEach(({ targetSource, target, targetUri, type }) => {
		const hubCard = hubCardByUri[targetUri] || { hubName: targetSource, name: target, uri: targetUri, entryEdgeCountByType: {} };
		hubCardByUri[targetUri] = { ...hubCard, entryEdgeCountByType: countInto(hubCard.entryEdgeCountByType, type) };
	}));
	return Object.values(hubCardByUri);
};

const elementSummaryOf = ({ answer, summaryShape }) => {
	const isDetailed = answer.entryList.length <= summaryShape.detailedEntryCap;
	const entryShaper = isDetailed ? detailedEntryOf : entryIdentityOf;
	const edgeCount = answer.entryList.reduce((soFar, oneEntry) => soFar + oneEntry.outgoing.length + oneEntry.incoming.length, 0);
	const listedEdgeCount = isDetailed ? answer.entryList.reduce((soFar, oneEntry) => soFar + mappingEdgesOf(oneEntry).length, 0) : 0;
	const summaryBody = {
		rowDetail: SUMMARY_ROW_DETAIL_NAME,
		...pickFields(answer, summaryShape.elementTopFieldList),
		entryCountByStandard: answer.entryList.reduce((soFar, oneEntry) => countInto(soFar, oneEntry.node._source), {}),
		hubCardList: hubCardListOf(answer.entryList),
		entryList: answer.entryList.map((oneEntry) => entryShaper({ oneEntry, summaryShape })),
		...declaredCorrespondenceFieldsOf({ answer, summaryShape }),
		standardElementListByName: answer.standardElementListByName,
	};
	return {
		...summaryBody,
		leftOutOfSummary: {
			howToAsk: summaryShape.howToAskForFull,
			edgesNotListed: edgeCount - listedEdgeCount,
			descriptionsNotShown: isDetailed ? 0 : answer.entryList.filter((oneEntry) => oneEntry.node.description).length,
			declaredCorrespondencesNotListed: answer.declaredCorrespondenceList.length - summaryBody.declaredCorrespondenceList.length,
			nodeFieldNameList: fieldNamesOutside(answer.entryList.map((oneEntry) => oneEntry.node), [...summaryShape.entryNodeFieldList, ...(isDetailed ? summaryShape.detailedEntryNodeFieldList : [])]),
			answerFieldNameList: fieldNamesOutside([answer], Object.keys(summaryBody)),
		},
	};
};

const graphSummaryOf = ({ answer, summaryShape }) => {
	const summaryBody = {
		rowDetail: SUMMARY_ROW_DETAIL_NAME,
		whatThisGraphCanDo: summaryShape.whatThisGraphCanDoLineList,
		passport: pickFields(answer.passport, summaryShape.passportFieldList),
		recipe: pickFields(answer.recipe, summaryShape.recipeFieldList),
		lineage: answer.lineage,
		blockTotal: answer.blockTotal,
		blockCountByKind: answer.blocks.reduce((soFar, oneBlock) => countInto(soFar, oneBlock.kind), {}),
		attestations: answer.attestations.map((oneAttestation) => pickFields(oneAttestation, summaryShape.attestationFieldList)),
		standards: answer.standards.map((oneStandard) => pickFields(oneStandard, summaryShape.standardFieldList)),
	};
	return {
		...summaryBody,
		leftOutOfSummary: {
			howToAsk: summaryShape.howToAskForFullGraph,
			blocksNotListed: answer.blocks.length,
			standardUsageTipsNotShown: answer.standards.filter((oneStandard) => oneStandard.standardUsageTips).length,
			cardCharacterCount: answer.card.length,
			passportFieldNameList: fieldNamesOutside([answer.passport], summaryShape.passportFieldList),
			standardFieldNameList: fieldNamesOutside(answer.standards, summaryShape.standardFieldList),
			attestationFieldNameList: fieldNamesOutside(answer.attestations, summaryShape.attestationFieldList),
			answerFieldNameList: fieldNamesOutside([answer], Object.keys(summaryBody)),
		},
	};
};

// how many candidates each pool shows: as many as fit the byte budget, between the shape's floor and ceiling, so a short submission reads more of each pool
const shownPerPoolOf = ({ poolCount, summaryShape }) => Math.max(summaryShape.retrievalShownPerPoolMin, Math.min(summaryShape.retrievalShownPerPoolMax, Math.floor(summaryShape.retrievalAnswerByteBudget / (Math.max(poolCount, 1) * summaryShape.retrievalCandidateBytesEstimate))));

// a pool's first candidates by rank, and the best cosine among them always: vote-first ranking can leave the closest text behind, and a reader must see it. The rank field says where it stood.
const shownCandidatesOf = ({ onePool, shownPerPool, summaryShape }) => {
	const cosineRankOne = onePool.cosineRankOneOutsidePool || onePool.candidateList.find((oneCandidate) => oneCandidate.rankByCosine === 1);
	const firstList = onePool.candidateList.slice(0, shownPerPool);
	const shownList = cosineRankOne && !firstList.some((oneCandidate) => oneCandidate.uri === cosineRankOne.uri) ? [...firstList.slice(0, shownPerPool - 1), cosineRankOne] : firstList;
	return shownList.map((oneCandidate) => pickFields(oneCandidate, summaryShape.retrievalCandidateFieldList));
};

const rosettaRetrievalSummaryOf = ({ answer, summaryShape }) => {
	const poolRowList = answer.fieldList.flatMap((oneField) => Object.values(oneField.byHub));
	const shownPerPool = shownPerPoolOf({ poolCount: poolRowList.length, summaryShape });
	let candidatesShownCount = 0;
	const fieldList = answer.fieldList.map((oneField) => ({
		...pickFields(oneField, summaryShape.retrievalFieldFieldList),
		byHub: Object.keys(oneField.byHub).reduce((soFar, hubName) => {
			const onePool = oneField.byHub[hubName];
			const topCandidateList = shownCandidatesOf({ onePool, shownPerPool, summaryShape });
			candidatesShownCount += topCandidateList.length;
			return { ...soFar, [hubName]: { ...pickFields(onePool, summaryShape.retrievalPoolFieldList), topCandidateList } };
		}, {}),
	}));
	const everyCandidateList = poolRowList.flatMap((onePool) => onePool.candidateList);
	const { fieldList: unusedFieldList, ...restOfAnswer } = answer;
	return {
		rowDetail: SUMMARY_ROW_DETAIL_NAME,
		...restOfAnswer,
		fieldList,
		leftOutOfSummary: {
			howToAsk: summaryShape.howToAskForFullRetrieval,
			shownPerPool,
			candidatesNotShown: everyCandidateList.length + poolRowList.filter((onePool) => onePool.cosineRankOneOutsidePool).length - candidatesShownCount,
			candidateFieldNameList: fieldNamesOutside(everyCandidateList, summaryShape.retrievalCandidateFieldList),
			fieldFieldNameList: fieldNamesOutside(answer.fieldList, [...summaryShape.retrievalFieldFieldList, 'byHub']),
			...(answer.fieldList.length > summaryShape.retrievalReadableFieldCount ? { sizeAdvice: summaryShape.retrievalOverReadableAdvice.replace('{readableFieldCount}', String(summaryShape.retrievalReadableFieldCount)) } : {}),
		},
	};
};

// one short line per field per hub: the category and the card's label, or the unit's status. A notJudged line carries its reason, so it never reads as the judge declining, and a cut answer says so. URIs outside a draft stay in full: a line a reader might quote as a mapping should be asked for whole.
const judgedLineOf = ({ hubName, oneUnit, labelChars }) => {
	const cutMark = oneUnit.answerWasCut ? ' (cut)' : '';
	if (oneUnit.proposal) {
		const { category, label } = oneUnit.proposal;
		const labelText = label || '';
		return `${hubName} ${labelChars === 0 || !labelText ? category : `${category}: ${labelText.length > labelChars ? `${labelText.slice(0, labelChars)}…` : labelText}`}${cutMark}`;
	}
	return `${hubName} ${oneUnit.notJudgedReason ? `${oneUnit.status} (${oneUnit.notJudgedReason})` : oneUnit.status}${cutMark}`;
};
const nonZeroCountsOf = (countByName) => Object.keys(countByName).filter((countName) => countByName[countName] > 0).reduce((soFar, countName) => ({ ...soFar, [countName]: countByName[countName] }), {});
const LIST_COUNT_NAME_BY_LIST_NAME = Object.freeze({ unresolvedRefList: 'unresolvedRefOmittedCount', unresolvedContextList: 'unresolvedContextOmittedCount', notWalkedList: 'notWalkedOmittedCount' });

// A SUMMARY MUST HOLD ITS BOUND, WHATEVER WAS SUBMITTED. The drafts come first and each strong line is a long uri, so what gives way, in order: the labels' length, the labels, then the drafts, then the length of the names. Each step says so in leftOutOfSummary, and a list of what the walk could not read is a count here and whole in the full form. A line is a list, its first member the field's name exactly as sent, so a name cannot write a verdict.
const rosettaFetchSummaryOf = ({ answer, summaryShape }) => {
	const { fieldList, answeredFromAtSubmit: unusedAnsweredFrom, strongEvidenceNote: unusedEvidenceNote, rationaleNote: unusedRationaleNote, counts, job: { unitNote: unusedUnitNote, hubList: unusedHubList, submittedAt: unusedSubmittedAt, startedAt: unusedStartedAt, ...jobFacts }, judge: { promptVariant: unusedPromptVariant, ...judgeFacts }, draftContextByHub, leftOutOfDraftList = [], ...restOfAnswer } = answer;
	const reportBody = Object.keys(LIST_COUNT_NAME_BY_LIST_NAME).reduce((soFar, listName) => {
		const { [listName]: unusedList, [LIST_COUNT_NAME_BY_LIST_NAME[listName]]: unusedCount, ...withoutList } = soFar;
		return withoutList;
	}, restOfAnswer);
	const listCountByName = Object.keys(LIST_COUNT_NAME_BY_LIST_NAME).reduce((soFar, listName) => {
		const rowCount = (answer[listName] || []).length + (answer[LIST_COUNT_NAME_BY_LIST_NAME[listName]] || 0);
		return rowCount > 0 ? { ...soFar, [listName.replace('List', 'Count')]: rowCount } : soFar;
	}, {});
	const everyUnitList = fieldList.flatMap((oneField) => Object.values(oneField.byHub));
	const proposalCount = everyUnitList.filter((oneUnit) => oneUnit.proposal).length;
	const summaryAt = ({ labelChars, showDrafts, nameChars }) => ({
		rowDetail: SUMMARY_ROW_DETAIL_NAME,
		job: jobFacts,
		judge: judgeFacts,
		...reportBody,
		counts: { byHub: Object.keys(counts.byHub).reduce((soFar, hubName) => ({ ...soFar, [hubName]: nonZeroCountsOf(counts.byHub[hubName]) }), {}) },
		...(showDrafts ? { draftContextByHub } : {}),
		fieldLineNote: summaryShape.judgedFieldLineNote,
		fieldLineList: fieldList.map((oneField) => [nameChars && oneField.name.length > nameChars ? `${oneField.name.slice(0, nameChars)}…` : oneField.name, ...Object.keys(oneField.byHub).map((hubName) => judgedLineOf({ hubName, oneUnit: oneField.byHub[hubName], labelChars }))]),
		leftOutOfSummary: {
			howToAsk: summaryShape.howToAskForFullJudged,
			rationalesNotShown: everyUnitList.filter((oneUnit) => oneUnit.judgesRationale).length,
			proposalUrisNotShown: proposalCount,
			...(labelChars === 0 && proposalCount > 0 ? { proposalLabelsNotShown: proposalCount } : {}),
			...(showDrafts ? {} : { draftsNotShown: summaryShape.judgedDraftsNotShownText }),
			...(nameChars ? { namesCutAtCharacters: nameChars } : {}),
			...(leftOutOfDraftList.length ? { termsLeftOutOfDrafts: leftOutOfDraftList.length } : {}),
			...listCountByName,
			runnerUpsNotShown: everyUnitList.reduce((soFar, oneUnit) => soFar + (oneUnit.runnerUpList || []).length, 0),
			definitionsNotShown: fieldList.filter((oneField) => oneField.definition).length,
		},
	});
	const bytesOf = (summaryForm) => Buffer.byteLength(JSON.stringify(summaryForm));
	const roomPerProposal = Math.floor((summaryShape.judgedAnswerByteBudget - bytesOf(summaryAt({ labelChars: 0, showDrafts: true }))) / Math.max(proposalCount, 1));
	const labelChars = Math.min(summaryShape.judgedLineLabelChars, roomPerProposal) >= summaryShape.judgedLineLabelCharsMin ? Math.min(summaryShape.judgedLineLabelChars, roomPerProposal) : 0;
	const formList = [{ labelChars, showDrafts: true }, { labelChars: 0, showDrafts: true }, { labelChars: 0, showDrafts: false }, { labelChars: 0, showDrafts: false, nameChars: summaryShape.judgedLineNameCharsWhenShort }];
	const fittingForm = formList.find((oneForm) => bytesOf(summaryAt(oneForm)) <= summaryShape.judgedAnswerByteBudget);
	return summaryAt(fittingForm || formList[formList.length - 1]);
};

const SUMMARY_SHAPER_BY_NAME = Object.freeze({ mappings: mappingsSummaryOf, element: elementSummaryOf, graph: graphSummaryOf, rosettaRetrieval: rosettaRetrievalSummaryOf, rosettaFetch: rosettaFetchSummaryOf });

module.exports = { SUMMARY_SHAPER_BY_NAME };
