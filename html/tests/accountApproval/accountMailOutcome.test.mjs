#!/usr/bin/env node
// accountMailOutcome.test.mjs — WORKORDER-accountMailFailureAndApprovalNotice-112326 M3, M4, M6: how the account pages
// read the server's answers (components/accountMailOutcome.js, used by stores/accountStore.js).
//
//   O1 the four mail-failure refusals (server user-profile-rules.json mailFailureRefusalNameByFlow) are the not-sent case;
//      every other refusal name, and none, is not
//   O2 a reply flagged isAwaitingApproval or isApprovalAfterConfirmation is an approval message; others are not
//
//   node html/tests/accountApproval/accountMailOutcome.test.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIL_NOT_SENT_REFUSAL_NAME_LIST, isMailNotSentRefusal, isApprovalReply } from '../../components/accountMailOutcome.js';

const rulesFilePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server/lib/user-profile-rules.json');
const { mailFailureRefusalNameByFlow } = JSON.parse(readFileSync(rulesFilePath, 'utf8'));
const serverRefusalNameList = Object.values(mailFailureRefusalNameByFlow).flatMap((refusalNameByKind) => Object.values(refusalNameByKind));

let passCount = 0;
let failCount = 0;
const check = (checkName, condition) => {
	if (condition) { passCount++; } else { failCount++; }
	console.log(`${condition ? 'PASS' : 'FAIL'} ${checkName}`);
};

check('O1 the browser list is exactly the server\'s mail-failure refusals', JSON.stringify([...MAIL_NOT_SENT_REFUSAL_NAME_LIST].sort()) === JSON.stringify([...serverRefusalNameList].sort()));
check('O1 each of them is the not-sent case', serverRefusalNameList.every(isMailNotSentRefusal));
check('O1 tooManyRequests, an empty name and none are not', !isMailNotSentRefusal('tooManyRequests') && !isMailNotSentRefusal('') && !isMailNotSentRefusal(undefined));
check('O2 isAwaitingApproval and isApprovalAfterConfirmation are approval messages', isApprovalReply({ isAwaitingApproval: true }) && isApprovalReply({ isApprovalAfterConfirmation: true }));
check('O2 a plain reply, a "true" string and no reply are not', !isApprovalReply({ message: 'x' }) && !isApprovalReply({ isAwaitingApproval: 'true' }) && !isApprovalReply(undefined));

console.log(`\naccountMailOutcome: ${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
