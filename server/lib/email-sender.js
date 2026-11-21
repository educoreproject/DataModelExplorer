#!/usr/bin/env node
'use strict';

// email-sender.js — THE ONE PLACE THIS SERVER TALKS TO A MAIL PROVIDER (Resend, ruling R2 of
// PLAN-userRegistrationReset-112026). Ported from justkidding's data-model/lib/email-sender.js, itself modelled on
// lennypens' server/lib/emailSender.js; attachments dropped (nothing here sends one).
//
//   emailSenderOf({ emailSenderSettings, resendClientBuilder }) -> { configRefusal, sendEmail, fromAddress }
//   sendEmail({ toList, ccList, bccList, subject, text, html }, callback(errText, { messageId, deliveredToList }))
//   listFromConfig(rawList)  -> the INI's dotted list (name.0=, name.1=) as an array, in index order, blanks dropped
//
// TWO DECISIONS TAKEN WHOLE FROM justkidding:
//   1. BOTH OF RESEND'S FAILURE SHAPES BECOME ONE CALLBACK ERROR. An API refusal RESOLVES with { data: null, error };
//      a network failure REJECTS. A caller that handled only rejection would read a refused send as sent.
//   2. NO RETRY. One attempt, logged; a retry risks the same link mailed twice.
//
// SETTINGS ([email-sender] in startApiServer.ini, every one from configuration, no literal domain or address here, R6):
//   resendApiKey, sendingDomain, fromAddress (must be ON sendingDomain), fromName, redirectAllEmailTo (blank, or one
//   address that replaces EVERY recipient, to, cc and bcc, so no real user receives a test's mail), bccList.N.
// A missing or inconsistent setting is a NAMED refusal held in configRefusal: data-model.js logs it at startup, and every
// sendEmail answers it, so the server still serves the DME while plainly sending nothing. No client is built then.
//
// ONE LAZY CLIENT PER API KEY: built on the first send, rebuilt only if the key changes. resendClientBuilder exists so a
// test can hand in a stub; the server passes none and gets the real Resend constructor.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const path = require('path');

const REFUSALS_FILE_PATH = path.join(__dirname, 'email-sender-refusals.json');
const REQUIRED_SETTING_NAME_LIST = ['resendApiKey', 'sendingDomain', 'fromAddress', 'fromName'];
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const { refusalByCase } = require(REFUSALS_FILE_PATH);
['emailSenderNotConfigured', 'emailSettingMissing', 'fromAddressNotOnSendingDomain', 'redirectAddressNotValid', 'recipientMissing', 'messageIncomplete', 'providerRefused', 'providerUnreachable', 'providerAnswerEmpty'].forEach((caseName) => {
	if (!refusalByCase || !refusalByCase[caseName] || !refusalByCase[caseName].refusalName || !refusalByCase[caseName].reason) {
		throw new Error(`[${moduleName}] ${REFUSALS_FILE_PATH}: refusalByCase lacks a complete { refusalName, reason } for ${caseName}`);
	}
});

// 'refusalName: reason', the form every pipeline here passes as its error text
// a function replacer, not qtTemplateReplace: a provider message containing $& must not be read as a replacement pattern
const refusalTextOf = (caseName, detailText = '') => `${refusalByCase[caseName].refusalName}: ${refusalByCase[caseName].reason.replace(/<!detailText!>/g, () => detailText)}`;

// the lennypens normalizeList: an array, a comma list, or the object qtools-config-file-processor makes of name.0= lines
const listFromConfig = (rawList) => {
	if (rawList === undefined || rawList === null || rawList === '') {
		return [];
	}
	if (Array.isArray(rawList)) {
		return rawList.map((listItem) => String(listItem).trim()).filter(Boolean);
	}
	if (typeof rawList === 'string') {
		return rawList.split(',').map((listItem) => listItem.trim()).filter(Boolean);
	}
	if (typeof rawList === 'object') {
		return Object.keys(rawList)
			.filter((indexText) => /^\d+$/.test(indexText))
			.sort((firstIndexText, secondIndexText) => Number(firstIndexText) - Number(secondIndexText))
			.map((indexText) => String(rawList[indexText]).trim())
			.filter(Boolean);
	}
	return [String(rawList)];
};

// the settings problem, by name, or '' when the section is usable
const settingsRefusalOf = (emailSenderSettings) => {
	if (!emailSenderSettings || typeof emailSenderSettings !== 'object' || !Object.keys(emailSenderSettings).length) {
		return refusalTextOf('emailSenderNotConfigured');
	}
	const missingNameList = REQUIRED_SETTING_NAME_LIST.filter((settingName) => !String(emailSenderSettings[settingName] || '').trim());
	if (missingNameList.length) {
		return refusalTextOf('emailSettingMissing', missingNameList.join(', '));
	}
	const fromAddressText = String(emailSenderSettings.fromAddress).trim().toLowerCase();
	const sendingDomainText = String(emailSenderSettings.sendingDomain).trim().toLowerCase();
	if (!EMAIL_ADDRESS_PATTERN.test(fromAddressText) || fromAddressText.split('@')[1] !== sendingDomainText) {
		return refusalTextOf('fromAddressNotOnSendingDomain', `fromAddress's domain is ${fromAddressText.split('@')[1] || 'absent'}, sendingDomain is ${sendingDomainText}`);
	}
	const redirectText = String(emailSenderSettings.redirectAllEmailTo || '').trim();
	if (redirectText && !EMAIL_ADDRESS_PATTERN.test(redirectText)) {
		return refusalTextOf('redirectAddressNotValid');
	}
	return '';
};

const realResendClientBuilder = (apiKeyText) => {
	const { Resend } = require('resend');
	return new Resend(apiKeyText);
};

const emailSenderOf = ({ emailSenderSettings, resendClientBuilder = realResendClientBuilder } = {}) => {
	const configRefusal = settingsRefusalOf(emailSenderSettings);
	const { resendApiKey, fromAddress, fromName, redirectAllEmailTo } = emailSenderSettings || {};
	const configuredBccList = configRefusal ? [] : listFromConfig(emailSenderSettings.bccList);
	const redirectAddress = String(redirectAllEmailTo || '').trim();
	const fromText = configRefusal ? '' : `${String(fromName).trim()} <${String(fromAddress).trim()}>`;

	let resendClient = undefined;
	let resendClientApiKeyText = '';
	const resendClientOf = (apiKeyText) => {
		if (!resendClient || resendClientApiKeyText !== apiKeyText) {
			resendClient = resendClientBuilder(apiKeyText);
			resendClientApiKeyText = apiKeyText;
		}
		return resendClient;
	};

	const sendEmail = ({ toList, ccList, bccList, subject, text, html } = {}, callback) => {
		if (typeof callback !== 'function') {
			throw new Error(`[${moduleName}] sendEmail requires a callback`);
		}
		if (configRefusal) {
			callback(configRefusal, {});
			return;
		}
		const intendedToList = listFromConfig(toList);
		if (!intendedToList.length) {
			callback(refusalTextOf('recipientMissing'), {});
			return;
		}
		if (!subject || (!text && !html)) {
			callback(refusalTextOf('messageIncomplete'), {});
			return;
		}
		const intendedCcList = listFromConfig(ccList);
		const intendedBccList = [...listFromConfig(bccList), ...configuredBccList];

		// redirect: the one configured address receives the message INSTEAD of everyone, cc and bcc included; the subject
		// says who it was for, so a tester can see what a real send would have done
		const sendParameters = redirectAddress
			? { from: fromText, to: [redirectAddress], subject: `[redirected; for ${intendedToList.join(', ')}] ${subject}` }
			: { from: fromText, to: intendedToList, subject, ...(intendedCcList.length ? { cc: intendedCcList } : {}), ...(intendedBccList.length ? { bcc: intendedBccList } : {}) };
		if (text) {
			sendParameters.text = text;
		}
		if (html) {
			sendParameters.html = html;
		}

		// THE TWO SHAPES, both converted here (see the header)
		resendClientOf(String(resendApiKey)).emails.send(sendParameters).then(
			(sendResult) => {
				const resolvedError = sendResult && sendResult.error;
				if (resolvedError) {
					callback(refusalTextOf('providerRefused', `${resolvedError.message || JSON.stringify(resolvedError)}${resolvedError.name ? ` (${resolvedError.name})` : ''}`), {});
					return;
				}
				const messageId = sendResult && sendResult.data && sendResult.data.id ? String(sendResult.data.id) : '';
				if (!messageId) {
					callback(refusalTextOf('providerAnswerEmpty'), {});
					return;
				}
				callback('', { messageId, deliveredToList: sendParameters.to });
			},
			(rejectionError) => callback(refusalTextOf('providerUnreachable', rejectionError && rejectionError.message ? rejectionError.message : String(rejectionError)), {}),
		);
	};

	return { configRefusal, sendEmail, fromAddress: configRefusal ? '' : String(fromAddress).trim() };
};

module.exports = { emailSenderOf, listFromConfig };
