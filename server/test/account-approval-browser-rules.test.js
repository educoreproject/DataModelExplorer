'use strict';
// account-approval-browser-rules.test.js — the server-suite (and so CI) gate for the browser side of
// WORKORDER-approvalLooseEnds-112126:
//
//   B1 (L1) html/tests/accountApproval/accountTimeText.test.mjs passes, run with TZ=America/Chicago so "local" is known
//   B2 (L4) the browser's approver role list (html/config/accountApprovalRules.json) is the server's
//      (lib/user-profile-rules.json approverRoleList): the browser only decides whether to ASK; the server still decides
//   B3 (L4) /admin asks for the pending list only behind isApprover, and shows the Pending approvals tab only to an approver
//
// Run: node server/test/account-approval-browser-rules.test.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const codePath = path.join(__dirname, '..', '..');

let passCount = 0;
let failCount = 0;
const check = (checkName, condition, detailText = '') => {
	if (condition) {
		passCount++;
	} else {
		failCount++;
	}
	console.log(`${condition ? 'PASS' : 'FAIL'} ${checkName}${condition || !detailText ? '' : `\n     ${detailText}`}`);
};

// B1
const timeTestResult = spawnSync(process.execPath, [path.join(codePath, 'html', 'tests', 'accountApproval', 'accountTimeText.test.mjs')], { encoding: 'utf8', env: { ...process.env, TZ: 'America/Chicago' } });
check('B1 accountTimeText.test.mjs passes (local time helper)', timeTestResult.status === 0, `${timeTestResult.stdout.split('\n').filter((lineText) => /^FAIL|passed/.test(lineText)).join(' / ')} ${timeTestResult.stderr.slice(0, 300)}`);

// B2
const serverApproverRoleList = JSON.parse(fs.readFileSync(path.join(codePath, 'server', 'lib', 'user-profile-rules.json'), 'utf8')).approverRoleList;
const browserApproverRoleList = JSON.parse(fs.readFileSync(path.join(codePath, 'html', 'config', 'accountApprovalRules.json'), 'utf8')).approverRoleList;
check('B2 the browser approver role list is the server one', Array.isArray(browserApproverRoleList) && JSON.stringify([...browserApproverRoleList].sort()) === JSON.stringify([...serverApproverRoleList].sort()), `browser ${JSON.stringify(browserApproverRoleList)} server ${JSON.stringify(serverApproverRoleList)}`);

// B3
const adminPageText = fs.readFileSync(path.join(codePath, 'html', 'pages', 'admin.vue'), 'utf8');
const loadCallList = adminPageText.match(/[^\n]*loadPendingList\(\)[^\n]*/g) || [];
check('B3 admin.vue reads the pending list only for an approver', loadCallList.length === 1 && /if \(isApprover\.value\)/.test(loadCallList[0]), JSON.stringify(loadCallList));
check('B3 the Pending approvals tab and tool are shown only to an approver', /v-if="isApprover"[\s\S]{0,200}selectTool\('pending-approvals'\)/.test(adminPageText) && /v-else-if="selectedTool === 'pending-approvals' && isApprover"/.test(adminPageText));

console.log(`\naccount-approval-browser-rules: ${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
