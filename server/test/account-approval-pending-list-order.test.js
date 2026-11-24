'use strict';
// account-approval-pending-list-order.test.js — gate for WORKORDER-approvalLooseEnds-112126 L3: the pending-approvals
// access point decides authorization BEFORE it reads any pending account. The access point runs against a spy database
// (no SQLite): every statement it asks for is recorded by its profile-user SQL name, so the test sees exactly what was read.
//
//   O1 a signed-in non-approver (stored role 'user') is refused notAnApprover, and the only read is the caller's own row
//      (byUsernameForAuth); the pending accounts (pendingApprovalList) are never read
//   O2 no signed-in username: refused notAnApprover with no read at all
//   O3 a disabled admin: refused, pending accounts never read
//   O4 an approver (stored role 'admin'): the caller's row, then the pending accounts, and the list comes back
//
// Run: node server/test/account-approval-pending-list-order.test.js

const path = require('path');

process.global = process.global || {};
process.global.xLog = process.global.xLog || { status: () => {}, error: () => {}, result: () => {} };

const accessPointModulePath = path.join(__dirname, '..', 'data-model', 'access-points-dot-d', 'accessPoints.d', 'account-approval-pending-list.js');

let passCount = 0;
let failCount = 0;
const check = (checkName, condition, detailText = '') => {
	if (condition) {
		passCount++;
	} else {
		failCount++;
	}
	console.log(`${condition ? 'PASS' : 'FAIL'} ${checkName}${condition || !detailText ? '' : `\n     ${detailText}`}`);
};

const PENDING_ROW = { refId: 'pendingRefId1', username: 'pending-one', first: 'Pat', last: 'Pending', emailAdr: 'pat@example.org', createdAt: '2026-11-21 19:24:59', disabled: 'pendingApproval', applicationComment: '' };

// a spy database: getSql returns a marker naming the statement; getData records it and answers from rowListBySqlName
const spyDatabaseOf = ({ callerRow }) => {
	const readSqlNameList = [];
	const tableNameList = [];
	const rowListBySqlName = { byUsernameForAuth: callerRow ? [callerRow] : [], pendingApprovalList: [PENDING_ROW] };
	const userTable = {
		getData: (sqlMarker, optionObject, callback) => {
			readSqlNameList.push(sqlMarker.sqlName);
			callback('', rowListBySqlName[sqlMarker.sqlName] || []);
		},
	};
	const sqlDb = {
		getTable: (tableName, callback) => {
			tableNameList.push(tableName);
			callback('', userTable);
		},
	};
	const dataMapping = { 'profile-user': { getSql: (sqlName, sqlParameters) => ({ sqlName, sqlParameters }) } };
	return { sqlDb, dataMapping, readSqlNameList, tableNameList };
};

const serviceFunctionOf = ({ sqlDb, dataMapping }) => {
	const library = {};
	const dotD = { logList: [], library: { add: (moduleName, serviceFunction) => (library[moduleName] = serviceFunction) } };
	require(accessPointModulePath)({ dotD, passThroughParameters: { sqlDb, dataMapping } });
	return library['account-approval-pending-list'];
};

const caseList = [
	{ caseName: 'O1 non-approver', signedInUsername: 'ursula', callerRow: { refId: 'u1', username: 'ursula', role: 'user', disabled: '' }, expectRefusal: true, expectedReadList: ['byUsernameForAuth'] },
	{ caseName: 'O2 no signed-in username', signedInUsername: '', callerRow: null, expectRefusal: true, expectedReadList: [] },
	{ caseName: 'O3 disabled admin', signedInUsername: 'dora', callerRow: { refId: 'd1', username: 'dora', role: 'admin', disabled: 'adminDisabled' }, expectRefusal: true, expectedReadList: ['byUsernameForAuth'] },
	{ caseName: 'O4 approver', signedInUsername: 'ada', callerRow: { refId: 'a1', username: 'ada', role: 'admin', disabled: '' }, expectRefusal: false, expectedReadList: ['byUsernameForAuth', 'pendingApprovalList'] },
];

const runCase = (caseIndex) => {
	if (caseIndex >= caseList.length) {
		console.log(`\naccount-approval-pending-list-order: ${passCount} passed, ${failCount} failed`);
		process.exit(failCount ? 1 : 0);
		return;
	}
	const { caseName, signedInUsername, callerRow, expectRefusal, expectedReadList } = caseList[caseIndex];
	const spyDatabase = spyDatabaseOf({ callerRow });
	serviceFunctionOf(spyDatabase)({ signedInUsername }, (err, { applicantList, refusal } = {}) => {
		if (expectRefusal) {
			check(`${caseName}: refused notAnApprover`, refusal && refusal.refusalName === 'notAnApprover', JSON.stringify({ err, refusal }));
			check(`${caseName}: the pending accounts are never read`, !spyDatabase.readSqlNameList.includes('pendingApprovalList'), JSON.stringify(spyDatabase.readSqlNameList));
		} else {
			check(`${caseName}: answered the pending list`, !err && !refusal && Array.isArray(applicantList) && applicantList.length === 1 && applicantList[0].username === PENDING_ROW.username, JSON.stringify({ err, refusal, applicantList }));
		}
		check(`${caseName}: reads exactly ${JSON.stringify(expectedReadList)}`, JSON.stringify(spyDatabase.readSqlNameList) === JSON.stringify(expectedReadList), JSON.stringify(spyDatabase.readSqlNameList));
		runCase(caseIndex + 1);
	});
};

runCase(0);
