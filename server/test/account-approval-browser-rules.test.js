'use strict';
// account-approval-browser-rules.test.js — the server-suite (and so CI) gate for the browser side of
// WORKORDER-approvalLooseEnds-112126:
//
//   B1 (L1, L6) html/tests/accountApproval/accountTimeText.test.mjs (TZ=America/Chicago, so "local" is known) and
//      accountAccessRules.test.mjs pass
//   B2 (L4) the browser's approver role list (html/config/adminAccessRules.json) is the server's
//      (lib/user-profile-rules.json approverRoleList): the browser only decides whether to ASK; the server still decides
//   B3 (L4, L6) /admin names an access rule for every tool, asks for the pending list only when mayUse('pending-approvals'),
//      and shows each tab and mounts each tool only behind mayUse (a refused tool is an alert, nothing mounted)
//   B4 (L6) the rules file's adminRoleList is exactly what every admin-only endpoint behind the tools allows, and (raterAndAdminLooseEnds
//      R2) the Mapping Survey's own admin checks read it rather than a list of their own
//   B5 (L7) the approval page asks for nothing (detail, pending list) unless the visitor is an approver
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
['accountTimeText.test.mjs', 'accountAccessRules.test.mjs'].forEach((testFileName) => {
	const browserTestResult = spawnSync(process.execPath, [path.join(codePath, 'html', 'tests', 'accountApproval', testFileName)], { encoding: 'utf8', env: { ...process.env, TZ: 'America/Chicago' } });
	check(`B1 ${testFileName} passes`, browserTestResult.status === 0, `${browserTestResult.stdout.split('\n').filter((lineText) => /^FAIL|passed/.test(lineText)).join(' / ')} ${browserTestResult.stderr.slice(0, 300)}`);
});

// B2
const browserRules = JSON.parse(fs.readFileSync(path.join(codePath, 'html', 'config', 'adminAccessRules.json'), 'utf8'));
const sortedTextOf = (roleList) => JSON.stringify([...(roleList || [])].sort());
const serverApproverRoleList = JSON.parse(fs.readFileSync(path.join(codePath, 'server', 'lib', 'user-profile-rules.json'), 'utf8')).approverRoleList;
check('B2 the browser approver role list is the server one', Array.isArray(browserRules.approverRoleList) && sortedTextOf(browserRules.approverRoleList) === sortedTextOf(serverApproverRoleList), `browser ${JSON.stringify(browserRules.approverRoleList)} server ${JSON.stringify(serverApproverRoleList)}`);

// B3
const adminPageText = fs.readFileSync(path.join(codePath, 'html', 'pages', 'admin.vue'), 'utf8');
const toolNameList = JSON.parse((adminPageText.match(/const TOOL_NAME_LIST = (\[[^\]]*\]);/) || [, '[]'])[1].replace(/'/g, '"'));
check('B3 every /admin tool has an access rule and every rule is a tool', toolNameList.length > 0 && sortedTextOf(toolNameList) === sortedTextOf(Object.keys(browserRules.roleListNameByToolName || {})), `${JSON.stringify(toolNameList)} vs ${JSON.stringify(Object.keys(browserRules.roleListNameByToolName || {}))}`);
const loadCallList = adminPageText.match(/[^\n]*loadPendingList\(\)[^\n]*/g) || [];
check('B3 admin.vue reads the pending list only when mayUse(\'pending-approvals\')', loadCallList.length === 1 && /if \(mayUse\('pending-approvals'\)\)/.test(loadCallList[0]), JSON.stringify(loadCallList));
const unguardedTabList = toolNameList.filter((toolName) => !new RegExp(`v-if="mayUse\\('${toolName}'\\)"[\\s\\S]{0,200}selectTool\\('${toolName}'\\)`).test(adminPageText));
check('B3 every tab is shown only behind mayUse', !unguardedTabList.length, JSON.stringify(unguardedTabList));
const notPermittedIndex = adminPageText.indexOf('v-else-if="!mayUse(selectedTool)"');
const firstToolIndex = Math.min(...['<add-edit-user', '<pending-approvals', '<manifest-editor', '<oauth-admin', '<ceds-rater-admin'].map((tagText) => adminPageText.indexOf(tagText)));
check('B3 the not-permitted alert comes before every tool component, so a refused tool is never mounted', notPermittedIndex > 0 && notPermittedIndex < firstToolIndex, `alert at ${notPermittedIndex}, first tool at ${firstToolIndex}`);

// B4
const endpointDirectoryPath = path.join(codePath, 'server', 'endpoints-dot-d', 'qtDotLib.d');
const adminEndpointFileList = fs.readdirSync(endpointDirectoryPath).filter((fileName) => /^(admin-|manifest-|oauth-admin-).*\.js$/.test(fileName));
const mismatchList = adminEndpointFileList
	.map((fileName) => {
		const endpointText = fs.readFileSync(path.join(endpointDirectoryPath, fileName), 'utf8');
		const validatorMatch = endpointText.match(/(?:getValidator|makeStrictValidator)\(\s*\[([^\]]*)\]/);
		const roleList = validatorMatch ? validatorMatch[1].match(/'([a-z]+)'/g).map((quotedRole) => quotedRole.replace(/'/g, '')) : null;
		return [fileName, roleList];
	})
	.filter(([, roleList]) => sortedTextOf(roleList) !== sortedTextOf(browserRules.adminRoleList));
check(`B4 adminRoleList is what all ${adminEndpointFileList.length} admin-only endpoints allow`, adminEndpointFileList.length >= 10 && !mismatchList.length, JSON.stringify(mismatchList));
const raterStoreText = fs.readFileSync(path.join(codePath, 'html', 'stores', 'raterStore.js'), 'utf8');
// raterAndAdminLooseEnds R2: the Mapping Survey keeps no list of its own; both its checks read adminRoleList
check('B4 the Mapping Survey admin checks (raterStore isRaterAdminRole, isAdmin) read adminRoleList and keep no list of their own', /export const isRaterAdminRole = \(roleText\) => hasRoleIn\(roleText, 'adminRoleList'\);/.test(raterStoreText) && /isAdmin: \(state\) => hasRoleIn\(state\.raterRole, 'adminRoleList'\),/.test(raterStoreText) && !/ADMIN_ROLE_LIST/.test(raterStoreText));

// B5
const approvalPageText = fs.readFileSync(path.join(codePath, 'html', 'pages', 'account-approval.vue'), 'utf8');
const scriptText = approvalPageText.split('</script>')[0];
const onMountedText = (scriptText.match(/onMounted\(\(\) => \{[\s\S]*?\n\t\}\);/) || [''])[0];
const loadSelectedText = (scriptText.match(/const loadSelected = async \(\) => \{[\s\S]*?\n\t\};/) || [''])[0];
check('B5 the approval page mounts with no request for a non-approver', /if \(!isApprover\.value\) \{\s*return;\s*\}[\s\S]*loadPendingList/.test(onMountedText), onMountedText);
check('B5 loadSelected (mount and every userRefId change) asks for nothing for a non-approver', /if \(!isApprover\.value\) \{\s*return;\s*\}[\s\S]*loadApplicant/.test(loadSelectedText), loadSelectedText);
check('B5 a non-approver sees the named message instead of the page', /v-if="!isApprover"[^>]*>\{\{ accountVocabulary\.approvalNotApproverText \}\}/.test(approvalPageText) && /<v-row v-else>/.test(approvalPageText));

console.log(`\naccount-approval-browser-rules: ${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
