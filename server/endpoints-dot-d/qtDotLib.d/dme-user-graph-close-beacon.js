#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[SessionLifecycle]]
// @concept: [[SecurityFirstPattern]]
//
// dme-user-graph-close-beacon — a navigator.sendBeacon-friendly close. sendBeacon CANNOT set an
// Authorization header, so the JWT rides in the BODY and is verified here exactly as the header
// path verifies it (jwt.verify with the shared secret). This lets a browser window/tab close free
// the live clone in ~1s instead of waiting ~15min for the reaper. PUBLIC route, auth-by-body.
// Always answers 204 (the browser never reads a beacon response) and does the close best-effort.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library'); // prototype methods (qtGetSurePath)
const jwt = require('jsonwebtoken');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD: endpointsDotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;
	const { expressApp, accessPointsDotD, routingPrefix } = passThroughParameters;
	const { secret } = getConfig('access-token-header-tools') || {};

	const postServiceFunction = (xReq, xRes) => {
		const body = xReq.body || {};
		const versionRefId = body.versionRefId;
		const token = body.token;

		// Verify the body token the same way hasValidToken verifies the header token.
		let userRefId = '';
		try {
			const authclaims = jwt.verify(token, secret);
			userRefId = authclaims.qtGetSurePath('user.refId', '');
		} catch (err) {
			xLog.status(`[dmeOpenTrace] close-beacon: invalid/absent token (${err.toString()}) — ignoring`);
			xRes.status(204).end();
			return;
		}

		if (!userRefId || !versionRefId) {
			xLog.status(`[dmeOpenTrace] close-beacon: missing userRefId or versionRefId — ignoring`);
			xRes.status(204).end();
			return;
		}

		xLog.status(`[dmeOpenTrace] close-beacon: closing versionRefId=${versionRefId} for userRefId=${userRefId} (window unload)`);
		accessPointsDotD['dme-user-graph-close'](
			{ userRefId, versionRefId },
			(err) => {
				if (err) { xLog.error(`[dmeOpenTrace] close-beacon: close FAILED for ${versionRefId}: ${err}`); return; }
				xLog.status(`[dmeOpenTrace] close-beacon: clone freed for versionRefId=${versionRefId}`);
			},
		);

		// Answer immediately; the close runs behind it. The reaper remains the backstop.
		xRes.status(204).end();
	};

	const routePath = `${routingPrefix}${moduleName}`;
	expressApp.post(routePath, postServiceFunction); // PUBLIC: auth is in the body, not a header
	endpointsDotD.logList.push(`${routePath} [POST]`);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
