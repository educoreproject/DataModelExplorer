// accountAccessRules.js — who may use what on /admin, /account-approval and the Admin link, read from
// config/adminAccessRules.json (WORKORDER-approvalLooseEnds-112126 L4, L6, L7; WORKORDER-raterAndAdminLooseEnds-112226 R2,
// R4). Pure, so a node test can hold it (tests/accountApproval/, server/test/role-split-parity.test.js).
//
//   roleNameListOf(roleText)              -> the role names in a role, read exactly as the server's getValidator reads one
//   hasRoleIn(roleText, roleListName)     -> true when one of the roles is in that list of the rules file
//   mayUseTool(roleText, toolName)        -> true when the tool's roleListName allows these roles
//   mayUseAnyAdminTool(roleText)          -> true when these roles may use at least one /admin tool that is not open to
//                                            every signed-in user (R4: DEV TOOLS alone does not earn the Admin link)
//
// The browser only decides what to SHOW and ASK for; every endpoint still decides for itself. An unknown role list or
// tool name throws by name: it is a fault in the rules file or the page, never a silent no.

import adminAccessRules from '../config/adminAccessRules.json' with { type: 'json' };

const ANY_SIGNED_IN_ROLE_LIST_NAME = 'anySignedIn';

// server/lib/access-token-header-tools.js getValidator: an array is taken name by name (each trimmed, never split); any
// other role is made text and split on commas and white space. Names are compared exactly, case included.
export const roleNameListOf = (roleText) =>
	(Array.isArray(roleText) ? roleText : String(roleText ?? '').split(/[\s,]+/))
		.map((roleName) => String(roleName).trim())
		.filter(Boolean);

export const hasRoleIn = (roleText, roleListName) => {
	const allowedRoleList = adminAccessRules[roleListName];
	if (!Array.isArray(allowedRoleList)) {
		throw new Error(`accountAccessRules: '${roleListName}' is not a role list in config/adminAccessRules.json`);
	}
	return roleNameListOf(roleText).some((roleName) => allowedRoleList.includes(roleName));
};

export const mayUseTool = (roleText, toolName) => {
	const roleListName = adminAccessRules.roleListNameByToolName[toolName];
	if (!roleListName) {
		throw new Error(`accountAccessRules: the /admin tool '${toolName}' has no entry in config/adminAccessRules.json roleListNameByToolName`);
	}
	return roleListName === ANY_SIGNED_IN_ROLE_LIST_NAME ? true : hasRoleIn(roleText, roleListName);
};

export const mayUseAnyAdminTool = (roleText) =>
	Object.entries(adminAccessRules.roleListNameByToolName)
		.filter(([, roleListName]) => roleListName !== ANY_SIGNED_IN_ROLE_LIST_NAME)
		.some(([toolName]) => mayUseTool(roleText, toolName));
