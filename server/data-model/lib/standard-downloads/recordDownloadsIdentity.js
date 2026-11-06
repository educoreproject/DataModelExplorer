#!/usr/bin/env node
'use strict';

// recordDownloadsIdentity — binds a downloads folder to the CONTENT identity of the graph it was generated for, in the root's
// downloadsIdentityIndex.json (WORKORDER-downloadsByIdentity-110626; downloads-identity.js). The server finds downloads only through
// this index, so a folder the forge has just written serves nothing until it is recorded here. The downloads files themselves are
// only read, never changed.
//
//   node recordDownloadsIdentity.js < '{"downloadArtifactsRootDirPath":"...","folderName":"GOLD_261030_useCases","containerName":"GOLD_261030_useCases"}'
//   stdin:  { downloadArtifactsRootDirPath, folderName, containerName }   every part required; containerName is the local graph
//           container whose passport (read on a READ-ONLY handle) gives the identity
//   stdout: one JSON line { recordOutcome: 'recorded' | 'alreadyRecorded', entry, indexFilePath }
// It refuses (stderr, the refusal's name first, exit 2) when: an input is absent; the folder has no downloads.json or one this
// server would not serve; the manifest's graphContractSha256 is not the passport's (downloadsManifestMismatch); a
// publicationDownloads.json in the folder names another manifestRefId (downloadsManifestMismatch); a NEW entry's manifest names
// another graph than the passport (downloadsManifestMismatch: at the moment downloads are first recorded, the graph that generated
// them is the one recorded, the one time a name is evidence; a renamed copy or replay of a recorded graph is alreadyRecorded by
// identity before any name is read); or the identity is already bound to another folder or other manifest bytes
// (downloadsIdentityAlreadyBound). Exit 3 on a fault (the graph unreachable, a read or write failing). The index is written whole,
// to a temporary file in the root and renamed over the old one. -help, --help and -h print this header.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const commandLineParser = require('qtools-parse-command-line');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

const { switches } = commandLineParser.getParameters();
if (switches.help || switches.h) {
	process.stdout.write(`${fs.readFileSync(__filename, 'utf8').split('\n').filter((oneLine) => oneLine.startsWith('//')).map((oneLine) => oneLine.replace(/^\/\/ ?/, '')).join('\n')}\n`);
	process.exit(0);
}

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, verbose: () => {}, debug: () => {}, result: () => {}, error: (messageText) => process.stderr.write(`${messageText}\n`) },
	rawConfig: {},
	commandLineParameters: { switches, values: {} },
};

const SERVER_PATH = path.join(__dirname, '..', '..', '..');
const { resolveContainerConnection } = require(path.join(SERVER_PATH, 'data-model', 'lib', 'user-graph', 'container-connection-resolver'));
const neo4jGen = require(path.join(SERVER_PATH, 'data-model', 'lib', 'neo4j-instance', 'neo4j-instance'))({ unused: true });
const downloadsMapper = require(path.join(SERVER_PATH, 'data-model', 'data-mapping', 'mappers', 'standard-downloads.js'))({});
const { INDEX_FILE_NAME, FOLDER_NAME_PATTERN, graphIdentityOf, readIndex, indexWithEntry } = require(path.join(__dirname, 'downloads-identity'));

const EXIT_REFUSED = 2;
const EXIT_FAULT = 3;
const REQUIRED_INPUT_NAME_LIST = ['downloadArtifactsRootDirPath', 'folderName', 'containerName'];

const refusalOf = (refusalName, reasonText) => `${refusalName}: ${reasonText}`;
const sha256Of = (contentBuffer) => crypto.createHash('sha256').update(contentBuffer).digest('hex');

const taskList = new taskListPlus();

// the input: one JSON object, every part a non-empty string, the folder a bare name inside an existing root
taskList.push((args, next) => {
	const inputText = fs.readFileSync(0, 'utf8').trim();
	if (inputText.charAt(0) !== '{') {
		next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsIdentityInputUnreadable', 'stdin must be one JSON object') }, args);
		return;
	}
	let inputObject;
	// stdin is text from outside this process: a parse fault is turned into a named refusal here
	try {
		inputObject = JSON.parse(inputText);
	} catch (parseError) {
		next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsIdentityInputUnreadable', `stdin is not JSON: ${parseError.message}`) }, args);
		return;
	}
	const absentNameList = REQUIRED_INPUT_NAME_LIST.filter((inputName) => typeof inputObject[inputName] !== 'string' || inputObject[inputName] === '');
	if (absentNameList.length) {
		next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsIdentityInputUnreadable', `${absentNameList.join(', ')} ${absentNameList.length === 1 ? 'is' : 'are'} required (${REQUIRED_INPUT_NAME_LIST.join(', ')}); nothing is defaulted`) }, args);
		return;
	}
	if (!FOLDER_NAME_PATTERN.test(inputObject.folderName) || !fs.existsSync(inputObject.downloadArtifactsRootDirPath)) {
		next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsIdentityInputUnreadable', `folderName '${inputObject.folderName}' must be a bare folder name inside an existing downloadArtifactsRootDirPath`) }, args);
		return;
	}
	next('', { ...args, ...inputObject, downloadsDirPath: path.join(inputObject.downloadArtifactsRootDirPath, inputObject.folderName) });
});

// the folder's manifest: its bytes (hashed), and a shape the server serves
taskList.push((args, next) => {
	const manifestFilePath = path.join(args.downloadsDirPath, downloadsMapper.MANIFEST_FILE_NAME);
	if (!fs.existsSync(manifestFilePath)) {
		next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsAbsentForGolden', `${manifestFilePath} does not exist`) }, args);
		return;
	}
	const manifestBuffer = fs.readFileSync(manifestFilePath);
	let manifest;
	// the manifest is a file from outside this process: a parse fault is turned into a named refusal here
	try {
		manifest = JSON.parse(manifestBuffer.toString('utf8'));
	} catch (parseError) {
		next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsManifestUnreadable', `${manifestFilePath}: ${parseError.message}`) }, args);
		return;
	}
	const shapeFault = downloadsMapper.manifestShapeFaultOf(manifest);
	if (shapeFault) {
		next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsManifestUnreadable', `${manifestFilePath}: ${shapeFault}`) }, args);
		return;
	}
	const publicationFilePath = path.join(args.downloadsDirPath, downloadsMapper.PUBLICATION_FILE_NAME);
	let publicationManifestRefId;
	if (fs.existsSync(publicationFilePath)) {
		// the listing is a file from outside this process: a parse fault is turned into a named refusal here
		try {
			publicationManifestRefId = (JSON.parse(fs.readFileSync(publicationFilePath, 'utf8')) || {}).manifestRefId;
		} catch (parseError) {
			next({ exitCode: EXIT_REFUSED, messageText: refusalOf('publicationsManifestUnreadable', `${publicationFilePath}: ${parseError.message}`) }, args);
			return;
		}
	}
	next('', { ...args, manifest, downloadsManifestSha256: sha256Of(manifestBuffer), publicationManifestRefId });
});

// the container's passport, on a read-only handle, and the identity it carries
taskList.push((args, next) => {
	const connection = resolveContainerConnection(args.containerName);
	if (connection.error) {
		next({ exitCode: EXIT_FAULT, messageText: `${moduleName}: container '${args.containerName}': ${connection.error}` }, args);
		return;
	}
	neo4jGen.initDatabaseInstance({ neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password, readOnly: true, queryTimeoutMs: 60000 }, (connectError, graphDb) => {
		if (connectError) {
			next({ exitCode: EXIT_FAULT, messageText: `${moduleName}: connecting to '${args.containerName}': ${connectError}` }, args);
			return;
		}
		const passportQuery = downloadsMapper.getCypher('goldenPassport');
		graphDb.runQuery(passportQuery.cypher, passportQuery.params, (queryError, passportRowList) => setImmediate(() => {
			graphDb.close();
			if (queryError) {
				next({ exitCode: EXIT_FAULT, messageText: `${moduleName}: reading the passport of '${args.containerName}': ${queryError}` }, args);
				return;
			}
			const identity = passportRowList.length === 1 ? graphIdentityOf(passportRowList[0]) : { refusalText: `'${args.containerName}' holds ${passportRowList.length} passport(s); exactly one is needed` };
			if (identity.refusalText) {
				next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsGraphUnidentified', identity.refusalText) }, args);
				return;
			}
			next('', { ...args, passport: passportRowList[0], graphIdentitySha256: identity.graphIdentitySha256 });
		}));
	});
});

// the downloads are this graph's: its contract, its manifest (when the folder's publication listing names one)
taskList.push((args, next) => {
	if (args.manifest.graphContractSha256 !== args.passport.graphContractSha256) {
		next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsManifestMismatch', `the folder's graphContractSha256 ${args.manifest.graphContractSha256} is not ${args.containerName}'s ${args.passport.graphContractSha256}`) }, args);
		return;
	}
	if (args.publicationManifestRefId !== undefined && args.publicationManifestRefId !== args.passport.manifestRefId) {
		next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsManifestMismatch', `the folder's ${downloadsMapper.PUBLICATION_FILE_NAME} names manifest ${args.publicationManifestRefId}; ${args.containerName} was replayed from ${args.passport.manifestRefId}`) }, args);
		return;
	}
	next('', args);
});

// the index with the entry: alreadyRecorded by identity first; a NEW entry only for the graph that generated the downloads
taskList.push((args, next) => {
	const indexFilePath = path.join(args.downloadArtifactsRootDirPath, INDEX_FILE_NAME);
	const indexRead = fs.existsSync(indexFilePath) ? readIndex(args.downloadArtifactsRootDirPath) : { index: null };
	if (indexRead.refusalText) {
		next({ exitCode: EXIT_REFUSED, messageText: indexRead.refusalText }, args);
		return;
	}
	const entry = {
		graphIdentitySha256: args.graphIdentitySha256,
		manifestRefId: args.passport.manifestRefId,
		graphContractSha256: args.passport.graphContractSha256,
		folderName: args.folderName,
		downloadsManifestSha256: args.downloadsManifestSha256,
		recordedAt: new Date().toISOString(),
		recordedFromGraphName: args.passport.graphName,
	};
	const recorded = indexWithEntry(indexRead.index, entry);
	if (recorded.refusalText) {
		next({ exitCode: EXIT_REFUSED, messageText: recorded.refusalText }, args);
		return;
	}
	if (recorded.recordOutcome === 'recorded' && args.manifest.graphName !== args.passport.graphName) {
		next({ exitCode: EXIT_REFUSED, messageText: refusalOf('downloadsManifestMismatch', `the folder's downloads were generated for '${args.manifest.graphName}'; '${args.containerName}' carries '${args.passport.graphName}'. Record them from the graph that generated them; its copies and replays then follow by identity.`) }, args);
		return;
	}
	next('', { ...args, indexFilePath, recorded });
});

// the index written whole and renamed into place (nothing is written when the entry was already there)
taskList.push((args, next) => {
	if (args.recorded.recordOutcome === 'alreadyRecorded') {
		next('', { ...args, entry: args.recorded.entry });
		return;
	}
	const temporaryFilePath = `${args.indexFilePath}.${process.pid}.writing`;
	fs.writeFile(temporaryFilePath, `${JSON.stringify(args.recorded.index, null, '\t')}\n`, (writeError) => {
		if (writeError) {
			next({ exitCode: EXIT_FAULT, messageText: `${moduleName}: writing ${temporaryFilePath}: ${writeError.message}` }, args);
			return;
		}
		fs.rename(temporaryFilePath, args.indexFilePath, (renameError) => {
			if (renameError) {
				next({ exitCode: EXIT_FAULT, messageText: `${moduleName}: renaming ${temporaryFilePath} to ${args.indexFilePath}: ${renameError.message}` }, args);
				return;
			}
			next('', { ...args, entry: args.recorded.index.entryList[args.recorded.index.entryList.length - 1] });
		});
	});
});

pipeRunner(taskList.getList(), {}, (pipeError, args) => {
	if (pipeError) {
		process.stderr.write(`${pipeError.messageText || pipeError}\n`);
		process.exit(pipeError.exitCode || EXIT_FAULT);
	}
	process.stdout.write(`${JSON.stringify({ recordOutcome: args.recorded.recordOutcome, entry: args.entry, indexFilePath: args.indexFilePath })}\n`);
	process.exit(0);
});
