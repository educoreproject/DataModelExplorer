#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[AccessPointPattern]]

// standard-downloads — the standard downloads for the golden this server serves (WORKORDER-standardDownloads-101526 §3b).
// Input { action, ... }; one handler per action, chosen from handlerByActionName:
//   manifest  { family?, group?, standardKey?, facet? }  → { graphName, graphIdentitySha256, graphContractSha256, generatedAt, entryList }
//             each filter given matches its entry field exactly; an absent filter does not filter. graphName is the manifest's
//             own (the graph that generated the downloads), shown, never compared
//   file      { downloadId }                             → { downloadId, fileName, byteSize, sha256, contentBuffer }
//   ⟪ML3.1c⟫ publications     {}                         → { graphName, publicLabel, manifestRefId, generatedAt, entryList }
//             the gold's published mapping sets, their registries and contexts, and the card download per hub release, as
//             educoreForge -indexPublication listed them in <folderName>/publicationDownloads.json
//   ⟪ML3.1c⟫ publicationFile  { downloadId }             → { downloadId, fileName, contentType, byteSize, sha256, contentBuffer }
//
// Every request first proves the downloads belong to the golden BY ITS CONTENT IDENTITY, never its name
// (WORKORDER-downloadsByIdentity-110626): the golden passport's manifestRefId and graphContractSha256 (read on the golden
// READ-ONLY handle) hash to its graphIdentitySha256 (graph-identity.js); [standardDownloads] downloadArtifactsRootDirPath /
// downloadsIdentityIndex.json must hold exactly one entry for it; that entry's folder's downloads.json must be the very bytes the
// entry recorded (sha256) and carry the passport's graphContractSha256. Stale downloads are never served. Neither the passport's
// graphName nor the container name ([dataModelExplorerSearch] goldenContainerName) is used to find or check anything: one
// downloads set serves every container that holds the graph, and another build under the same name is refused.
//
// A file is served only by a downloadId the manifest lists as available; the path read is the manifest's own bare
// fileName in the golden's directory, never anything from the request. Its sha256 is computed before it is answered and
// must equal the manifest's (downloadChecksumMismatch otherwise).
//
// Refuses by name (every refusal text begins with its name): downloadsNotConfigured, downloadsGraphUnidentified,
// downloadsIdentityIndexAbsent, downloadsIdentityIndexUnreadable, downloadsAbsentForGolden,
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
const { graphIdentityOf, readIndex, entryForIdentity, INDEX_FILE_NAME } = require('../../lib/standard-downloads/downloads-identity');

const CONFIG_SECTION_NAME = 'standardDownloads';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { getConfig } = process.global;
	const { neo4jDb, dataMapping } = passThroughParameters;
	const mapper = dataMapping[moduleName];

	const refusalOf = (refusalName, reasonText) => `${refusalName}: ${reasonText}`;

	// ================================================================================
	// THE GOLDEN'S DOWNLOADS — located, read and proved against the golden on every request

	// THE DOWNLOADS FOLLOW THE GRAPH'S CONTENT, NEVER ITS NAME (TQ 2026-11-06; WORKORDER-downloadsByIdentity-110626). The passport's
	// manifestRefId and graphContractSha256 make the identity (graph-identity.js); the folder index names the one folder recorded for
	// it and the sha256 of that folder's downloads.json bytes. The original, its byte copy on production, a renamed promotion and a
	// zero-spend replay of the same manifest are one graph and share one downloads set; another build under the same name is not.
	const readVerifiedManifest = (callback) => {
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const rootDirPath = (getConfig(CONFIG_SECTION_NAME) || {}).downloadArtifactsRootDirPath;
			if (typeof rootDirPath !== 'string' || rootDirPath === '') {
				next(refusalOf('downloadsNotConfigured', `this server declares no [${CONFIG_SECTION_NAME}] downloadArtifactsRootDirPath`), args);
				return;
			}
			if (!neo4jDb) {
				next(refusalOf('downloadsNotConfigured', 'this server has no golden graph handle (a [dataModelExplorerSearch] configuration fault; the startup log names it)'), args);
				return;
			}
			next('', { ...args, rootDirPath });
		});

		// the golden's passport, and the identity it carries
		taskList.push((args, next) => {
			const passportQuery = mapper.getCypher('goldenPassport');
			// neo4j-instance calls back from inside the driver's promise and turns a later throw into a second callback
			// naming the query; the work after the read therefore starts on its own tick
			neo4jDb.runQuery(passportQuery.cypher, passportQuery.params, (queryError, passportRowList) => setImmediate(() => {
				if (queryError) {
					next(`${moduleName}: reading the golden's passport failed: ${queryError}`, args);
					return;
				}
				if (passportRowList.length !== 1) {
					next(refusalOf('downloadsGraphUnidentified', `the golden holds ${passportRowList.length} passport(s); exactly one is needed to identify it`), args);
					return;
				}
				const goldenPassport = passportRowList[0];
				const identity = graphIdentityOf(goldenPassport);
				if (identity.refusalText) {
					next(refusalOf('downloadsGraphUnidentified', identity.refusalText), args);
					return;
				}
				next('', { ...args, goldenPassport, graphIdentitySha256: identity.graphIdentitySha256 });
			}));
		});

		// the index's one entry for that identity, and the folder it names
		taskList.push((args, next) => {
			const indexRead = readIndex(args.rootDirPath);
			if (indexRead.refusalText) {
				next(indexRead.refusalText, args);
				return;
			}
			const indexEntry = entryForIdentity(indexRead.index, args.graphIdentitySha256);
			if (!indexEntry) {
				next(refusalOf('downloadsAbsentForGolden', `no downloads are recorded for the golden '${args.goldenPassport.graphName}' (identity ${args.graphIdentitySha256}, manifest ${args.goldenPassport.manifestRefId}) in ${path.join(args.rootDirPath, INDEX_FILE_NAME)}`), args);
				return;
			}
			const downloadsDirPath = path.join(args.rootDirPath, indexEntry.folderName);
			const manifestFilePath = path.join(downloadsDirPath, mapper.MANIFEST_FILE_NAME);
			if (!fs.existsSync(manifestFilePath)) {
				next(refusalOf('downloadsAbsentForGolden', `the index binds the golden '${args.goldenPassport.graphName}' to folder '${indexEntry.folderName}', which holds no ${mapper.MANIFEST_FILE_NAME} (${downloadsDirPath})`), args);
				return;
			}
			next('', { ...args, indexEntry, downloadsDirPath, manifestFilePath });
		});

		// the manifest: the very bytes the entry recorded, of a shape this server serves, under the golden's contract
		taskList.push((args, next) => {
			const manifestBuffer = fs.readFileSync(args.manifestFilePath);
			const manifestSha256 = crypto.createHash('sha256').update(manifestBuffer).digest('hex');
			if (manifestSha256 !== args.indexEntry.downloadsManifestSha256) {
				next(refusalOf('downloadsManifestMismatch', `${args.manifestFilePath} hashes to ${manifestSha256}; the index recorded ${args.indexEntry.downloadsManifestSha256} for this graph. Record the downloads again for this golden.`), args);
				return;
			}
			let manifest;
			// the manifest is a file from outside this process: a parse fault is turned into a named refusal here
			try {
				manifest = JSON.parse(manifestBuffer.toString('utf8'));
			} catch (parseError) {
				next(refusalOf('downloadsManifestUnreadable', `${args.manifestFilePath}: ${parseError.message}`), args);
				return;
			}
			const shapeFault = mapper.manifestShapeFaultOf(manifest);
			if (shapeFault) {
				next(refusalOf('downloadsManifestUnreadable', `${args.manifestFilePath}: ${shapeFault}`), args);
				return;
			}
			if (manifest.graphContractSha256 !== args.goldenPassport.graphContractSha256) {
				next(refusalOf('downloadsManifestMismatch', `the manifest's graphContractSha256 ${manifest.graphContractSha256} is not the golden's ${args.goldenPassport.graphContractSha256}. Regenerate the downloads for this golden.`), args);
				return;
			}
			next('', { ...args, manifest });
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', { manifest: args.manifest, downloadsDirPath: args.downloadsDirPath, graphIdentitySha256: args.graphIdentitySha256 });
		});
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
				graphIdentitySha256: verified.graphIdentitySha256,
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
