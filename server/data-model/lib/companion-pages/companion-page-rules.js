#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
//
// Validation of a companion page record (add page / edit page). A record must carry EVERY column the mapper declares;
// the optional ones may be null, none may be absent, and nothing else may be present. So an edit is always a whole
// record, and a misspelt or missing property is refused by name instead of quietly becoming null.
//
//   refusalOfPageRecord({ pageRecord, dataColumnList, TARGET_KIND_LIST }) -> '' or the refusal text

const { namePatternByField } = require('./companion-source-rules.json');

const OPTIONAL_TEXT_COLUMN_LIST = ['summary', 'audienceText', 'standardKey', 'subjectStableId', 'externalUrl', 'compilerName'];

const isNonEmptyText = (candidateValue) => typeof candidateValue === 'string' && candidateValue.trim() !== '';

const refusalOfPageRecord = ({ pageRecord, dataColumnList, TARGET_KIND_LIST }) => {
	if (!pageRecord || typeof pageRecord !== 'object' || Array.isArray(pageRecord)) {
		return 'pageRecord must be an object';
	}
	const unknownNameList = Object.keys(pageRecord).filter((propertyName) => !dataColumnList.includes(propertyName));
	if (unknownNameList.length) {
		return `pageRecord has unknown propert${unknownNameList.length === 1 ? 'y' : 'ies'}: ${unknownNameList.join(', ')}`;
	}
	const absentNameList = dataColumnList.filter((columnName) => pageRecord[columnName] === undefined);
	if (absentNameList.length) {
		return `pageRecord lacks ${absentNameList.join(', ')} (every column is required; optional ones may be null)`;
	}
	if (!new RegExp(namePatternByField.pageSlug).test(String(pageRecord.pageSlug))) {
		return `pageSlug '${pageRecord.pageSlug}' does not match ${namePatternByField.pageSlug}`;
	}
	if (!isNonEmptyText(pageRecord.title)) {
		return 'title must be non-empty text';
	}
	const badOptionalList = OPTIONAL_TEXT_COLUMN_LIST.filter((columnName) => pageRecord[columnName] !== null && typeof pageRecord[columnName] !== 'string');
	if (badOptionalList.length) {
		return `${badOptionalList.join(', ')} must be text or null`;
	}
	if (!TARGET_KIND_LIST.includes(pageRecord.targetKind)) {
		return `targetKind '${pageRecord.targetKind}' is not one of ${TARGET_KIND_LIST.join(', ')}`;
	}
	if (pageRecord.targetKind === 'externalUrl' && !/^https?:\/\/\S+$/.test(String(pageRecord.externalUrl))) {
		return 'a page whose targetKind is externalUrl needs an http(s) externalUrl';
	}
	if (pageRecord.targetKind === 'compiled' && !isNonEmptyText(pageRecord.compilerName)) {
		return 'a page whose targetKind is compiled needs a compilerName';
	}
	if (isNonEmptyText(pageRecord.subjectStableId) && !isNonEmptyText(pageRecord.standardKey)) {
		return 'a page pinned to a subjectStableId must also name its standardKey';
	}
	if (!Number.isInteger(pageRecord.sortOrder)) {
		return `sortOrder must be an integer (got ${JSON.stringify(pageRecord.sortOrder)})`;
	}
	if (typeof pageRecord.isActive !== 'boolean') {
		return `isActive must be true or false (got ${JSON.stringify(pageRecord.isActive)})`;
	}
	return '';
};

module.exports = { refusalOfPageRecord };
