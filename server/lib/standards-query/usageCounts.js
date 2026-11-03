'use strict';

// usageCounts — what was asked (requirement A9, design section 1.10): one counter per (operation, subject, UTC day), and one per permanent URI an answer named.
// In the API's own SQLite, table usageCounts. Never a query text, never an IP, never a principal: a subject is a standard the answer accepted, a pair of those, or a
// URI the core itself minted, so nothing a caller typed reaches this table unchecked. Counting never holds up or fails an answer: counts wait in memory and are
// written together every flush; a failed write is logged and those counts are lost. Read back only by GET usage (admin, super).
//
//   createUsageCounter({ sqlDb, xLog, flushMilliseconds, nowDate }) → { countAnswer({ operationName, subjectList, uriList }), readCounts(callback), flushNow(callback) }

const crypto = require('crypto');
const sqlString = require('sqlstring-sqlite');

const USAGE_COLUMN_NAME_LIST = Object.freeze(['operationName', 'subjectKind', 'subjectText', 'utcDay', 'askedCount']);
const QUIET_STATEMENT_OPTIONS = Object.freeze({ suppressStatementLog: true, noTableNameOk: true });
const READ_ROW_CAP = 5000;

const createUsageCounter = ({ sqlDb, xLog, flushMilliseconds, nowDate }) => {
	const countByRowText = new Map();
	let usageTable = null;

	const addCount = (operationName, subjectKind, subjectText) => {
		const rowText = JSON.stringify([operationName, subjectKind, subjectText, nowDate().toISOString().slice(0, 10)]);
		countByRowText.set(rowText, (countByRowText.get(rowText) || 0) + 1);
	};

	const countAnswer = ({ operationName, subjectList, uriList }) => {
		addCount(operationName, 'operation', operationName);
		subjectList.forEach(({ subjectKind, subjectText }) => addCount(operationName, subjectKind, subjectText));
		[...new Set(uriList)].forEach((uriText) => addCount(operationName, 'uri', uriText));
	};

	// the house table (getTable makes refId, createdAt, updatedAt); the columns are added once, and a row's refId is the hash of what it counts, so a count upserts
	const withUsageTable = (callback) => {
		if (usageTable) {
			callback('', usageTable);
			return;
		}
		sqlDb.getTable('usageCounts', (handleError, tableHandle) => {
			if (handleError) {
				callback(handleError);
				return;
			}
			tableHandle.getData('PRAGMA table_info(usageCounts)', QUIET_STATEMENT_OPTIONS, (pragmaError, columnRowList) => {
				if (pragmaError) {
					callback(pragmaError);
					return;
				}
				const existingNameList = columnRowList.map((oneRow) => oneRow.name);
				const addColumnText = USAGE_COLUMN_NAME_LIST.filter((columnName) => !existingNameList.includes(columnName)).map((columnName) => `ALTER TABLE usageCounts ADD COLUMN ${columnName} ${columnName === 'askedCount' ? 'INTEGER' : 'TEXT'};`).join(' ');
				tableHandle.runStatement(`${addColumnText} SELECT 1;`, QUIET_STATEMENT_OPTIONS, (alterError) => {
					if (alterError) {
						callback(alterError);
						return;
					}
					usageTable = tableHandle;
					callback('', usageTable);
				});
			});
		});
	};

	const flushNow = (callback) => {
		if (countByRowText.size === 0) {
			callback('');
			return;
		}
		const rowEntryList = [...countByRowText.entries()];
		countByRowText.clear();
		const valuesText = rowEntryList.map(([rowText, askedCount]) => `(${[crypto.createHash('sha256').update(rowText).digest('hex'), ...JSON.parse(rowText), askedCount].map((columnValue) => sqlString.escape(columnValue)).join(', ')})`).join(', ');
		withUsageTable((tableError, tableHandle) => {
			if (tableError) {
				callback(tableError);
				return;
			}
			tableHandle.runStatement(`INSERT INTO usageCounts (refId, ${USAGE_COLUMN_NAME_LIST.join(', ')}) VALUES ${valuesText} ON CONFLICT (refId) DO UPDATE SET askedCount = askedCount + excluded.askedCount`, QUIET_STATEMENT_OPTIONS, (writeError) => callback(writeError || ''));
		});
	};

	const readCounts = (callback) => {
		flushNow((flushError) => {
			if (flushError) {
				callback(flushError);
				return;
			}
			withUsageTable((tableError, tableHandle) => {
				if (tableError) {
					callback(tableError);
					return;
				}
				tableHandle.getData(`SELECT operationName, subjectKind, subjectText, utcDay, askedCount FROM usageCounts ORDER BY utcDay DESC, askedCount DESC LIMIT ${READ_ROW_CAP}`, QUIET_STATEMENT_OPTIONS, (readError, rowList) => callback(readError || '', rowList));
			});
		});
	};

	const flushTimer = setInterval(() => flushNow((flushError) => {
		if (flushError) {
			xLog.error(`usageCounts: counts lost: ${flushError}`);
		}
	}), flushMilliseconds);
	flushTimer.unref();

	return { countAnswer, readCounts, flushNow, stop: () => clearInterval(flushTimer) };
};

module.exports = { createUsageCounter, READ_ROW_CAP };
