'use strict';
// downloads-by-identity.test.js — the standard downloads follow the graph's CONTENT identity, never its name (TQ 2026-11-06,
// "a terrible mistake"; WORKORDER-downloadsByIdentity-110626; ROMANTIC_PARASOL's rule: identity = sha256(manifestRefId|graphContractSha256),
// no builtAt, no graphName). The folder is found through <downloadArtifactsRootDirPath>/downloadsIdentityIndex.json, whose entry
// binds the identity to one folder and to the sha256 of that folder's downloads.json bytes.
//   1. the identity, on REAL graphs: GOLD_261030_useCases and its zero-spend replay GOLD_EVAL_261106_useCases (same manifest, same
//      contract, another builtAt and name) share it; GOLD_EVAL_261025_wave3 and GOLD_EVAL_261026_respelled (two builds that share a
//      graph contract) do not; this test's own formula and the server's agree;
//   2. a renamed container serves: both live goldens, each told its container is a name no folder carries, are served the manifest,
//      one file by its sha256, the publication listing and a use case's source file, out of a folder named for neither graph;
//   3. a different build with the same name is refused: a passport naming GOLD_261030_useCases, with its contract, but another
//      manifest, is refused even though a folder of that very name sits in the root;
//   4. the index's refusals by name: absent, unreadable, a duplicate identity, a folder name that is not bare, a manifest whose
//      bytes are not the ones the entry recorded, and a passport that cannot be identified;
//   5. the recorder (recordDownloadsIdentity.js): records a golden's folder, says alreadyRecorded on a second run and on the replay,
//      and refuses a folder whose contract is not the passport's.
// Every graph read is on a READ-ONLY handle. The real artifacts are read (never written) from the qbook [standardDownloads]
// directory, reached through symlinks in scratch roots this test makes and removes.
// RED BEFORE: against main 3b6a37b (folder by passport graphName) items 1 (server side), 2, 3, 4 and 5 fail.
//
// Run: node server/test/downloads-by-identity.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const configFileProcessor = require('qtools-config-file-processor');

const configBySection = {};
process.global = {
	getConfig: (sectionName) => configBySection[sectionName] || {},
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, debug: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const { serverConfigDirPath } = require('./lib/goldenContainerName');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });

const SERVER_PATH = path.join(__dirname, '..');
const ACCESS_POINT_DIR_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d');
const MAPPER_DIR_PATH = path.join(SERVER_PATH, 'data-model', 'data-mapping', 'mappers');
const IDENTITY_MODULE_PATH = path.join(SERVER_PATH, 'data-model', 'lib', 'standard-downloads', 'downloads-identity.js');
const RECORDER_PATH = path.join(SERVER_PATH, 'data-model', 'lib', 'standard-downloads', 'recordDownloadsIdentity.js');
const INDEX_FILE_NAME = 'downloadsIdentityIndex.json';

const ORIGINAL_CONTAINER_NAME = 'GOLD_261030_useCases';
const REPLAY_CONTAINER_NAME = 'GOLD_EVAL_261106_useCases';
const ADDRESS_ONLY_CONTAINER_NAME = 'GOLD_containerNameIsOnlyTheAddress';
const SERVED_FOLDER_NAME = 'folderNamedForNoGraph';
const CASE_STABLE_ID = 'uc:ler-issuance';
// two builds that share a graph contract (their downloads.json say so), with the manifests their gate reports record
// (educoreForge nextStandards-102326/GATEREPORT-W3A-102526.md; GOLD_EVAL_261026_respelled/publicationDownloads.json)
const SHARED_CONTRACT_BUILD_LIST = [
	{ graphName: 'GOLD_EVAL_261025_wave3', manifestRefId: '4303bbdb61aa061e7b909734864e884eb55fc5e0d5473475864b85372a6c1fd5', graphContractSha256: 'ea7d2a628efa015b770f146d53e92507686383d7b7879eb3cde0ac4fc6ae8a5b' },
	{ graphName: 'GOLD_EVAL_261026_respelled', manifestRefId: '3a5e87cb899cbc65e94c79f0134328f1193b6d4ebc6a943510055e4736d4750d', graphContractSha256: 'ea7d2a628efa015b770f146d53e92507686383d7b7879eb3cde0ac4fc6ae8a5b' },
];

let passedCount = 0;
let failedCount = 0;
const check = (label, passed, detail = '') => {
	if (passed) { passedCount++; } else { failedCount++; }
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${String(detail).slice(0, 400)}`}`);
};
const abort = (whereText, errorText) => {
	console.log(`  FAIL: ${whereText}: ${errorText}`);
	process.exit(1);
};
const runInOrder = (stepList, callback) => {
	const runNext = (stepIndex) => {
		if (stepIndex === stepList.length) { callback(); return; }
		stepList[stepIndex](() => setImmediate(() => runNext(stepIndex + 1)));
	};
	runNext(0);
};

// this test's own statement of the rule, independent of the server's code
const sha256Of = (contentBuffer) => crypto.createHash('sha256').update(contentBuffer).digest('hex');
const testIdentityOf = ({ manifestRefId, graphContractSha256 }) => sha256Of(Buffer.from(`${manifestRefId}|${graphContractSha256}`, 'utf8'));
const identityModule = fs.existsSync(IDENTITY_MODULE_PATH) ? require(IDENTITY_MODULE_PATH) : null;

const realRootDirPath = ((configFileProcessor.getConfig('startApiServer.ini', serverConfigDirPath(), { resolve: true }) || {}).standardDownloads || {}).downloadArtifactsRootDirPath;
const realFolderPath = typeof realRootDirPath === 'string' ? path.join(realRootDirPath, ORIGINAL_CONTAINER_NAME) : '';
if (!realFolderPath || !fs.existsSync(path.join(realFolderPath, 'downloads.json'))) abort('setup', `no real downloads for ${ORIGINAL_CONTAINER_NAME} under the qbook [standardDownloads] directory`);
const realManifestSha256 = sha256Of(fs.readFileSync(path.join(realFolderPath, 'downloads.json')));
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'downloadsByIdentity-'));

// a scratch root: the named symlinks to the real folder, and an index (an object, raw text, or none)
const scratchRootOf = ({ rootName, linkNameList, indexContent }) => {
	const rootDirPath = path.join(scratchDirPath, rootName);
	fs.mkdirSync(rootDirPath);
	linkNameList.forEach((linkName) => fs.symlinkSync(realFolderPath, path.join(rootDirPath, linkName)));
	if (indexContent !== undefined) {
		fs.writeFileSync(path.join(rootDirPath, INDEX_FILE_NAME), typeof indexContent === 'string' ? indexContent : JSON.stringify(indexContent, null, '\t'));
	}
	return rootDirPath;
};
const indexEntryOf = ({ passport, folderName, downloadsManifestSha256 = realManifestSha256 }) => ({
	graphIdentitySha256: testIdentityOf(passport),
	manifestRefId: passport.manifestRefId,
	graphContractSha256: passport.graphContractSha256,
	folderName,
	downloadsManifestSha256,
	recordedAt: '2026-11-06T00:00:00.000Z',
	recordedFromGraphName: passport.graphName,
});
const indexOf = (entryList) => ({ indexFormat: 'educoreDownloadsIdentityIndex/1', entryList });

// a read-only golden handle whose passport reads as the override says (every other query passes through untouched)
const passportOverrideDbOf = (goldenDb, passportOverride) => {
	const overrideDb = Object.create(goldenDb);
	overrideDb.runQuery = (cypherText, params, callback) => goldenDb.runQuery(cypherText, params, (queryError, rowList) => {
		if (queryError || !/GraphProvenance/.test(cypherText)) { callback(queryError, rowList); return; }
		callback('', rowList.map((oneRow) => Object.keys(oneRow).reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: Object.prototype.hasOwnProperty.call(passportOverride, fieldName) ? passportOverride[fieldName] : oneRow[fieldName] }), {})));
	});
	return overrideDb;
};

const loadAccessPoint = (accessPointName, passThroughParameters) => {
	const accessPointByName = {};
	require(path.join(ACCESS_POINT_DIR_PATH, `${accessPointName}.js`))({
		dotD: { logList: [], library: { add: (loadedName, serviceFunction) => { accessPointByName[loadedName] = serviceFunction; } } },
		passThroughParameters,
	});
	return accessPointByName[accessPointName];
};
const accessPointsFor = (neo4jDb) => {
	const downloadsMapper = require(path.join(MAPPER_DIR_PATH, 'standard-downloads.js'))({});
	const useCaseMapper = require(path.join(MAPPER_DIR_PATH, 'forged-use-cases.js'))({ baseMappingProcess: () => ({}) });
	const downloadsAccessPoint = loadAccessPoint('standard-downloads', { neo4jDb, dataMapping: { 'standard-downloads': downloadsMapper } });
	const useCaseAccessPoint = loadAccessPoint('forged-use-cases', { neo4jDb, dataMapping: { 'forged-use-cases': useCaseMapper }, accessPointsDotD: { 'standard-downloads': downloadsAccessPoint } });
	return { downloadsAccessPoint, useCaseAccessPoint };
};
const configureRoot = (rootDirPath) => {
	configBySection.standardDownloads = { downloadArtifactsRootDirPath: rootDirPath };
	configBySection.dataModelExplorerSearch = { goldenContainerName: ADDRESS_ONLY_CONTAINER_NAME };
};

const connectReadOnly = (containerName, callback) => {
	const connection = resolveContainerConnection(containerName);
	if (connection.error) { callback(`${containerName}: ${connection.error}`); return; }
	neo4jGen.initDatabaseInstance({ neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password, readOnly: true, queryTimeoutMs: 120000 }, callback);
};
const passportOf = (graphDb, callback) => graphDb.runQuery('MATCH (p:GraphProvenance) RETURN p.graphName AS graphName, p.manifestRefId AS manifestRefId, p.graphContractSha256 AS graphContractSha256, p.builtAt AS builtAt', {}, (queryError, rowList) => setImmediate(() => {
	if (queryError || rowList.length !== 1) abort('passport read', queryError || `${rowList.length} passports`);
	callback(rowList[0]);
}));

console.log('\n=== Downloads by the graph\'s content identity ===\n');

connectReadOnly(ORIGINAL_CONTAINER_NAME, (originalError, originalDb) => {
	if (originalError) abort('original connect', originalError);
	connectReadOnly(REPLAY_CONTAINER_NAME, (replayError, replayDb) => {
		if (replayError) abort('replay connect', replayError);
		passportOf(originalDb, (originalPassport) => passportOf(replayDb, (replayPassport) => {
			console.log(`  original: ${originalPassport.graphName} manifest ${originalPassport.manifestRefId.slice(0, 12)} builtAt ${originalPassport.builtAt}`);
			console.log(`  replay:   ${replayPassport.graphName} manifest ${replayPassport.manifestRefId.slice(0, 12)} builtAt ${replayPassport.builtAt}`);
			if (originalPassport.builtAt === replayPassport.builtAt || originalPassport.graphName === replayPassport.graphName) abort('setup', 'the replay must be another build under another name');
			runSteps({ originalDb, replayDb, originalPassport, replayPassport });
		}));
	});
});

const runSteps = ({ originalDb, replayDb, originalPassport, replayPassport }) => {
	const identityRootPath = scratchRootOf({ rootName: 'identityRoot', linkNameList: [SERVED_FOLDER_NAME], indexContent: indexOf([indexEntryOf({ passport: originalPassport, folderName: SERVED_FOLDER_NAME })]) });
	runInOrder([
		// 1. the identity on real graphs
		(done) => {
			check('1. the original and its replay share the identity (this test\'s formula)', testIdentityOf(originalPassport) === testIdentityOf(replayPassport));
			check('1. two builds sharing a graph contract (wave3, respelled) do not', testIdentityOf(SHARED_CONTRACT_BUILD_LIST[0]) !== testIdentityOf(SHARED_CONTRACT_BUILD_LIST[1]) && SHARED_CONTRACT_BUILD_LIST[0].graphContractSha256 === SHARED_CONTRACT_BUILD_LIST[1].graphContractSha256);
			const serverIdentityList = identityModule ? [originalPassport, replayPassport, ...SHARED_CONTRACT_BUILD_LIST].map((onePassport) => identityModule.graphIdentityOf(onePassport)) : [];
			check('1. the server computes the same identity as this test, for all four graphs', serverIdentityList.length === 4 && serverIdentityList.every((oneIdentity, identityIndex) => oneIdentity.graphIdentitySha256 === testIdentityOf([originalPassport, replayPassport, ...SHARED_CONTRACT_BUILD_LIST][identityIndex])), identityModule ? JSON.stringify(serverIdentityList) : `${IDENTITY_MODULE_PATH} does not exist`);
			done();
		},
		// 2. renamed containers serve, from a folder named for neither graph
		...[['original', originalDb, originalPassport], ['replay', replayDb, replayPassport]].map(([graphLabel, graphDb, onePassport]) => (done) => {
			configureRoot(identityRootPath);
			const { downloadsAccessPoint, useCaseAccessPoint } = accessPointsFor(graphDb);
			downloadsAccessPoint({ action: 'manifest' }, (manifestError, manifestResult) => setImmediate(() => {
				check(`2. ${graphLabel} (${onePassport.graphName}, container told '${ADDRESS_ONLY_CONTAINER_NAME}'): the manifest is served from '${SERVED_FOLDER_NAME}', with the identity`, !manifestError && manifestResult.entryList.length > 0 && manifestResult.graphIdentitySha256 === testIdentityOf(onePassport), manifestError || JSON.stringify({ graphIdentitySha256: manifestResult.graphIdentitySha256 }));
				const smallestEntry = manifestError ? undefined : manifestResult.entryList.filter((oneEntry) => oneEntry.available).sort((leftEntry, rightEntry) => leftEntry.byteSize - rightEntry.byteSize)[0];
				downloadsAccessPoint({ action: 'file', downloadId: smallestEntry ? smallestEntry.downloadId : 'noEntry' }, (fileError, fileResult) => setImmediate(() => {
					check(`2. ${graphLabel}: one file is served and its bytes hash to the manifest's sha256`, !fileError && smallestEntry && sha256Of(fileResult.contentBuffer) === smallestEntry.sha256, fileError);
					downloadsAccessPoint({ action: 'publications' }, (publicationError, publicationResult) => setImmediate(() => {
						check(`2. ${graphLabel}: the publication listing is served`, !publicationError && publicationResult.entryList.length > 0, publicationError);
						useCaseAccessPoint({ action: 'caseSourceFile', caseStableId: CASE_STABLE_ID }, (sourceError, sourceResult) => setImmediate(() => {
							check(`2. ${graphLabel}: ${CASE_STABLE_ID}'s source file is served from its standard's source download`, !sourceError && typeof sourceResult.sourceText === 'string' && sourceResult.sourceText.length > 0, sourceError);
							done();
						}));
					}));
				}));
			}));
		}),
		// 3. a different build under the same name, with a folder of that name in the root, is refused
		(done) => {
			const sameNameRootPath = scratchRootOf({ rootName: 'sameNameRoot', linkNameList: [ORIGINAL_CONTAINER_NAME], indexContent: indexOf([indexEntryOf({ passport: originalPassport, folderName: ORIGINAL_CONTAINER_NAME })]) });
			configureRoot(sameNameRootPath);
			const impostorDb = passportOverrideDbOf(originalDb, { graphName: ORIGINAL_CONTAINER_NAME, manifestRefId: SHARED_CONTRACT_BUILD_LIST[0].manifestRefId });
			accessPointsFor(impostorDb).downloadsAccessPoint({ action: 'manifest' }, (manifestError) => setImmediate(() => {
				check(`3. a passport named '${ORIGINAL_CONTAINER_NAME}' with another manifest is refused (downloadsAbsentForGolden), though a folder of that name is in the root`, /^downloadsAbsentForGolden: /.test(`${manifestError}`), manifestError || 'it was served');
				done();
			}));
		},
		// 4. the index's refusals by name
		...[
			['the index is absent', { linkNameList: [SERVED_FOLDER_NAME] }, /^downloadsIdentityIndexAbsent: /],
			['the index is not JSON', { linkNameList: [SERVED_FOLDER_NAME], indexContent: '{ not json' }, /^downloadsIdentityIndexUnreadable: /],
			['the index is of another format', { linkNameList: [SERVED_FOLDER_NAME], indexContent: { indexFormat: 'educoreDownloadsIdentityIndex/0', entryList: [] } }, /^downloadsIdentityIndexUnreadable: /],
			['the index lists one identity twice', { linkNameList: [SERVED_FOLDER_NAME], indexContent: indexOf([indexEntryOf({ passport: originalPassport, folderName: SERVED_FOLDER_NAME }), indexEntryOf({ passport: originalPassport, folderName: SERVED_FOLDER_NAME })]) }, /^downloadsIdentityIndexUnreadable: /],
			['an entry names a folder that is not a bare name', { linkNameList: [SERVED_FOLDER_NAME], indexContent: indexOf([indexEntryOf({ passport: originalPassport, folderName: `../${SERVED_FOLDER_NAME}` })]) }, /^downloadsIdentityIndexUnreadable: /],
			['an entry\'s identity is not the hash of its own fields', { linkNameList: [SERVED_FOLDER_NAME], indexContent: indexOf([{ ...indexEntryOf({ passport: originalPassport, folderName: SERVED_FOLDER_NAME }), manifestRefId: SHARED_CONTRACT_BUILD_LIST[0].manifestRefId }]) }, /^downloadsIdentityIndexUnreadable: /],
			['the folder\'s downloads.json is not the bytes the entry recorded', { linkNameList: [SERVED_FOLDER_NAME], indexContent: indexOf([indexEntryOf({ passport: originalPassport, folderName: SERVED_FOLDER_NAME, downloadsManifestSha256: '0'.repeat(64) })]) }, /^downloadsManifestMismatch: /],
			['the entry\'s folder is absent', { linkNameList: [], indexContent: indexOf([indexEntryOf({ passport: originalPassport, folderName: SERVED_FOLDER_NAME })]) }, /^downloadsAbsentForGolden: /],
		].map(([caseLabel, rootSpec, refusalPattern], caseIndex) => (done) => {
			configureRoot(scratchRootOf({ rootName: `refusalRoot${caseIndex}`, ...rootSpec }));
			accessPointsFor(originalDb).downloadsAccessPoint({ action: 'manifest' }, (manifestError) => setImmediate(() => {
				check(`4. ${caseLabel}: refused ${refusalPattern.source.replace(/[\^:\\ ]/g, '')}`, refusalPattern.test(`${manifestError}`), manifestError || 'it was served');
				done();
			}));
		}),
		(done) => {
			configureRoot(identityRootPath);
			accessPointsFor(passportOverrideDbOf(originalDb, { manifestRefId: null })).downloadsAccessPoint({ action: 'manifest' }, (manifestError) => setImmediate(() => {
				check('4. a passport with no manifestRefId cannot be identified: refused downloadsGraphUnidentified', /^downloadsGraphUnidentified: /.test(`${manifestError}`), manifestError || 'it was served');
				done();
			}));
		},
		// 5. the recorder
		(done) => {
			const recordRootPath = scratchRootOf({ rootName: 'recordRoot', linkNameList: [ORIGINAL_CONTAINER_NAME] });
			const runRecorder = (inputObject) => {
				if (!fs.existsSync(RECORDER_PATH)) return { status: -1, stdout: '', stderr: `${RECORDER_PATH} does not exist` };
				const spawnResult = spawnSync(process.execPath, [RECORDER_PATH], { input: JSON.stringify(inputObject), encoding: 'utf8' });
				return { status: spawnResult.status, stdout: spawnResult.stdout || '', stderr: spawnResult.stderr || '' };
			};
			const outcomeOf = (runResult) => { const lastLine = runResult.stdout.trim().split('\n').pop() || ''; return lastLine.charAt(0) === '{' ? JSON.parse(lastLine) : {}; };
			const firstRun = runRecorder({ downloadArtifactsRootDirPath: recordRootPath, folderName: ORIGINAL_CONTAINER_NAME, containerName: ORIGINAL_CONTAINER_NAME });
			const writtenIndex = fs.existsSync(path.join(recordRootPath, INDEX_FILE_NAME)) ? JSON.parse(fs.readFileSync(path.join(recordRootPath, INDEX_FILE_NAME), 'utf8')) : null;
			const writtenEntry = writtenIndex && writtenIndex.entryList.length === 1 ? writtenIndex.entryList[0] : {};
			check('5. the recorder records the original\'s folder: one entry, its identity, folder and manifest sha', firstRun.status === 0 && outcomeOf(firstRun).recordOutcome === 'recorded' && writtenEntry.graphIdentitySha256 === testIdentityOf(originalPassport) && writtenEntry.folderName === ORIGINAL_CONTAINER_NAME && writtenEntry.downloadsManifestSha256 === realManifestSha256, `${firstRun.status} ${firstRun.stdout.slice(-300)} ${firstRun.stderr.slice(-300)}`);
			const indexBytesAfterFirst = fs.existsSync(path.join(recordRootPath, INDEX_FILE_NAME)) ? fs.readFileSync(path.join(recordRootPath, INDEX_FILE_NAME)) : Buffer.from('');
			const againRun = runRecorder({ downloadArtifactsRootDirPath: recordRootPath, folderName: ORIGINAL_CONTAINER_NAME, containerName: ORIGINAL_CONTAINER_NAME });
			const replayRun = runRecorder({ downloadArtifactsRootDirPath: recordRootPath, folderName: ORIGINAL_CONTAINER_NAME, containerName: REPLAY_CONTAINER_NAME });
			const indexBytesAfterRepeat = fs.existsSync(path.join(recordRootPath, INDEX_FILE_NAME)) ? fs.readFileSync(path.join(recordRootPath, INDEX_FILE_NAME)) : Buffer.from('x');
			check('5. a second run, and a run on the replay, say alreadyRecorded and leave the index byte for byte', againRun.status === 0 && outcomeOf(againRun).recordOutcome === 'alreadyRecorded' && replayRun.status === 0 && outcomeOf(replayRun).recordOutcome === 'alreadyRecorded' && indexBytesAfterFirst.equals(indexBytesAfterRepeat), `${againRun.status} ${againRun.stderr.slice(-200)} | ${replayRun.status} ${replayRun.stderr.slice(-200)}`);
			const otherContractRootPath = path.join(scratchDirPath, 'otherContractRoot');
			fs.mkdirSync(path.join(otherContractRootPath, 'otherContractFolder'), { recursive: true });
			fs.writeFileSync(path.join(otherContractRootPath, 'otherContractFolder', 'downloads.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(realFolderPath, 'downloads.json'), 'utf8')), graphContractSha256: 'e'.repeat(64) }));
			const refusedRun = runRecorder({ downloadArtifactsRootDirPath: otherContractRootPath, folderName: 'otherContractFolder', containerName: ORIGINAL_CONTAINER_NAME });
			check('5. a folder whose contract is not the passport\'s is refused by name, and no index is written', refusedRun.status === 2 && /downloadsManifestMismatch: /.test(refusedRun.stderr) && !fs.existsSync(path.join(otherContractRootPath, INDEX_FILE_NAME)), `${refusedRun.status} ${refusedRun.stderr.slice(-300)}`);
			const absentRun = runRecorder({ downloadArtifactsRootDirPath: recordRootPath, folderName: ORIGINAL_CONTAINER_NAME });
			check('5. an absent input is refused by name (exit 2), never defaulted', absentRun.status === 2 && /containerName/.test(absentRun.stderr), `${absentRun.status} ${absentRun.stderr.slice(-200)}`);
			done();
		},
	], () => {
		originalDb.close();
		replayDb.close();
		// the symlinks to the real folder are unlinked first, so removing the scratch roots can never reach the real downloads
		fs.readdirSync(scratchDirPath).forEach((rootName) => fs.readdirSync(path.join(scratchDirPath, rootName)).forEach((entryName) => {
			const entryPath = path.join(scratchDirPath, rootName, entryName);
			if (fs.lstatSync(entryPath).isSymbolicLink()) { fs.unlinkSync(entryPath); }
		}));
		fs.rmSync(scratchDirPath, { recursive: true, force: true });
		console.log(`downloads-by-identity: ${passedCount} passed, ${failedCount} failed`);
		process.exit(failedCount ? 1 : 0);
	});
};
