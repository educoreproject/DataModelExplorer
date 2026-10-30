#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[Neo4jAbstraction]]
// @concept: [[AccessPointPattern]]

// forged-use-cases — the graph reads behind the pages that show the FORGED use cases (use-case forge Phase 5, 2026-10-30;
// PLAN-useCaseDme-103026 Phase C). Input { action, ... }; one handler per action, chosen from handlerByActionName:
//   list  {}                → { caseList }: every UcUseCase with its step and citation counts
//   byCitedStandard {}      → { citedStandardList }: every standard the cases cite, each with the cases citing it
//   case  { caseStableId }  → { useCase, stepList, citationList, citationStateCountList, contextBySection, implementationGuide }: one case, its steps in reading
//                             order (position, then codedNotation), and every data reference it reaches with its state
//   ⟪Structure tab, PLAN-useCaseStructureTab-103026⟫
//   caseStructure  { caseStableId } → { graphName, outline, extractedDocument, extractedFileName, nodeCount, edgeCount, citationCount, ... }:
//                             the case's subgraph in one read, as an outline and as one JSON document (the mapper's shaping)
//   caseSourceFile { caseStableId } → { caseStableId, sourceFileName, fileName, byteSize, sha256, sourceText }: the case's own
//                             file as the coalition wrote it, taken from inside the standard's source download (which the
//                             standard-downloads access point first proves is the golden's own and sha-checks), then checked
//                             against that zip's own SHA256SUMS. No path from the request is ever read.
// Runs on the golden READ-ONLY handle. Refuses by name: an absent or unknown action, an absent caseStableId, a case the
// graph does not hold, and a graph that holds no use cases (a required label is absent); for caseSourceFile also
// caseSourceFileNameAbsent, caseSourceDownloadAbsent, caseSourceUnlisted, caseSourceChecksumMismatch, caseSourceNotText,
// and every refusal of standard-downloads and zip-entry-reader, passed on as written.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const crypto = require('crypto');
const { makeRequiredLabelProbe } = require('../../lib/required-label-probe');
const { readZipEntry } = require('../../../lib/zip-entry-reader');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { getConfig } = process.global;
	const { neo4jDb, dataMapping, accessPointsDotD } = passThroughParameters;
	const mapper = dataMapping[moduleName];

	const probeRequiredLabels = makeRequiredLabelProbe({
		neo4jDb,
		ownerName: moduleName,
		requiredLabelList: mapper.requiredLabelList,
		absentReason: 'this graph holds no forged use cases (the EDUcore use-case standard is not in it)',
	});

	// runs one named query; a failure names the query
	const runNamedQuery = (queryName, queryParams, callback) => {
		const queryBundle = mapper.getCypher(queryName, queryParams);
		neo4jDb.runQuery(queryBundle.cypher, queryBundle.params, (queryError, recordList) => {
			if (queryError) {
				callback(`${moduleName}: ${queryName} failed: ${queryError}`);
				return;
			}
			callback('', recordList);
		});
	};

	// ================================================================================
	// ACTIONS

	const readCaseList = (callback) =>
		runNamedQuery('caseList', {}, (queryError, caseRecordList) => callback(queryError, queryError ? undefined : { caseList: caseRecordList }));

	const readCaseListByCitedStandard = (callback) =>
		runNamedQuery('caseListByCitedStandard', {}, (queryError, standardRecordList) => callback(queryError, queryError ? undefined : { citedStandardList: standardRecordList }));

	const readCase = ({ caseStableId }, callback) => {
		if (typeof caseStableId !== 'string' || caseStableId.trim() === '') {
			callback(`${moduleName}: case requires caseStableId as a non-empty string (received ${JSON.stringify(caseStableId)})`);
			return;
		}
		const taskList = new taskListPlus();

		taskList.push((args, next) =>
			runNamedQuery('caseByStableId', { caseStableId }, (queryError, caseRecordList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				if (!caseRecordList.length) {
					next(`${moduleName}: no use case in this graph has stableId '${caseStableId}'`, args);
					return;
				}
				next('', { ...args, useCase: caseRecordList[0] });
			}),
		);
		taskList.push((args, next) =>
			runNamedQuery('caseStepList', { caseStableId }, (queryError, stepRecordList) => next(queryError, { ...args, stepList: queryError ? [] : mapper.mapStepRecordList(stepRecordList) })),
		);
		taskList.push((args, next) =>
			runNamedQuery('caseCitationList', { caseStableId }, (queryError, citationRecordList) => next(queryError, { ...args, citationList: queryError ? [] : mapper.mapCitationRecordList(citationRecordList) })),
		);

		// ⟪Phase C3⟫ the context the Overview, T-Chart and Swimlane read, and the Implementation Guide
		taskList.push((args, next) =>
			runNamedQuery('caseContextList', { caseStableId }, (queryError, contextRecordList) => next(queryError, { ...args, contextBySection: queryError ? {} : mapper.mapContextRecordList(contextRecordList) })),
		);
		taskList.push((args, next) =>
			runNamedQuery('caseImplementationGuide', { caseStableId }, (queryError, guideRecordList) => next(queryError, { ...args, implementationGuide: queryError ? {} : mapper.mapImplementationGuideRecordList(guideRecordList) })),
		);

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', {
				contextBySection: args.contextBySection,
				implementationGuide: args.implementationGuide,
				useCase: args.useCase,
				stepList: args.stepList,
				citationList: args.citationList,
				citationStateCountList: mapper.citationStateCountListOf(args.citationList),
			});
		});
	};

	// ⟪Structure tab⟫ the case's subgraph, shaped by the mapper as the outline and the extracted document
	const readCaseStructure = ({ caseStableId }, callback) => {
		if (typeof caseStableId !== 'string' || caseStableId.trim() === '') {
			callback(`${moduleName}: caseStructure requires caseStableId as a non-empty string (received ${JSON.stringify(caseStableId)})`);
			return;
		}
		runNamedQuery('caseStructure', { caseStableId }, (queryError, structureRecordList) => {
			if (queryError) {
				callback(queryError);
				return;
			}
			if (!structureRecordList.length) {
				callback(`${moduleName}: no use case in this graph has stableId '${caseStableId}'`);
				return;
			}
			// the extracted document names the graph it came from; a server that declares none is refused, never guessed
			const graphName = (getConfig('dataModelExplorerSearch') || {}).goldenContainerName;
			if (typeof graphName !== 'string' || graphName === '') {
				callback(`${moduleName}: caseStructure cannot name its graph: this server declares no [dataModelExplorerSearch] goldenContainerName`);
				return;
			}
			const structure = mapper.mapStructureRecord(structureRecordList[0]);
			callback('', { ...structure, graphName, extractedDocument: { graphName, ...structure.extractedDocument }, extractedFileName: mapper.extractedFileNameOf(structure.sourceFileName, caseStableId) });
		});
	};

	const refusalOf = (refusalName, reasonText) => `${refusalName}: ${reasonText}`;

	// ⟪Structure tab⟫ the case's own source file, from inside the standard's verified source download
	const readCaseSourceFile = ({ caseStableId }, callback) => {
		if (typeof caseStableId !== 'string' || caseStableId.trim() === '') {
			callback(`${moduleName}: caseSourceFile requires caseStableId as a non-empty string (received ${JSON.stringify(caseStableId)})`);
			return;
		}
		const taskList = new taskListPlus();

		// the case, and the file name the forge recorded on it
		taskList.push((args, next) =>
			runNamedQuery('caseSourceFileName', { caseStableId }, (queryError, caseRecordList) => {
				if (queryError) {
					next(queryError, args);
					return;
				}
				if (!caseRecordList.length) {
					next(`${moduleName}: no use case in this graph has stableId '${caseStableId}'`, args);
					return;
				}
				const { sourceFileName, standardSource } = caseRecordList[0];
				if (typeof sourceFileName !== 'string' || !mapper.SOURCE_FILE_NAME_PATTERN.test(sourceFileName)) {
					next(refusalOf('caseSourceFileNameAbsent', `${caseStableId} carries sourceFileName ${JSON.stringify(sourceFileName)}, not a cases/<name>.json path`), args);
					return;
				}
				next('', { ...args, sourceFileName, standardSource });
			}),
		);

		// the ONE available source download of the case's standard, as the golden's proved manifest lists it
		taskList.push((args, next) =>
			accessPointsDotD['standard-downloads']({ action: 'manifest', family: args.standardSource, facet: mapper.SOURCE_DOWNLOAD_FACET }, (manifestError, manifestResult) => {
				if (manifestError) {
					next(manifestError, args);
					return;
				}
				const availableEntryList = manifestResult.entryList.filter((oneEntry) => oneEntry.available === true);
				if (availableEntryList.length !== 1) {
					next(refusalOf('caseSourceDownloadAbsent', `the downloads for '${manifestResult.graphName}' list ${availableEntryList.length} available ${mapper.SOURCE_DOWNLOAD_FACET} download(s) of family '${args.standardSource}'; one is needed`), args);
					return;
				}
				next('', { ...args, sourceDownloadId: availableEntryList[0].downloadId });
			}),
		);

		// the zip, sha-checked against the manifest by standard-downloads
		taskList.push((args, next) =>
			accessPointsDotD['standard-downloads']({ action: 'file', downloadId: args.sourceDownloadId }, (fileError, fileResult) => next(fileError, { ...args, zipBuffer: fileError ? null : fileResult.contentBuffer })),
		);

		// the zip's own checksum list
		taskList.push((args, next) =>
			readZipEntry({ zipBuffer: args.zipBuffer, entryName: mapper.SOURCE_CHECKSUM_ENTRY_NAME }, (readError, checksumBuffer) => next(readError, { ...args, checksumByRelativePath: readError ? {} : mapper.checksumByRelativePathOf(checksumBuffer.toString('utf8')) })),
		);

		// the case's file, which must be listed there and match its checksum before a byte is answered
		taskList.push((args, next) => {
			const listedSha256 = args.checksumByRelativePath[args.sourceFileName];
			if (!listedSha256) {
				next(refusalOf('caseSourceUnlisted', `${args.sourceDownloadId} lists no checksum for ${args.sourceFileName}`), args);
				return;
			}
			readZipEntry({ zipBuffer: args.zipBuffer, entryName: `${mapper.SOURCE_ZIP_ENTRY_PREFIX}${args.sourceFileName}` }, (readError, sourceBuffer) => {
				if (readError) {
					next(readError, args);
					return;
				}
				const actualSha256 = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
				if (actualSha256 !== listedSha256) {
					next(refusalOf('caseSourceChecksumMismatch', `${args.sourceFileName}: sha256 ${actualSha256}, SHA256SUMS says ${listedSha256}`), args);
					return;
				}
				// it travels as JSON text: it must survive that unchanged, so the browser can save the same bytes
				const sourceText = sourceBuffer.toString('utf8');
				if (!Buffer.from(sourceText, 'utf8').equals(sourceBuffer)) {
					next(refusalOf('caseSourceNotText', `${args.sourceFileName} is not UTF-8 text and cannot travel unchanged`), args);
					return;
				}
				next('', { ...args, sourceText, sourceSha256: actualSha256, sourceByteSize: sourceBuffer.length });
			});
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', { caseStableId, sourceFileName: args.sourceFileName, fileName: args.sourceFileName.split('/').pop(), byteSize: args.sourceByteSize, sha256: args.sourceSha256, sourceText: args.sourceText });
		});
	};

	// ================================================================================
	// SERVICE FUNCTION

	const handlerByActionName = {
		list: (xQuery, callback) => readCaseList(callback),
		byCitedStandard: (xQuery, callback) => readCaseListByCitedStandard(callback),
		case: (xQuery, callback) => readCase({ caseStableId: xQuery.caseStableId }, callback),
		caseStructure: (xQuery, callback) => readCaseStructure({ caseStableId: xQuery.caseStableId }, callback),
		caseSourceFile: (xQuery, callback) => readCaseSourceFile({ caseStableId: xQuery.caseStableId }, callback),
	};

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: the action is REQUIRED and must be one this access point answers
		taskList.push((args, next) => {
			const actionHandler = handlerByActionName[args.xQuery.action];
			if (!actionHandler) {
				next(`${moduleName}: action '${args.xQuery.action}' is not one of: ${Object.keys(handlerByActionName).join(', ')}`, args);
				return;
			}
			next('', { ...args, actionHandler });
		});

		// STAGE 2: the graph must hold use cases
		taskList.push((args, next) => probeRequiredLabels((probeError) => next(probeError, args)));

		// STAGE 3: the action
		taskList.push((args, next) => args.actionHandler(args.xQuery, (actionError, actionResult) => next(actionError, { ...args, actionResult })));

		pipeRunner(taskList.getList(), { xQuery: xQuery || {} }, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', args.actionResult);
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
