'use strict';
// standards-query-usage.test.js — the bound on usageCounts (standardsQueryService P1.2), on a real SQLite in memory: URI rows stop at the cap and their counts go to a roll-up, nothing is lost from the
// total, rows past retention are swept, and pair, standard and operation counters are kept whatever the cap. Run: node server/test/standards-query-usage.test.js
process.global = { xLog: { status() {}, error() {}, verbose() {}, result() {} }, getConfig: () => ({}) };
const sqlite3 = require('sqlite3');
const { createUsageCounter } = require('../lib/standards-query/usageCounts');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const memoryDb = new sqlite3.Database(':memory:');
const tableHandle = {
	runStatement: (statementText, options, callback) => memoryDb.exec(statementText, (execError) => callback(execError || '')),
	getData: (statementText, options, callback) => memoryDb.all(statementText, (readError, rowList) => callback(readError || '', rowList)),
};
const sqlDb = { getTable: (tableName, callback) => memoryDb.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (refId TEXT PRIMARY KEY, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, (createError) => callback(createError || '', tableHandle)) };

let currentDate = new Date('2026-11-03T12:00:00Z');
const counter = createUsageCounter({ sqlDb, xLog: process.global.xLog, flushMilliseconds: 3600000, nowDate: () => currentDate, uriRowCap: 3, uriRetentionDays: 90 });
const uriNumberList = (startNumber, endNumber) => Array.from({ length: endNumber - startNumber + 1 }, (unused, numberIndex) => `https://w3id.org/EDUcore/x/${startNumber + numberIndex}`);
const countOf = (rowList, subjectKind) => rowList.filter((oneRow) => oneRow.subjectKind === subjectKind);
const asked = (rowList) => rowList.reduce((soFar, oneRow) => soFar + oneRow.askedCount, 0);

counter.countAnswer({ operationName: 'pair', subjectList: [{ subjectKind: 'pair', subjectText: 'CEDS | CTDL' }, { subjectKind: 'standard', subjectText: 'CEDS' }], uriList: uriNumberList(1, 3) });
counter.readCounts((firstError, firstRowList) => {
	ok('under the cap: a URI has a row of its own', !firstError && countOf(firstRowList, 'uri').length === 3, firstError);
	counter.countAnswer({ operationName: 'pair', subjectList: [{ subjectKind: 'pair', subjectText: 'CEDS | CTDL' }], uriList: uriNumberList(4, 8) });
	counter.readCounts((secondError, secondRowList) => {
		ok('at the cap: no more URI rows', countOf(secondRowList, 'uri').length === 3, JSON.stringify(countOf(secondRowList, 'uri').length));
		ok('at the cap: the five later URIs are in one roll-up row, so the total is kept', countOf(secondRowList, 'uriRollup').length === 1 && asked(countOf(secondRowList, 'uriRollup')) === 5, JSON.stringify(countOf(secondRowList, 'uriRollup')));
		ok('a pair counter is kept and counted past the cap', asked(countOf(secondRowList, 'pair')) === 2);
		currentDate = new Date('2027-03-01T12:00:00Z');
		counter.countAnswer({ operationName: 'pair', subjectList: [], uriList: uriNumberList(9, 9) });
		counter.readCounts((thirdError, thirdRowList) => {
			const uriRowList = countOf(thirdRowList, 'uri');
			ok('past retention: the old URI rows are swept, and the new day has room', uriRowList.length === 1 && uriRowList[0].utcDay === '2027-03-01', JSON.stringify(uriRowList.map((one) => one.utcDay)));
			ok('past retention: the pair counter stays', asked(countOf(thirdRowList, 'pair')) === 2);
			ok('past retention: operation and standard counters stay', countOf(thirdRowList, 'standard').length === 1 && countOf(thirdRowList, 'operation').length >= 1);
			counter.stop();
			console.log(`\nstandards-query-usage: ${passedCount} passed, ${failedCount} failed`);
			process.exit(failedCount === 0 ? 0 : 1);
		});
	});
});
