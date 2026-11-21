#!/usr/bin/env node
'use strict';
// @concept: [[SecurityFirstPattern]]

// account-approval-pending-list.js — ACCESS POINT: every account waiting for an approver, oldest first, for the pending
// list on the approval page (WORKORDER-adminApproval-112126, optional item, built). Behind POST /api/listPendingApprovals
// (admin).
//
//   serviceFunction({ signedInUsername }, callback(errText, { applicantList, refusal }))
//
// The signed-in user must be an approver by their STORED role (lib/user-account-approval.js approverOf: notAnApprover).
// Each entry is applicantSummaryOf (never the password).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs } = new require('qtools-asynchronous-pipe-plus')();
const { PENDING_APPROVAL_TEXT } = require('../../../lib/user-profile-rules');
const { approverOf, applicantSummaryOf } = require('../../../lib/user-account-approval');

const QUIET_OPTIONS = Object.freeze({ suppressStatementLog: true });

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog } = process.global;
	const { sqlDb, dataMapping } = passThroughParameters;

	const serviceFunction = (xQuery = {}, callback) => {
		const { signedInUsername } = xQuery || {};
		const taskList = new taskListPlus();

		taskList.push((args, next) => approverOf({ sqlDb, dataMapping, signedInUsername }, (approverError, { refusal } = {}) => next(approverError, { ...args, refusal })));
		taskList.push((args, next) => sqlDb.getTable('users', mergeArgs(args, next, 'userTable')));
		taskList.push((args, next) =>
			args.userTable.getData(dataMapping['profile-user'].getSql('pendingApprovalList', { disabled: PENDING_APPROVAL_TEXT }), QUIET_OPTIONS, (readError, userRowList = []) =>
				next(readError ? `reading the pending accounts: ${readError}` : '', { ...args, userRowList }),
			),
		);

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
			callback('', { applicantList: args.userRowList.map(applicantSummaryOf) });
		});
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
