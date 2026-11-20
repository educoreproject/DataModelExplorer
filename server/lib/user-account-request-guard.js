#!/usr/bin/env node
'use strict';

// user-account-request-guard.js — what every public account access point checks before it does anything
// (PLAN-userRegistrationReset-112026 4.1, 4.5): that [user-registration] is configured, and that neither the client
// address nor the username-or-email has gone over its limit. Each access point builds ONE guard at load, so its counts
// are its own (lib/public-request-limiter.js).
//
//   requestGuardOf({ userRegistrationSettings }) -> { registrationSettings, refusalOfRequest({ clientAddress, identifierText }) }
//   refusalOfRequest -> '' or a frozen refusal (registrationNotConfigured, tooManyRequests)
//
// The identifier is counted lower-cased and trimmed, so 'Alice' and ' alice ' share one limit. A request with no
// identifier yet (a form submitted blank) is counted by address only.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { refusalOf } = require('./user-profile-rules');
const { requestLimiterOf } = require('./public-request-limiter');

const requestGuardOf = ({ userRegistrationSettings }) => {
	const { settingsRefusal, registrationSettings } = userRegistrationSettings || { settingsRefusal: `${moduleName}: no userRegistrationSettings were handed to this access point` };
	if (settingsRefusal) {
		const notConfiguredRefusal = refusalOf('registrationNotConfigured');
		return { registrationSettings: undefined, settingsRefusal, refusalOfRequest: () => notConfiguredRefusal };
	}
	const addressLimiter = requestLimiterOf({ requestLimit: registrationSettings.addressRequestLimit, windowMinutes: registrationSettings.addressWindowMinutes });
	const identifierLimiter = requestLimiterOf({ requestLimit: registrationSettings.identifierRequestLimit, windowMinutes: registrationSettings.identifierWindowMinutes });

	const refusalOfRequest = ({ clientAddress, identifierText }) => {
		const addressAdmission = addressLimiter.admissionOf(`address:${clientAddress || 'unknown'}`);
		if (!addressAdmission.isAdmitted) {
			return refusalOf('tooManyRequests', { detailList: [addressAdmission.retryAfterSeconds] });
		}
		if (typeof identifierText === 'string' && identifierText.trim()) {
			const identifierAdmission = identifierLimiter.admissionOf(`identifier:${identifierText.trim().toLowerCase()}`);
			if (!identifierAdmission.isAdmitted) {
				return refusalOf('tooManyRequests', { detailList: [identifierAdmission.retryAfterSeconds] });
			}
		}
		return '';
	};

	return { registrationSettings, settingsRefusal: '', refusalOfRequest };
};

module.exports = { requestGuardOf };
