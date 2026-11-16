'use strict';

// fieldListParser — the plain form, { fieldList: [{ name, definition?, path?, type? }] }. See parserLimits.js for THE PARSER INTERFACE. An unnamed property of an entry is refused: a misspelt "defintion" must not quietly become a field with no definition.

const { isPlainRecord, depthRefusalFor, fieldCollectorFor } = require('./parserLimits');
const { reasonOf } = require('../rosettaReasonWords');

const ENTRY_FIELD_NAME_LIST = Object.freeze(['name', 'definition', 'path', 'type']);

const parseFieldList = ({ submittedDocument, parserLimitValues }) => {
	const depthRefusal = depthRefusalFor({ submittedDocument, parserLimitValues });
	if (depthRefusal) {
		return { refusal: depthRefusal };
	}
	const collector = fieldCollectorFor(parserLimitValues);
	for (let entryIndex = 0; entryIndex < submittedDocument.length; entryIndex += 1) {
		const oneEntry = submittedDocument[entryIndex];
		if (!isPlainRecord(oneEntry)) {
			return { refusal: { refusalName: 'invalidFieldEntry', reason: reasonOf('fieldListEntryNotObject', { entryNumber: entryIndex + 1 }), fieldIndex: entryIndex } };
		}
		const strangerNameList = Object.keys(oneEntry).filter((propertyName) => !ENTRY_FIELD_NAME_LIST.includes(propertyName));
		if (strangerNameList.length > 0) {
			return { refusal: { refusalName: 'invalidFieldEntry', reason: reasonOf('fieldListEntryStrangerNames', { entryNumber: entryIndex + 1, strangerNameListText: strangerNameList.join(', '), entryNameListText: ENTRY_FIELD_NAME_LIST.join(', ') }), fieldIndex: entryIndex, validValueList: ENTRY_FIELD_NAME_LIST } };
		}
		const notTextName = ENTRY_FIELD_NAME_LIST.find((propertyName) => oneEntry[propertyName] !== undefined && typeof oneEntry[propertyName] !== 'string');
		if (notTextName) {
			return { refusal: { refusalName: 'invalidFieldEntry', reason: reasonOf('fieldListEntryNotText', { entryNumber: entryIndex + 1, notTextName }), fieldIndex: entryIndex } };
		}
		const addRefusal = collector.add(oneEntry);
		if (addRefusal) {
			return { refusal: addRefusal };
		}
	}
	if (collector.fieldList.length === 0) {
		return { refusal: { refusalName: 'noFieldsFound', reason: reasonOf('fieldListEmpty') } };
	}
	return { fieldList: collector.fieldList, unresolvedRefList: [], unresolvedContextList: [], notWalkedList: [] };
};

module.exports = { parseFieldList };
