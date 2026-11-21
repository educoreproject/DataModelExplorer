'use strict';
// @concept: [[CompanionPages]]
//
// The source-set stamp of a compiled companion page: sha256 over one line 'sourceRole TAB sourcePart TAB sha256' per
// current source, sorted. companion-compile-current stamps every compile with it; companion-compile-history recomputes
// it over the sources that were current when a compile was made, to name the rows that compile used. One function, so
// the two can never disagree about what the stamp covers.
//
//   sourceSetSha256Of(sourceRecordList) -> hex sha256
//   sourceRecordListCurrentAt({ sourceHistoryList, momentText }) -> for each (sourceRole, sourcePart), the newest row
//     uploaded at or before momentText (ISO 8601 text; ISO texts of one form sort as their moments do).
//     sourceHistoryList MUST be newest first, as companion-source-list's history returns it (companion-source.js
//     NEWEST_FIRST_TEXT): on a tie in uploadedAt the row earlier in that list wins.
//
// TIES. Stamps from companion-moment-clock never tie. Legacy rows (stamped with new Date() before 2026-11-19) can, and
// for them no exact insertion record exists: createdAt is to the second and rowid is the only order left. The rule
// chosen, as least wrong, is the mapper's order: later uploadedAt, then later createdAt, then larger rowid (the later
// INSERT). VACUUM may renumber rowids of a table without an INTEGER PRIMARY KEY; it copies rows in rowid order, so the
// relative order survives (code estimation from SQLite's documented VACUUM behaviour).

const crypto = require('crypto');

const sourceSetSha256Of = (sourceRecordList) =>
	crypto
		.createHash('sha256')
		.update(
			sourceRecordList
				.map(({ sourceRole, sourcePart, sha256 }) => `${sourceRole}\t${sourcePart}\t${sha256}`)
				.sort()
				.join('\n'),
		)
		.digest('hex');

const sourceRecordListCurrentAt = ({ sourceHistoryList, momentText }) => {
	const newestByPartName = {};
	sourceHistoryList
		.filter((sourceRecord) => sourceRecord.uploadedAt <= momentText)
		.forEach((sourceRecord) => {
			const partName = `${sourceRecord.sourceRole}\t${sourceRecord.sourcePart}`;
			const heldRecord = newestByPartName[partName];
			// strictly later only: on a tie the row met first (newer in the mapper's order) is kept
			if (!heldRecord || heldRecord.uploadedAt < sourceRecord.uploadedAt) newestByPartName[partName] = sourceRecord;
		});
	return Object.values(newestByPartName);
};

module.exports = { sourceSetSha256Of, sourceRecordListCurrentAt };
