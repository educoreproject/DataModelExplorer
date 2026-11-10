#!/usr/bin/env node
'use strict';
// @concept: [[UserDataPersistence]]
// @concept: [[SecurityFirstPattern]]

// user-profile-rules.js — the user-account rules (lib/user-profile-rules.json) and the refusals made from them
// (WORKORDER-userSqlAndSaveHole-111026). One place decides what a signed-in user may change on their own record, what a
// username may contain, and what each refusal is called, so the save endpoint, the admin access points and the user
// lookups refuse alike and by name.
//
//   selfSaveRefusalOf({ requestBody, signedInUserRefId }) -> '' or a refusal
//   selfSaveRecordOf({ requestBody, signedInUserRefId })  -> { refId: signedInUserRefId, ...the self-editable properties present,
//                                                             currentPassword beside a new password (verified, never saved) }
//   hasNewPassword(bodyObject)                            -> true when the body carries a non-blank password
//   usernameRefusalOf(usernameText)                        -> '' or a refusal (usernameNotAllowed)
//   textIdentifierRefusalOf(identifierByName)              -> '' or a refusal (identifierNotText) naming each non-text one
//   refusalOf(caseName, { detailList })                    -> { refusalName, httpStatus, reason }
//   refusalText(refusal)                                   -> 'refusalName: reason', for pipelines that pass error strings
//
// A refusal is a frozen { refusalName, httpStatus, reason }. A missing or malformed rules file is refused at load.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const path = require('path');

const RULES_FILE_PATH = path.join(__dirname, 'user-profile-rules.json');
const REQUIRED_CASE_NAME_LIST = ['noSignedInUser', 'bodyNotAnObject', 'notOwnRecord', 'propertyNotSelfEditable', 'usernameNotAllowed', 'identifierNotText', 'noSuchUser', 'passwordNotAccepted', 'currentPasswordRequired', 'currentPasswordWrong'];

// ---- loadRules - read the rules file and refuse, naming the entry, anything absent or malformed
const loadRules = () => {
	const rulesObject = require(RULES_FILE_PATH);
	const { selfEditablePropertyList, ownRecordPropertyName, currentPasswordPropertyName, passwordPropertyName, usernamePatternText, refusalByCase } = rulesObject;
	if (!Array.isArray(selfEditablePropertyList) || !selfEditablePropertyList.length || selfEditablePropertyList.some((propertyName) => typeof propertyName !== 'string')) {
		throw new Error(`[${moduleName}] ${RULES_FILE_PATH}: selfEditablePropertyList must be a non-empty list of property names`);
	}
	if (typeof ownRecordPropertyName !== 'string' || !ownRecordPropertyName) {
		throw new Error(`[${moduleName}] ${RULES_FILE_PATH}: ownRecordPropertyName must name the record's identifier property`);
	}
	if (selfEditablePropertyList.includes(ownRecordPropertyName)) {
		throw new Error(`[${moduleName}] ${RULES_FILE_PATH}: ownRecordPropertyName '${ownRecordPropertyName}' must not be self-editable`);
	}
	if (typeof currentPasswordPropertyName !== 'string' || !currentPasswordPropertyName || selfEditablePropertyList.includes(currentPasswordPropertyName)) {
		throw new Error(`[${moduleName}] ${RULES_FILE_PATH}: currentPasswordPropertyName must name a property outside selfEditablePropertyList`);
	}
	if (typeof passwordPropertyName !== 'string' || !selfEditablePropertyList.includes(passwordPropertyName)) {
		throw new Error(`[${moduleName}] ${RULES_FILE_PATH}: passwordPropertyName must name a property in selfEditablePropertyList, got ${JSON.stringify(passwordPropertyName)}`);
	}
	if (typeof usernamePatternText !== 'string' || !usernamePatternText.startsWith('^') || !usernamePatternText.endsWith('$')) {
		throw new Error(`[${moduleName}] ${RULES_FILE_PATH}: usernamePatternText must be an anchored pattern (^...$), got ${JSON.stringify(usernamePatternText)}`);
	}
	const missingCaseNameList = REQUIRED_CASE_NAME_LIST.filter((caseName) => {
		const refusalEntry = (refusalByCase || {})[caseName];
		return !refusalEntry || !refusalEntry.refusalName || !refusalEntry.reason || !Number.isInteger(refusalEntry.httpStatus);
	});
	if (missingCaseNameList.length) {
		throw new Error(`[${moduleName}] ${RULES_FILE_PATH}: refusalByCase lacks a complete { refusalName, httpStatus, reason } for: ${missingCaseNameList.join(', ')}`);
	}
	return { selfEditablePropertyList, ownRecordPropertyName, currentPasswordPropertyName, passwordPropertyName, usernamePattern: new RegExp(usernamePatternText), refusalByCase };
};

const { selfEditablePropertyList, ownRecordPropertyName, currentPasswordPropertyName, passwordPropertyName, usernamePattern, refusalByCase } = loadRules();

// a new password is a password property that is present and not blank; blank means 'unchanged' (profile-user drops it)
const hasNewPassword = (bodyObject) => ![undefined, null, ''].includes(bodyObject[passwordPropertyName]);

// ---- refusalOf - the named refusal, its reason filled with the property names or complaints concerned
const refusalOf = (caseName, { detailList } = {}) => {
	const refusalEntry = refusalByCase[caseName];
	if (!refusalEntry) {
		throw new Error(`[${moduleName}] refusalOf: '${caseName}' is not one of: ${Object.keys(refusalByCase).join(', ')}`);
	}
	return Object.freeze({
		refusalName: refusalEntry.refusalName,
		httpStatus: refusalEntry.httpStatus,
		reason: refusalEntry.reason.qtTemplateReplace({ detailListText: (detailList || []).join(', ') }),
	});
};

const refusalText = (refusal) => `${refusal.refusalName}: ${refusal.reason}`;

// ---- textIdentifierRefusalOf - an identifier headed for SQL must be text; an object escapes to `column` = value, which
// rewrites the WHERE clause even when every value is escaped
const textIdentifierRefusalOf = (identifierByName) => {
	const nonTextNameList = Object.keys(identifierByName).filter((identifierName) => typeof identifierByName[identifierName] !== 'string');
	return nonTextNameList.length ? refusalOf('identifierNotText', { detailList: nonTextNameList }) : '';
};

// ---- selfSaveRefusalOf - the whole saveUserData policy: a signed-in user, their own record, only listed properties
const selfSaveRefusalOf = ({ requestBody, signedInUserRefId }) => {
	if (typeof signedInUserRefId !== 'string' || !signedInUserRefId) {
		return refusalOf('noSignedInUser');
	}
	if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
		return refusalOf('bodyNotAnObject');
	}
	const bodyObject = requestBody;
	if (Object.prototype.hasOwnProperty.call(bodyObject, ownRecordPropertyName) && bodyObject[ownRecordPropertyName] !== signedInUserRefId) {
		return refusalOf('notOwnRecord');
	}
	// the current password is accepted only beside a new password, which it must accompany
	const acceptedNameList = hasNewPassword(bodyObject) ? [ownRecordPropertyName, currentPasswordPropertyName, ...selfEditablePropertyList] : [ownRecordPropertyName, ...selfEditablePropertyList];
	const refusedNameList = Object.keys(bodyObject).filter((propertyName) => !acceptedNameList.includes(propertyName));
	if (refusedNameList.length) {
		return refusalOf('propertyNotSelfEditable', { detailList: refusedNameList });
	}
	if (hasNewPassword(bodyObject) && [undefined, null, ''].includes(bodyObject[currentPasswordPropertyName])) {
		return refusalOf('currentPasswordRequired');
	}
	return '';
};

// ---- selfSaveRecordOf - the record to save, keyed on the SIGNED-IN user, never on the body (call after selfSaveRefusalOf).
// It carries the current password beside a new one, for user-save-data to verify and remove before anything is saved.
const selfSaveRecordOf = ({ requestBody, signedInUserRefId }) =>
	[...selfEditablePropertyList, ...(hasNewPassword(requestBody) ? [currentPasswordPropertyName] : [])].reduce(
		(saveRecord, propertyName) => (Object.prototype.hasOwnProperty.call(requestBody, propertyName) ? { ...saveRecord, [propertyName]: requestBody[propertyName] } : saveRecord),
		{ [ownRecordPropertyName]: signedInUserRefId },
	);

const usernameRefusalOf = (usernameText) => (typeof usernameText === 'string' && usernamePattern.test(usernameText) ? '' : refusalOf('usernameNotAllowed'));

module.exports = { selfSaveRefusalOf, selfSaveRecordOf, usernameRefusalOf, textIdentifierRefusalOf, refusalOf, refusalText, hasNewPassword, selfEditablePropertyList, currentPasswordPropertyName };
