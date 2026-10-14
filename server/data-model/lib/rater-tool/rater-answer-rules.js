'use strict';

// rater-answer-rules.js — the CEDS Rater's answer rules (SPEC §4.3), the ONE place an answer is judged valid. Pure: no
// store, no graph. The server calls it on every save; the browser repeats the same rules only to explain them early.
//
//   validateAnswer({ answerSubmission, allowedCedsTupleIdList }) -> { refusal: { refusalName, refusalText } } | { validAnswer }
//
// answerSubmission = { answerKind, bestCedsTupleId, sameCedsTupleIdList, note }
//   answerKind 'cards'   — exactly one Best card from the rater's list, plus any number of Same cards from the list,
//                          never the Best card itself, no card twice;
//   answerKind 'noMatch' — no card chosen;
//   answerKind 'unsure'  — no card chosen, and a note that is not empty.
// allowedCedsTupleIdList = the tuple ids of the rater's list for this element: the suggested cards plus the cards the
// rater added.

const ANSWER_KIND_LIST = Object.freeze(['cards', 'noMatch', 'unsure']);
const ANSWER_REFUSAL_NAME_LIST = Object.freeze(['answerKindInvalid', 'bestMissing', 'bestNotOne', 'bestNotInList', 'sameWithoutBest', 'sameOnBest', 'sameNotInList', 'sameTwice', 'unsureWithoutNote', 'noteNotText']);
const NOTE_LENGTH_CAP = 4000;

const refusalOf = (refusalName, refusalText) => {
	if (ANSWER_REFUSAL_NAME_LIST.indexOf(refusalName) === -1) {
		throw new Error(`rater-answer-rules: '${refusalName}' is not one of ${ANSWER_REFUSAL_NAME_LIST.join(', ')}`);
	}
	return { refusal: { refusalName, refusalText } };
};

const isPresent = (candidate) => candidate !== undefined && candidate !== null && candidate !== '';

const validateAnswer = ({ answerSubmission, allowedCedsTupleIdList }) => {
	const { answerKind, bestCedsTupleId, note } = answerSubmission;
	const sameCedsTupleIdList = answerSubmission.sameCedsTupleIdList === undefined || answerSubmission.sameCedsTupleIdList === null ? [] : answerSubmission.sameCedsTupleIdList;
	if (ANSWER_KIND_LIST.indexOf(answerKind) === -1) {
		return refusalOf('answerKindInvalid', `Choose a Best card, No match in CEDS, or Unsure (answerKind must be one of ${ANSWER_KIND_LIST.join(', ')}; got ${JSON.stringify(answerKind)}).`);
	}
	if (note !== undefined && note !== null && typeof note !== 'string') {
		return refusalOf('noteNotText', 'The note must be text.');
	}
	const noteText = typeof note === 'string' ? note.trim().slice(0, NOTE_LENGTH_CAP) : '';
	if (!Array.isArray(sameCedsTupleIdList)) {
		return refusalOf('sameNotInList', 'Same must be a list of cards.');
	}
	if (answerKind !== 'cards') {
		if (isPresent(bestCedsTupleId)) {
			return refusalOf('answerKindInvalid', `${answerKind === 'noMatch' ? 'No match' : 'Unsure'} cannot also have a Best card.`);
		}
		if (sameCedsTupleIdList.length > 0) {
			return refusalOf('sameWithoutBest', 'Same is only for cards beside a Best card. Clear the Same ticks, or choose a Best card.');
		}
		if (answerKind === 'unsure' && noteText === '') {
			return refusalOf('unsureWithoutNote', 'Unsure needs a note saying why.');
		}
		return { validAnswer: { answerKind, bestCedsTupleId: null, sameCedsTupleIdList: [], note: noteText } };
	}
	if (Array.isArray(bestCedsTupleId)) {
		return refusalOf('bestNotOne', `Exactly one card can be Best; ${bestCedsTupleId.length} were sent.`);
	}
	if (!isPresent(bestCedsTupleId)) {
		return refusalOf(sameCedsTupleIdList.length > 0 ? 'sameWithoutBest' : 'bestMissing', sameCedsTupleIdList.length > 0 ? 'Same is ticked, but no card is Best. Choose one card as Best.' : 'Choose a Best card, No match in CEDS, or Unsure.');
	}
	if (allowedCedsTupleIdList.indexOf(bestCedsTupleId) === -1) {
		return refusalOf('bestNotInList', 'The Best card is not in your list for this element. Add it from Search or Browse first.');
	}
	if (sameCedsTupleIdList.indexOf(bestCedsTupleId) !== -1) {
		return refusalOf('sameOnBest', 'The Best card cannot also be ticked Same.');
	}
	const strangerTupleIdList = sameCedsTupleIdList.filter((cedsTupleId) => allowedCedsTupleIdList.indexOf(cedsTupleId) === -1);
	if (strangerTupleIdList.length > 0) {
		return refusalOf('sameNotInList', `${strangerTupleIdList.length} Same card(s) are not in your list for this element.`);
	}
	if (new Set(sameCedsTupleIdList).size !== sameCedsTupleIdList.length) {
		return refusalOf('sameTwice', 'A card is ticked Same twice.');
	}
	return { validAnswer: { answerKind, bestCedsTupleId, sameCedsTupleIdList: sameCedsTupleIdList.slice(), note: noteText } };
};

module.exports = { validateAnswer, ANSWER_KIND_LIST, ANSWER_REFUSAL_NAME_LIST, NOTE_LENGTH_CAP };
