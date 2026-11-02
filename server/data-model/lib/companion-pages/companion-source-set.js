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
//     uploaded at or before momentText (ISO 8601 text; ISO texts of one form sort as their moments do)

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
			if (!heldRecord || heldRecord.uploadedAt < sourceRecord.uploadedAt) newestByPartName[partName] = sourceRecord;
		});
	return Object.values(newestByPartName);
};

module.exports = { sourceSetSha256Of, sourceRecordListCurrentAt };
