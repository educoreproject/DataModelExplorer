'use strict';

// graphStamp.js — which graph, manifest and inputs produced a quality report, so every figure can be traced to its build.
// The graph half is the passport the standards_* tools read for answeredFrom (passportReader.js, the DME's ONE reader of
// :GraphProvenance); the manifest label is read from the uriContract store exactly as uriPromiseGate.js reads it
// (publishedManifests by manifestRefId). A graph whose passport cannot be read, or whose manifest the store does not
// publish, is refused by name: a report that cannot say what it measured is not written.
//
//   readGraphStamp({ session, uriContractFilePath, goldenContainerName }, callback(errText, graphStamp))
//     graphStamp = { goldenContainerName, graphName, manifestRefId, manifestLabel, manifestUri, builtAt,
//                    graphContractSha256, structuralVersion, standardsIncluded }
//   fileFingerprintOf(filePath) -> { filePath, fileName, byteCount, sha256 }
//   generatorCommitOf(codeDirPath) -> { commitRefId, isWorkingTreeClean }: the generator folder's last commit, and whether it
//     has uncommitted changes (a report from a dirty generator says so on its stamp)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DME_LIB_DIR_PATH = path.join(__dirname, '..', '..', 'data-model-explorer', 'lib');
const { readPassport } = require(path.join(DME_LIB_DIR_PATH, 'passportReader'));

const MANIFEST_READ_TEXT = 'SELECT publicLabel, uri FROM publishedManifests WHERE manifestRefId = ?';

const readManifestRow = ({ uriContractFilePath, manifestRefId }) => {
	if (typeof uriContractFilePath !== 'string' || !fs.existsSync(uriContractFilePath)) {
		return { refusalText: `graphStamp: the uriContract store is absent at ${JSON.stringify(uriContractFilePath)}; the manifest label cannot be read` };
	}
	const Database = require('better-sqlite3');
	const storeHandle = new Database(uriContractFilePath, { readonly: true, fileMustExist: true });
	const manifestRow = storeHandle.prepare(MANIFEST_READ_TEXT).get(manifestRefId);
	storeHandle.close();
	if (manifestRow === undefined) {
		return { refusalText: `graphStamp: the graph's manifest ${manifestRefId} is not published in ${uriContractFilePath}` };
	}
	return { manifestRow };
};

const readGraphStamp = ({ session, uriContractFilePath, goldenContainerName }, callback) => {
	readPassport({ session, verbName: 'describeGraph' }, (passportError, passportRead) => {
		if (passportError) {
			callback(`graphStamp: the passport read failed: ${passportError}`);
			return;
		}
		if (passportRead.refusal) {
			callback(`graphStamp: the passport of ${goldenContainerName} cannot be read: ${passportRead.refusal.reason}`);
			return;
		}
		const { passport } = passportRead;
		const manifestRead = readManifestRow({ uriContractFilePath, manifestRefId: passport.manifestRefId });
		if (manifestRead.refusalText) {
			callback(manifestRead.refusalText);
			return;
		}
		callback('', {
			goldenContainerName,
			graphName: passport.graphName,
			manifestRefId: passport.manifestRefId,
			manifestLabel: manifestRead.manifestRow.publicLabel,
			manifestUri: manifestRead.manifestRow.uri,
			builtAt: passport.builtAt,
			graphContractSha256: passport.graphContractSha256,
			structuralVersion: passport.structuralVersion,
			standardsIncluded: passport.standardsIncluded,
		});
	});
};

const fileFingerprintOf = (filePath) => {
	const fileBuffer = fs.readFileSync(filePath);
	return { filePath, fileName: path.basename(filePath), byteCount: fileBuffer.length, sha256: crypto.createHash('sha256').update(fileBuffer).digest('hex') };
};

// the last commit that changed the GENERATOR (its folder), not HEAD: committing a regenerated report does not change the
// stamp, so the same generator on the same inputs writes byte-identical files
const GENERATOR_RELATIVE_PATH = 'cli/lib.d/quality-report';
const generatorCommitOf = (codeDirPath) => {
	const headRead = spawnSync('git', ['-C', codeDirPath, 'log', '-1', '--format=%H', '--', GENERATOR_RELATIVE_PATH], { encoding: 'utf8' });
	const statusRead = spawnSync('git', ['-C', codeDirPath, 'status', '--porcelain', '--', GENERATOR_RELATIVE_PATH], { encoding: 'utf8' });
	if (headRead.status !== 0 || statusRead.status !== 0) {
		return { commitRefId: null, isWorkingTreeClean: null, commitAbsentReason: `git could not read ${codeDirPath}: ${(headRead.stderr || statusRead.stderr || '').trim()}` };
	}
	if (headRead.stdout.trim() === '') {
		return { commitRefId: null, isWorkingTreeClean: false, commitAbsentReason: `${GENERATOR_RELATIVE_PATH} has no commit yet` };
	}
	return { commitRefId: headRead.stdout.trim(), isWorkingTreeClean: statusRead.stdout.trim() === '' };
};

module.exports = { readGraphStamp, fileFingerprintOf, generatorCommitOf };
