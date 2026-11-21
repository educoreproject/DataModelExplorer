#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// account-approval-decide.js — ACCESS POINT: an approver approves or declines one self-registered account
// (WORKORDER-adminApproval-112126, flow steps 4 and 5). Behind POST /api/decideAccountApproval (admin).
//
//   serviceFunction({ signedInUsername, userRefId, decisionName, sendDeclineEmail }, callback(errText, { applicant, latestDecision, refusal }))
//
// Refused by name: the signed-in user is not an approver by their STORED role (notAnApprover; never a role from the
// request or the token's claims); a decision that is not one of user-profile-rules.json approvalDecisionByName, a
// missing userRefId, or a decline without a true/false sendDeclineEmail (approvalDecisionNotValid: no default, the page
// always sends the control's value); an unknown account (noSuchUser); an account whose state the decision may not be
// made from (approvalNotDecidable, naming the state). The registry lets a declined account be approved later and
// refuses declining an approved one.
//
// Then: users.disabled set to the decision's toStateText; a row in accountApprovalDecisions records who and when (the
// standing decision); the applicant is emailed (approved, sign in here; or declined unless sendDeclineEmail is false);
// newAccountNoticeList is told who decided, so a second approver does not act. A failed mail is logged by name and never
// undoes the decision.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { refusalOf, refusalText, textIdentifierRefusalOf, approvalDecisionByName, accountStateTextOf } = require('../../../lib/user-profile-rules');
const { requestGuardOf } = require('../../../lib/user-account-request-guard');
const { approverOf, applicantSummaryOf, latestDecisionOf, sendLoggedOf, APPROVAL_DECISIONS_TABLE_NAME } = require('../../../lib/user-account-approval');
const { accountMailOf, approvalWordingOf, declineEmailTextByCase } = require('../../../lib/user-account-mail');

const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true });
const DECLINE_DECISION_NAME = 'decline';

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping, emailSender, userRegistrationSettings } = passThroughParameters;
	if (!emailSender || typeof emailSender.sendEmail !== 'function') {
		throw new Error(`[${moduleName}] needs emailSender in passThroughParameters (data-model.js builds it)`);
	}
	// every decision the rules allow has its wording in the vocabulary (approvalWordingOf throws at load otherwise)
	Object.keys(approvalDecisionByName).forEach(approvalWordingOf);
	const requestGuard = requestGuardOf({ userRegistrationSettings });

	const decisionRefusalOf = ({ userRefId, decisionName, sendDeclineEmail }) => {
		if (requestGuard.settingsRefusal) {
			return refusalOf('registrationNotConfigured');
		}
		const identifierRefusal = textIdentifierRefusalOf(Object.fromEntries(Object.entries({ userRefId, decisionName }).filter(([, identifierText]) => identifierText !== undefined)));
		if (identifierRefusal) {
			return identifierRefusal;
		}
		const isDecisionKnown = typeof decisionName === 'string' && Object.prototype.hasOwnProperty.call(approvalDecisionByName, decisionName);
		const isDeclineEmailChoiceValid = decisionName !== DECLINE_DECISION_NAME || typeof sendDeclineEmail === 'boolean';
		return typeof userRefId === 'string' && userRefId.trim() && isDecisionKnown && isDeclineEmailChoiceValid ? '' : refusalOf('approvalDecisionNotValid');
	};

	const serviceFunction = (xQuery = {}, callback) => {
		const { signedInUsername, userRefId, decisionName, sendDeclineEmail } = xQuery || {};
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const refusal = decisionRefusalOf({ userRefId, decisionName, sendDeclineEmail });
			if (refusal) {
				next(refusalText(refusal), { ...args, refusal });
				return;
			}
			next('', { ...args, decisionEntry: approvalDecisionByName[decisionName], isDeclineEmailSent: decisionName === DECLINE_DECISION_NAME && sendDeclineEmail === true });
		});

		taskList.push((args, next) => approverOf({ sqlDb, dataMapping, signedInUsername }, (approverError, { approverRow, refusal } = {}) => next(approverError, { ...args, approverRow, refusal })));

		taskList.push((args, next) => sqlDb.getTable('users', mergeArgs(args, next, 'userTable')));
		taskList.push((args, next) =>
			args.userTable.getData(dataMapping['profile-user'].getSql('byRefId', { refId: userRefId }), QUIET_OPTIONS, (readError, userRowList = []) => {
				if (readError) {
					next(`reading the applicant: ${readError}`, args);
					return;
				}
				const applicantRow = userRowList.qtLast();
				const stateText = applicantRow ? accountStateTextOf(applicantRow.disabled) : '';
				const refusal = !applicantRow ? refusalOf('noSuchUser') : !args.decisionEntry.fromStateList.includes(stateText) ? refusalOf('approvalNotDecidable', { detailList: [`it is ${applicantSummaryOf(applicantRow).accountState}`] }) : '';
				if (refusal) {
					next(refusalText(refusal), { ...args, refusal });
					return;
				}
				next('', { ...args, applicantRow });
			}),
		);

		// sqlite-instance 11.0 runs each statement synchronously on one connection in this one process, so no other
		// decision can run between the state read above and this write
		taskList.push((args, next) =>
			args.userTable.runStatement(dataMapping['profile-user'].getSql('disabledByRefId', { refId: userRefId, disabled: args.decisionEntry.toStateText }), QUIET_OPTIONS, (saveError) => next(saveError ? `recording the account state: ${saveError}` : '', args)),
		);

		taskList.push((args, next) => sqlDb.getTable(APPROVAL_DECISIONS_TABLE_NAME, mergeArgs(args, next, 'decisionTable')));
		taskList.push((args, next) => {
			const decisionRecord = { applicantUserRefId: userRefId, decisionName, deciderUserRefId: args.approverRow.refId, deciderUsername: args.approverRow.username, decidedAt: new Date().toISOString(), declineEmailSent: String(args.isDeclineEmailSent) };
			args.decisionTable.saveObject(dataMapping['account-approval-decision'].map(decisionRecord, 'reverse'), QUIET_OPTIONS, (saveError) => next(saveError ? `recording the decision: ${saveError}` : '', args));
		});

		taskList.push((args, next) => {
			const { applicantRow, approverRow } = args;
			const { decisionText, applicantMessageName } = approvalWordingOf(decisionName);
			xLog.status(`[${moduleName}] account ${applicantRow.username} ${decisionText} by ${approverRow.username}`);
			if (decisionName === DECLINE_DECISION_NAME && !args.isDeclineEmailSent) {
				xLog.status(`[${moduleName}] decline email suppressed for ${applicantRow.username}`);
				next('', args);
				return;
			}
			const { publicSiteUrl } = requestGuard.registrationSettings;
			const applicantMail = accountMailOf({ messageName: applicantMessageName, fillByName: { firstName: applicantRow.first || applicantRow.username, username: applicantRow.username, signInUrl: `${publicSiteUrl}/login`, siteUrl: publicSiteUrl } });
			sendLoggedOf({ emailSender, logName: `${applicantMessageName}Mail`, username: applicantRow.username })({ toList: [applicantRow.emailAdr], ...applicantMail }, () => next('', args));
		});

		taskList.push((args, next) => {
			const { applicantRow, approverRow } = args;
			const { publicSiteUrl, newAccountNoticeList } = requestGuard.registrationSettings;
			if (!newAccountNoticeList.length) {
				next('', args);
				return;
			}
			const noticeMail = accountMailOf({
				messageName: 'approvalDecided',
				fillByName: { username: applicantRow.username, firstName: applicantRow.first, lastName: applicantRow.last, emailAdr: applicantRow.emailAdr, decisionText: approvalWordingOf(decisionName).decisionText, deciderUsername: approverRow.username, declineEmailText: declineEmailTextByCase[decisionName !== DECLINE_DECISION_NAME ? 'notApplicable' : args.isDeclineEmailSent ? 'sent' : 'suppressed'], siteUrl: publicSiteUrl },
			});
			sendLoggedOf({ emailSender, logName: 'approvalDecidedNotice', username: applicantRow.username })({ toList: [...newAccountNoticeList], ...noticeMail }, () => next('', args));
		});

		taskList.push((args, next) =>
			args.userTable.getData(dataMapping['profile-user'].getSql('byRefId', { refId: userRefId }), QUIET_OPTIONS, (readError, userRowList = []) => next(readError ? `reading the applicant back: ${readError}` : '', { ...args, applicantRow: userRowList.qtLast() || args.applicantRow })),
		);
		taskList.push((args, next) => latestDecisionOf({ sqlDb, dataMapping, applicantUserRefId: userRefId }, (decisionError, { latestDecision } = {}) => next(decisionError, { ...args, latestDecision })));

		pipeRunner(taskList.getList(), {}, (err, args = {}) => {
			if (args.refusal) {
				callback(err, { refusal: args.refusal });
				return;
			}
			if (err) {
				xLog.error(`[${moduleName}] ${err}`);
				callback(err, {});
				return;
			}
			callback('', { applicant: applicantSummaryOf(args.applicantRow), latestDecision: args.latestDecision });
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
