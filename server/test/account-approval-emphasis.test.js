'use strict';
// account-approval-emphasis.test.js — gate for WORKORDER-accountMailFailureAndApprovalNotice-112326 M4: wherever a
// person is told that an administrator must approve their account, the sentence is set apart.
//
//   E1 mail: every message an APPLICANT receives (every vocabulary message but the approvers' three) is composed; each
//      sentence in it that speaks of an administrator approving or reviewing sits, in the html part, inside the
//      important box (bold, coloured) and, in the text part, on a line of its own starting "IMPORTANT: ". At least one
//      such sentence must be found, so the check cannot pass empty.
//   E2 the replies that carry an approval message are flagged for the page (isAwaitingApproval or
//      isApprovalAfterConfirmation), from the REAL register and confirm endpoints
//   E3 browser: every place found that shows an approval sentence renders it through AccountApprovalNotice, and that
//      component is a warning alert in bold; no account page shows registerApprovalNoticeText any other way
//      (with html/tests/accountApproval/accountMailOutcome.test.mjs, the store's reading of the replies, run from here)
//   (The OAuth sign-in page's awaiting-approval refusal is checked in admin-approval.test.js P1.2.)
//
// Run: node server/test/account-approval-emphasis.test.js

const fs = require('fs');
const path = require('path');
const { httpPost } = require('./lib/userAccountHarness');
const { bootAccountFlowServer, tokenOfMail } = require('./lib/accountFlowHarness');
const { accountMailOf, accountReplyOf } = require('../lib/user-account-mail');
const { messageByName, replyByName } = require('../lib/user-account-mail-vocabulary.json');

const htmlDirPath = path.join(__dirname, '..', '..', 'html');
const REGISTRATION_ACCESS_POINT_NAME_LIST = ['user-registration-register', 'user-registration-confirm', 'user-registration-resend', 'user-registration-options'];
const REGISTRATION_ENDPOINT_FILE_NAME_LIST = ['register-user.js', 'confirm-registration.js', 'resend-confirmation.js', 'registration-options.js'];
// the approvers' messages: they tell an administrator to approve, not a person that they must wait for one
const APPROVER_MESSAGE_NAME_LIST = ['approvalRequest', 'approvalDecided', 'newAccountNotice'];
// the ruling's own words for the text part (M4: "a line of its own, e.g. starting IMPORTANT:")
const IMPORTANT_PREFIX_TEXT = 'IMPORTANT: ';
// a sentence that tells someone an administrator must approve (or review) the account
const APPROVAL_SENTENCE_PATTERN = /administrator[^.]*(approv|review)|(approv|review)[^.]*administrator/i;

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

// ---- E1
const SAMPLE_FILL_BY_NAME = Object.freeze({
	firstName: 'Pat', lastName: 'Lee', username: 'pat', emailAdr: 'pat@example.org', lifetimeText: '60 minutes', siteUrl: 'https://site.example.org',
	linkUrl: 'https://site.example.org/confirm?token=abc', forgotPasswordUrl: 'https://site.example.org/forgot-password', signInUrl: 'https://site.example.org/login',
	approvalPageUrl: 'https://site.example.org/account-approval?userRefId=1', confirmationText: 'yes', applicationCommentText: '(none)', decisionText: 'approved', deciderUsername: 'admin', declineEmailText: 'sent',
});
const sentenceListOf = (plainText) => String(plainText).split(/(?<=[.!?])\s+/).map((sentenceText) => sentenceText.trim()).filter(Boolean);
const IMPORTANT_HTML_PATTERN = /<div style="[^"]*background-color:[^"]*border-left:[^"]*"><p style="[^"]*color:#[0-9a-f]{6};font-weight:bold">([^<]*)<\/p><\/div>/g;
const applicantMessageNameList = Object.keys(messageByName).filter((messageName) => !APPROVER_MESSAGE_NAME_LIST.includes(messageName));
let approvalSentenceCount = 0;
applicantMessageNameList.forEach((messageName) => {
	const composedMail = accountMailOf({ messageName, fillByName: SAMPLE_FILL_BY_NAME });
	const importantHtmlTextList = [...composedMail.html.matchAll(IMPORTANT_HTML_PATTERN)].map(([, innerText]) => innerText);
	const htmlOutsideImportantText = composedMail.html.replace(IMPORTANT_HTML_PATTERN, '').replace(/<[^>]+>/g, ' ');
	const textLineList = composedMail.text.split('\n');
	textLineList.forEach((lineText) => {
		sentenceListOf(lineText.replace(new RegExp(`^${IMPORTANT_PREFIX_TEXT}`), '')).filter((sentenceText) => APPROVAL_SENTENCE_PATTERN.test(sentenceText)).forEach((sentenceText) => {
			approvalSentenceCount += 1;
			check(`E1 ${messageName} text part: "${sentenceText}" is on a line of its own starting IMPORTANT:`, lineText === `${IMPORTANT_PREFIX_TEXT}${sentenceText}`, lineText);
			check(`E1 ${messageName} html part: "${sentenceText}" is inside the important box`, importantHtmlTextList.some((innerText) => innerText.includes(sentenceText.replace(/'/g, '&#39;'))), composedMail.html);
		});
	});
	const looseApprovalSentenceList = sentenceListOf(htmlOutsideImportantText.replace(/\s+/g, ' ')).filter((sentenceText) => APPROVAL_SENTENCE_PATTERN.test(sentenceText));
	check(`E1 ${messageName} html part: no approval sentence outside the important box`, !looseApprovalSentenceList.length, JSON.stringify(looseApprovalSentenceList));
});
check('E1 at least one applicant approval sentence was found and checked (awaitingApproval)', approvalSentenceCount >= 1, String(approvalSentenceCount));

// ---- E3
const sourceOf = (relativePath) => fs.readFileSync(path.join(htmlDirPath, relativePath), 'utf8');
const noticeComponentText = sourceOf('components/AccountApprovalNotice.vue');
check('E3 AccountApprovalNotice is a warning alert, bold', /<v-alert type="warning"[^>]*>\{\{ noticeText \}\}<\/v-alert>/.test(noticeComponentText) && /\.account-approval-notice\s*\{\s*font-weight:\s*700;/.test(noticeComponentText), noticeComponentText);
// each place: the file, what it shows, and the pattern that proves it goes through AccountApprovalNotice
const APPROVAL_PLACE_LIST = [
	{ placeName: 'register.vue sign-up explainer (registerApprovalNoticeText)', relativePath: 'pages/register.vue', pattern: /<AccountApprovalNotice v-if="accountStore\.registrationOptions\.requireAdminApproval" :notice-text="accountVocabulary\.registerApprovalNoticeText"/ },
	{ placeName: 'register.vue after sign-up (an approval reply)', relativePath: 'pages/register.vue', pattern: /<AccountApprovalNotice v-else-if="accountStore\.isApprovalNotice" :notice-text="accountStore\.noticeMsg"/ },
	{ placeName: 'register.vue after sign-up, confirmation mail not sent, approval to follow', relativePath: 'pages/register.vue', pattern: /<AccountApprovalNotice v-if="accountStore\.isMailNotSent && accountStore\.isApprovalNotice" :notice-text="accountVocabulary\.registerApprovalNoticeText"/ },
	{ placeName: 'confirm.vue after the address is confirmed (registrationConfirmedAwaitingApproval)', relativePath: 'pages/confirm.vue', pattern: /<AccountApprovalNotice v-if="accountStore\.isAwaitingApproval" :notice-text="accountStore\.noticeMsg"/ },
	{ placeName: 'form_login.vue sign-in refused awaitingApproval', relativePath: 'components/form_login.vue', pattern: /<AccountApprovalNotice v-if="LoginStore\.statusMsg && LoginStore\.loginRefusalName === 'awaitingApproval'" :notice-text="LoginStore\.statusMsg"/ },
];
APPROVAL_PLACE_LIST.forEach(({ placeName, relativePath, pattern }) => check(`E3 ${placeName} is shown through AccountApprovalNotice`, pattern.test(sourceOf(relativePath))));
['pages/register.vue', 'pages/confirm.vue', 'pages/forgot-password.vue', 'pages/reset-password.vue', 'components/form_login.vue'].forEach((relativePath) => {
	const looseUseList = sourceOf(relativePath).split('\n').filter((lineText) => /registerApprovalNoticeText/.test(lineText) && !/<AccountApprovalNotice /.test(lineText));
	check(`E3 ${relativePath} shows registerApprovalNoticeText only through AccountApprovalNotice`, !looseUseList.length, looseUseList.join(' | '));
});
check('E3 the store sets isApprovalNotice from an approval reply and on a confirmation awaiting approval', /this\.isApprovalNotice = isApprovalReply\(response\.data\[0\]\);/.test(sourceOf('stores/accountStore.js')) && /this\.isAwaitingApproval = true;\s*this\.isApprovalNotice = true;/.test(sourceOf('stores/accountStore.js')));

// E3: the store's reading of the replies (components/accountMailOutcome.js), its own browser test run here so CI runs it
const outcomeTestRun = require('child_process').spawnSync(process.execPath, [path.join(htmlDirPath, 'tests', 'accountApproval', 'accountMailOutcome.test.mjs')], { encoding: 'utf8' });
check('E3 html/tests/accountApproval/accountMailOutcome.test.mjs passes (M3 not-sent and M4 approval replies read by name)', outcomeTestRun.status === 0, `${outcomeTestRun.stdout.slice(-300)} ${outcomeTestRun.stderr.slice(0, 300)}`);

// ---- E2
const bootWith = (registrationSettingOverrideByName, callback) =>
	bootAccountFlowServer({ registrationSettingOverrideByName, seedUserList: [{ username: 'alice', password: 'alice-original-pass', first: 'Alice', last: 'Able', emailAdr: 'alice@example.org', phone: '', source: 'test', role: 'user', disabled: '' }], accessPointNameList: REGISTRATION_ACCESS_POINT_NAME_LIST, endpointFileNameList: REGISTRATION_ENDPOINT_FILE_NAME_LIST }, (bootError, harness) => {
		if (bootError) {
			check('a harness booted', false, bootError);
			process.exit(1);
		}
		callback(harness);
	});
const postTo = (harness) => (routePath, requestBody, callback) => httpPost({ baseUrl: harness.baseUrl, routePath, requestBody }, (errText, response) => {
	if (errText) {
		check(`HTTP ${routePath}`, false, errText);
	}
	callback(response || {});
});
const firstReplyOf = (response) => (Array.isArray(response.bodyJson) ? response.bodyJson[0] || {} : {});
const newcomerOf = (overrideByName = {}) => ({ username: 'newcomer', password: 'newcomer-pass-1', first: 'New', last: 'Comer', emailAdr: 'new.comer@example.org', ...overrideByName });

const finish = () => {
	const failedCount = resultList.filter((passed) => !passed).length;
	console.log(`account-approval-emphasis: ${resultList.length - failedCount} passed, ${failedCount} failed`);
	process.exit(failedCount ? 1 : 0);
};

bootWith({ requireAdminApproval: 'true' }, (confirmingHarness) => {
	const post = postTo(confirmingHarness);
	post('/api/registerUser', newcomerOf(), (registerResponse) => {
		const registerReply = firstReplyOf(registerResponse);
		check('E2 approval after confirmation: the register reply is flagged isApprovalAfterConfirmation', registerReply.message === accountReplyOf('registeredCheckEmailThenApproval') && registerReply.isApprovalAfterConfirmation === true, JSON.stringify(registerReply));
		const confirmMail = confirmingHarness.capturedMailList.find((mailMessage) => /confirm\?token=/.test(mailMessage.text));
		post('/api/confirmRegistration', { token: tokenOfMail(confirmMail) }, (confirmResponse) => {
			const confirmReply = firstReplyOf(confirmResponse);
			check('E2 the confirm reply that says approval follows is flagged isAwaitingApproval', confirmReply.message === replyByName.registrationConfirmedAwaitingApproval && confirmReply.isAwaitingApproval === true, JSON.stringify(confirmReply));
			confirmingHarness.close();
			bootWith({ requireAdminApproval: 'true', requireEmailConfirmation: 'false' }, (directHarness) => {
				postTo(directHarness)('/api/registerUser', newcomerOf(), (directResponse) => {
					const directReply = firstReplyOf(directResponse);
					check('E2 approval without confirmation: the register reply is flagged isAwaitingApproval', directReply.message === replyByName.registeredAwaitingApproval && directReply.isAwaitingApproval === true, JSON.stringify(directReply));
					directHarness.close();
					finish();
				});
			});
		});
	});
});
