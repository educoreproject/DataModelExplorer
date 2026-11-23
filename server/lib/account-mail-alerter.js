#!/usr/bin/env node
'use strict';

// account-mail-alerter.js — tells tqii when an account mail failed for good (WORKORDER-accountMailFailureAndApprovalNotice-
// 112326 M6 d). lib/email-sender.js calls alertMailFailure once per message that failed after all its tries.
//
//   accountMailAlerterOf({ minimumIntervalMilliseconds, alertLineWriter, heldLineWriter }) -> { alertMailFailure }
//   alertMailFailure({ mailName, accountName, failureName })
//
// TODAY THE ALERT IS ONE LOG LINE (the transport to tqii's phone, TQ_TEXT, is a separate decision; it keys on this line):
//
//   ACCOUNT_MAIL_ALERT mail=<mailName> account=<accountName> failure=<failureName> heldSinceLast=<count>
//
// plain ASCII, values reduced to [A-Za-z0-9_.@-] (anything else becomes _), never a token, link, address or secret.
// RATE LIMIT: at most one ACCOUNT_MAIL_ALERT line per minimumIntervalMilliseconds; a failure inside the interval is held
// (logged by heldLineWriter in words that do NOT contain the alert marker) and counted into the next alert's
// heldSinceLast, so an outage is one line, not a storm.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const ALERT_MARKER_TEXT = 'ACCOUNT_MAIL_ALERT';
const asciiFieldOf = (fieldText) => String(fieldText === undefined || fieldText === null || fieldText === '' ? 'unnamed' : fieldText).replace(/[^A-Za-z0-9_.@-]/g, '_');

const accountMailAlerterOf = ({ minimumIntervalMilliseconds, alertLineWriter, heldLineWriter } = {}) => {
	if (!Number.isInteger(minimumIntervalMilliseconds) || minimumIntervalMilliseconds < 0) {
		throw new Error(`[${moduleName}] accountMailAlerterOf: minimumIntervalMilliseconds must be a whole number (got ${minimumIntervalMilliseconds})`);
	}
	if (typeof alertLineWriter !== 'function' || typeof heldLineWriter !== 'function') {
		throw new Error(`[${moduleName}] accountMailAlerterOf: alertLineWriter and heldLineWriter must be functions`);
	}
	// this alerter's own memory: when it last wrote, and how many it has held since
	const alertState = { lastAlertAt: undefined, heldCount: 0 };

	const alertMailFailure = ({ mailName, accountName, failureName }) => {
		const fieldText = `mail=${asciiFieldOf(mailName)} account=${asciiFieldOf(accountName)} failure=${asciiFieldOf(failureName)}`;
		const nowMilliseconds = Date.now();
		if (alertState.lastAlertAt !== undefined && nowMilliseconds - alertState.lastAlertAt < minimumIntervalMilliseconds) {
			alertState.heldCount += 1;
			heldLineWriter(`[${moduleName}] account mail failure held by the alert rate limit (${alertState.heldCount} held): ${fieldText}`);
			return;
		}
		alertLineWriter(`${ALERT_MARKER_TEXT} ${fieldText} heldSinceLast=${alertState.heldCount}`);
		alertState.lastAlertAt = nowMilliseconds;
		alertState.heldCount = 0;
	};

	return { alertMailFailure };
};

module.exports = { accountMailAlerterOf, ALERT_MARKER_TEXT };
