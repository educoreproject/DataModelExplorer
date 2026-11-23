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
// WORKORDER-accountMailFailureAndApprovalNotice-112326 M1, M2 (the resolved shapes are resend 6.39.0's own, see
// lib/email-sender-settings.json):
//   T2.7 the SDK's resolved network failure (application_error, statusCode null) is providerUnreachable, retried ONCE;
//        a second success is delivered; both attempts carry the same idempotency key; the first attempt is logged
//   T2.8 network failure twice: providerUnreachable, exactly two attempts
//   T2.9 a resolved validation_error (an answer, statusCode 422) is providerRefused, never retried
//   T2.10 a rejection is providerUnreachable, retried once; a second rejection fails
//   T2.11 application_error WITH a status (a 5xx whose body was not JSON) is the provider's answer: providerRefused, no retry
//   T2.12 the retry waits unreachableRetryDelayMilliseconds; absent, the settings file's 2000; not a whole number, refused
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
	unreachableRetryDelayMilliseconds: '0',
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
					return answerOf(sendParameters, stub.sentList.length);
				},
			},
		};
	};
	return stub;
};

const messageOf = (overrideByName = {}) => ({ toList: ['person@example.com'], ccList: ['copy@example.com'], bccList: ['blind@example.com'], subject: 'Hello', text: 'plain body', html: '<p>html body</p>', ...overrideByName });

const caseList = [];

// T2.1
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.resolve({ data: null, error: { message: 'domain is not verified', name: 'validation_error' } }));
	emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder }).sendEmail(messageOf(), (errText, result) => {
		check('T2.1 a resolved { data: null, error } is an error (providerRefused), not a success', /^providerRefused: .*domain is not verified.*validation_error/.test(errText) && !result.messageId, `${errText} ${JSON.stringify(result)}`);
		done();
	});
});

// T2.2
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.reject(new Error('getaddrinfo ENOTFOUND api.resend.com')));
	emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder }).sendEmail(messageOf(), (errText, result) => {
		check('T2.2 a rejection is an error (providerUnreachable)', /^providerUnreachable: .*ENOTFOUND/.test(errText) && !result.messageId, errText);
		done();
	});
});

// T2.3 (and the client is built once, with the configured key, and reused)
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.resolve({ data: { id: 'msg_123' }, error: null }));
	const emailSender = emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder });
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
	emailSenderOf({ emailSenderSettings: { ...goodSettings, redirectAllEmailTo: 'tester@example.net' }, resendClientBuilder: stub.builder }).sendEmail(messageOf(), (errText, result) => {
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
	const noKeySender = emailSenderOf({ emailSenderSettings: { ...goodSettings, resendApiKey: '' }, resendClientBuilder: stub.builder });
	check('T2.6 a missing key is refused by name at construction', /^emailSettingMissing: .*resendApiKey/.test(noKeySender.configRefusal), noKeySender.configRefusal);
	noKeySender.sendEmail(messageOf(), (errText) => {
		check('T2.6 a send with no key answers the refusal, and no client is built', /^emailSettingMissing/.test(errText) && stub.builtCount === 0 && stub.sentList.length === 0, `${errText} built=${stub.builtCount}`);
		const offDomainSender = emailSenderOf({ emailSenderSettings: { ...goodSettings, fromAddress: 'noreply@elsewhere.org' }, resendClientBuilder: stub.builder });
		check('T2.6 a fromAddress not on sendingDomain is refused by name', /^fromAddressNotOnSendingDomain/.test(offDomainSender.configRefusal), offDomainSender.configRefusal);
		check('T2.6 an absent [email-sender] section is refused by name', /^emailSenderNotConfigured/.test(emailSenderOf({ emailSenderSettings: undefined }).configRefusal));
		check('T2.6 no refusal text carries the key', ![noKeySender.configRefusal, offDomainSender.configRefusal].some((refusalText) => refusalText.includes(goodSettings.resendApiKey)));
		done();
	});
});

// resend 6.39.0 dist/index.cjs fetchRequest, the catch around fetch(): exactly this object, resolved
const SDK_NETWORK_FAILURE_ANSWER = Object.freeze({ data: null, error: { name: 'application_error', statusCode: null, message: 'Unable to fetch data. The request could not be resolved.' }, headers: null });
const SUCCESS_ANSWER = Object.freeze({ data: { id: 'msg_retry_ok' }, error: null });

// T2.7
caseList.push((done) => {
	statusLogList.length = 0;
	const stub = stubBuilderOf((sendParameters, callNumber) => Promise.resolve(callNumber === 1 ? SDK_NETWORK_FAILURE_ANSWER : SUCCESS_ANSWER));
	emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder }).sendEmail(messageOf(), (errText, result) => {
		check('T2.7 the SDK\'s resolved network failure is retried once and the second success is delivered', !errText && result.messageId === 'msg_retry_ok' && result.attemptCount === 2 && stub.sentList.length === 2, `${errText} ${JSON.stringify(result)} sends=${stub.sentList.length}`);
		const [firstOptions = {}, secondOptions = {}] = stub.sendOptionsList;
		check('T2.7 both attempts carry the same idempotency key', !!firstOptions.idempotencyKey && firstOptions.idempotencyKey === secondOptions.idempotencyKey, JSON.stringify(stub.sendOptionsList));
		check('T2.7 the unreachable first attempt and the second attempt are logged', statusLogList.some((logText) => /providerUnreachable on attempt 1 of 2 \(Unable to fetch data.*application_error\)\); retrying in 0 ms/.test(logText)) && statusLogList.some((logText) => /sent on attempt 2 of 2 \(message msg_retry_ok\)/.test(logText)), JSON.stringify(statusLogList));
		done();
	});
});

// T2.8
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.resolve(SDK_NETWORK_FAILURE_ANSWER));
	emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder }).sendEmail(messageOf(), (errText, result) => {
		check('T2.8 network failure twice: providerUnreachable (not providerRefused), exactly two attempts', /^providerUnreachable: .*Unable to fetch data.*attempt 2 of 2/.test(errText) && !result.messageId && stub.sentList.length === 2, `${errText} sends=${stub.sentList.length}`);
		done();
	});
});

// T2.9
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.resolve({ data: null, error: { statusCode: 422, name: 'validation_error', message: 'The from address domain is not verified' }, headers: {} }));
	emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder }).sendEmail(messageOf(), (errText) => {
		check('T2.9 a resolved validation_error is providerRefused and is not retried', /^providerRefused: .*not verified.*validation_error/.test(errText) && stub.sentList.length === 1, `${errText} sends=${stub.sentList.length}`);
		done();
	});
});

// T2.10
caseList.push((done) => {
	const stub = stubBuilderOf((sendParameters, callNumber) => (callNumber === 1 ? Promise.reject(new Error('connect ETIMEDOUT')) : Promise.resolve(SUCCESS_ANSWER)));
	emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder }).sendEmail(messageOf(), (errText, result) => {
		check('T2.10 a rejection is retried once and a second success is delivered', !errText && result.messageId === 'msg_retry_ok' && stub.sentList.length === 2, `${errText} sends=${stub.sentList.length}`);
		const twiceStub = stubBuilderOf(() => Promise.reject(new Error('connect ETIMEDOUT')));
		emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: twiceStub.builder }).sendEmail(messageOf(), (secondErrText) => {
			check('T2.10 a rejection twice is providerUnreachable after exactly two attempts', /^providerUnreachable: .*ETIMEDOUT.*attempt 2 of 2/.test(secondErrText) && twiceStub.sentList.length === 2, `${secondErrText} sends=${twiceStub.sentList.length}`);
			done();
		});
	});
});

// T2.11
caseList.push((done) => {
	const stub = stubBuilderOf(() => Promise.resolve({ data: null, error: { name: 'application_error', statusCode: 502, message: 'Internal server error. We are unable to process your request right now, please try again later.' }, headers: {} }));
	emailSenderOf({ emailSenderSettings: goodSettings, resendClientBuilder: stub.builder }).sendEmail(messageOf(), (errText) => {
		check('T2.11 application_error carrying an HTTP status is the provider\'s answer: providerRefused, no retry', /^providerRefused: .*application_error/.test(errText) && stub.sentList.length === 1, `${errText} sends=${stub.sentList.length}`);
		done();
	});
});

// T2.12
caseList.push((done) => {
	const stub = stubBuilderOf((sendParameters, callNumber) => Promise.resolve(callNumber === 1 ? SDK_NETWORK_FAILURE_ANSWER : SUCCESS_ANSWER));
	emailSenderOf({ emailSenderSettings: { ...goodSettings, unreachableRetryDelayMilliseconds: '300' }, resendClientBuilder: stub.builder }).sendEmail(messageOf(), (errText) => {
		const waitedMilliseconds = stub.sentAtList[1] - stub.sentAtList[0];
		check('T2.12 the retry waits the configured unreachableRetryDelayMilliseconds (300)', !errText && waitedMilliseconds >= 280 && waitedMilliseconds < 1500, `waited ${waitedMilliseconds} ms`);
		const notValidSender = emailSenderOf({ emailSenderSettings: { ...goodSettings, unreachableRetryDelayMilliseconds: 'soon' }, resendClientBuilder: stub.builder });
		check('T2.12 a retry delay that is not a whole number is refused by name', /^emailSettingNotValid: .*unreachableRetryDelayMilliseconds/.test(notValidSender.configRefusal), notValidSender.configRefusal);
		statusLogList.length = 0;
		const { unreachableRetryDelayMilliseconds, ...settingsWithoutDelay } = goodSettings;
		const defaultStub = stubBuilderOf((sendParameters, callNumber) => Promise.resolve(callNumber === 1 ? SDK_NETWORK_FAILURE_ANSWER : SUCCESS_ANSWER));
		emailSenderOf({ emailSenderSettings: settingsWithoutDelay, resendClientBuilder: defaultStub.builder }).sendEmail(messageOf(), (defaultErrText) => {
			const defaultWaitedMilliseconds = defaultStub.sentAtList[1] - defaultStub.sentAtList[0];
			check('T2.12 absent from the ini, the wait is the settings file\'s default, 2000 ms', !defaultErrText && defaultWaitedMilliseconds >= 1950 && statusLogList.some((logText) => /retrying in 2000 ms/.test(logText)), `waited ${defaultWaitedMilliseconds} ms ${JSON.stringify(statusLogList)}`);
			done();
		});
	});
});

const runNext = (remainingList) => {
	if (!remainingList.length) {
		const failedCount = resultList.filter((passed) => !passed).length;
		console.log(`email-sender: ${resultList.length - failedCount} passed, ${failedCount} failed`);
		process.exit(failedCount ? 1 : 0);
		return;
	}
	remainingList[0](() => runNext(remainingList.slice(1)));
};
runNext(caseList);
