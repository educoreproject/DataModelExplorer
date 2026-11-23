'use strict';
// account-mail-fills.test.js — gate for WORKORDER-approvalLooseEnds-112126 L2: an account email never quietly fills an
// absent text with ''. Every <!token!> a message's template names is REQUIRED unless the message's optionalFillList in
// lib/user-account-mail-vocabulary.json declares it optional; a required fill that is absent, null, or only spaces is
// refused by name when the mail is composed, exactly as an absent action URL is. An optional fill that is absent leaves
// its whole paragraph out, so no label is left dangling.
//
//   F1 every message composes when given every fill its own template names
//   F2 for every message and every required fill: absent, and only spaces, each refused by name (no "Hello ,")
//   F3 every optional fill: absent or '' composes, and its paragraph (label and all) is gone from subject, text and html
//   F4 the optional list is short and justified: exactly the fills named in OPTIONAL_FILL_EXPECTATION below
//   F5 approvalDecided (WORKORDER-accountMailLooseEnds-112326 E1): WITHOUT applicantMailNotSentText it is byte for byte
//      the notice composed before that work order (written out below, composed on origin/dev 59ee933); WITH it, the
//      notice names the failure and asks the approvers to tell the applicant
//
// The refusal is a throw (a code fault), so each refused compose runs in a child process and is read from its stderr.
//
// Run: node server/test/account-mail-fills.test.js

const path = require('path');
const { spawnSync } = require('child_process');

const serverPath = path.join(__dirname, '..');
const mailModulePath = path.join(serverPath, 'lib', 'user-account-mail');
const { accountMailOf } = require(mailModulePath);
const { messageByName } = require(path.join(serverPath, 'lib', 'user-account-mail-vocabulary.json'));

const SITE_URL = 'https://site.example.org';
const TOKEN_PATTERN = /<!([A-Za-z0-9_]+)!>/g;
// originHost is the composer's own (from siteUrl), never a caller's fill
const COMPOSER_FILL_NAME_LIST = ['originHost'];
// the fills that may be absent, by message (L2: the applicant's comment is the only one)
// approvalDecided's applicantMailNotSentText: WORKORDER-accountMailLooseEnds-112326 E1 (justified in the vocabulary's _optionalFillList)
const OPTIONAL_FILL_EXPECTATION = Object.freeze({ approvalDecided: ['applicantMailNotSentText'], approvalRequest: ['applicationCommentText'], newAccountNotice: ['applicationCommentText'] });

let passCount = 0;
let failCount = 0;
const check = (checkName, condition, detailText = '') => {
	if (condition) {
		passCount++;
	} else {
		failCount++;
	}
	console.log(`${condition ? 'PASS' : 'FAIL'} ${checkName}${condition || !detailText ? '' : `\n     ${detailText}`}`);
};

// every fill a message's template names: tokens in its subject and text paragraphs, and the URL fill of each action
const templateFillNameListOf = (messageEntry) => {
	const fillNameSet = new Set();
	[messageEntry.subjectText, ...messageEntry.paragraphList].forEach((paragraphEntry) => {
		if (typeof paragraphEntry === 'string') {
			[...paragraphEntry.matchAll(TOKEN_PATTERN)].forEach(([, fillName]) => fillNameSet.add(fillName));
		} else {
			fillNameSet.add(paragraphEntry.actionUrlFill);
		}
	});
	return [...fillNameSet].filter((fillName) => !COMPOSER_FILL_NAME_LIST.includes(fillName));
};
const actionFillNameListOf = (messageEntry) => messageEntry.paragraphList.filter((paragraphEntry) => typeof paragraphEntry !== 'string').map(({ actionUrlFill }) => actionUrlFill);

// a full fill set for a message: a recognizable word for each text, an address for each action and for siteUrl
const fullFillOf = (messageEntry) =>
	templateFillNameListOf(messageEntry).reduce((fillByName, fillName) => ({ ...fillByName, [fillName]: actionFillNameListOf(messageEntry).includes(fillName) ? `${SITE_URL}/action-${fillName}` : `filled-${fillName}` }), { siteUrl: SITE_URL });

const composeInChildOf = (messageName, fillByName) =>
	spawnSync(process.execPath, ['-e', `process.global = {}; require(${JSON.stringify(mailModulePath)}).accountMailOf(${JSON.stringify({ messageName, fillByName })})`], { encoding: 'utf8' });

const messageNameList = Object.keys(messageByName);

// F1
messageNameList.forEach((messageName) => {
	const composeResult = composeInChildOf(messageName, fullFillOf(messageByName[messageName]));
	check(`F1 ${messageName} composes with every fill its template names`, composeResult.status === 0, composeResult.stderr.slice(0, 300));
});

// F2
messageNameList.forEach((messageName) => {
	const messageEntry = messageByName[messageName];
	const optionalFillNameList = messageEntry.optionalFillList || [];
	const requiredTextFillNameList = templateFillNameListOf(messageEntry).filter((fillName) => !optionalFillNameList.includes(fillName) && !actionFillNameListOf(messageEntry).includes(fillName));
	requiredTextFillNameList.forEach((fillName) => {
		const absentFill = fullFillOf(messageEntry);
		delete absentFill[fillName];
		const absentResult = composeInChildOf(messageName, absentFill);
		const refusalPattern = new RegExp(`'${messageName}' needs fillByName\\.${fillName}\\b`);
		check(`F2 ${messageName} with ${fillName} absent is refused by name`, absentResult.status !== 0 && refusalPattern.test(absentResult.stderr), `status ${absentResult.status}; ${absentResult.stderr.slice(0, 300)}`);
		const blankResult = composeInChildOf(messageName, { ...fullFillOf(messageEntry), [fillName]: '   ' });
		check(`F2 ${messageName} with ${fillName} only spaces is refused by name`, blankResult.status !== 0 && refusalPattern.test(blankResult.stderr), `status ${blankResult.status}; ${blankResult.stderr.slice(0, 300)}`);
	});
});

// F3
messageNameList.forEach((messageName) => {
	const messageEntry = messageByName[messageName];
	(messageEntry.optionalFillList || []).forEach((fillName) => {
		const labelParagraphList = messageEntry.paragraphList.filter((paragraphEntry) => typeof paragraphEntry === 'string' && paragraphEntry.includes(`<!${fillName}!>`));
		const labelTextList = labelParagraphList.map((paragraphText) => paragraphText.split('<!')[0].trim()).filter(Boolean);
		[['absent', undefined], ['empty', '']].forEach(([formName, fillText]) => {
			const fillByName = fullFillOf(messageEntry);
			if (fillText === undefined) {
				delete fillByName[fillName];
			} else {
				fillByName[fillName] = fillText;
			}
			const composedMail = accountMailOf({ messageName, fillByName });
			const leftoverList = labelTextList.filter((labelText) => composedMail.text.includes(labelText) || composedMail.html.includes(labelText) || composedMail.subject.includes(labelText));
			check(`F3 ${messageName} with optional ${fillName} ${formName} composes and drops its line (${labelTextList.join(' | ') || 'no label'})`, !leftoverList.length && !/<!\w+!>/.test(composedMail.text + composedMail.html + composedMail.subject), `left over: ${JSON.stringify(leftoverList)}`);
			check(`F3 ${messageName} with optional ${fillName} ${formName} leaves no empty paragraph`, !/\n\n\n/.test(composedMail.text) && !/<p>\s*<\/p>/.test(composedMail.html), JSON.stringify(composedMail.text));
		});
	});
});

// F4
const declaredOptional = Object.fromEntries([...messageNameList].sort().filter((messageName) => (messageByName[messageName].optionalFillList || []).length).map((messageName) => [messageName, [...messageByName[messageName].optionalFillList].sort()]));
check('F4 the optional fills are exactly the applicant comment in the two approver notices, and the applicant-mail failure in the decision notice', JSON.stringify(declaredOptional) === JSON.stringify(OPTIONAL_FILL_EXPECTATION), JSON.stringify(declaredOptional));

// F5
const PRE_CHANGE_APPROVAL_DECIDED_MAIL = Object.freeze({"subject": "New EDUcore account appone: approved by ada (coming from site.example.org)", "text": "The account appone (App One, appone@example.org) on site.example.org was approved by ada. Nothing more is needed.\n\nDecline email to the applicant: not applicable\n\nThis message is coming from site.example.org.", "html": "<p>The account appone (App One, appone@example.org) on site.example.org was approved by ada. Nothing more is needed.</p>\n<p>Decline email to the applicant: not applicable</p>\n<p>This message is coming from site.example.org.</p>"});
const decidedFillByName = { username: 'appone', firstName: 'App', lastName: 'One', emailAdr: 'appone@example.org', decisionText: 'approved', deciderUsername: 'ada', declineEmailText: 'not applicable', siteUrl: 'https://site.example.org' };
['absent', 'empty'].forEach((formName) => {
	const decidedMail = accountMailOf({ messageName: 'approvalDecided', fillByName: formName === 'absent' ? decidedFillByName : { ...decidedFillByName, applicantMailNotSentText: '' } });
	check(`F5 approvalDecided with applicantMailNotSentText ${formName} is byte for byte the pre-change notice`, ['subject', 'text', 'html'].every((partName) => decidedMail[partName] === PRE_CHANGE_APPROVAL_DECIDED_MAIL[partName]), JSON.stringify(decidedMail.text));
});
const notSentText = 'One thing IS needed: the email telling the applicant could not be sent (the mail service could not be reached). Please tell them yourself.';
const notSentMail = accountMailOf({ messageName: 'approvalDecided', fillByName: { ...decidedFillByName, applicantMailNotSentText: notSentText } });
check('F5 approvalDecided with applicantMailNotSentText names the failure in text and html, and is otherwise the pre-change notice', notSentMail.subject === PRE_CHANGE_APPROVAL_DECIDED_MAIL.subject && notSentMail.text.includes(notSentText) && notSentMail.html.includes(`<p>${notSentText}</p>`) && notSentMail.text.replace(`${notSentText}\n\n`, '') === PRE_CHANGE_APPROVAL_DECIDED_MAIL.text, JSON.stringify(notSentMail.text));

console.log(`\naccount-mail-fills: ${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
