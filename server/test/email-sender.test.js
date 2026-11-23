'use strict';
// email-sender.test.js — gate for Phase 2 of WORKORDER-userRegistrationReset-112026: lib/email-sender.js with a STUBBED
// Resend client (no network, no real key).
//
//   T2.1 a RESOLVED { data: null, error } reaches the callback as an error, not a success
//   T2.2 a REJECTION reaches the callback as an error
//   T2.3 a success returns the message id
//   T2.4 redirectAllEmailTo replaces every recipient (to, cc, bcc, and the configured bccList)
//   T2.5 a dotted list (list.0, list.1) is read in index order; an empty list is empty
//   T2.6 a missing API key is a named refusal and no client is built; so is a fromAddress off sendingDomain
// WORKORDER-accountMailFailureAndApprovalNotice-112326 M1, M6 (the resolved shapes are resend 6.39.0's own, see
// lib/email-sender-settings.json):
//   T2.7 the SDK's resolved network failure is providerUnreachable and retried; a later success is delivered; EVERY
//        attempt carries the same idempotency key (M6 c); the failed attempt is logged
//   T2.8 network failure every time: providerUnreachable after exactly three attempts (first + two retries), one alert
//   T2.9 a resolved validation_error (an answer) is providerRefused, never retried, alerted
//   T2.10 rejections are retried like the network shape; three of them end providerUnreachable
//   T2.11 429 and 5xx are providerUnavailable and retried; a 5xx every time ends providerUnavailable after three
//   T2.12 the waits are retryDelayMillisecondsList, growing; absent, the settings file's [1000, 3000]; not whole numbers, refused
//   T2.13 an attempt that hangs is abandoned at attemptTimeoutMilliseconds (the SDK resolves the abort as unreachable)
//   T2.14 the hard budget: no retry whose wait would end past sendBudgetMilliseconds; the send stops and fails
//   T2.15 alerts: once per final failure with mail, account and failure name; none on success; a send without alertLabel,
//         or a sender without failureAlerter, is a code fault (throws)
//   T2.16 the connect window (M5, M6 a): applied process-wide, 2000 ms by default; a bad value refused, not applied
//
// Run: node server/test/email-sender.test.js

const path = require('path');
const { emailSenderOf, listFromConfig } = require(path.join(__dirname, '..', 'lib', 'email-sender'));

// the server's logger, captured (lib/email-sender.js logs an unreachable attempt through process.global.xLog)
const statusLogList = [];
process.global = { xLog: { status: (logText) => statusLogList.push(String(logText)), error: (logText) => statusLogList.push(String(logText)) } };

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const goodSettings = Object.freeze({
	resendApiKey: 're_stub_not_a_real_one',
	sendingDomain: 'example.org',
	fromAddress: 'noreply@example.org',
	fromName: 'EDUcore',
	redirectAllEmailTo: '',
	bccList: { 0: 'audit@example.org' },
	retryDelayMillisecondsList: { 0: '0', 1: '0' },
});

// a stub Resend client: records what it was asked to send and answers as told
const stubBuilderOf = (answerOf) => {
	const stub = { builtCount: 0, sentList: [], sendOptionsList: [], sentAtList: [] };
	stub.builder = (apiKeyText) => {
		stub.builtCount += 1;
		stub.builtWithApiKeyText = apiKeyText;
		return {
			emails: {
				send: (sendParameters, sendOptions) => {
					stub.sentList.push(sendParameters);
					stub.sendOptionsList.push(sendOptions);
					stub.sentAtList.push(Date.now());
					return answerOf(sendParameters, stub.sentList.length, sendOptions);
				},
			},
		};
	};
	return stub;
};

const messageOf = (overrideByName = {}) => ({ toList: ['person@example.com'], ccList: ['copy@example.com'], bccList: ['blind@example.com'], subject: 'Hello', text: 'plain body', html: '<p>html body</p>', alertLabel: { mailName: 'passwordReset', accountName: 'pat' }, ...overrideByName });

// the failure alerter (M6 d), recorded
const alertList = [];
const recordAlert = (alertFieldByName) => alertList.push(alertFieldByName);

const caseList = [];

// T2.1
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.resolve({ data: null, error: { message: 'domain is not verified', name: 'validation_error' } }));
	emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText, result) => {
		check('T2.1 a resolved { data: null, error } is an error (providerRefused), not a success', /^providerRefused: .*domain is not verified.*validation_error/.test(errText) && !result.messageId, `${errText} ${JSON.stringify(result)}`);
		done();
	});
});

// T2.2
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.reject(new Error('getaddrinfo ENOTFOUND api.resend.com')));
	emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText, result) => {
		check('T2.2 a rejection is an error (providerUnreachable)', /^providerUnreachable: .*ENOTFOUND/.test(errText) && !result.messageId, errText);
		done();
	});
});

// T2.3 (and the client is built once, with the configured key, and reused)
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.resolve({ data: { id: 'msg_123' }, error: null }));
	const emailSender = emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder, failureAlerter: recordAlert });
	emailSender.sendEmail(messageOf(), (firstErrText, firstResult) => {
		check('T2.3 a success returns the message id', !firstErrText && firstResult.messageId === 'msg_123', `${firstErrText} ${JSON.stringify(firstResult)}`);
		const sentParameters = stub.sentList[0] || {};
		check('T2.3 without a redirect, to, cc and bcc (with the configured bccList) go as given, from "fromName <fromAddress>"', JSON.stringify(sentParameters.to) === '["person@example.com"]' && JSON.stringify(sentParameters.cc) === '["copy@example.com"]' && JSON.stringify(sentParameters.bcc) === '["blind@example.com","audit@example.org"]' && sentParameters.from === 'EDUcore <noreply@example.org>', JSON.stringify(sentParameters));
		emailSender.sendEmail(messageOf(), () => {
			check('T2.3 one lazy client, built with the configured key and reused', stub.builtCount === 1 && stub.builtWithApiKeyText === goodSettings.resendApiKey, String(stub.builtCount));
			done();
		});
	});
});

// T2.4
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.resolve({ data: { id: 'msg_456' }, error: null }));
	emailSenderOf({ emailSenderSettings: { ...goodSettings, redirectAllEmailTo: 'tester@example.net' }, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText, result) => {
		const sentParameters = stub.sentList[0] || {};
		check('T2.4 redirectAllEmailTo replaces every recipient: to is the redirect, no cc, no bcc (configured bccList included)', !errText && JSON.stringify(sentParameters.to) === '["tester@example.net"]' && sentParameters.cc === undefined && sentParameters.bcc === undefined, JSON.stringify(sentParameters));
		check('T2.4 the redirected subject names who it was for, and the reply says where it went', /redirected; for person@example\.com/.test(sentParameters.subject) && JSON.stringify(result.deliveredToList) === '["tester@example.net"]', `${sentParameters.subject} ${JSON.stringify(result)}`);
		done();
	});
});

// T2.5
caseList.push((done) => {
	check('T2.5 a dotted list is read in index order (10 after 2), blanks dropped', JSON.stringify(listFromConfig({ 10: 'c@x.org', 0: 'a@x.org', 2: 'b@x.org', 3: '' })) === '["a@x.org","b@x.org","c@x.org"]', JSON.stringify(listFromConfig({ 10: 'c@x.org', 0: 'a@x.org', 2: 'b@x.org', 3: '' })));
	check('T2.5 an absent or empty list is empty', [undefined, '', null, {}, []].every((rawList) => listFromConfig(rawList).length === 0));
	done();
});

// T2.6
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.resolve({ data: { id: 'never' }, error: null }));
	const noKeySender = emailSenderOf({ emailSenderSettings: { ...goodSettings, resendApiKey: '' }, resendClientBuilder: stub.builder, failureAlerter: recordAlert });
	check('T2.6 a missing key is refused by name at construction', /^emailSettingMissing: .*resendApiKey/.test(noKeySender.configRefusal), noKeySender.configRefusal);
	noKeySender.sendEmail(messageOf(), (errText) => {
		check('T2.6 a send with no key answers the refusal, and no client is built', /^emailSettingMissing/.test(errText) && stub.builtCount === 0 && stub.sentList.length === 0, `${errText} built=${stub.builtCount}`);
		const offDomainSender = emailSenderOf({ emailSenderSettings: { ...goodSettings, fromAddress: 'noreply@elsewhere.org' }, resendClientBuilder: stub.builder, failureAlerter: recordAlert });
		check('T2.6 a fromAddress not on sendingDomain is refused by name', /^fromAddressNotOnSendingDomain/.test(offDomainSender.configRefusal), offDomainSender.configRefusal);
		check('T2.6 an absent [email-sender] section is refused by name', /^emailSenderNotConfigured/.test(emailSenderOf({ emailSenderSettings: undefined, failureAlerter: recordAlert }).configRefusal));
		check('T2.6 no refusal text carries the key', ![noKeySender.configRefusal, offDomainSender.configRefusal].some((refusalText) => refusalText.includes(goodSettings.resendApiKey)));
		done();
	});
});

const SDK_NETWORK_FAILURE_ANSWER = Object.freeze({ data: null, error: { name: 'application_error', statusCode: null, message: 'Unable to fetch data. The request could not be resolved.' }, headers: null });
const SUCCESS_ANSWER = Object.freeze({ data: { id: 'msg_retry_ok' }, error: null });
const statusAnswerOf = (statusCode) => ({ data: null, error: { name: statusCode === 429 ? 'rate_limit_exceeded' : 'application_error', statusCode, message: `status ${statusCode}` }, headers: {} });
const fastSettings = Object.freeze({ ...goodSettings, retryDelayMillisecondsList: { 0: '20', 1: '40' } });
const alertsSince = (alertCountBefore) => alertList.slice(alertCountBefore);

// T2.7
caseList.push((done) => {
	statusLogList.length = 0;
	const stub = stubBuilderOf((sendParameters, callNumber) => Promise.resolve(callNumber < 3 ? SDK_NETWORK_FAILURE_ANSWER : SUCCESS_ANSWER));
	emailSenderOf({ emailSenderSettings: fastSettings, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText, result) => {
		check('T2.7 the SDK\'s resolved network failure is retried and a later success is delivered', !errText && result.messageId === 'msg_retry_ok' && result.attemptCount === 3 && stub.sentList.length === 3, `${errText} ${JSON.stringify(result)} sends=${stub.sentList.length}`);
		const idempotencyKeyList = stub.sendOptionsList.map((sendOptions) => (sendOptions || {}).idempotencyKey);
		check('T2.7 every attempt carries the same idempotency key', !!idempotencyKeyList[0] && idempotencyKeyList.length === 3 && idempotencyKeyList.every((idempotencyKeyText) => idempotencyKeyText === idempotencyKeyList[0]), JSON.stringify(idempotencyKeyList));
		check('T2.7 the failed attempts and the success are logged', statusLogList.some((logText) => /providerUnreachable on attempt 1 of 3 \(Unable to fetch data.*\); retrying in 20 ms/.test(logText)) && statusLogList.some((logText) => /retrying in 40 ms/.test(logText)) && statusLogList.some((logText) => /sent on attempt 3 of 3 \(message msg_retry_ok\)/.test(logText)), JSON.stringify(statusLogList));
		done();
	});
});

// T2.8
caseList.push((done) => {
	const alertCountBefore = alertList.length;
	const stub = stubBuilderOf(() => Promise.resolve(SDK_NETWORK_FAILURE_ANSWER));
	emailSenderOf({ emailSenderSettings: fastSettings, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText, result) => {
		check('T2.8 network failure every time: providerUnreachable (not providerRefused) after exactly three attempts', /^providerUnreachable: .*Unable to fetch data.*attempt 3 of 3/.test(errText) && result.failureName === 'providerUnreachable' && stub.sentList.length === 3, `${errText} sends=${stub.sentList.length}`);
		check('T2.8 one alert', JSON.stringify(alertsSince(alertCountBefore)) === JSON.stringify([{ mailName: 'passwordReset', accountName: 'pat', failureName: 'providerUnreachable' }]), JSON.stringify(alertsSince(alertCountBefore)));
		done();
	});
});

// T2.9
caseList.push((done) => {
	const alertCountBefore = alertList.length;
	const stub = stubBuilderOf(() => Promise.resolve({ data: null, error: { statusCode: 422, name: 'validation_error', message: 'The from address domain is not verified' }, headers: {} }));
	emailSenderOf({ emailSenderSettings: fastSettings, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText, result) => {
		check('T2.9 a resolved validation_error is providerRefused and is not retried', /^providerRefused: .*not verified.*validation_error/.test(errText) && result.failureName === 'providerRefused' && stub.sentList.length === 1, `${errText} sends=${stub.sentList.length}`);
		check('T2.9 alerted', alertsSince(alertCountBefore).length === 1 && alertsSince(alertCountBefore)[0].failureName === 'providerRefused');
		done();
	});
});

// T2.10
caseList.push((done) => {
	const stub = stubBuilderOf((sendParameters, callNumber) => (callNumber === 1 ? Promise.reject(new Error('connect ETIMEDOUT')) : Promise.resolve(SUCCESS_ANSWER)));
	emailSenderOf({ emailSenderSettings: fastSettings, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText, result) => {
		check('T2.10 a rejection is retried and a second success is delivered', !errText && result.messageId === 'msg_retry_ok' && stub.sentList.length === 2, `${errText} sends=${stub.sentList.length}`);
		const alwaysStub = stubBuilderOf(() => Promise.reject(new Error('connect ETIMEDOUT')));
		emailSenderOf({ emailSenderSettings: fastSettings, resendClientBuilder: alwaysStub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (secondErrText) => {
			check('T2.10 rejections every time end providerUnreachable after exactly three attempts', /^providerUnreachable: .*ETIMEDOUT.*attempt 3 of 3/.test(secondErrText) && alwaysStub.sentList.length === 3, `${secondErrText} sends=${alwaysStub.sentList.length}`);
			done();
		});
	});
});

// T2.11
caseList.push((done) => {
	const stub = stubBuilderOf((sendParameters, callNumber) => Promise.resolve(callNumber === 1 ? statusAnswerOf(429) : SUCCESS_ANSWER));
	emailSenderOf({ emailSenderSettings: fastSettings, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText) => {
		check('T2.11 a 429 is retried and a later success is delivered', !errText && stub.sentList.length === 2, `${errText} sends=${stub.sentList.length}`);
		const brokenStub = stubBuilderOf(() => Promise.resolve(statusAnswerOf(502)));
		emailSenderOf({ emailSenderSettings: fastSettings, resendClientBuilder: brokenStub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (brokenErrText, brokenResult) => {
			check('T2.11 a 5xx every time ends providerUnavailable after three attempts', /^providerUnavailable: .*502.*attempt 3 of 3/.test(brokenErrText) && brokenResult.failureName === 'providerUnavailable' && brokenStub.sentList.length === 3, `${brokenErrText} sends=${brokenStub.sentList.length}`);
			done();
		});
	});
});

// T2.12
caseList.push((done) => {
	const stub = stubBuilderOf((sendParameters, callNumber) => Promise.resolve(callNumber < 3 ? SDK_NETWORK_FAILURE_ANSWER : SUCCESS_ANSWER));
	emailSenderOf({ emailSenderSettings: { ...goodSettings, retryDelayMillisecondsList: { 0: '100', 1: '300' } }, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText) => {
		const [firstWait, secondWait] = [stub.sentAtList[1] - stub.sentAtList[0], stub.sentAtList[2] - stub.sentAtList[1]];
		check('T2.12 the waits are the configured, growing retryDelayMillisecondsList (100 then 300)', !errText && firstWait >= 90 && firstWait < 250 && secondWait >= 290 && secondWait < 600, `waited ${firstWait}, ${secondWait} ms`);
		const notValidSender = emailSenderOf({ emailSenderSettings: { ...goodSettings, retryDelayMillisecondsList: { 0: 'soon' }, sendBudgetMilliseconds: 'ten' }, resendClientBuilder: stub.builder, failureAlerter: recordAlert });
		check('T2.12 timings that are not whole numbers are refused by name', /^emailSettingNotValid: .*retryDelayMillisecondsList, sendBudgetMilliseconds/.test(notValidSender.configRefusal), notValidSender.configRefusal);
		statusLogList.length = 0;
		const { retryDelayMillisecondsList, ...settingsWithoutDelays } = goodSettings;
		const defaultStub = stubBuilderOf((sendParameters, callNumber) => Promise.resolve(callNumber === 1 ? SDK_NETWORK_FAILURE_ANSWER : SUCCESS_ANSWER));
		emailSenderOf({ emailSenderSettings: settingsWithoutDelays, resendClientBuilder: defaultStub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (defaultErrText) => {
			const defaultWait = defaultStub.sentAtList[1] - defaultStub.sentAtList[0];
			check('T2.12 absent from the ini, the first wait is the settings file\'s 1000 ms (of 1000, 3000)', !defaultErrText && defaultWait >= 950 && statusLogList.some((logText) => /attempt 1 of 3 .*retrying in 1000 ms/.test(logText)), `waited ${defaultWait} ms ${JSON.stringify(statusLogList)}`);
			done();
		});
	});
});

// AbortSignal.timeout's timer does not hold the process open, so while a stub attempt waits on it nothing else would: this does
const keepProcessAlive = setInterval(() => {}, 1000);

// a stub attempt that never answers until it is abandoned, then resolves as the SDK does on an abort
const hangingAnswerOf = (sendParameters, callNumber, sendOptions) =>
	new Promise((resolve) => sendOptions.signal.addEventListener('abort', () => resolve(SDK_NETWORK_FAILURE_ANSWER)));

// T2.13
caseList.push((done) => {
	const stub = stubBuilderOf(hangingAnswerOf);
	const startedAt = Date.now();
	emailSenderOf({ emailSenderSettings: { ...goodSettings, retryDelayMillisecondsList: { 0: '20', 1: '20' }, attemptTimeoutMilliseconds: '200', sendBudgetMilliseconds: '5000' }, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText) => {
		const elapsedMilliseconds = Date.now() - startedAt;
		check('T2.13 each hanging attempt is abandoned at attemptTimeoutMilliseconds (200): three attempts in well under a second', /^providerUnreachable/.test(errText) && stub.sentList.length === 3 && elapsedMilliseconds >= 600 && elapsedMilliseconds < 1200, `${errText} sends=${stub.sentList.length} elapsed=${elapsedMilliseconds}`);
		done();
	});
});

// T2.14
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.resolve(SDK_NETWORK_FAILURE_ANSWER));
	const startedAt = Date.now();
	emailSenderOf({ emailSenderSettings: { ...goodSettings, retryDelayMillisecondsList: { 0: '300', 1: '300' }, sendBudgetMilliseconds: '500' }, resendClientBuilder: stub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (errText) => {
		const elapsedMilliseconds = Date.now() - startedAt;
		check('T2.14 the hard budget (500): the second retry\'s wait would pass it, so the send stops after two attempts', /^providerUnreachable: .*attempt 2 of 3.*of the 500 ms budget/.test(errText) && stub.sentList.length === 2 && elapsedMilliseconds < 500, `${errText} sends=${stub.sentList.length} elapsed=${elapsedMilliseconds}`);
		const hangStub = stubBuilderOf(hangingAnswerOf);
		const hangStartedAt = Date.now();
		emailSenderOf({ emailSenderSettings: { ...goodSettings, retryDelayMillisecondsList: { 0: '20', 1: '20' }, attemptTimeoutMilliseconds: '4000', sendBudgetMilliseconds: '400' }, resendClientBuilder: hangStub.builder, failureAlerter: recordAlert }).sendEmail(messageOf(), (hangErrText) => {
			const hangElapsedMilliseconds = Date.now() - hangStartedAt;
			check('T2.14 a hanging attempt is cut at the budget, not at its own longer limit', /^providerUnreachable/.test(hangErrText) && hangElapsedMilliseconds >= 380 && hangElapsedMilliseconds < 900, `${hangErrText} elapsed=${hangElapsedMilliseconds}`);
			done();
		});
	});
});

// T2.15
caseList.push((done) => {
	const alertCountBefore = alertList.length;
	const stub = stubBuilderOf(() => Promise.resolve({ data: { id: 'msg_quiet' }, error: null }));
	const emailSender = emailSenderOf({ emailSenderSettings: fastSettings, resendClientBuilder: stub.builder, failureAlerter: recordAlert });
	emailSender.sendEmail(messageOf(), (errText) => {
		check('T2.15 a success alerts nothing', !errText && alertList.length === alertCountBefore);
		let unlabelledThrew = false;
		try {
			emailSender.sendEmail(messageOf({ alertLabel: undefined }), () => {});
		} catch (unlabelledError) {
			unlabelledThrew = /requires alertLabel/.test(unlabelledError.message);
		}
		let unalertedThrew = false;
		try {
			emailSenderOf({ emailSenderSettings: fastSettings, resendClientBuilder: stub.builder });
		} catch (unalertedError) {
			unalertedThrew = /requires failureAlerter/.test(unalertedError.message);
		}
		check('T2.15 a send without alertLabel, and a sender without failureAlerter, throw by name', unlabelledThrew && unalertedThrew);
		emailSenderOf({ emailSenderSettings: undefined, failureAlerter: recordAlert }).sendEmail(messageOf(), (refusedErrText, refusedResult) => {
			check('T2.15 a send refused by configuration is alerted too, by the refusal\'s name', /^emailSenderNotConfigured/.test(refusedErrText) && refusedResult.failureName === 'emailSenderNotConfigured' && alertList[alertList.length - 1].failureName === 'emailSenderNotConfigured');
			done();
		});
	});
});

// T2.16
caseList.push((done) => {
	const net = require('net');
	const { applyConnectAttemptTimeout } = require(path.join(__dirname, '..', 'lib', 'email-sender'));
	const defaultApplied = applyConnectAttemptTimeout({});
	check('T2.16 the connect window is applied process-wide, 2000 ms by default', !defaultApplied.connectRefusal && defaultApplied.appliedMilliseconds === 2000 && net.getDefaultAutoSelectFamilyAttemptTimeout() === 2000, JSON.stringify(defaultApplied));
	const configuredApplied = applyConnectAttemptTimeout({ connectAttemptTimeoutMilliseconds: '1500' });
	const refusedApplied = applyConnectAttemptTimeout({ connectAttemptTimeoutMilliseconds: 'fast' });
	check('T2.16 a configured window is applied; a bad one is refused by name and NOT applied', configuredApplied.appliedMilliseconds === 1500 && /^emailSettingNotValid: .*connectAttemptTimeoutMilliseconds/.test(refusedApplied.connectRefusal) && net.getDefaultAutoSelectFamilyAttemptTimeout() === 1500, `${JSON.stringify(configuredApplied)} ${JSON.stringify(refusedApplied)}`);
	done();
});

const runNext = (remainingList) => {
	if (!remainingList.length) {
		clearInterval(keepProcessAlive);
		const failedCount = resultList.filter((passed) => !passed).length;
		console.log(`email-sender: ${resultList.length - failedCount} passed, ${failedCount} failed`);
		process.exit(failedCount ? 1 : 0);
		return;
	}
	remainingList[0](() => runNext(remainingList.slice(1)));
};
runNext(caseList);
