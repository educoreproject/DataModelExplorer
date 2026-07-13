#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SlackIntegration]]
// @concept: [[SecurityFirstPattern]]

// ============================================================================
// dme-slack-events — POST /api/dme-slack-events (plan v3, task 1.4)
//
// The Slack Events API surface. Same verify-first discipline as the command
// endpoint (public validator deliberate — the HMAC IS the auth). Handles:
//   - url_verification: echo the challenge (behind signature verification)
//   - event_callback: idempotent per event_id (driver dedupe cache) so Slack
//     retries (x-slack-retry-num) never double-answer; bare 200 ack.
// No event types are substantively handled in the Q&A scope — @-mention
// answering is a recorded Future item (plan A2d).
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
	// SERVICE FUNCTION (POST — events)

	const postServiceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const refId = makeRefId(12);

		if (!slackAccess) {
			xRes.status(503).send(`Slack surface is not enabled (${refId})`);
			return;
		}

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

		// Slack's endpoint-registration handshake
		if (body.type === 'url_verification') {
			xRes.status(200).json({ challenge: body.challenge });
			return;
		}

		if (body.type === 'event_callback') {
			const eventId = body.event_id;
			if (slackAccess.isDuplicateEvent(eventId)) {
				xLog.verbose(`dme-slack (${refId}) duplicate event ${eventId} ignored`);
				xRes.status(200).send('');
				return;
			}
			const eventType = (body.event || {}).type || 'unknown';
			xLog.verbose(`dme-slack (${refId}) event ${eventType} acked (no handler in Q&A scope)`);
			xRes.status(200).send('');
			return;
		}

		xRes.status(200).send('');
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
