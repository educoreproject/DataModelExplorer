'use strict';
// standard-downloads-publications.test.js — the gold's PUBLISHED mapping sets and card downloads on the server (educoreForge
// mappingLayers ML3.1 Part C), through the same access point, mapper and endpoints the server loads, against the LIVE golden
// (read-only handle) for the passport. Fixtures are written into a scratch directory by this test: a downloads.json stamped
// from the golden's own passport (the publication listing is read only after the downloads are proved the golden's own) and
// a publicationDownloads.json beside it.
//   1. the listing: every entry, whitelisted fields, stamped with the manifest label; it takes no filter;
//   2. a listed file is answered with its kind's content type, its bytes, and its sha256 (also as X-Download-Sha256), under
//      its flattened path;
//   3. refusals by name: an unknown id; a file whose bytes no longer match; a listing for another graph; no listing; a listing
//      entry whose path leaves mappingLayers/ and hubCards/; an unknown kind; downloads that are not the golden's own;
//   4. the endpoints, public (2026-10-30): answered without a user, 400 with the refusal's text, [result] for the listing;
//   5. the REAL listing for this golden, when educoreForge has published one (STANDARD_DOWNLOADS_REAL_ROOT_DIR_PATH or the
//      qbook [standardDownloads] directory): every listed file's bytes hash to the listing's sha256.
//
// Run: /usr/local/bin/node server/test/standard-downloads-publications.test.js

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
const PUBLICATIONS_ENDPOINT_PATH = path.join(CODE_ROOT_PATH, 'server/endpoints-dot-d/qtDotLib.d/standard-downloads-publications.js');
const PUBLICATION_FILE_ENDPOINT_PATH = path.join(CODE_ROOT_PATH, 'server/endpoints-dot-d/qtDotLib.d/standard-downloads-publication-file.js');
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


const writeFixture = ({ fixtureName, graphName, graphContractSha256, publicationGraphName, extraEntryList = [] }) => {
	const rootDirPath = path.join(scratchRootPath, fixtureName);
	const downloadsDirPath = path.join(rootDirPath, goldenContainerName);
	fs.mkdirSync(path.join(downloadsDirPath, 'mappingLayers', 'layer', 'toyLayer', 'v1'), { recursive: true });
	fs.mkdirSync(path.join(downloadsDirPath, 'hubCards', 'ToyHub', '1.0'), { recursive: true });
	const setBuffer = Buffer.from('subject_id\tsubject_label\tpredicate_id\nedfi:property/X\tX\tskos:exactMatch\n');
	const cardBuffer = Buffer.from('meaningUri,definition\r\nhttps://w3id.org/EDUcore/ToyHub/hub/1.0/aaaa,a card\r\n');
	fs.writeFileSync(path.join(downloadsDirPath, 'mappingLayers', 'layer', 'toyLayer', 'v1', 'set.sssom.tsv'), setBuffer);
	fs.writeFileSync(path.join(downloadsDirPath, 'hubCards', 'ToyHub', '1.0', 'cards.csv'), Buffer.from('changed after the listing was written'));
	fs.writeFileSync(path.join(downloadsDirPath, 'downloads.json'), JSON.stringify({ manifestFormat: 'educoreStandardDownloads/2', graphName, graphContractSha256, generatedAt: '2026-10-26', entryList: [] }));
	const entryOf = (overrideObject) => ({ layerKey: null, versionTag: null, standardKey: null, hubSegment: null, hubReleaseSegment: null, layerTitle: null, registrationStatus: null, hubName: null, hubVersion: null, cardCount: null, ...overrideObject });
	const publication = {
		manifestFormat: 'educorePublicationDownloads/1',
		graphName: publicationGraphName || graphName,
		publicLabel: 'educore-toy',
		manifestRefId: 'a'.repeat(64),
		generatedAt: '2026-10-26',
		entryList: [
			entryOf({ downloadId: 'mappingLayers/layer/toyLayer/v1/set.sssom.tsv', kind: 'mappingSet', format: 'text/tab-separated-values (SSSOM/TSV)', relativePath: 'mappingLayers/layer/toyLayer/v1/set.sssom.tsv', byteSize: setBuffer.length, sha256: sha256Of(setBuffer), layerKey: 'toyLayer', versionTag: 'v1', layerTitle: 'a toy layer', registrationStatus: 'Standard' }),
			entryOf({ downloadId: 'hubCards/ToyHub/1.0/cards.csv', kind: 'hubCardsCsv', format: 'text/csv', relativePath: 'hubCards/ToyHub/1.0/cards.csv', byteSize: cardBuffer.length, sha256: sha256Of(cardBuffer), hubSegment: 'ToyHub', hubReleaseSegment: '1.0', hubName: 'ToyHub', hubVersion: '1.0', cardCount: 1 }),
			...extraEntryList.map(entryOf),
		],
	};
	fs.writeFileSync(path.join(downloadsDirPath, 'publicationDownloads.json'), JSON.stringify(publication));
	return { rootDirPath, setBuffer };
};

console.log('\n=== Standard downloads: the published mapping sets and hub cards ===\n');

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
		const stamped = { graphName: goldenContainerName, graphContractSha256: goldenPassport.graphContractSha256 };
		const goodFixture = writeFixture({ fixtureName: 'good', ...stamped });
		const otherGraphFixture = writeFixture({ fixtureName: 'otherGraph', ...stamped, publicationGraphName: 'GOLD_EVAL_someOtherGraph' });
		const traversalFixture = writeFixture({ fixtureName: 'traversal', ...stamped, extraEntryList: [{ downloadId: 'escape', kind: 'mappingSet', format: 'x', relativePath: 'mappingLayers/../downloads.json', byteSize: 1, sha256: 'b'.repeat(64) }] });
		const unknownKindFixture = writeFixture({ fixtureName: 'unknownKind', ...stamped, extraEntryList: [{ downloadId: 'odd', kind: 'executable', format: 'x', relativePath: 'mappingLayers/run.sh', byteSize: 1, sha256: 'b'.repeat(64) }] });
		const staleDownloadsFixture = writeFixture({ fixtureName: 'staleDownloads', graphName: goldenContainerName, graphContractSha256: 'f'.repeat(64) });

		runInOrder([
			// ---- 1. the listing
			(done) => { configureRoot(goodFixture.rootDirPath); ask({ action: 'publications' }, (err, result) => {
				ok('publications: every entry, stamped with the manifest label', !err && result.entryList.length === 2 && result.graphName === goldenContainerName && result.publicLabel === 'educore-toy', err || JSON.stringify(result).slice(0, 300));
				ok('publications: an entry carries only the whitelisted fields', !err && Object.keys(result.entryList[0]).sort().join() === ['byteSize', 'cardCount', 'downloadId', 'format', 'hubName', 'hubReleaseSegment', 'hubSegment', 'hubVersion', 'kind', 'layerKey', 'layerTitle', 'registrationStatus', 'relativePath', 'sha256', 'standardKey', 'versionTag'].join(), err || Object.keys(result.entryList[0]).join());
				done();
			}); },
			(done) => ask({ action: 'publications', kind: 'mappingSet' }, (err) => { ok('the listing takes no filter, refused by name', /^downloadFilterUnknown: kind: the publication listing takes no filter/.test(err), err); done(); }),

			// ---- 2. a listed file
			(done) => ask({ action: 'publicationFile', downloadId: 'mappingLayers/layer/toyLayer/v1/set.sssom.tsv' }, (err, result) => {
				ok('publicationFile: the bytes, the sha256, the kind\'s content type and the flattened name', !err && Buffer.compare(result.contentBuffer, goodFixture.setBuffer) === 0 && result.sha256 === sha256Of(goodFixture.setBuffer) && result.contentType === 'text/tab-separated-values; charset=utf-8' && result.fileName === 'mappingLayers_layer_toyLayer_v1_set.sssom.tsv', err || JSON.stringify({ ...result, contentBuffer: undefined }));
				done();
			}),

			// ---- 3. refusals
			(done) => ask({ action: 'publicationFile', downloadId: 'downloads.json' }, (err) => { ok('an unlisted id is refused by name (even a file that exists)', /^publicationUnknownId: 'downloads\.json'/.test(err), err); done(); }),
			(done) => ask({ action: 'publicationFile', downloadId: 'hubCards/ToyHub/1.0/cards.csv' }, (err) => { ok('a file whose bytes changed is refused by name', /^publicationChecksumMismatch: hubCards\/ToyHub\/1\.0\/cards\.csv: the file's sha256 is [0-9a-f]{64}, the listing says/.test(err), err); done(); }),
			(done) => { configureRoot(otherGraphFixture.rootDirPath); ask({ action: 'publications' }, (err) => { ok('a listing for another graph is refused by name', /^publicationsManifestMismatch: the publication listing is for graph 'GOLD_EVAL_someOtherGraph'/.test(err), err); done(); }); },
			(done) => { configureRoot(traversalFixture.rootDirPath); ask({ action: 'publications' }, (err) => { ok('a listing entry whose path leaves mappingLayers/ and hubCards/ is refused by name', /^publicationsManifestUnreadable: .*entries escape lack a field, name an unknown kind, or name a path outside/.test(err), err); done(); }); },
			(done) => { configureRoot(unknownKindFixture.rootDirPath); ask({ action: 'publicationFile', downloadId: 'odd' }, (err) => { ok('an unknown kind is refused by name, never served as octets', /^publicationsManifestUnreadable: .*entries odd/.test(err), err); done(); }); },
			(done) => { configureRoot(staleDownloadsFixture.rootDirPath); ask({ action: 'publications' }, (err) => { ok('downloads that are not the golden\'s own refuse the listing too', /^downloadsManifestMismatch/.test(err), err); done(); }); },
			(done) => {
				const noListingRootPath = writeFixture({ fixtureName: 'noListing', ...stamped }).rootDirPath;
				fs.unlinkSync(path.join(noListingRootPath, goldenContainerName, 'publicationDownloads.json'));
				configureRoot(noListingRootPath);
				ask({ action: 'publications' }, (err) => { ok('no listing for the golden is refused by name', new RegExp(`^publicationsAbsentForGolden: no mapping sets or card downloads have been published for '${goldenContainerName}'`).test(err), err); done(); });
			},

			// ---- 4. the endpoints
			(done) => { configureRoot(goodFixture.rootDirPath); runEndpoint({ endpointPath: PUBLICATIONS_ENDPOINT_PATH, authclaims: { user: { role: 'user' } }, requestBody: {}, accessPoint }, (answer) => {
				ok('publications endpoint: 200 as [result]', answer.statusCode === 200 && Array.isArray(answer.body) && answer.body[0].entryList.length === 2, `${answer.statusCode} ${JSON.stringify(answer.body).slice(0, 200)}`);
				done();
			}); },
			// public since 2026-10-30 (TQ: "all public"): a caller who is not signed in is answered exactly as a signed-in one
			(done) => runEndpoint({ endpointPath: PUBLICATIONS_ENDPOINT_PATH, authclaims: { noToken: true, user: { role: 'public' } }, requestBody: {}, accessPoint }, (answer) => { ok('publications endpoint: 200 as [result] for a public (not signed-in) caller', answer.statusCode === 200 && Array.isArray(answer.body) && answer.body[0].entryList.length === 2, `${answer.statusCode} ${JSON.stringify(answer.body).slice(0, 200)}`); done(); }),
			(done) => runEndpoint({ endpointPath: PUBLICATION_FILE_ENDPOINT_PATH, authclaims: { user: { role: 'user' } }, requestBody: { downloadId: 'mappingLayers/layer/toyLayer/v1/set.sssom.tsv' }, accessPoint }, (answer) => {
				ok('publication-file endpoint: the file as an attachment with its content type, its sha256 in X-Download-Sha256', answer.statusCode === 200 && Buffer.isBuffer(answer.body) && answer.headerByName['Content-Type'] === 'text/tab-separated-values; charset=utf-8' && answer.headerByName['Content-Disposition'] === 'attachment; filename="mappingLayers_layer_toyLayer_v1_set.sssom.tsv"' && answer.headerByName['X-Download-Sha256'] === sha256Of(answer.body), `${answer.statusCode} ${JSON.stringify(answer.headerByName)}`);
				done();
			}),
			(done) => runEndpoint({ endpointPath: PUBLICATION_FILE_ENDPOINT_PATH, authclaims: { user: { role: 'user' } }, requestBody: { downloadId: '../downloads.json' }, accessPoint }, (answer) => { ok('publication-file endpoint: an unlisted id is 400 with the refusal', answer.statusCode === 400 && /^publicationUnknownId/.test(answer.body), `${answer.statusCode} ${answer.body}`); done(); }),
			(done) => runEndpoint({ endpointPath: PUBLICATION_FILE_ENDPOINT_PATH, authclaims: { noToken: true, user: { role: 'public' } }, requestBody: { downloadId: 'mappingLayers/layer/toyLayer/v1/set.sssom.tsv' }, accessPoint }, (answer) => { ok('publication-file endpoint: the file for a public (not signed-in) caller, its sha256 in X-Download-Sha256', answer.statusCode === 200 && Buffer.isBuffer(answer.body) && answer.headerByName['X-Download-Sha256'] === sha256Of(answer.body), `${answer.statusCode}`); done(); }),

			// ---- 5. the REAL listing for this golden
			(done) => {
				if (typeof realRootDirPath !== 'string' || !fs.existsSync(path.join(realRootDirPath, goldenContainerName, 'publicationDownloads.json'))) {
					console.log(`  NOTE: no real publication listing for '${goldenContainerName}' under ${realRootDirPath}; the real-artifact check is NOT exercised by this run`);
					done();
					return;
				}
				configureRoot(realRootDirPath);
				ask({ action: 'publications' }, (listError, listResult) => {
					ok('real listing: it reads, and lists mapping sets and hub cards', !listError && listResult.entryList.some((oneEntry) => oneEntry.kind === 'mappingSet') && listResult.entryList.some((oneEntry) => oneEntry.kind === 'hubCardsCsv'), listError);
					const entryList = listError ? [] : listResult.entryList;
					const checkNext = (entryIndex, mismatchList) => {
						if (entryIndex === entryList.length) {
							ok(`real listing: every one of ${entryList.length} listed file(s) is served with bytes that hash to the listing's sha256`, mismatchList.length === 0, mismatchList.join('; '));
							done();
							return;
						}
						ask({ action: 'publicationFile', downloadId: entryList[entryIndex].downloadId }, (fileError, fileResult) => setImmediate(() => checkNext(entryIndex + 1, fileError || sha256Of(fileResult.contentBuffer) !== entryList[entryIndex].sha256 ? mismatchList.concat([`${entryList[entryIndex].downloadId}: ${fileError || 'sha256 differs'}`]) : mismatchList)));
					};
					checkNext(0, []);
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
