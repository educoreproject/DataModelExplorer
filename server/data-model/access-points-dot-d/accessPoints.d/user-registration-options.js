#!/usr/bin/env node
'use strict';

// user-registration-options.js — ACCESS POINT: what the login page may offer (PLAN-userRegistrationReset-112026 4.1).
// Behind GET /api/registrationOptions (public). Answers { selfRegistrationEnabled, requireEmailConfirmation,
// passwordResetEnabled }; a server without a usable [user-registration] section answers all three false, so the page
// offers nothing it cannot do. Nothing here is secret: it is what the page would show anyway.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { userRegistrationSettings } = passThroughParameters;
	const { registrationSettings } = userRegistrationSettings || {};

	const serviceFunction = (xQuery, callback) => {
		callback('', {
			registrationOptions: {
				selfRegistrationEnabled: !!(registrationSettings && registrationSettings.selfRegistrationEnabled),
				requireEmailConfirmation: !!(registrationSettings && registrationSettings.requireEmailConfirmation),
				// WORKORDER-adminApproval-112126: the register page says the application goes to an approver; names no one
				requireAdminApproval: !!(registrationSettings && registrationSettings.requireAdminApproval),
				passwordResetEnabled: !!registrationSettings,
			},
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
