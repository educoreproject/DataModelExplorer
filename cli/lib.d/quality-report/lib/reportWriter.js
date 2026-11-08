'use strict';

// reportWriter.js — writes the report's files from reportData: the data file, the report in both formats, and one
// certificate per standard in both formats. File names come from qualityReportRules.json outputFileNameByRole.
//
//   writeReportFiles({ reportData, rules, outputDirPath }, callback(errText, summaryText))

const fs = require('fs');
const path = require('path');
const { renderDocument } = require('./documentRenderer');
const { buildReportDocument } = require('./reportBuilder');
const { buildCertificateDocument, certificateFileStemOf } = require('./certificateBuilder');

const FORMAT_EXTENSION_BY_NAME = Object.freeze({ markdown: '.md', html: '.html' });

const writeReportFiles = ({ reportData, rules, outputDirPath }, callback) => {
	const fileNameByRole = rules.outputFileNameByRole;
	const certificateDirPath = path.join(outputDirPath, fileNameByRole.certificateDirectory);
	fs.mkdirSync(certificateDirPath, { recursive: true });
	const writtenPathList = [];
	const writeText = (filePath, fileText) => {
		fs.writeFileSync(filePath, fileText);
		writtenPathList.push(filePath);
	};
	writeText(path.join(outputDirPath, fileNameByRole.reportData), `${JSON.stringify(reportData, null, '\t')}\n`);

	const reportDocument = buildReportDocument({ reportData, rules });
	writeText(path.join(outputDirPath, fileNameByRole.reportMarkdown), renderDocument({ formatName: 'markdown', ...reportDocument, pageKindName: 'report' }));
	writeText(path.join(outputDirPath, fileNameByRole.reportHtml), renderDocument({ formatName: 'html', ...reportDocument, pageKindName: 'report' }));

	reportData.standardList.forEach((standardEntry) => {
		const certificateDocument = buildCertificateDocument({ reportData, standardEntry, rules });
		Object.keys(FORMAT_EXTENSION_BY_NAME).forEach((formatName) => {
			writeText(path.join(certificateDirPath, `${certificateFileStemOf(standardEntry)}${FORMAT_EXTENSION_BY_NAME[formatName]}`), renderDocument({ formatName, ...certificateDocument, pageKindName: 'certificate' }));
		});
	});
	callback('', `qualityReport: wrote ${writtenPathList.length} files into ${outputDirPath} (report, data file, ${reportData.standardList.length} certificates in two formats)`);
};

module.exports = { writeReportFiles };
