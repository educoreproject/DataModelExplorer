'use strict';
// account-in-flight-buttons.test.js — gate for WORKORDER-accountMailLooseEnds-112326 E2 and E1 (browser side), read from
// the page sources (the pages are Vue single-file components; this suite has no browser, and the live behaviour is walked
// by hand against a hanging Resend double, DEVLOG accountMailLooseEnds-112326).
//
//   B1 each listed submit / decide button shows the store's loading state (:loading="<store>.loading"); Vuetify 3.11
//      makes a loading button ignore the mouse (pointer-events: none) but NOT a keyboard press or the form's Enter,
//      so:
//   B2 each button's handler returns at once, before anything else, while <store>.loading is true (a second press, Enter
//      or Space during the wait sends nothing)
//   B3 no account request has a client timeout shorter than the server's 10 s mail budget plus margin (12 s): the
//      loading state lasts the whole wait
//   B4 E1: the approval page shows a decision whose applicant email was not sent as a WARNING (approval-mail-not-sent),
//      never in the success alert; the store sets isNoticeWarning from the reply's isApplicantMailNotSent and clears it
//
// Run: node server/test/account-in-flight-buttons.test.js

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', '..', 'html');
const sourceOf = (relativePath) => fs.readFileSync(path.join(htmlPath, relativePath), 'utf8');

// [page or component, handler, store variable, the button's data-testid]
const BUTTON_LIST = Object.freeze([
	['pages/register.vue', 'submitRegistration', 'accountStore', 'register-submit'],
	['pages/forgot-password.vue', 'submitRequest', 'accountStore', 'forgot-password-submit'],
	['pages/confirm.vue', 'resendConfirmation', 'accountStore', 'confirm-resend'],
	['components/form_login.vue', 'resendConfirmation', 'accountStore', 'login-resend-confirmation'],
	['pages/account-approval.vue', 'decide', 'approvalStore', 'approval-approve'],
	['pages/account-approval.vue', 'decide', 'approvalStore', 'approval-decline'],
]);
const MINIMUM_CLIENT_TIMEOUT_MILLISECONDS = 12000;

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const escapeOf = (plainText) => plainText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// the handler's body: from `const name = async (...) => {` to its closing brace at the same indentation
const handlerBodyOf = (sourceText, handlerName) => {
	const handlerMatch = sourceText.match(new RegExp(`\\n(\\t*)const ${escapeOf(handlerName)} = async \\([^)]*\\) => \\{\\n([\\s\\S]*?)\\n\\1\\};`));
	return handlerMatch ? handlerMatch[2] : '';
};
// its first statement that is not a comment
const firstStatementOf = (bodyText) => bodyText.split('\n').map((lineText) => lineText.trim()).filter((lineText) => lineText && !lineText.startsWith('//')).slice(0, 3).join(' ');
const buttonTagOf = (sourceText, testIdText) => (sourceText.match(new RegExp(`<v-btn[^>]*data-testid="${escapeOf(testIdText)}"[^>]*>`)) || [''])[0];

BUTTON_LIST.forEach(([relativePath, handlerName, storeName, testIdText]) => {
	const sourceText = sourceOf(relativePath);
	const buttonTag = buttonTagOf(sourceText, testIdText);
	check(`B1 ${relativePath} ${testIdText} shows ${storeName}.loading`, buttonTag.includes(`:loading="${storeName}.loading"`) && buttonTag.includes(`@click="${handlerName}`), buttonTag || 'button not found');
	const firstStatementText = firstStatementOf(handlerBodyOf(sourceText, handlerName));
	check(`B2 ${relativePath} ${handlerName} returns at once while ${storeName}.loading`, new RegExp(`^if \\(${escapeOf(storeName)}\\.loading( \\|\\||\\))[^{]*\\{ return;`).test(firstStatementText), firstStatementText || 'handler not found');
});

['stores/accountStore.js', 'stores/accountApprovalStore.js'].forEach((relativePath) => {
	const timeoutList = [...sourceOf(relativePath).matchAll(/\btimeout\s*:\s*(\d+)/g)].map((timeoutMatch) => Number(timeoutMatch[1]));
	check(`B3 ${relativePath}: no client timeout under ${MINIMUM_CLIENT_TIMEOUT_MILLISECONDS} ms`, timeoutList.every((timeoutMilliseconds) => timeoutMilliseconds >= MINIMUM_CLIENT_TIMEOUT_MILLISECONDS), JSON.stringify(timeoutList));
});

const approvalPageText = sourceOf('pages/account-approval.vue');
const warningTag = (approvalPageText.match(/<v-alert[^>]*data-testid="approval-mail-not-sent"[^>]*>/) || [''])[0];
const successTag = (approvalPageText.match(/<v-alert[^>]*data-testid="approval-notice"[^>]*>/) || [''])[0];
check('B4 the approval page has a warning alert for a decision whose email was not sent', /type="warning"/.test(warningTag) && /v-if="approvalStore\.noticeMsg && approvalStore\.isNoticeWarning"/.test(warningTag), warningTag || 'not found');
check('B4 the success alert is the else branch, so a not-sent notice never shows as success', /type="success"/.test(successTag) && /v-else-if="approvalStore\.noticeMsg"/.test(successTag) && approvalPageText.indexOf(warningTag) < approvalPageText.indexOf(successTag), successTag || 'not found');
const approvalStoreText = sourceOf('stores/accountApprovalStore.js');
check('B4 the store sets isNoticeWarning from the reply\'s isApplicantMailNotSent', /this\.isNoticeWarning = result\.isApplicantMailNotSent === true;/.test(approvalStoreText));
check('B4 clearMessages clears isNoticeWarning', /clearMessages\(\) \{[^}]*this\.isNoticeWarning = false;[^}]*\}/.test(approvalStoreText));

const failedCount = resultList.filter((passed) => !passed).length;
console.log(`account-in-flight-buttons: ${resultList.length - failedCount} passed, ${failedCount} failed`);
process.exit(failedCount ? 1 : 0);
