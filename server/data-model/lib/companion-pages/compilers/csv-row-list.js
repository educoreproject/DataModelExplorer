#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
//
// csv-row-list — the rows of a CSV text, read exactly as Python's csv.reader reads them with its default (excel)
// dialect: comma, double quote, a doubled quote inside quotes is one quote, newlines inside quotes are kept, and a
// quote met where a field has already begun is kept as an ordinary character (non-strict). A blank line is an empty
// row, as Python gives it. This matters because the join probe the JEDx compiler reproduces (joinProbe.py) read the
// dictionary with csv.reader; the gate compares the two row for row on every source file.
//
// The bytes are decoded as the probe opened them: UTF-8 with each invalid sequence replaced by U+FFFD (errors='replace';
// the dictionary CSVs carry stray Windows-1252 bytes), and in text mode, so every CRLF and lone CR is first read as LF,
// inside quoted fields too (cells with line breaks in them otherwise keep a CR the probe never saw).
//
//   csvRowListOf(contentBuffer) -> [[fieldText, ...], ...]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const LINE_BREAK_CHARACTER_LIST = ['\n', '\r'];

// one handler per reader state: (character, readerState) -> next state name. readerState holds the row being built.
const nextStateByStateName = {
	startRecord: (character, readerState) => {
		if (LINE_BREAK_CHARACTER_LIST.includes(character)) {
			readerState.rowList.push([]);
			return character === '\r' ? 'eatLineFeed' : 'startRecord';
		}
		return nextStateByStateName.startField(character, readerState);
	},
	startField: (character, readerState) => {
		if (LINE_BREAK_CHARACTER_LIST.includes(character)) return endRecord(character, readerState);
		if (character === '"') return 'inQuotedField';
		if (character === ',') {
			saveField(readerState);
			return 'startField';
		}
		readerState.fieldText += character;
		return 'inField';
	},
	inField: (character, readerState) => {
		if (LINE_BREAK_CHARACTER_LIST.includes(character)) return endRecord(character, readerState);
		if (character === ',') {
			saveField(readerState);
			return 'startField';
		}
		readerState.fieldText += character;
		return 'inField';
	},
	inQuotedField: (character, readerState) => {
		if (character === '"') return 'quoteInQuotedField';
		readerState.fieldText += character;
		return 'inQuotedField';
	},
	quoteInQuotedField: (character, readerState) => {
		if (character === '"') {
			readerState.fieldText += '"';
			return 'inQuotedField';
		}
		if (character === ',') {
			saveField(readerState);
			return 'startField';
		}
		if (LINE_BREAK_CHARACTER_LIST.includes(character)) return endRecord(character, readerState);
		readerState.fieldText += character;
		return 'inField';
	},
	eatLineFeed: (character, readerState) => (character === '\n' ? 'startRecord' : nextStateByStateName.startRecord(character, readerState)),
};

const saveField = (readerState) => {
	readerState.fieldList.push(readerState.fieldText);
	readerState.fieldText = '';
};

const endRecord = (character, readerState) => {
	saveField(readerState);
	readerState.rowList.push(readerState.fieldList);
	readerState.fieldList = [];
	return character === '\r' ? 'eatLineFeed' : 'startRecord';
};

const csvRowListOf = (contentBuffer) => {
	if (!Buffer.isBuffer(contentBuffer)) {
		throw new Error(`${moduleName}: csvRowListOf needs a Buffer (got ${typeof contentBuffer})`);
	}
	const contentText = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(contentBuffer).replace(/\r\n?/g, '\n');
	const readerState = { rowList: [], fieldList: [], fieldText: '' };
	let stateName = 'startRecord';
	for (const character of contentText) {
		stateName = nextStateByStateName[stateName](character, readerState);
	}
	if (!['startRecord', 'eatLineFeed'].includes(stateName)) {
		saveField(readerState);
		readerState.rowList.push(readerState.fieldList);
	}
	return readerState.rowList;
};

module.exports = { csvRowListOf };
