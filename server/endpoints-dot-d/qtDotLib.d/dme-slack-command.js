#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SlackIntegration]]
// @concept: [[SecurityFirstPattern]]

// ============================================================================
// dme-slack-command — POST /api/dme-slack-command (plan v3, task 1.4)
//
// The Slack slash-command surface. Auth note (deliberate, recorded): the
// permission validator is ['public'] because this endpoint is internet-facing
// by design — the Slack signing-secret HMAC (verified FIRST, over the raw
// request bytes) IS the authentication.
//
// Async-ack pattern (plan A2b): verify signature → ack inside Slack's 3s
// window with an ephemeral "Working on it…" → do the real work post-response
// via the dme-slack-dispatch access point, which delivers out-of-band through
// the driver (response_url / chat.postMessage).
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../lib/make-ref-id');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({
	dotD: endpointsDotD,
	passThroughParameters,
}) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const {
		expressApp,
		accessTokenHeaderTools,
		accessPointsDotD,
		slackAccess,
		routingPrefix,
	} = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION (POST — slash command)

	const postServiceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const refId = makeRefId(12);

		// Slack surface disabled on this instance (no dmeSlack config)
		if (!slackAccess) {
			xRes.status(503).send(`Slack surface is not enabled (${refId})`);
			return;
		}

		// SIGNATURE FIRST — over the exact raw bytes; reject 401, log the
		// reason with the correlation id, never echo the body
		const verification = slackAccess.verifySignature({
			rawBody: xReq.rawBody,
			timestampHeader: xReq.headers['x-slack-request-timestamp'],
			signatureHeader: xReq.headers['x-slack-signature'],
		});
		if (!verification.valid) {
			xLog.error(
				`dme-slack AUTH-FAIL (${refId}) endpoint=${moduleName} reason=${verification.reason}`,
			);
			xRes.status(401).send(`unauthorized (${refId})`);
			return;
		}

		const body = xReq.body || {};

		// ACK inside the 3-second window; the answer arrives out-of-band.
		// Bare text routes to the askMilo default (slow path) — say so; the
		// reserved verbs (help/health/lookup) are fast.
		const commandText = String(body.text || '').trim();
		const isFastPath = /^(help|health|lookup\b)/i.test(commandText) || !commandText;
		xRes.status(200).json({
			response_type: 'ephemeral',
			text: isFastPath
				? 'Working on it…'
				: 'Thinking — a real answer takes a minute or two…',
		});

		// real work strictly post-response
		setImmediate(() => {
			accessPointsDotD['dme-slack-dispatch'](
				{
					commandText: body.text,
					// the registered command name differs per app (/tqdme on the
					// DME-dev app, /dme on the DME app) — echo it, never hardcode
					slashCommand: body.command,
					slackUserId: body.user_id,
					channelId: body.channel_id,
					responseUrl: body.response_url,
					requestRefId: refId,
				},
				(err) => {
					if (err) {
						xLog.error(`dme-slack (${refId}) dispatch returned: ${err}`);
					}
				},
			);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	const addEndpoint = ({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	}) => {
		expressApp[method](routePath, serviceFunction(permissionValidator));
		endpointsDotD.logList.push(name);
	};

	const thisEndpointName = moduleName;
	const routePath = `${routingPrefix}${thisEndpointName}`;

	// public is DELIBERATE here: the HMAC signature is the auth (plan A1)
	const permissionValidator = accessTokenHeaderTools.getValidator(['public']);

	addEndpoint({
		name: `${routePath} [POST]`,
		method: 'post',
		routePath,
		serviceFunction: postServiceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	});

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
