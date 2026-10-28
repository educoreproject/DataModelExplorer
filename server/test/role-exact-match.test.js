#!/usr/bin/env node
'use strict';

// role-exact-match.test.js — gate G0.4 (Companion Pages Phase 0; Continuity request f980bf95).
// getValidator matched roles with userRole.includes(item), a SUBSTRING test on the role text, so 'subadministrator'
// passed ['admin'] and 'superuser' passed ['super'] on every guarded route. It now splits the role into names (one
// name, a comma or space list in one text, or an array) and passes only on an exact name, or 'public'. The existing
// userRole === 'super' bypass is kept.
//
// PROVES: lookalike roles are refused; exact names, lists and arrays still pass; 'public' admits anyone; a token with no
// role is refused instead of throwing.
// RED TWIN (in memory, lib/moduleWithStubs.js): the module with the old substring line restored passes the lookalikes.
//
//   node server/test/role-exact-match.test.js

const path = require('path');
const { loadWithStubs } = require('./lib/moduleWithStubs');

const MODULE_PATH = path.join(__dirname, '..', 'lib', 'access-token-header-tools.js');
const EXACT_MATCH_LINE = 'permissionList.some((permittedRoleName) => userRoleNameList.includes(permittedRoleName));';
const SUBSTRING_LINE = 'permissionList.some((item) => userRole.includes(item));';

process.global = {
	xLog: { status: () => {}, error: () => {}, verbose: () => {} },
	getConfig: () => ({ secret: 'role-exact-match-test-secret', authsecondsexpirationseconds: 60 }),
};

const results = [];
const ok = (name, condition, detail) => {
	results.push([name, !!condition]);
	console.log(`  ${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const refusalOf = (tokenTools, { permissionList, userRole }) => tokenTools.getValidator(permissionList)({ user: { username: 'someone', role: userRole } });

const lookalikeCaseList = [
	{ permissionList: ['admin'], userRole: 'subadministrator' },
	{ permissionList: ['admin', 'super'], userRole: 'subadministrator' },
	{ permissionList: ['super'], userRole: 'superuser' },
	{ permissionList: ['user'], userRole: 'poweruser' },
	{ permissionList: ['admin'], userRole: 'user,subadmin' },
	{ permissionList: ['admin'], userRole: ['user', 'subadmin'] },
];
const exactCaseList = [
	{ permissionList: ['admin'], userRole: 'admin' },
	{ permissionList: ['admin', 'super'], userRole: 'super' },
	{ permissionList: ['admin'], userRole: 'super' }, // the kept super bypass
	{ permissionList: ['admin'], userRole: 'user,admin' },
	{ permissionList: ['admin'], userRole: 'user, admin' },
	{ permissionList: ['admin'], userRole: 'user admin' },
	{ permissionList: ['admin'], userRole: ['user', 'admin'] },
	{ permissionList: ['user'], userRole: 'user' },
	{ permissionList: ['public'], userRole: 'subadministrator' },
];
const describeCase = ({ permissionList, userRole }) => `${JSON.stringify(userRole)} vs ${JSON.stringify(permissionList)}`;

console.log('real module');
const realTokenTools = require(MODULE_PATH)({});
lookalikeCaseList.forEach((oneCase) => ok(`refused: ${describeCase(oneCase)}`, refusalOf(realTokenTools, oneCase) === 'Unauthorized access'));
exactCaseList.forEach((oneCase) => ok(`passes: ${describeCase(oneCase)}`, refusalOf(realTokenTools, oneCase) === false));
ok('public admits a token with no role', realTokenTools.getValidator(['public'])({}) === false);
ok('no role is refused, not a crash', refusalOf(realTokenTools, { permissionList: ['admin'], userRole: undefined }) === 'Unauthorized access');
ok('no user at all is refused, not a crash', realTokenTools.getValidator(['admin'])({}) === 'Unauthorized access');

console.log('red twin: the substring line restored');
const substringTokenTools = loadWithStubs({ modulePath: MODULE_PATH, mutationList: [{ find: EXACT_MATCH_LINE, replace: SUBSTRING_LINE }] })({});
const twinPassedLookalikeList = lookalikeCaseList.filter((oneCase) => typeof oneCase.userRole === 'string' && refusalOf(substringTokenTools, oneCase) === false);
ok('the substring check passes the lookalikes (the defect is real and this gate sees it)', twinPassedLookalikeList.length >= 4, `${twinPassedLookalikeList.length} lookalikes passed: ${twinPassedLookalikeList.map(describeCase).join('; ')}`);

const failedCount = results.filter(([, isPass]) => !isPass).length;
console.log(`\n=== Results: ${results.length - failedCount} passed, ${failedCount} failed ===\n`);
process.exit(failedCount > 0 ? 1 : 0);
