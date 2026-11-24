'use strict';
// return-path-rules.test.js — gate for WORKORDER-adminApproval-112126 Phase 3: the sign-in's return path accepts only a
// path on this site (html/components/returnPathRules.js, the module form_login.vue and generalNavSub.vue use), so the
// approval link can go through the login page and back without the login page becoming an open redirect.
//
// Run: node server/test/return-path-rules.test.js

const path = require('path');
const { pathToFileURL } = require('url');

const rulesFileUrl = pathToFileURL(path.join(__dirname, '..', '..', 'html', 'components', 'returnPathRules.js')).href;

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const ACCEPTED_PATH_LIST = ['/account-approval?userRefId=ZsXEFSzChR3CyFGGnJgG', '/', '/admin?tool=add-edit-user', '/explore/standards/ceds:P000001', '/work#section'];
const REFUSED_PATH_LIST = ['https://evil.example/x', 'http://evil.example', '//evil.example/x', '/\\evil.example', '\\\\evil.example', 'javascript:alert(1)', 'evil.example', ' /admin', '/admin\nLocation: x', '', 'account-approval'];
const REFUSED_VALUE_LIST = [undefined, null, ['/admin'], { path: '/admin' }, 42];

import(rulesFileUrl).then(({ sameSiteReturnPathOf }) => {
	ACCEPTED_PATH_LIST.forEach((acceptedPath) => check(`a same-site path is kept: ${acceptedPath}`, sameSiteReturnPathOf(acceptedPath) === acceptedPath, JSON.stringify(sameSiteReturnPathOf(acceptedPath))));
	REFUSED_PATH_LIST.forEach((refusedPath) => check(`an off-site or malformed return path is refused: ${JSON.stringify(refusedPath)}`, sameSiteReturnPathOf(refusedPath) === '', JSON.stringify(sameSiteReturnPathOf(refusedPath))));
	REFUSED_VALUE_LIST.forEach((refusedValue) => check(`a non-text return path is refused: ${JSON.stringify(refusedValue)}`, sameSiteReturnPathOf(refusedValue) === ''));
	const passedCount = resultList.filter(Boolean).length;
	console.log(`return-path-rules: ${passedCount} passed, ${resultList.length - passedCount} failed`);
	process.exit(resultList.length === passedCount ? 0 : 1);
});
