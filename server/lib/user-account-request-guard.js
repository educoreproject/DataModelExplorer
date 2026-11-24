#!/usr/bin/env node
'use strict';

// user-account-request-guard.js — what every public account access point checks before it does anything
// (PLAN-userRegistrationReset-112026 4.1, 4.5): that [user-registration] is configured, and that neither the client
// address nor the username-or-email has gone over its limit. Each access point builds ONE guard at load, so its counts
// are its own (lib/public-request-limiter.js).
//
//   requestGuardOf({ userRegistrationSettings }) -> { registrationSettings, settingsRefusal, refusalOfRequest, admissionOfRequest }
//   refusalOfRequest({ clientAddress, identifierText }) -> '' or a frozen refusal (registrationNotConfigured, tooManyRequests)
//   admissionOfRequest({ clientAddress, identifierText }) -> { refusal, releaseIdentifierAdmission }
//
// releaseIdentifierAdmission() (WORKORDER-accountMailLooseEnds-112326 E3) takes this request back out of the IDENTIFIER
// count only. The access points call it when the mail the request was for failed to send: the identifier limit exists
// to cap mail actually delivered to a person, so a failed send gives an abuser nothing. The address count is never
// released (it still counts everything), and a request that never reached a send (no account, ambiguous) is never
// released, so the reset form's answers stay alike. On a refused request, or one with no identifier, it does nothing.
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
		return { registrationSettings: undefined, settingsRefusal, refusalOfRequest: () => notConfiguredRefusal, admissionOfRequest: () => ({ refusal: notConfiguredRefusal, releaseIdentifierAdmission: () => false }) };
	}
	const addressLimiter = requestLimiterOf({ requestLimit: registrationSettings.addressRequestLimit, windowMinutes: registrationSettings.addressWindowMinutes });
	const identifierLimiter = requestLimiterOf({ requestLimit: registrationSettings.identifierRequestLimit, windowMinutes: registrationSettings.identifierWindowMinutes });

	const releaseNothing = () => false;

	const admissionOfRequest = ({ clientAddress, identifierText }) => {
		// a request with no req.ip (none seen behind nginx) is not let through uncounted: all such share one named bucket
		const addressAdmission = addressLimiter.admissionOf(`address:${clientAddress || 'noClientAddress'}`);
		if (!addressAdmission.isAdmitted) {
			return { refusal: refusalOf('tooManyRequests', { detailList: [addressAdmission.retryAfterSeconds] }), releaseIdentifierAdmission: releaseNothing };
		}
		if (typeof identifierText === 'string' && identifierText.trim()) {
			const identifierSubjectText = `identifier:${identifierText.trim().toLowerCase()}`;
			const identifierAdmission = identifierLimiter.admissionOf(identifierSubjectText);
			if (!identifierAdmission.isAdmitted) {
				return { refusal: refusalOf('tooManyRequests', { detailList: [identifierAdmission.retryAfterSeconds] }), releaseIdentifierAdmission: releaseNothing };
			}
			return { refusal: '', releaseIdentifierAdmission: () => identifierLimiter.releaseAdmission(identifierSubjectText, identifierAdmission.admittedAtMilliseconds) };
		}
		return { refusal: '', releaseIdentifierAdmission: releaseNothing };
	};

	const refusalOfRequest = (requestFacts) => admissionOfRequest(requestFacts).refusal;

	return { registrationSettings, settingsRefusal: '', refusalOfRequest, admissionOfRequest };
};

module.exports = { requestGuardOf };
