'use strict';
// redact-logged-query.js — the query string the request log may print, with every credential-looking value replaced.
// (2026-10-08: with allowQueryStringInLog=true the request log printed /api/login?username=..&password=<plain text> on
// every site. The browser now POSTs its login, but any GET caller, old client or probe still reaches this log, so the
// log never prints a credential whatever the setting.)

const querystring = require('querystring');

const CREDENTIAL_KEY_PATTERN = /pass|secret|token|key|auth/i;

const redactLoggedQuery = (queryObject = {}) => {
	const keyList = Object.keys(queryObject);
	if (keyList.length === 0) {
		return '';
	}
	const redactedQueryObject = keyList.reduce(
		(resultObject, keyName) => ({ ...resultObject, [keyName]: CREDENTIAL_KEY_PATTERN.test(keyName) ? '<redacted>' : queryObject[keyName] }),
		{},
	);
	return '?' + querystring.stringify(redactedQueryObject);
};

module.exports = { redactLoggedQuery };
