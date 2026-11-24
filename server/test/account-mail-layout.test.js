'use strict';
// account-mail-layout.test.js — gate for WORKORDER-approvalMailPolish-112126 Phase 1 (rulings P1, P2, P3). Every account
// email is produced by the REAL flows (registration, confirmation, reset, approval, decline) on scratch databases with
// mail captured (test/lib/accountFlowHarness.js), and its links are read from the composed text and HTML.
//
//   L1.1 the approval request's FIRST href (HTML) and FIRST http URL (text) are that applicant's approval page, and the
//        action comes before the applicant's details (P1)
//   L1.2 every URL in every account email is one of that message's action URLs (PERMITTED_URL_TEST_BY_MESSAGE_NAME); no
//        email carries the bare site address, with or without a trailing slash (P2); every message in the vocabulary is
//        produced and checked here, so a new message cannot ship without a permitted-URL entry
//   L1.3 the applicant's awaiting-approval email carries no URL and says there is nothing to do yet (P3)
//   L1.4 every one says "coming from <host>" in subject and body (WORKORDER-adminApproval-112126 A3)
//   L1.5 an action paragraph whose URL fill is not an http(s) address is refused when the mail is composed
//
// Run: node server/test/account-mail-layout.test.js

const path = require('path');
const { httpPost } = require('./lib/userAccountHarness');
const { bootAccountFlowServer, tokenOfMail, RESET_ACCESS_POINT_NAME_LIST, RESET_ENDPOINT_FILE_NAME_LIST } = require('./lib/accountFlowHarness');

const serverPath = path.join(__dirname, '..');
const { messageByName } = require(path.join(serverPath, 'lib', 'user-account-mail-vocabulary.json'));

const ACCESS_POINT_NAME_LIST = [
	'user-registration-register', 'user-registration-confirm', 'user-registration-resend', 'user-registration-options',
	...RESET_ACCESS_POINT_NAME_LIST,
	'account-approval-detail', 'account-approval-decide', 'account-approval-pending-list',
];
const ENDPOINT_FILE_NAME_LIST = [
	'register-user.js', 'confirm-registration.js', 'resend-confirmation.js', 'registration-options.js',
	...RESET_ENDPOINT_FILE_NAME_LIST,
	'account-approval-detail.js', 'decide-account-approval.js', 'list-pending-approvals.js',
];
const SITE_HOST = 'site.example.org';
const SITE_URL = `https://${SITE_HOST}`;
const COMING_FROM_PATTERN = new RegExp(`coming from ${SITE_HOST.replace(/\./g, '\\.')}`);
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const NOTHING_TO_DO_PATTERN = /You don't need to do anything now/;

const ALICE_PASSWORD = 'alice-original-pass';
const ALICE_NEW_PASSWORD = 'alice-brand-new-pass';
const ADA_PASSWORD = 'ada-admin-pass-1';
const APPLICANT_PASSWORD = 'applicant-pass-1';
const seedUserList = [
	{ username: 'alice', password: ALICE_PASSWORD, first: 'Alice', last: 'Able', emailAdr: 'alice@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'ada', password: ADA_PASSWORD, first: 'Ada', last: 'Admin', emailAdr: 'ada@example.org', phone: '', source: 'test', role: 'admin', disabled: '' },
];

// how each captured mail is recognized, by its subject
const SUBJECT_PATTERN_BY_MESSAGE_NAME = Object.freeze({
	confirmEmail: /^Confirm your EDUcore account/,
	newAccountNotice: /^New EDUcore account: /,
	passwordReset: /^Reset your EDUcore password/,
	passwordChanged: /^Your EDUcore password was changed/,
	awaitingApproval: /^Your EDUcore account is waiting for approval/,
	approvalRequest: /^Approval needed: /,
	accountApproved: /^Your EDUcore account was approved/,
	accountDeclined: /^Your EDUcore account was not approved/,
	approvalDecided: /^New EDUcore account \S+: (approved|declined) by /,
});

// P2: the ONLY URLs each message may carry: its action, nothing else. A message with no action carries no URL at all.
const approvalPageUrlOf = (userRefId) => `${SITE_URL}/account-approval?userRefId=${encodeURIComponent(userRefId)}`;
const PERMITTED_URL_TEST_BY_MESSAGE_NAME = Object.freeze({
	confirmEmail: () => (linkUrl) => /^https:\/\/site\.example\.org\/confirm\?token=[A-Za-z0-9_-]+$/.test(linkUrl),
	passwordReset: () => (linkUrl) => /^https:\/\/site\.example\.org\/reset-password\?token=[A-Za-z0-9_-]+$/.test(linkUrl),
	passwordChanged: () => (linkUrl) => linkUrl === `${SITE_URL}/forgot-password`,
	accountApproved: () => (linkUrl) => linkUrl === `${SITE_URL}/login`,
	approvalRequest: (state) => (linkUrl) => linkUrl === approvalPageUrlOf(state.applicantRefId),
	newAccountNotice: () => () => false,
	awaitingApproval: () => () => false,
	accountDeclined: () => () => false,
	approvalDecided: () => () => false,
});

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const bootWith = (registrationSettingOverrideByName, callback) =>
	bootAccountFlowServer({ registrationSettingOverrideByName, seedUserList, accessPointNameList: ACCESS_POINT_NAME_LIST, endpointFileNameList: ENDPOINT_FILE_NAME_LIST }, (bootError, harness) => {
		if (bootError) {
			check('a harness booted', false, bootError);
			process.exit(1);
		}
		callback(harness);
	});

const postTo = (harness) => (routePath, requestBody, callback, authtoken) =>
	httpPost({ baseUrl: harness.baseUrl, routePath, requestBody, authtoken }, (errText, response) => {
		if (errText) {
			check(`HTTP ${routePath}`, false, errText);
		}
		callback(response || {});
	});

const rowOf = (harness, username, callback) => harness.userTable.getData(`SELECT * FROM <!tableName!> WHERE username = '${username}'`, { suppressStatementLog: true }, (readError, rowList = []) => callback(rowList[0] || {}));
const applicantOf = (username) => ({ username, password: APPLICANT_PASSWORD, first: 'App', last: username, emailAdr: `${username}@example.org` });
const confirmMailOf = (harness, username) => harness.capturedMailList.filter((mailMessage) => /confirm\?token=/.test(mailMessage.text) && mailMessage.toList.includes(`${username}@example.org`)).pop();
const messageNameOf = (mailMessage) => Object.keys(SUBJECT_PATTERN_BY_MESSAGE_NAME).find((messageName) => SUBJECT_PATTERN_BY_MESSAGE_NAME[messageName].test(mailMessage.subject)) || '';

// every captured mail, with the state its permitted URLs depend on (the applicant's refId for the approval request)
const producedList = [];
const collect = (harness, extraState = {}) => harness.capturedMailList.forEach((mailMessage) => producedList.push({ mailMessage, messageName: messageNameOf(mailMessage), state: extraState }));

const stepList = [];
const step = (stepFunction) => stepList.push(stepFunction);
const harnessList = [];

// approval off: confirmation, the plain new-account notice, reset, password changed
step((done) => bootWith({}, (harness) => {
	harnessList.push(harness);
	const post = postTo(harness);
	post('/api/registerUser', applicantOf('layoutone'), () => {
		post('/api/requestPasswordReset', { identifier: 'alice' }, () => {
			const resetMail = harness.capturedMailList.find((mailMessage) => /reset-password\?token=/.test(mailMessage.text));
			post('/api/completePasswordReset', { token: tokenOfMail(resetMail), password: ALICE_NEW_PASSWORD }, () => {
				collect(harness);
				done();
			});
		});
	});
}));

// approval on: awaiting approval, approval request, approved, decided (approved); then declined, decided (declined)
step((done) => bootWith({ requireAdminApproval: 'true' }, (harness) => {
	harnessList.push(harness);
	const post = postTo(harness);
	post('/api/registerUser', applicantOf('layouttwo'), () => {
		const confirmMail = confirmMailOf(harness, 'layouttwo');
		harness.capturedMailList.length = 0;
		post('/api/confirmRegistration', { token: tokenOfMail(confirmMail) }, () => {
			rowOf(harness, 'layouttwo', (applicantRow) => {
				collect(harness, { applicantRefId: applicantRow.refId });
				harness.capturedMailList.length = 0;
				post('/api/login', { username: 'ada', password: ADA_PASSWORD }, (loginResponse) => {
					const adaToken = loginResponse.authtoken || '';
					post('/api/decideAccountApproval', { userRefId: applicantRow.refId, decisionName: 'approve' }, () => {
						collect(harness);
						harness.capturedMailList.length = 0;
						post('/api/registerUser', applicantOf('layoutthree'), () => {
							post('/api/confirmRegistration', { token: tokenOfMail(confirmMailOf(harness, 'layoutthree')) }, () => {
								rowOf(harness, 'layoutthree', (declinedRow) => {
									harness.capturedMailList.length = 0;
									post('/api/decideAccountApproval', { userRefId: declinedRow.refId, decisionName: 'decline', sendDeclineEmail: true }, () => {
										collect(harness);
										done();
									}, adaToken);
								});
							});
						});
					}, adaToken);
				});
			});
		});
	});
}));

const urlListOf = (partText) => String(partText || '').match(URL_PATTERN) || [];
const isSiteRoot = (linkUrl) => linkUrl.replace(/\/+$/, '') === SITE_URL;
const hrefListOf = (htmlText) => [...String(htmlText || '').matchAll(/href="([^"]*)"/g)].map((hrefMatch) => hrefMatch[1].replace(/&amp;/g, '&'));

step((done) => {
	const unrecognizedList = producedList.filter(({ messageName }) => !messageName).map(({ mailMessage }) => mailMessage.subject);
	check('every captured mail is a known account message', !unrecognizedList.length, JSON.stringify(unrecognizedList));
	const producedNameList = [...new Set(producedList.map(({ messageName }) => messageName).filter(Boolean))];
	const unproducedList = Object.keys(messageByName).filter((messageName) => !producedNameList.includes(messageName));
	const unlistedList = Object.keys(messageByName).filter((messageName) => !PERMITTED_URL_TEST_BY_MESSAGE_NAME[messageName]);
	check(`L1.2 every message in the vocabulary (${Object.keys(messageByName).length}) was produced by a real flow`, !unproducedList.length, JSON.stringify(unproducedList));
	check('L1.2 every message in the vocabulary has a permitted-URL entry in this test', !unlistedList.length, JSON.stringify(unlistedList));

	// L1.1 the action first
	const requestEntry = producedList.find(({ messageName }) => messageName === 'approvalRequest');
	const approvalPageUrl = requestEntry ? approvalPageUrlOf(requestEntry.state.applicantRefId) : '(no approval request)';
	const firstHref = requestEntry ? hrefListOf(requestEntry.mailMessage.html)[0] : '';
	const firstTextUrl = requestEntry ? urlListOf(requestEntry.mailMessage.text)[0] : '';
	check('L1.1 the approval request\'s FIRST href is that applicant\'s approval page', firstHref === approvalPageUrl, `${firstHref} vs ${approvalPageUrl}`);
	check('L1.1 the approval request\'s FIRST URL in the text is that applicant\'s approval page', firstTextUrl === approvalPageUrl, `${firstTextUrl} vs ${approvalPageUrl}`);
	// a mail client turns any address in the HTML into a link, so the first address of ANY kind must be the action too
	const firstHtmlUrl = requestEntry ? urlListOf(requestEntry.mailMessage.html.replace(/&amp;/g, '&'))[0] : '';
	check('L1.1 the FIRST address of any kind in the HTML (a client may link a bare one) is that applicant\'s approval page', firstHtmlUrl === approvalPageUrl, `${firstHtmlUrl} vs ${approvalPageUrl}`);
	const requestText = requestEntry ? requestEntry.mailMessage.text : '';
	const requestHtml = requestEntry ? requestEntry.mailMessage.html : '';
	check('L1.1 the action comes before the applicant\'s details (text and HTML)', requestEntry && requestText.indexOf(approvalPageUrl) > -1 && requestText.indexOf(approvalPageUrl) < requestText.indexOf('Username:') && requestHtml.indexOf('href=') < requestHtml.indexOf('Username:'), requestText);
	check('L1.1 the HTML action is a labelled button ("Review this application"), not a bare address', /<a href="[^"]+" style="[^"]+">Review this application<\/a>/.test(requestHtml), requestHtml.slice(0, 400));

	// L1.2 only action URLs, never the bare site
	producedList.filter(({ messageName }) => messageName).forEach(({ mailMessage, messageName, state }) => {
		const isPermitted = PERMITTED_URL_TEST_BY_MESSAGE_NAME[messageName](state);
		const textUrlList = urlListOf(mailMessage.text);
		const htmlUrlList = [...urlListOf(mailMessage.html.replace(/&amp;/g, '&')), ...hrefListOf(mailMessage.html)];
		const strayList = [...textUrlList, ...htmlUrlList].filter((linkUrl) => !isPermitted(linkUrl));
		const siteRootList = [...textUrlList, ...htmlUrlList, ...urlListOf(mailMessage.subject)].filter(isSiteRoot);
		check(`L1.2 ${messageName}: every URL is one of its action URLs (${textUrlList.length} in text)`, !strayList.length, JSON.stringify(strayList));
		check(`L1.2 ${messageName}: no bare site address (${SITE_URL}) in subject, text or HTML`, !siteRootList.length, JSON.stringify(siteRootList));
		check(`L1.4 ${messageName}: says "coming from ${SITE_HOST}" in subject, text and HTML`, [mailMessage.subject, mailMessage.text, mailMessage.html].every((partText) => COMING_FROM_PATTERN.test(String(partText || ''))), mailMessage.subject);
	});

	// L1.3 the applicant waiting for approval: nothing to click, nothing to do
	const awaitingMail = (producedList.find(({ messageName }) => messageName === 'awaitingApproval') || {}).mailMessage;
	check('L1.3 the awaiting-approval email carries no URL (text and HTML)', awaitingMail && !urlListOf(awaitingMail.text).length && !urlListOf(awaitingMail.html).length && !hrefListOf(awaitingMail.html).length, awaitingMail && awaitingMail.text);
	check('L1.3 the awaiting-approval email says there is nothing to do yet', awaitingMail && NOTHING_TO_DO_PATTERN.test(awaitingMail.text), awaitingMail && awaitingMail.text);

	// L1.5 an action without a URL is a code fault, never a button to nowhere; composed in a child process, the refusal is
	// a throw read from its stderr, not caught here
	const composeWithoutAction = require('child_process').spawnSync(process.execPath, ['-e', `process.global = {}; require(${JSON.stringify(path.join(serverPath, 'lib', 'user-account-mail'))}).accountMailOf({ messageName: 'approvalRequest', fillByName: { siteUrl: '${SITE_URL}', approvalPageUrl: 'not-an-address' } })`], { encoding: 'utf8' });
	check('L1.5 an approval request whose approvalPageUrl is not an http(s) URL is refused by name', composeWithoutAction.status !== 0 && /needs fillByName\.approvalPageUrl, an http\(s\) URL/.test(composeWithoutAction.stderr), composeWithoutAction.stderr.slice(0, 300));
	done();
});

const runSteps = (remainingList) => {
	if (!remainingList.length) {
		harnessList.forEach((harness) => harness.close());
		const passedCount = resultList.filter(Boolean).length;
		console.log(`account-mail-layout: ${passedCount} passed, ${resultList.length - passedCount} failed`);
		process.exit(resultList.length === passedCount ? 0 : 1);
	}
	const [stepFunction, ...restList] = remainingList;
	stepFunction(() => runSteps(restList));
};
runSteps(stepList);
