'use strict';
// account-mail-alerter.test.js — gate for WORKORDER-accountMailFailureAndApprovalNotice-112326 M6 d: lib/account-mail-
// alerter.js, the rate-limited ACCOUNT_MAIL_ALERT line a transport to tqii's phone will key on.
//
//   A1 the first failure writes exactly: ACCOUNT_MAIL_ALERT mail=<m> account=<a> failure=<f> heldSinceLast=0
//   A2 failures inside the interval are held (counted, logged WITHOUT the marker); the next alert after the interval
//      carries heldSinceLast=<count>, and the count starts again
//   A3 fields are plain ASCII [A-Za-z0-9_.@-]: anything else (spaces, quotes, a newline, non-ASCII) becomes _
//   A4 a bad interval or a missing writer throws by name
//
// Run: node server/test/account-mail-alerter.test.js

const { accountMailAlerterOf, ALERT_MARKER_TEXT } = require('../lib/account-mail-alerter');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const alertLineList = [];
const heldLineList = [];
const alerter = accountMailAlerterOf({ minimumIntervalMilliseconds: 150, alertLineWriter: (lineText) => alertLineList.push(lineText), heldLineWriter: (lineText) => heldLineList.push(lineText) });

alerter.alertMailFailure({ mailName: 'passwordReset', accountName: 'alice', failureName: 'providerUnreachable' });
check('A1 the first failure writes the alert line exactly', JSON.stringify(alertLineList) === JSON.stringify(['ACCOUNT_MAIL_ALERT mail=passwordReset account=alice failure=providerUnreachable heldSinceLast=0']), JSON.stringify(alertLineList));
alerter.alertMailFailure({ mailName: 'confirmEmail', accountName: 'bob', failureName: 'providerUnreachable' });
alerter.alertMailFailure({ mailName: 'confirmEmail', accountName: 'carol', failureName: 'providerRefused' });
check('A2 two failures inside the interval are held, not alerted', alertLineList.length === 1 && heldLineList.length === 2, `${alertLineList.length} ${heldLineList.length}`);
check('A2 a held line never carries the alert marker (a transport keying on it must not fire)', heldLineList.every((lineText) => !lineText.includes(ALERT_MARKER_TEXT)) && /2 held/.test(heldLineList[1]), JSON.stringify(heldLineList));

setTimeout(() => {
	alerter.alertMailFailure({ mailName: 'approvalRequest', accountName: "dave o'neil\nIMPORTANT", failureName: 'providerRefused' });
	check('A2 after the interval: one alert carrying heldSinceLast=2', alertLineList.length === 2 && / heldSinceLast=2$/.test(alertLineList[1]), JSON.stringify(alertLineList));
	check('A3 fields reduced to plain ASCII, one line', alertLineList[1] === 'ACCOUNT_MAIL_ALERT mail=approvalRequest account=dave_o_neil_IMPORTANT failure=providerRefused heldSinceLast=2' && /^[\x20-\x7e]+$/.test(alertLineList[1]), alertLineList[1]);
	setTimeout(() => {
		alerter.alertMailFailure({ mailName: 'passwordReset', accountName: 'zoë', failureName: undefined });
		check('A2 the held count starts again; A3 non-ASCII and an absent field', alertLineList[2] === 'ACCOUNT_MAIL_ALERT mail=passwordReset account=zo_ failure=unnamed heldSinceLast=0', alertLineList[2]);
		const throwsOf = (alerterArguments) => {
			try {
				accountMailAlerterOf(alerterArguments);
				return false;
			} catch (alerterError) {
				return /accountMailAlerterOf/.test(alerterError.message);
			}
		};
		check('A4 a bad interval or a missing writer throws by name', throwsOf({ minimumIntervalMilliseconds: 'soon', alertLineWriter: () => {}, heldLineWriter: () => {} }) && throwsOf({ minimumIntervalMilliseconds: 0, heldLineWriter: () => {} }));
		const failedCount = resultList.filter((passed) => !passed).length;
		console.log(`account-mail-alerter: ${resultList.length - failedCount} passed, ${failedCount} failed`);
		process.exit(failedCount ? 1 : 0);
	}, 200);
}, 200);
