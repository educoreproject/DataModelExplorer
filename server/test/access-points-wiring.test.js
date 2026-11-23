'use strict';
// access-points-wiring.test.js — the REAL access-point loader (data-model/access-points-dot-d/access-points-dot-d.js),
// given what data-model.js gives it, must load the companion upload and compile access points. They refuse to load
// without companionMomentClock, and the loader (qtools-library-dot-d) then SKIPS a refusing module with only a log line,
// so a resource the loader forgets to pass makes endpoints vanish silently. That happened on this branch (0d2f7f9:
// companion uploads and compiles were gone from the real server while every harness test passed).
// Needs no database: the access points only record their resources at load. Run: node server/test/access-points-wiring.test.js

const fs = require('fs');
const path = require('path');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const skippedLogList = [];
const quietLog = (logText) => {
	if (/ignoring invalid file/.test(String(logText))) skippedLogList.push(String(logText));
};
process.global = {
	xLog: { status: quietLog, error: quietLog, verbose: quietLog, result: quietLog, debug: quietLog, color: {} },
	getConfig: () => ({}),
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {}, fileList: [] },
};
const realConsoleLog = console.log;
console.log = (...argumentList) => {
	quietLog(argumentList.join(' '));
	if (!/ignoring invalid file/.test(argumentList.join(' '))) realConsoleLog(...argumentList);
};

// the property list data-model.js selects for the loader, read from its source so the test follows the code
const dataModelSourceText = fs.readFileSync(path.join(__dirname, '..', 'data-model', 'data-model.js'), 'utf8');
const selectedPropertyList = JSON.parse(dataModelSourceText.match(/require\('\.\/access-points-dot-d'\)\(\s*args\.qtSelectProperties\((\[[^\]]*\])\)/)[1].replace(/'/g, '"'));
check('data-model.js hands the loader companionMomentClock', selectedPropertyList.includes('companionMomentClock'), selectedPropertyList.join(','));

const passedResourceByName = selectedPropertyList.reduce((soFar, propertyName) => ({ ...soFar, [propertyName]: { placeholderFor: propertyName } }), {});
passedResourceByName.companionMomentClock = require('../data-model/lib/companion-pages/companion-moment-clock').companionMomentClockOf();
passedResourceByName.dataMapping = new Proxy({}, { get: () => ({ getSql: () => '', map: (inData) => inData }) });
// the registration and reset access points refuse to load without the email sender (WORKORDER-userRegistrationReset-112026)
check('data-model.js hands the loader emailSender and userRegistrationSettings', selectedPropertyList.includes('emailSender') && selectedPropertyList.includes('userRegistrationSettings'), selectedPropertyList.join(','));
passedResourceByName.emailSender = require('../lib/email-sender').emailSenderOf({ emailSenderSettings: undefined, failureAlerter: () => {} });
passedResourceByName.userRegistrationSettings = require('../lib/user-registration-settings').registrationSettingsOf(undefined);

require('../data-model/access-points-dot-d/access-points-dot-d')(passedResourceByName, (loadError, accessPointsDotD) => {
	console.log = realConsoleLog;
	check('the loader ran', !loadError, loadError);
	['companion-source-upload', 'companion-compile-current', 'password-reset-request', 'password-reset-complete', 'user-registration-register', 'user-registration-confirm', 'user-registration-resend', 'user-registration-options'].forEach((accessPointName) => {
		check(`${accessPointName} is loaded (not skipped as an invalid file)`, accessPointsDotD && typeof accessPointsDotD[accessPointName] === 'function', skippedLogList.filter((logText) => logText.includes(accessPointName)).join(' | ').slice(0, 200));
	});
	const failedCount = resultList.filter((passed) => !passed).length;
	console.log(`access-points-wiring: ${resultList.length - failedCount} passed, ${failedCount} failed`);
	process.exit(failedCount ? 1 : 0);
});
