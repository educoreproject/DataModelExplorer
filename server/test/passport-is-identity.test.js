'use strict';
// passport-is-identity.test.js — the graph's identity is the passport it carries, the container name only its address (P5, ROMANTIC_PARASOL's
// ruling 2026-11-06). Production serves a BYTE COPY of demo's golden under its own container name, so the copy's passport still names the
// original graph. A server whose [dataModelExplorerSearch] goldenContainerName differs from the passport's graphName must still serve:
//   1. the standard downloads (the manifest, and one file by its sha256), from the folder named for the PASSPORT's graphName;
//   2. a use case's source file, out of its standard's verified source download;
//   3. a use case's structure, naming the passport's graph;
//   4. a companion page's compile, current, stamped with the passport's graphName;
//   5. search: the vector and fulltext indexes are found by what they index, never by a name built from the container's or graph's name.
// Every request runs against the LIVE golden (read-only handle), through the real access points and mappers, with the container name
// configured as a name the passport does not carry. The real download artifacts come from the qbook [standardDownloads] directory.
// RED BEFORE: against main 445df16 (container name compared with the passport) items 1 to 4 refuse.
//
// Run: node server/test/passport-is-identity.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const configFileProcessor = require('qtools-config-file-processor');

const ADDRESS_ONLY_CONTAINER_NAME = 'GOLD_containerNameIsOnlyTheAddress';
const CASE_STABLE_ID = 'uc:ler-issuance';
const configBySection = {};
process.global = {
	getConfig: (sectionName) => configBySection[sectionName] || {},
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, debug: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const { readGoldenContainerName, serverConfigDirPath } = require('./lib/goldenContainerName');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });

const SERVER_PATH = path.join(__dirname, '..');
const ACCESS_POINT_DIR_PATH = path.join(SERVER_PATH, 'data-model', 'access-points-dot-d', 'accessPoints.d');
const MAPPER_DIR_PATH = path.join(SERVER_PATH, 'data-model', 'data-mapping', 'mappers');
const PROJECT_SYSTEM_PATH = path.join(SERVER_PATH, '..', '..');
const SEED_MANIFEST = JSON.parse(fs.readFileSync(path.join(SERVER_PATH, 'data-model', 'lib', 'companion-pages', 'seed', 'jedx-dictionary.seed.json'), 'utf8'));
const SEED_SOURCE_DIR_PATH = path.join(PROJECT_SYSTEM_PATH, SEED_MANIFEST.sourceDirProjectRelativePath);

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${String(detail).slice(0, 400)}`}`);
};
const abort = (whereText, errorText) => {
	console.log(`  FAIL: ${whereText}: ${errorText}`);
	process.exit(1);
};
const finish = () => {
	const failedCount = resultList.filter((passed) => !passed).length;
	console.log(`passport-is-identity: ${resultList.length - failedCount} passed, ${failedCount} failed`);
	process.exit(failedCount ? 1 : 0);
};

const loadAccessPoint = (accessPointName, passThroughParameters) => {
	const accessPointByName = {};
	require(path.join(ACCESS_POINT_DIR_PATH, `${accessPointName}.js`))({
		dotD: { logList: [], library: { add: (loadedName, serviceFunction) => { accessPointByName[loadedName] = serviceFunction; } } },
		passThroughParameters,
	});
	return accessPointByName[accessPointName];
};

const sha256Of = (contentBuffer) => crypto.createHash('sha256').update(contentBuffer).digest('hex');
const goldenContainerName = readGoldenContainerName();
const goldenConnection = resolveContainerConnection(goldenContainerName);
if (goldenConnection.error) abort('golden connection', goldenConnection.error);
const realRootDirPath = ((configFileProcessor.getConfig('startApiServer.ini', serverConfigDirPath(), { resolve: true }) || {}).standardDownloads || {}).downloadArtifactsRootDirPath;

neo4jGen.initDatabaseInstance({ neo4jBoltUri: goldenConnection.boltUri, neo4jUser: goldenConnection.user, neo4jPassword: goldenConnection.password, readOnly: true, queryTimeoutMs: 120000 }, (connectError, goldenDb) => {
	if (connectError) abort('golden connect', connectError);
	goldenDb.runQuery('MATCH (p:GraphProvenance) RETURN p.graphName AS graphName', {}, (passportError, passportRowList) => setImmediate(() => {
		if (passportError || passportRowList.length !== 1) abort("this test's passport read", passportError || passportRowList.length);
		const passportGraphName = passportRowList[0].graphName;
		console.log(`the golden's passport names '${passportGraphName}'; this server is told its container is '${ADDRESS_ONLY_CONTAINER_NAME}'`);
		if (passportGraphName === ADDRESS_ONLY_CONTAINER_NAME) abort('setup', 'the address-only name must differ from the passport');
		if (typeof realRootDirPath !== 'string' || !fs.existsSync(path.join(realRootDirPath, passportGraphName, 'downloads.json'))) abort('setup', `no real downloads for ${passportGraphName} under ${realRootDirPath}`);

		configBySection.standardDownloads = { downloadArtifactsRootDirPath: realRootDirPath };
		configBySection.dataModelExplorerSearch = { goldenContainerName: ADDRESS_ONLY_CONTAINER_NAME };
		const downloadsMapper = require(path.join(MAPPER_DIR_PATH, 'standard-downloads.js'))({});
		const useCaseMapper = require(path.join(MAPPER_DIR_PATH, 'forged-use-cases.js'))({ baseMappingProcess: () => ({}) });
		const downloadsAccessPoint = loadAccessPoint('standard-downloads', { neo4jDb: goldenDb, dataMapping: { 'standard-downloads': downloadsMapper } });
		const useCaseAccessPoint = loadAccessPoint('forged-use-cases', { neo4jDb: goldenDb, dataMapping: { 'forged-use-cases': useCaseMapper }, accessPointsDotD: { 'standard-downloads': downloadsAccessPoint } });

		downloadsAccessPoint({ action: 'manifest' }, (manifestError, manifestResult) => setImmediate(() => {
			check('1. the downloads manifest is served, and names the passport\'s graph', !manifestError && manifestResult.graphName === passportGraphName, manifestError || (manifestResult && manifestResult.graphName));
			const smallestEntry = manifestError ? undefined : manifestResult.entryList.filter((oneEntry) => oneEntry.available).sort((leftEntry, rightEntry) => leftEntry.byteSize - rightEntry.byteSize)[0];
			downloadsAccessPoint({ action: 'file', downloadId: smallestEntry ? smallestEntry.downloadId : 'noEntry' }, (fileError, fileResult) => setImmediate(() => {
				check('1. one download file is served and its bytes hash to the manifest\'s sha256', !fileError && smallestEntry && sha256Of(fileResult.contentBuffer) === smallestEntry.sha256, fileError);
				useCaseAccessPoint({ action: 'caseSourceFile', caseStableId: CASE_STABLE_ID }, (sourceError, sourceResult) => setImmediate(() => {
					check(`2. ${CASE_STABLE_ID}'s source file is served from its standard's source download`, !sourceError && typeof sourceResult.sourceText === 'string' && sourceResult.sourceText.length > 0, sourceError);
					useCaseAccessPoint({ action: 'caseStructure', caseStableId: CASE_STABLE_ID }, (structureError, structureResult) => setImmediate(() => {
						check(`3. ${CASE_STABLE_ID}'s structure names the passport's graph, not the container`, !structureError && structureResult.graphName === passportGraphName && structureResult.extractedDocument.graphName === passportGraphName, structureError || (structureResult && structureResult.graphName));
						indexStep(goldenDb, passportGraphName);
					}));
				}));
			}));
		}));
	}));
});

// 5. search does not care what the container is called (ROMANTIC_PARASOL, 2026-11-06): -stampPromotion renamed the indexes after the
//    graph (GOLD_261030_useCases_{vector,embedText_vector,fulltext}), so a server that BUILT an index name from the container name would
//    find nothing on a renamed copy. (a) the DME's own index resolution, on the live golden, returns indexes that exist; (b) no source
//    file of the server or the DME tools builds an index name from goldenContainerName or graphName.
const indexStep = (goldenDb, passportGraphName) => {
	const dmeDirPath = path.join(SERVER_PATH, '..', 'cli', 'lib.d', 'data-model-explorer');
	const neo4j = require(path.join(dmeDirPath, 'node_modules', 'neo4j-driver'));
	const hybridRetrieval = require(path.join(dmeDirPath, 'lib', 'hybridRetrieval'));
	const driver = neo4j.driver(goldenConnection.boltUri, neo4j.auth.basic(goldenConnection.user, goldenConnection.password));
	const session = driver.session({ defaultAccessMode: neo4j.session.READ });
	session.run('SHOW INDEXES YIELD name, type').then((indexResult) => {
		const indexNameList = indexResult.records.map((oneRecord) => oneRecord.get('name'));
		hybridRetrieval.resolveSearchIndexes({ session, verbName: 'passportIsIdentity', searchMode: 'hybrid' }, (resolveError, resolved) => setImmediate(() => {
			const resolvedNameList = resolveError || !resolved ? [] : [resolved.vectorIndexName, resolved.fulltextIndexName];
			check('5a. hybrid search resolves its vector and fulltext indexes by what they index, and both exist in the graph', !resolveError && !(resolved && resolved.refusal) && resolvedNameList.every((indexName) => indexNameList.includes(indexName)), resolveError || JSON.stringify(resolved));
			check(`5a. the resolved index names are the graph's own (${JSON.stringify(resolvedNameList)}), none built from the container's name`, resolvedNameList.length === 2 && resolvedNameList.every((indexName) => !indexName.includes(ADDRESS_ONLY_CONTAINER_NAME)), JSON.stringify(resolvedNameList));
			const sourceFileList = [];
			const collectSource = (dirPath) => fs.readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
				const entryPath = path.join(dirPath, entry.name);
				if (entry.isDirectory()) {
					if (!['node_modules', 'test', 'codeAttic'].includes(entry.name)) { collectSource(entryPath); }
					return;
				}
				if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) { sourceFileList.push(entryPath); }
			});
			[path.join(SERVER_PATH, 'lib'), path.join(SERVER_PATH, 'data-model'), path.join(SERVER_PATH, 'endpoints-dot-d'), dmeDirPath].forEach(collectSource);
			const DERIVED_INDEX_NAME_PATTERN = /\$\{[^}]*(goldenContainerName|graphName)[^}]*\}_(fulltext|vector|embedText)|(goldenContainerName|graphName)\s*\+\s*['"`]_(fulltext|vector|embedText)/;
			const derivingFileList = sourceFileList.filter((sourceFilePath) => DERIVED_INDEX_NAME_PATTERN.test(fs.readFileSync(sourceFilePath, 'utf8'))).map((sourceFilePath) => path.relative(SERVER_PATH, sourceFilePath));
			check(`5b. no source file builds an index name from the container or graph name (${sourceFileList.length} files read)`, sourceFileList.length > 100 && derivingFileList.length === 0, derivingFileList.join(', '));
			session.close().then(() => driver.close()).then(() => companionStep(goldenDb, passportGraphName));
		}));
	}, (showError) => abort('SHOW INDEXES', showError.message));
};

// 4. the companion compile, through the companion harness (it installs its own process.global, so it runs last)
const companionStep = (goldenDb, passportGraphName) => {
	const { bootCompanionServer, httpPost, loginEveryRole } = require('./lib/companionServerHarness');
	const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'passportIsIdentity-'));
	bootCompanionServer({ scratchDirPath, neo4jDb: goldenDb, configBySectionName: { dataModelExplorerSearch: { goldenContainerName: ADDRESS_ONLY_CONTAINER_NAME } } }, (bootError, server) => {
		if (bootError) abort('companion boot', bootError);
		const pageSlug = SEED_MANIFEST.pageRecord.pageSlug;
		server.accessPointByName['companion-page-save']({ pageRecord: SEED_MANIFEST.pageRecord }, (saveError) => {
			if (saveError) abort('companion seed page', saveError);
			const uploadNext = (remainingSourceList) => {
				if (remainingSourceList.length) {
					const oneSource = remainingSourceList[0];
					server.accessPointByName['companion-source-upload']({
						uploadedBy: 'passport-is-identity.test', pageSlug, sourceRole: oneSource.sourceRole, sourcePart: oneSource.sourcePart,
						fileName: path.basename(oneSource.relativeFilePath), fileBase64: fs.readFileSync(path.join(SEED_SOURCE_DIR_PATH, oneSource.relativeFilePath)).toString('base64'),
						originUrl: oneSource.originUrl, originNote: oneSource.originNote, documentDate: oneSource.documentDate,
					}, (uploadError) => {
						if (uploadError) abort(`companion upload ${oneSource.sourcePart}`, uploadError);
						uploadNext(remainingSourceList.slice(1));
					});
					return;
				}
				loginEveryRole(server, (loginError, tokenByRoleName) => {
					if (loginError) abort('companion login', loginError);
					httpPost({ baseUrl: server.baseUrl, routePath: '/api/companion-compile-current', requestBody: { pageSlug }, authtoken: tokenByRoleName.user }, (postError, response) => {
						const pageAnswer = !postError && response.statusCode === 200 && Array.isArray(response.bodyJson) ? response.bodyJson[0] : null;
						check('4. the companion page compiles, current, stamped with the passport\'s graphName', pageAnswer && pageAnswer.isCurrent === true && pageAnswer.compileRecord.graphName === passportGraphName, postError || `${response.statusCode} ${response.bodyText.slice(0, 300)}`);
						server.close();
						goldenDb.close();
						fs.rmSync(scratchDirPath, { recursive: true, force: true });
						finish();
					});
				});
			};
			uploadNext(SEED_MANIFEST.sourceList);
		});
	});
};
