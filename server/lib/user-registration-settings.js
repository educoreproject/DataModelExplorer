#!/usr/bin/env node
'use strict';

// user-registration-settings.js — reads and checks the [user-registration] section of startApiServer.ini
// (PLAN-userRegistrationReset-112026 4.1, 4.5). Every setting is required; there is no default. A missing or malformed
// one is a NAMED refusal, settingsRefusal, which the registration and reset access points answer to every request (so
// their endpoints exist and say plainly why they refuse, rather than vanishing at load).
//
//   registrationSettingsOf(rawSettings) -> { settingsRefusal, registrationSettings }
//
// registrationSettings: selfRegistrationEnabled, requireEmailConfirmation (booleans), newAccountRole,
// confirmationLinkLifetimeMinutes, resetLinkLifetimeMinutes, publicSiteUrl (no trailing slash), newAccountNoticeList
// (array, may be empty: R7, empty sends nothing), identifierRequestLimit, identifierWindowMinutes, addressRequestLimit,
// addressWindowMinutes (the abuse limits of 4.5).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { listFromConfig } = require('./email-sender');

const BOOLEAN_SETTING_NAME_LIST = ['selfRegistrationEnabled', 'requireEmailConfirmation'];
const WHOLE_NUMBER_SETTING_NAME_LIST = ['confirmationLinkLifetimeMinutes', 'resetLinkLifetimeMinutes', 'identifierRequestLimit', 'identifierWindowMinutes', 'addressRequestLimit', 'addressWindowMinutes'];
// a self-registered account can never be made one of these by configuration (the July saveUserData hole was a role taken
// from where it should not have been)
const REFUSED_NEW_ACCOUNT_ROLE_LIST = ['admin', 'super'];
const SETTINGS_REFUSAL_NAME = 'registrationNotConfigured';

const booleanOf = (settingValue) => {
	if (settingValue === true || settingValue === 'true') {
		return true;
	}
	if (settingValue === false || settingValue === 'false') {
		return false;
	}
	return undefined;
};

const registrationSettingsOf = (rawSettings) => {
	const refusalOf = (problemText) => ({ settingsRefusal: `${SETTINGS_REFUSAL_NAME}: [user-registration] in startApiServer.ini ${problemText}`, registrationSettings: undefined });
	if (!rawSettings || typeof rawSettings !== 'object' || !Object.keys(rawSettings).length) {
		return refusalOf('is absent, so registration and password reset are off on this server');
	}
	const badBooleanList = BOOLEAN_SETTING_NAME_LIST.filter((settingName) => booleanOf(rawSettings[settingName]) === undefined);
	if (badBooleanList.length) {
		return refusalOf(`needs true or false for: ${badBooleanList.join(', ')}`);
	}
	const badNumberList = WHOLE_NUMBER_SETTING_NAME_LIST.filter((settingName) => !/^[1-9][0-9]*$/.test(String(rawSettings[settingName] === undefined ? '' : rawSettings[settingName]).trim()));
	if (badNumberList.length) {
		return refusalOf(`needs a positive whole number for: ${badNumberList.join(', ')}`);
	}
	const newAccountRole = String(rawSettings.newAccountRole || '').trim();
	if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(newAccountRole) || REFUSED_NEW_ACCOUNT_ROLE_LIST.includes(newAccountRole.toLowerCase())) {
		return refusalOf(`needs newAccountRole to be one plain role that is not ${REFUSED_NEW_ACCOUNT_ROLE_LIST.join(' or ')}`);
	}
	const publicSiteUrl = String(rawSettings.publicSiteUrl || '').trim().replace(/\/+$/, '');
	if (!/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(publicSiteUrl)) {
		return refusalOf('needs publicSiteUrl, the http(s) address of this instance\'s website, for the links in mail');
	}
	const numberByName = Object.fromEntries(WHOLE_NUMBER_SETTING_NAME_LIST.map((settingName) => [settingName, Number(String(rawSettings[settingName]).trim())]));
	return {
		settingsRefusal: '',
		registrationSettings: Object.freeze({
			selfRegistrationEnabled: booleanOf(rawSettings.selfRegistrationEnabled),
			requireEmailConfirmation: booleanOf(rawSettings.requireEmailConfirmation),
			newAccountRole,
			publicSiteUrl,
			newAccountNoticeList: Object.freeze(listFromConfig(rawSettings.newAccountNoticeList)),
			...numberByName,
		}),
	};
};

module.exports = { registrationSettingsOf, SETTINGS_REFUSAL_NAME };
