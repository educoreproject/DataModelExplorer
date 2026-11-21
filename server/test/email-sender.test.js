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
//
// Run: node server/test/email-sender.test.js

const path = require('path');
const { emailSenderOf, listFromConfig } = require(path.join(__dirname, '..', 'lib', 'email-sender'));

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
});

// a stub Resend client: records what it was asked to send and answers as told
const stubBuilderOf = (answerOf) => {
	const stub = { builtCount: 0, sentList: [] };
	stub.builder = (apiKeyText) => {
		stub.builtCount += 1;
		stub.builtWithApiKeyText = apiKeyText;
		return { emails: { send: (sendParameters) => { stub.sentList.push(sendParameters); return answerOf(sendParameters); } } };
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
