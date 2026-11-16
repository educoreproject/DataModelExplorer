'use strict';

// parserLimits — what every submission parser shares: the emitted-field collector that counts DURING the walk, the text caps, and the depth check. A cap is a refusal by name; nothing is truncated.
//   THE PARSER INTERFACE: parser({ submittedDocument, parserLimitValues }) → { fieldList, unresolvedRefList, unresolvedContextList, notWalkedList } | { refusal: { refusalName, reason, ...} }
//   A field is { name, definition?, definitionAbsent?, path?, type?, valueTierNotOffered? }. No parser reads a network, a file or the graph: a remote reference is recorded, never fetched.

const { reasonOf } = require('../rosettaReasonWords');

const isPlainRecord = (candidate) => candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate);
const isUsableText = (candidate) => typeof candidate === 'string' && candidate.trim() !== '';

// the depth of the document as sent, whatever the format, so a parser never recurses past the cap. Stops at the first level over it.
const isDeeperThan = (documentPart, depthCap, currentDepth = 1) => {
	if (documentPart === null || typeof documentPart !== 'object') {
		return false;
	}
	if (currentDepth > depthCap) {
		return true;
	}
	return Object.values(documentPart).some((onePart) => isDeeperThan(onePart, depthCap, currentDepth + 1));
};

const depthRefusalFor = ({ submittedDocument, parserLimitValues }) => (isDeeperThan(submittedDocument, parserLimitValues.maxDocumentDepth)
	? { refusalName: 'depthExceeded', reason: reasonOf('documentTooDeep', { maxDepth: parserLimitValues.maxDocumentDepth }), maxDepth: parserLimitValues.maxDocumentDepth }
	: null);

// a collector, so the 201st field stops the walk rather than being counted afterwards. add() answers a refusal or null.
const fieldCollectorFor = (parserLimitValues) => {
	const fieldList = [];
	const add = ({ name, definition, path, type, valueTierNotOffered }) => {
		if (fieldList.length >= parserLimitValues.maxFieldListLength) {
			return { refusalName: 'maxFieldListLength', reason: reasonOf('tooManyFields', { maxFieldListLength: parserLimitValues.maxFieldListLength }), maxFieldListLength: parserLimitValues.maxFieldListLength };
		}
		if (!isUsableText(name)) {
			return { refusalName: 'invalidFieldEntry', reason: reasonOf('fieldHasNoName', { fieldNumber: fieldList.length + 1 }), fieldIndex: fieldList.length };
		}
		const trimmedName = name.trim();
		if (trimmedName.length > parserLimitValues.maxFieldNameChars) {
			return { refusalName: 'fieldTextTooLong', reason: reasonOf('fieldNameTooLong', { fieldNumber: fieldList.length + 1, charCount: trimmedName.length, maxLength: parserLimitValues.maxFieldNameChars }), fieldIndex: fieldList.length, maxLength: parserLimitValues.maxFieldNameChars };
		}
		const trimmedDefinition = isUsableText(definition) ? definition.trim() : '';
		if (trimmedDefinition.length > parserLimitValues.maxFieldDefinitionChars) {
			return { refusalName: 'fieldTextTooLong', reason: reasonOf('fieldDefinitionTooLong', { fieldNumber: fieldList.length + 1, fieldName: trimmedName, charCount: trimmedDefinition.length, maxLength: parserLimitValues.maxFieldDefinitionChars }), fieldIndex: fieldList.length, maxLength: parserLimitValues.maxFieldDefinitionChars };
		}
		if (path !== undefined && String(path).length > parserLimitValues.maxFieldPathChars) {
			return { refusalName: 'fieldTextTooLong', reason: reasonOf('fieldPathTooLong', { fieldNumber: fieldList.length + 1, fieldName: trimmedName, charCount: String(path).length, maxLength: parserLimitValues.maxFieldPathChars }), fieldIndex: fieldList.length, maxLength: parserLimitValues.maxFieldPathChars };
		}
		if (type !== undefined && String(type).length > parserLimitValues.maxFieldPathChars) {
			return { refusalName: 'fieldTextTooLong', reason: reasonOf('fieldTypeTooLong', { fieldNumber: fieldList.length + 1, fieldName: trimmedName, charCount: String(type).length, maxLength: parserLimitValues.maxFieldPathChars }), fieldIndex: fieldList.length, maxLength: parserLimitValues.maxFieldPathChars };
		}
		fieldList.push({
			name: trimmedName,
			...(trimmedDefinition ? { definition: trimmedDefinition } : { definitionAbsent: true }),
			...(path === undefined ? {} : { path: String(path) }),
			...(type === undefined ? {} : { type: String(type) }),
			...(valueTierNotOffered ? { valueTierNotOffered: true } : {}),
		});
		return null;
	};
	return { add, fieldList };
};

// a list of what the walk could not read, capped as it grows: a hostile document can name a hundred thousand of them. What is over the cap is counted, and a long text in a row is cut to the path cap.
const cappedRowListFor = (parserLimitValues) => {
	const rowList = [];
	let omittedCount = 0;
	const add = (oneRow) => {
		if (rowList.length >= parserLimitValues.maxUnresolvedListLength) {
			omittedCount += 1;
			return;
		}
		rowList.push(Object.keys(oneRow).reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: typeof oneRow[fieldName] === 'string' ? oneRow[fieldName].slice(0, parserLimitValues.maxFieldPathChars) : oneRow[fieldName] }), {}));
	};
	return { add, rowList, omittedCount: () => omittedCount };
};
// only a list that overflowed says so: an ordinary answer keeps the fields it always had
const omittedCountsOf = (countByName) => Object.keys(countByName).filter((countName) => countByName[countName] > 0).reduce((soFar, countName) => ({ ...soFar, [countName]: countByName[countName] }), {});

module.exports = { isPlainRecord, isUsableText, depthRefusalFor, fieldCollectorFor, cappedRowListFor, omittedCountsOf };
