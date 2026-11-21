'use strict';
// admin-approval.test.js — gate for WORKORDER-adminApproval-112126 (admin approval of new registrations). Boots the REAL
// login, registration, reset and approval endpoints and access points (test/lib/accountFlowHarness.js) on scratch
// databases, mail stubbed to a capture list.
//
// Phase 1
//   P1.1 a pendingApproval and a declined account are refused by name at website login (awaitingApproval,
//        accountNotApproved), only once the password is right
//   P1.2 the same two at the OAuth sign-in page (real oauth-interactions + the real oidc-verify-credential hook)
//   P1.3 every account mail (confirmation, new-account notice, reset, password changed) carries "coming from <host>" in
//        subject and body, host from publicSiteUrl; and every message in the vocabulary does, composed directly
//   P1.4 requireAdminApproval and adminApprovalEmailSuppress are required settings (no default); approval on with an
//        empty newAccountNoticeList is named at startup (approvalWithoutApprovers)
//
// Phase 2
//   P2.1 confirmation on + approval on: sign-up -> confirm -> pendingApproval, NOT signed in, applicant mailed, the
//        approval request to every list address with a link to that applicant's page; login refused; approve -> the
//        approved mail, the "approved by" notice, the decision recorded, and login works
//   P2.2 confirmation off + approval on: the approval request goes out at sign-up, not signed in
//   P2.3 approval off: no approval mail; sign-up and confirmation sign in as before
//   P2.4 decideAccountApproval refused by name for a non-admin, for a non-admin sending role: 'admin' in the body, and
//        for a token whose claims say admin while the database row does not; the detail and pending list likewise
//   P2.5 decline with sendDeclineEmail true sends, false sends nothing; the row is declined; re-registering that email
//        is refused; a decline without a true/false choice is refused by name
//   P2.6 already decided: approve after decline works; decline after approve is refused (approvalNotDecidable); an
//        account still awaiting confirmation and an unknown account are refused by name
//   P2.7 approval on with an empty newAccountNoticeList: each sign-up logs approvalWithoutApprovers by name
//   P2.8 detail shows the applicant, who decided and when, and presets the decline-email control from the setting
//
// Run: node server/test/admin-approval.test.js

const path = require('path');
const { httpPost } = require('./lib/userAccountHarness');
const { bootAccountFlowServer, tokenOfMail, RESET_ACCESS_POINT_NAME_LIST, RESET_ENDPOINT_FILE_NAME_LIST } = require('./lib/accountFlowHarness');

const serverPath = path.join(__dirname, '..');
const REGISTRATION_ACCESS_POINT_NAME_LIST = ['user-registration-register', 'user-registration-confirm', 'user-registration-resend', 'user-registration-options'];
const REGISTRATION_ENDPOINT_FILE_NAME_LIST = ['register-user.js', 'confirm-registration.js', 'resend-confirmation.js', 'registration-options.js'];
const APPROVAL_ACCESS_POINT_NAME_LIST = ['account-approval-detail', 'account-approval-decide', 'account-approval-pending-list'];
const APPROVAL_ENDPOINT_FILE_NAME_LIST = ['account-approval-detail.js', 'decide-account-approval.js', 'list-pending-approvals.js'];
const ACCESS_POINT_NAME_LIST = [...REGISTRATION_ACCESS_POINT_NAME_LIST, ...RESET_ACCESS_POINT_NAME_LIST, ...APPROVAL_ACCESS_POINT_NAME_LIST, 'oidc-verify-credential'];
const ENDPOINT_FILE_NAME_LIST = [...REGISTRATION_ENDPOINT_FILE_NAME_LIST, ...RESET_ENDPOINT_FILE_NAME_LIST, ...APPROVAL_ENDPOINT_FILE_NAME_LIST];
const APPROVAL_ON = Object.freeze({ requireAdminApproval: 'true' });
const SITE_HOST = 'site.example.org';
const COMING_FROM_PATTERN = new RegExp(`coming from ${SITE_HOST.replace(/\./g, '\\.')}`);

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const PAULA_PASSWORD = 'paula-pending-pass';
const DECLAN_PASSWORD = 'declan-declined-pass';
const ALICE_PASSWORD = 'alice-original-pass';
const ALICE_NEW_PASSWORD = 'alice-brand-new-pass';
const NEWCOMER_PASSWORD = 'newcomer-pass-1';
const WRONG_PASSWORD = 'wrong-password-here';
const ADA_PASSWORD = 'ada-admin-pass-1';
const URSULA_PASSWORD = 'ursula-user-pass-1';
const APPLICANT_PASSWORD = 'applicant-pass-1';
const seedUserList = [
	{ username: 'alice', password: ALICE_PASSWORD, first: 'Alice', last: 'Able', emailAdr: 'alice@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'paula', password: PAULA_PASSWORD, first: 'Paula', last: 'Pending', emailAdr: 'paula@example.org', phone: '', source: 'selfRegistration', role: 'user', disabled: 'pendingApproval' },
	{ username: 'declan', password: DECLAN_PASSWORD, first: 'Declan', last: 'Declined', emailAdr: 'declan@example.org', phone: '', source: 'selfRegistration', role: 'user', disabled: 'declined' },
	{ username: 'ada', password: ADA_PASSWORD, first: 'Ada', last: 'Admin', emailAdr: 'ada@example.org', phone: '', source: 'test', role: 'admin', disabled: '' },
	{ username: 'ursula', password: URSULA_PASSWORD, first: 'Ursula', last: 'User', emailAdr: 'ursula@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
];

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

// the OAuth provider's real sign-in POST handler, with a stub provider and express, and the harness's REAL credential hook
const oauthSignInOf = (harness) => {
	const makeInteractions = require(path.join(serverPath, 'lib', 'oauth-interactions'));
	const routeHandlerByPath = {};
	const stubExpressApp = { get: () => {}, post: (routePath, handler) => { routeHandlerByPath[routePath] = handler; }, use: () => {} };
	const stubThrottle = { check: () => ({ allowed: true }), recordFailure: () => {}, recordSuccess: () => {} };
	const { csrfToken } = makeInteractions({ provider: { interactionResult: () => Promise.resolve('/oauth/next') }, credentialHook: harness.accessPointByName['oidc-verify-credential'], throttle: stubThrottle, audit: { write: () => {} }, csrfSecret: 'approval-test-csrf' })({ expressApp: stubExpressApp });
	return ({ username, password }, callback) => {
		const uid = 'uid-approval';
		const responseState = { statusCode: 200, headerByName: {} };
		const stubResponse = {
			removeHeader: () => {},
			setHeader: (headerName, headerText) => { responseState.headerByName[headerName.toLowerCase()] = headerText; },
			set: (headerName, headerText) => { responseState.headerByName[headerName.toLowerCase()] = headerText; return stubResponse; },
			status: (statusCode) => { responseState.statusCode = statusCode; return stubResponse; },
			send: (htmlText) => callback({ statusCode: responseState.statusCode, htmlText: String(htmlText || ''), location: responseState.headerByName.location || '' }),
		};
		routeHandlerByPath['/oauth/interaction/:uid/login']({ params: { uid }, body: { username, password, csrf: csrfToken(uid) }, headers: {}, ip: '127.0.0.1', socket: {} }, stubResponse);
	};
};

const stepList = [];
const step = (stepFunction) => stepList.push(stepFunction);
const state = {};

// ---- P1.1 website login
step((done) => bootWith({}, (harness) => {
	state.phaseOneHarness = harness;
	const post = postTo(harness);
	post('/api/login', { username: 'paula', password: PAULA_PASSWORD }, (pendingLogin) => {
		check('P1.1 website login: a pendingApproval account is refused by name (awaitingApproval, 403)', pendingLogin.statusCode === 403 && pendingLogin.bodyJson && pendingLogin.bodyJson.refusalName === 'awaitingApproval', `${pendingLogin.statusCode} ${pendingLogin.bodyText}`);
		post('/api/login', { username: 'declan', password: DECLAN_PASSWORD }, (declinedLogin) => {
			check('P1.1 website login: a declined account is refused by name (accountNotApproved, 403)', declinedLogin.statusCode === 403 && declinedLogin.bodyJson && declinedLogin.bodyJson.refusalName === 'accountNotApproved', `${declinedLogin.statusCode} ${declinedLogin.bodyText}`);
			post('/api/login', { username: 'paula', password: WRONG_PASSWORD }, (wrongLogin) => {
				check('P1.1 website login: a wrong password on a pending account names no state', wrongLogin.statusCode !== 200 && !/awaitingApproval|accountNotApproved/.test(wrongLogin.bodyText), wrongLogin.bodyText);
				post('/api/login', { username: 'alice', password: ALICE_PASSWORD }, (activeLogin) => {
					check('P1.1 website login: an active account still signs in', activeLogin.statusCode === 200, `${activeLogin.statusCode} ${activeLogin.bodyText}`);
					done();
				});
			});
		});
	});
}));

// ---- P1.2 OAuth sign-in page
step((done) => {
	const signIn = oauthSignInOf(state.phaseOneHarness);
	signIn({ username: 'paula', password: PAULA_PASSWORD }, (pendingReply) => {
		check('P1.2 OAuth sign-in: a pendingApproval account is refused by name (awaitingApproval, 403)', pendingReply.statusCode === 403 && /awaitingApproval/.test(pendingReply.htmlText), `${pendingReply.statusCode} ${pendingReply.htmlText.slice(-300)}`);
		signIn({ username: 'declan', password: DECLAN_PASSWORD }, (declinedReply) => {
			check('P1.2 OAuth sign-in: a declined account is refused by name (accountNotApproved, 403)', declinedReply.statusCode === 403 && /accountNotApproved/.test(declinedReply.htmlText), `${declinedReply.statusCode} ${declinedReply.htmlText.slice(-300)}`);
			signIn({ username: 'declan', password: WRONG_PASSWORD }, (wrongReply) => {
				check('P1.2 OAuth sign-in: a wrong password on a declined account says only "Invalid username or password." (401)', wrongReply.statusCode === 401 && /Invalid username or password/.test(wrongReply.htmlText) && !/accountNotApproved/.test(wrongReply.htmlText), `${wrongReply.statusCode} ${wrongReply.htmlText.slice(-200)}`);
				signIn({ username: 'alice', password: ALICE_PASSWORD }, (activeReply) => {
					check('P1.2 OAuth sign-in: an active account is let through (303 to the provider)', activeReply.statusCode === 303 && activeReply.location === '/oauth/next', `${activeReply.statusCode} ${activeReply.location}`);
					done();
				});
			});
		});
	});
});

// ---- P1.3 "coming from <host>" in every account mail
const comingFromProblemOf = (mailMessage) => {
	if (!mailMessage) {
		return 'no such mail';
	}
	const problemList = [['subject', mailMessage.subject], ['text', mailMessage.text], ['html', mailMessage.html]].filter(([, partText]) => !COMING_FROM_PATTERN.test(String(partText || ''))).map(([partName]) => partName);
	return problemList.length ? `missing in ${problemList.join(', ')}: ${mailMessage.subject}` : '';
};

step((done) => {
	const harness = state.phaseOneHarness;
	const post = postTo(harness);
	harness.capturedMailList.length = 0;
	post('/api/registerUser', { username: 'newcomer', password: NEWCOMER_PASSWORD, first: 'New', last: 'Comer', emailAdr: 'newcomer@example.org' }, () => {
		const confirmMail = harness.capturedMailList.find((mailMessage) => /confirm\?token=/.test(mailMessage.text));
		const noticeMail = harness.capturedMailList.find((mailMessage) => /^New EDUcore account/.test(mailMessage.subject));
		check('P1.3 confirmation mail says "coming from site.example.org" in subject and body', confirmMail && !comingFromProblemOf(confirmMail), comingFromProblemOf(confirmMail));
		check('P1.3 new-account notice says "coming from site.example.org" in subject and body', noticeMail && !comingFromProblemOf(noticeMail), comingFromProblemOf(noticeMail));
		post('/api/requestPasswordReset', { identifier: 'alice' }, () => {
			const resetMail = harness.capturedMailList.find((mailMessage) => /reset-password\?token=/.test(mailMessage.text));
			check('P1.3 reset mail says "coming from site.example.org" in subject and body', resetMail && !comingFromProblemOf(resetMail), comingFromProblemOf(resetMail));
			post('/api/completePasswordReset', { token: tokenOfMail(resetMail), password: ALICE_NEW_PASSWORD }, () => {
				const changedMail = harness.capturedMailList.find((mailMessage) => /password was changed/i.test(mailMessage.subject));
				check('P1.3 password-changed mail says "coming from site.example.org" in subject and body', changedMail && !comingFromProblemOf(changedMail), comingFromProblemOf(changedMail));
				done();
			});
		});
	});
});

step((done) => {
	const { accountMailOf } = require(path.join(serverPath, 'lib', 'user-account-mail'));
	const { messageByName } = require(path.join(serverPath, 'lib', 'user-account-mail-vocabulary.json'));
	const problemList = Object.keys(messageByName).map((messageName) => [messageName, comingFromProblemOf(accountMailOf({ messageName, fillByName: { siteUrl: `https://${SITE_HOST}` } }))]).filter(([, problemText]) => problemText);
	check(`P1.3 every message in the vocabulary (${Object.keys(messageByName).length}) says where it came from`, !problemList.length, JSON.stringify(problemList));
	const composeWithoutSite = () => accountMailOf({ messageName: Object.keys(messageByName)[0], fillByName: {} });
	check('P1.3 a mail composed without siteUrl is refused (it could not say where it came from)', /needs fillByName\.siteUrl/.test(String((() => { try { composeWithoutSite(); return ''; } catch (composeError) { return composeError.message; } })())));
	done();
});

// ---- P1.4 the settings
step((done) => {
	const { registrationSettingsOf } = require(path.join(serverPath, 'lib', 'user-registration-settings'));
	const { BASE_REGISTRATION_SETTINGS } = require('./lib/accountFlowHarness');
	const { requireAdminApproval, ...withoutApproval } = BASE_REGISTRATION_SETTINGS;
	const { adminApprovalEmailSuppress, ...withoutSuppress } = BASE_REGISTRATION_SETTINGS;
	check('P1.4 a missing requireAdminApproval is refused by name, not defaulted', /registrationNotConfigured.*requireAdminApproval/.test(registrationSettingsOf(withoutApproval).settingsRefusal), registrationSettingsOf(withoutApproval).settingsRefusal);
	check('P1.4 a missing adminApprovalEmailSuppress is refused by name, not defaulted', /registrationNotConfigured.*adminApprovalEmailSuppress/.test(registrationSettingsOf(withoutSuppress).settingsRefusal), registrationSettingsOf(withoutSuppress).settingsRefusal);
	check('P1.4 requireAdminApproval=maybe is refused by name', /requireAdminApproval/.test(registrationSettingsOf({ ...BASE_REGISTRATION_SETTINGS, requireAdminApproval: 'maybe' }).settingsRefusal));
	const emptyListSettings = registrationSettingsOf({ ...BASE_REGISTRATION_SETTINGS, requireAdminApproval: 'true', newAccountNoticeList: {} });
	check('P1.4 approval on with an empty notice list is named at startup (approvalWithoutApprovers)', !emptyListSettings.settingsRefusal && emptyListSettings.settingsWarningList.some((warningText) => /^approvalWithoutApprovers/.test(warningText)), JSON.stringify(emptyListSettings.settingsWarningList));
	check('P1.4 approval off with an empty list warns of nothing', !registrationSettingsOf({ ...BASE_REGISTRATION_SETTINGS, newAccountNoticeList: {} }).settingsWarningList.length);
	done();
});

// ---- Phase 2 helpers
const jwt = require(path.join(serverPath, 'node_modules', 'jsonwebtoken'));
const rowOf = (harness, username, callback) => harness.userTable.getData(`SELECT * FROM <!tableName!> WHERE username = '${username}'`, { suppressStatementLog: true }, (readError, rowList = []) => callback(rowList[0] || {}));
const mailsWith = (harness, subjectPattern) => harness.capturedMailList.filter((mailMessage) => subjectPattern.test(mailMessage.subject));
const tokenOfSignIn = (harness, username, password, callback) => postTo(harness)('/api/login', { username, password }, (loginResponse) => callback(loginResponse.authtoken || ''));
const applicantOf = (username) => ({ username, password: APPLICANT_PASSWORD, first: 'App', last: username, emailAdr: `${username}@example.org` });
const confirmMailOf = (harness, username) => harness.capturedMailList.filter((mailMessage) => /confirm\?token=/.test(mailMessage.text) && mailMessage.toList.includes(`${username}@example.org`)).pop();
const confirmOf = (harness, username, callback, confirmMail = confirmMailOf(harness, username)) => postTo(harness)('/api/confirmRegistration', { token: tokenOfMail(confirmMail) }, callback);
// a reply signs someone in when its token's claims name them; an anonymous reply carries a token that names no one
const signedInUsernameOf = (response) => {
	const claimsText = String((response && response.authclaimsText) || '');
	return /^\s*\{/.test(claimsText) ? ((JSON.parse(claimsText).user || {}).username || '') : '';
};
const registerAndConfirm = (harness, username, callback) => postTo(harness)('/api/registerUser', applicantOf(username), () => confirmOf(harness, username, () => rowOf(harness, username, callback)));

// ---- P2.1 confirmation on + approval on, through approval
step((done) => bootWith(APPROVAL_ON, (harness) => {
	state.approvalHarness = harness;
	const post = postTo(harness);
	post('/api/registerUser', applicantOf('appone'), (registerResponse) => {
		check('P2.1 sign-up says the application goes to an approver after the email is confirmed, not signed in', registerResponse.statusCode === 200 && /goes to an administrator for approval/.test(registerResponse.bodyText) && signedInUsernameOf(registerResponse) !== 'appone', `${registerResponse.bodyText} ${registerResponse.authclaimsText}`);
		const apponeConfirmMail = confirmMailOf(harness, 'appone');
		check('P2.1 no approval request before the address is confirmed (A2), and no informational notice', !mailsWith(harness, /Approval needed|New EDUcore account/).length, JSON.stringify(harness.capturedMailList.map((mailMessage) => mailMessage.subject)));
		harness.capturedMailList.length = 0;
		post('/api/confirmRegistration', { token: tokenOfMail(apponeConfirmMail) }, (confirmResponse) => {
			check('P2.1 confirm: 200, says out for approval, NOT signed in (no user; the token names no one)', confirmResponse.statusCode === 200 && confirmResponse.bodyJson && confirmResponse.bodyJson[0].isAwaitingApproval === true && !confirmResponse.bodyJson[0].user && signedInUsernameOf(confirmResponse) !== 'appone', `${confirmResponse.statusCode} ${confirmResponse.bodyText} ${confirmResponse.authclaimsText}`);
			rowOf(harness, 'appone', (applicantRow) => {
				state.apponeRefId = applicantRow.refId;
				check('P2.1 the row is pendingApproval', applicantRow.disabled === 'pendingApproval', applicantRow.disabled);
				const applicantMail = mailsWith(harness, /waiting for approval/)[0];
				check('P2.1 the applicant was told it awaits approval', applicantMail && JSON.stringify(applicantMail.toList) === '["appone@example.org"]', JSON.stringify(applicantMail && applicantMail.toList));
				const requestMail = mailsWith(harness, /^Approval needed/)[0];
				const approvalPageUrl = `https://${SITE_HOST}/account-approval?userRefId=${encodeURIComponent(applicantRow.refId)}`;
				check('P2.1 the approval request went to every list address', requestMail && JSON.stringify(requestMail.toList) === '["notice-one@example.org","notice-two@example.org"]', JSON.stringify(requestMail && requestMail.toList));
				check('P2.1 the approval request says plainly it is awaiting approval and links to that applicant\'s page', requestMail && /waiting for an administrator to approve it/.test(requestMail.text) && requestMail.text.includes(approvalPageUrl) && requestMail.html.includes(`href="${approvalPageUrl}"`), requestMail && requestMail.text);
				check('P2.1 the approval mails say where they came from', [applicantMail, requestMail].every((mailMessage) => !comingFromProblemOf(mailMessage)));
				post('/api/login', { username: 'appone', password: APPLICANT_PASSWORD }, (pendingLogin) => {
					check('P2.1 login while pending is refused (awaitingApproval)', pendingLogin.statusCode === 403 && pendingLogin.bodyJson && pendingLogin.bodyJson.refusalName === 'awaitingApproval', pendingLogin.bodyText);
					tokenOfSignIn(harness, 'ada', ADA_PASSWORD, (adaToken) => {
						state.adaToken = adaToken;
						harness.capturedMailList.length = 0;
						post('/api/decideAccountApproval', { userRefId: applicantRow.refId, decisionName: 'approve' }, (approveResponse) => {
							check('P2.1 approve by an admin: 200, the applicant active', approveResponse.statusCode === 200 && approveResponse.bodyJson && approveResponse.bodyJson[0].applicant.accountState === 'active', `${approveResponse.statusCode} ${approveResponse.bodyText}`);
							const approvedMail = mailsWith(harness, /was approved/)[0];
							check('P2.1 the applicant got "approved, sign in here"', approvedMail && JSON.stringify(approvedMail.toList) === '["appone@example.org"]' && approvedMail.text.includes(`https://${SITE_HOST}/login`), approvedMail && approvedMail.text);
							const decidedMail = mailsWith(harness, /approved by ada/)[0];
							check('P2.1 the notice list was told "approved by ada"', decidedMail && JSON.stringify(decidedMail.toList) === '["notice-one@example.org","notice-two@example.org"]', JSON.stringify(harness.capturedMailList.map((mailMessage) => mailMessage.subject)));
							check('P2.1 the decision mails say where they came from', approvedMail && decidedMail && [approvedMail, decidedMail].every((mailMessage) => !comingFromProblemOf(mailMessage)));
							const latestDecision = approveResponse.bodyJson && approveResponse.bodyJson[0].latestDecision;
							check('P2.1 the decision is recorded: who and when', latestDecision && latestDecision.decisionName === 'approve' && latestDecision.deciderUsername === 'ada' && /^\d{4}-\d\d-\d\dT/.test(latestDecision.decidedAt), JSON.stringify(latestDecision));
							post('/api/login', { username: 'appone', password: APPLICANT_PASSWORD }, (approvedLogin) => {
								check('P2.1 after approval the applicant signs in', approvedLogin.statusCode === 200 && signedInUsernameOf(approvedLogin) === 'appone', `${approvedLogin.statusCode} ${approvedLogin.bodyText}`);
								done();
							});
						}, adaToken);
					});
				});
			});
		});
	});
}));

// ---- P2.4 the admin check: claims are a first screen, the stored role decides
step((done) => {
	const harness = state.approvalHarness;
	const post = postTo(harness);
	registerAndConfirm(harness, 'apptwo', (applicantRow) => {
		state.apptwoRefId = applicantRow.refId;
		tokenOfSignIn(harness, 'ursula', URSULA_PASSWORD, (ursulaToken) => {
			const forgedToken = jwt.sign({ user: { username: 'ursula', role: 'admin', first: 'Ursula', last: 'User' } }, harness.tokenSecret, { expiresIn: 600 });
			post('/api/decideAccountApproval', { userRefId: applicantRow.refId, decisionName: 'approve' }, (userResponse) => {
				check('P2.4 decide by a non-admin is refused by name (notAnApprover)', userResponse.statusCode === 403 && userResponse.bodyJson && userResponse.bodyJson.refusalName === 'notAnApprover', `${userResponse.statusCode} ${userResponse.bodyText}`);
				post('/api/decideAccountApproval', { userRefId: applicantRow.refId, decisionName: 'approve', role: 'admin', user: { role: 'admin' } }, (bodyRoleResponse) => {
					check('P2.4 decide by a non-admin with role: admin in the body is still refused (notAnApprover)', bodyRoleResponse.statusCode === 403 && bodyRoleResponse.bodyJson && bodyRoleResponse.bodyJson.refusalName === 'notAnApprover', `${bodyRoleResponse.statusCode} ${bodyRoleResponse.bodyText}`);
					post('/api/decideAccountApproval', { userRefId: applicantRow.refId, decisionName: 'approve' }, (forgedResponse) => {
						check('P2.4 a token whose claims say admin but whose database row is not admin is refused (notAnApprover)', forgedResponse.statusCode === 403 && forgedResponse.bodyJson && forgedResponse.bodyJson.refusalName === 'notAnApprover', `${forgedResponse.statusCode} ${forgedResponse.bodyText}`);
						post('/api/accountApprovalDetail', { userRefId: applicantRow.refId }, (forgedDetail) => {
							check('P2.4 the detail refuses that token too', forgedDetail.statusCode === 403 && forgedDetail.bodyJson && forgedDetail.bodyJson.refusalName === 'notAnApprover', `${forgedDetail.statusCode} ${forgedDetail.bodyText}`);
							post('/api/listPendingApprovals', {}, (forgedList) => {
								check('P2.4 the pending list refuses that token too', forgedList.statusCode === 403 && forgedList.bodyJson && forgedList.bodyJson.refusalName === 'notAnApprover', `${forgedList.statusCode} ${forgedList.bodyText}`);
								post('/api/decideAccountApproval', { userRefId: applicantRow.refId, decisionName: 'approve' }, (anonymousResponse) => {
									check('P2.4 decide with no sign-in is refused by name (notAnApprover)', anonymousResponse.statusCode === 403 && anonymousResponse.bodyJson && anonymousResponse.bodyJson.refusalName === 'notAnApprover', `${anonymousResponse.statusCode} ${anonymousResponse.bodyText}`);
									rowOf(harness, 'apptwo', (unchangedRow) => {
										check('P2.4 after every refusal the account is still pendingApproval', unchangedRow.disabled === 'pendingApproval', unchangedRow.disabled);
										done();
									});
								});
							}, forgedToken);
						}, forgedToken);
					}, forgedToken);
				}, ursulaToken);
			}, ursulaToken);
		});
	});
});

// ---- P2.8 detail and pending list for an admin
step((done) => {
	const harness = state.approvalHarness;
	const post = postTo(harness);
	post('/api/accountApprovalDetail', { userRefId: state.apptwoRefId }, (detailResponse) => {
		const detail = detailResponse.bodyJson && detailResponse.bodyJson[0];
		check('P2.8 detail shows the applicant (username, name, email, sign-up time, state), no password', detail && detail.applicant.username === 'apptwo' && detail.applicant.first === 'App' && detail.applicant.emailAdr === 'apptwo@example.org' && detail.applicant.createdAt && detail.applicant.accountState === 'pendingApproval' && !/password/i.test(JSON.stringify(detail.applicant)), detailResponse.bodyText);
		check('P2.8 detail says which decisions may be made (approve, decline while pending)', detail && JSON.stringify(detail.applicant.allowedDecisionNameList) === '["approve","decline"]', detailResponse.bodyText);
		check('P2.8 detail of an undecided account has no decision, and the control preset is the setting (false)', detail && detail.latestDecision === null && detail.adminApprovalEmailSuppress === false, detailResponse.bodyText);
		post('/api/accountApprovalDetail', { userRefId: state.apponeRefId }, (decidedResponse) => {
			const decidedDetail = decidedResponse.bodyJson && decidedResponse.bodyJson[0];
			check('P2.8 detail of a decided account shows who decided and when', decidedDetail && decidedDetail.applicant.accountState === 'active' && decidedDetail.latestDecision && decidedDetail.latestDecision.deciderUsername === 'ada' && decidedDetail.latestDecision.decidedAt, decidedResponse.bodyText);
			post('/api/listPendingApprovals', {}, (listResponse) => {
				const usernameList = (listResponse.bodyJson || []).map((applicant) => applicant.username);
				check('P2.8 the pending list holds exactly the pendingApproval accounts (paula, apptwo)', listResponse.statusCode === 200 && JSON.stringify(usernameList.sort()) === '["apptwo","paula"]', listResponse.bodyText);
				done();
			}, state.adaToken);
		}, state.adaToken);
	}, state.adaToken);
});

// ---- P2.5 decline: the email sent or suppressed, the row declined, the address kept
step((done) => {
	const harness = state.approvalHarness;
	const post = postTo(harness);
	harness.capturedMailList.length = 0;
	post('/api/decideAccountApproval', { userRefId: state.apptwoRefId, decisionName: 'decline' }, (noChoiceResponse) => {
		check('P2.5 a decline without a true/false sendDeclineEmail is refused by name (approvalDecisionNotValid)', noChoiceResponse.statusCode === 400 && noChoiceResponse.bodyJson && noChoiceResponse.bodyJson.refusalName === 'approvalDecisionNotValid', noChoiceResponse.bodyText);
		post('/api/decideAccountApproval', { userRefId: state.apptwoRefId, decisionName: 'decline', sendDeclineEmail: 'true' }, (textChoiceResponse) => {
			check('P2.5 sendDeclineEmail as text is refused too (no quiet correction)', textChoiceResponse.statusCode === 400 && textChoiceResponse.bodyJson && textChoiceResponse.bodyJson.refusalName === 'approvalDecisionNotValid', textChoiceResponse.bodyText);
			post('/api/decideAccountApproval', { userRefId: state.apptwoRefId, decisionName: 'decline', sendDeclineEmail: true }, (sendResponse) => {
				const declinedMail = mailsWith(harness, /was not approved/)[0];
				check('P2.5 decline with sendDeclineEmail=true: 200 and the decline email went to the applicant', sendResponse.statusCode === 200 && declinedMail && JSON.stringify(declinedMail.toList) === '["apptwo@example.org"]' && !comingFromProblemOf(declinedMail), `${sendResponse.statusCode} ${sendResponse.bodyText}`);
				const decidedMail = mailsWith(harness, /declined by ada/)[0];
				check('P2.5 the notice list was told "declined by ada", email sent', decidedMail && /Decline email to the applicant: sent/.test(decidedMail.text), decidedMail && decidedMail.text);
				rowOf(harness, 'apptwo', (declinedRow) => {
					check('P2.5 the row is declined', declinedRow.disabled === 'declined', declinedRow.disabled);
					registerAndConfirm(harness, 'appthree', (appthreeRow) => {
						harness.capturedMailList.length = 0;
						post('/api/decideAccountApproval', { userRefId: appthreeRow.refId, decisionName: 'decline', sendDeclineEmail: false }, (suppressResponse) => {
							check('P2.5 decline with sendDeclineEmail=false: 200 and NO mail to the applicant', suppressResponse.statusCode === 200 && !harness.capturedMailList.some((mailMessage) => mailMessage.toList.includes('appthree@example.org')), JSON.stringify(harness.capturedMailList.map((mailMessage) => [mailMessage.subject, mailMessage.toList])));
							check('P2.5 the notice says the decline email was not sent', mailsWith(harness, /declined by ada/).some((mailMessage) => /not sent/.test(mailMessage.text)));
							check('P2.5 the suppressed decline is recorded as such', suppressResponse.bodyJson && suppressResponse.bodyJson[0].latestDecision.declineEmailSent === false, suppressResponse.bodyText);
							post('/api/registerUser', { ...applicantOf('appthreeagain'), emailAdr: 'AppThree@Example.org' }, (againResponse) => {
								check('P2.5 a declined address registering again is refused like any duplicate (emailAdrTaken)', againResponse.statusCode === 409 && againResponse.bodyJson && againResponse.bodyJson.refusalName === 'emailAdrTaken', againResponse.bodyText);
								done();
							});
						}, state.adaToken);
					});
				});
			}, state.adaToken);
		}, state.adaToken);
	}, state.adaToken);
});

// ---- P2.6 deciding again, and accounts that cannot be decided
step((done) => {
	const harness = state.approvalHarness;
	const post = postTo(harness);
	post('/api/decideAccountApproval', { userRefId: state.apptwoRefId, decisionName: 'approve' }, (laterApprove) => {
		check('P2.6 approve after decline works, and then nothing more may be decided here', laterApprove.statusCode === 200 && laterApprove.bodyJson && laterApprove.bodyJson[0].applicant.accountState === 'active' && JSON.stringify(laterApprove.bodyJson[0].applicant.allowedDecisionNameList) === '[]', laterApprove.bodyText);
		post('/api/decideAccountApproval', { userRefId: state.apptwoRefId, decisionName: 'decline', sendDeclineEmail: true }, (declineApproved) => {
			check('P2.6 decline after approve is refused by name (approvalNotDecidable)', declineApproved.statusCode === 409 && declineApproved.bodyJson && declineApproved.bodyJson.refusalName === 'approvalNotDecidable', declineApproved.bodyText);
			post('/api/decideAccountApproval', { userRefId: state.apponeRefId, decisionName: 'approve' }, (approveApproved) => {
				check('P2.6 approve of an already active account is refused by name (approvalNotDecidable)', approveApproved.statusCode === 409 && approveApproved.bodyJson && approveApproved.bodyJson.refusalName === 'approvalNotDecidable', approveApproved.bodyText);
				post('/api/registerUser', applicantOf('appunconfirmed'), () => rowOf(harness, 'appunconfirmed', (unconfirmedRow) => {
					post('/api/decideAccountApproval', { userRefId: unconfirmedRow.refId, decisionName: 'approve' }, (unconfirmedResponse) => {
						check('P2.6 an account still awaiting email confirmation cannot be approved (approvalNotDecidable)', unconfirmedResponse.statusCode === 409 && unconfirmedResponse.bodyJson && unconfirmedResponse.bodyJson.refusalName === 'approvalNotDecidable' && /pendingConfirmation/.test(unconfirmedResponse.bodyJson.reason), unconfirmedResponse.bodyText);
						post('/api/decideAccountApproval', { userRefId: 'noSuchRefIdAnywhere', decisionName: 'approve' }, (unknownResponse) => {
							check('P2.6 an unknown account is refused by name (noSuchUser)', unknownResponse.statusCode === 404 && unknownResponse.bodyJson && unknownResponse.bodyJson.refusalName === 'noSuchUser', unknownResponse.bodyText);
							post('/api/decideAccountApproval', { userRefId: state.apptwoRefId, decisionName: 'promote' }, (badDecision) => {
								check('P2.6 a decision that is not approve or decline is refused by name (approvalDecisionNotValid)', badDecision.statusCode === 400 && badDecision.bodyJson && badDecision.bodyJson.refusalName === 'approvalDecisionNotValid', badDecision.bodyText);
								done();
							}, state.adaToken);
						}, state.adaToken);
					}, state.adaToken);
				}));
			}, state.adaToken);
		}, state.adaToken);
	}, state.adaToken);
});

// ---- P2.2 confirmation off + approval on
step((done) => bootWith({ ...APPROVAL_ON, requireEmailConfirmation: 'false' }, (harness) => {
	state.directApprovalHarness = harness;
	postTo(harness)('/api/registerUser', applicantOf('appdirect'), (registerResponse) => {
		check('P2.2 sign-up: 200, says it awaits approval, NOT signed in', registerResponse.statusCode === 200 && registerResponse.bodyJson && registerResponse.bodyJson[0].isAwaitingApproval === true && !registerResponse.bodyJson[0].user && signedInUsernameOf(registerResponse) !== 'appdirect', `${registerResponse.bodyText} ${registerResponse.authclaimsText}`);
		rowOf(harness, 'appdirect', (directRow) => {
			check('P2.2 the row is pendingApproval at once', directRow.disabled === 'pendingApproval', directRow.disabled);
			const requestMail = mailsWith(harness, /^Approval needed/)[0];
			check('P2.2 the approval request went out at sign-up, with the applicant\'s link', requestMail && requestMail.text.includes(`/account-approval?userRefId=${encodeURIComponent(directRow.refId)}`), JSON.stringify(harness.capturedMailList.map((mailMessage) => mailMessage.subject)));
			check('P2.2 no confirmation mail and no informational notice', !harness.capturedMailList.some((mailMessage) => /confirm\?token=/.test(mailMessage.text) || /^New EDUcore account/.test(mailMessage.subject)));
			done();
		});
	});
}));

// ---- P2.3 approval off: as before
step((done) => bootWith({ requireEmailConfirmation: 'false' }, (directHarness) => {
	state.directHarness = directHarness;
	postTo(directHarness)('/api/registerUser', applicantOf('appopen'), (registerResponse) => {
		check('P2.3 approval off, confirmation off: signed in at once, as before', registerResponse.statusCode === 200 && registerResponse.bodyJson && registerResponse.bodyJson[0].user && signedInUsernameOf(registerResponse) === 'appopen', registerResponse.bodyText);
		check('P2.3 approval off: no approval mail, the informational notice as before', !mailsWith(directHarness, /Approval needed|waiting for approval/).length && mailsWith(directHarness, /^New EDUcore account/).length === 1, JSON.stringify(directHarness.capturedMailList.map((mailMessage) => mailMessage.subject)));
		bootWith({}, (confirmHarness) => {
			state.confirmHarness = confirmHarness;
			postTo(confirmHarness)('/api/registerUser', applicantOf('appconfirm'), () => confirmOf(confirmHarness, 'appconfirm', (confirmResponse) => {
				check('P2.3 approval off, confirmation on: the link signs in, as before', confirmResponse.statusCode === 200 && confirmResponse.bodyJson && confirmResponse.bodyJson[0].user && signedInUsernameOf(confirmResponse) === 'appconfirm', confirmResponse.bodyText);
				check('P2.3 approval off: no approval mail at confirmation', !mailsWith(confirmHarness, /Approval needed|waiting for approval/).length);
				done();
			}));
		});
	});
}));

// ---- P2.7 approval on, nobody to ask
step((done) => bootWith({ ...APPROVAL_ON, requireEmailConfirmation: 'false', newAccountNoticeList: {} }, (harness) => {
	state.noApproverHarness = harness;
	postTo(harness)('/api/registerUser', applicantOf('apporphan'), () => {
		check('P2.7 a sign-up with nobody to ask logs approvalWithoutApprovers by name, naming the account', harness.logList.some((logLine) => /approvalWithoutApprovers/.test(logLine) && /apporphan/.test(logLine)), harness.logList.filter((logLine) => /approv/i.test(logLine)).join(' | '));
		check('P2.7 and no approval request was sent', !mailsWith(harness, /^Approval needed/).length);
		done();
	});
}));

const runSteps = (remainingList) => {
	if (!remainingList.length) {
		Object.values(state).filter((stateEntry) => stateEntry && typeof stateEntry.close === 'function').forEach((harness) => harness.close());
		const passedCount = resultList.filter(Boolean).length;
		console.log(`admin-approval: ${passedCount} passed, ${resultList.length - passedCount} failed`);
		process.exit(resultList.length === passedCount ? 0 : 1);
	}
	const [stepFunction, ...restList] = remainingList;
	stepFunction(() => runSteps(restList));
};
runSteps(stepList);
