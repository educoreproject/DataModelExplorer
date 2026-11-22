'use strict';
// role-split-parity.test.js — WORKORDER-raterAndAdminLooseEnds-112226 R2: the browser reads a role text exactly as the
// server's getValidator does, so a page never shows (or hides) an admin tool the server would refuse (or allow).
//
//   P1 for every role text below, the browser's hasRoleIn(roleText, 'adminRoleList') (html/components/accountAccessRules.js)
//      equals the server's getValidator(adminRoleList) (server/lib/access-token-header-tools.js) passing that role:
//      commas, spaces, tabs, mixed separators, case, lookalikes, absent roles, arrays
//   P2 the Mapping Survey's isRaterAdminRole (html/stores/raterStore.js) is that same rule, not a copy of its own
//   P3 html/components/AppSidebar.vue shows Admin only behind mayUseAnyAdminTool (R4), and no page or component of the
//      admin family keeps a private ['admin', 'super'] check
//
// The browser module is run in a child node (it is an ES module with a JSON import); the server module is required with
// stub globals, as role-exact-match.test.js does.
//
//   node server/test/role-split-parity.test.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const codePath = path.join(__dirname, '..', '..');
const accessRulesModulePath = path.join(codePath, 'html', 'components', 'accountAccessRules.js');
const adminAccessRules = JSON.parse(fs.readFileSync(path.join(codePath, 'html', 'config', 'adminAccessRules.json'), 'utf8'));

process.global = {
	xLog: { status: () => {}, error: () => {}, verbose: () => {} },
	getConfig: () => ({ secret: 'role-split-parity-test-secret', authsecondsexpirationseconds: 60 }),
};
const tokenTools = require(path.join(codePath, 'server', 'lib', 'access-token-header-tools.js'))({});

let passCount = 0;
let failCount = 0;
const check = (checkName, condition, detailText = '') => {
	if (condition) {
		passCount++;
	} else {
		failCount++;
	}
	console.log(`  ${condition ? 'PASS' : 'FAIL'}: ${checkName}${condition || !detailText ? '' : ` — ${detailText}`}`);
};

// role texts as a token can carry them; { absent: true } stands for a role that is not there at all (undefined)
const ROLE_CASE_LIST = [
	'admin', 'super', 'user', '', null, { absent: true },
	'user,admin', 'user, admin', 'user admin', 'user  ,  admin', 'user\tadmin', 'user\nsuper', ' admin ', ',admin,', 'admin,,user',
	'Admin', 'ADMIN', 'SUPER', 'user,Admin',
	'subadministrator', 'superuser', 'user,subadmin', 'admins', 'user;admin', 'user|admin',
	['user', 'admin'], ['user', 'subadmin'], ['user admin'], [' admin '], [],
];
const roleOfCase = (roleCase) => (roleCase && roleCase.absent ? undefined : roleCase);
const caseText = (roleCase) => (roleCase && roleCase.absent ? '(absent)' : JSON.stringify(roleCase));

const serverAllows = (roleText) => tokenTools.getValidator(adminAccessRules.adminRoleList)({ user: { username: 'someone', role: roleText } }) === false;

const browserProbe = spawnSync(process.execPath, ['--input-type=module', '-e', `
	import { hasRoleIn } from ${JSON.stringify(accessRulesModulePath)};
	const caseList = JSON.parse(process.env.ROLE_CASE_LIST_TEXT);
	const roleOf = (roleCase) => (roleCase && roleCase.absent ? undefined : roleCase);
	process.stdout.write(JSON.stringify(caseList.map((roleCase) => hasRoleIn(roleOf(roleCase), 'adminRoleList'))));
`], { encoding: 'utf8', env: { ...process.env, ROLE_CASE_LIST_TEXT: JSON.stringify(ROLE_CASE_LIST) } });
check('the browser module loads and answers in node', browserProbe.status === 0, browserProbe.stderr.slice(0, 300));
const browserAnswerList = browserProbe.status === 0 ? JSON.parse(browserProbe.stdout) : [];

console.log('P1 browser hasRoleIn(role, adminRoleList) == server getValidator(adminRoleList)');
ROLE_CASE_LIST.forEach((roleCase, casePosition) => {
	const serverAnswer = serverAllows(roleOfCase(roleCase));
	check(`P1 ${caseText(roleCase)}: server ${serverAnswer ? 'allows' : 'refuses'}; the browser must say the same`, browserAnswerList[casePosition] === serverAnswer, `browser ${browserAnswerList[casePosition]}`);
});
check('P1 the cases include both answers (the comparison is not vacuous)', ROLE_CASE_LIST.some((roleCase) => serverAllows(roleOfCase(roleCase))) && ROLE_CASE_LIST.some((roleCase) => !serverAllows(roleOfCase(roleCase))));

console.log('P2 the Mapping Survey admin check is the shared rule');
const raterStoreText = fs.readFileSync(path.join(codePath, 'html', 'stores', 'raterStore.js'), 'utf8');
check("P2 raterStore's isRaterAdminRole is hasRoleIn(roleText, 'adminRoleList')", /export const isRaterAdminRole = \(roleText\) => hasRoleIn\(roleText, 'adminRoleList'\);/.test(raterStoreText), (raterStoreText.match(/export const isRaterAdminRole[^\n]*/) || ['(not found)'])[0]);
check('P2 raterStore splits no role text itself', !/\.split\(/.test((raterStoreText.match(/export const isRaterAdminRole[^\n]*/) || [''])[0]));

console.log('P3 the Admin link');
const sidebarText = fs.readFileSync(path.join(codePath, 'html', 'components', 'AppSidebar.vue'), 'utf8');
check('P3 AppSidebar.vue decides Admin with mayUseAnyAdminTool on the signed-in role', /mayUseAnyAdminTool\(LoginStore\.loggedInUser\?\.role\)/.test(sidebarText) && /v-if="showAdminLink"[\s\S]{0,80}to="\/admin"/.test(sidebarText));
const privateAdminCheckFileList = ['components/AppSidebar.vue', 'components/generalNavSub.vue', 'components/tools/ceds-rater-admin.vue', 'pages/admin.vue']
	.filter((relativeFilePath) => /\['admin', 'super'\]\.includes/.test(fs.readFileSync(path.join(codePath, 'html', relativeFilePath), 'utf8')));
check("P3 no file of the admin family keeps a private ['admin', 'super'].includes check", !privateAdminCheckFileList.length, JSON.stringify(privateAdminCheckFileList));

console.log(`\nrole-split-parity: ${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
