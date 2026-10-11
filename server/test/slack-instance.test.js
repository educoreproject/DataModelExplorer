'use strict';
// slack-instance driver gate (DME/Slack plan v3, task 1.2).
// Signature verification (valid / invalid / stale / tampered / malformed),
// event_id dedupe with eviction, outbound calls through an injected capturing
// transport, and the no-credential-in-logs guarantee.
//
// Run: node server/test/slack-instance.test.js

const crypto = require('crypto');

const capturedLogLines = [];
process.global = {
	getConfig: () => ({}),
	xLog: {
		status: (line) => capturedLogLines.push(String(line)),
		error: (line) => capturedLogLines.push(String(line)),
		verbose: (line) => capturedLogLines.push(String(line)),
		result: () => {},
	},
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const slackGen = require('../data-model/lib/slack-instance/slack-instance')({
	unused: true,
});

const results = [];
const ok = (name, cond, detail) => {
	results.push([name, !!cond]);
	console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const TEST_SIGNING_SECRET = 'testSigningSecretForGateOnly0001';
const TEST_BOT_TOKEN = 'xoxb-TEST-FIXTURE-TOKEN-neverReal-0001';

const signFixture = (bodyString, timestampSeconds) => {
	const baseString = `v0:${timestampSeconds}:${bodyString}`;
	return `v0=${crypto
		.createHmac('sha256', TEST_SIGNING_SECRET)
		.update(baseString)
		.digest('hex')}`;
};

const transportCalls = [];
const capturingTransport = ({ url, data, headers }, callback) => {
	transportCalls.push({ url, data, headers });
	const cannedResponse = transportCalls.cannedResponse || {
		status: 200,
		data: { ok: true },
	};
	callback('', cannedResponse);
};

slackGen.initSlackInstance(
	{
		signingSecret: TEST_SIGNING_SECRET,
		botToken: TEST_BOT_TOKEN,
		eventDedupeCacheSize: 3,
		transport: capturingTransport,
	},
	(err, slackAccess) => {
		if (err) {
			console.error(`init failed: ${err}`);
			process.exit(1);
		}

		const { verifySignature, isDuplicateEvent, postResponse, postMessage } =
			slackAccess;

		console.log('\n=== slack-instance driver gate ===\n');
		console.log('Signature verification:');

		const fixtureBody = 'token=fixture&command=%2Fdme&text=birth+date';
		const nowSeconds = Math.floor(Date.now() / 1000);

		const validResult = verifySignature({
			rawBody: Buffer.from(fixtureBody, 'utf8'),
			timestampHeader: String(nowSeconds),
			signatureHeader: signFixture(fixtureBody, nowSeconds),
		});
		ok('valid signature accepted', validResult.valid);

		const invalidResult = verifySignature({
			rawBody: Buffer.from(fixtureBody, 'utf8'),
			timestampHeader: String(nowSeconds),
			signatureHeader: 'v0=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
		});
		ok(
			'invalid signature rejected',
			!invalidResult.valid && invalidResult.reason === 'signature mismatch',
		);

		const staleTimestamp = nowSeconds - 400;
		const staleResult = verifySignature({
			rawBody: Buffer.from(fixtureBody, 'utf8'),
			timestampHeader: String(staleTimestamp),
			signatureHeader: signFixture(fixtureBody, staleTimestamp),
		});
		ok(
			'stale (400s) correctly-signed request rejected',
			!staleResult.valid && /replay window/.test(staleResult.reason),
		);

		const tamperedResult = verifySignature({
			rawBody: Buffer.from(fixtureBody + '&text=EVIL', 'utf8'),
			timestampHeader: String(nowSeconds),
			signatureHeader: signFixture(fixtureBody, nowSeconds),
		});
		ok('tampered body rejected', !tamperedResult.valid);

		const malformedTimestampResult = verifySignature({
			rawBody: Buffer.from(fixtureBody, 'utf8'),
			timestampHeader: 'not-a-number',
			signatureHeader: signFixture(fixtureBody, nowSeconds),
		});
		ok('malformed timestamp rejected', !malformedTimestampResult.valid);

		const missingHeadersResult = verifySignature({
			rawBody: Buffer.from(fixtureBody, 'utf8'),
			timestampHeader: undefined,
			signatureHeader: undefined,
		});
		ok('missing headers rejected', !missingHeadersResult.valid);

		console.log('\nEvent dedupe:');

		ok('first event_id passes', isDuplicateEvent('Ev0001') === false);
		ok('retried event_id flagged duplicate', isDuplicateEvent('Ev0001') === true);
		ok('different event_id passes', isDuplicateEvent('Ev0002') === false);
		isDuplicateEvent('Ev0003');
		isDuplicateEvent('Ev0004'); // cache size 3: Ev0001 evicted here
		ok(
			'oldest id evicted at cache cap (re-presented Ev0001 passes)',
			isDuplicateEvent('Ev0001') === false,
		);
		ok('missing event_id treated as non-duplicate', isDuplicateEvent(undefined) === false);

		console.log('\nOutbound (injected transport):');

		postResponse(
			'https://hooks.slack.com/commands/T0001/fixture',
			{ response_type: 'ephemeral', text: 'fixture reply' },
			(prErr) => {
				const call = transportCalls[transportCalls.length - 1];
				ok(
					'postResponse posts message to response_url',
					!prErr &&
						call.url === 'https://hooks.slack.com/commands/T0001/fixture' &&
						call.data.text === 'fixture reply',
				);
				ok(
					'postResponse sends no credential header',
					!call.headers.authorization,
				);

				postResponse('https://evil.example.com/hook', { text: 'x' }, (guardErr) => {
					ok(
						'postResponse refuses non-Slack-hooks URL',
						!!guardErr,
						guardErr ? String(guardErr).slice(0, 60) : 'NO ERROR',
					);

					postMessage('C0FIXTURE', { text: 'channel reply' }, (pmErr) => {
						const pmCall = transportCalls[transportCalls.length - 1];
						ok(
							'postMessage targets chat.postMessage with channel merged',
							!pmErr &&
								pmCall.url === 'https://slack.com/api/chat.postMessage' &&
								pmCall.data.channel === 'C0FIXTURE' &&
								pmCall.data.text === 'channel reply',
						);
						ok(
							'postMessage carries bearer auth to Slack API only',
							pmCall.headers.authorization === `Bearer ${TEST_BOT_TOKEN}`,
						);

						transportCalls.cannedResponse = {
							status: 200,
							data: { ok: false, error: 'channel_not_found' },
						};
						postMessage('C0MISSING', { text: 'x' }, (slackErr) => {
							ok(
								'Slack ok:false surfaces as error naming the Slack code',
								slackErr && /channel_not_found/.test(String(slackErr)),
							);

							console.log('\nCredential hygiene:');
							const allLogs = capturedLogLines.join('\n');
							ok(
								'bot token value never appears in any log line',
								!allLogs.includes(TEST_BOT_TOKEN),
							);
							ok(
								'signing secret value never appears in any log line',
								!allLogs.includes(TEST_SIGNING_SECRET),
							);

							const failed = results.filter(([, pass]) => !pass).length;
							console.log(
								`\n=== Results: ${results.length - failed} passed, ${failed} failed ===\n`,
							);
							process.exit(failed > 0 ? 1 : 0);
						});
					});
				});
			},
		);
	},
);
