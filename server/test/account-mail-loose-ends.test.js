'use strict';
// account-mail-loose-ends.test.js — gate for WORKORDER-accountMailLooseEnds-112326 E1, E3 and E4 (server side). Boots the
// REAL registration, reset and approval endpoints and access points on scratch databases (test/lib/accountFlowHarness.js)
// with the REAL lib/email-sender.js and lib/account-mail-alerter.js; only the Resend client is a stub, and it answers
// per recipient: a message to an address in senderState.failingAddressList gets the SDK's own refusal or network-failure
// answer (senderState.failureMode), every other message is sent.
//
//   E1 approve / decline with the applicant's email failing: the decision is stored (row state, decision row), the reply
//      says the email was NOT sent (named: unreachable vs refused) with isApplicantMailNotSent true, the alert line is
//      written, and the approvers' notice says the applicant was not emailed; with mail working, and for a suppressed
//      decline, the reply is the pre-change one with isApplicantMailNotSent false and the notice has no such paragraph
//   E3 five reset requests whose mail fails leave the identifier limit (5 per 15 min) unspent: a sixth, mail working, is
//      sent; five that are sent spend it (sixth tooManyRequests); five for no account spend it; the per-address limit
//      still counts the failed ones; resend confirmation and an undone sign-up release the same way
//   E4 a confirmation link that cannot be issued at sign-up writes the ACCOUNT_MAIL_ALERT line (confirmationTokenNotIssued)
//      and is refused registrationMailRefused, the account undone; a reset link and a resend link that cannot be issued
//      are alerted with the answer unchanged; earlier links that cannot be retired are alerted; an undo that fails is
//      alerted (accountNotUndone); an approval request with no approvers to ask is alerted (approvalWithoutApprovers)
//
// Run: node server/test/account-mail-loose-ends.test.js

const { httpPost } = require('./lib/userAccountHarness');
const { bootAccountFlowServer, RESET_ACCESS_POINT_NAME_LIST, RESET_ENDPOINT_FILE_NAME_LIST } = require('./lib/accountFlowHarness');
const { replyByName } = require('../lib/user-account-mail-vocabulary.json');
const { emailSenderOf } = require('../lib/email-sender');
const { accountMailAlerterOf } = require('../lib/account-mail-alerter');

const REGISTRATION_ACCESS_POINT_NAME_LIST = ['user-registration-register', 'user-registration-confirm', 'user-registration-resend', 'user-registration-options'];
const REGISTRATION_ENDPOINT_FILE_NAME_LIST = ['register-user.js', 'confirm-registration.js', 'resend-confirmation.js', 'registration-options.js'];
const APPROVAL_ACCESS_POINT_NAME_LIST = ['account-approval-detail', 'account-approval-decide', 'account-approval-pending-list'];
const APPROVAL_ENDPOINT_FILE_NAME_LIST = ['account-approval-detail.js', 'decide-account-approval.js', 'list-pending-approvals.js'];
const ALL_ACCESS_POINT_NAME_LIST = [...REGISTRATION_ACCESS_POINT_NAME_LIST, ...RESET_ACCESS_POINT_NAME_LIST, ...APPROVAL_ACCESS_POINT_NAME_LIST];
const ALL_ENDPOINT_FILE_NAME_LIST = [...REGISTRATION_ENDPOINT_FILE_NAME_LIST, ...RESET_ENDPOINT_FILE_NAME_LIST, ...APPROVAL_ENDPOINT_FILE_NAME_LIST];

// the words the approval page answered before this work order, written out (not read from the code under test)
const PRE_CHANGE_APPROVED_MESSAGE_TEXT = 'The account was approved and its owner emailed.';
const PRE_CHANGE_DECLINED_MESSAGE_TEXT = 'The account was declined.';
const PRE_CHANGE_RESET_BODY_TEXT = JSON.stringify([{ message: replyByName.resetRequested }]);

// resend 6.39.0 dist/index.cjs fetchRequest: exactly what the SDK resolves when fetch fails, and a provider refusal
const SDK_NETWORK_FAILURE_ANSWER = Object.freeze({ data: null, error: { name: 'application_error', statusCode: null, message: 'Unable to fetch data. The request could not be resolved.' }, headers: null });
const SDK_REFUSAL_ANSWER = Object.freeze({ data: null, error: { name: 'validation_error', statusCode: 403, message: 'The example.org domain is not verified.' }, headers: {} });

// test passwords as named constants (noContainerLiterals.test.js forbids a password literal in an object)
const ADA_PASSWORD_TEXT = 'ada-admin-pass-1';
const ALICE_PASSWORD_TEXT = 'alice-original-pass';
const CAROL_PASSWORD_TEXT = 'carol-original-pass';
const APPLICANT_PASSWORD_TEXT = 'applicant-pass-1';
const UNCONFIRMED_PASSWORD_TEXT = 'unconfirmed-pass-1';

const seedUserList = [
	{ username: 'ada', password: ADA_PASSWORD_TEXT, first: 'Ada', last: 'Admin', emailAdr: 'ada@example.org', phone: '', source: 'test', role: 'admin', disabled: '' },
	{ username: 'alice', password: ALICE_PASSWORD_TEXT, first: 'Alice', last: 'Able', emailAdr: 'alice@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'carol', password: CAROL_PASSWORD_TEXT, first: 'Carol', last: 'Clear', emailAdr: 'carol@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'uma', password: UNCONFIRMED_PASSWORD_TEXT, first: 'Uma', last: 'Unconfirmed', emailAdr: 'uma@example.org', phone: '', source: 'selfRegistration', role: 'user', disabled: 'pendingConfirmation' },
];

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

// a REAL email sender over a stub Resend client that fails only the messages addressed to failingAddressList
const realSenderOf = () => {
	const senderState = { failingAddressList: [], failureMode: 'refused', sentList: [], alertLineList: [] };
	const alerter = accountMailAlerterOf({ minimumIntervalMilliseconds: 0, alertLineWriter: (alertLineText) => senderState.alertLineList.push(alertLineText), heldLineWriter: () => {} });
	senderState.emailSender = emailSenderOf({
		emailSenderSettings: { resendApiKey: 're_stub_not_real', sendingDomain: 'example.org', fromAddress: 'noreply@example.org', fromName: 'EDUcore', retryDelayMillisecondsList: { 0: '5', 1: '10' }, sendBudgetMilliseconds: '3000', attemptTimeoutMilliseconds: '1000' },
		failureAlerter: alerter.alertMailFailure,
		resendClientBuilder: () => ({
			emails: {
				send: (sendParameters) => {
					const isFailing = [].concat(sendParameters.to).some((addressText) => senderState.failingAddressList.includes(addressText));
					if (!isFailing) {
						senderState.sentList.push(sendParameters);
						return Promise.resolve({ data: { id: `msg-${senderState.sentList.length}` }, error: null });
					}
					return Promise.resolve(senderState.failureMode === 'unreachable' ? SDK_NETWORK_FAILURE_ANSWER : SDK_REFUSAL_ANSWER);
				},
			},
		}),
	});
	return senderState;
};
const tokenOfSent = (sendParameters) => (String((sendParameters && sendParameters.text) || '').match(/[?&]token=([A-Za-z0-9_-]{43})/) || [])[1] || '';
const sentTo = (senderState, addressText) => senderState.sentList.filter((sendParameters) => [].concat(sendParameters.to).includes(addressText));

const bootWith = ({ registrationSettingOverrideByName = {}, senderState }, callback) =>
	bootAccountFlowServer({ registrationSettingOverrideByName, seedUserList, accessPointNameList: ALL_ACCESS_POINT_NAME_LIST, endpointFileNameList: ALL_ENDPOINT_FILE_NAME_LIST, emailSenderOverride: senderState.emailSender }, (bootError, harness) => {
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
const tokenStatementOf = (harness, statementText, callback) => harness.sqlDb.getTable('userTokens', (tableError, tokenTable) => tokenTable.runStatement(statementText, { suppressStatementLog: true, noTableNameOk: true }, (statementError) => callback(statementError || tableError || '')));
const describe = (response) => `${response.statusCode} ${response.bodyText}`;
const refusalNameOf = (response) => (response.bodyJson && !Array.isArray(response.bodyJson) ? response.bodyJson.refusalName : '');
const alertLineOf = (mailName, accountName, failureName) => `ACCOUNT_MAIL_ALERT mail=${mailName} account=${accountName} failure=${failureName} heldSinceLast=0`;
const hasAlert = (senderState, mailName, accountName, failureName) => senderState.alertLineList.includes(alertLineOf(mailName, accountName, failureName));
const applicantOf = (username) => ({ username, password: APPLICANT_PASSWORD_TEXT, first: 'App', last: username, emailAdr: `${username}@example.org` });

// n requests one after another, each answer collected
const repeatPost = (post, routePath, requestBody, repeatCount, callback, collectedList = []) => {
	if (collectedList.length >= repeatCount) {
		callback(collectedList);
		return;
	}
	post(routePath, requestBody, (response) => repeatPost(post, routePath, requestBody, repeatCount, callback, [...collectedList, response]));
};

const stepList = [];
const step = (stepFunction) => stepList.push(stepFunction);

// ---- E1 the approval page never claims an email that was not sent
const APPROVAL_SETTINGS = Object.freeze({ requireAdminApproval: 'true', requireEmailConfirmation: 'false' });
const decisionCheckOf = ({ harness, senderState, adaToken }) => ({ label, username, decisionRequest, failureMode, isFailing, expectedReplyText, expectedStateText, expectedAlertFailureName, expectedMailName, isNoticeFlagExpected, declineLinePattern }, done) => {
	const post = postTo(harness);
	post('/api/registerUser', applicantOf(username), () => rowOf(harness, username, (applicantRow) => {
		senderState.failureMode = failureMode;
		senderState.failingAddressList = isFailing ? [`${username}@example.org`] : [];
		const alertCountBefore = senderState.alertLineList.length;
		const sentCountBefore = senderState.sentList.length;
		post('/api/decideAccountApproval', { userRefId: applicantRow.refId, ...decisionRequest }, (decideResponse) => rowOf(harness, username, (decidedRow) => {
			const reply = (decideResponse.bodyJson || [])[0] || {};
			check(`E1 ${label}: 200 and the decision is stored (${expectedStateText}, decided by ada)`, decideResponse.statusCode === 200 && decidedRow.disabled === expectedStateText && reply.latestDecision && reply.latestDecision.deciderUsername === 'ada', `${describe(decideResponse)} disabled=${decidedRow.disabled}`);
			check(`E1 ${label}: the reply says what happened to the email`, reply.message === expectedReplyText, reply.message);
			check(`E1 ${label}: isApplicantMailNotSent is ${!!isNoticeFlagExpected}`, reply.isApplicantMailNotSent === !!isNoticeFlagExpected, JSON.stringify(reply.isApplicantMailNotSent));
			const newAlertList = senderState.alertLineList.slice(alertCountBefore);
			check(`E1 ${label}: ${expectedAlertFailureName ? `the alert line is written (${expectedAlertFailureName})` : 'no alert'}`, expectedAlertFailureName ? newAlertList.includes(alertLineOf(expectedMailName, username, expectedAlertFailureName)) : !newAlertList.length, JSON.stringify(newAlertList));
			const noticeMail = senderState.sentList.slice(sentCountBefore).find((sendParameters) => /New EDUcore account/.test(sendParameters.subject));
			const noticeText = noticeMail ? noticeMail.text : '';
			check(`E1 ${label}: the approvers' notice ${isNoticeFlagExpected ? 'says the applicant was NOT emailed' : 'has no not-sent paragraph'}${declineLinePattern ? ` and its decline line reads ${declineLinePattern}` : ''}`, !!noticeMail && /One thing IS needed/.test(noticeText) === !!isNoticeFlagExpected && (!declineLinePattern || declineLinePattern.test(noticeText)), noticeText);
			done();
		}), adaToken);
	}));
};

step((done) => {
	const senderState = realSenderOf();
	bootWith({ registrationSettingOverrideByName: APPROVAL_SETTINGS, senderState }, (harness) =>
		postTo(harness)('/api/login', { username: 'ada', password: ADA_PASSWORD_TEXT }, (loginResponse) => {
			const runDecision = decisionCheckOf({ harness, senderState, adaToken: loginResponse.authtoken || '' });
			const caseList = [
				{ label: 'approve, mail working', username: 'appok', decisionRequest: { decisionName: 'approve' }, failureMode: 'refused', isFailing: false, expectedReplyText: PRE_CHANGE_APPROVED_MESSAGE_TEXT, expectedStateText: '', isNoticeFlagExpected: false },
				{ label: 'approve, applicant mail unreachable', username: 'appunreach', decisionRequest: { decisionName: 'approve' }, failureMode: 'unreachable', isFailing: true, expectedReplyText: replyByName.accountApprovedMailNotSentReply, expectedStateText: '', expectedAlertFailureName: 'providerUnreachable', expectedMailName: 'accountApprovedMail', isNoticeFlagExpected: true },
				{ label: 'approve, applicant mail refused', username: 'apprefuse', decisionRequest: { decisionName: 'approve' }, failureMode: 'refused', isFailing: true, expectedReplyText: replyByName.accountApprovedMailRefusedReply, expectedStateText: '', expectedAlertFailureName: 'providerRefused', expectedMailName: 'accountApprovedMail', isNoticeFlagExpected: true },
				{ label: 'decline with email, mail working', username: 'decok', decisionRequest: { decisionName: 'decline', sendDeclineEmail: true }, failureMode: 'refused', isFailing: false, expectedReplyText: PRE_CHANGE_DECLINED_MESSAGE_TEXT, expectedStateText: 'declined', isNoticeFlagExpected: false, declineLinePattern: /Decline email to the applicant: sent/ },
				{ label: 'decline with email, applicant mail refused', username: 'decrefuse', decisionRequest: { decisionName: 'decline', sendDeclineEmail: true }, failureMode: 'refused', isFailing: true, expectedReplyText: replyByName.accountDeclinedMailRefusedReply, expectedStateText: 'declined', expectedAlertFailureName: 'providerRefused', expectedMailName: 'accountDeclinedMail', isNoticeFlagExpected: true, declineLinePattern: /Decline email to the applicant: NOT sent/ },
				{ label: 'decline with email, applicant mail unreachable', username: 'decunreach', decisionRequest: { decisionName: 'decline', sendDeclineEmail: true }, failureMode: 'unreachable', isFailing: true, expectedReplyText: replyByName.accountDeclinedMailNotSentReply, expectedStateText: 'declined', expectedAlertFailureName: 'providerUnreachable', expectedMailName: 'accountDeclinedMail', isNoticeFlagExpected: true },
				{ label: 'decline, email suppressed (nothing to fail)', username: 'decquiet', decisionRequest: { decisionName: 'decline', sendDeclineEmail: false }, failureMode: 'refused', isFailing: true, expectedReplyText: PRE_CHANGE_DECLINED_MESSAGE_TEXT, expectedStateText: 'declined', isNoticeFlagExpected: false, declineLinePattern: /Decline email to the applicant: not sent \(suppressed/ },
			];
			const runCase = (remainingList) => {
				if (!remainingList.length) {
					harness.close();
					done();
					return;
				}
				runDecision(remainingList[0], () => runCase(remainingList.slice(1)));
			};
			runCase(caseList);
		}),
	);
});

// ---- E3 a request whose email failed does not count against the identifier limit (5 per 15 min in the harness)
step((done) => {
	const senderState = realSenderOf();
	bootWith({ senderState }, (harness) => {
		const post = postTo(harness);
		senderState.failingAddressList = ['alice@example.org'];
		repeatPost(post, '/api/requestPasswordReset', { identifier: 'alice' }, 5, (failedList) => {
			check('E3 reset: five requests whose mail fails each answer 503 accountMailRefused', failedList.every((response) => response.statusCode === 503 && refusalNameOf(response) === 'accountMailRefused'), failedList.map(describe).join(' | '));
			senderState.failingAddressList = [];
			post('/api/requestPasswordReset', { identifier: 'alice' }, (sixthResponse) => {
				check('E3 reset: a sixth, mail working, is SENT (the failed five did not spend the identifier limit)', sixthResponse.statusCode === 200 && sixthResponse.bodyText === PRE_CHANGE_RESET_BODY_TEXT && sentTo(senderState, 'alice@example.org').length === 1, `${describe(sixthResponse)} sent=${sentTo(senderState, 'alice@example.org').length}`);
				repeatPost(post, '/api/requestPasswordReset', { identifier: 'carol' }, 6, (carolList) => {
					check('E3 reset: five that are sent spend the limit: the sixth is refused tooManyRequests (429), unsent', carolList.slice(0, 5).every((response) => response.statusCode === 200) && carolList[5].statusCode === 429 && refusalNameOf(carolList[5]) === 'tooManyRequests' && sentTo(senderState, 'carol@example.org').length === 5, carolList.map((response) => response.statusCode).join(','));
					repeatPost(post, '/api/requestPasswordReset', { identifier: 'nobody-at-all' }, 6, (nobodyList) => {
						check('E3 reset: five for no account still count: the sixth is refused tooManyRequests', nobodyList.slice(0, 5).every((response) => response.bodyText === PRE_CHANGE_RESET_BODY_TEXT) && nobodyList[5].statusCode === 429, nobodyList.map((response) => response.statusCode).join(','));
						harness.close();
						done();
					});
				});
			});
		});
	});
});

step((done) => {
	const senderState = realSenderOf();
	bootWith({ registrationSettingOverrideByName: { addressRequestLimit: '3' }, senderState }, (harness) => {
		senderState.failingAddressList = ['alice@example.org'];
		repeatPost(postTo(harness), '/api/requestPasswordReset', { identifier: 'alice' }, 4, (responseList) => {
			check('E3 the per-address limit still counts failed sends: with addressRequestLimit=3 the fourth is refused tooManyRequests', responseList.slice(0, 3).every((response) => refusalNameOf(response) === 'accountMailRefused') && responseList[3].statusCode === 429 && refusalNameOf(responseList[3]) === 'tooManyRequests', responseList.map(describe).join(' | '));
			harness.close();
			done();
		});
	});
});

step((done) => {
	const senderState = realSenderOf();
	bootWith({ senderState }, (harness) => {
		const post = postTo(harness);
		senderState.failingAddressList = ['uma@example.org', 'newcomer@example.org'];
		repeatPost(post, '/api/resendConfirmation', { identifier: 'uma' }, 5, (resendList) => {
			senderState.failingAddressList = ['newcomer@example.org'];
			post('/api/resendConfirmation', { identifier: 'uma' }, (sixthResendResponse) => {
				check('E3 resend: five failed (503) then a sixth, mail working, is sent', resendList.every((response) => response.statusCode === 503) && sixthResendResponse.statusCode === 200 && sentTo(senderState, 'uma@example.org').length === 1, `${resendList.map((response) => response.statusCode).join(',')} then ${describe(sixthResendResponse)}`);
				repeatPost(post, '/api/registerUser', applicantOf('newcomer'), 5, (registerList) => {
					senderState.failingAddressList = [];
					post('/api/registerUser', applicantOf('newcomer'), (sixthRegisterResponse) => rowOf(harness, 'newcomer', (newcomerRow) => {
						check('E3 sign-up: five undone (503 registrationMailRefused) then a sixth, mail working, creates the account', registerList.every((response) => refusalNameOf(response) === 'registrationMailRefused') && sixthRegisterResponse.statusCode === 200 && newcomerRow.disabled === 'pendingConfirmation', `${registerList.map((response) => refusalNameOf(response)).join(',')} then ${describe(sixthRegisterResponse)}`);
						harness.close();
						done();
					}));
				});
			});
		});
	});
});

// ---- E4 failures before any send are alerted through the same alerter
const INSERT_REFUSED_TRIGGER_TEXT = "CREATE TRIGGER testRefusesTokenInsert BEFORE INSERT ON <!tableName!> BEGIN SELECT RAISE(ABORT, 'test: token insert refused'); END";
const UPDATE_REFUSED_TRIGGER_TEXT = "CREATE TRIGGER testRefusesTokenUpdate BEFORE UPDATE ON <!tableName!> BEGIN SELECT RAISE(ABORT, 'test: token update refused'); END";
const DELETE_REFUSED_TRIGGER_TEXT = "CREATE TRIGGER testRefusesTokenDelete BEFORE DELETE ON <!tableName!> BEGIN SELECT RAISE(ABORT, 'test: token delete refused'); END";

step((done) => {
	const senderState = realSenderOf();
	bootWith({ senderState }, (harness) => {
		const post = postTo(harness);
		tokenStatementOf(harness, INSERT_REFUSED_TRIGGER_TEXT, (triggerError) => {
			check('E4 setup: the token insert is made to fail', !triggerError, triggerError);
			post('/api/registerUser', applicantOf('tokenless'), (registerResponse) => rowOf(harness, 'tokenless', (tokenlessRow) => {
				check('E4 sign-up, confirmation link not issued: refused registrationMailRefused, the account undone', refusalNameOf(registerResponse) === 'registrationMailRefused' && !tokenlessRow.username, `${describe(registerResponse)} row=${tokenlessRow.username || 'none'}`);
				check('E4 sign-up, confirmation link not issued: the ACCOUNT_MAIL_ALERT line is written', hasAlert(senderState, 'confirmEmail', 'tokenless', 'confirmationTokenNotIssued'), JSON.stringify(senderState.alertLineList));
				post('/api/requestPasswordReset', { identifier: 'alice' }, (resetResponse) => {
					check('E4 reset, link not issued: the answer is unchanged (the pre-change body) and the alert line is written', resetResponse.bodyText === PRE_CHANGE_RESET_BODY_TEXT && hasAlert(senderState, 'passwordReset', 'alice', 'resetTokenNotIssued'), `${describe(resetResponse)} ${JSON.stringify(senderState.alertLineList)}`);
					post('/api/resendConfirmation', { identifier: 'uma' }, (resendResponse) => {
						check('E4 resend, link not issued: the answer is unchanged and the alert line is written', resendResponse.statusCode === 200 && hasAlert(senderState, 'confirmEmail', 'uma', 'confirmationTokenNotIssued'), `${describe(resendResponse)} ${JSON.stringify(senderState.alertLineList)}`);
						tokenStatementOf(harness, 'DROP TRIGGER testRefusesTokenInsert', (dropError) => check('E4 setup: trigger testRefusesTokenInsert removed', !dropError, dropError) ||
							// one link sent first, so the next reset has an earlier link to retire
							post('/api/requestPasswordReset', { identifier: 'alice' }, () => tokenStatementOf(harness, UPDATE_REFUSED_TRIGGER_TEXT, () =>
								post('/api/requestPasswordReset', { identifier: 'alice' }, (sentResetResponse) => {
									check('E4 reset sent but earlier links not retired: the answer is unchanged and the alert line is written', sentResetResponse.bodyText === PRE_CHANGE_RESET_BODY_TEXT && !!tokenOfSent(sentTo(senderState, 'alice@example.org').pop()) && hasAlert(senderState, 'passwordReset', 'alice', 'earlierResetLinksNotRetired'), `${describe(sentResetResponse)} ${JSON.stringify(senderState.alertLineList)}`);
									tokenStatementOf(harness, 'DROP TRIGGER testRefusesTokenUpdate', (dropError) => check('E4 setup: trigger testRefusesTokenUpdate removed', !dropError, dropError) ||
										tokenStatementOf(harness, DELETE_REFUSED_TRIGGER_TEXT, () => {
											senderState.failingAddressList = ['stuck@example.org'];
											post('/api/registerUser', applicantOf('stuck'), (stuckResponse) => {
												check('E4 sign-up whose undo fails: 500 and the alert line names accountNotUndone', stuckResponse.statusCode === 500 && hasAlert(senderState, 'confirmEmail', 'stuck', 'accountNotUndone'), `${describe(stuckResponse)} ${JSON.stringify(senderState.alertLineList)}`);
												harness.close();
												done();
											});
										}),
									);
								}),
							)),
						);
					});
				});
			}));
		});
	});
});

step((done) => {
	const senderState = realSenderOf();
	bootWith({ registrationSettingOverrideByName: { ...APPROVAL_SETTINGS, newAccountNoticeList: {} }, senderState }, (harness) => {
		postTo(harness)('/api/registerUser', applicantOf('lonely'), (registerResponse) => {
			check('E4 approval with nobody to ask: the account still waits (200) and approvalWithoutApprovers is alerted', registerResponse.statusCode === 200 && hasAlert(senderState, 'approvalRequest', 'lonely', 'approvalWithoutApprovers'), `${describe(registerResponse)} ${JSON.stringify(senderState.alertLineList)}`);
			harness.close();
			done();
		});
	});
});

// ---- E4 the interface: alertFailure refuses a missing name
step((done) => {
	const senderState = realSenderOf();
	const thrownText = ((attempt) => {
		const outcome = { text: '' };
		try {
			attempt();
		} catch (thrownError) {
			outcome.text = thrownError.message;
		}
		return outcome.text;
	})(() => senderState.emailSender.alertFailure({ mailName: 'confirmEmail', accountName: 'someone' }));
	check('E4 alertFailure without a failureName throws by name', /alertFailure requires failureName/.test(thrownText), thrownText);
	done();
});

const runNext = (remainingList) => {
	if (!remainingList.length) {
		const failedCount = resultList.filter((passed) => !passed).length;
		console.log(`account-mail-loose-ends: ${resultList.length - failedCount} passed, ${failedCount} failed`);
		process.exit(failedCount ? 1 : 0);
		return;
	}
	remainingList[0](() => runNext(remainingList.slice(1)));
};
runNext(stepList);
