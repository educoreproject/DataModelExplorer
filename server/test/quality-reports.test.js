'use strict';
// quality-reports.test.js — the Certification page's server side (TQ 2026-11-08): the quality-reports access point lists the
// published reports, says which is the live graph's, and serves one report's blocks and its downloads. A report is filed under
// its graph BY CONTENT IDENTITY (graph-identity.js), computed from the stamp in its own page file, never by its folder's name.
//   1. configuration: no [qualityReports] qualityReportsRootDirPath, or one that is not a directory, is refused by name;
//   2. the live graph's report is found by identity: in a folder named for no graph, and under a renamed passport;
//      another build under the same name is NOT the live graph's; of two reports of the live build, the newer rater data wins;
//   3. the catalog names what it cannot read (bad JSON, no page file, a wrong format, a name that is not bare), never drops it,
//      and still answers, saying why, when the live graph cannot be identified;
//   4. page: the blocks are the page file's own; an unknown or unreadable folder, and a path, are refused by name;
//   5. file: each registered download is the folder's own bytes; an unknown download, a certificate stem the page does not
//      list, and a file the folder lacks are refused by name.
// Hermetic: the real committed report (qualityReports/GOLD_261106_useCases) is copied into scratch roots; the golden is a
// stub whose passport reads as each case says.
// RED BEFORE: the access point and mapper do not exist (every item fails at load).
//
// Run: node server/test/quality-reports.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const configBySection = {};
process.global = {
	getConfig: (sectionName) => configBySection[sectionName] || {},
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, debug: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const SERVER_PATH = path.join(__dirname, '..');
const ACCESS_POINT_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d', 'quality-reports.js');
const MAPPER_PATH = path.join(SERVER_PATH, 'data-model', 'data-mapping', 'mappers', 'quality-reports.js');
const COMMITTED_REPORT_DIR_PATH = path.join(SERVER_PATH, '..', 'qualityReports', 'GOLD_261106_useCases');
const PAGE_FILE_NAME = 'qualityReportPage.json';

let passedCount = 0;
let failedCount = 0;
const check = (label, passed, detail = '') => {
	if (passed) { passedCount++; } else { failedCount++; }
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${String(detail).slice(0, 400)}`}`);
};
const runInOrder = (stepList, callback) => {
	const runNext = (stepIndex) => {
		if (stepIndex === stepList.length) { callback(); return; }
		stepList[stepIndex](() => setImmediate(() => runNext(stepIndex + 1)));
	};
	runNext(0);
};

// this test's own statement of the identity rule, independent of the server's code
const testIdentityOf = ({ manifestRefId, graphContractSha256 }) => crypto.createHash('sha256').update(`${manifestRefId}|${graphContractSha256}`, 'utf8').digest('hex');

const committedPage = JSON.parse(fs.readFileSync(path.join(COMMITTED_REPORT_DIR_PATH, PAGE_FILE_NAME), 'utf8'));
const liveStamp = committedPage.graphStamp;
const OTHER_MANIFEST_REF_ID = 'a'.repeat(64);

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'qualityReports-'));
const copyReportInto = (rootDirPath, folderName, pageEdit) => {
	const folderPath = path.join(rootDirPath, folderName);
	fs.cpSync(COMMITTED_REPORT_DIR_PATH, folderPath, { recursive: true });
	if (pageEdit) {
		fs.writeFileSync(path.join(folderPath, PAGE_FILE_NAME), JSON.stringify(pageEdit(JSON.parse(JSON.stringify(committedPage)))));
	}
	return folderPath;
};
const makeRoot = (rootName) => {
	const rootDirPath = path.join(scratchDirPath, rootName);
	fs.mkdirSync(rootDirPath);
	return rootDirPath;
};

// root A: the live report in a folder named for no graph, an OLDER rater snapshot of the same build, another build under the
// live graph's very name, and four folders the catalog cannot read
const rootA = makeRoot('rootA');
copyReportInto(rootA, 'folderNamedForNoGraph');
copyReportInto(rootA, 'sameBuildOlderRaterData', (page) => ({ ...page, raterDataLastSavedAt: '2026-10-01T00:00:00.000Z' }));
copyReportInto(rootA, 'sameNameOtherBuild', (page) => ({ ...page, graphStamp: { ...page.graphStamp, manifestRefId: OTHER_MANIFEST_REF_ID, builtAt: '2026-01-01T00:00:00.000Z' } }));
fs.writeFileSync(path.join(copyReportInto(rootA, 'badJson'), PAGE_FILE_NAME), '{ not json');
fs.rmSync(path.join(copyReportInto(rootA, 'noPageFile'), PAGE_FILE_NAME));
copyReportInto(rootA, 'wrongFormat', (page) => ({ ...page, pageFormat: 'educoreQualityReportPage/0' }));
copyReportInto(rootA, 'unknownBlock', (page) => ({ ...page, report: { ...page.report, blockList: [{ blockKind: 'chart' }] } }));
copyReportInto(rootA, 'has space');

const passportDbOf = (passportRowList) => ({ runQuery: (cypherText, params, callback) => setImmediate(() => callback('', /GraphProvenance/.test(cypherText) ? passportRowList : [])) });
const livePassport = { graphName: liveStamp.graphName, manifestRefId: liveStamp.manifestRefId, graphContractSha256: liveStamp.graphContractSha256 };

const accessPointFor = (neo4jDb) => {
	const accessPointByName = {};
	require(ACCESS_POINT_PATH)({
		dotD: { logList: [], library: { add: (loadedName, serviceFunction) => { accessPointByName[loadedName] = serviceFunction; } } },
		passThroughParameters: { neo4jDb, dataMapping: { 'quality-reports': require(MAPPER_PATH)({}) } },
	});
	return accessPointByName['quality-reports'];
};
const configureRoot = (rootDirPath) => { configBySection.qualityReports = rootDirPath === undefined ? {} : { qualityReportsRootDirPath: rootDirPath }; };
const ask = (neo4jDb, xQuery, callback) => accessPointFor(neo4jDb)(xQuery, (errorText, result) => callback(errorText || '', result));

const stepList = [
	(done) => {
		console.log('1. configuration');
		configureRoot(undefined);
		ask(passportDbOf([livePassport]), { action: 'catalog' }, (errorText) => {
			check('1.1 no qualityReportsRootDirPath is refused qualityReportsNotConfigured', /^qualityReportsNotConfigured:/.test(errorText), errorText);
			configureRoot(path.join(scratchDirPath, 'noSuchRoot'));
			ask(passportDbOf([livePassport]), { action: 'catalog' }, (absentError) => {
				check('1.2 a root that is not a directory is refused qualityReportsRootAbsent', /^qualityReportsRootAbsent:/.test(absentError), absentError);
				done();
			});
		});
	},
	(done) => {
		console.log('2. the live graph\'s report, by identity');
		configureRoot(rootA);
		ask(passportDbOf([livePassport]), { action: 'catalog' }, (errorText, catalog) => {
			check('2.1 the catalog answers', !errorText && catalog, errorText);
			if (errorText) { done(); return; }
			check('2.2 the live graph is identified by this test\'s own rule', catalog.liveGraph.graphIdentitySha256 === testIdentityOf(livePassport), JSON.stringify(catalog.liveGraph));
			check('2.3 the live report is the folder named for no graph (newer rater data than its sibling)', catalog.liveReportFolderName === 'folderNamedForNoGraph', catalog.liveReportFolderName);
			const entryOf = (folderName) => catalog.reportList.find((oneEntry) => oneEntry.folderName === folderName);
			check('2.4 the older rater snapshot of the same build is also the live graph\'s, listed after it', entryOf('sameBuildOlderRaterData').isLiveGraph && catalog.reportList.indexOf(entryOf('sameBuildOlderRaterData')) > catalog.reportList.indexOf(entryOf('folderNamedForNoGraph')));
			check('2.5 another build under the live graph\'s name is NOT the live graph\'s', entryOf('sameNameOtherBuild') && entryOf('sameNameOtherBuild').graphName === liveStamp.graphName && entryOf('sameNameOtherBuild').isLiveGraph === false);
			check('2.6 newest build first: the 2026-01-01 build is last', catalog.reportList[catalog.reportList.length - 1].folderName === 'sameNameOtherBuild', catalog.reportList.map((oneEntry) => oneEntry.folderName).join(','));
			check('2.7 an entry carries the dates and ids the history shows', ['builtAt', 'raterDataLastSavedAt', 'manifestLabel', 'graphIdentitySha256', 'manifestRefId'].every((fieldName) => typeof entryOf('folderNamedForNoGraph')[fieldName] === 'string'));
			ask(passportDbOf([{ ...livePassport, graphName: 'GOLD_renamedPromotion' }]), { action: 'catalog' }, (renamedError, renamedCatalog) => {
				check('2.8 a renamed promotion of the same graph keeps its report', !renamedError && renamedCatalog.liveReportFolderName === 'folderNamedForNoGraph', renamedError || renamedCatalog.liveReportFolderName);
				ask(passportDbOf([{ ...livePassport, manifestRefId: 'b'.repeat(64) }]), { action: 'catalog' }, (otherError, otherCatalog) => {
					check('2.9 a live build with no report has liveReportFolderName null', !otherError && otherCatalog.liveReportFolderName === null && otherCatalog.reportList.every((oneEntry) => !oneEntry.isLiveGraph), otherError || otherCatalog.liveReportFolderName);
					done();
				});
			});
		});
	},
	(done) => {
		console.log('3. what the catalog cannot read, and an unidentifiable live graph');
		ask(passportDbOf([livePassport]), { action: 'catalog' }, (errorText, catalog) => {
			const reasonOf = (folderName) => (catalog.unreadableFolderList.find((oneFolder) => oneFolder.folderName === folderName) || {}).unreadableReason || '';
			check('3.1 bad JSON is listed with its parse fault', /qualityReportPage\.json:/.test(reasonOf('badJson')), reasonOf('badJson'));
			check('3.2 a folder with no page file is listed, telling how to make one', /holds no qualityReportPage\.json/.test(reasonOf('noPageFile')), reasonOf('noPageFile'));
			check('3.3 another page format is listed by name', /pageFormat is 'educoreQualityReportPage\/0'/.test(reasonOf('wrongFormat')), reasonOf('wrongFormat'));
			check('3.4 an unknown block kind is listed, never drawn', /"chart"/.test(reasonOf('unknownBlock')), reasonOf('unknownBlock'));
			check('3.5 a folder name that is not bare is listed', /not a bare folder name/.test(reasonOf('has space')), reasonOf('has space'));
			check('3.6 no unreadable folder is in the report list', !catalog.reportList.some((oneEntry) => ['badJson', 'noPageFile', 'wrongFormat', 'unknownBlock', 'has space'].includes(oneEntry.folderName)));
			ask(null, { action: 'catalog' }, (noDbError, noDbCatalog) => {
				check('3.7 with no golden handle the catalog still answers, says why, and calls no report live', !noDbError && /no golden graph handle/.test(noDbCatalog.liveGraph.unidentifiedReason) && noDbCatalog.liveReportFolderName === null, noDbError);
				ask(passportDbOf([livePassport, livePassport]), { action: 'catalog' }, (twoError, twoCatalog) => {
					check('3.8 two passports: unidentified, with the count', !twoError && /2 passport/.test(twoCatalog.liveGraph.unidentifiedReason), twoError);
					done();
				});
			});
		});
	},
	(done) => {
		console.log('4. page');
		ask(passportDbOf([livePassport]), { action: 'page', reportFolderName: 'folderNamedForNoGraph' }, (errorText, pageResult) => {
			check('4.1 the page answers its catalog entry and the page file\'s own blocks', !errorText && pageResult.catalogEntry.isLiveGraph && JSON.stringify(pageResult.report) === JSON.stringify(committedPage.report) && pageResult.certificateList.length === committedPage.certificateList.length, errorText);
			ask(passportDbOf([livePassport]), { action: 'page', reportFolderName: 'noSuchFolder' }, (unknownError) => {
				check('4.2 an unknown folder is refused qualityReportUnknownFolder', /^qualityReportUnknownFolder:/.test(unknownError), unknownError);
				ask(passportDbOf([livePassport]), { action: 'page', reportFolderName: 'badJson' }, (badError) => {
					check('4.3 an unreadable folder is refused qualityReportUnreadable with its reason', /^qualityReportUnreadable: badJson:/.test(badError), badError);
					ask(passportDbOf([livePassport]), { action: 'page', reportFolderName: '../rootA/folderNamedForNoGraph' }, (pathError) => {
						check('4.4 a path is not a folder name', /^qualityReportUnknownFolder:/.test(pathError), pathError);
						done();
					});
				});
			});
		});
	},
	(done) => {
		console.log('5. file');
		const folderPath = path.join(rootA, 'folderNamedForNoGraph');
		ask(passportDbOf([livePassport]), { action: 'file', reportFolderName: 'folderNamedForNoGraph', downloadName: 'reportMarkdown' }, (errorText, fileResult) => {
			check('5.1 reportMarkdown is the folder\'s own qualityReport.md, as markdown', !errorText && fileResult.contentBuffer.equals(fs.readFileSync(path.join(folderPath, 'qualityReport.md'))) && /^text\/markdown/.test(fileResult.contentType), errorText);
			ask(passportDbOf([livePassport]), { action: 'file', reportFolderName: 'folderNamedForNoGraph', downloadName: 'certificateHtml', certificateStem: 'CASE' }, (certificateError, certificateResult) => {
				check('5.2 certificateHtml for a listed stem is its certificates/ file', !certificateError && certificateResult.contentBuffer.equals(fs.readFileSync(path.join(folderPath, 'certificates', 'CASE.html'))), certificateError);
				ask(passportDbOf([livePassport]), { action: 'file', reportFolderName: 'folderNamedForNoGraph', downloadName: 'everything' }, (unknownError) => {
					check('5.3 an unknown download is refused qualityReportDownloadUnknown', /^qualityReportDownloadUnknown:/.test(unknownError), unknownError);
					ask(passportDbOf([livePassport]), { action: 'file', reportFolderName: 'folderNamedForNoGraph', downloadName: 'certificateMarkdown', certificateStem: '../qualityReport' }, (stemError) => {
						check('5.4 a stem the page does not list is refused qualityReportCertificateUnknown', /^qualityReportCertificateUnknown:/.test(stemError), stemError);
						fs.rmSync(path.join(folderPath, 'qualityReport.html'));
						ask(passportDbOf([livePassport]), { action: 'file', reportFolderName: 'folderNamedForNoGraph', downloadName: 'reportHtml' }, (absentError) => {
							check('5.5 a file the folder lacks is refused qualityReportFileAbsent', /^qualityReportFileAbsent:/.test(absentError), absentError);
							ask(passportDbOf([livePassport]), { action: 'everything' }, (actionError) => {
								check('5.6 an unknown action is refused, naming the actions', /catalog, page, file/.test(actionError), actionError);
								done();
							});
						});
					});
				});
			});
		});
	},
];

runInOrder(stepList, () => {
	fs.rmSync(scratchDirPath, { recursive: true });
	console.log(`\n${passedCount} passed, ${failedCount} failed`);
	process.exit(failedCount === 0 ? 0 : 1);
});
