#!/usr/bin/env node
'use strict';

// user-account-mail.js — composes the account emails and the public replies from user-account-mail-vocabulary.json
// (PLAN-userRegistrationReset-112026 4.7). The words are data; this file only fills tokens and builds a plain-text and a
// simple HTML part from the same paragraphs, so a text-only reader sees exactly what the HTML says.
//
//   accountMailOf({ messageName, fillByName }) -> { subject, text, html }   (an unknown messageName throws: a code fault)
//   accountReplyOf(replyName)                  -> the reply text            (an unknown replyName throws)
//   lifetimeTextOf(minuteCount)                -> '60 minutes', '24 hours'
//
// Every filled value is HTML-escaped in the html part; a paragraph that is exactly one URL becomes a link.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const path = require('path');

const VOCABULARY_FILE_PATH = path.join(__dirname, 'user-account-mail-vocabulary.json');
const REQUIRED_MESSAGE_NAME_LIST = ['passwordReset', 'passwordChanged', 'confirmEmail', 'newAccountNotice'];
const REQUIRED_REPLY_NAME_LIST = ['resetRequested', 'confirmationResent', 'registeredCheckEmail', 'registeredSignedIn', 'passwordResetDone', 'registrationConfirmed'];

const { messageByName, replyByName } = require(VOCABULARY_FILE_PATH);
REQUIRED_MESSAGE_NAME_LIST.forEach((messageName) => {
	const messageEntry = (messageByName || {})[messageName];
	if (!messageEntry || typeof messageEntry.subjectText !== 'string' || !Array.isArray(messageEntry.paragraphList) || !messageEntry.paragraphList.length) {
		throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: messageByName.${messageName} needs subjectText and a non-empty paragraphList`);
	}
});
REQUIRED_REPLY_NAME_LIST.forEach((replyName) => {
	if (typeof (replyByName || {})[replyName] !== 'string' || !replyByName[replyName]) {
		throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: replyByName.${replyName} is missing`);
	}
});

const HTML_ESCAPE_BY_CHARACTER = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });
const htmlEscapeOf = (plainText) => String(plainText).replace(/[&<>"']/g, (character) => HTML_ESCAPE_BY_CHARACTER[character]);

// token filling with a function replacer: qtTemplateReplace hands the value to String.replace as a replacement PATTERN,
// so a name containing $& or $1 would be rewritten (found 2026-11-20 with a first name of '$& x')
const filledTextOf = (templateText, fillByName) => String(templateText).replace(/<!([A-Za-z0-9_]+)!>/g, (wholeToken, fillName) => (Object.prototype.hasOwnProperty.call(fillByName, fillName) ? fillByName[fillName] : wholeToken));

const stringFillOf = (fillByName) => Object.fromEntries(Object.entries(fillByName || {}).map(([fillName, fillText]) => [fillName, String(fillText === undefined || fillText === null ? '' : fillText)]));

const accountMailOf = ({ messageName, fillByName }) => {
	const messageEntry = messageByName[messageName];
	if (!messageEntry) {
		throw new Error(`[${moduleName}] accountMailOf: '${messageName}' is not one of: ${Object.keys(messageByName).join(', ')}`);
	}
	const plainFill = stringFillOf(fillByName);
	const escapedFill = Object.fromEntries(Object.entries(plainFill).map(([fillName, fillText]) => [fillName, htmlEscapeOf(fillText)]));
	const plainParagraphList = messageEntry.paragraphList.map((paragraphTemplate) => filledTextOf(paragraphTemplate, plainFill));
	const htmlParagraphList = messageEntry.paragraphList.map((paragraphTemplate, paragraphIndex) => {
		const plainParagraph = plainParagraphList[paragraphIndex];
		if (/^https?:\/\/\S+$/.test(plainParagraph)) {
			return `<p><a href="${htmlEscapeOf(plainParagraph)}">${htmlEscapeOf(plainParagraph)}</a></p>`;
		}
		return `<p>${filledTextOf(htmlEscapeOf(paragraphTemplate).replace(/&lt;!([A-Za-z0-9_]+)!&gt;/g, '<!$1!>'), escapedFill)}</p>`;
	});
	return {
		subject: filledTextOf(messageEntry.subjectText, plainFill),
		text: plainParagraphList.join('\n\n'),
		html: htmlParagraphList.join('\n'),
	};
};

const accountReplyOf = (replyName) => {
	if (!replyByName[replyName]) {
		throw new Error(`[${moduleName}] accountReplyOf: '${replyName}' is not one of: ${Object.keys(replyByName).join(', ')}`);
	}
	return replyByName[replyName];
};

const lifetimeTextOf = (minuteCount) => (minuteCount % 60 === 0 && minuteCount >= 120 ? `${minuteCount / 60} hours` : `${minuteCount} minutes`);

module.exports = { accountMailOf, accountReplyOf, lifetimeTextOf, filledTextOf };
