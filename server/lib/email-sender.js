#!/usr/bin/env node
'use strict';

// email-sender.js — THE ONE PLACE THIS SERVER TALKS TO A MAIL PROVIDER (Resend, ruling R2 of
// PLAN-userRegistrationReset-112026). Ported from justkidding's data-model/lib/email-sender.js, itself modelled on
// lennypens' server/lib/emailSender.js; attachments dropped (nothing here sends one).
//
//   emailSenderOf({ emailSenderSettings, resendClientBuilder }) -> { configRefusal, sendEmail, fromAddress }
//   sendEmail({ toList, ccList, bccList, subject, text, html }, callback(errText, { messageId, deliveredToList, attemptCount }))
//   listFromConfig(rawList)  -> the INI's dotted list (name.0=, name.1=) as an array, in index order, blanks dropped
//
// FAILURES, BY WHAT THEY MEAN (WORKORDER-accountMailFailureAndApprovalNotice-112326 M1, M2):
//   providerUnreachable  the provider never answered. The Resend SDK does NOT reject on a network failure: it RESOLVES
//                        { data: null, error: { name: 'application_error', statusCode: null } } (see
//                        email-sender-settings.json unreachableResolvedErrorShapeList); a rejection means the same.
//   providerRefused      the provider answered and said no (validation_error, domain not verified, rate limit, a 5xx
//                        with a body). Every other resolved error.
// Either way the caller gets ONE callback error; a caller that handled only rejection would read a refused send as sent.
// ONE RETRY, for providerUnreachable only, after [email-sender] unreachableRetryDelayMilliseconds (default in
// email-sender-settings.json). A refusal is never retried: it would be refused again. Both attempts carry the same
// Resend Idempotency-Key, so a first attempt that did reach Resend (its answer lost on the way back) is not mailed twice.
// Each unreachable attempt is logged here (xLog.status); the caller logs the final outcome.
//
// SETTINGS ([email-sender] in startApiServer.ini, every one from configuration, no literal domain or address here, R6):
//   resendApiKey, sendingDomain, fromAddress (must be ON sendingDomain), fromName, redirectAllEmailTo (blank, or one
//   address that replaces EVERY recipient, to, cc and bcc, so no real user receives a test's mail), bccList.N,
//   unreachableRetryDelayMilliseconds (optional; a whole number, else refused by name).
// A missing or inconsistent setting is a NAMED refusal held in configRefusal: data-model.js logs it at startup, and every
// sendEmail answers it, so the server still serves the DME while plainly sending nothing. No client is built then.
//
// ONE LAZY CLIENT PER API KEY: built on the first send, rebuilt only if the key changes. resendClientBuilder exists so a
// test can hand in a stub; the server passes none and gets the real Resend constructor.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const path = require('path');
const crypto = require('crypto');

const REFUSALS_FILE_PATH = path.join(__dirname, 'email-sender-refusals.json');
const SETTINGS_FILE_PATH = path.join(__dirname, 'email-sender-settings.json');
const WHOLE_NUMBER_PATTERN = /^\d+$/;
const REQUIRED_SETTING_NAME_LIST = ['resendApiKey', 'sendingDomain', 'fromAddress', 'fromName'];
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const { refusalByCase } = require(REFUSALS_FILE_PATH);
['emailSenderNotConfigured', 'emailSettingMissing', 'emailSettingNotValid', 'fromAddressNotOnSendingDomain', 'redirectAddressNotValid', 'recipientMissing', 'messageIncomplete', 'providerRefused', 'providerUnreachable', 'providerAnswerEmpty'].forEach((caseName) => {
	if (!refusalByCase || !refusalByCase[caseName] || !refusalByCase[caseName].refusalName || !refusalByCase[caseName].reason) {
		throw new Error(`[${moduleName}] ${REFUSALS_FILE_PATH}: refusalByCase lacks a complete { refusalName, reason } for ${caseName}`);
	}
});

const { settingDefaultByName, unreachableResolvedErrorShapeList } = require(SETTINGS_FILE_PATH);
if (!settingDefaultByName || !WHOLE_NUMBER_PATTERN.test(String(settingDefaultByName.unreachableRetryDelayMilliseconds))) {
	throw new Error(`[${moduleName}] ${SETTINGS_FILE_PATH}: settingDefaultByName.unreachableRetryDelayMilliseconds must be a whole number of milliseconds`);
}
if (!Array.isArray(unreachableResolvedErrorShapeList) || !unreachableResolvedErrorShapeList.length || !unreachableResolvedErrorShapeList.every((errorShape) => errorShape && typeof errorShape === 'object' && Object.keys(errorShape).length)) {
	throw new Error(`[${moduleName}] ${SETTINGS_FILE_PATH}: unreachableResolvedErrorShapeList must be a non-empty list of non-empty objects`);
}

// M1: a resolved error is the provider never reached when it matches a listed shape, every named property equal
const isUnreachableResolvedError = (resolvedError) => unreachableResolvedErrorShapeList.some((errorShape) => Object.keys(errorShape).every((propertyName) => resolvedError[propertyName] === errorShape[propertyName]));

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
	const retryDelayText = emailSenderSettings.unreachableRetryDelayMilliseconds;
	if (retryDelayText !== undefined && !WHOLE_NUMBER_PATTERN.test(String(retryDelayText).trim())) {
		return refusalTextOf('emailSettingNotValid', `unreachableRetryDelayMilliseconds must be a whole number of milliseconds (got '${retryDelayText}')`);
	}
	return '';
};

// M2: the configured wait before the one retry, or the settings file's default when the ini leaves it out
const retryDelayMillisecondsOf = (emailSenderSettings) =>
	emailSenderSettings.unreachableRetryDelayMilliseconds === undefined ? Number(settingDefaultByName.unreachableRetryDelayMilliseconds) : Number(String(emailSenderSettings.unreachableRetryDelayMilliseconds).trim());

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
	const retryDelayMilliseconds = configRefusal ? 0 : retryDelayMillisecondsOf(emailSenderSettings);

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

		// every failure becomes one of the named cases (see the header); the same idempotency key on both attempts
		const idempotencyKeyText = crypto.randomUUID();
		const { xLog } = process.global;
		const attemptSend = (attemptNumber) => {
			const unreachableOf = (detailText) => {
				if (attemptNumber > 1) {
					callback(refusalTextOf('providerUnreachable', `${detailText} (attempt ${attemptNumber} of 2; the first was unreachable too)`), {});
					return;
				}
				xLog.status(`[${moduleName}] providerUnreachable on attempt 1 of 2 (${detailText}); retrying in ${retryDelayMilliseconds} ms`);
				setTimeout(() => attemptSend(attemptNumber + 1), retryDelayMilliseconds);
			};
			resendClientOf(String(resendApiKey))
				.emails.send(sendParameters, { idempotencyKey: idempotencyKeyText })
				.then(
					(sendResult) => {
						const resolvedError = sendResult && sendResult.error;
						const resolvedErrorText = resolvedError ? `${resolvedError.message || JSON.stringify(resolvedError)}${resolvedError.name ? ` (${resolvedError.name})` : ''}` : '';
						if (resolvedError && isUnreachableResolvedError(resolvedError)) {
							unreachableOf(resolvedErrorText);
							return;
						}
						if (resolvedError) {
							callback(refusalTextOf('providerRefused', resolvedErrorText), {});
							return;
						}
						const messageId = sendResult && sendResult.data && sendResult.data.id ? String(sendResult.data.id) : '';
						if (!messageId) {
							callback(refusalTextOf('providerAnswerEmpty'), {});
							return;
						}
						if (attemptNumber > 1) {
							xLog.status(`[${moduleName}] sent on attempt ${attemptNumber} of 2 (message ${messageId})`);
						}
						callback('', { messageId, deliveredToList: sendParameters.to, attemptCount: attemptNumber });
					},
					(rejectionError) => unreachableOf(rejectionError && rejectionError.message ? rejectionError.message : String(rejectionError)),
				);
		};
		attemptSend(1);
	};

	return { configRefusal, sendEmail, fromAddress: configRefusal ? '' : String(fromAddress).trim() };
};

module.exports = { emailSenderOf, listFromConfig };
