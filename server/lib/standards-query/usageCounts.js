'use strict';

// usageCounts — what was asked (requirement A9, design section 1.10): one counter per (operation, subject, UTC day), and one per permanent URI an answer named.
// In the API's own SQLite, table usageCounts. Never a query text, never an IP, never a principal: a subject is a standard the answer accepted, a pair of those, or a
// URI the core itself minted, so nothing a caller typed reaches this table unchecked. Counting never holds up or fails an answer: counts wait in memory and are
// written together every flush; a failed write is logged and those counts are lost. Read back only by GET usage (admin, super).
//
// THE BOUND (a public route must not grow a table without end): per-URI rows are the only unbounded kind, up to a row per URI per operation per day. They are kept usageUriRetentionDays, then
// swept, and never exceed usageUriRowCap: at the cap, URI counts stop getting rows of their own and are added to one 'uriRollup' row per operation and day, so the total is kept and only the detail is lost.
// Operation, standard and pair counters are few and are kept: the pair counts are the evidence the peer bridge job reads first.
//
//   createUsageCounter({ sqlDb, xLog, flushMilliseconds, nowDate, uriRowCap, uriRetentionDays }) → { countAnswer({ operationName, subjectList, uriList }), readCounts(callback), flushNow(callback), stop() }

const crypto = require('crypto');
const sqlString = require('sqlstring-sqlite');

const USAGE_COLUMN_NAME_LIST = Object.freeze(['operationName', 'subjectKind', 'subjectText', 'utcDay', 'askedCount']);
const QUIET_STATEMENT_OPTIONS = Object.freeze({ suppressStatementLog: true, noTableNameOk: true });
const READ_ROW_CAP = 5000;

const URI_SUBJECT_KIND = 'uri';
const URI_ROLLUP_SUBJECT_KIND = 'uriRollup';
const URI_ROLLUP_SUBJECT_TEXT = 'URIs past usageUriRowCap, counted together';
const MILLISECONDS_PER_DAY = 86400000;

const createUsageCounter = ({ sqlDb, xLog, flushMilliseconds, nowDate, uriRowCap, uriRetentionDays }) => {
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

	const utcDayText = (dateObject) => dateObject.toISOString().slice(0, 10);

	// each flush, oldest first: sweep what is past retention, read what is left, fold URI counts into the roll-up if the table is at its cap, write
	const flushNow = (callback) => {
		if (countByRowText.size === 0) {
			callback('');
			return;
		}
		const rowEntryList = [...countByRowText.entries()];
		countByRowText.clear();
		withUsageTable((tableError, tableHandle) => {
			if (tableError) {
				callback(tableError);
				return;
			}
			const oldestKeptDayText = utcDayText(new Date(nowDate().getTime() - uriRetentionDays * MILLISECONDS_PER_DAY));
			tableHandle.runStatement(`DELETE FROM usageCounts WHERE subjectKind = ${sqlString.escape(URI_SUBJECT_KIND)} AND utcDay < ${sqlString.escape(oldestKeptDayText)}`, QUIET_STATEMENT_OPTIONS, (sweepError) => {
				if (sweepError) {
					callback(sweepError);
					return;
				}
				tableHandle.getData(`SELECT count(*) AS uriRowCount FROM usageCounts WHERE subjectKind = ${sqlString.escape(URI_SUBJECT_KIND)}`, QUIET_STATEMENT_OPTIONS, (countError, countRowList) => {
					if (countError) {
						callback(countError);
						return;
					}
					const isAtCap = countRowList[0].uriRowCount >= uriRowCap;
					const rowByText = new Map();
					rowEntryList.forEach(([rowText, askedCount]) => {
						const [operationName, subjectKind, subjectText, utcDay] = JSON.parse(rowText);
						const finalRow = isAtCap && subjectKind === URI_SUBJECT_KIND ? [operationName, URI_ROLLUP_SUBJECT_KIND, URI_ROLLUP_SUBJECT_TEXT, utcDay] : [operationName, subjectKind, subjectText, utcDay];
						const finalText = JSON.stringify(finalRow);
						rowByText.set(finalText, (rowByText.get(finalText) || 0) + askedCount);
					});
					const valuesText = [...rowByText.entries()].map(([rowText, askedCount]) => `(${[crypto.createHash('sha256').update(rowText).digest('hex'), ...JSON.parse(rowText), askedCount].map((columnValue) => sqlString.escape(columnValue)).join(', ')})`).join(', ');
					tableHandle.runStatement(`INSERT INTO usageCounts (refId, ${USAGE_COLUMN_NAME_LIST.join(', ')}) VALUES ${valuesText} ON CONFLICT (refId) DO UPDATE SET askedCount = askedCount + excluded.askedCount`, QUIET_STATEMENT_OPTIONS, (writeError) => callback(writeError || ''));
				});
			});
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
