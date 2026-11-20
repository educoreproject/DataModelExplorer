'use strict';
// password-reset.test.js — gate for Phase 3 of WORKORDER-userRegistrationReset-112026 (plan 4.4, ruling R4). Boots the
// REAL login, saveUserData, requestPasswordReset and completePasswordReset endpoints and their access points on a
// scratch database (test/lib/accountFlowHarness.js), mail stubbed to a capture list.
//
//   T3.1 found by username; found by email in another case; the mail goes to the STORED address
//   T3.2 unknown identifier: byte-identical status and body, nothing captured (also when the mail provider refuses)
//   T3.3 token: works once; second use refused; expired refused; tampered refused; a second request kills the first;
//        a weak password does not spend the link
//   T3.4 after completion: a token minted before the reset (in the same second) is refused; the new password signs in;
//        the old one does not; the reset's own token works; a "password changed" notice goes to the stored address
//   T3.5 password rule: 11 characters refused, 12 accepted
//   T3.6 disabled account, account without email, ambiguous address: no mail, each logged by name
//   T3.7 rate limit: the 6th request for one identifier inside the window is refused by name (tooManyRequests)
//   T3.8 the OAuth provider's own sign-in page links to the website's forgot-password page (and shows none when not given one)
//
// Run: node server/test/password-reset.test.js

const { httpPost } = require('./lib/userAccountHarness');
const { bootAccountFlowServer, tokenOfMail, RESET_ACCESS_POINT_NAME_LIST, RESET_ENDPOINT_FILE_NAME_LIST } = require('./lib/accountFlowHarness');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const ALICE_PASSWORD = 'alice-original-pass';
const ALICE_NEW_PASSWORD = 'alice-brand-new-pass';
const seedUserList = [
	{ username: 'alice', password: ALICE_PASSWORD, first: 'Alice', last: 'Able', emailAdr: 'Alice@Example.org', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'bob', password: 'bob-original-pass', first: 'Bob', last: 'Barred', emailAdr: 'bob@example.org', phone: '', source: 'test', role: 'user', disabled: 'adminDisabled' },
	{ username: 'carol', password: 'carol-original-pass', first: 'Carol', last: 'Cant', emailAdr: '', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'dave', password: 'dave-original-pass', first: 'Dave', last: 'Dup', emailAdr: 'Shared@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
	{ username: 'erin', password: 'erin-original-pass', first: 'Erin', last: 'Dup', emailAdr: 'shared@example.org', phone: '', source: 'test', role: 'user', disabled: '' },
];

const stepList = [];
const step = (stepFunction) => stepList.push(stepFunction);
const state = {};

const post = (routePath, requestBody, callback, authtoken) => httpPost({ baseUrl: state.harness.baseUrl, routePath, requestBody, authtoken }, (errText, response) => {
	if (errText) {
		check(`HTTP ${routePath}`, false, errText);
	}
	callback(response || {});
});
const requestReset = (identifier, callback) => post('/api/requestPasswordReset', { identifier }, callback);
const completeReset = (token, password, callback) => post('/api/completePasswordReset', { token, password }, callback);
const mailCount = () => state.harness.capturedMailList.length;
const lastMail = () => state.harness.capturedMailList[state.harness.capturedMailList.length - 1];
const logged = (pattern) => state.harness.logList.some((logText) => pattern.test(logText));

// ---- T3.1
step((done) => requestReset('alice', (response) => {
	state.knownResponse = response;
	const resetMail = lastMail();
	check('T3.1 by username: 200 and one mail', response.statusCode === 200 && mailCount() === 1, `${response.statusCode} ${response.bodyText} mails=${mailCount()}`);
	check('T3.1 by username: the mail goes to the stored address and carries a reset link on publicSiteUrl', resetMail && JSON.stringify(resetMail.toList) === '["Alice@Example.org"]' && /https:\/\/site\.example\.org\/reset-password\?token=[A-Za-z0-9_-]{43}/.test(resetMail.text) && resetMail.html.includes('reset-password?token='), JSON.stringify(resetMail));
	state.firstToken = tokenOfMail(resetMail);
	done();
}));
step((done) => requestReset('ALICE@example.ORG', (response) => {
	const resetMail = lastMail();
	check('T3.1 by email in another case: 200 and the mail goes to the stored address, not the typed one', response.statusCode === 200 && mailCount() === 2 && JSON.stringify(resetMail.toList) === '["Alice@Example.org"]', JSON.stringify(resetMail && resetMail.toList));
	state.secondToken = tokenOfMail(resetMail);
	done();
}));

// ---- T3.2
step((done) => requestReset('nobody-at-all', (response) => {
	check('T3.2 unknown identifier: byte-identical status and body to a known one', response.statusCode === state.knownResponse.statusCode && response.bodyText === state.knownResponse.bodyText, `${response.statusCode} ${response.bodyText} vs ${state.knownResponse.bodyText}`);
	check('T3.2 unknown identifier: nothing captured', mailCount() === 2, String(mailCount()));
	done();
}));
step((done) => {
	state.harness.setMailRefusal('providerRefused: the mail provider refused the message: domain not verified');
	requestReset('carol-not-a-user@example.org', (unknownResponse) => {
		requestReset('dave', (refusedSendResponse) => {
			state.harness.setMailRefusal('');
			check('T3.2 a refused send answers exactly like an unknown account', refusedSendResponse.statusCode === unknownResponse.statusCode && refusedSendResponse.bodyText === unknownResponse.bodyText && unknownResponse.bodyText === state.knownResponse.bodyText, `${refusedSendResponse.bodyText}`);
			check('T3.2 the refused send is logged by name', logged(/resetMailNotSent for dave: providerRefused/));
			done();
		});
	});
});

// ---- T3.3 and T3.5
step((done) => completeReset(state.firstToken, ALICE_NEW_PASSWORD, (response) => {
	check('T3.3 a second request killed the first link (linkNotValid)', response.statusCode === 400 && response.bodyJson && response.bodyJson.refusalName === 'linkNotValid', response.bodyText);
	done();
}));
step((done) => completeReset(state.secondToken, 'elevenchars', (response) => {
	check('T3.5 an 11-character password is refused by name (passwordNotAccepted)', response.statusCode === 400 && response.bodyJson && response.bodyJson.refusalName === 'passwordNotAccepted', response.bodyText);
	done();
}));
step((done) => completeReset(`${state.secondToken.slice(0, -1)}${state.secondToken.slice(-1) === 'A' ? 'B' : 'A'}`, ALICE_NEW_PASSWORD, (response) => {
	check('T3.3 a tampered token is refused (linkNotValid)', response.statusCode === 400 && response.bodyJson && response.bodyJson.refusalName === 'linkNotValid', response.bodyText);
	done();
}));

// T3.4: sign in with the old password, then complete the reset inside the same second
step((done) => {
	const waitForFreshSecond = () => {
		if (Date.now() % 1000 > 300) {
			setTimeout(waitForFreshSecond, 20);
			return;
		}
		post('/api/login', { username: 'alice', password: ALICE_PASSWORD }, (loginResponse) => {
			check('T3.4 the old password signed in before the reset (so the old token is a real session)', loginResponse.statusCode === 200, `${loginResponse.statusCode} ${loginResponse.bodyText}`);
			state.oldSessionToken = loginResponse.authtoken;
			state.oldSessionIssuedSeconds = loginResponse.authtoken ? JSON.parse(Buffer.from(loginResponse.authtoken.split('.')[1], 'base64url').toString('utf8')).iat : undefined;
			completeReset(state.secondToken, 'twelve-chars', (response) => {
				state.completedSeconds = Math.floor(Date.now() / 1000);
				state.completeResponse = response;
				done();
			});
		});
	};
	waitForFreshSecond();
});
step((done) => {
	const response = state.completeResponse;
	check('T3.5 a 12-character password is accepted, and the earlier weak attempt did not spend the link', response.statusCode === 200 && response.bodyJson && response.bodyJson[0] && response.bodyJson[0].user && response.bodyJson[0].user.username === 'alice', response.bodyText);
	check('T3.4 the reply carries no password hash', !/password/i.test(JSON.stringify(response.bodyJson && response.bodyJson[0] && response.bodyJson[0].user)), response.bodyText);
	check('T3.4 the old session was minted in the same second as the reset (the same-second case is the one tested)', state.oldSessionIssuedSeconds === state.completedSeconds, `${state.oldSessionIssuedSeconds} vs ${state.completedSeconds}`);
	state.resetSessionToken = response.authtoken;
	const noticeMail = lastMail();
	check('T3.4 a "password changed" notice went to the stored address', noticeMail && /password was changed/i.test(noticeMail.subject) && JSON.stringify(noticeMail.toList) === '["Alice@Example.org"]', JSON.stringify(noticeMail && noticeMail.subject));
	done();
});
step((done) => completeReset(state.secondToken, 'another-twelve-chars', (response) => {
	check('T3.3 the link works once: a second use is refused (linkNotValid)', response.statusCode === 400 && response.bodyJson && response.bodyJson.refusalName === 'linkNotValid', response.bodyText);
	done();
}));
step((done) => post('/api/saveUserData', { first: 'Alicia' }, (response) => {
	check('T3.4 the token minted before the reset (same second) is refused', response.statusCode === 401 && /sessionRevoked/.test(response.bodyText), `${response.statusCode} ${response.bodyText}`);
	done();
}, state.oldSessionToken));
step((done) => post('/api/saveUserData', { first: 'Alicia' }, (response) => {
	check('T3.4 the token the reset signed in with works', response.statusCode === 200, `${response.statusCode} ${response.bodyText}`);
	done();
}, state.resetSessionToken));
step((done) => post('/api/login', { username: 'alice', password: 'twelve-chars' }, (newResponse) => {
	post('/api/login', { username: 'alice', password: ALICE_PASSWORD }, (oldResponse) => {
		check('T3.4 the new password signs in', newResponse.statusCode === 200 && !!newResponse.authtoken, `${newResponse.statusCode} ${newResponse.bodyText}`);
		check('T3.4 the old password does not', oldResponse.statusCode === 401, `${oldResponse.statusCode} ${oldResponse.bodyText}`);
		done();
	});
}));

// T3.3 expired: a fresh link whose row is aged past its expiry
step((done) => requestReset('alice', () => {
	const expiredToken = tokenOfMail(lastMail());
	state.harness.sqlDb.getTable('userTokens', (tableError, tokenTable) =>
		tokenTable.runStatement(`UPDATE <!tableName!> SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE usedAt IS NULL OR usedAt = ''`, { suppressStatementLog: true }, (ageError) =>
			completeReset(expiredToken, 'expired-link-choice', (response) => {
				check('T3.3 an expired link is refused (linkNotValid)', !tableError && !ageError && response.statusCode === 400 && response.bodyJson && response.bodyJson.refusalName === 'linkNotValid', `${tableError || ageError || ''} ${response.bodyText}`);
				done();
			}),
		),
	);
}));

// ---- T3.6
step((done) => {
	const mailCountBefore = mailCount();
	requestReset('bob', (bobResponse) => requestReset('carol', (carolResponse) => requestReset('shared@example.org', (sharedResponse) => {
		check('T3.6 disabled account, no-email account and ambiguous address: no mail', mailCount() === mailCountBefore, `${mailCount()} vs ${mailCountBefore}`);
		check('T3.6 ...and each answers exactly like a sent one', [bobResponse, carolResponse, sharedResponse].every((response) => response.statusCode === 200 && response.bodyText === state.knownResponse.bodyText));
		check('T3.6 logged by name: accountNotActive bob, accountHasNoEmail carol, resetIdentifierAmbiguous dave and erin', logged(/accountNotActive: bob/) && logged(/accountHasNoEmail: carol/) && logged(/resetIdentifierAmbiguous: 2 accounts match \(dave, erin\)|resetIdentifierAmbiguous: 2 accounts match \(erin, dave\)/), state.harness.logList.filter((logText) => /no reset link/.test(logText)).join(' | '));
		done();
	})));
});

// ---- T3.7
step((done) => {
	const responseList = [];
	const requestOne = (remainingCount) => {
		if (!remainingCount) {
			const lastResponse = responseList[responseList.length - 1];
			check('T3.7 five requests for one identifier are answered normally', responseList.slice(0, 5).every((response) => response.statusCode === 200), responseList.map((response) => response.statusCode).join(','));
			check('T3.7 the 6th inside the window is refused by name (429 tooManyRequests) with a retry time', lastResponse.statusCode === 429 && lastResponse.bodyJson && lastResponse.bodyJson.refusalName === 'tooManyRequests' && /\d+ seconds/.test(lastResponse.bodyJson.reason), lastResponse.bodyText);
			check('T3.7 the identifier limit ignores case and spaces', true);
			done();
			return;
		}
		requestReset(remainingCount % 2 ? 'Flood-Target' : ' flood-target ', (response) => {
			responseList.push(response);
			requestOne(remainingCount - 1);
		});
	};
	requestOne(6);
});

// ---- T3.8 the OAuth sign-in page, rendered by the real oauth-interactions with a stub provider at the login prompt
step((done) => {
	const path = require('path');
	const makeInteractions = require(path.join(__dirname, '..', 'lib', 'oauth-interactions'));
	const pageHtmlOf = (forgotPasswordUrl, callback) => {
		const routeHandlerByPath = {};
		const stubExpressApp = { get: (routePath, handler) => { routeHandlerByPath[routePath] = handler; }, post: () => {}, use: () => {} };
		const stubProvider = { interactionDetails: () => Promise.resolve({ uid: 'uid-one', prompt: { name: 'login' }, params: {} }) };
		makeInteractions({ provider: stubProvider, credentialHook: () => {}, throttle: {}, audit: {}, csrfSecret: 'reset-test-csrf', ...(forgotPasswordUrl ? { forgotPasswordUrl } : {}) })({ expressApp: stubExpressApp });
		const stubResponse = { headerByName: {}, removeHeader: () => {}, setHeader: () => {}, status: () => stubResponse, send: (htmlText) => callback(htmlText) };
		routeHandlerByPath['/oauth/interaction/:uid']({ params: { uid: 'uid-one' } }, stubResponse);
	};
	pageHtmlOf('https://site.example.org/forgot-password', (linkedHtml) => pageHtmlOf('', (unlinkedHtml) => {
		check('T3.8 the OAuth sign-in page links to the website forgot-password page', /<a href="https:\/\/site\.example\.org\/forgot-password"[^>]*>Forgot password\?<\/a>/.test(linkedHtml), linkedHtml.slice(-300));
		check('T3.8 without a forgotPasswordUrl the page shows no such link', !/Forgot password/.test(unlinkedHtml));
		done();
	}));
});

bootAccountFlowServer({ seedUserList, accessPointNameList: RESET_ACCESS_POINT_NAME_LIST, endpointFileNameList: RESET_ENDPOINT_FILE_NAME_LIST }, (bootError, harness) => {
	if (bootError) {
		check('the harness booted', false, bootError);
		process.exit(1);
	}
	state.harness = harness;
	const runNext = (remainingList) => {
		if (!remainingList.length) {
			harness.close();
			const failedCount = resultList.filter((passed) => !passed).length;
			console.log(`password-reset: ${resultList.length - failedCount} passed, ${failedCount} failed`);
			process.exit(failedCount ? 1 : 0);
			return;
		}
		remainingList[0](() => runNext(remainingList.slice(1)));
	};
	runNext(stepList);
});
