'use strict';

// searchDescriptionCache — the search describer's cache, a table in Rosetta's own store (rosettaJobs.sqlite), on the handle strangerVectorStore opened, so one file has one writer.
//
//   sweepSearchDescriptionCache({ storeHandle, oldestKeptMs }, done(errText, { removedCount })); SEARCH_DESCRIPTION_CACHE_CREATE_STATEMENT_LIST, for rosettaJobStore
//   descriptionRefIdOf({ wireModel, promptVersion, fieldName, fieldPath }) → the row's refId: a sha256 of all four, so a new model or a changed prompt never serves an older sentence
//   createSearchDescriptionCache({ storeHandle, retentionDays, nowMs }, callback(errText, searchDescriptionCache))
//   searchDescriptionCache: readDescriptions({ descriptionRefIdList }, done(errText, descriptionTextByRefId)), writeDescriptions({ descriptionRowList: [{ descriptionRefId, descriptionText }] }, done(errText)),
//     sweepExpired(done(errText, { removedCount })), rowCount(done(errText, rowCount))
//
// THE SENTENCE IS VISITOR TEXT. It was written from a person's field name, so it is kept like their job text: by its refId (a hash, which holds no name), for retentionDays
// (the judged step's jobRetentionDays) from when it was written, and never in a log line, a count or the spend ledger.

const crypto = require('crypto');

const MILLISECONDS_PER_DAY = 86400000;
// the table's statements, in one place: rosettaJobStore creates them too, so the table exists wherever the store does and its retention sweep and row counts can reach it (review S2)
const SEARCH_DESCRIPTION_CACHE_CREATE_STATEMENT_LIST = Object.freeze([
	'CREATE TABLE IF NOT EXISTS searchDescriptionCache (descriptionRefId TEXT PRIMARY KEY, descriptionText TEXT NOT NULL, writtenAtMs INTEGER NOT NULL)',
	'CREATE INDEX IF NOT EXISTS searchDescriptionCacheByWritten ON searchDescriptionCache (writtenAtMs)',
]);
const [CREATE_STATEMENT_TEXT, INDEX_STATEMENT_TEXT] = SEARCH_DESCRIPTION_CACHE_CREATE_STATEMENT_LIST;

// RETENTION, the one statement: every row written before oldestKeptMs goes. The describer sweeps on its own clock; rosettaJobStore.sweepExpired sweeps with the job tables.
const sweepSearchDescriptionCache = ({ storeHandle, oldestKeptMs }, done) => storeHandle.run('DELETE FROM searchDescriptionCache WHERE writtenAtMs < ?', [oldestKeptMs], function afterSweep(sweepError) {
	done(sweepError ? `searchDescriptionCache: the sweep failed: ${sweepError.message}` : '', { removedCount: sweepError ? 0 : this.changes });
});

const descriptionRefIdOf = ({ wireModel, promptVersion, fieldName, fieldPath }) => crypto.createHash('sha256').update(JSON.stringify([wireModel, promptVersion, fieldName, fieldPath === undefined ? null : fieldPath])).digest('hex');

const createSearchDescriptionCache = ({ storeHandle, retentionDays, nowMs }, callback) => {
	if (!Number.isInteger(retentionDays) || retentionDays < 1) {
		callback(`searchDescriptionCache: retentionDays must be a positive whole number of days (the judged step's jobRetentionDays); it was ${JSON.stringify(retentionDays)}`);
		return;
	}
	storeHandle.run(CREATE_STATEMENT_TEXT, [], (createError) => {
		if (createError) {
			callback(`searchDescriptionCache: the table would not create: ${createError.message}`);
			return;
		}
		storeHandle.run(INDEX_STATEMENT_TEXT, [], (indexError) => {
			if (indexError) {
				callback(`searchDescriptionCache: the index would not create: ${indexError.message}`);
				return;
			}
			const readDescriptions = ({ descriptionRefIdList }, done) => {
				if (descriptionRefIdList.length === 0) {
					done('', {});
					return;
				}
				storeHandle.all(`SELECT descriptionRefId, descriptionText FROM searchDescriptionCache WHERE writtenAtMs >= ? AND descriptionRefId IN (${descriptionRefIdList.map(() => '?').join(',')})`, [nowMs() - retentionDays * MILLISECONDS_PER_DAY, ...descriptionRefIdList], (readError, rowList) => {
					if (readError) {
						done(`searchDescriptionCache: would not read: ${readError.message}`);
						return;
					}
					done('', rowList.reduce((soFar, oneRow) => ({ ...soFar, [oneRow.descriptionRefId]: oneRow.descriptionText }), {}));
				});
			};
			const writeDescriptions = ({ descriptionRowList }, done) => {
				const writeNext = (rowIndex) => {
					if (rowIndex >= descriptionRowList.length) {
						done('');
						return;
					}
					const { descriptionRefId, descriptionText } = descriptionRowList[rowIndex];
					storeHandle.run('INSERT OR REPLACE INTO searchDescriptionCache (descriptionRefId, descriptionText, writtenAtMs) VALUES (?, ?, ?)', [descriptionRefId, descriptionText, nowMs()], (writeError) => (writeError ? done(`searchDescriptionCache: would not write: ${writeError.message}`) : writeNext(rowIndex + 1)));
				};
				writeNext(0);
			};
			const sweepExpired = (done) => sweepSearchDescriptionCache({ storeHandle, oldestKeptMs: nowMs() - retentionDays * MILLISECONDS_PER_DAY }, done);
			const rowCount = (done) => storeHandle.get('SELECT count(*) AS rowCount FROM searchDescriptionCache', [], (countError, oneRow) => done(countError ? countError.message : '', oneRow ? oneRow.rowCount : 0));
			callback('', { readDescriptions, writeDescriptions, sweepExpired, rowCount });
		});
	});
};

module.exports = { createSearchDescriptionCache, descriptionRefIdOf, sweepSearchDescriptionCache, SEARCH_DESCRIPTION_CACHE_CREATE_STATEMENT_LIST };
