'use strict';

// accountFlowHarness.js — boots the REAL user-account server (userAccountHarness.js) with the registration and reset
// access points and endpoints of WORKORDER-userRegistrationReset-112026 added, on a scratch database, with the startup
// migrations run (oauth-schema-init for the users security columns, user-account-schema-migration for userTokens). Mail
// never leaves the process: the email sender is a stub that records every message in capturedMailList and answers
// success (or the refusal the test sets in mailRefusalText). Every xLog.status and xLog.error line is kept in logList,
// so a gate can check that a case was logged by name.
//
//   bootAccountFlowServer({ registrationSettingOverrideByName, seedUserList, accessPointNameList, endpointFileNameList }, callback(errText, harness))
//   harness: { baseUrl, capturedMailList, logList, setMailRefusal(text), sqlDb, dataMapping, userTable, seededUserList, tokenSecret, close }
//   tokenOfMail(mailMessage) -> the token in the mail's link
//   httpGet({ baseUrl, routePath, authtoken }, callback(errText, { statusCode, bodyText, bodyJson, authtoken }))

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { bootUserAccountServer } = require('./userAccountHarness');

const serverPath = path.join(__dirname, '..', '..');
const { registrationSettingsOf } = require(path.join(serverPath, 'lib', 'user-registration-settings'));

const RESET_ACCESS_POINT_NAME_LIST = Object.freeze(['password-reset-request', 'password-reset-complete']);
const RESET_ENDPOINT_FILE_NAME_LIST = Object.freeze(['request-password-reset.js', 'complete-password-reset.js']);

const BASE_REGISTRATION_SETTINGS = Object.freeze({
	selfRegistrationEnabled: 'true',
	requireEmailConfirmation: 'true',
	newAccountRole: 'user',
	confirmationLinkLifetimeMinutes: '1440',
	resetLinkLifetimeMinutes: '60',
	publicSiteUrl: 'https://site.example.org',
	newAccountNoticeList: { 0: 'notice-one@example.org', 1: 'notice-two@example.org' },
	identifierRequestLimit: '5',
	identifierWindowMinutes: '15',
	addressRequestLimit: '1000',
	addressWindowMinutes: '60',
});

const bootAccountFlowServer = ({ registrationSettingOverrideByName = {}, seedUserList = [], accessPointNameList, endpointFileNameList }, callback) => {
	const capturedMailList = [];
	const logList = [];
	const mailState = { refusalText: '' };
	const emailSender = {
		configRefusal: '',
		fromAddress: 'noreply@example.org',
		sendEmail: (message, sendCallback) => {
			if (mailState.refusalText) {
				sendCallback(mailState.refusalText, {});
				return;
			}
			capturedMailList.push(message);
			sendCallback('', { messageId: `stub-${capturedMailList.length}`, deliveredToList: message.toList });
		},
	};
	const userRegistrationSettings = registrationSettingsOf({ ...BASE_REGISTRATION_SETTINGS, ...registrationSettingOverrideByName });
	const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'accountFlow-'));
	bootUserAccountServer(
		{
			serverPath,
			scratchDirPath,
			seedUserList,
			extraAccessPointNameList: accessPointNameList,
			extraEndpointFileNameList: endpointFileNameList,
			extraPassThroughByName: { emailSender, userRegistrationSettings },
		},
		(bootError, harness) => {
			if (bootError) {
				callback(bootError);
				return;
			}
			const { xLog } = process.global;
			xLog.status = (logText) => logList.push(String(logText));
			xLog.error = (logText) => logList.push(`ERROR ${logText}`);
			require(path.join(serverPath, 'lib', 'oauth-schema-init'))({ sqlDb: harness.sqlDb })((oauthError) => {
				if (oauthError) {
					callback(`harness: oauth-schema-init: ${oauthError}`);
					return;
				}
				// the OAuth adapter materializes oauthAdapterStore's columns at init, as oauth-server does on a real server, so
				// these gates exercise revokeSessionsOf's grant cleanup (the oauth-server-off shape is gated separately, in
				// account-disabled-and-revocation.test.js)
				require(path.join(serverPath, 'lib', 'oauth-adapter'))({ sqlDb: harness.sqlDb })((adapterError) => {
					if (adapterError) {
						callback(`harness: oauth-adapter: ${adapterError}`);
						return;
					}
					require(path.join(serverPath, 'lib', 'user-account-schema-migration'))({ sqlDb: harness.sqlDb, dataMapping: harness.dataMapping })((migrationError) => {
						if (migrationError) {
							callback(`harness: user-account-schema-migration: ${migrationError}`);
							return;
						}
						callback('', { ...harness, capturedMailList, logList, userRegistrationSettings, setMailRefusal: (refusalText) => { mailState.refusalText = refusalText; } });
					});
				});
			});
		},
	);
};

const tokenOfMail = (mailMessage) => {
	const tokenMatch = String((mailMessage && mailMessage.text) || '').match(/[?&]token=([A-Za-z0-9_-]+)/);
	return tokenMatch ? tokenMatch[1] : '';
};

const httpGet = ({ baseUrl, routePath, authtoken }, callback) => {
	const requestUrl = new URL(routePath, baseUrl);
	http
		.get({ hostname: requestUrl.hostname, port: requestUrl.port, path: `${requestUrl.pathname}${requestUrl.search}`, headers: authtoken ? { Authorization: `Bearer ${authtoken}` } : {} }, (httpResponse) => {
			const chunkList = [];
			httpResponse.on('data', (chunk) => chunkList.push(chunk));
			httpResponse.on('end', () => {
				const responseText = Buffer.concat(chunkList).toString('utf8');
				callback('', { statusCode: httpResponse.statusCode, bodyText: responseText, bodyJson: /^\s*[[{]/.test(responseText) ? JSON.parse(responseText) : null, authtoken: httpResponse.headers.authtoken });
			});
		})
		.on('error', (requestError) => callback(`httpGet ${routePath}: ${requestError.message}`));
};

module.exports = { bootAccountFlowServer, tokenOfMail, httpGet, BASE_REGISTRATION_SETTINGS, RESET_ACCESS_POINT_NAME_LIST, RESET_ENDPOINT_FILE_NAME_LIST };
