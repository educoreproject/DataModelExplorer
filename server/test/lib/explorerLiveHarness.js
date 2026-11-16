'use strict';
// explorerLiveHarness.js — the live harness the Explorer's live tests share (explorer-uris-live.test.js, meanings-explorer-live.test.js; it was copied into the
// second until the meaningsExplorer review, S6). Requiring it sets process.global as the server's would, opens the local golden's read-only handle and the forge
// adapter, and builds the access points as access-points-dot-d builds them (standards-query, whose core proves the URI promise; standards-neighbourhood;
// forged-use-cases; edc-resolver), nothing stubbed but the usage table. With no reachable golden it prints a SKIP line and exits 0, so a test proves nothing
// by name, never silently. SUBJECT_SERVER_PATH points the branch library at another tree (the base, to watch a gate fail there); BASELINE_SERVER_PATH builds
// a second library from a tree to compare against.
//   → { goldenHandle, forgeAdapter, branchLibrary, baselineLibrary, resolveUri(uriText, callback({ httpStatus, body })), GATE_WAIT_MILLISECONDS, GATE_WAIT_LIMIT,
//       URI_MINTER_ACCESS_POINT_NAME }

const path = require('path');
const { Writable } = require('stream');

const configFileProcessor = require('qtools-config-file-processor');
const qbookConfig = configFileProcessor.getConfig('startApiServer.ini', path.join(__dirname, '..', '..', '..', '..', 'configs', 'instanceSpecific', 'qbook'), { resolve: true });
const EDC_CONFIG_VALUES = { directBlockMaxBytes: 536870912, directBlockTimeoutMilliseconds: 600000, directBlockSqliteCommandPath: '/usr/bin/sqlite3', sizeRefusalContactAddress: 'contact@explorerLiveHarness.example', ...qbookConfig['edc-resolver'] }; // the configs tree may predate the block values; nothing here reads a block
// rosetta-fuse and rosetta-judge are left empty, so the access point turns Rosetta off by name and opens no Rosetta store
const configValuesBySection = { 'edc-resolver': EDC_CONFIG_VALUES, 'standards-query-limits': qbookConfig['standards-query-limits'], 'mcp-server': qbookConfig['mcp-server'], 'rosetta-fuse': {}, 'rosetta-judge': {} };
process.global = {
	getConfig: (sectionName) => configValuesBySection[sectionName] || {},
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, color: {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const { readGoldenContainerName } = require('./goldenContainerName');
const { resolveContainerConnection } = require('../../data-model/lib/user-graph/container-connection-resolver');
const neo4jInstanceFactory = require('../../data-model/lib/neo4j-instance/neo4j-instance');
const { createGoldenGraphHandle, GOLDEN_RETRY_DELAY_MS_LIST } = require('../../data-model/lib/neo4j-instance/golden-graph-handle');
const { openForgeAdapter } = require('../../lib/edc-resolver/forgeAdapter');
const { URI_MINTER_ACCESS_POINT_NAME } = require('../../data-model/lib/explorer-uri-fields');



const goldenContainerName = readGoldenContainerName();
if (resolveContainerConnection(goldenContainerName).error) {
	console.log(`  SKIP: no reachable golden (${goldenContainerName}); this live test proved nothing`);
	process.exit(0);
}
const goldenHandle = createGoldenGraphHandle({ goldenContainerName, queryTimeoutMs: 60000, retryDelayMsList: GOLDEN_RETRY_DELAY_MS_LIST, resolveConnectionFresh: (containerName, callback) => callback('', resolveContainerConnection(containerName)), neo4jGen: neo4jInstanceFactory({ unused: true }) });
const forgeAdapter = openForgeAdapter({ configValues: EDC_CONFIG_VALUES });
if (forgeAdapter.refusalText) {
	console.log(`  FAIL: the forge adapter would not open: ${forgeAdapter.refusalText}`);
	process.exit(1);
}

// the access points as access-points-dot-d builds them, into one library
const accessPointLibraryFor = (serverPath) => {
	const accessPointByName = {};
	const dotD = { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } };
	const dataMapping = {
		'standards-neighbourhood': require(path.join(serverPath, 'data-model/data-mapping/mappers/standards-neighbourhood.js'))({}),
		'forged-use-cases': require(path.join(serverPath, 'data-model/data-mapping/mappers/forged-use-cases.js'))({}),
	};
	const passThroughParameters = { neo4jDb: goldenHandle, dataMapping, sqlDb: { getTable: (tableName, callback) => callback('explorerLiveHarness: no usage table in a live test') }, accessPointsDotD: accessPointByName };
	['standards-query', 'standards-neighbourhood', 'forged-use-cases', 'edc-resolver'].forEach((fileName) => require(path.join(serverPath, 'data-model/access-points-dot-d/accessPoints.d', `${fileName}.js`))({ dotD, passThroughParameters }));
	return accessPointByName;
};
// SUBJECT_SERVER_PATH runs these gates on another tree (eg the branch base, to watch them fail there)
const branchLibrary = accessPointLibraryFor(process.env.SUBJECT_SERVER_PATH || path.join(__dirname, '..', '..'));
const baselineLibrary = process.env.BASELINE_SERVER_PATH ? accessPointLibraryFor(process.env.BASELINE_SERVER_PATH) : null;


// ⟪explorerTidy⟫ the local resolver asked a URI's own path, as the /edc/ route hands it, in a format ('json' or 'html'): { httpStatus, bodyText }, or { httpStatus: 0, errorText }
const resolveUriText = ({ uriText, answerFormat }, callback) => {
	if (!uriText.startsWith(forgeAdapter.baseIri)) {
		callback({ httpStatus: 0, errorText: `not under the EDUcore base ${forgeAdapter.baseIri}` });
		return;
	}
	branchLibrary['edc-resolver']({ edcRequestPath: `/${uriText.slice(forgeAdapter.baseIri.length)}`, answerFormat, whenClientGone: () => {} }, (resolveError, resolverAnswer) => {
		if (resolveError) { callback({ httpStatus: 0, errorText: resolveError }); return; }
		if (!resolverAnswer.deliverTo) {
			callback({ httpStatus: resolverAnswer.httpStatus, bodyText: resolverAnswer.bodyText || '' });
			return;
		}
		// an element with many siblings is answered by the resolver's child, streamed as the /edc/ route streams it
		const chunkList = [];
		const responseSink = new Writable({ write: (chunk, encoding, written) => { chunkList.push(chunk); written(); } });
		responseSink.on('finish', () => callback({ httpStatus: resolverAnswer.httpStatus, bodyText: Buffer.concat(chunkList).toString('utf8') }));
		resolverAnswer.deliverTo(responseSink);
	});
};

// the local resolver's JSON answer for a URI: { httpStatus, body }
const resolveUri = (uriText, callback) =>
	resolveUriText({ uriText, answerFormat: 'json' }, (resolved) => {
		if (resolved.errorText !== undefined) { callback({ httpStatus: 0, body: { error: resolved.errorText } }); return; }
		callback({ httpStatus: resolved.httpStatus, body: resolved.bodyText ? JSON.parse(resolved.bodyText) : {} });
	});


const GATE_WAIT_MILLISECONDS = 250;
const GATE_WAIT_LIMIT = 480;

module.exports = { goldenHandle, forgeAdapter, branchLibrary, baselineLibrary, resolveUri, resolveUriText, GATE_WAIT_MILLISECONDS, GATE_WAIT_LIMIT, URI_MINTER_ACCESS_POINT_NAME };
