'use strict';

// parserLimits — what every submission parser shares: the emitted-field collector that counts DURING the walk, the text caps, and the depth check. A cap is a refusal by name; nothing is truncated.
//   THE PARSER INTERFACE: parser({ submittedDocument, parserLimitValues }) → { fieldList, unresolvedRefList, unresolvedContextList, notWalkedList } | { refusal: { refusalName, reason, ...} }
//   A field is { name, definition?, definitionAbsent?, path?, type?, valueTierNotOffered? }. No parser reads a network, a file or the graph: a remote reference is recorded, never fetched.

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
	? { refusalName: 'depthExceeded', reason: `the document is nested deeper than ${parserLimitValues.maxDocumentDepth} levels`, maxDepth: parserLimitValues.maxDocumentDepth }
	: null);

// a collector, so the 201st field stops the walk rather than being counted afterwards. add() answers a refusal or null.
const fieldCollectorFor = (parserLimitValues) => {
	const fieldList = [];
	const add = ({ name, definition, path, type, valueTierNotOffered }) => {
		if (fieldList.length >= parserLimitValues.maxFieldListLength) {
			return { refusalName: 'maxFieldListLength', reason: `a submission may name ${parserLimitValues.maxFieldListLength} fields, and this one names more; send them in smaller submissions`, maxFieldListLength: parserLimitValues.maxFieldListLength };
		}
		if (!isUsableText(name)) {
			return { refusalName: 'invalidFieldEntry', reason: `field ${fieldList.length + 1} has no name`, fieldIndex: fieldList.length };
		}
		const trimmedName = name.trim();
		if (trimmedName.length > parserLimitValues.maxFieldNameChars) {
			return { refusalName: 'fieldTextTooLong', reason: `field ${fieldList.length + 1}'s name is ${trimmedName.length} characters; the cap is ${parserLimitValues.maxFieldNameChars}`, fieldIndex: fieldList.length, maxLength: parserLimitValues.maxFieldNameChars };
		}
		const trimmedDefinition = isUsableText(definition) ? definition.trim() : '';
		if (trimmedDefinition.length > parserLimitValues.maxFieldDefinitionChars) {
			return { refusalName: 'fieldTextTooLong', reason: `the definition of field ${fieldList.length + 1} (${trimmedName}) is ${trimmedDefinition.length} characters; the cap is ${parserLimitValues.maxFieldDefinitionChars}`, fieldIndex: fieldList.length, maxLength: parserLimitValues.maxFieldDefinitionChars };
		}
		if (path !== undefined && String(path).length > parserLimitValues.maxFieldPathChars) {
			return { refusalName: 'fieldTextTooLong', reason: `the path of field ${fieldList.length + 1} (${trimmedName}) is ${String(path).length} characters; the cap is ${parserLimitValues.maxFieldPathChars}`, fieldIndex: fieldList.length, maxLength: parserLimitValues.maxFieldPathChars };
		}
		if (type !== undefined && String(type).length > parserLimitValues.maxFieldPathChars) {
			return { refusalName: 'fieldTextTooLong', reason: `the type of field ${fieldList.length + 1} (${trimmedName}) is ${String(type).length} characters; the cap is ${parserLimitValues.maxFieldPathChars}`, fieldIndex: fieldList.length, maxLength: parserLimitValues.maxFieldPathChars };
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

module.exports = { isPlainRecord, isUsableText, depthRefusalFor, fieldCollectorFor };
