#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[AccessPointPattern]]

// quality-reports — the published mapping-quality reports for the Certification page (TQ 2026-11-08). Input { action, ... };
// one handler per action, chosen from handlerByActionName:
//   catalog  {}                                         → { liveGraph, liveReportFolderName, reportList, unreadableFolderList }
//            every report in [qualityReports] qualityReportsRootDirPath, newest graph build first; liveGraph is the golden this
//            server serves ({ graphName, graphIdentitySha256 } or { unidentifiedReason }); liveReportFolderName is the newest
//            report filed under the live graph's identity, or null when that build has none yet. A folder that is not a
//            report this server can read is listed in unreadableFolderList with its reason, never silently left out.
//   page     { reportFolderName }                       → { catalogEntry, report, certificateList }
//   file     { reportFolderName, downloadName, certificateStem? } → { fileName, contentType, byteSize, contentBuffer }
//            downloadName is one of the mapper's DOWNLOAD_BY_NAME; a certificate download names a stem the page lists
//
// A REPORT IS FILED UNDER ITS GRAPH BY CONTENT IDENTITY (graph-identity.js), computed from the stamp inside its own page file,
// never by its folder's name; the live golden's identity is computed the same way from its passport (READ-ONLY handle). So a
// renamed promotion keeps its report, a rollback shows the restored graph's report, and another build under the same name
// shows none. The page file is the generator's (reportPageBuilder.js); nothing here re-words or recomputes a figure.
//
// Refuses by name (every refusal text begins with its name): qualityReportsNotConfigured, qualityReportsRootAbsent,
// qualityReportUnknownFolder, qualityReportUnreadable, qualityReportDownloadUnknown, qualityReportCertificateUnknown,
// qualityReportFileAbsent, and an unknown action. An unidentifiable live graph is not a refusal: the catalog still answers,
// and says why no report can be called the live graph's.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const fs = require('fs');
const path = require('path');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { graphIdentityOf } = require('../../lib/graph-identity');

const CONFIG_SECTION_NAME = 'qualityReports';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { getConfig } = process.global;
	const { neo4jDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping[moduleName];

	const refusalOf = (refusalName, reasonText) => `${refusalName}: ${reasonText}`;

	// ================================================================================
	// THE LIVE GRAPH — its identity from its passport; a graph that cannot be identified is said so, not refused

	const readLiveGraph = (callback) => {
		if (!neo4jDb) {
			callback('', { unidentifiedReason: 'this server has no golden graph handle (a [dataModelExplorerSearch] configuration fault; the startup log names it)' });
			return;
		}
		const passportQuery = mapper.getCypher('goldenPassport');
		// neo4j-instance calls back from inside the driver's promise; the work after the read starts on its own tick
		neo4jDb.runQuery(passportQuery.cypher, passportQuery.params, (queryError, passportRowList) => setImmediate(() => {
			if (queryError) {
				callback('', { unidentifiedReason: `reading the golden's passport failed: ${queryError}` });
				return;
			}
			if (passportRowList.length !== 1) {
				callback('', { unidentifiedReason: `the golden holds ${passportRowList.length} passport(s); exactly one is needed to identify it` });
				return;
			}
			const identity = graphIdentityOf(passportRowList[0]);
			if (identity.refusalText) {
				callback('', { unidentifiedReason: identity.refusalText });
				return;
			}
			callback('', { graphName: passportRowList[0].graphName, graphIdentitySha256: identity.graphIdentitySha256 });
		}));
	};

	// ================================================================================
	// THE REPORT FOLDERS — each read, shape-checked and identified from its own page file

	const rootDirPathOf = () => {
		const rootDirPath = (getConfig(CONFIG_SECTION_NAME) || {}).qualityReportsRootDirPath;
		if (typeof rootDirPath !== 'string' || rootDirPath === '') {
			return { refusalText: refusalOf('qualityReportsNotConfigured', `this server declares no [${CONFIG_SECTION_NAME}] qualityReportsRootDirPath`) };
		}
		if (!fs.existsSync(rootDirPath) || !fs.statSync(rootDirPath).isDirectory()) {
			return { refusalText: refusalOf('qualityReportsRootAbsent', `[${CONFIG_SECTION_NAME}] qualityReportsRootDirPath ${rootDirPath} is not a directory`) };
		}
		return { rootDirPath };
	};

	// one folder's page: { page, graphIdentitySha256 } or { unreadableReason }
	const readFolderPage = ({ rootDirPath, folderName }) => {
		const pageFilePath = path.join(rootDirPath, folderName, mapper.PAGE_FILE_NAME);
		if (!fs.existsSync(pageFilePath)) {
			return { unreadableReason: `it holds no ${mapper.PAGE_FILE_NAME} (regenerate it with qualityReport.js -build)` };
		}
		let page;
		// the page is a file from outside this process: a parse fault is turned into a named reason here
		try {
			page = JSON.parse(fs.readFileSync(pageFilePath, 'utf8'));
		} catch (parseError) {
			return { unreadableReason: `${mapper.PAGE_FILE_NAME}: ${parseError.message}` };
		}
		const shapeFault = mapper.pageShapeFaultOf(page);
		if (shapeFault) {
			return { unreadableReason: `${mapper.PAGE_FILE_NAME}: ${shapeFault}` };
		}
		const identity = graphIdentityOf(page.graphStamp);
		if (identity.refusalText) {
			return { unreadableReason: `${mapper.PAGE_FILE_NAME}: ${identity.refusalText}` };
		}
		return { page, graphIdentitySha256: identity.graphIdentitySha256 };
	};

	const readCatalog = (callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const rootRead = rootDirPathOf();
			next(rootRead.refusalText || '', { ...args, rootDirPath: rootRead.rootDirPath });
		});

		taskList.push((args, next) => readLiveGraph((liveError, liveGraph) => next(liveError, { ...args, liveGraph })));

		taskList.push((args, next) => {
			const folderNameList = fs.readdirSync(args.rootDirPath, { withFileTypes: true }).filter((oneDirEntry) => oneDirEntry.isDirectory()).map((oneDirEntry) => oneDirEntry.name).sort();
			const folderReadList = folderNameList.map((folderName) => ({ folderName, ...(mapper.FOLDER_NAME_PATTERN.test(folderName) ? readFolderPage({ rootDirPath: args.rootDirPath, folderName }) : { unreadableReason: 'its name is not a bare folder name this server serves' }) }));
			const reportList = folderReadList
				.filter((oneRead) => oneRead.page)
				.map((oneRead) => mapper.mapCatalogEntry({ folderName: oneRead.folderName, page: oneRead.page, graphIdentitySha256: oneRead.graphIdentitySha256, isLiveGraph: oneRead.graphIdentitySha256 === args.liveGraph.graphIdentitySha256 }))
				.sort(mapper.catalogOrderOf);
			const liveReportEntry = reportList.find((oneEntry) => oneEntry.isLiveGraph);
			next('', {
				...args,
				catalog: {
					liveGraph: args.liveGraph,
					liveReportFolderName: liveReportEntry ? liveReportEntry.folderName : null,
					reportList,
					unreadableFolderList: folderReadList.filter((oneRead) => oneRead.unreadableReason).map((oneRead) => ({ folderName: oneRead.folderName, unreadableReason: oneRead.unreadableReason })),
				},
				folderReadList,
			});
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', { catalog: args.catalog, folderReadList: args.folderReadList, rootDirPath: args.rootDirPath });
		});
	};

	// a folder named by the request, found only among the catalog's own readable folders
	const readNamedReport = (reportFolderName, callback) => {
		readCatalog((catalogError, catalogRead) => {
			if (catalogError) {
				callback(catalogError);
				return;
			}
			const catalogEntry = catalogRead.catalog.reportList.find((oneEntry) => oneEntry.folderName === reportFolderName);
			if (!catalogEntry) {
				const unreadable = catalogRead.catalog.unreadableFolderList.find((oneFolder) => oneFolder.folderName === reportFolderName);
				callback(unreadable ? refusalOf('qualityReportUnreadable', `${reportFolderName}: ${unreadable.unreadableReason}`) : refusalOf('qualityReportUnknownFolder', `'${reportFolderName}' is not a report folder; the reports are ${catalogRead.catalog.reportList.map((oneEntry) => oneEntry.folderName).join(', ') || 'none'}`));
				return;
			}
			const folderRead = catalogRead.folderReadList.find((oneRead) => oneRead.folderName === reportFolderName);
			callback('', { catalogEntry, page: folderRead.page, reportDirPath: path.join(catalogRead.rootDirPath, reportFolderName) });
		});
	};

	// ================================================================================
	// ACTIONS

	const answerCatalog = (xQuery, callback) => readCatalog((catalogError, catalogRead) => callback(catalogError || '', catalogError ? undefined : catalogRead.catalog));

	const answerPage = (xQuery, callback) => {
		readNamedReport(xQuery.reportFolderName, (reportError, namedReport) => {
			if (reportError) {
				callback(reportError);
				return;
			}
			callback('', { catalogEntry: namedReport.catalogEntry, report: namedReport.page.report, certificateList: namedReport.page.certificateList });
		});
	};

	const answerFile = (xQuery, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => readNamedReport(args.reportFolderName, (reportError, namedReport) => next(reportError, { ...args, ...namedReport })));

		// the download by its registered name; a certificate only by a stem the page lists
		taskList.push((args, next) => {
			const download = mapper.DOWNLOAD_BY_NAME[args.downloadName];
			if (!download) {
				next(refusalOf('qualityReportDownloadUnknown', `'${args.downloadName}' is not a download; the downloads are ${Object.keys(mapper.DOWNLOAD_BY_NAME).join(', ')}`), args);
				return;
			}
			if (!download.isCertificate) {
				next('', { ...args, download, filePath: path.join(args.reportDirPath, download.fileName), fileName: download.fileName });
				return;
			}
			const certificate = args.page.certificateList.find((oneCertificate) => oneCertificate.certificateStem === args.certificateStem);
			if (!certificate) {
				next(refusalOf('qualityReportCertificateUnknown', `'${args.certificateStem}' is not a certificate in ${args.reportFolderName}`), args);
				return;
			}
			const fileName = `${certificate.certificateStem}${download.fileExtension}`;
			next('', { ...args, download, filePath: path.join(args.reportDirPath, mapper.CERTIFICATE_DIRECTORY_NAME, fileName), fileName });
		});

		taskList.push((args, next) => {
			if (!fs.existsSync(args.filePath)) {
				next(refusalOf('qualityReportFileAbsent', `${args.reportFolderName} holds no ${path.relative(args.reportDirPath, args.filePath)}`), args);
				return;
			}
			fs.readFile(args.filePath, (readError, contentBuffer) => {
				if (readError) {
					next(`${moduleName}: reading ${args.filePath} failed: ${readError.message}`, args);
					return;
				}
				next('', { ...args, contentBuffer });
			});
		});

		pipeRunner(taskList.getList(), { reportFolderName: xQuery.reportFolderName, downloadName: xQuery.downloadName, certificateStem: xQuery.certificateStem }, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', { fileName: `${args.reportFolderName}_${args.fileName}`, contentType: args.download.contentType, byteSize: args.contentBuffer.length, contentBuffer: args.contentBuffer });
		});
	};

	const handlerByActionName = { catalog: answerCatalog, page: answerPage, file: answerFile };

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xQuery, callback) => {
		const actionHandler = handlerByActionName[(xQuery || {}).action];
		if (!actionHandler) {
			callback(`${moduleName}: action '${(xQuery || {}).action}' is not one of: ${Object.keys(handlerByActionName).join(', ')}`);
			return;
		}
		actionHandler(xQuery, callback);
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
