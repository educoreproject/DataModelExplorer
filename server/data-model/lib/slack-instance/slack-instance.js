#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SlackIntegration]]

// ============================================================================
// slack-instance — the Slack driver (DME/Slack plan v3, task 1.2)
//
// One more data source in the educore driver idiom (neo4j-instance,
// hxconnector-instance): initialized in a data-model.js pipeline stage,
// delivered to access points as `slackAccess` via passThroughParameters.
//
// Inbound: signing-secret HMAC verification (Slack v0 scheme over the raw
// request bytes) with a replay-rejection window; event_id dedupe so Events API
// retries never double-answer. Outbound: response_url POSTs and
// chat.postMessage via the Slack Web API. This module owns the credentials;
// nothing else touches them, and no credential value ever reaches a log line.
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');
const crypto = require('crypto');
const https = require('https');

// START OF moduleFunction() ============================================================

const moduleFunction = function ({ unused }) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	// ================================================================================
	// INBOUND: SIGNATURE VERIFICATION (Slack v0 signing scheme)
	//
	// v0=HMAC_SHA256(signingSecret, `v0:{timestamp}:{rawBody}`), constant-time
	// compare; requests older (or newer) than the replay window are rejected
	// before any signature math.

	const verifySignatureActual =
		({ signingSecret, replayWindowSeconds }) =>
		({ rawBody, timestampHeader, signatureHeader }) => {
			if (!rawBody || !Buffer.isBuffer(rawBody)) {
				return { valid: false, reason: 'rawBody buffer is required' };
			}
			if (!timestampHeader || !signatureHeader) {
				return { valid: false, reason: 'missing signature headers' };
			}

			const timestampSeconds = parseInt(timestampHeader, 10);
			if (!Number.isFinite(timestampSeconds)) {
				return { valid: false, reason: 'malformed timestamp header' };
			}

			const nowSeconds = Math.floor(Date.now() / 1000);
			if (Math.abs(nowSeconds - timestampSeconds) > replayWindowSeconds) {
				return { valid: false, reason: 'timestamp outside replay window' };
			}

			const baseString = `v0:${timestampHeader}:${rawBody.toString('utf8')}`;
			const expectedSignature = `v0=${crypto
				.createHmac('sha256', signingSecret)
				.update(baseString)
				.digest('hex')}`;

			const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
			const presentedBuffer = Buffer.from(String(signatureHeader), 'utf8');

			if (expectedBuffer.length !== presentedBuffer.length) {
				return { valid: false, reason: 'signature mismatch' };
			}
			if (!crypto.timingSafeEqual(expectedBuffer, presentedBuffer)) {
				return { valid: false, reason: 'signature mismatch' };
			}

			return { valid: true };
		};

	// ================================================================================
	// INBOUND: EVENT DEDUPE
	//
	// Slack retries undelivered events (x-slack-retry-num); the events endpoint
	// must be idempotent per event_id. Bounded insertion-ordered cache — oldest
	// entries evicted once the cap is reached.

	const makeEventDeduper = ({ eventDedupeCacheSize }) => {
		const seenEventIds = new Map();

		return (eventId) => {
			if (!eventId) {
				return false;
			}
			if (seenEventIds.has(eventId)) {
				return true;
			}
			seenEventIds.set(eventId, Date.now());
			while (seenEventIds.size > eventDedupeCacheSize) {
				const oldestKey = seenEventIds.keys().next().value;
				seenEventIds.delete(oldestKey);
			}
			return false;
		};
	};

	// ================================================================================
	// OUTBOUND: JSON POST TRANSPORT
	//
	// Default transport uses node's own https — deliberately DEPENDENCY-FREE.
	// (The first cut used axios, which resolved from a home-directory
	// node_modules on the dev box and crash-looped production at boot —
	// 2026-07-13. A driver this small must not carry deploy-fragile deps.)
	// Tests inject a capturing transport via config.transport. Error strings
	// carry HTTP status and the Slack error code only — never headers, never
	// credential values.

	const defaultTransport = ({ url, data, headers }, callback) => {
		let settled = false;
		const settle = (err, result) => {
			if (settled) {
				return;
			}
			settled = true;
			callback(err, result);
		};

		const bodyString = JSON.stringify(data);
		const request = https.request(
			url,
			{
				method: 'POST',
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'content-length': Buffer.byteLength(bodyString),
					...headers,
				},
				timeout: 15000,
			},
			(response) => {
				let responseText = '';
				response.on('data', (chunk) => {
					responseText += chunk.toString();
				});
				response.on('end', () => {
					if (response.statusCode < 200 || response.statusCode >= 300) {
						settle(
							`slack-instance POST failed (HTTP ${response.statusCode})`,
							{},
						);
						return;
					}
					// response_url replies are often plain "ok"; Web API is JSON
					let responseData = responseText;
					try {
						responseData = JSON.parse(responseText);
					} catch (parseErr) {
						// non-JSON body is fine — leave it as text
					}
					settle('', { status: response.statusCode, data: responseData });
				});
			},
		);

		request.on('timeout', () => {
			request.destroy();
			settle('slack-instance POST failed (HTTP no-response)', {});
		});
		request.on('error', () => {
			settle('slack-instance POST failed (HTTP no-response)', {});
		});

		request.write(bodyString);
		request.end();
	};

	// ================================================================================
	// INITIALIZE SLACK INSTANCE

	const initSlackInstance = (config, callback) => {
		const {
			signingSecret,
			botToken,
			replayWindowSeconds = 300,
			eventDedupeCacheSize = 500,
			transport,
		} = config;

		if (!signingSecret || !botToken) {
			callback(
				'slack-instance: missing required config (signingSecret, botToken)',
			);
			return;
		}

		const postJson = transport || defaultTransport;

		const verifySignature = verifySignatureActual({
			signingSecret,
			replayWindowSeconds,
		});
		const isDuplicateEvent = makeEventDeduper({ eventDedupeCacheSize });

		// ----------------------------------------------------------------------
		// postResponse — reply via a slash command's response_url (valid 30 min).
		// messageObject is a ready Slack message ({text} or {blocks, text}, plus
		// response_type in_channel|ephemeral).

		const postResponse = (responseUrl, messageObject, callback) => {
			if (!responseUrl || !/^https:\/\/hooks\.slack\.com\//.test(responseUrl)) {
				callback('postResponse: responseUrl is not a Slack hooks URL');
				return;
			}

			postJson({ url: responseUrl, data: messageObject, headers: {} }, (err, result) => {
				if (err) {
					xLog.error(`slack-instance postResponse failed: ${err}`);
					callback(err, {});
					return;
				}
				callback('', result);
			});
		};

		// ----------------------------------------------------------------------
		// postMessage — chat.postMessage with the bot token (the recovery path
		// when a response_url has expired, and the channel for event replies).

		const postMessage = (channel, messageObject, callback) => {
			if (!channel) {
				callback('postMessage: channel is required');
				return;
			}

			postJson(
				{
					url: 'https://slack.com/api/chat.postMessage',
					data: { channel, ...messageObject },
					headers: { authorization: `Bearer ${botToken}` },
				},
				(err, result) => {
					if (err) {
						xLog.error(`slack-instance postMessage failed: ${err}`);
						callback(err, {});
						return;
					}
					// Slack Web API signals failure inside a 200 body: { ok:false, error }
					if (result.data && result.data.ok === false) {
						const slackError = result.data.error || 'unknown-slack-error';
						xLog.error(`slack-instance postMessage rejected by Slack: ${slackError}`);
						callback(`postMessage rejected by Slack: ${slackError}`, {});
						return;
					}
					callback('', result);
				},
			);
		};

		xLog.status(
			`slack-instance: initialized (replay window ${replayWindowSeconds}s, dedupe cache ${eventDedupeCacheSize})`,
		);
		callback('', {
			verifySignature,
			isDuplicateEvent,
			postResponse,
			postMessage,
		});
	};

	return { initSlackInstance };
};

// END OF moduleFunction() ============================================================

module.exports = moduleFunction;
