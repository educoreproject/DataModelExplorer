#!/usr/bin/env node
'use strict';
// @concept: [[UserDataPersistence]]
// @concept: [[SecurityFirstPattern]]

// user-profile-rules.js — the user-account rules (lib/user-profile-rules.json) and the refusals made from them
// (WORKORDER-userSqlAndSaveHole-111026). One place decides what a signed-in user may change on their own record, how long
// and what shape each value may be, what a username may contain, and what each refusal is called, so the save endpoint,
// the admin access points, the credential entry points and the token check refuse alike and by name.
//
//   selfSaveRefusalOf({ requestBody, signedInUserRefId }) -> '' or a refusal
//   selfSaveRecordOf({ requestBody, signedInUserRefId })  -> { refId: signedInUserRefId, ...the self-editable properties present,
//                                                             currentPassword beside a new password (verified, never saved) }
//   hasNewPassword(bodyObject)                            -> true when the body carries a non-blank password
//   isBlank(propertyValue)                                -> true for undefined, null and ''
//   valueLengthRefusalOf(recordObject)                    -> '' or a refusal (propertyTooLong) naming each over-long property
//   adminSaveRefusalOf(userData)                          -> '' or a refusal (propertyNotAdminEditable) naming each unknown property
//   usernameRefusalOf(usernameText)                       -> '' or a refusal (usernameNotAllowed)
//   textIdentifierRefusalOf(identifierByName)             -> '' or a refusal (identifierNotText) naming each non-text one
//   refusalOf(caseName, { detailList })                   -> { refusalName, httpStatus, reason }
//   refusalText(refusal)                                  -> 'refusalName: reason', for pipelines that pass error strings
//
// A refusal is a frozen { refusalName, httpStatus, reason }. A missing or malformed rules file is refused at load.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const path = require('path');

const RULES_FILE_PATH = path.join(__dirname, 'user-profile-rules.json');
const REQUIRED_CASE_NAME_LIST = [
	'noSignedInUser', 'bodyNotAnObject', 'notOwnRecord', 'propertyNotSelfEditable', 'propertyNotAdminEditable', 'propertyValueNotText', 'propertyTooLong', 'emailAdrNotValid',
	'usernameNotAllowed', 'identifierNotText', 'noSuchUser', 'passwordNotAccepted', 'currentPasswordRequired', 'currentPasswordWrong', 'sessionRevoked',
];
const BLANK_VALUE_LIST = Object.freeze([undefined, null, '']);

// ---- refuseRules - a malformed rules file stops the server at load, naming the entry
const refuseRules = (problemText) => {
	throw new Error(`[${moduleName}] ${RULES_FILE_PATH}: ${problemText}`);
};

// ---- loadRules - read the rules file and refuse, naming the entry, anything absent or malformed
const loadRules = () => {
	const rulesObject = require(RULES_FILE_PATH);
	const { selfEditablePropertyList, adminEditablePropertyList, ownRecordPropertyName, currentPasswordPropertyName, passwordPropertyName, maxLengthByPropertyName, emailPatternText, usernamePatternText, refusalByCase } = rulesObject;
	if (!Array.isArray(selfEditablePropertyList) || !selfEditablePropertyList.length || selfEditablePropertyList.some((propertyName) => typeof propertyName !== 'string')) {
		refuseRules('selfEditablePropertyList must be a non-empty list of property names');
	}
	if (!Array.isArray(adminEditablePropertyList) || !adminEditablePropertyList.length || adminEditablePropertyList.some((propertyName) => typeof propertyName !== 'string')) {
		refuseRules('adminEditablePropertyList must be a non-empty list of property names');
	}
	if (typeof ownRecordPropertyName !== 'string' || !ownRecordPropertyName || selfEditablePropertyList.includes(ownRecordPropertyName)) {
		refuseRules('ownRecordPropertyName must name the record\'s identifier property, outside selfEditablePropertyList');
	}
	if (typeof currentPasswordPropertyName !== 'string' || !currentPasswordPropertyName || selfEditablePropertyList.includes(currentPasswordPropertyName)) {
		refuseRules('currentPasswordPropertyName must name a property outside selfEditablePropertyList');
	}
	if (typeof passwordPropertyName !== 'string' || !selfEditablePropertyList.includes(passwordPropertyName)) {
		refuseRules(`passwordPropertyName must name a property in selfEditablePropertyList, got ${JSON.stringify(passwordPropertyName)}`);
	}
	const limitedNameList = [...selfEditablePropertyList, currentPasswordPropertyName];
	const unlimitedNameList = limitedNameList.filter((propertyName) => !Number.isInteger((maxLengthByPropertyName || {})[propertyName]) || maxLengthByPropertyName[propertyName] < 1);
	if (unlimitedNameList.length) {
		refuseRules(`maxLengthByPropertyName needs a positive whole-number limit for: ${unlimitedNameList.join(', ')}`);
	}
	[['emailPatternText', emailPatternText], ['usernamePatternText', usernamePatternText]].forEach(([patternName, patternText]) => {
		if (typeof patternText !== 'string' || !patternText.startsWith('^') || !patternText.endsWith('$')) {
			refuseRules(`${patternName} must be an anchored pattern (^...$), got ${JSON.stringify(patternText)}`);
		}
	});
	const missingCaseNameList = REQUIRED_CASE_NAME_LIST.filter((caseName) => {
		const refusalEntry = (refusalByCase || {})[caseName];
		return !refusalEntry || !refusalEntry.refusalName || !refusalEntry.reason || !Number.isInteger(refusalEntry.httpStatus);
	});
	if (missingCaseNameList.length) {
		refuseRules(`refusalByCase lacks a complete { refusalName, httpStatus, reason } for: ${missingCaseNameList.join(', ')}`);
	}
	return {
		selfEditablePropertyList, adminEditablePropertyList, ownRecordPropertyName, currentPasswordPropertyName, passwordPropertyName, maxLengthByPropertyName, refusalByCase,
		emailPattern: new RegExp(emailPatternText),
		usernamePattern: new RegExp(usernamePatternText),
	};
};

const { selfEditablePropertyList, adminEditablePropertyList, ownRecordPropertyName, currentPasswordPropertyName, passwordPropertyName, maxLengthByPropertyName, refusalByCase, emailPattern, usernamePattern } = loadRules();

const isBlank = (propertyValue) => BLANK_VALUE_LIST.includes(propertyValue);

// a new password is a password property that is present and not blank; blank means 'unchanged' (profile-user drops it)
const hasNewPassword = (bodyObject) => !isBlank(bodyObject[passwordPropertyName]);

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

// ---- valueLengthRefusalOf - every limited property present in the record is within its limit (self-save and admin paths)
const valueLengthRefusalOf = (recordObject) => {
	const overLongNameList = Object.keys(maxLengthByPropertyName).filter((propertyName) => typeof recordObject[propertyName] === 'string' && recordObject[propertyName].length > maxLengthByPropertyName[propertyName]);
	return overLongNameList.length ? refusalOf('propertyTooLong', { detailList: overLongNameList }) : '';
};

// ---- selfSaveRefusalOf - the whole saveUserData policy: a signed-in user, their own record, only listed properties,
// text values within their limits, a well-formed email, and the current password beside a new one
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
	// a non-text value would be dropped silently by saveObject or escaped into SQL as `column` = value: refuse it
	const nonTextNameList = Object.keys(bodyObject).filter((propertyName) => propertyName !== ownRecordPropertyName && !isBlank(bodyObject[propertyName]) && typeof bodyObject[propertyName] !== 'string');
	if (nonTextNameList.length) {
		return refusalOf('propertyValueNotText', { detailList: nonTextNameList });
	}
	const lengthRefusal = valueLengthRefusalOf(bodyObject);
	if (lengthRefusal) {
		return lengthRefusal;
	}
	if (typeof bodyObject.emailAdr === 'string' && bodyObject.emailAdr !== '' && !emailPattern.test(bodyObject.emailAdr)) {
		return refusalOf('emailAdrNotValid');
	}
	if (hasNewPassword(bodyObject) && isBlank(bodyObject[currentPasswordPropertyName])) {
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

// ---- adminSaveRefusalOf - an admin create or update carries only adminEditablePropertyList; anything else is named
const adminSaveRefusalOf = (userData) => {
	const refusedNameList = Object.keys(userData || {}).filter((propertyName) => !adminEditablePropertyList.includes(propertyName));
	return refusedNameList.length ? refusalOf('propertyNotAdminEditable', { detailList: refusedNameList }) : '';
};

const usernameRefusalOf = (usernameText) => (typeof usernameText === 'string' && usernamePattern.test(usernameText) ? '' : refusalOf('usernameNotAllowed'));

module.exports = {
	selfSaveRefusalOf, selfSaveRecordOf, adminSaveRefusalOf, usernameRefusalOf, textIdentifierRefusalOf, valueLengthRefusalOf, refusalOf, refusalText, hasNewPassword, isBlank,
	selfEditablePropertyList, currentPasswordPropertyName,
};
