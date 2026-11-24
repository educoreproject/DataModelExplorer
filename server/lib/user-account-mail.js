#!/usr/bin/env node
'use strict';

// user-account-mail.js — composes the account emails and the public replies from user-account-mail-vocabulary.json
// (PLAN-userRegistrationReset-112026 4.7). The words are data; this file only fills tokens and builds a plain-text and a
// simple HTML part from the same paragraphs, so a text-only reader sees exactly what the HTML says.
//
//   accountMailOf({ messageName, fillByName }) -> { subject, text, html }   (an unknown messageName throws: a code fault)
//   accountReplyOf(replyName)                  -> the reply text            (an unknown replyName throws)
//   approvalWordingOf(decisionName)            -> { decisionText, applicantMessageName } (an unknown decision throws)
//   applicationCommentTextOf(applicationComment) -> the comment, or applicationCommentAbsentText (A8)
//   lifetimeTextOf(minuteCount)                -> '60 minutes', '24 hours'
//
// Every filled value is HTML-escaped in the html part; a paragraph that is exactly one URL becomes a link. A paragraph
// may instead be an ACTION, { actionUrlFill, actionLabelText } (WORKORDER-approvalMailPolish-112126 P1): a button in the
// html part, its label and URL in the text part; its fill must be an http(s) URL or the compose throws. Every message
// says where it came from (WORKORDER-adminApproval-112126 A3): originText's suffix on the subject and its paragraph last,
// with the host of the siteUrl fill, which every message must carry. The vocabulary names the site by that host alone
// (<!originHost!>), never as an address: the only URLs in a message are its actions (P2).
// A paragraph may also be IMPORTANT, { importantText } (WORKORDER-accountMailFailureAndApprovalNotice-112326 M4: the
// sentence telling an applicant an administrator must approve the account): in the html part an amber callout box, its
// optional heading bold above coloured text; in the text part heading and text on a line of their own starting with the
// vocabulary's importantParagraph.textPrefixText.
// Every fill a message names is required (WORKORDER-approvalLooseEnds-112126 L2): composing it with a fill absent, null,
// empty or only spaces throws by name, as an absent action URL does; nothing is quietly filled with ''. Only the fills
// in the message's optionalFillList may be absent, and an absent one removes its whole paragraph.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const path = require('path');

const VOCABULARY_FILE_PATH = path.join(__dirname, 'user-account-mail-vocabulary.json');
const REQUIRED_MESSAGE_NAME_LIST = ['passwordReset', 'passwordChanged', 'confirmEmail', 'newAccountNotice', 'approvalRequest', 'awaitingApproval', 'accountApproved', 'accountDeclined', 'approvalDecided'];
const REQUIRED_REPLY_NAME_LIST = [
	'resetRequested', 'confirmationResent', 'registeredCheckEmail', 'registeredSignedIn', 'passwordResetDone', 'registrationConfirmed',
	'registeredCheckEmailThenApproval', 'registeredAwaitingApproval', 'registrationConfirmedAwaitingApproval', 'accountApprovedReply', 'accountDeclinedReply',
	'accountApprovedMailNotSentReply', 'accountApprovedMailRefusedReply', 'accountDeclinedMailNotSentReply', 'accountDeclinedMailRefusedReply',
];
// WORKORDER-accountMailLooseEnds-112326 E1: the outcomes of an applicant's decision email, and the mail failure kinds
const DECISION_MAIL_OUTCOME_NAME_LIST = ['noMailFailure', 'transientMailFailure', 'otherMailFailure'];
const MAIL_FAILURE_KIND_NAME_LIST = ['transientMailFailure', 'otherMailFailure'];

const { messageByName, replyByName, originText, approvalWordingByDecision, declineEmailTextByCase, decisionReplyNameByMailOutcome, applicantMailNotSentTextByKind, applicationCommentAbsentText, importantParagraph, approvalNotice } = require(VOCABULARY_FILE_PATH);
if (!approvalNotice || typeof approvalNotice.headingText !== 'string' || !approvalNotice.headingText || typeof approvalNotice.sentenceText !== 'string' || !approvalNotice.sentenceText) {
	throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: approvalNotice needs headingText and sentenceText (WORKORDER-accountMailFailureAndApprovalNotice-112326 M4)`);
}
if (!importantParagraph || typeof importantParagraph.textPrefixText !== 'string' || !importantParagraph.textPrefixText.trim()) {
	throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: importantParagraph.textPrefixText is missing (WORKORDER-accountMailFailureAndApprovalNotice-112326 M4)`);
}
if (typeof applicationCommentAbsentText !== 'string' || !applicationCommentAbsentText) {
	throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: applicationCommentAbsentText is missing (WORKORDER-adminApproval-112126 A8)`);
}
if (!originText || typeof originText.subjectSuffixText !== 'string' || !/<!originHost!>/.test(originText.subjectSuffixText) || typeof originText.paragraphText !== 'string' || !/<!originHost!>/.test(originText.paragraphText)) {
	throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: originText needs subjectSuffixText and paragraphText, each carrying <!originHost!> (WORKORDER-adminApproval-112126 A3)`);
}
// a paragraph is text; an action: { actionUrlFill: the fill holding its URL, actionLabelText: the button's words }; or
// important text (M4): { importantHeadingText (optional), importantText }
const isActionParagraph = (paragraphEntry) => paragraphEntry !== null && typeof paragraphEntry === 'object' && Object.prototype.hasOwnProperty.call(paragraphEntry, 'actionUrlFill');
const isImportantParagraph = (paragraphEntry) => paragraphEntry !== null && typeof paragraphEntry === 'object' && Object.prototype.hasOwnProperty.call(paragraphEntry, 'importantText');
const isValidParagraph = (paragraphEntry) =>
	typeof paragraphEntry === 'string' ||
	(isActionParagraph(paragraphEntry) && Object.keys(paragraphEntry).length === 2 && typeof paragraphEntry.actionUrlFill === 'string' && !!paragraphEntry.actionUrlFill && typeof paragraphEntry.actionLabelText === 'string' && !!paragraphEntry.actionLabelText) ||
	(isImportantParagraph(paragraphEntry) &&
		Object.keys(paragraphEntry).every((propertyName) => ['importantHeadingText', 'importantText'].includes(propertyName)) &&
		typeof paragraphEntry.importantText === 'string' && !!paragraphEntry.importantText.trim() &&
		(paragraphEntry.importantHeadingText === undefined || (typeof paragraphEntry.importantHeadingText === 'string' && !!paragraphEntry.importantHeadingText.trim())));
// the words of a text or important paragraph, the template its fills are read from ('' for an action)
const paragraphTemplateTextOf = (paragraphEntry) => (typeof paragraphEntry === 'string' ? paragraphEntry : isImportantParagraph(paragraphEntry) ? `${paragraphEntry.importantHeadingText || ''} ${paragraphEntry.importantText}` : '');
REQUIRED_MESSAGE_NAME_LIST.forEach((messageName) => {
	const messageEntry = (messageByName || {})[messageName];
	if (!messageEntry || typeof messageEntry.subjectText !== 'string' || !Array.isArray(messageEntry.paragraphList) || !messageEntry.paragraphList.length) {
		throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: messageByName.${messageName} needs subjectText and a non-empty paragraphList`);
	}
	if (!messageEntry.paragraphList.every(isValidParagraph)) {
		throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: messageByName.${messageName}.paragraphList holds a paragraph that is not text, { actionUrlFill, actionLabelText } or { importantHeadingText, importantText }`);
	}
});

// the fills a text names, <!fillName!> -> fillName
const FILL_TOKEN_PATTERN = /<!([A-Za-z0-9_]+)!>/g;
const fillNameListOfText = (templateText) => [...String(templateText).matchAll(FILL_TOKEN_PATTERN)].map(([, fillName]) => fillName);
// originHost is the composer's own (from siteUrl), never a caller's fill
const COMPOSER_FILL_NAME_LIST = Object.freeze(['originHost']);

// L2 (WORKORDER-approvalLooseEnds-112126): every fill a message names is required unless its optionalFillList declares
// it. An optional fill may appear only in body text paragraphs (never the subject, never an action), because an absent
// one removes its whole paragraph.
Object.entries(messageByName || {}).forEach(([messageName, messageEntry]) => {
	const optionalFillList = messageEntry.optionalFillList === undefined ? [] : messageEntry.optionalFillList;
	const bodyTextFillNameList = messageEntry.paragraphList.filter((paragraphEntry) => typeof paragraphEntry === 'string').flatMap(fillNameListOfText);
	const isListValid = Array.isArray(optionalFillList) && optionalFillList.every((fillName) => typeof fillName === 'string' && bodyTextFillNameList.includes(fillName) && !fillNameListOfText(messageEntry.subjectText).includes(fillName));
	if (!isListValid) {
		throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: messageByName.${messageName}.optionalFillList must be a list of fills that its body text paragraphs name and its subject does not (got ${JSON.stringify(messageEntry.optionalFillList)})`);
	}
});
REQUIRED_REPLY_NAME_LIST.forEach((replyName) => {
	if (typeof (replyByName || {})[replyName] !== 'string' || !replyByName[replyName]) {
		throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: replyByName.${replyName} is missing`);
	}
});

Object.entries(approvalWordingByDecision || {}).forEach(([decisionName, wordingEntry]) => {
	if (!wordingEntry || typeof wordingEntry.decisionText !== 'string' || !(messageByName || {})[wordingEntry.applicantMessageName]) {
		throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: approvalWordingByDecision.${decisionName} needs decisionText and an applicantMessageName that is in messageByName`);
	}
});
['sent', 'suppressed', 'notApplicable', 'notSent'].forEach((caseName) => {
	if (typeof (declineEmailTextByCase || {})[caseName] !== 'string') {
		throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: declineEmailTextByCase.${caseName} is missing`);
	}
});
// E1: every decision has a reply for every mail outcome, each one a reply in replyByName; every failure kind has its notice text
Object.keys(approvalWordingByDecision || {}).forEach((decisionName) =>
	DECISION_MAIL_OUTCOME_NAME_LIST.forEach((outcomeName) => {
		const replyName = ((decisionReplyNameByMailOutcome || {})[decisionName] || {})[outcomeName];
		if (!replyName || typeof (replyByName || {})[replyName] !== 'string') {
			throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: decisionReplyNameByMailOutcome.${decisionName}.${outcomeName} must name a reply in replyByName (got ${JSON.stringify(replyName)})`);
		}
	}),
);
MAIL_FAILURE_KIND_NAME_LIST.forEach((kindName) => {
	if (typeof (applicantMailNotSentTextByKind || {})[kindName] !== 'string' || !applicantMailNotSentTextByKind[kindName].trim()) {
		throw new Error(`[${moduleName}] ${VOCABULARY_FILE_PATH}: applicantMailNotSentTextByKind.${kindName} is missing`);
	}
});

const HTML_ESCAPE_BY_CHARACTER = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });
const htmlEscapeOf = (plainText) => String(plainText).replace(/[&<>"']/g, (character) => HTML_ESCAPE_BY_CHARACTER[character]);

// token filling with a function replacer: qtTemplateReplace hands the value to String.replace as a replacement PATTERN,
// so a name containing $& or $1 would be rewritten (found 2026-11-20 with a first name of '$& x')
const filledTextOf = (templateText, fillByName) => String(templateText).replace(/<!([A-Za-z0-9_]+)!>/g, (wholeToken, fillName) => (Object.prototype.hasOwnProperty.call(fillByName, fillName) ? fillByName[fillName] : wholeToken));

// the host of a site address (https://demo.educore.dev -> demo.educore.dev), '' when it is not an http(s) address
const originHostOf = (siteUrl) => {
	const hostMatch = String(siteUrl || '').match(/^https?:\/\/([^\s/?#]+)/);
	return hostMatch ? hostMatch[1] : '';
};

// the button an action paragraph becomes in the html part: inline styles only, which Apple Mail and Gmail both honour
const ACTION_BUTTON_STYLE_TEXT = 'display:inline-block;padding:12px 22px;background-color:#1f5fa8;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px';
const ACTION_URL_PATTERN = /^https?:\/\/\S+$/;
// M4: the important paragraph in the html part, inline styles only (Apple Mail and Gmail): a tinted box, bold dark-amber text
const IMPORTANT_BOX_STYLE_TEXT = 'margin:20px 0;padding:14px 18px;background-color:#fff4e5;border:1px solid #fdba74;border-left:6px solid #c2410c;border-radius:6px';
const IMPORTANT_HEADING_STYLE_TEXT = 'margin:0 0 6px 0;color:#9a3412;font-weight:bold;font-size:17px';
const IMPORTANT_TEXT_STYLE_TEXT = 'margin:0;color:#9a3412;font-weight:bold';

// a fill is present when it holds something other than spaces; absent, null, '' and '  ' are all absent (L2)
const isFillPresent = (fillText) => fillText !== undefined && fillText !== null && String(fillText).trim() !== '';
// the present fills as text; an absent fill is LEFT OUT, never turned into '' (L2: no "Hello ,")
const presentFillOf = (fillByName) => Object.fromEntries(Object.entries(fillByName || {}).filter(([, fillText]) => isFillPresent(fillText)).map(([fillName, fillText]) => [fillName, String(fillText)]));

const accountMailOf = ({ messageName, fillByName }) => {
	const messageEntry = messageByName[messageName];
	if (!messageEntry) {
		throw new Error(`[${moduleName}] accountMailOf: '${messageName}' is not one of: ${Object.keys(messageByName).join(', ')}`);
	}
	// A3: every account mail says where it came from; a message composed without the site's address is a code fault
	const originHost = originHostOf((fillByName || {}).siteUrl);
	if (!originHost) {
		throw new Error(`[${moduleName}] accountMailOf: '${messageName}' needs fillByName.siteUrl, the instance's publicSiteUrl, to say where it is coming from`);
	}
	const plainFill = { ...presentFillOf(fillByName), originHost };
	// P1: an action whose URL is absent or not an address is a code fault, never a button to nowhere
	messageEntry.paragraphList.filter(isActionParagraph).forEach(({ actionUrlFill }) => {
		if (!ACTION_URL_PATTERN.test(plainFill[actionUrlFill] || '')) {
			throw new Error(`[${moduleName}] accountMailOf: '${messageName}' needs fillByName.${actionUrlFill}, an http(s) URL, for its action (got '${plainFill[actionUrlFill] || ''}')`);
		}
	});
	// L2: a required text fill that is absent is a code fault, refused by name like an absent action URL
	const optionalFillList = messageEntry.optionalFillList || [];
	const isFillAbsent = (fillName) => !COMPOSER_FILL_NAME_LIST.includes(fillName) && !Object.prototype.hasOwnProperty.call(plainFill, fillName);
	const missingFillNameList = [...new Set([messageEntry.subjectText, ...messageEntry.paragraphList.map(paragraphTemplateTextOf)].flatMap(fillNameListOfText))].filter((fillName) => !optionalFillList.includes(fillName) && isFillAbsent(fillName));
	if (missingFillNameList.length) {
		throw new Error(`[${moduleName}] accountMailOf: '${messageName}' needs ${missingFillNameList.map((fillName) => `fillByName.${fillName}`).join(', ')} (absent or blank; ${optionalFillList.length ? `only ${optionalFillList.join(', ')} may be left out of this message` : 'this message has no optional fill'})`);
	}
	// an optional fill that is absent takes its whole paragraph with it, so no label is left dangling
	const paragraphTemplateList = [...messageEntry.paragraphList.filter((paragraphEntry) => isActionParagraph(paragraphEntry) || !fillNameListOfText(paragraphTemplateTextOf(paragraphEntry)).some(isFillAbsent)), originText.paragraphText];
	const escapedFill = Object.fromEntries(Object.entries(plainFill).map(([fillName, fillText]) => [fillName, htmlEscapeOf(fillText)]));
	const plainParagraphList = paragraphTemplateList.map((paragraphTemplate) => {
		if (isActionParagraph(paragraphTemplate)) {
			return `${paragraphTemplate.actionLabelText}:\n${plainFill[paragraphTemplate.actionUrlFill]}`;
		}
		if (isImportantParagraph(paragraphTemplate)) {
			const headingText = paragraphTemplate.importantHeadingText ? `${filledTextOf(paragraphTemplate.importantHeadingText, plainFill)}. ` : '';
			return `${importantParagraph.textPrefixText}${headingText}${filledTextOf(paragraphTemplate.importantText, plainFill)}`;
		}
		return filledTextOf(paragraphTemplate, plainFill);
	});
	const escapedParagraphOf = (paragraphTemplateText) => filledTextOf(htmlEscapeOf(paragraphTemplateText).replace(/&lt;!([A-Za-z0-9_]+)!&gt;/g, '<!$1!>'), escapedFill);
	const htmlParagraphList = paragraphTemplateList.map((paragraphTemplate, paragraphIndex) => {
		if (isActionParagraph(paragraphTemplate)) {
			return `<p style="margin:24px 0"><a href="${htmlEscapeOf(plainFill[paragraphTemplate.actionUrlFill])}" style="${ACTION_BUTTON_STYLE_TEXT}">${htmlEscapeOf(paragraphTemplate.actionLabelText)}</a></p>`;
		}
		if (isImportantParagraph(paragraphTemplate)) {
			const headingHtml = paragraphTemplate.importantHeadingText ? `<p style="${IMPORTANT_HEADING_STYLE_TEXT}">${escapedParagraphOf(paragraphTemplate.importantHeadingText)}</p>` : '';
			return `<div style="${IMPORTANT_BOX_STYLE_TEXT}">${headingHtml}<p style="${IMPORTANT_TEXT_STYLE_TEXT}">${escapedParagraphOf(paragraphTemplate.importantText)}</p></div>`;
		}
		const plainParagraph = plainParagraphList[paragraphIndex];
		if (/^https?:\/\/\S+$/.test(plainParagraph)) {
			return `<p><a href="${htmlEscapeOf(plainParagraph)}">${htmlEscapeOf(plainParagraph)}</a></p>`;
		}
		return `<p>${escapedParagraphOf(paragraphTemplate)}</p>`;
	});
	return {
		subject: filledTextOf(`${messageEntry.subjectText}${originText.subjectSuffixText}`, plainFill),
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

// the wording of one approval decision (WORKORDER-adminApproval-112126); an unknown decision throws: a code fault
const approvalWordingOf = (decisionName) => {
	if (!Object.prototype.hasOwnProperty.call(approvalWordingByDecision || {}, decisionName)) {
		throw new Error(`[${moduleName}] approvalWordingOf: '${decisionName}' is not one of: ${Object.keys(approvalWordingByDecision || {}).join(', ')}`);
	}
	return approvalWordingByDecision[decisionName];
};

// the applicant's comment as the approvers' mail shows it (A8): the comment, or the vocabulary's word for none. The
// composer HTML-escapes it like every filled value.
const applicationCommentTextOf = (applicationComment) => (typeof applicationComment === 'string' && applicationComment.trim() ? applicationComment.trim() : applicationCommentAbsentText);

const lifetimeTextOf = (minuteCount) => (minuteCount % 60 === 0 && minuteCount >= 120 ? `${minuteCount / 60} hours` : `${minuteCount} minutes`);

module.exports = { approvalNotice: Object.freeze({ ...approvalNotice }), accountMailOf, accountReplyOf, approvalWordingOf, applicationCommentTextOf, lifetimeTextOf, filledTextOf, originHostOf, declineEmailTextByCase: Object.freeze({ ...declineEmailTextByCase }), decisionReplyNameByMailOutcome, applicantMailNotSentTextByKind: Object.freeze({ ...applicantMailNotSentTextByKind }) };
