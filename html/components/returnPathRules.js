// @concept: [[SecurityFirstPattern]]
//
// returnPathRules.js — where a sign-in may send the user back to (WORKORDER-adminApproval-112126 A5: the emailed approval
// link goes through the login page and straight back to the approval page). Only a path on THIS site is accepted: it
// begins with exactly one '/' and holds no backslash, whitespace or control character, so '//evil.example',
// '/\evil.example', 'https://evil.example' and 'javascript:...' are all refused. A colon later in the path is allowed
// (stable ids such as ceds:P000001 appear in this site's paths); after a single leading '/' it cannot start a scheme. A refused or absent path is '' and the
// caller goes to its own default. Plain JavaScript with no Vue import, so server/test/return-path-rules.test.js can test it.

const SAME_SITE_PATH_PATTERN = /^\/(?![\/\\])[^\\\s\u0000-\u001f\u007f]*$/;

export const sameSiteReturnPathOf = (candidatePath) => {
	if (typeof candidatePath !== 'string') {
		return '';
	}
	return SAME_SITE_PATH_PATTERN.test(candidatePath) ? candidatePath : '';
};
