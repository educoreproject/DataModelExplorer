#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[AccessPointPattern]]

// standard-downloads — the standard downloads for the golden this server serves (WORKORDER-standardDownloads-101526 §3b).
// Input { action, ... }; one handler per action, chosen from handlerByActionName:
//   manifest  { family?, group?, standardKey?, facet? }  → { graphName, graphContractSha256, generatedAt, entryList }
//             each filter given matches its entry field exactly; an absent filter does not filter
//   file      { downloadId }                             → { downloadId, fileName, byteSize, sha256, contentBuffer }
//   ⟪ML3.1c⟫ publications     {}                         → { graphName, publicLabel, manifestRefId, generatedAt, entryList }
//             the gold's published mapping sets, their registries and contexts, and the card download per hub release, as
//             educoreForge -indexPublication listed them in <graphName>/publicationDownloads.json
//   ⟪ML3.1c⟫ publicationFile  { downloadId }             → { downloadId, fileName, contentType, byteSize, sha256, contentBuffer }
//
// Every request first proves the downloads belong to the golden: the manifest at
// [standardDownloads] downloadArtifactsRootDirPath / <[dataModelExplorerSearch] goldenContainerName> / downloads.json must
// name that graph AND the graphContractSha256 of the golden's own passport (read on the golden READ-ONLY handle), or the
// request is refused (downloadsManifestMismatch). Stale downloads are never served.
//
// A file is served only by a downloadId the manifest lists as available; the path read is the manifest's own bare
// fileName in the golden's directory, never anything from the request. Its sha256 is computed before it is answered and
// must equal the manifest's (downloadChecksumMismatch otherwise).
//
// Refuses by name (every refusal text begins with its name): downloadsNotConfigured, downloadsAbsentForGolden,
// downloadsManifestUnreadable, downloadsManifestMismatch, downloadFilterUnknown, downloadUnknownId, downloadUnavailable,
// downloadFileAbsent, downloadChecksumMismatch, and an unknown action. ⟪ML3.1c⟫ The publication listing is read only after the
// downloads manifest has been proved the golden's own (the same readVerifiedManifest), and must name the same graph; its own
// refusals: publicationsAbsentForGolden, publicationsManifestUnreadable, publicationsManifestMismatch, publicationUnknownId,
// publicationFileAbsent, publicationChecksumMismatch.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

const CONFIG_SECTION_NAME = 'standardDownloads';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { getConfig } = process.global;
	const { neo4jDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping[moduleName];

	const refusalOf = (refusalName, reasonText) => `${refusalName}: ${reasonText}`;

	// ================================================================================
	// THE GOLDEN'S DOWNLOADS — located, read and proved against the golden on every request

	const readVerifiedManifest = (callback) => {
		const rootDirPath = (getConfig(CONFIG_SECTION_NAME) || {}).downloadArtifactsRootDirPath;
		const goldenContainerName = (getConfig('dataModelExplorerSearch') || {}).goldenContainerName;
		const absentSettingList = [
			[`[${CONFIG_SECTION_NAME}] downloadArtifactsRootDirPath`, rootDirPath],
			['[dataModelExplorerSearch] goldenContainerName', goldenContainerName],
		].filter(([, settingValue]) => typeof settingValue !== 'string' || settingValue === '').map(([settingName]) => settingName);
		if (absentSettingList.length) {
			callback(refusalOf('downloadsNotConfigured', `this server declares no ${absentSettingList.join(' and no ')}`));
			return;
		}
		const downloadsDirPath = path.join(rootDirPath, goldenContainerName);
		const manifestFilePath = path.join(downloadsDirPath, mapper.MANIFEST_FILE_NAME);
		if (!fs.existsSync(manifestFilePath)) {
			callback(refusalOf('downloadsAbsentForGolden', `no downloads have been generated for the golden '${goldenContainerName}' (no ${mapper.MANIFEST_FILE_NAME} in ${downloadsDirPath})`));
			return;
		}
		let manifest;
		// the manifest is a file from outside this process: a parse fault is turned into a named refusal here
		try {
			manifest = JSON.parse(fs.readFileSync(manifestFilePath, 'utf8'));
		} catch (parseError) {
			callback(refusalOf('downloadsManifestUnreadable', `${manifestFilePath}: ${parseError.message}`));
			return;
		}
		const shapeFault = mapper.manifestShapeFaultOf(manifest);
		if (shapeFault) {
			callback(refusalOf('downloadsManifestUnreadable', `${manifestFilePath}: ${shapeFault}`));
			return;
		}
		const passportQuery = mapper.getCypher('goldenPassport');
		// neo4j-instance calls back from inside the driver's promise and turns a later throw into a second callback
		// naming the query; the work after the read therefore starts on its own tick
		neo4jDb.runQuery(passportQuery.cypher, passportQuery.params, (queryError, passportRowList) => setImmediate(() => {
			if (queryError) {
				callback(`${moduleName}: reading the golden's passport failed: ${queryError}`);
				return;
			}
			if (passportRowList.length !== 1) {
				callback(refusalOf('downloadsManifestMismatch', `the golden holds ${passportRowList.length} passport(s); one is needed to prove the downloads are its own`));
				return;
			}
			const goldenPassport = passportRowList[0];
			const mismatchList = [];
			if (manifest.graphName !== goldenContainerName || manifest.graphName !== goldenPassport.graphName) {
				mismatchList.push(`the manifest is for graph '${manifest.graphName}', this server serves '${goldenContainerName}' (passport graphName '${goldenPassport.graphName}')`);
			}
			if (manifest.graphContractSha256 !== goldenPassport.graphContractSha256) {
				mismatchList.push(`the manifest's graphContractSha256 ${manifest.graphContractSha256} is not the golden's ${goldenPassport.graphContractSha256}`);
			}
			if (mismatchList.length) {
				callback(refusalOf('downloadsManifestMismatch', `${mismatchList.join('; ')}. Regenerate the downloads for this golden.`));
				return;
			}
			callback('', { manifest, downloadsDirPath });
		}));
	};

	// ================================================================================
	// ACTIONS

	const readManifest = (xQuery, callback) => {
		const unknownFilterList = Object.keys(xQuery).filter((fieldName) => fieldName !== 'action' && !mapper.FILTER_FIELD_NAME_LIST.includes(fieldName));
		if (unknownFilterList.length) {
			callback(refusalOf('downloadFilterUnknown', `${unknownFilterList.join(', ')} ${unknownFilterList.length === 1 ? 'is' : 'are'} not a filter; the filters are ${mapper.FILTER_FIELD_NAME_LIST.join(', ')}`));
			return;
		}
		const activeFilterList = mapper.FILTER_FIELD_NAME_LIST.filter((fieldName) => xQuery[fieldName] !== undefined && xQuery[fieldName] !== null && xQuery[fieldName] !== '');
		readVerifiedManifest((manifestError, verified) => {
			if (manifestError) {
				callback(manifestError);
				return;
			}
			const { manifest } = verified;
			callback('', {
				graphName: manifest.graphName,
				graphContractSha256: manifest.graphContractSha256,
				generatedAt: manifest.generatedAt,
				filterList: activeFilterList.map((fieldName) => ({ fieldName, fieldValue: xQuery[fieldName] })),
				entryList: manifest.entryList.filter((oneEntry) => activeFilterList.every((fieldName) => oneEntry[fieldName] === xQuery[fieldName])).map(mapper.mapEntry),
			});
		});
	};

	const readFile = (xQuery, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => readVerifiedManifest((manifestError, verified) => next(manifestError, { ...args, ...verified })));

		// only an id the manifest lists, and only when it is available
		taskList.push((args, next) => {
			const entry = args.manifest.entryList.find((oneEntry) => oneEntry.downloadId === args.downloadId);
			if (!entry) {
				next(refusalOf('downloadUnknownId', `'${args.downloadId}' is not a downloadId in the manifest for '${args.manifest.graphName}'`), args);
				return;
			}
			if (entry.available !== true) {
				next(refusalOf('downloadUnavailable', `${entry.downloadId}: ${entry.unavailableReason}`), args);
				return;
			}
			next('', { ...args, entry });
		});

		// the manifest's own file, read and checked against the manifest's sha256 before a byte is answered
		taskList.push((args, next) => {
			const filePath = path.join(args.downloadsDirPath, args.entry.fileName);
			if (!mapper.ZIP_FILE_NAME_PATTERN.test(args.entry.fileName) || path.dirname(filePath) !== args.downloadsDirPath || !fs.existsSync(filePath)) {
				next(refusalOf('downloadFileAbsent', `${args.entry.downloadId}: ${args.entry.fileName} is not in ${args.downloadsDirPath}`), args);
				return;
			}
			fs.readFile(filePath, (readError, contentBuffer) => {
				if (readError) {
					next(`${moduleName}: reading ${filePath} failed: ${readError.message}`, args);
					return;
				}
				const actualSha256 = crypto.createHash('sha256').update(contentBuffer).digest('hex');
				if (actualSha256 !== args.entry.sha256) {
					next(refusalOf('downloadChecksumMismatch', `${args.entry.downloadId}: the file's sha256 is ${actualSha256}, the manifest says ${args.entry.sha256}`), args);
					return;
				}
				next('', { ...args, contentBuffer });
			});
		});

		pipeRunner(taskList.getList(), { downloadId: xQuery.downloadId }, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', { downloadId: args.entry.downloadId, fileName: args.entry.fileName, byteSize: args.contentBuffer.length, sha256: args.entry.sha256, contentBuffer: args.contentBuffer });
		});
	};

	// ================================================================================
	// ⟪ML3.1c⟫ THE PUBLICATION LISTING — read only after the golden's downloads are proved its own, and naming the same graph

	const readVerifiedPublication = (callback) => {
		readVerifiedManifest((manifestError, verified) => {
			if (manifestError) {
				callback(manifestError);
				return;
			}
			const publicationFilePath = path.join(verified.downloadsDirPath, mapper.PUBLICATION_FILE_NAME);
			if (!fs.existsSync(publicationFilePath)) {
				callback(refusalOf('publicationsAbsentForGolden', `no mapping sets or card downloads have been published for '${verified.manifest.graphName}' (no ${mapper.PUBLICATION_FILE_NAME} in ${verified.downloadsDirPath})`));
				return;
			}
			let publication;
			// the listing is a file from outside this process: a parse fault is turned into a named refusal here
			try {
				publication = JSON.parse(fs.readFileSync(publicationFilePath, 'utf8'));
			} catch (parseError) {
				callback(refusalOf('publicationsManifestUnreadable', `${publicationFilePath}: ${parseError.message}`));
				return;
			}
			const shapeFault = mapper.publicationShapeFaultOf(publication);
			if (shapeFault) {
				callback(refusalOf('publicationsManifestUnreadable', `${publicationFilePath}: ${shapeFault}`));
				return;
			}
			if (publication.graphName !== verified.manifest.graphName) {
				callback(refusalOf('publicationsManifestMismatch', `the publication listing is for graph '${publication.graphName}', the downloads are '${verified.manifest.graphName}'. Re-index the publication for this golden.`));
				return;
			}
			callback('', { publication, downloadsDirPath: verified.downloadsDirPath });
		});
	};

	const readPublications = (xQuery, callback) => {
		const unknownFieldList = Object.keys(xQuery).filter((fieldName) => fieldName !== 'action');
		if (unknownFieldList.length) {
			callback(refusalOf('downloadFilterUnknown', `${unknownFieldList.join(', ')}: the publication listing takes no filter`));
			return;
		}
		readVerifiedPublication((publicationError, verified) => {
			if (publicationError) {
				callback(publicationError);
				return;
			}
			const { publication } = verified;
			callback('', { graphName: publication.graphName, publicLabel: publication.publicLabel, manifestRefId: publication.manifestRefId, generatedAt: publication.generatedAt, entryList: publication.entryList.map(mapper.mapPublicationEntry) });
		});
	};

	const readPublicationFile = (xQuery, callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => readVerifiedPublication((publicationError, verified) => next(publicationError, { ...args, ...verified })));

		// only an id the listing names, by the listing's own relative path, which must stay inside the golden's folder
		taskList.push((args, next) => {
			const entry = args.publication.entryList.find((oneEntry) => oneEntry.downloadId === args.downloadId);
			if (!entry) {
				next(refusalOf('publicationUnknownId', `'${args.downloadId}' is not a downloadId in the publication listing for '${args.publication.graphName}'`), args);
				return;
			}
			const filePath = path.join(args.downloadsDirPath, ...entry.relativePath.split('/'));
			if (!mapper.PUBLICATION_RELATIVE_PATH_PATTERN.test(entry.relativePath) || path.relative(args.downloadsDirPath, filePath).split(path.sep).includes('..') || !fs.existsSync(filePath)) {
				next(refusalOf('publicationFileAbsent', `${entry.downloadId}: ${entry.relativePath} is not in ${args.downloadsDirPath}`), args);
				return;
			}
			next('', { ...args, entry, filePath });
		});

		// the listed file, read and checked against the listing's sha256 before a byte is answered
		taskList.push((args, next) => {
			fs.readFile(args.filePath, (readError, contentBuffer) => {
				if (readError) {
					next(`${moduleName}: reading ${args.filePath} failed: ${readError.message}`, args);
					return;
				}
				const actualSha256 = crypto.createHash('sha256').update(contentBuffer).digest('hex');
				if (actualSha256 !== args.entry.sha256) {
					next(refusalOf('publicationChecksumMismatch', `${args.entry.downloadId}: the file's sha256 is ${actualSha256}, the listing says ${args.entry.sha256}`), args);
					return;
				}
				next('', { ...args, contentBuffer });
			});
		});

		pipeRunner(taskList.getList(), { downloadId: xQuery.downloadId }, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', { downloadId: args.entry.downloadId, fileName: mapper.saveFileNameOf(args.entry.relativePath), contentType: mapper.CONTENT_TYPE_BY_PUBLICATION_KIND[args.entry.kind], byteSize: args.contentBuffer.length, sha256: args.entry.sha256, contentBuffer: args.contentBuffer });
		});
	};

	const handlerByActionName = { manifest: readManifest, file: readFile, publications: readPublications, publicationFile: readPublicationFile };

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
