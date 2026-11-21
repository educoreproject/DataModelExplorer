#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// account-approval-detail.js — ACCESS POINT: one applicant, for the approval page (WORKORDER-adminApproval-112126 A5).
// Behind POST /api/accountApprovalDetail (admin).
//
//   serviceFunction({ signedInUsername, userRefId }, callback(errText, { applicant, latestDecision, adminApprovalEmailSuppress, refusal }))
//
// The signed-in user must be an approver by their STORED role (lib/user-account-approval.js approverOf: notAnApprover);
// signedInUsername is the identity the endpoint takes from the verified token, never a role. An unknown userRefId is
// noSuchUser. applicant is lib/user-account-approval.js applicantSummaryOf (never the password); latestDecision says who
// decided and when, or null; adminApprovalEmailSuppress presets the page's send/suppress-decline-email control (A6).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { refusalOf, refusalText, textIdentifierRefusalOf } = require('../../../lib/user-profile-rules');
const { requestGuardOf } = require('../../../lib/user-account-request-guard');
const { approverOf, applicantSummaryOf, latestDecisionOf } = require('../../../lib/user-account-approval');

const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true });

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping, userRegistrationSettings } = passThroughParameters;
	const requestGuard = requestGuardOf({ userRegistrationSettings });

	const serviceFunction = (xQuery = {}, callback) => {
		const { signedInUsername, userRefId } = xQuery || {};
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const refusal = requestGuard.settingsRefusal ? refusalOf('registrationNotConfigured') : typeof userRefId !== 'string' || !userRefId.trim() ? refusalOf('requiredPropertyMissing', { detailList: ['userRefId'] }) : textIdentifierRefusalOf({ userRefId });
			if (refusal) {
				next(refusalText(refusal), { ...args, refusal });
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => approverOf({ sqlDb, dataMapping, signedInUsername }, (approverError, { refusal } = {}) => next(approverError, { ...args, refusal })));

		taskList.push((args, next) => sqlDb.getTable('users', mergeArgs(args, next, 'userTable')));
		taskList.push((args, next) =>
			args.userTable.getData(dataMapping['profile-user'].getSql('byRefId', { refId: userRefId }), QUIET_OPTIONS, (readError, userRowList = []) => {
				if (readError) {
					next(`reading the applicant: ${readError}`, args);
					return;
				}
				const applicantRow = userRowList.qtLast();
				if (!applicantRow) {
					const noUserRefusal = refusalOf('noSuchUser');
					next(refusalText(noUserRefusal), { ...args, refusal: noUserRefusal });
					return;
				}
				next('', { ...args, applicantRow });
			}),
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
			callback('', { applicant: applicantSummaryOf(args.applicantRow), latestDecision: args.latestDecision, adminApprovalEmailSuppress: requestGuard.registrationSettings.adminApprovalEmailSuppress });
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
