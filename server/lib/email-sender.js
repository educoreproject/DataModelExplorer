#!/usr/bin/env node
'use strict';

// email-sender.js — THE ONE PLACE THIS SERVER TALKS TO A MAIL PROVIDER (Resend, ruling R2 of
// PLAN-userRegistrationReset-112026). Ported from justkidding's data-model/lib/email-sender.js, itself modelled on
// lennypens' server/lib/emailSender.js; attachments dropped (nothing here sends one).
//
//   emailSenderOf({ emailSenderSettings, failureAlerter, resendClientBuilder }) -> { configRefusal, sendEmail, alertFailure, fromAddress }
//   sendEmail({ toList, ccList, bccList, subject, text, html, alertLabel: { mailName, accountName } },
//             callback(errText, { messageId, deliveredToList, attemptCount, failureName }))
//   isTransientMailFailure(failureName)       -> true when the person should simply try again in a few minutes
//   applyConnectAttemptTimeout(emailSenderSettings) -> { connectRefusal, appliedMilliseconds } (process-wide and for every
//       Node process started from it, lib/outgoing-connect-window.js; data-model.js, once)
//   settingOf(emailSenderSettings, settingName) -> a timing setting: the ini's value, or the settings file's default
//   listFromConfig(rawList)  -> the INI's dotted list (name.0=, name.1=) as an array, in index order, blanks dropped
//
// FAILURES, BY WHAT THEY MEAN (WORKORDER-accountMailFailureAndApprovalNotice-112326 M1, M6). failureName in the reply:
//   providerUnreachable  the provider never answered. The Resend SDK does NOT reject on a network failure or an abort: it
//                        RESOLVES { data: null, error: { name: 'application_error', statusCode: null } } (see
//                        email-sender-settings.json unreachableResolvedErrorShapeList); a rejection means the same.
//   providerUnavailable  the provider answered busy or failing (429, 5xx: retryableStatusCodeList / Minimum).
//   providerRefused      the provider answered no (validation_error, unverified domain, ...). Never retried.
//   (and the settings and message refusals below, never sent at all)
// Either way the caller gets ONE callback error; a caller that handled only rejection would read a refused send as sent.
//
// TRIES (M6 b): the first try plus one retry per retryDelayMillisecondsList entry, waiting that long first, for the two
// transient failures only, all inside sendBudgetMilliseconds; each attempt is abandoned after attemptTimeoutMilliseconds
// (or what is left of the budget). EVERY attempt carries the same Resend Idempotency-Key (M6 c), so an attempt that
// reached Resend but lost its answer cannot be delivered twice by the next. Each failed attempt is logged here
// (xLog.status); the caller logs the final outcome.
//
// ALERT (M6 d): a message that fails for good is handed to failureAlerter({ mailName, accountName, failureName }) (lib/
// account-mail-alerter.js, rate-limited), named by the message's alertLabel. Every send must carry an alertLabel.
// alertFailure({ mailName, accountName, failureName }) hands the SAME alerter a failure that happened before any send
// (WORKORDER-accountMailLooseEnds-112326 E4: a confirmation link that could not be issued), so it shares the one line
// format and the one rate limit; each of the three names is required (it throws by name otherwise).
//
// SETTINGS ([email-sender] in startApiServer.ini, every one from configuration, no literal domain or address here, R6):
//   resendApiKey, sendingDomain, fromAddress (must be ON sendingDomain), fromName, redirectAllEmailTo (blank, or one
//   address that replaces EVERY recipient, to, cc and bcc, so no real user receives a test's mail), bccList.N, and the
//   optional timings of email-sender-settings.json settingDefaultByName (retryDelayMillisecondsList.N=, ...).
// A missing or inconsistent setting is a NAMED refusal held in configRefusal: data-model.js logs it at startup, and every
// sendEmail answers it, so the server still serves the DME while plainly sending nothing. No client is built then.
//
// ONE LAZY CLIENT PER API KEY: built on the first send, rebuilt only if the key changes. resendClientBuilder exists so a
// test can hand in a stub; the server passes none and gets the real Resend constructor.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { applyOutgoingConnectWindow } = require('./outgoing-connect-window');

const REFUSALS_FILE_PATH = path.join(__dirname, 'email-sender-refusals.json');
const SETTINGS_FILE_PATH = path.join(__dirname, 'email-sender-settings.json');
const WHOLE_NUMBER_PATTERN = /^\d+$/;
const REQUIRED_SETTING_NAME_LIST = ['resendApiKey', 'sendingDomain', 'fromAddress', 'fromName'];
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const { refusalByCase } = require(REFUSALS_FILE_PATH);
['emailSenderNotConfigured', 'emailSettingMissing', 'emailSettingNotValid', 'fromAddressNotOnSendingDomain', 'redirectAddressNotValid', 'recipientMissing', 'messageIncomplete', 'providerRefused', 'providerUnavailable', 'providerUnreachable', 'providerAnswerEmpty'].forEach((caseName) => {
	if (!refusalByCase || !refusalByCase[caseName] || !refusalByCase[caseName].refusalName || !refusalByCase[caseName].reason) {
		throw new Error(`[${moduleName}] ${REFUSALS_FILE_PATH}: refusalByCase lacks a complete { refusalName, reason } for ${caseName}`);
	}
});

const { settingDefaultByName, unreachableResolvedErrorShapeList, retryableStatusCodeList, retryableStatusCodeMinimum, transientFailureNameList } = require(SETTINGS_FILE_PATH);
// the timing settings, each a whole number (retryDelayMillisecondsList a list of them)
const TIMING_SETTING_NAME_LIST = Object.freeze(['retryDelayMillisecondsList', 'sendBudgetMilliseconds', 'attemptTimeoutMilliseconds', 'connectAttemptTimeoutMilliseconds', 'failureAlertIntervalMinutes']);
const isWholeNumberList = (candidateList) => Array.isArray(candidateList) && candidateList.every((candidateText) => WHOLE_NUMBER_PATTERN.test(String(candidateText).trim()));
TIMING_SETTING_NAME_LIST.forEach((settingName) => {
	const defaultValue = (settingDefaultByName || {})[settingName];
	const isValid = settingName === 'retryDelayMillisecondsList' ? isWholeNumberList(defaultValue) : WHOLE_NUMBER_PATTERN.test(String(defaultValue));
	if (!isValid) {
		throw new Error(`[${moduleName}] ${SETTINGS_FILE_PATH}: settingDefaultByName.${settingName} must be a whole number${settingName === 'retryDelayMillisecondsList' ? ' list' : ''}`);
	}
});
if (!Array.isArray(unreachableResolvedErrorShapeList) || !unreachableResolvedErrorShapeList.length || !unreachableResolvedErrorShapeList.every((errorShape) => errorShape && typeof errorShape === 'object' && Object.keys(errorShape).length)) {
	throw new Error(`[${moduleName}] ${SETTINGS_FILE_PATH}: unreachableResolvedErrorShapeList must be a non-empty list of non-empty objects`);
}
if (!Array.isArray(retryableStatusCodeList) || !retryableStatusCodeList.every(Number.isInteger) || !Number.isInteger(retryableStatusCodeMinimum)) {
	throw new Error(`[${moduleName}] ${SETTINGS_FILE_PATH}: retryableStatusCodeList must be whole numbers and retryableStatusCodeMinimum a whole number`);
}
if (!Array.isArray(transientFailureNameList) || !transientFailureNameList.every((failureName) => refusalByCase[failureName])) {
	throw new Error(`[${moduleName}] ${SETTINGS_FILE_PATH}: transientFailureNameList must name refusals of ${REFUSALS_FILE_PATH}`);
}

// M1: a resolved error is the provider never reached when it matches a listed shape, every named property equal
const isUnreachableResolvedError = (resolvedError) => unreachableResolvedErrorShapeList.some((errorShape) => Object.keys(errorShape).every((propertyName) => resolvedError[propertyName] === errorShape[propertyName]));
// M6 b: a provider answer worth another try
const isRetryableStatusCode = (statusCode) => Number.isInteger(statusCode) && (retryableStatusCodeList.includes(statusCode) || statusCode >= retryableStatusCodeMinimum);
const isTransientMailFailure = (failureName) => transientFailureNameList.includes(failureName);

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

// a timing setting as given in the ini (undefined when left out), or the refusal of a value that is not a whole number
const timingSettingRefusalOf = (emailSenderSettings) => {
	const notValidNameList = TIMING_SETTING_NAME_LIST.filter((settingName) => {
		const givenValue = emailSenderSettings[settingName];
		if (givenValue === undefined) {
			return false;
		}
		return settingName === 'retryDelayMillisecondsList' ? !isWholeNumberList(listFromConfig(givenValue)) : !WHOLE_NUMBER_PATTERN.test(String(givenValue).trim());
	});
	return notValidNameList.length ? refusalTextOf('emailSettingNotValid', `${notValidNameList.join(', ')} must be a whole number (got ${notValidNameList.map((settingName) => `'${JSON.stringify(emailSenderSettings[settingName])}'`).join(', ')})`) : '';
};

// the setting the ini gives, else the settings file's default (only for the timings; validated by settingsRefusalOf)
const settingOf = (emailSenderSettings, settingName) => {
	if (!TIMING_SETTING_NAME_LIST.includes(settingName)) {
		throw new Error(`[${moduleName}] settingOf: '${settingName}' is not one of: ${TIMING_SETTING_NAME_LIST.join(', ')}`);
	}
	const givenValue = (emailSenderSettings || {})[settingName];
	if (settingName === 'retryDelayMillisecondsList') {
		return (givenValue === undefined ? settingDefaultByName[settingName] : listFromConfig(givenValue)).map(Number);
	}
	return Number(givenValue === undefined ? settingDefaultByName[settingName] : String(givenValue).trim());
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
	return timingSettingRefusalOf(emailSenderSettings);
};

// M5, M6 a: Node's per-address connect window, PROCESS-WIDE (it governs every outgoing connection of the server, which is
// why data-model.js calls this once, at start, and logs it). Node's 250 ms default lost demo's mail: see the DEVLOG.
// A value that is not a whole number is refused by name and NOT applied (Node's own window stays); the caller logs it.
// WORKORDER-accountMailLooseEnds-112326 E7: applied through lib/outgoing-connect-window.js, which also hands it to every
// Node process the server starts (askMilo and the rest), so the whole process tree uses the one window.
const applyConnectAttemptTimeout = (emailSenderSettings) => {
	const connectAttemptTimeoutMilliseconds = settingOf(emailSenderSettings, 'connectAttemptTimeoutMilliseconds');
	if (!Number.isInteger(connectAttemptTimeoutMilliseconds) || connectAttemptTimeoutMilliseconds < 10) {
		return { connectRefusal: refusalTextOf('emailSettingNotValid', `connectAttemptTimeoutMilliseconds must be a whole number of at least 10 (got '${(emailSenderSettings || {}).connectAttemptTimeoutMilliseconds}')`), appliedMilliseconds: net.getDefaultAutoSelectFamilyAttemptTimeout() };
	}
	return { connectRefusal: '', ...applyOutgoingConnectWindow(connectAttemptTimeoutMilliseconds) };
};

const realResendClientBuilder = (apiKeyText) => {
	const { Resend } = require('resend');
	return new Resend(apiKeyText);
};

const emailSenderOf = ({ emailSenderSettings, failureAlerter, resendClientBuilder = realResendClientBuilder } = {}) => {
	if (typeof failureAlerter !== 'function') {
		throw new Error(`[${moduleName}] emailSenderOf requires failureAlerter, a function (lib/account-mail-alerter.js; WORKORDER-accountMailFailureAndApprovalNotice-112326 M6 d)`);
	}
	const configRefusal = settingsRefusalOf(emailSenderSettings);
	const { resendApiKey, fromAddress, fromName, redirectAllEmailTo } = emailSenderSettings || {};
	const configuredBccList = configRefusal ? [] : listFromConfig(emailSenderSettings.bccList);
	const redirectAddress = String(redirectAllEmailTo || '').trim();
	const fromText = configRefusal ? '' : `${String(fromName).trim()} <${String(fromAddress).trim()}>`;
	const retryDelayMillisecondsList = configRefusal ? [] : settingOf(emailSenderSettings, 'retryDelayMillisecondsList');
	const sendBudgetMilliseconds = configRefusal ? 0 : settingOf(emailSenderSettings, 'sendBudgetMilliseconds');
	const attemptTimeoutMilliseconds = configRefusal ? 0 : settingOf(emailSenderSettings, 'attemptTimeoutMilliseconds');
	const attemptLimit = retryDelayMillisecondsList.length + 1;

	let resendClient = undefined;
	let resendClientApiKeyText = '';
	const resendClientOf = (apiKeyText) => {
		if (!resendClient || resendClientApiKeyText !== apiKeyText) {
			resendClient = resendClientBuilder(apiKeyText);
			resendClientApiKeyText = apiKeyText;
		}
		return resendClient;
	};

	const sendEmail = ({ toList, ccList, bccList, subject, text, html, alertLabel } = {}, callback) => {
		if (typeof callback !== 'function') {
			throw new Error(`[${moduleName}] sendEmail requires a callback`);
		}
		if (!alertLabel || !String(alertLabel.mailName || '').trim() || !String(alertLabel.accountName || '').trim()) {
			throw new Error(`[${moduleName}] sendEmail requires alertLabel { mailName, accountName }, so a failure can be alerted by name (M6 d)`);
		}
		// every final failure: the caller's callback, and the alert
		const failWith = (failureName, errText) => {
			failureAlerter({ mailName: alertLabel.mailName, accountName: alertLabel.accountName, failureName });
			callback(errText, { failureName });
		};
		if (configRefusal) {
			failWith(configRefusal.split(':')[0], configRefusal);
			return;
		}
		const intendedToList = listFromConfig(toList);
		if (!intendedToList.length) {
			failWith('recipientMissing', refusalTextOf('recipientMissing'));
			return;
		}
		if (!subject || (!text && !html)) {
			failWith('messageIncomplete', refusalTextOf('messageIncomplete'));
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

		// M6 c: one idempotency key for the message, on every attempt
		const idempotencyKeyText = crypto.randomUUID();
		const sendStartedAt = Date.now();
		const { xLog } = process.global;

		const attemptSend = (attemptNumber) => {
			const remainingMilliseconds = sendBudgetMilliseconds - (Date.now() - sendStartedAt);
			// a transient failure: try again if a retry remains and its wait fits the budget, else fail for good
			const transientFailureOf = (failureName, detailText) => {
				const retryDelayMilliseconds = retryDelayMillisecondsList[attemptNumber - 1];
				const spentMilliseconds = Date.now() - sendStartedAt;
				if (attemptNumber >= attemptLimit || spentMilliseconds + retryDelayMilliseconds >= sendBudgetMilliseconds) {
					failWith(failureName, refusalTextOf(failureName, `${detailText} (attempt ${attemptNumber} of ${attemptLimit}, ${spentMilliseconds} ms of the ${sendBudgetMilliseconds} ms budget spent)`));
					return;
				}
				xLog.status(`[${moduleName}] ${failureName} on attempt ${attemptNumber} of ${attemptLimit} (${detailText}); retrying in ${retryDelayMilliseconds} ms`);
				setTimeout(() => attemptSend(attemptNumber + 1), retryDelayMilliseconds);
			};
			// the attempt is abandoned at its own limit or at the end of the budget, whichever is first; the SDK resolves an
			// abandoned (aborted) request as the unreachable shape (resend 6.39.0 fetchRequest's outer catch)
			const attemptSignal = AbortSignal.timeout(Math.max(1, Math.min(attemptTimeoutMilliseconds, remainingMilliseconds)));
			resendClientOf(String(resendApiKey))
				.emails.send(sendParameters, { idempotencyKey: idempotencyKeyText, signal: attemptSignal })
				.then(
					(sendResult) => {
						const resolvedError = sendResult && sendResult.error;
						const resolvedErrorText = resolvedError ? `${resolvedError.message || JSON.stringify(resolvedError)}${resolvedError.name ? ` (${resolvedError.name}${resolvedError.statusCode ? ` ${resolvedError.statusCode}` : ''})` : ''}` : '';
						if (resolvedError && isUnreachableResolvedError(resolvedError)) {
							transientFailureOf('providerUnreachable', resolvedErrorText);
							return;
						}
						if (resolvedError && isRetryableStatusCode(resolvedError.statusCode)) {
							transientFailureOf('providerUnavailable', resolvedErrorText);
							return;
						}
						if (resolvedError) {
							failWith('providerRefused', refusalTextOf('providerRefused', resolvedErrorText));
							return;
						}
						const messageId = sendResult && sendResult.data && sendResult.data.id ? String(sendResult.data.id) : '';
						if (!messageId) {
							failWith('providerAnswerEmpty', refusalTextOf('providerAnswerEmpty'));
							return;
						}
						if (attemptNumber > 1) {
							xLog.status(`[${moduleName}] sent on attempt ${attemptNumber} of ${attemptLimit} (message ${messageId})`);
						}
						callback('', { messageId, deliveredToList: sendParameters.to, attemptCount: attemptNumber, failureName: '' });
					},
					(rejectionError) => transientFailureOf('providerUnreachable', rejectionError && rejectionError.message ? rejectionError.message : String(rejectionError)),
				);
		};
		attemptSend(1);
	};

	const alertFailure = ({ mailName, accountName, failureName } = {}) => {
		const absentNameList = Object.entries({ mailName, accountName, failureName }).filter(([, nameText]) => !String(nameText || '').trim()).map(([propertyName]) => propertyName);
		if (absentNameList.length) {
			throw new Error(`[${moduleName}] alertFailure requires ${absentNameList.join(', ')} (WORKORDER-accountMailLooseEnds-112326 E4)`);
		}
		failureAlerter({ mailName, accountName, failureName });
	};

	return { configRefusal, sendEmail, alertFailure, fromAddress: configRefusal ? '' : String(fromAddress).trim() };
};

module.exports = { emailSenderOf, listFromConfig, isTransientMailFailure, applyConnectAttemptTimeout, settingOf };
