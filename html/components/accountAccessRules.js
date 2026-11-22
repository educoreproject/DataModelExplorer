// accountAccessRules.js — who may use what on /admin and /account-approval, read from config/accountApprovalRules.json
// (WORKORDER-approvalLooseEnds-112126 L4, L6, L7). Pure, so a node test can hold it (tests/accountApproval/).
//
//   roleNameListOf(roleText)              -> the role names in a role text, split on commas and spaces as the server does
//   hasRoleIn(roleText, roleListName)     -> true when one of the roles is in that list of the rules file
//   mayUseTool(roleText, toolName)        -> true when the tool's roleListName allows these roles
//
// The browser only decides what to SHOW and ASK for; every endpoint still decides for itself. An unknown role list or
// tool name throws by name: it is a fault in the rules file or the page, never a silent no.

import accountApprovalRules from '../config/accountApprovalRules.json' with { type: 'json' };

const ANY_SIGNED_IN_ROLE_LIST_NAME = 'anySignedIn';

export const roleNameListOf = (roleText) => `${roleText || ''}`.split(/[\s,]+/).filter(Boolean);

export const hasRoleIn = (roleText, roleListName) => {
	const allowedRoleList = accountApprovalRules[roleListName];
	if (!Array.isArray(allowedRoleList)) {
		throw new Error(`accountAccessRules: '${roleListName}' is not a role list in config/accountApprovalRules.json`);
	}
	return roleNameListOf(roleText).some((roleName) => allowedRoleList.includes(roleName));
};

export const mayUseTool = (roleText, toolName) => {
	const roleListName = accountApprovalRules.roleListNameByToolName[toolName];
	if (!roleListName) {
		throw new Error(`accountAccessRules: the /admin tool '${toolName}' has no entry in config/accountApprovalRules.json roleListNameByToolName`);
	}
	return roleListName === ANY_SIGNED_IN_ROLE_LIST_NAME ? true : hasRoleIn(roleText, roleListName);
};
