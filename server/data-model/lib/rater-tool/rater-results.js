'use strict';

// rater-results.js — revision 4: the admin Results page's aggregation, pure (no store, no clock). One block per target
// (every sampled element, answered or not); one row per distinct answer: each card anyone chose as Best or ticked as
// Same, plus No match and Unsure, with how many raters chose it as Best and (cards only) how many ticked it Same.
//
// Counting rules (TQ via COPPER_RIVER, WORKORDER-RATER4):
//   - assigned = the current rater accounts on the target's survey; answered = how many of THEM have a saved answer for it
//   - every saved answer counts, finished or not; the CURRENT answer only (the answers table), never the history
//   - an answer kept from a rater who has since been moved to another survey is not counted for that target (it is in
//     the full download), so a target's Best counts always add up to its answered count
//   - a card not in the target's suggested list was added by a rater (Search or Browse): isAdded
// Never in the result: rater names, notes, history, foundBy or method, the gold, isMappedInGold, AI answers.
//
// Revision 13 (WORKORDER-RATER13): agreement by property as well as by card, admin only. Per target:
//   sameCardCount      how many of the answering raters chose the most-chosen Best answer (a card, No match or Unsure)
//   samePropertyCount  the same, with every card of one CEDS property and qualifiers counted as one answer, whatever its
//                      class: the property identity is the card's cedsId (the P-id) plus its sorted qualifierNameList
//   distinctBestPropertyCount  distinct Best answers by property (distinctBestCount stays by card)
// No match agrees with No match, and Unsure with Unsure, at both levels. Same ticks do not enter either figure. A target
// with no answers has null figures. A chosen card with no cedsId is refused by name, never scored under some other identity.
//
//   buildRaterResults({ elementList, suggestedDocument, raterList, answerList }) -> { targetList } | { problemText }
//     problemText names every stored answer that cannot be read (a card neither suggested nor added, an unknown answer
//     kind) and every target without a suggested list; such an answer is never quietly dropped from the counts
//     targetList is in the default order: targets with more than one distinct Best answer first, then the rest, each part
//     by targetLabel; rows within a target by Best count, then Same count, descending, then by title
//   resultsCsvTextOf(targetList) -> the summary CSV, one line per row (an unanswered target gets one line with its
//     candidate columns empty)

const NON_CARD_ROW_BY_KIND = Object.freeze({
	noMatch: { rowKind: 'noMatch', candidateTitle: 'No match in CEDS' },
	unsure: { rowKind: 'unsure', candidateTitle: 'Unsure' },
});

const RESULTS_CSV_COLUMN_LIST = Object.freeze(['standard', 'survey', 'targetStableId', 'targetName', 'answered', 'assigned', 'candidateTupleId', 'candidateTitle', 'added', 'best', 'same', 'sameCard', 'sameProperty']);

const byText = (textA, textB) => (textA < textB ? -1 : textA > textB ? 1 : 0);

// the title the raters saw: Class → Property (qualifiers)
const candidateTitleOf = (card) => `${card.className} → ${card.propertyName}${card.qualifierNameList && card.qualifierNameList.length > 0 ? ` (${card.qualifierNameList.join(', ')})` : ''}`;

const targetNameOf = (element) => (element.ownerName ? `${element.ownerName}/${element.name}` : element.name);

// the CEDS property plus its qualifiers, ignoring the class (revision 12 groups a rater's list by the same identity)
const propertyIdentityOf = (card) => JSON.stringify([card.cedsId, card.qualifierNameList.slice().sort()]);

// how many answers share the most common identity in the list; null when there are no answers
const topAgreementCountOf = (identityList) => {
	if (identityList.length === 0) {
		return null;
	}
	const countByIdentity = identityList.reduce((soFar, identityText) => ({ ...soFar, [identityText]: (soFar[identityText] || 0) + 1 }), {});
	return Math.max(...Object.values(countByIdentity));
};

const buildRaterResults = ({ elementList, suggestedDocument, raterList, answerList }) => {
	const problemList = [];
	const assignedRaterNameListBySurvey = raterList.reduce((soFar, rater) => ({ ...soFar, [rater.surveyName]: (soFar[rater.surveyName] || []).concat([rater.raterUserName]) }), {});
	const targetList = elementList.map((element) => {
		const assignedRaterNameList = assignedRaterNameListBySurvey[element.surveyName] || [];
		const targetAnswerList = answerList.filter((answerRecord) => answerRecord.elementStableId === element.elementStableId && assignedRaterNameList.indexOf(answerRecord.raterUserName) !== -1);
		const suggestedEntry = suggestedDocument.suggestedByElementStableId[element.elementStableId];
		if (!suggestedEntry) {
			problemList.push(`target ${element.elementStableId} has no suggested list in suggested.json`);
		}
		const suggestedCardList = suggestedEntry ? suggestedEntry.cardList : [];
		const suggestedTupleIdSet = new Set(suggestedCardList.reduce((soFar, card) => soFar.concat(card.cedsTupleIdList || [card.cedsTupleId]), []));
		const rowByIdentity = {};
		const bestCardIdentityList = [];
		const bestPropertyIdentityList = [];
		const cardOf = (cedsTupleId, answer) => suggestedCardList.find((suggestedCard) => suggestedCard.cedsTupleId === cedsTupleId) || answer.addedCardList.find((addedCard) => addedCard.cedsTupleId === cedsTupleId);
		const cardRowOf = (cedsTupleId, answer) => {
			if (!rowByIdentity[cedsTupleId]) {
				const card = cardOf(cedsTupleId, answer);
				if (!card) {
					problemList.push(`an answer for ${element.elementStableId} names card ${cedsTupleId}, which is neither suggested nor in the rater's added cards`);
					return { bestCount: 0, sameCount: 0 };
				}
				rowByIdentity[cedsTupleId] = { rowKind: 'card', cedsTupleId, candidateTitle: candidateTitleOf(card), isAdded: !suggestedTupleIdSet.has(cedsTupleId), bestCount: 0, sameCount: 0 };
			}
			return rowByIdentity[cedsTupleId];
		};
		targetAnswerList.forEach(({ answer }) => {
			if (answer.answerKind === 'cards') {
				cardRowOf(answer.bestCedsTupleId, answer).bestCount += 1;
				const bestCard = cardOf(answer.bestCedsTupleId, answer);
				if (bestCard && !bestCard.cedsId) {
					problemList.push(`an answer for ${element.elementStableId} chose card ${answer.bestCedsTupleId}, which has no CEDS property id, so it cannot be scored by property`);
				}
				bestCardIdentityList.push(answer.bestCedsTupleId);
				bestPropertyIdentityList.push(bestCard && bestCard.cedsId ? propertyIdentityOf(bestCard) : null);
				answer.sameCedsTupleIdList.forEach((cedsTupleId) => {
					cardRowOf(cedsTupleId, answer).sameCount += 1;
				});
				return;
			}
			const nonCardRow = NON_CARD_ROW_BY_KIND[answer.answerKind];
			if (!nonCardRow) {
				problemList.push(`an answer for ${element.elementStableId} has unknown answerKind ${JSON.stringify(answer.answerKind)}`);
				return;
			}
			if (!rowByIdentity[answer.answerKind]) {
				rowByIdentity[answer.answerKind] = { ...nonCardRow, cedsTupleId: null, isAdded: false, bestCount: 0, sameCount: null };
			}
			rowByIdentity[answer.answerKind].bestCount += 1;
			bestCardIdentityList.push(answer.answerKind);
			bestPropertyIdentityList.push(answer.answerKind);
		});
		const rowList = Object.values(rowByIdentity).sort(
			(rowA, rowB) => rowB.bestCount - rowA.bestCount || (rowB.sameCount === null ? -1 : rowB.sameCount) - (rowA.sameCount === null ? -1 : rowA.sameCount) || byText(rowA.candidateTitle, rowB.candidateTitle) || byText(rowA.cedsTupleId || '', rowB.cedsTupleId || ''),
		);
		const targetName = targetNameOf(element);
		return {
			targetStableId: element.elementStableId,
			standard: element.standard,
			surveyName: element.surveyName,
			targetName,
			targetLabel: `${element.standard} · ${element.surveyName} · ${targetName}`,
			answeredCount: targetAnswerList.length,
			assignedCount: assignedRaterNameList.length,
			distinctBestCount: rowList.filter((row) => row.bestCount > 0).length,
			distinctBestPropertyCount: new Set(bestPropertyIdentityList).size,
			sameCardCount: topAgreementCountOf(bestCardIdentityList),
			samePropertyCount: topAgreementCountOf(bestPropertyIdentityList),
			rowList,
		};
	});
	if (problemList.length > 0) {
		return { problemText: `rater-results: ${problemList.length} stored answer(s) cannot be counted: ${problemList.slice(0, 5).join('; ')}` };
	}
	const isDisagreement = (target) => target.distinctBestCount > 1;
	targetList.sort((targetA, targetB) => Number(isDisagreement(targetB)) - Number(isDisagreement(targetA)) || byText(targetA.targetLabel, targetB.targetLabel) || byText(targetA.targetStableId, targetB.targetStableId));
	return { targetList };
};

const csvCellOf = (cellValue) => {
	const cellText = cellValue === null || cellValue === undefined ? '' : `${cellValue}`;
	return /[",\n\r]/.test(cellText) ? `"${cellText.replace(/"/g, '""')}"` : cellText;
};

const resultsCsvTextOf = (targetList) => {
	const lineList = targetList.reduce((soFar, target) => {
		const targetCellList = [target.standard, target.surveyName, target.targetStableId, target.targetName, target.answeredCount, target.assignedCount];
		const agreementCellList = [target.sameCardCount, target.samePropertyCount];
		if (target.rowList.length === 0) {
			return soFar.concat([[...targetCellList, '', '', '', '', '', ...agreementCellList].map(csvCellOf).join(',')]);
		}
		return soFar.concat(target.rowList.map((row) => [...targetCellList, row.cedsTupleId, row.candidateTitle, row.isAdded ? 'added' : '', row.bestCount, row.sameCount, ...agreementCellList].map(csvCellOf).join(',')));
	}, []);
	return [RESULTS_CSV_COLUMN_LIST.join(','), ...lineList].join('\n') + '\n';
};

module.exports = { buildRaterResults, resultsCsvTextOf, candidateTitleOf, RESULTS_CSV_COLUMN_LIST };
