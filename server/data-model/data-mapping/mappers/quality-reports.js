#!/usr/bin/env node
'use strict';

// quality-reports.js (mapper) — the published quality reports for the Certification page (TQ 2026-11-08: a menu under Data
// Models "starts with certification"; the report for the live graph, a history of earlier ones, mainly a web page). The
// reports are written by cli/lib.d/quality-report/qualityReport.js, one folder per report, in the code repo:
//   <qualityReportsRootDirPath>/<folderName>/qualityReportPage.json   the report and certificates as blocks (the page file)
//   <qualityReportsRootDirPath>/<folderName>/qualityReport.md, .html, qualityReportData.json, certificates/<stem>.md, .html
// A report is filed under the graph it measured BY CONTENT IDENTITY (graph-identity.js: its stamp's manifestRefId and
// graphContractSha256), never by the folder's name: a promotion that renames the graph keeps its report, and another
// build under the same name does not inherit one. This mapper holds what the access point must not invent: the page file's
// declared shape, the fields a catalog entry carries out to the browser, the downloads offered (a registry), and the
// one Cypher it runs (the live golden's passport, read-only).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName }) =>
	() => {
		const PAGE_FILE_NAME = 'qualityReportPage.json';
		// written by reportPageBuilder.js; another format is refused by name, never read as this one
		const PAGE_FORMAT = 'educoreQualityReportPage/1';
		// a report folder is a bare name in the root: nothing that could leave it
		const FOLDER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
		// a certificate stem as certificateBuilder.js writes it (certificateFileStemOf)
		const CERTIFICATE_STEM_PATTERN = /^[A-Za-z0-9._-]+$/;
		// the page file's graph stamp fields the catalog shows (identity fields first)
		const STAMP_FIELD_NAME_LIST = Object.freeze(['manifestRefId', 'graphContractSha256', 'graphName', 'manifestLabel', 'builtAt']);
		// the document blocks the page carries (documentRenderer.js BLOCK_KIND_LIST); an unknown kind is refused, never drawn
		const BLOCK_KIND_LIST = Object.freeze(['heading', 'paragraph', 'list', 'table', 'callout', 'stamp']);

		// THE DOWNLOADS (DATA): each name, the file it serves, and its content type. A certificate download names its stem,
		// which must be one the page file lists; nothing from the request is used as a path.
		const DOWNLOAD_BY_NAME = Object.freeze({
			reportMarkdown: { isCertificate: false, fileName: 'qualityReport.md', contentType: 'text/markdown; charset=utf-8' },
			reportHtml: { isCertificate: false, fileName: 'qualityReport.html', contentType: 'text/html; charset=utf-8' },
			reportData: { isCertificate: false, fileName: 'qualityReportData.json', contentType: 'application/json; charset=utf-8' },
			certificateMarkdown: { isCertificate: true, fileExtension: '.md', contentType: 'text/markdown; charset=utf-8' },
			certificateHtml: { isCertificate: true, fileExtension: '.html', contentType: 'text/html; charset=utf-8' },
		});
		const CERTIFICATE_DIRECTORY_NAME = 'certificates';

		const CYPHER_BY_NAME = Object.freeze({
			goldenPassport: 'MATCH (p:GraphProvenance) RETURN p.graphName AS graphName, p.manifestRefId AS manifestRefId, p.graphContractSha256 AS graphContractSha256',
		});
		const getCypher = (queryName) => {
			if (!CYPHER_BY_NAME[queryName]) {
				throw new Error(`${moduleName}: unknown query name '${queryName}'; known: ${Object.keys(CYPHER_BY_NAME).join(', ')}`);
			}
			return { cypher: CYPHER_BY_NAME[queryName], params: {} };
		};

		const blockFaultOf = (block) => (!block || BLOCK_KIND_LIST.indexOf(block.blockKind) === -1 ? `a block of kind ${JSON.stringify(block && block.blockKind)}` : '');
		const documentFaultOf = (documentPart, partName) => {
			if (!documentPart || typeof documentPart.titleText !== 'string' || !Array.isArray(documentPart.blockList)) {
				return `${partName} lacks titleText or blockList`;
			}
			const blockFaultList = documentPart.blockList.map(blockFaultOf).filter((faultText) => faultText !== '');
			return blockFaultList.length ? `${partName} holds ${blockFaultList[0]}, which is not one of ${BLOCK_KIND_LIST.join(', ')}` : '';
		};

		// pageShapeFaultOf — '' or why a parsed qualityReportPage.json is not a page this server can serve
		const pageShapeFaultOf = (page) => {
			if (!page || typeof page !== 'object') {
				return 'it is not a JSON object';
			}
			if (page.pageFormat !== PAGE_FORMAT) {
				return `its pageFormat is '${page.pageFormat}', not '${PAGE_FORMAT}'`;
			}
			const absentStampList = STAMP_FIELD_NAME_LIST.filter((fieldName) => !page.graphStamp || typeof page.graphStamp[fieldName] !== 'string' || page.graphStamp[fieldName] === '');
			if (absentStampList.length) {
				return `its graphStamp lacks ${absentStampList.join(', ')}`;
			}
			if (typeof page.raterDataLastSavedAt !== 'string' || page.raterDataLastSavedAt === '') {
				return 'it lacks raterDataLastSavedAt';
			}
			if (!page.generatorCommit || typeof page.generatorCommit !== 'object') {
				return 'it lacks generatorCommit';
			}
			if (!Array.isArray(page.certificateList)) {
				return 'it lacks certificateList';
			}
			const certificateFaultList = page.certificateList.map((oneCertificate, certificateIndex) => {
				if (!oneCertificate || !CERTIFICATE_STEM_PATTERN.test(`${oneCertificate.certificateStem}`) || typeof oneCertificate.source !== 'string' || typeof oneCertificate.standardName !== 'string') {
					return `certificate ${certificateIndex} lacks a certificateStem, source or standardName`;
				}
				return documentFaultOf(oneCertificate, `certificate ${oneCertificate.certificateStem}`);
			});
			return [documentFaultOf(page.report, 'report'), ...certificateFaultList].filter((faultText) => faultText !== '')[0] || '';
		};

		// one catalog row, from a folder's page and the identity computed from its stamp
		const mapCatalogEntry = ({ folderName, page, graphIdentitySha256, isLiveGraph }) => ({
			folderName,
			graphIdentitySha256,
			...STAMP_FIELD_NAME_LIST.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: page.graphStamp[fieldName] }), {}),
			raterDataLastSavedAt: page.raterDataLastSavedAt,
			// as the generator recorded it: { commitRefId, isWorkingTreeClean } or, when git could not say, its commitAbsentReason
			generatorCommit: page.generatorCommit,
			certificateCount: page.certificateList.length,
			isLiveGraph,
		});

		// the history order: the newest graph build first, and for one build the newest rater data first
		const catalogOrderOf = (entryA, entryB) => entryB.builtAt.localeCompare(entryA.builtAt) || entryB.raterDataLastSavedAt.localeCompare(entryA.raterDataLastSavedAt) || entryA.folderName.localeCompare(entryB.folderName);

		return {
			PAGE_FILE_NAME,
			FOLDER_NAME_PATTERN,
			CERTIFICATE_STEM_PATTERN,
			DOWNLOAD_BY_NAME,
			CERTIFICATE_DIRECTORY_NAME,
			getCypher,
			pageShapeFaultOf,
			mapCatalogEntry,
			catalogOrderOf,
		};
	};

module.exports = moduleFunction({ moduleName });
