#!/usr/bin/env node
// accountAccessRules.test.mjs — WORKORDER-approvalLooseEnds-112126 L4, L6, L7: who the browser treats as able to use each
// /admin tool and the approval page (components/accountAccessRules.js over config/adminAccessRules.json).
//
//   R1 roles split on commas and spaces, as the server splits a stored role
//   R2 a plain user may use only dev-tools; admin and super may use every tool
//   R3 only an approver role passes hasRoleIn(..., 'approverRoleList')
//   R4 an unknown tool or role list name throws by name, never a silent no
//   R5 (raterAndAdminLooseEnds R4) the Admin link: only a role that may use a tool other than dev-tools earns it
//
//   node html/tests/accountApproval/accountAccessRules.test.mjs

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { roleNameListOf, hasRoleIn, mayUseTool, mayUseAnyAdminTool } from '../../components/accountAccessRules.js';

const helperPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../components/accountAccessRules.js');

let passCount = 0;
let failCount = 0;
const check = (checkName, condition, detailText = '') => {
	if (condition) { passCount++; } else { failCount++; }
	console.log(`${condition ? 'PASS' : 'FAIL'} ${checkName}${condition || !detailText ? '' : `\n     ${detailText}`}`);
};

const TOOL_NAME_LIST = ['add-edit-user', 'pending-approvals', 'manifest-editor', 'oauth-admin', 'ceds-rater', 'dev-tools'];
const allowedToolsOf = (roleText) => TOOL_NAME_LIST.filter((toolName) => mayUseTool(roleText, toolName));

check('R1 "user, admin" and "user admin" both name admin', JSON.stringify(roleNameListOf('user, admin')) === '["user","admin"]' && JSON.stringify(roleNameListOf('user admin')) === '["user","admin"]');
check('R1 an absent role names nothing', roleNameListOf(undefined).length === 0 && roleNameListOf('').length === 0);
check('R2 a plain user may use only dev-tools', JSON.stringify(allowedToolsOf('user')) === '["dev-tools"]', JSON.stringify(allowedToolsOf('user')));
check('R2 no role at all may use only dev-tools', JSON.stringify(allowedToolsOf('')) === '["dev-tools"]', JSON.stringify(allowedToolsOf('')));
check('R2 admin may use every tool', JSON.stringify(allowedToolsOf('admin')) === JSON.stringify(TOOL_NAME_LIST), JSON.stringify(allowedToolsOf('admin')));
check('R2 super may use every tool', JSON.stringify(allowedToolsOf('super')) === JSON.stringify(TOOL_NAME_LIST), JSON.stringify(allowedToolsOf('super')));
check('R2 "user rater" (a rater, not an admin) may use only dev-tools', JSON.stringify(allowedToolsOf('user rater')) === '["dev-tools"]', JSON.stringify(allowedToolsOf('user rater')));
check('R3 admin and "user,super" are approvers; user is not', hasRoleIn('admin', 'approverRoleList') && hasRoleIn('user,super', 'approverRoleList') && !hasRoleIn('user', 'approverRoleList') && !hasRoleIn('', 'approverRoleList'));

const throwOf = (expressionText) => spawnSync(process.execPath, ['--input-type=module', '-e', `import * as rules from ${JSON.stringify(helperPath)}; ${expressionText}`], { encoding: 'utf8' });
const unknownTool = throwOf("rules.mayUseTool('admin', 'no-such-tool')");
check('R4 an unknown tool throws by name', unknownTool.status !== 0 && /'no-such-tool' has no entry/.test(unknownTool.stderr), unknownTool.stderr.slice(0, 200));
const unknownList = throwOf("rules.hasRoleIn('admin', 'noSuchRoleList')");
check('R4 an unknown role list throws by name', unknownList.status !== 0 && /'noSuchRoleList' is not a role list/.test(unknownList.stderr), unknownList.stderr.slice(0, 200));

check('R5 a plain user, no role, and "user rater" are not offered the Admin link', !mayUseAnyAdminTool('user') && !mayUseAnyAdminTool('') && !mayUseAnyAdminTool(undefined) && !mayUseAnyAdminTool('user rater'));
check('R5 admin, super, "user, admin" and ["user", "super"] are offered it', mayUseAnyAdminTool('admin') && mayUseAnyAdminTool('super') && mayUseAnyAdminTool('user, admin') && mayUseAnyAdminTool(['user', 'super']));
check('R5 "Admin" (case differs) and "subadmin" are not: names are exact, as on the server', !mayUseAnyAdminTool('Admin') && !mayUseAnyAdminTool('subadmin'));

console.log(`\naccountAccessRules: ${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
