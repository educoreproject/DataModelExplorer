'use strict';

// rosettaReasonWords — the one place a Rosetta refusal reason, job stop or cancel note gets its words (WORKORDER-rosettaLoginPolish-111126 #5).
//   reasonOf(reasonName, valueBySlotName) → the sentence, its {slots} filled. An unknown reasonName, or a slot not given, throws by name: a word can never reach
//     a person as braces, and a reason can never silently be some other reason.
//   sentenceFaultOf(text) → '' when text is a sentence a person may read, else what is wrong with it (the rule below). This module's own load check uses it.
//     The gate test (rosetta-login-polish.test.js) states the same rule in its own copy, so that it reads the same on a tree without this module.
// THE RULE: starts with a capital, ends with a full stop, and holds no camelCase token and no parenthesised machine name. A slot's VALUE is not held to it: a
// person's own field name may be camelCase, and saying it back is the point.

const reasonWords = require('./rosettaReasonWords.json');

const TEMPLATE_SLOT_PATTERN = /\{([A-Za-z]+)\}/g;
const CAMEL_CASE_TOKEN_PATTERN = /\b[a-z]+[A-Z][A-Za-z0-9]*\b/;
const FIRST_LETTER_CAPITAL_PATTERN = /^[A-Z]/;
const LAST_CHARACTER_FULL_STOP_PATTERN = /\.$/;
const PARENTHESISED_NAME_PATTERN = /\(\s*[a-z][A-Za-z]*\s*\)/;

const sentenceFaultOf = (text) => {
	if (typeof text !== 'string' || text === '') {
		return 'it is not text';
	}
	if (!FIRST_LETTER_CAPITAL_PATTERN.test(text)) {
		return 'it does not start with a capital';
	}
	if (!LAST_CHARACTER_FULL_STOP_PATTERN.test(text)) {
		return 'it does not end with a full stop';
	}
	const camelCaseMatch = text.match(CAMEL_CASE_TOKEN_PATTERN);
	if (camelCaseMatch) {
		return `it names ${camelCaseMatch[0]}, a machine name`;
	}
	const parenthesisedMatch = text.match(PARENTHESISED_NAME_PATTERN);
	if (parenthesisedMatch) {
		return `it holds ${parenthesisedMatch[0]}, a name in brackets`;
	}
	return '';
};

// every entry is checked with its slots taken out, so a slot's name is not read as words
const templateFaultList = Object.entries(reasonWords.reasonTextByName)
	.map(([reasonName, templateText]) => ({ reasonName, faultText: sentenceFaultOf(templateText.replace(TEMPLATE_SLOT_PATTERN, 'X')) }))
	.filter((oneRow) => oneRow.faultText);
if (templateFaultList.length) {
	throw new Error(`rosettaReasonWords: rosettaReasonWords.json holds words a person may not be shown: ${templateFaultList.map((oneRow) => `${oneRow.reasonName} (${oneRow.faultText})`).join('; ')}`);
}

const reasonOf = (reasonName, valueBySlotName = {}) => {
	const templateText = reasonWords.reasonTextByName[reasonName];
	if (templateText === undefined) {
		throw new Error(`rosettaReasonWords: no reason is named ${reasonName}`);
	}
	return templateText.replace(TEMPLATE_SLOT_PATTERN, (wholeSlot, slotName) => {
		if (valueBySlotName[slotName] === undefined || valueBySlotName[slotName] === null) {
			throw new Error(`rosettaReasonWords: the reason ${reasonName} names {${slotName}}, which was not given`);
		}
		return String(valueBySlotName[slotName]);
	});
};

module.exports = { reasonOf, sentenceFaultOf, REASON_NAME_LIST: Object.freeze(Object.keys(reasonWords.reasonTextByName)) };
