'use strict';

// reportPageBuilder.js — the report and its certificates as ONE file the website renders (TQ 2026-11-08: "mainly this should
// be a web page"). It carries the very block lists the markdown and HTML are rendered from (documentRenderer.js'
// DocumentBlock), so the site never re-words a figure: it draws the blocks in its own styling. It also carries what the
// server needs to file the report under the graph it measured, without opening the data file: the graph stamp (whose
// manifestRefId and graphContractSha256 make the graph's identity) and the date of the newest rater answer counted.
//
// @interface QualityReportPage (pageFormat educoreQualityReportPage/1)
//   { pageFormat, graphStamp, generatorCommit, raterDataLastSavedAt,
//     report: { titleText, blockList },
//     certificateList: [ { certificateStem, source, standardName, titleText, blockList } ] }
//
//   buildReportPage({ reportData, rules }) -> QualityReportPage   (throws when the rater store reported no last answer date)

const { buildReportDocument } = require('./reportBuilder');
const { buildCertificateDocument, certificateFileStemOf } = require('./certificateBuilder');

const REPORT_PAGE_FORMAT = 'educoreQualityReportPage/1';

const buildReportPage = ({ reportData, rules }) => {
	const raterDataLastSavedAt = reportData.humanAgreement && reportData.humanAgreement.storeFacts ? reportData.humanAgreement.storeFacts.lastSavedAt : undefined;
	if (typeof raterDataLastSavedAt !== 'string' || raterDataLastSavedAt === '') {
		throw new Error(`reportPageBuilder: the rater store facts carry no lastSavedAt (${JSON.stringify(raterDataLastSavedAt)}); the page names the rater data it was measured on and cannot be written without it`);
	}
	return {
		pageFormat: REPORT_PAGE_FORMAT,
		graphStamp: reportData.graphStamp,
		generatorCommit: reportData.generatorCommit,
		raterDataLastSavedAt,
		report: buildReportDocument({ reportData, rules }),
		certificateList: reportData.standardList.map((standardEntry) => ({
			certificateStem: certificateFileStemOf(standardEntry),
			source: standardEntry.source,
			standardName: standardEntry.standardName,
			...buildCertificateDocument({ reportData, standardEntry, rules }),
		})),
	};
};

module.exports = { buildReportPage, REPORT_PAGE_FORMAT };
