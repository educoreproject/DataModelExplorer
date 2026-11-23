'use strict';
// account-mail-not-sent.test.js — gate for WORKORDER-accountMailFailureAndApprovalNotice-112326 M3 and M6 (server side).
// Boots the REAL reset and registration endpoints and access points on a scratch database (test/lib/accountFlowHarness.js)
// with the REAL lib/email-sender.js and lib/account-mail-alerter.js; only the Resend client is a stub, answering as the
// test says: 'ok' (a message id), 'unreachable' (the SDK's own resolved network failure) or 'refused' (validation_error).
//
//   N1 reset form, mail working: no account, an ambiguous identifier and a sent link answer the PRE-CHANGE body,
//      200 [{"message": resetRequested}], byte for byte
//   N2 reset form: unreachable -> 503 accountMailNotSent after 3 attempts; refused -> 503 accountMailRefused after 1;
//      each writes its ACCOUNT_MAIL_ALERT line; no account, ambiguous and a disabled account still answer the pre-change
//      body during the failure (no probe, no alert)
//   N3 token split: a failed reset leaves the link the person already holds WORKING; a sent one retires it
//   N4 sign-up, confirmation mail failing: unreachable -> 503 registrationMailNotSent, refused -> registrationMailRefused;
//      this request's row and its tokens are UNDONE (the username is free: the same sign-up then succeeds); alert lines;
//      with approval after confirmation, undone the same way
//   N5 resend confirmation failing: accountMailNotSent / accountMailRefused, the account unchanged, its earlier link still
//      unused; an unknown identifier answers the pre-change body; with mail back, the pre-change body and the earlier link
//      retired
//   N6 an administrator's mail failing (approval on, confirmation off) undoes nothing: the account waits, the failures
//      are alerted
//
// Run: node server/test/account-mail-not-sent.test.js

const { httpPost } = require('./lib/userAccountHarness');
const { bootAccountFlowServer, RESET_ACCESS_POINT_NAME_LIST, RESET_ENDPOINT_FILE_NAME_LIST } = require('./lib/accountFlowHarness');
const { replyByName } = require('../lib/user-account-mail-vocabulary.json');
const { emailSenderOf } = require('../lib/email-sender');
const { accountMailAlerterOf } = require('../lib/account-mail-alerter');
const { tokenHashOf } = require('../lib/user-account-tokens');

const REGISTRATION_ACCESS_POINT_NAME_LIST = ['user-registration-register', 'user-registration-confirm', 'user-registration-resend', 'user-registration-options'];
const REGISTRATION_ENDPOINT_FILE_NAME_LIST = ['register-user.js', 'confirm-registration.js', 'resend-confirmation.js', 'registration-options.js'];

// the bodies these endpoints answered before this work order, written out (not read from the code under test)
const PRE_CHANGE_RESET_BODY_TEXT = JSON.stringify([{ message: replyByName.resetRequested }]);
const PRE_CHANGE_RESEND_BODY_TEXT = JSON.stringify([{ message: replyByName.confirmationResent }]);
const PRE_CHANGE_REGISTER_CHECK_EMAIL_BODY_TEXT = JSON.stringify([{ message: replyByName.registeredCheckEmail }]);

// resend 6.39.0 dist/index.cjs fetchRequest: exactly what the SDK resolves when fetch fails
const SDK_NETWORK_FAILURE_ANSWER = Object.freeze({ data: null, error: { name: 'application_error', statusCode: null, message: 'Unable to fetch data. The request could not be resolved.' }, headers: null });
const SDK_REFUSAL_ANSWER = Object.freeze({ data: null, error: { name: 'validation_error', statusCode: 403, message: 'The example.org domain is not verified.' }, headers: {} });

// test passwords as named constants (noContainerLiterals.test.js forbids a password literal in an object)
const ALICE_BRAND_NEW_PASSWORD_TEXT = 'alice-brand-new-pass';
const ALICE_ORIGINAL_PASSWORD_TEXT = 'alice-original-pass';
const BOB_ORIGINAL_PASSWORD_TEXT = 'bob-original-pass';
const DAVE_ORIGINAL_PASSWORD_TEXT = 'dave-original-pass';
const ERIN_ORIGINAL_PASSWORD_TEXT = 'erin-original-pass';
const NEWCOMER_1_PASSWORD_TEXT = 'newcomer-pass-1';

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

// a REAL email sender over a stub Resend client; senderState.mode decides each answer
const realSenderOf = () => {
	const senderState = { mode: 'ok', attemptCount: 0, sentList: [], alertLineList: [] };
	const answerByMode = { unreachable: () => SDK_NETWORK_FAILURE_ANSWER, refused: () => SDK_REFUSAL_ANSWER, ok: () => ({ data: { id: `msg-${senderState.sentList.length}` }, error: null }) };
	const alerter = accountMailAlerterOf({ minimumIntervalMilliseconds: 0, alertLineWriter: (alertLineText) => senderState.alertLineList.push(alertLineText), heldLineWriter: () => {} });
	senderState.emailSender = emailSenderOf({
		emailSenderSettings: { resendApiKey: 're_stub_not_real', sendingDomain: 'example.org', fromAddress: 'noreply@example.org', fromName: 'EDUcore', retryDelayMillisecondsList: { 0: '5', 1: '10' }, sendBudgetMilliseconds: '3000', attemptTimeoutMilliseconds: '1000' },
		failureAlerter: alerter.alertMailFailure,
		resendClientBuilder: () => ({
			emails: {
				send: (sendParameters) => {
					senderState.attemptCount += 1;
					if (senderState.mode === 'ok') {
						senderState.sentList.push(sendParameters);
					}
					return Promise.resolve(answerByMode[senderState.mode]());
				},
			},
		}),
	});
	return senderState;
};
const tokenOfSent = (sendParameters) => (String((sendParameters && sendParameters.text) || '').match(/[?&]token=([A-Za-z0-9_-]{43})/) || [])[1] || '';

const resetSeedUserList = [
	{ username: 'alice', password: ALICE_ORIGINAL_PASSWORD_TEXT, first: 'Alice', last: 'Able', emailAdr: 'alice@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'bob', password: BOB_ORIGINAL_PASSWORD_TEXT, first: 'Bob', last: 'Barred', emailAdr: 'bob@example.org', phone: '', source: 'test', role: 'user', disabled: 'adminDisabled' },
	{ username: 'dave', password: DAVE_ORIGINAL_PASSWORD_TEXT, first: 'Dave', last: 'Dup', emailAdr: 'Shared@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'erin', password: ERIN_ORIGINAL_PASSWORD_TEXT, first: 'Erin', last: 'Dup', emailAdr: 'shared@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
];
// the harness makes the users table from its seed rows, so every boot seeds one account
const registrationSeedUserList = [resetSeedUserList[0]];
const newcomerOf = (overrideByName = {}) => ({ username: 'newcomer', password: NEWCOMER_1_PASSWORD_TEXT, first: 'New', last: 'Comer', emailAdr: 'new.comer@example.org', ...overrideByName });

const bootWith = ({ registrationSettingOverrideByName = {}, seedUserList, accessPointNameList, endpointFileNameList, senderState }, callback) =>
	bootAccountFlowServer({ registrationSettingOverrideByName, seedUserList, accessPointNameList, endpointFileNameList, emailSenderOverride: senderState.emailSender }, (bootError, harness) => {
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
const tokenRowsOf = (harness, whereText, callback) => harness.sqlDb.getTable('userTokens', (tableError, tokenTable) => tokenTable.getData(`SELECT * FROM <!tableName!> WHERE ${whereText}`, { suppressStatementLog: true }, (readError, rowList = []) => callback(rowList)));
const isPreChange = (response, bodyText) => response.statusCode === 200 && response.bodyText === bodyText;
const describe = (response) => `${response.statusCode} ${response.bodyText}`;
const refusalNameOf = (response) => (response.bodyJson && !Array.isArray(response.bodyJson) ? response.bodyJson.refusalName : '');
const alertLinePatternOf = (mailName, accountName, failureName) => new RegExp(`^ACCOUNT_MAIL_ALERT mail=${mailName} account=${accountName} failure=${failureName} heldSinceLast=0$`);

const stepList = [];
const step = (stepFunction) => stepList.push(stepFunction);

// ---- N1, N2, N3: the reset form
step((done) => {
	const senderState = realSenderOf();
	bootWith({ seedUserList: resetSeedUserList, accessPointNameList: RESET_ACCESS_POINT_NAME_LIST, endpointFileNameList: RESET_ENDPOINT_FILE_NAME_LIST, senderState }, (harness) => {
		const post = postTo(harness);
		const requestReset = (identifier, callback) => post('/api/requestPasswordReset', { identifier }, callback);
		requestReset('alice', (sentResponse) => requestReset('nobody-at-all', (noAccountResponse) => requestReset('shared@example.org', (ambiguousResponse) => {
			const heldTokenText = tokenOfSent(senderState.sentList[senderState.sentList.length - 1]);
			check('N1 mail working: a sent link answers the pre-change body', isPreChange(sentResponse, PRE_CHANGE_RESET_BODY_TEXT) && !!heldTokenText, describe(sentResponse));
			check('N1 mail working: no account answers the pre-change body', isPreChange(noAccountResponse, PRE_CHANGE_RESET_BODY_TEXT), describe(noAccountResponse));
			check('N1 mail working: an ambiguous identifier answers the pre-change body', isPreChange(ambiguousResponse, PRE_CHANGE_RESET_BODY_TEXT), describe(ambiguousResponse));
			senderState.mode = 'unreachable';
			const attemptsBefore = senderState.attemptCount;
			requestReset('alice', (unreachableResponse) => {
				const unreachableAttemptCount = senderState.attemptCount - attemptsBefore;
				check('N2 unreachable: 503 accountMailNotSent ("try again in a few minutes"), after the first try and two retries', unreachableResponse.statusCode === 503 && refusalNameOf(unreachableResponse) === 'accountMailNotSent' && /few minutes/.test(unreachableResponse.bodyJson.reason) && unreachableAttemptCount === 3, `${describe(unreachableResponse)} attempts=${unreachableAttemptCount}`);
				check('N2 unreachable: the alert line is written', senderState.alertLineList.some((alertLineText) => alertLinePatternOf('passwordReset', 'alice', 'providerUnreachable').test(alertLineText)), JSON.stringify(senderState.alertLineList));
				check('N2 unreachable: logged by name', harness.logList.some((logText) => /resetMailNotSent for alice: providerUnreachable/.test(logText)));
				senderState.mode = 'refused';
				const refusedAttemptsBefore = senderState.attemptCount;
				requestReset('alice', (refusedResponse) => {
					check('N2 refused: 503 accountMailRefused ("a problem on our side"), not retried', refusedResponse.statusCode === 503 && refusalNameOf(refusedResponse) === 'accountMailRefused' && /problem on our side/.test(refusedResponse.bodyJson.reason) && senderState.attemptCount - refusedAttemptsBefore === 1, `${describe(refusedResponse)} attempts=${senderState.attemptCount - refusedAttemptsBefore}`);
					check('N2 refused: the alert line is written', senderState.alertLineList.some((alertLineText) => alertLinePatternOf('passwordReset', 'alice', 'providerRefused').test(alertLineText)), JSON.stringify(senderState.alertLineList));
					senderState.mode = 'unreachable';
					const alertCountBefore = senderState.alertLineList.length;
					requestReset('nobody-at-all', (outageNoAccountResponse) => requestReset('shared@example.org', (outageAmbiguousResponse) => requestReset('bob', (outageDisabledResponse) => {
						check('N2 during the failure: no account still answers the pre-change body (no probe)', isPreChange(outageNoAccountResponse, PRE_CHANGE_RESET_BODY_TEXT), describe(outageNoAccountResponse));
						check('N2 during the failure: an ambiguous identifier still answers the pre-change body', isPreChange(outageAmbiguousResponse, PRE_CHANGE_RESET_BODY_TEXT), describe(outageAmbiguousResponse));
						check('N2 during the failure: a disabled account (nothing to send) still answers the pre-change body', isPreChange(outageDisabledResponse, PRE_CHANGE_RESET_BODY_TEXT), describe(outageDisabledResponse));
						check('N2 during the failure: nothing sent, nothing alerted for those three', senderState.alertLineList.length === alertCountBefore, JSON.stringify(senderState.alertLineList.slice(alertCountBefore)));
						senderState.mode = 'ok';
						// N3: the two failed requests did not retire the link alice already held
						post('/api/completePasswordReset', { token: heldTokenText, password: ALICE_BRAND_NEW_PASSWORD_TEXT }, (heldLinkResponse) => {
							check('N3 after failed resets, the link already held still works', heldLinkResponse.statusCode === 200, describe(heldLinkResponse));
							requestReset('alice', () => {
								const secondTokenText = tokenOfSent(senderState.sentList[senderState.sentList.length - 1]);
								tokenRowsOf(harness, `tokenHash = '${tokenHashOf(secondTokenText)}'`, ([secondTokenRow = {}]) => {
									// the fifth request of the identifier window: the sent one retires the earlier unused link
									check('N3 a SENT reset retires nothing it should not: its own link is unused', !!secondTokenText && !secondTokenRow.usedAt, JSON.stringify(secondTokenRow));
									harness.close();
									done();
								});
							});
						});
					})));
				});
			});
		})));
	});
});

// ---- N4, N5: sign-up and resend, confirmation required
step((done) => {
	const senderState = realSenderOf();
	bootWith({ seedUserList: registrationSeedUserList, accessPointNameList: REGISTRATION_ACCESS_POINT_NAME_LIST, endpointFileNameList: REGISTRATION_ENDPOINT_FILE_NAME_LIST, senderState }, (harness) => {
		const post = postTo(harness);
		senderState.mode = 'unreachable';
		post('/api/registerUser', newcomerOf(), (unreachableResponse) => rowOf(harness, 'newcomer', (unreachableRow) => tokenRowsOf(harness, '1 = 1', (unreachableTokenRowList) => {
			check('N4 sign-up, unreachable: 503 registrationMailNotSent, "your account was not created"', unreachableResponse.statusCode === 503 && refusalNameOf(unreachableResponse) === 'registrationMailNotSent' && /not created/.test(unreachableResponse.bodyJson.reason), describe(unreachableResponse));
			check('N4 sign-up, unreachable: the row and its token are undone', !unreachableRow.username && unreachableTokenRowList.length === 0, `row=${unreachableRow.username} tokens=${unreachableTokenRowList.length}`);
			check('N4 sign-up, unreachable: the alert line is written; the undo is logged', senderState.alertLineList.some((alertLineText) => alertLinePatternOf('confirmEmail', 'newcomer', 'providerUnreachable').test(alertLineText)) && harness.logList.some((logText) => /account undone: newcomer/.test(logText)), JSON.stringify(senderState.alertLineList));
			senderState.mode = 'refused';
			post('/api/registerUser', newcomerOf(), (refusedResponse) => rowOf(harness, 'newcomer', (refusedRow) => {
				check('N4 sign-up, refused: 503 registrationMailRefused, "a problem on our side", the row undone', refusedResponse.statusCode === 503 && refusalNameOf(refusedResponse) === 'registrationMailRefused' && /problem on our side/.test(refusedResponse.bodyJson.reason) && !refusedRow.username, `${describe(refusedResponse)} row=${refusedRow.username}`);
				check('N4 sign-up, refused: the alert line is written', senderState.alertLineList.some((alertLineText) => alertLinePatternOf('confirmEmail', 'newcomer', 'providerRefused').test(alertLineText)));
				senderState.mode = 'ok';
				post('/api/registerUser', newcomerOf(), (okResponse) => rowOf(harness, 'newcomer', (newcomerRow) => {
					// the confirmation mail (the administrators' new-account notice goes after it and carries no link)
					const firstLinkTokenText = tokenOfSent(senderState.sentList.filter((sendParameters) => !!tokenOfSent(sendParameters)).pop());
					check('N4 the username is free again: the same sign-up with mail working answers the pre-change body', isPreChange(okResponse, PRE_CHANGE_REGISTER_CHECK_EMAIL_BODY_TEXT) && newcomerRow.disabled === 'pendingConfirmation' && !!firstLinkTokenText, `${describe(okResponse)} disabled=${newcomerRow.disabled}`);
					senderState.mode = 'unreachable';
					post('/api/resendConfirmation', { identifier: 'newcomer' }, (resendUnreachableResponse) => {
						senderState.mode = 'refused';
						post('/api/resendConfirmation', { identifier: 'newcomer' }, (resendRefusedResponse) => post('/api/resendConfirmation', { identifier: 'nobody-here' }, (resendUnknownResponse) => rowOf(harness, 'newcomer', (afterResendRow) => tokenRowsOf(harness, `tokenHash = '${tokenHashOf(firstLinkTokenText)}'`, ([firstLinkRow = {}]) => {
							check('N5 resend, unreachable: 503 accountMailNotSent', resendUnreachableResponse.statusCode === 503 && refusalNameOf(resendUnreachableResponse) === 'accountMailNotSent', describe(resendUnreachableResponse));
							check('N5 resend, refused: 503 accountMailRefused', resendRefusedResponse.statusCode === 503 && refusalNameOf(resendRefusedResponse) === 'accountMailRefused', describe(resendRefusedResponse));
							check('N5 resend failing: alert lines for both', ['providerUnreachable', 'providerRefused'].every((failureName) => senderState.alertLineList.filter((alertLineText) => alertLinePatternOf('confirmEmail', 'newcomer', failureName).test(alertLineText)).length >= 2));
							check('N5 resend failing: the account unchanged, its first link still unused', afterResendRow.disabled === 'pendingConfirmation' && afterResendRow.refId === newcomerRow.refId && !!firstLinkRow.refId && !firstLinkRow.usedAt, JSON.stringify({ disabled: afterResendRow.disabled, firstLinkUsedAt: firstLinkRow.usedAt }));
							check('N5 resend failing: an unknown identifier answers the pre-change body', isPreChange(resendUnknownResponse, PRE_CHANGE_RESEND_BODY_TEXT), describe(resendUnknownResponse));
							senderState.mode = 'ok';
							post('/api/resendConfirmation', { identifier: 'newcomer' }, (resendOkResponse) => tokenRowsOf(harness, `tokenHash = '${tokenHashOf(firstLinkTokenText)}'`, ([retiredFirstLinkRow = {}]) => {
								check('N5 resend, mail back: the pre-change body, and the first link is retired now that the new one is sent', isPreChange(resendOkResponse, PRE_CHANGE_RESEND_BODY_TEXT) && !!retiredFirstLinkRow.usedAt, `${describe(resendOkResponse)} usedAt=${retiredFirstLinkRow.usedAt}`);
								harness.close();
								done();
							}));
						}))));
					});
				}));
			}));
		})));
	});
});

// ---- N4 with approval after confirmation
step((done) => {
	const senderState = realSenderOf();
	senderState.mode = 'unreachable';
	bootWith({ registrationSettingOverrideByName: { requireAdminApproval: 'true' }, seedUserList: registrationSeedUserList, accessPointNameList: REGISTRATION_ACCESS_POINT_NAME_LIST, endpointFileNameList: REGISTRATION_ENDPOINT_FILE_NAME_LIST, senderState }, (harness) => {
		postTo(harness)('/api/registerUser', newcomerOf(), (registerResponse) => rowOf(harness, 'newcomer', (newcomerRow) => {
			check('N4 approval after confirmation, mail failing: registrationMailNotSent and the row undone', registerResponse.statusCode === 503 && refusalNameOf(registerResponse) === 'registrationMailNotSent' && !newcomerRow.username, `${describe(registerResponse)} row=${newcomerRow.username}`);
			harness.close();
			done();
		}));
	});
});

// ---- N6 administrators' mail failing undoes nothing
step((done) => {
	const senderState = realSenderOf();
	senderState.mode = 'unreachable';
	bootWith({ registrationSettingOverrideByName: { requireAdminApproval: 'true', requireEmailConfirmation: 'false' }, seedUserList: registrationSeedUserList, accessPointNameList: REGISTRATION_ACCESS_POINT_NAME_LIST, endpointFileNameList: REGISTRATION_ENDPOINT_FILE_NAME_LIST, senderState }, (harness) => {
		postTo(harness)('/api/registerUser', newcomerOf(), (registerResponse) => rowOf(harness, 'newcomer', (newcomerRow) => {
			check('N6 approval on, confirmation off, mail failing: the account still waits for approval (200, pendingApproval)', registerResponse.statusCode === 200 && newcomerRow.disabled === 'pendingApproval', `${describe(registerResponse)} disabled=${newcomerRow.disabled}`);
			check('N6 the applicant\'s and the approvers\' failed mails are alerted', ['awaitingApprovalMail', 'approvalRequest'].every((mailName) => senderState.alertLineList.some((alertLineText) => alertLinePatternOf(mailName, 'newcomer', 'providerUnreachable').test(alertLineText))), JSON.stringify(senderState.alertLineList));
			harness.close();
			done();
		}));
	});
});

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
