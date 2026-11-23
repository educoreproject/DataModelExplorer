#!/usr/bin/env node
// accountMailOutcome.test.mjs — WORKORDER-accountMailFailureAndApprovalNotice-112326 M3, M4: how the account pages read
// the server's answers (components/accountMailOutcome.js, used by stores/accountStore.js).
//
//   O1 the reset/resend refusal accountMailNotSent is the not-sent case; every other refusal name, and none, is not
//   O2 a registration reply with mailOutcome accountMailNotSent is the not-sent case; a plain reply is not
//   O3 a reply flagged isAwaitingApproval or isApprovalAfterConfirmation is an approval message; others are not
//
//   node html/tests/accountApproval/accountMailOutcome.test.mjs

import { ACCOUNT_MAIL_NOT_SENT_NAME, isMailNotSentRefusal, isMailNotSentReply, isApprovalReply } from '../../components/accountMailOutcome.js';

let passCount = 0;
let failCount = 0;
const check = (checkName, condition) => {
	if (condition) { passCount++; } else { failCount++; }
	console.log(`${condition ? 'PASS' : 'FAIL'} ${checkName}`);
};

check('O1 the name is the server\'s, accountMailNotSent', ACCOUNT_MAIL_NOT_SENT_NAME === 'accountMailNotSent');
check('O1 accountMailNotSent is the not-sent refusal', isMailNotSentRefusal('accountMailNotSent'));
check('O1 tooManyRequests, an empty name and none are not', !isMailNotSentRefusal('tooManyRequests') && !isMailNotSentRefusal('') && !isMailNotSentRefusal(undefined));
check('O2 a reply with mailOutcome accountMailNotSent is not-sent', isMailNotSentReply({ message: 'x', mailOutcome: 'accountMailNotSent' }));
check('O2 a plain reply, an empty outcome and no reply are not', !isMailNotSentReply({ message: 'x' }) && !isMailNotSentReply({ message: 'x', mailOutcome: '' }) && !isMailNotSentReply(undefined));
check('O3 isAwaitingApproval and isApprovalAfterConfirmation are approval messages', isApprovalReply({ isAwaitingApproval: true }) && isApprovalReply({ isApprovalAfterConfirmation: true }));
check('O3 a plain reply, a "true" string and no reply are not', !isApprovalReply({ message: 'x' }) && !isApprovalReply({ isAwaitingApproval: 'true' }) && !isApprovalReply(undefined));

console.log(`\naccountMailOutcome: ${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
