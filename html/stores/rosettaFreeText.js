// rosettaFreeText — the Rosetta page's input ladder and its review state, as pure functions: no Vue, no store, no network. rosettaStore calls them;
// server/test/rosetta-free-text.test.js imports this file as it is, so the rules here are the rules tested. The one copy of the line-format reader.
//
//   ladderStepOf(pastedText) → { submission } | { lineReading: { fieldList, lineCount } } | { needsInterpretation: true } | { refusal: { refusalName, reason } }
//     Rung 1: JSON, read exactly as the page always read it. Rung 2: name/description lines, read here. Rung 3 is the server's (rosetta/interpret).
//   readLines(pastedText) → { fieldList, lineCount } | { unreadLineList }
//   reviewOf({ originalText, fieldList, readingKind, droppedFieldCount, unusedLineCount }) → the review the store holds: the JSON to show, the status line, the text Undo restores
//   undoPlanOf({ pastedText, review }) → { restoreText, needsConfirmation }
//   ladderRefusalOf(interpretRefusal) → the refusal shown when every rung has failed, saying what was tried
//
// A LINE READS CLEANLY or the text is not read here at all: one unreadable line sends the whole text to the AI, never a partial reading.
// A text uses ONE separator: tab, colon or dash. A line with no separator is a bare name and may sit beside any of them. A text whose lines use two
// separators is not read here: "a: b" beside "c - d" leaves it unclear whether ": " or " - " separates, and the AI reads such a text better than a guess does.

// ⟪rosettaLoginPolish #5⟫ the ladder's refusals in the page's words; a relative path, so the same file runs in Nuxt and in node's tests
import { rosettaPageWords, wordsOf } from '../components/rosetta/rosettaVocabulary.js';

const SEPARATOR_ROW_LIST = Object.freeze([
	{ separatorName: 'tab', splitPattern: /\t/, hasHeaderRow: true },
	{ separatorName: 'colon', splitPattern: /:\s+|:$/ },
	{ separatorName: 'dash', splitPattern: /\s+[-–—]\s+/ },
]);
// a separator of any kind inside what should be a bare name means the line was meant to be split, by a rule this text does not follow
const ANY_SEPARATOR_PATTERN = /\t|:\s|:$|\s[-–—]\s/;
const BULLET_PATTERN = /^(?:[-*•·▪]|\d{1,3}[.)])\s+/;
const MAX_NAME_CHARS = 80;
const MAX_NAME_WORDS = 6;
// a name ends no sentence and holds no JSON punctuation: a line of prose, or a broken JSON document, is not a field name
const NOT_A_NAME_PATTERN = /[.!?;,]$|[{}[\]"]/;
const HEADER_NAME_PATTERN = /^(?:field\s*name|field|name|element|column|attribute|property)$/i;
const HEADER_DEFINITION_PATTERN = /^(?:description|definition|meaning|notes?|comment)$/i;

const isNameLike = (nameText) => nameText.length > 0 && nameText.length <= MAX_NAME_CHARS && nameText.split(/\s+/).length <= MAX_NAME_WORDS && !NOT_A_NAME_PATTERN.test(nameText) && !ANY_SEPARATOR_PATTERN.test(nameText);

// one line under one separator: a field, or null when the line does not read cleanly that way
const fieldOfLine = (lineText, separatorRow) => {
	const unbulletedText = lineText.trim().replace(BULLET_PATTERN, '');
	const separatorMatch = unbulletedText.match(separatorRow.splitPattern);
	if (!separatorMatch) {
		return isNameLike(unbulletedText) ? { name: unbulletedText } : null;
	}
	const nameText = unbulletedText.slice(0, separatorMatch.index).trim();
	const definitionText = unbulletedText.slice(separatorMatch.index + separatorMatch[0].length).trim();
	if (!isNameLike(nameText)) {
		return null;
	}
	// a second tab is a third column: a sheet with more than name and description is not this format
	if (separatorRow.separatorName === 'tab' && definitionText.includes('\t')) {
		return null;
	}
	return definitionText ? { name: nameText, definition: definitionText } : { name: nameText };
};

const isHeaderField = (oneField) => Boolean(oneField && oneField.definition && HEADER_NAME_PATTERN.test(oneField.name) && HEADER_DEFINITION_PATTERN.test(oneField.definition));

const readLines = (pastedText) => {
	const lineList = String(pastedText).split(/\r\n|\r|\n/).filter((lineText) => lineText.trim() !== '');
	if (lineList.length === 0) {
		return { unreadLineList: [] };
	}
	let fewestUnreadLineList = null;
	for (const separatorRow of SEPARATOR_ROW_LIST) {
		const fieldOrNullList = lineList.map((lineText) => fieldOfLine(lineText, separatorRow));
		const unreadLineList = lineList.filter((lineText, lineIndex) => fieldOrNullList[lineIndex] === null);
		const usesThisSeparator = lineList.some((lineText) => separatorRow.splitPattern.test(lineText.trim().replace(BULLET_PATTERN, '')));
		if (unreadLineList.length === 0 && (usesThisSeparator || separatorRow === SEPARATOR_ROW_LIST[SEPARATOR_ROW_LIST.length - 1])) {
			const fieldList = separatorRow.hasHeaderRow && isHeaderField(fieldOrNullList[0]) ? fieldOrNullList.slice(1) : fieldOrNullList;
			if (fieldList.length === 0) {
				return { unreadLineList: [] };
			}
			return { fieldList, lineCount: fieldList.length };
		}
		if (fewestUnreadLineList === null || unreadLineList.length < fewestUnreadLineList.length) {
			fewestUnreadLineList = unreadLineList;
		}
	}
	return { unreadLineList: fewestUnreadLineList };
};

// what the page always did with valid JSON, unchanged: a list is a field list, { fieldList } is one, an @context is JSON-LD, anything else a JSON Schema
const submissionOfDocument = (parsedDocument) => {
	if (Array.isArray(parsedDocument)) {
		return { fieldList: parsedDocument };
	}
	if (parsedDocument.fieldList) {
		return { fieldList: parsedDocument.fieldList };
	}
	return parsedDocument['@context'] ? { jsonLdContext: parsedDocument } : { jsonSchema: parsedDocument };
};

// JSON.parse throws on what is not JSON; that throw is this rung's answer, not a fault
const parsedJsonOf = (pastedText) => {
	try {
		return { parsedDocument: JSON.parse(pastedText) };
	} catch (parseError) {
		return { parseErrorText: parseError.message };
	}
};

const ladderStepOf = (pastedText) => {
	if (String(pastedText).trim() === '') {
		return { refusal: { refusalName: 'noSubmission', reason: rosettaPageWords.ladderNothingPastedText } };
	}
	const jsonRead = parsedJsonOf(pastedText);
	// valid JSON goes as it always went. The page refused null here before, when reading null.fieldList threw; it still does, now by name
	if (jsonRead.parsedDocument === null) {
		return { refusal: { refusalName: 'notJson', reason: rosettaPageWords.ladderJsonNullText } };
	}
	if (jsonRead.parsedDocument !== undefined) {
		return { submission: submissionOfDocument(jsonRead.parsedDocument) };
	}
	const lineRead = readLines(pastedText);
	if (lineRead.fieldList) {
		return { lineReading: lineRead };
	}
	return { needsInterpretation: true };
};

const plural = (countNumber, singularText, pluralText) => `${countNumber} ${countNumber === 1 ? singularText : pluralText}`;
const STATUS_TEXT_BY_READING_KIND = Object.freeze({
	lineFormat: ({ fieldList }) => `Read as ${plural(fieldList.length, 'name/description line', 'name/description lines')}.`,
	aiInterpretation: ({ fieldList, droppedFieldCount, unusedLineCount }) => [
		`Interpreted by AI: ${plural(fieldList.length, 'field', 'fields')}`,
		unusedLineCount > 0 ? `; ${plural(unusedLineCount, 'line', 'lines')} could not be read` : '',
		droppedFieldCount > 0 ? `; ${plural(droppedFieldCount, 'field', 'fields')} the AI offered ${droppedFieldCount === 1 ? 'was' : 'were'} not in your text and ${droppedFieldCount === 1 ? 'was' : 'were'} left out` : '',
		'.',
	].join(''),
});

// the counts an AI reading reports are the server's to give: absent, the reading is refused here rather than shown as nothing dropped
const COUNT_NAME_LIST_BY_READING_KIND = Object.freeze({ lineFormat: [], aiInterpretation: ['droppedFieldCount', 'unusedLineCount'] });

// ⟪rosettaMeanings⟫ nextStepText is the page's words (rosettaVocabulary), handed in: this module stays free of the page's vocabulary and of any import
const reviewOf = ({ originalText, fieldList, readingKind, droppedFieldCount, unusedLineCount, nextStepText }) => {
	if (typeof nextStepText !== 'string' || nextStepText === '') {
		throw new Error(`rosettaFreeText: reviewOf needs nextStepText, the page's words for what to do next; it gave ${JSON.stringify(nextStepText)}`);
	}
	const statusTextOf = STATUS_TEXT_BY_READING_KIND[readingKind];
	if (!statusTextOf) {
		throw new Error(`rosettaFreeText: no status wording for reading kind '${readingKind}'; the kinds are ${Object.keys(STATUS_TEXT_BY_READING_KIND).join(', ')}`);
	}
	const countByName = { droppedFieldCount, unusedLineCount };
	const absentCountName = COUNT_NAME_LIST_BY_READING_KIND[readingKind].find((countName) => !Number.isInteger(countByName[countName]));
	if (absentCountName) {
		throw new Error(`rosettaFreeText: a ${readingKind} reading must give ${absentCountName} as a whole number; it gave ${JSON.stringify(countByName[absentCountName])}`);
	}
	return {
		readingKind,
		originalText,
		interpretedText: JSON.stringify(fieldList, null, 2),
		statusText: `${statusTextOf({ fieldList, droppedFieldCount, unusedLineCount })} ${nextStepText}`,
	};
};

// Undo puts back exactly what was typed; if the shown JSON was edited since, those edits are lost, so the person is asked first
const undoPlanOf = ({ pastedText, review }) => ({ restoreText: review.originalText, needsConfirmation: pastedText !== review.interpretedText });

const ladderRefusalOf = (interpretRefusal) => ({
	refusalName: interpretRefusal.refusalName,
	reason: wordsOf(rosettaPageWords.ladderInterpretRefusedTemplate, { reasonText: interpretRefusal.reason }),
});

export { ladderStepOf, readLines, reviewOf, undoPlanOf, ladderRefusalOf, submissionOfDocument };
