'use strict';
// account-mail-not-sent.test.js — gate for WORKORDER-accountMailFailureAndApprovalNotice-112326 M3 (server side). Boots
// the REAL reset and registration endpoints and access points on a scratch database (test/lib/accountFlowHarness.js),
// mail stubbed; the stub's setMailRefusal makes every send fail, as email-sender does after its one retry.
//
//   N1 reset form, mail working: no account, an ambiguous identifier and a sent link answer the PRE-CHANGE body,
//      200 [{"message": resetRequested}], byte for byte
//   N2 reset form, mail failing: the matched account answers 503 { refusalName: accountMailNotSent, reason }, logged by
//      name; no account, ambiguous and a disabled account still answer the pre-change body (no reachability probe)
//   N3 registration, confirmation mail failing: the account IS created (pendingConfirmation) and the reply carries
//      mailOutcome accountMailNotSent and the not-sent message; with approval after confirmation it says so too
//   N4 resend confirmation, mail failing: 503 accountMailNotSent, the account unchanged; an unknown identifier still
//      answers the pre-change body; with mail back, the resend answers as before and the link goes out
//   N5 registration with mail working answers the pre-change body (no mailOutcome)
//
// Run: node server/test/account-mail-not-sent.test.js

const { httpPost } = require('./lib/userAccountHarness');
const { bootAccountFlowServer, RESET_ACCESS_POINT_NAME_LIST, RESET_ENDPOINT_FILE_NAME_LIST } = require('./lib/accountFlowHarness');
const { replyByName } = require('../lib/user-account-mail-vocabulary.json');

const REGISTRATION_ACCESS_POINT_NAME_LIST = ['user-registration-register', 'user-registration-confirm', 'user-registration-resend', 'user-registration-options'];
const REGISTRATION_ENDPOINT_FILE_NAME_LIST = ['register-user.js', 'confirm-registration.js', 'resend-confirmation.js', 'registration-options.js'];
const UNREACHABLE_SEND_ERROR_TEXT = 'providerUnreachable: the mail provider could not be reached, so the message was not sent: Unable to fetch data. (attempt 2 of 2)';

// the bodies these endpoints answered before this work order, written out (not read from the code under test)
const PRE_CHANGE_RESET_BODY_TEXT = JSON.stringify([{ message: replyByName.resetRequested }]);
const PRE_CHANGE_RESEND_BODY_TEXT = JSON.stringify([{ message: replyByName.confirmationResent }]);
const PRE_CHANGE_REGISTER_CHECK_EMAIL_BODY_TEXT = JSON.stringify([{ message: replyByName.registeredCheckEmail }]);

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const resetSeedUserList = [
	{ username: 'alice', password: 'alice-original-pass', first: 'Alice', last: 'Able', emailAdr: 'alice@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'bob', password: 'bob-original-pass', first: 'Bob', last: 'Barred', emailAdr: 'bob@example.org', phone: '', source: 'test', role: 'user', disabled: 'adminDisabled' },
	{ username: 'dave', password: 'dave-original-pass', first: 'Dave', last: 'Dup', emailAdr: 'Shared@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'erin', password: 'erin-original-pass', first: 'Erin', last: 'Dup', emailAdr: 'shared@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
];
// the harness makes the users table from its seed rows, so every boot seeds one account
const registrationSeedUserList = [resetSeedUserList[0]];
const newcomerOf = (overrideByName = {}) => ({ username: 'newcomer', password: 'newcomer-pass-1', first: 'New', last: 'Comer', emailAdr: 'new.comer@example.org', ...overrideByName });

const bootWith = ({ registrationSettingOverrideByName = {}, seedUserList = [], accessPointNameList, endpointFileNameList }, callback) =>
	bootAccountFlowServer({ registrationSettingOverrideByName, seedUserList, accessPointNameList, endpointFileNameList }, (bootError, harness) => {
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
const rowOf = (harness, username, callback) => harness.userTable.getData(`SELECT * FROM <!tableName!> WHERE username = '${username}'`, { suppressStatementLog: true }, (readError, rowList = []) => callback(rowList[0] || {}));
const isPreChange = (response, bodyText) => response.statusCode === 200 && response.bodyText === bodyText;
const describe = (response) => `${response.statusCode} ${response.bodyText}`;

const stepList = [];
const step = (stepFunction) => stepList.push(stepFunction);

// ---- N1, N2: the reset form
step((done) => bootWith({ seedUserList: resetSeedUserList, accessPointNameList: RESET_ACCESS_POINT_NAME_LIST, endpointFileNameList: RESET_ENDPOINT_FILE_NAME_LIST }, (harness) => {
	const post = postTo(harness);
	const requestReset = (identifier, callback) => post('/api/requestPasswordReset', { identifier }, callback);
	requestReset('alice', (sentResponse) => requestReset('nobody-at-all', (noAccountResponse) => requestReset('shared@example.org', (ambiguousResponse) => {
		check('N1 mail working: a sent link answers the pre-change body', isPreChange(sentResponse, PRE_CHANGE_RESET_BODY_TEXT) && harness.capturedMailList.length === 1, describe(sentResponse));
		check('N1 mail working: no account answers the pre-change body', isPreChange(noAccountResponse, PRE_CHANGE_RESET_BODY_TEXT), describe(noAccountResponse));
		check('N1 mail working: an ambiguous identifier answers the pre-change body', isPreChange(ambiguousResponse, PRE_CHANGE_RESET_BODY_TEXT), describe(ambiguousResponse));
		harness.setMailRefusal(UNREACHABLE_SEND_ERROR_TEXT);
		requestReset('alice', (failedResponse) => requestReset('nobody-at-all', (outageNoAccountResponse) => requestReset('shared@example.org', (outageAmbiguousResponse) => requestReset('bob', (outageDisabledResponse) => {
			harness.setMailRefusal('');
			const failedBody = failedResponse.bodyJson || {};
			check('N2 mail failing: the matched account answers 503 accountMailNotSent with a plain reason', failedResponse.statusCode === 503 && failedBody.refusalName === 'accountMailNotSent' && /could not send the email just now/i.test(failedBody.reason || ''), describe(failedResponse));
			check('N2 mail failing: the failure is logged by name with the sender\'s case', harness.logList.some((logText) => /resetMailNotSent for alice: providerUnreachable/.test(logText)));
			check('N2 mail failing: no account still answers the pre-change body (no probe)', isPreChange(outageNoAccountResponse, PRE_CHANGE_RESET_BODY_TEXT), describe(outageNoAccountResponse));
			check('N2 mail failing: an ambiguous identifier still answers the pre-change body', isPreChange(outageAmbiguousResponse, PRE_CHANGE_RESET_BODY_TEXT), describe(outageAmbiguousResponse));
			check('N2 mail failing: a disabled account (nothing to send) still answers the pre-change body', isPreChange(outageDisabledResponse, PRE_CHANGE_RESET_BODY_TEXT), describe(outageDisabledResponse));
			harness.close();
			done();
		}))));
	})));
}));

// ---- N3, N4, N5: registration and resend, confirmation required
step((done) => bootWith({ seedUserList: registrationSeedUserList, accessPointNameList: REGISTRATION_ACCESS_POINT_NAME_LIST, endpointFileNameList: REGISTRATION_ENDPOINT_FILE_NAME_LIST }, (harness) => {
	const post = postTo(harness);
	harness.setMailRefusal(UNREACHABLE_SEND_ERROR_TEXT);
	post('/api/registerUser', newcomerOf(), (registerResponse) => rowOf(harness, 'newcomer', (newcomerRow) => {
		const [replyObject = {}] = Array.isArray(registerResponse.bodyJson) ? registerResponse.bodyJson : [];
		check('N3 confirmation mail failing: the account is still created, awaiting confirmation', registerResponse.statusCode === 200 && newcomerRow.username === 'newcomer' && newcomerRow.disabled === 'pendingConfirmation', `${describe(registerResponse)} disabled=${newcomerRow.disabled}`);
		check('N3 the reply carries mailOutcome accountMailNotSent and the not-sent message', replyObject.mailOutcome === 'accountMailNotSent' && replyObject.message === replyByName.registeredConfirmationNotSent && !replyObject.user, JSON.stringify(replyObject));
		check('N3 the failure is logged by name', harness.logList.some((logText) => /confirmationMailNotSent for newcomer: providerUnreachable/.test(logText)));
		post('/api/resendConfirmation', { identifier: 'newcomer' }, (resendFailedResponse) => post('/api/resendConfirmation', { identifier: 'nobody-here' }, (resendUnknownResponse) => rowOf(harness, 'newcomer', (afterResendRow) => {
			check('N4 resend, mail failing: 503 accountMailNotSent', resendFailedResponse.statusCode === 503 && (resendFailedResponse.bodyJson || {}).refusalName === 'accountMailNotSent', describe(resendFailedResponse));
			check('N4 resend, mail failing: the account is unchanged', afterResendRow.disabled === 'pendingConfirmation' && afterResendRow.refId === newcomerRow.refId, JSON.stringify({ disabled: afterResendRow.disabled }));
			check('N4 resend, mail failing: an unknown identifier still answers the pre-change body', isPreChange(resendUnknownResponse, PRE_CHANGE_RESEND_BODY_TEXT), describe(resendUnknownResponse));
			harness.setMailRefusal('');
			const mailCountBefore = harness.capturedMailList.length;
			post('/api/resendConfirmation', { identifier: 'newcomer' }, (resendWorkingResponse) => post('/api/registerUser', newcomerOf({ username: 'secondcomer', emailAdr: 'second.comer@example.org' }), (secondRegisterResponse) => {
				check('N4 resend, mail back: the pre-change body, and the link goes out', isPreChange(resendWorkingResponse, PRE_CHANGE_RESEND_BODY_TEXT) && harness.capturedMailList.slice(mailCountBefore).some((mailMessage) => /confirm\?token=/.test(mailMessage.text)), describe(resendWorkingResponse));
				check('N5 registration with mail working answers the pre-change body', isPreChange(secondRegisterResponse, PRE_CHANGE_REGISTER_CHECK_EMAIL_BODY_TEXT), describe(secondRegisterResponse));
				harness.close();
				done();
			}));
		})));
	}));
}));

// ---- N3 with approval after confirmation
step((done) => bootWith({ registrationSettingOverrideByName: { requireAdminApproval: 'true' }, seedUserList: registrationSeedUserList, accessPointNameList: REGISTRATION_ACCESS_POINT_NAME_LIST, endpointFileNameList: REGISTRATION_ENDPOINT_FILE_NAME_LIST }, (harness) => {
	const post = postTo(harness);
	harness.setMailRefusal(UNREACHABLE_SEND_ERROR_TEXT);
	post('/api/registerUser', newcomerOf(), (registerResponse) => {
		harness.setMailRefusal('');
		const [replyObject = {}] = Array.isArray(registerResponse.bodyJson) ? registerResponse.bodyJson : [];
		check('N3 approval after confirmation, mail failing: mailOutcome accountMailNotSent and isApprovalAfterConfirmation', registerResponse.statusCode === 200 && replyObject.mailOutcome === 'accountMailNotSent' && replyObject.isApprovalAfterConfirmation === true, describe(registerResponse));
		harness.close();
		done();
	});
}));

const runNext = (remainingList) => {
	if (!remainingList.length) {
		const failedCount = resultList.filter((passed) => !passed).length;
		console.log(`account-mail-not-sent: ${resultList.length - failedCount} passed, ${failedCount} failed`);
		process.exit(failedCount ? 1 : 0);
		return;
	}
	remainingList[0](() => runNext(remainingList.slice(1)));
};
runNext(stepList);
