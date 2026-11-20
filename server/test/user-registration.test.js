'use strict';
// user-registration.test.js — gate for Phase 4 of WORKORDER-userRegistrationReset-112026 (plan 4.3, rulings R1, R3, R7).
// Boots the REAL login, saveUserData and registration endpoints and access points (test/lib/accountFlowHarness.js) on
// scratch databases, one server per configuration, mail stubbed to a capture list.
//
//   T4.1 requireEmailConfirmation=true: no sign-in until confirmed (emailNotConfirmed); the link works once; then sign-in works
//   T4.2 requireEmailConfirmation=false: active and signed in at once; no confirmation mail
//   T4.3 selfRegistrationEnabled=false: registerUser refuses by name; the public read says disabled (and enabled where it is)
//   T4.4 duplicate username refused (another case); duplicate email in another case refused
//   T4.5 role, disabled, refId and source in the body are ignored: the row has newAccountRole and its own refId
//   T4.6 the new-account notice goes to every address on the list; none when the list is empty
//   T4.7 resendConfirmation: identical reply for known and unknown identifiers; a known pending account gets a new link
//        and its earlier link stops working
//
// Run: node server/test/user-registration.test.js

const { httpPost } = require('./lib/userAccountHarness');
const { bootAccountFlowServer, tokenOfMail, httpGet } = require('./lib/accountFlowHarness');

const REGISTRATION_ACCESS_POINT_NAME_LIST = ['user-registration-register', 'user-registration-confirm', 'user-registration-resend', 'user-registration-options'];
const REGISTRATION_ENDPOINT_FILE_NAME_LIST = ['register-user.js', 'confirm-registration.js', 'resend-confirmation.js', 'registration-options.js'];

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const ALICE_PASSWORD = 'alice-original-pass';
const NEWCOMER_PASSWORD = 'newcomer-pass-1';
const WRONG_PASSWORD = 'wrong-password-here';
const ELEVEN_CHARACTER_PASSWORD = 'elevenchars';
const seedUserList = [{ username: 'alice', password: ALICE_PASSWORD, first: 'Alice', last: 'Able', emailAdr: 'alice@example.org', phone: '', source: 'test', role: 'user', disabled: '' }];
const newcomerOf = (overrideByName = {}) => ({ username: 'Newcomer', password: NEWCOMER_PASSWORD, first: 'New', last: 'Comer', emailAdr: 'New.Comer@Example.org', ...overrideByName });

const bootWith = (registrationSettingOverrideByName, callback) =>
	bootAccountFlowServer({ registrationSettingOverrideByName, seedUserList, accessPointNameList: REGISTRATION_ACCESS_POINT_NAME_LIST, endpointFileNameList: REGISTRATION_ENDPOINT_FILE_NAME_LIST }, (bootError, harness) => {
		if (bootError) {
			check('a harness booted', false, bootError);
			process.exit(1);
		}
		callback(harness);
	});

const postTo = (harness) => (routePath, requestBody, callback, authtoken) => httpPost({ baseUrl: harness.baseUrl, routePath, requestBody, authtoken }, (errText, response) => {
	if (errText) {
		check(`HTTP ${routePath}`, false, errText);
	}
	callback(response || {});
});
const rowOf = (harness, username, callback) => harness.userTable.getData(`SELECT * FROM <!tableName!> WHERE username = '${username}'`, { suppressStatementLog: true }, (readError, rowList = []) => callback(rowList[0] || {}));
const confirmMailsOf = (harness) => harness.capturedMailList.filter((mailMessage) => /confirm\?token=/.test(mailMessage.text));
const noticeMailsOf = (harness) => harness.capturedMailList.filter((mailMessage) => /^New EDUcore account/.test(mailMessage.subject));

const stepList = [];
const step = (stepFunction) => stepList.push(stepFunction);
const state = {};

// ---- T4.1, T4.4, T4.5, T4.6, T4.7 on a confirmation-required server
step((done) => bootWith({}, (harness) => {
	state.confirmHarness = harness;
	const post = postTo(harness);
	post('/api/registerUser', { ...newcomerOf(), role: 'admin', disabled: '', refId: 'chosenByCaller', source: 'hostile' }, (registerResponse) => {
		check('T4.1 register (confirmation required): 200 and "check your email", no user in the reply', registerResponse.statusCode === 200 && registerResponse.bodyJson && /emailed a link to confirm/.test(registerResponse.bodyJson[0].message) && !registerResponse.bodyJson[0].user, registerResponse.bodyText);
		const confirmMail = confirmMailsOf(harness)[0];
		check('T4.1 a confirmation link went to the address, lower-cased as stored', confirmMail && JSON.stringify(confirmMail.toList) === '["new.comer@example.org"]' && /https:\/\/site\.example\.org\/confirm\?token=[A-Za-z0-9_-]{43}/.test(confirmMail.text), JSON.stringify(confirmMail && confirmMail.toList));
		state.firstConfirmToken = tokenOfMail(confirmMail);
		rowOf(harness, 'newcomer', (newRow) => {
			check('T4.5 the row has newAccountRole, not the role in the body', newRow.role === 'user', newRow.role);
			check('T4.5 the row has its own refId, not the one in the body', newRow.refId && newRow.refId !== 'chosenByCaller', newRow.refId);
			check('T4.5 disabled is pendingConfirmation, not the body\'s blank', newRow.disabled === 'pendingConfirmation', newRow.disabled);
			check('T4.5 source is selfRegistration, not the body\'s', newRow.source === 'selfRegistration', newRow.source);
			check('T4.5 the password is stored hashed', newRow.password && newRow.password !== NEWCOMER_PASSWORD && newRow.password.includes(':'));
			const noticeMail = noticeMailsOf(harness)[0];
			check('T4.6 the new-account notice went to every address on the list', noticeMail && JSON.stringify(noticeMail.toList) === '["notice-one@example.org","notice-two@example.org"]' && /newcomer/.test(noticeMail.text), JSON.stringify(noticeMail && noticeMail.toList));
			post('/api/login', { username: 'newcomer', password: NEWCOMER_PASSWORD }, (pendingLogin) => {
				check('T4.1 sign-in before confirmation is refused by name (emailNotConfirmed)', pendingLogin.statusCode === 403 && pendingLogin.bodyJson && pendingLogin.bodyJson.refusalName === 'emailNotConfirmed', `${pendingLogin.statusCode} ${pendingLogin.bodyText}`);
				post('/api/login', { username: 'newcomer', password: WRONG_PASSWORD }, (wrongLogin) => {
					check('T4.1 a wrong password on a pending account says only "Authentication failed" (the refusal needs the right password)', wrongLogin.statusCode === 401 && !/emailNotConfirmed/.test(wrongLogin.bodyText), wrongLogin.bodyText);
					done();
				});
			});
		});
	});
}));

step((done) => {
	const harness = state.confirmHarness;
	const post = postTo(harness);
	post('/api/resendConfirmation', { identifier: 'NEW.COMER@example.org' }, (knownResponse) => {
		post('/api/resendConfirmation', { identifier: 'nobody-here' }, (unknownResponse) => {
			post('/api/resendConfirmation', { identifier: 'alice' }, (activeResponse) => {
				check('T4.7 resendConfirmation: identical status and body for a pending account, an unknown one and an active one', knownResponse.statusCode === 200 && [unknownResponse, activeResponse].every((response) => response.statusCode === knownResponse.statusCode && response.bodyText === knownResponse.bodyText), `${knownResponse.bodyText} | ${unknownResponse.bodyText} | ${activeResponse.bodyText}`);
				check('T4.7 only the pending account got a new link', confirmMailsOf(harness).length === 2, String(confirmMailsOf(harness).length));
				state.secondConfirmToken = tokenOfMail(confirmMailsOf(harness)[1]);
				post('/api/confirmRegistration', { token: state.firstConfirmToken }, (staleResponse) => {
					check('T4.7 the earlier link stopped working when a new one was sent (linkNotValid)', staleResponse.statusCode === 400 && staleResponse.bodyJson && staleResponse.bodyJson.refusalName === 'linkNotValid', staleResponse.bodyText);
					done();
				});
			});
		});
	});
});

step((done) => {
	const harness = state.confirmHarness;
	const post = postTo(harness);
	post('/api/confirmRegistration', { token: state.secondConfirmToken }, (confirmResponse) => {
		check('T4.1 the confirmation link signs the user in', confirmResponse.statusCode === 200 && confirmResponse.bodyJson[0].user && confirmResponse.bodyJson[0].user.username === 'newcomer' && !!confirmResponse.authtoken, confirmResponse.bodyText);
		check('T4.1 the reply carries no password hash', !/password/i.test(JSON.stringify(confirmResponse.bodyJson[0].user)));
		post('/api/saveUserData', { first: 'Newer' }, (saveResponse) => {
			check('T4.1 the confirmation sign-in token works', saveResponse.statusCode === 200, `${saveResponse.statusCode} ${saveResponse.bodyText}`);
			post('/api/confirmRegistration', { token: state.secondConfirmToken }, (againResponse) => {
				check('T4.1 the confirmation link works once (second use: linkNotValid)', againResponse.statusCode === 400 && againResponse.bodyJson && againResponse.bodyJson.refusalName === 'linkNotValid', againResponse.bodyText);
				post('/api/login', { username: 'newcomer', password: NEWCOMER_PASSWORD }, (activeLogin) => {
					check('T4.1 after confirmation sign-in works', activeLogin.statusCode === 200 && activeLogin.bodyJson[0].username === 'newcomer', `${activeLogin.statusCode} ${activeLogin.bodyText}`);
					done();
				});
			}, undefined);
		}, confirmResponse.authtoken);
	});
});

step((done) => {
	const post = postTo(state.confirmHarness);
	post('/api/registerUser', newcomerOf({ username: 'ALICE', emailAdr: 'someone.else@example.org' }), (usernameResponse) => {
		post('/api/registerUser', newcomerOf({ username: 'brandnew', emailAdr: 'ALICE@EXAMPLE.ORG' }), (emailResponse) => {
			check('T4.4 a username already in use (in another case) is refused by name (usernameTaken)', usernameResponse.statusCode === 409 && usernameResponse.bodyJson && usernameResponse.bodyJson.refusalName === 'usernameTaken', usernameResponse.bodyText);
			check('T4.4 an email address already in use (in another case) is refused by name (emailAdrTaken)', emailResponse.statusCode === 409 && emailResponse.bodyJson && emailResponse.bodyJson.refusalName === 'emailAdrTaken', emailResponse.bodyText);
			post('/api/registerUser', newcomerOf({ username: 'shortpass', emailAdr: 'short@example.org', password: ELEVEN_CHARACTER_PASSWORD }), (weakResponse) => {
				check('T4.4 the password rule applies (11 characters: passwordNotAccepted)', weakResponse.statusCode === 400 && weakResponse.bodyJson && weakResponse.bodyJson.refusalName === 'passwordNotAccepted', weakResponse.bodyText);
				httpGet({ baseUrl: state.confirmHarness.baseUrl, routePath: '/api/registrationOptions' }, (getError, optionsResponse) => {
					check('T4.3 where registration is on, the public read says so', optionsResponse && optionsResponse.statusCode === 200 && optionsResponse.bodyJson[0].selfRegistrationEnabled === true && optionsResponse.bodyJson[0].requireEmailConfirmation === true, optionsResponse && optionsResponse.bodyText);
					state.confirmHarness.close();
					done();
				});
			});
		});
	});
});

// ---- T4.2 and T4.6 (empty list) on a server that needs no confirmation and has no notice list
step((done) => bootWith({ requireEmailConfirmation: 'false', newAccountNoticeList: '' }, (harness) => {
	const post = postTo(harness);
	post('/api/registerUser', newcomerOf(), (registerResponse) => {
		check('T4.2 register (no confirmation): signed in at once, with the user and a token', registerResponse.statusCode === 200 && registerResponse.bodyJson[0].user && registerResponse.bodyJson[0].user.username === 'newcomer' && !!registerResponse.authtoken, registerResponse.bodyText);
		check('T4.2 no confirmation mail', confirmMailsOf(harness).length === 0, String(confirmMailsOf(harness).length));
		check('T4.6 an empty notice list sends no notice (nothing captured at all)', harness.capturedMailList.length === 0, String(harness.capturedMailList.length));
		post('/api/saveUserData', { first: 'Newest' }, (saveResponse) => {
			check('T4.2 the registration token works', saveResponse.statusCode === 200, `${saveResponse.statusCode} ${saveResponse.bodyText}`);
			post('/api/login', { username: 'newcomer', password: NEWCOMER_PASSWORD }, (loginResponse) => {
				check('T4.2 and the account signs in by password', loginResponse.statusCode === 200, loginResponse.bodyText);
				harness.close();
				done();
			});
		}, registerResponse.authtoken);
	});
}));

// ---- T4.3 on a server with registration switched off
step((done) => bootWith({ selfRegistrationEnabled: 'false' }, (harness) => {
	postTo(harness)('/api/registerUser', newcomerOf(), (registerResponse) => {
		check('T4.3 selfRegistrationEnabled=false: registerUser refuses by name (registrationDisabled)', registerResponse.statusCode === 403 && registerResponse.bodyJson && registerResponse.bodyJson.refusalName === 'registrationDisabled', registerResponse.bodyText);
		rowOf(harness, 'newcomer', (newRow) => {
			check('T4.3 ...and writes nothing, mails nothing', !newRow.refId && harness.capturedMailList.length === 0);
			httpGet({ baseUrl: harness.baseUrl, routePath: '/api/registrationOptions' }, (getError, optionsResponse) => {
				check('T4.3 the public read says registration is disabled (reset still enabled)', optionsResponse && optionsResponse.statusCode === 200 && optionsResponse.bodyJson[0].selfRegistrationEnabled === false && optionsResponse.bodyJson[0].passwordResetEnabled === true, optionsResponse && optionsResponse.bodyText);
				harness.close();
				done();
			});
		});
	});
}));

const runNext = (remainingList) => {
	if (!remainingList.length) {
		const failedCount = resultList.filter((passed) => !passed).length;
		console.log(`user-registration: ${resultList.length - failedCount} passed, ${failedCount} failed`);
		process.exit(failedCount ? 1 : 0);
		return;
	}
	remainingList[0](() => runNext(remainingList.slice(1)));
};
runNext(stepList);
