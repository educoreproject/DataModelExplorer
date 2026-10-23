'use strict';
// standard-downloads.test.js — the standard downloads on the server (WORKORDER-standardDownloads-101526 §3b, §4), through
// the same access point, mapper and endpoints the server loads, against the LIVE golden (read-only handle) for the
// passport. Fixture manifests are written into a scratch directory by this test, each stamped from the golden's own
// passport as this test's Cypher reads it; the real artifacts are read from the qbook [standardDownloads] directory.
//   1. the manifest and its filters (family, group, standardKey, facet; together; an unknown filter refused);
//   2. a file whose sha256 matches is answered as an attachment, the bytes and the X-Download-Sha256 header equal to
//      the manifest's sha256; the same for the REAL College Transcript 1.8.0 graph zip;
//   3. refusals by name: an unknown id; a path-traversal id; an unavailable entry; a file whose bytes no longer match;
//      a manifest whose graphContractSha256 or graphName is not the golden's; no downloads for the golden; not configured;
//   4. the endpoints: 401 without a user, 400 with the refusal's text, [result] for the manifest;
//   5. where each source came from (WORKORDER-sourceUrls-101526): the five sourceUrl fields carried out verbatim, null
//      when not recorded; a manifest of the earlier format /1 refused by name; the REAL manifest's CEDS, CT 1.8.0 and
//      Ed-Fi entries say downloadedFrom, republishedAs (with page and note) and nothing recorded.
//
// The real artifacts come from the qbook [standardDownloads] directory, or from STANDARD_DOWNLOADS_REAL_ROOT_DIR_PATH when
// that is set (a worktree testing artifacts not yet in the shared directory names them there; nothing else reads it).
//
// Run: /usr/local/bin/node server/test/standard-downloads.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const configFileProcessor = require('qtools-config-file-processor');

const configBySection = {};
process.global = {
	getConfig: (sectionName) => configBySection[sectionName] || { secret: 'standard-downloads-test-secret' },
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const { readGoldenContainerName, serverConfigDirPath } = require('./lib/goldenContainerName');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const CODE_ROOT_PATH = path.join(__dirname, '..', '..');
const MAPPER_PATH = path.join(CODE_ROOT_PATH, 'server/data-model/data-mapping/mappers/standard-downloads.js');
const ACCESS_POINT_PATH = path.join(CODE_ROOT_PATH, 'server/data-model/access-points-dot-d/accessPoints.d/standard-downloads.js');
const MANIFEST_ENDPOINT_PATH = path.join(CODE_ROOT_PATH, 'server/endpoints-dot-d/qtDotLib.d/standard-downloads-manifest.js');
const FILE_ENDPOINT_PATH = path.join(CODE_ROOT_PATH, 'server/endpoints-dot-d/qtDotLib.d/standard-downloads-file.js');
const TOKEN_TOOLS_PATH = path.join(CODE_ROOT_PATH, 'server/lib/access-token-header-tools.js');

const mapper = require(MAPPER_PATH)({});
const goldenContainerName = readGoldenContainerName();
const sha256Of = (contentBuffer) => crypto.createHash('sha256').update(contentBuffer).digest('hex');
const scratchRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'standard-downloads-test-'));

const loadAccessPoint = (neo4jDb) => {
	const accessPointByName = {};
	require(ACCESS_POINT_PATH)({
		dotD: { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } },
		passThroughParameters: { neo4jDb, dataMapping: { 'standard-downloads': mapper } },
	});
	return accessPointByName['standard-downloads'];
};

const runEndpoint = ({ endpointPath, authclaims, requestBody, accessPoint }, callback) => {
	let routeHandler;
	const accessTokenHeaderTools = require(TOKEN_TOOLS_PATH)({ expressApp: {} });
	require(endpointPath)({
		dotD: { logList: [] },
		passThroughParameters: { expressApp: { post: (routePath, handler) => { routeHandler = handler; } }, accessTokenHeaderTools, accessPointsDotD: { 'standard-downloads': accessPoint }, routingPrefix: '/api/' },
	});
	const xReq = { appValueGetter: () => authclaims, qtGetSurePath: () => requestBody };
	const answer = { statusCode: 200, headerByName: {} };
	const xRes = {
		status: (statusCode) => { answer.statusCode = statusCode; return xRes; },
		set: (headerName, headerValue) => { answer.headerByName[headerName] = headerValue; return xRes; },
		send: (body) => { answer.body = body; callback(answer); },
	};
	routeHandler(xReq, xRes, () => {});
};

const runInOrder = (stepList, callback) => {
	const runNext = (stepIndex) => {
		if (stepIndex === stepList.length) { callback(); return; }
		// each step starts on a fresh tick: a step's callback runs inside the driver's promise chain, where a throw from the
		// next step would be caught by neo4j-instance and delivered as a second callback of the step before
		stepList[stepIndex](() => setImmediate(() => runNext(stepIndex + 1)));
	};
	runNext(0);
};

// a fixture downloads directory for the golden: three entries, one file intact, one file whose bytes were changed
const writeFixture = ({ fixtureName, graphName, graphContractSha256 }) => {
	const rootDirPath = path.join(scratchRootPath, fixtureName);
	const downloadsDirPath = path.join(rootDirPath, goldenContainerName);
	fs.mkdirSync(downloadsDirPath, { recursive: true });
	const intactBuffer = Buffer.from('PK fixture: the intact zip');
	fs.writeFileSync(path.join(downloadsDirPath, 'toy-source.zip'), intactBuffer);
	fs.writeFileSync(path.join(downloadsDirPath, 'toy-graph.zip'), Buffer.from('PK fixture: changed after the manifest was written'));
	fs.writeFileSync(path.join(rootDirPath, 'outside.zip'), Buffer.from('PK a file outside the golden directory'));
	const toySourceUrl = { sourceUrl: 'https://toy.example/transcript/', sourceUrlRelation: 'publishedOn', sourceUrlRelationText: 'Published on', sourceUrlPage: null, sourceUrlNote: 'the link is labelled Toy' };
	const entryOf = (overrideObject) => ({ family: 'PESC', group: 'Toy Transcript', standardKey: 'toy', standardName: 'PESC-Toy-1.0.0', version: '1.0.0', roundTrip: null, description: 'a toy', unavailableReason: null, available: true, ...toySourceUrl, ...overrideObject });
	const notRecorded = { sourceUrl: null, sourceUrlRelation: null, sourceUrlRelationText: null, sourceUrlPage: null, sourceUrlNote: null };
	const manifest = {
		manifestFormat: 'educoreStandardDownloads/2',
		graphName,
		graphContractSha256,
		generatedAt: '2026-10-15',
		entryList: [
			entryOf({ downloadId: 'toy-graph', facet: 'graph', fileName: 'toy-graph.zip', byteSize: 10, sha256: sha256Of(Buffer.from('PK fixture: the original bytes')), roundTrip: { inventedTotal: 0, lostTotal: 0 } }),
			entryOf({ downloadId: 'toy-source', facet: 'source', fileName: 'toy-source.zip', byteSize: intactBuffer.length, sha256: sha256Of(intactBuffer) }),
			entryOf({ downloadId: 'held-source', family: 'EdFi', group: 'Toy Ed-Fi', standardKey: 'held', facet: 'source', fileName: null, byteSize: null, sha256: null, available: false, unavailableReason: 'held under the toy licence', ...notRecorded }),
		],
	};
	fs.writeFileSync(path.join(downloadsDirPath, 'downloads.json'), JSON.stringify(manifest));
	return { rootDirPath, intactBuffer };
};

console.log('\n=== Standard downloads: manifest, files, refusals ===\n');

const goldenConnection = resolveContainerConnection(goldenContainerName);
if (goldenConnection.error) {
	console.log(`  FAIL: golden connection: ${goldenConnection.error}`);
	process.exit(1);
}
const realRootDirPath = process.env.STANDARD_DOWNLOADS_REAL_ROOT_DIR_PATH || ((configFileProcessor.getConfig('startApiServer.ini', serverConfigDirPath(), { resolve: true }) || {}).standardDownloads || {}).downloadArtifactsRootDirPath;

neo4jGen.initDatabaseInstance({ neo4jBoltUri: goldenConnection.boltUri, neo4jUser: goldenConnection.user, neo4jPassword: goldenConnection.password, readOnly: true, queryTimeoutMs: 60000 }, (connectError, goldenDb) => {
	if (connectError) {
		console.log(`  FAIL: golden connect: ${connectError}`);
		process.exit(1);
	}
	const accessPoint = loadAccessPoint(goldenDb);
	const ask = (xQuery, callback) => accessPoint(xQuery, callback);
	const configureRoot = (rootDirPath) => {
		configBySection.standardDownloads = { downloadArtifactsRootDirPath: rootDirPath };
		configBySection.dataModelExplorerSearch = { goldenContainerName };
	};

	goldenDb.runQuery('MATCH (p:GraphProvenance) RETURN p.graphName AS graphName, p.graphContractSha256 AS graphContractSha256', {}, (passportError, passportRowList) => {
		if (passportError || passportRowList.length !== 1) {
			console.log(`  FAIL: this test's passport read: ${passportError || passportRowList.length}`);
			process.exit(1);
		}
		const goldenPassport = passportRowList[0];
		const goodFixture = writeFixture({ fixtureName: 'good', graphName: goldenContainerName, graphContractSha256: goldenPassport.graphContractSha256 });
		const staleShaFixture = writeFixture({ fixtureName: 'staleSha', graphName: goldenContainerName, graphContractSha256: 'f'.repeat(64) });
		const otherGraphFixture = writeFixture({ fixtureName: 'otherGraph', graphName: 'GOLD_EVAL_someOtherGraph', graphContractSha256: goldenPassport.graphContractSha256 });

		runInOrder([
			// ---- 1. the manifest and its filters
			(done) => { configureRoot(goodFixture.rootDirPath); ask({ action: 'manifest' }, (err, result) => {
				ok('manifest: every entry, stamped with the golden', !err && result.entryList.length === 3 && result.graphName === goldenContainerName && result.graphContractSha256 === goldenPassport.graphContractSha256 && result.generatedAt === '2026-10-15', err || JSON.stringify(result).slice(0, 300));
				ok('manifest: an entry carries only the whitelisted fields', !err && Object.keys(result.entryList[0]).sort().join() === ['available', 'byteSize', 'description', 'downloadId', 'facet', 'family', 'fileName', 'group', 'roundTrip', 'sha256', 'sourceUrl', 'sourceUrlNote', 'sourceUrlPage', 'sourceUrlRelation', 'sourceUrlRelationText', 'standardKey', 'standardName', 'unavailableReason', 'version'].join(), err || Object.keys(result.entryList[0]).join());
				done();
			}); },
			(done) => ask({ action: 'manifest', family: 'EdFi' }, (err, result) => { ok('filter family', !err && result.entryList.map((oneEntry) => oneEntry.downloadId).join() === 'held-source', err || JSON.stringify(result.entryList)); done(); }),
			(done) => ask({ action: 'manifest', group: 'Toy Transcript' }, (err, result) => { ok('filter group', !err && result.entryList.length === 2, err || result.entryList.length); done(); }),
			(done) => ask({ action: 'manifest', standardKey: 'held' }, (err, result) => { ok('filter standardKey', !err && result.entryList.length === 1 && result.entryList[0].downloadId === 'held-source', err || result.entryList.length); done(); }),
			(done) => ask({ action: 'manifest', facet: 'graph' }, (err, result) => { ok('filter facet', !err && result.entryList.map((oneEntry) => oneEntry.downloadId).join() === 'toy-graph', err || result.entryList.length); done(); }),
			(done) => ask({ action: 'manifest', family: 'PESC', facet: 'source' }, (err, result) => { ok('filters together, and each named back', !err && result.entryList.map((oneEntry) => oneEntry.downloadId).join() === 'toy-source' && result.filterList.map((oneFilter) => `${oneFilter.fieldName}=${oneFilter.fieldValue}`).join() === 'family=PESC,facet=source', err || JSON.stringify(result.filterList)); done(); }),
			(done) => ask({ action: 'manifest', family: 'PESC', path: '../x' }, (err) => { ok('an unknown filter is refused by name', /^downloadFilterUnknown: path is not a filter; the filters are family, group, standardKey, facet/.test(err), err); done(); }),

			// ---- 2. a file whose sha256 matches
			(done) => ask({ action: 'file', downloadId: 'toy-source' }, (err, result) => { ok('file: the bytes, with the manifest\'s sha256', !err && Buffer.compare(result.contentBuffer, goodFixture.intactBuffer) === 0 && result.sha256 === sha256Of(goodFixture.intactBuffer) && result.fileName === 'toy-source.zip', err); done(); }),

			// ---- 3. refusals
			(done) => ask({ action: 'file', downloadId: 'no-such-download' }, (err) => { ok('an unknown id is refused by name', /^downloadUnknownId: 'no-such-download' is not a downloadId/.test(err), err); done(); }),
			(done) => ask({ action: 'file', downloadId: '../outside.zip' }, (err, result) => { ok('a path-traversal id is refused by name (and nothing is read)', /^downloadUnknownId: '\.\.\/outside\.zip'/.test(err) && result === undefined, err); done(); }),
			(done) => ask({ action: 'file', downloadId: '../../../../etc/passwd' }, (err) => { ok('a deep path-traversal id is refused by name', /^downloadUnknownId/.test(err), err); done(); }),
			(done) => ask({ action: 'file', downloadId: 'held-source' }, (err) => { ok('an unavailable entry is refused with its reason', /^downloadUnavailable: held-source: held under the toy licence/.test(err), err); done(); }),
			(done) => ask({ action: 'file', downloadId: 'toy-graph' }, (err) => { ok('a file whose bytes changed is refused by name', /^downloadChecksumMismatch: toy-graph: the file's sha256 is [0-9a-f]{64}, the manifest says/.test(err), err); done(); }),
			(done) => { configureRoot(staleShaFixture.rootDirPath); ask({ action: 'manifest' }, (err) => { ok('a manifest for another graph contract is refused by name', /^downloadsManifestMismatch: the manifest's graphContractSha256 f{64} is not the golden's/.test(err), err); done(); }); },
			(done) => ask({ action: 'file', downloadId: 'toy-source' }, (err) => { ok('...and no file is served from it', /^downloadsManifestMismatch/.test(err), err); done(); }),
			(done) => { configureRoot(otherGraphFixture.rootDirPath); ask({ action: 'manifest' }, (err) => { ok('a manifest for another graph name is refused by name', /^downloadsManifestMismatch: the manifest is for graph 'GOLD_EVAL_someOtherGraph'/.test(err), err); done(); }); },
			(done) => { configureRoot(path.join(scratchRootPath, 'nothingHere')); ask({ action: 'manifest' }, (err) => { ok('no downloads for the golden is refused by name', new RegExp(`^downloadsAbsentForGolden: no downloads have been generated for the golden '${goldenContainerName}'`).test(err), err); done(); }); },
			(done) => {
				const incompleteRootPath = writeFixture({ fixtureName: 'incomplete', graphName: goldenContainerName, graphContractSha256: goldenPassport.graphContractSha256 }).rootDirPath;
				const incompleteManifestPath = path.join(incompleteRootPath, goldenContainerName, 'downloads.json');
				const incompleteManifest = JSON.parse(fs.readFileSync(incompleteManifestPath, 'utf8'));
				delete incompleteManifest.entryList[1].unavailableReason;
				fs.writeFileSync(incompleteManifestPath, JSON.stringify(incompleteManifest));
				configureRoot(incompleteRootPath);
				ask({ action: 'manifest' }, (err) => { ok('a manifest entry lacking a field is refused by name, never filled in', /^downloadsManifestUnreadable: .*toy-source \(lacks unavailableReason\)/.test(err), err); done(); });
			},
			// ---- 5. where each source came from
			(done) => { configureRoot(goodFixture.rootDirPath); ask({ action: 'manifest' }, (err, result) => {
				const entryById = {};
				(result ? result.entryList : []).forEach((oneEntry) => { entryById[oneEntry.downloadId] = oneEntry; });
				ok('source URL: carried out verbatim (address, relation, wording, page, note)', !err && entryById['toy-source'].sourceUrl === 'https://toy.example/transcript/' && entryById['toy-source'].sourceUrlRelation === 'publishedOn' && entryById['toy-source'].sourceUrlRelationText === 'Published on' && entryById['toy-source'].sourceUrlPage === null && entryById['toy-source'].sourceUrlNote === 'the link is labelled Toy', err || JSON.stringify(entryById['toy-source']));
				ok('source URL: not recorded is every field present and null', !err && ['sourceUrl', 'sourceUrlRelation', 'sourceUrlRelationText', 'sourceUrlPage', 'sourceUrlNote'].every((fieldName) => fieldName in entryById['held-source'] && entryById['held-source'][fieldName] === null), err || JSON.stringify(entryById['held-source']));
				done();
			}); },
			(done) => {
				const earlierRootPath = writeFixture({ fixtureName: 'earlierFormat', graphName: goldenContainerName, graphContractSha256: goldenPassport.graphContractSha256 }).rootDirPath;
				const earlierManifestPath = path.join(earlierRootPath, goldenContainerName, 'downloads.json');
				const earlierManifest = JSON.parse(fs.readFileSync(earlierManifestPath, 'utf8'));
				earlierManifest.manifestFormat = 'educoreStandardDownloads/1';
				fs.writeFileSync(earlierManifestPath, JSON.stringify(earlierManifest));
				configureRoot(earlierRootPath);
				ask({ action: 'manifest' }, (err) => { ok('source URL: a manifest of the earlier format /1 is refused by name', /^downloadsManifestUnreadable: .*its manifestFormat is 'educoreStandardDownloads\/1', not 'educoreStandardDownloads\/2'/.test(err), err); done(); });
			},
			(done) => {
				const noNoteRootPath = writeFixture({ fixtureName: 'noNote', graphName: goldenContainerName, graphContractSha256: goldenPassport.graphContractSha256 }).rootDirPath;
				const noNoteManifestPath = path.join(noNoteRootPath, goldenContainerName, 'downloads.json');
				const noNoteManifest = JSON.parse(fs.readFileSync(noNoteManifestPath, 'utf8'));
				delete noNoteManifest.entryList[2].sourceUrlNote;
				fs.writeFileSync(noNoteManifestPath, JSON.stringify(noNoteManifest));
				configureRoot(noNoteRootPath);
				ask({ action: 'manifest' }, (err) => { ok('source URL: an entry lacking sourceUrlNote is refused, never filled in', /^downloadsManifestUnreadable: .*held-source \(lacks sourceUrlNote\)/.test(err), err); done(); });
			},
			(done) => { delete configBySection.standardDownloads; ask({ action: 'manifest' }, (err) => { ok('an unconfigured server refuses by name', /^downloadsNotConfigured: this server declares no \[standardDownloads\] downloadArtifactsRootDirPath/.test(err), err); done(); }); },
			(done) => ask({ action: 'sweep' }, (err) => { ok('an unknown action is refused', /action 'sweep' is not one of: manifest, file/.test(err), err); done(); }),

			// ---- 4. the endpoints
			(done) => { configureRoot(goodFixture.rootDirPath); runEndpoint({ endpointPath: MANIFEST_ENDPOINT_PATH, authclaims: { user: { role: 'user' } }, requestBody: { facet: 'source' }, accessPoint }, (answer) => {
				ok('manifest endpoint: 200 as [result], filtered by the body', answer.statusCode === 200 && Array.isArray(answer.body) && answer.body[0].entryList.length === 2, `${answer.statusCode} ${JSON.stringify(answer.body).slice(0, 200)}`);
				done();
			}); },
			(done) => runEndpoint({ endpointPath: MANIFEST_ENDPOINT_PATH, authclaims: { user: { role: 'public' } }, requestBody: {}, accessPoint }, (answer) => { ok('manifest endpoint: 401 for a public (not logged-in) caller', answer.statusCode === 401, `${answer.statusCode}`); done(); }),
			(done) => runEndpoint({ endpointPath: FILE_ENDPOINT_PATH, authclaims: { user: { role: 'user' } }, requestBody: { downloadId: 'toy-source' }, accessPoint }, (answer) => {
				ok('file endpoint: the zip as an attachment, its sha256 in X-Download-Sha256', answer.statusCode === 200 && Buffer.isBuffer(answer.body) && answer.headerByName['Content-Type'] === 'application/zip' && answer.headerByName['Content-Disposition'] === 'attachment; filename="toy-source.zip"' && answer.headerByName['X-Download-Sha256'] === sha256Of(answer.body), `${answer.statusCode} ${JSON.stringify(answer.headerByName)}`);
				done();
			}),
			(done) => runEndpoint({ endpointPath: FILE_ENDPOINT_PATH, authclaims: { user: { role: 'user' } }, requestBody: { downloadId: '../outside.zip' }, accessPoint }, (answer) => { ok('file endpoint: a traversal id is 400 with the refusal', answer.statusCode === 400 && /^downloadUnknownId/.test(answer.body), `${answer.statusCode} ${answer.body}`); done(); }),
			(done) => runEndpoint({ endpointPath: FILE_ENDPOINT_PATH, authclaims: { user: { role: 'public' } }, requestBody: { downloadId: 'toy-source' }, accessPoint }, (answer) => { ok('file endpoint: 401 for a public (not logged-in) caller', answer.statusCode === 401, `${answer.statusCode}`); done(); }),

			// ---- 2b. the REAL artifacts for this golden
			(done) => {
				if (typeof realRootDirPath !== 'string' || !fs.existsSync(path.join(realRootDirPath, goldenContainerName, 'downloads.json'))) {
					ok('the real downloads for the golden exist (qbook [standardDownloads])', false, `${realRootDirPath}/${goldenContainerName}/downloads.json is absent: run educoreForge downloadArtifacts for this golden`);
					done();
					return;
				}
				configureRoot(realRootDirPath);
				ask({ action: 'manifest', standardKey: 'pesccollegetranscript1v8v0', facet: 'graph' }, (manifestError, manifestResult) => {
					const entry = manifestResult && manifestResult.entryList[0];
					ok('real manifest: College Transcript 1.8.0 graph is listed and available', !manifestError && manifestResult.entryList.length === 1 && entry.available === true && entry.family === 'PESC' && entry.version === '1.8.0', manifestError || JSON.stringify(manifestResult.entryList));
					ask({ action: 'file', downloadId: 'pesccollegetranscript1v8v0-graph' }, (fileError, fileResult) => {
						ok('real file: its bytes hash to the manifest\'s sha256', !fileError && entry && sha256Of(fileResult.contentBuffer) === entry.sha256 && fileResult.byteSize === entry.byteSize, fileError);
						ask({ action: 'manifest', standardKey: 'pesc260805', facet: 'graph' }, (aggregateError, aggregateResult) => {
							ok('real manifest: the aggregate\'s graph entry is unavailable, "not in this graph"', !aggregateError && aggregateResult.entryList[0].available === false && aggregateResult.entryList[0].unavailableReason === 'not in this graph', aggregateError);
							ask({ action: 'manifest' }, (everyError, everyResult) => {
								const realById = {};
								(everyResult ? everyResult.entryList : []).forEach((oneEntry) => { realById[oneEntry.downloadId] = oneEntry; });
								const ceds = realById['ceds-source'] || {};
								const ct18 = realById['pesccollegetranscript1v8v0-source'] || {};
								const edfi = realById['edfi-source'] || {};
								ok('real manifest: CEDS is "Downloaded from" its GitHub commit', !everyError && ceds.sourceUrlRelation === 'downloadedFrom' && ceds.sourceUrlRelationText === 'Downloaded from' && /^https:\/\/github\.com\/CEDStandards\/CEDS-Ontology\/blob\/2cbe2396/.test(ceds.sourceUrl) && /4ef15304/.test(ceds.sourceUrlNote), everyError || JSON.stringify(ceds));
								ok('real manifest: CT 1.8.0 is re-published, with its page and caveat', ct18.sourceUrlRelation === 'republishedAs' && ct18.sourceUrlPage === 'https://pesc.org/college-transcript/' && /comments and whitespace/.test(ct18.sourceUrlNote) && /\.zip$/.test(ct18.sourceUrl), JSON.stringify(ct18));
								ok('real manifest: Ed-Fi records no address (every field null)', edfi.downloadId === 'edfi-source' && edfi.sourceUrl === null && edfi.sourceUrlRelation === null && edfi.sourceUrlRelationText === null, JSON.stringify(edfi));
								done();
							});
						});
					});
				});
			},
		], () => {
			goldenDb.close();
			fs.rmSync(scratchRootPath, { recursive: true, force: true });
			console.log(`\n${passed} passed, ${failed} failed`);
			process.exit(failed === 0 ? 0 : 1);
		});
	});
});
