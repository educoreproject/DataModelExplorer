#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// user-account-approval.js — the parts of admin approval of new registrations (WORKORDER-adminApproval-112126) shared by
// the registration access points and the approval access points.
//
//   requestApprovalOf({ sqlDb, dataMapping, emailSender, registrationSettings, userRow }, callback(errText, {}))
//       puts the account in pendingApproval, emails the applicant that it awaits approval, and sends the approval request
//       (the A4 new-account notice, with the link to that applicant's approval page) to newAccountNoticeList. Called once
//       the address is proved (A2): at confirmation, or at sign-up when confirmation is off. An empty list is logged by
//       name (approvalWithoutApprovers) at every such sign-up, as at startup, and alerted through emailSender.alertFailure
//       (WORKORDER-accountMailLooseEnds-112326 E4); a failed mail is logged by name and never
//       undoes the state change. Only the state write can fail the call.
//   approvalPageUrlOf({ publicSiteUrl, userRefId }) -> the approval page of one applicant (the link approves nothing)
//   applicantSummaryOf(userRow) -> { refId, username, first, last, emailAdr, createdAt, applicationComment, accountState, allowedDecisionNameList } for the approval
//       page: accountState is active, pendingConfirmation, pendingApproval, declined or disabled (an admin's own text
//       is not shown); never the password
//   latestDecisionOf({ sqlDb, dataMapping, applicantUserRefId }, callback(errText, { latestDecision }))
//       the applicant's standing decision (accountApprovalDecisions), or null when none was made
//   approverOf({ sqlDb, dataMapping, signedInUsername }, callback(errText, { approverRow, refusal }))
//       the signed-in user's own users row, refused (notAnApprover) unless it is active and its STORED role is in
//       approverRoleList (user-profile-rules.json). The role
//       is read from the database here, never from the request or the token's claims (A5; the July hole was a role
//       taken from a request body).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { refusalOf, refusalText, approverRoleList, approvalDecisionByName, isAccountDisabled, accountStateTextOf, loginRefusalNameByAccountState, PENDING_APPROVAL_TEXT } = require('./user-profile-rules');
const { accountMailOf, applicationCommentTextOf } = require('./user-account-mail');
const { NO_APPROVER_WARNING_TEXT } = require('./user-registration-settings');

const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true, noTableNameOk: true });
const APPROVAL_DECISIONS_TABLE_NAME = 'accountApprovalDecisions';
const APPROVAL_PAGE_PATH = '/account-approval';

const approvalPageUrlOf = ({ publicSiteUrl, userRefId }) => `${publicSiteUrl}${APPROVAL_PAGE_PATH}?userRefId=${encodeURIComponent(userRefId)}`;

// one mail, its failure logged by name and swallowed: mail never undoes an account change (email-sender alerts it,
// WORKORDER-accountMailFailureAndApprovalNotice-112326 M6 d, named by logName and the applicant); done({ failureName }) says
// what happened, '' when it was sent, so a caller can tell the person (WORKORDER-accountMailLooseEnds-112326 E1)
const sendLoggedOf = ({ emailSender, logName, username }) => (mailMessage, done) =>
	emailSender.sendEmail({ ...mailMessage, alertLabel: { mailName: logName, accountName: username } }, (sendError, { messageId, failureName } = {}) => {
		const { xLog } = process.global;
		if (sendError) {
			xLog.error(`[${moduleName}] ${logName}NotSent for ${username}: ${sendError}`);
			// the caller may say what happened (WORKORDER-accountMailLooseEnds-112326 E1); it is never an error of the flow
			done({ failureName: failureName || 'unnamedMailFailure' });
			return;
		}
		xLog.status(`[${moduleName}] ${logName} sent for ${username} (message ${messageId})`);
		done({ failureName: '' });
	});

const requestApprovalOf = ({ sqlDb, dataMapping, emailSender, registrationSettings, userRow }, callback) => {
	const { xLog } = process.global;
	const { publicSiteUrl, newAccountNoticeList } = registrationSettings;
	const taskList = new taskListPlus();

	taskList.push((args, next) => sqlDb.getTable('users', mergeArgs(args, next, 'userTable')));
	taskList.push((args, next) =>
		args.userTable.runStatement(dataMapping['profile-user'].getSql('disabledByRefId', { refId: userRow.refId, disabled: PENDING_APPROVAL_TEXT }), QUIET_OPTIONS, (saveError) => next(saveError ? `setting ${PENDING_APPROVAL_TEXT}: ${saveError}` : '', args)),
	);

	taskList.push((args, next) => {
		xLog.status(`[${moduleName}] account awaiting approval: ${userRow.username}`);
		const applicantMail = accountMailOf({ messageName: 'awaitingApproval', fillByName: { firstName: userRow.first || userRow.username, username: userRow.username, siteUrl: publicSiteUrl } });
		sendLoggedOf({ emailSender, logName: 'awaitingApprovalMail', username: userRow.username })({ toList: [userRow.emailAdr], ...applicantMail }, () => next('', args));
	});

	taskList.push((args, next) => {
		if (!newAccountNoticeList.length) {
			xLog.error(`[${moduleName}] ${NO_APPROVER_WARNING_TEXT}; ${userRow.username} is waiting and nobody was asked`);
			// WORKORDER-accountMailLooseEnds-112326 E4: the approval request that should have gone went nowhere; alerted like a failed mail
			emailSender.alertFailure({ mailName: 'approvalRequest', accountName: userRow.username, failureName: 'approvalWithoutApprovers' });
			next('', args);
			return;
		}
		const requestMail = accountMailOf({
			messageName: 'approvalRequest',
			fillByName: { username: userRow.username, firstName: userRow.first, lastName: userRow.last, emailAdr: userRow.emailAdr, applicationCommentText: applicationCommentTextOf(userRow.applicationComment), approvalPageUrl: approvalPageUrlOf({ publicSiteUrl, userRefId: userRow.refId }), siteUrl: publicSiteUrl },
		});
		sendLoggedOf({ emailSender, logName: 'approvalRequest', username: userRow.username })({ toList: [...newAccountNoticeList], ...requestMail }, () => next('', args));
	});

	pipeRunner(taskList.getList(), {}, (err) => callback(err ? `${moduleName}: ${err}` : '', {}));
};

const accountStateOf = (disabledValue) => {
	if (!isAccountDisabled(disabledValue)) {
		return 'active';
	}
	const stateText = accountStateTextOf(disabledValue);
	return Object.prototype.hasOwnProperty.call(loginRefusalNameByAccountState, stateText) ? stateText : 'disabled';
};

const applicantSummaryOf = (userRow) => ({
	refId: userRow.refId,
	username: userRow.username,
	first: userRow.first,
	last: userRow.last,
	emailAdr: userRow.emailAdr,
	createdAt: userRow.createdAt,
	// A8: the applicant's note to the approvers; this summary is served only to approvers
	applicationComment: typeof userRow.applicationComment === 'string' ? userRow.applicationComment : '',
	accountState: accountStateOf(userRow.disabled),
	// what may still be decided, from approvalDecisionByName: the page shows these buttons and no others
	allowedDecisionNameList: Object.keys(approvalDecisionByName).filter((decisionName) => approvalDecisionByName[decisionName].fromStateList.includes(accountStateTextOf(userRow.disabled))),
});

const latestDecisionOf = ({ sqlDb, dataMapping, applicantUserRefId }, callback) => {
	const taskList = new taskListPlus();
	taskList.push((args, next) => sqlDb.getTable(APPROVAL_DECISIONS_TABLE_NAME, mergeArgs(args, next, 'decisionTable')));
	taskList.push((args, next) =>
		args.decisionTable.getData(dataMapping['account-approval-decision'].getSql('latestOfApplicant', { applicantUserRefId }), QUIET_OPTIONS, (readError, decisionRowList = []) =>
			next(readError ? `reading the decision: ${readError}` : '', { ...args, decisionRow: decisionRowList.qtLast() }),
		),
	);
	pipeRunner(taskList.getList(), {}, (err, args = {}) => {
		if (err) {
			callback(`${moduleName}: ${err}`, {});
			return;
		}
		const { decisionRow } = args;
		callback('', { latestDecision: decisionRow ? { decisionName: decisionRow.decisionName, deciderUsername: decisionRow.deciderUsername, decidedAt: decisionRow.decidedAt, declineEmailSent: decisionRow.declineEmailSent === 'true' } : null });
	});
};

const approverOf = ({ sqlDb, dataMapping, signedInUsername }, callback) => {
	const notApproverRefusal = refusalOf('notAnApprover');
	if (typeof signedInUsername !== 'string' || !signedInUsername.trim()) {
		callback(refusalText(notApproverRefusal), { refusal: notApproverRefusal });
		return;
	}
	const taskList = new taskListPlus();
	taskList.push((args, next) => sqlDb.getTable('users', mergeArgs(args, next, 'userTable')));
	taskList.push((args, next) =>
		args.userTable.getData(dataMapping['profile-user'].getSql('byUsernameForAuth', { username: signedInUsername }), QUIET_OPTIONS, (readError, userRowList = []) => {
			if (readError) {
				next(`reading the approver: ${readError}`, args);
				return;
			}
			next('', { ...args, approverRow: userRowList.qtLast() });
		}),
	);
	pipeRunner(taskList.getList(), {}, (err, args = {}) => {
		if (err) {
			callback(`${moduleName}: ${err}`, {});
			return;
		}
		const storedRoleNameList = String((args.approverRow && args.approverRow.role) || '').split(/[\s,]+/).filter(Boolean);
		if (!args.approverRow || isAccountDisabled(args.approverRow.disabled) || !storedRoleNameList.some((roleName) => approverRoleList.includes(roleName))) {
			callback(refusalText(notApproverRefusal), { refusal: notApproverRefusal });
			return;
		}
		callback('', { approverRow: args.approverRow });
	});
};

module.exports = { requestApprovalOf, approvalPageUrlOf, approverOf, applicantSummaryOf, latestDecisionOf, sendLoggedOf, APPROVAL_PAGE_PATH, APPROVAL_DECISIONS_TABLE_NAME };
