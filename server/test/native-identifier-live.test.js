#!/usr/bin/env node
'use strict';

// native-identifier-live.test.js — ⟪lane zbE, E1-1 and E1-2⟫ LIVE gate on a graph built after educoreForge lane A2: the DME reads
// each standard's own identifier, and the guide layer's own description, from the graph (BRONZE_CROWN rulings 2026-10-23).
//   1. dme-spec-elements, per standard, through its real route handler over the real dme-cypher-query access point: every
//      row's sourceId = the node's OWN standard's declared native identifier where the node carries it, else stableId; and
//      every row carries stableId as its own field. Checked against this test's own Cypher, node by node.
//   0. dme-field-search and dme-semantic-search answer (their numeric LIMIT once failed live as a float) with stableId on rows
//   2. findMappings finds an element by its standard's native identifier (an Ed-Fi metaEdId; additive lookup).
//   3. dme_structure's answer carries the guide root's layerUsageTips, byte-identical to what the root holds.
// Read-only. The graph is the one the DEV pointer names (GOLDEN_CONTAINER overrides); on a graph built before A2 every
// check is refused by name (nativeIdentifierUnstamped / layerUsageTipsAbsent), which this test reports as a failure.
//
//   GOLDEN_CONTAINER=DEV_zeroBacklog /usr/local/bin/node server/test/native-identifier-live.test.js

const path = require('path');
process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};
const codeRootPath = path.join(__dirname, '..', '..');
const dmeDirPath = path.join(codeRootPath, 'cli', 'lib.d', 'data-model-explorer');
const neo4j = require(path.join(dmeDirPath, 'node_modules', 'neo4j-driver'));
const { readGoldenContainerName } = require('./lib/goldenContainerName');
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });
const { withNeo4jSession, QUERY_HANDLER_BY_QUERY_TYPE } = require(path.join(dmeDirPath, 'dataModelExplorerSearch'));

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const containerName = readGoldenContainerName();
const connection = resolveContainerConnection(containerName);
if (connection.error) { console.log(`  FAIL: connection: ${connection.error}`); process.exit(1); }
const cliConfig = { neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password };

// the access point the endpoints call, over this test's own read-only handle (as multiHubQuestionSet.js does)
const accessPointFrom = (accessPointFilePath, passThroughParameters) => {
	const library = {};
	require(accessPointFilePath)({ dotD: { library: { add: (accessPointName, serviceFunction) => { library[accessPointName] = serviceFunction; } }, logList: [] }, passThroughParameters });
	return library;
};
const getEndpoint = ({ endpointFileName, query, serverDb }, callback) => {
	const cypherAccessPoint = accessPointFrom(path.join(codeRootPath, 'server/data-model/access-points-dot-d/accessPoints.d/dme-cypher-query.js'), { neo4jDb: serverDb });
	const accessTokenHeaderTools = require(path.join(codeRootPath, 'server/lib/access-token-header-tools.js'))({ expressApp: {} });
	let routeHandler;
	require(path.join(codeRootPath, 'server/endpoints-dot-d/qtDotLib.d', endpointFileName))({
		dotD: { logList: [] },
		passThroughParameters: { expressApp: { get: (routePath, handler) => { routeHandler = handler; } }, accessTokenHeaderTools, accessPointsDotD: cypherAccessPoint, routingPrefix: '/api/' },
	});
	const answer = { statusCode: 200 };
	const xRes = { status: (statusCode) => { answer.statusCode = statusCode; return xRes; }, send: (body) => { answer.body = body; callback(answer); }, setHeader: () => {} };
	routeHandler({ appValueGetter: () => ({}), qtGetSurePath: () => query }, xRes, () => {});
};
const runVerb = (verbName, params, callback) => withNeo4jSession(cliConfig, { accessMode: neo4j.session.READ }, (session, sessionCallback) => QUERY_HANDLER_BY_QUERY_TYPE[verbName](session, params, cliConfig, sessionCallback), callback);

const SPEC_ELEMENT_STANDARD_LIST = ['EdFi', 'CEDS', 'CTDL', 'PESC-CollegeTranscript-1.8.0'];

console.log(`\n=== E1: each standard's own identifier and the layer's own description, read from ${containerName} ===\n`);
neo4jGen.initDatabaseInstance({ ...cliConfig, readOnly: true, queryTimeoutMs: 120000 }, (connectError, serverDb) => {
	if (connectError) { console.log(`  FAIL: connect: ${connectError}`); process.exit(1); }
	const finish = () => { serverDb.close(); console.log(`\n=== native-identifier-live — Results: ${passed} passed, ${failed} failed ===`); process.exit(failed > 0 ? 1 : 0); };
	serverDb.runQuery('MATCH (d:StandardDefinition) RETURN d.sourceKey AS sourceKey, d.nativeIdentifierPropertyName AS nativeIdentifierPropertyName', {}, (declarationError, declarationRowList) => {
		if (declarationError) { ok('read the declarations', false, String(declarationError)); finish(); return; }
		const declaredNameBySource = {};
		declarationRowList.forEach((oneRow) => { declaredNameBySource[oneRow.sourceKey] = oneRow.nativeIdentifierPropertyName; });
		const checkStandard = (standardIndex) => {
			if (standardIndex >= SPEC_ELEMENT_STANDARD_LIST.length) { checkSearchEndpoints(); return; }
			const standardSource = SPEC_ELEMENT_STANDARD_LIST[standardIndex];
			getEndpoint({ endpointFileName: 'dme-spec-elements.js', query: { source: standardSource, limit: '1000' }, serverDb }, (answer) => {
				const rowList = Array.isArray(answer.body) ? answer.body.filter((oneRow) => oneRow && oneRow.name !== undefined) : [];
				const stableIdList = rowList.map((oneRow) => oneRow.stableId);
				const declaredName = declaredNameBySource[standardSource];
				serverDb.runQuery('MATCH (n:ForgedNode) WHERE n.stableId IN $stableIdList RETURN n.stableId AS stableId, n[$declaredName] AS nativeIdentifier', { stableIdList: stableIdList.filter(Boolean), declaredName: declaredName || 'stableId' }, (truthError, truthRowList) => {
					const nativeIdentifierByStableId = {};
					(truthRowList || []).forEach((oneRow) => { nativeIdentifierByStableId[oneRow.stableId] = oneRow.nativeIdentifier; });
					const missingStableIdCount = rowList.filter((oneRow) => typeof oneRow.stableId !== 'string' || oneRow.stableId === '').length;
					const disagreeingRowList = rowList.filter((oneRow) => {
						const nativeIdentifier = nativeIdentifierByStableId[oneRow.stableId];
						const expectedSourceId = nativeIdentifier !== null && nativeIdentifier !== undefined && nativeIdentifier !== '' ? String(nativeIdentifier) : oneRow.stableId;
						return oneRow.sourceId !== expectedSourceId;
					});
					const nativeShownCount = rowList.filter((oneRow) => oneRow.stableId && oneRow.sourceId !== oneRow.stableId).length;
					ok(`1. ${standardSource} (declares ${declaredName || 'none'}): ${rowList.length} rows, each carries stableId, and sourceId = its own native identifier else stableId (${nativeShownCount} show the native one)`,
						answer.statusCode === 200 && !truthError && rowList.length > 0 && missingStableIdCount === 0 && disagreeingRowList.length === 0,
						answer.statusCode !== 200 ? `status ${answer.statusCode}: ${String(answer.body).slice(0, 200)}` : `${missingStableIdCount} without stableId; ${disagreeingRowList.length} disagree, e.g. ${JSON.stringify(disagreeingRowList[0] || {}).slice(0, 160)}`);
					checkStandard(standardIndex + 1);
				});
			});
		};
		// the two other sourceId endpoints the Specification Viewer calls with a numeric limit (LIMIT $limit arrived as a float and
		// was refused by Neo4j on the live DEV server, measured 2026-10-23): answered, and every row carries stableId
		const checkSearchEndpoints = () => {
			getEndpoint({ endpointFileName: 'dme-field-search.js', query: { q: 'birth date', limit: '5' }, serverDb }, (fieldAnswer) => {
				const fieldRowList = Array.isArray(fieldAnswer.body) ? fieldAnswer.body : [];
				ok(`0. dme-field-search answers (${fieldRowList.length} rows), each with stableId`, fieldAnswer.statusCode === 200 && fieldRowList.length > 0 && fieldRowList.every((oneRow) => typeof oneRow.stableId === 'string'), `status ${fieldAnswer.statusCode}: ${JSON.stringify(fieldAnswer.body).slice(0, 160)}`);
				getEndpoint({ endpointFileName: 'dme-semantic-search.js', query: { source: 'EdFi', name: 'BirthDate', limit: '5' }, serverDb }, (semanticAnswer) => {
					const semanticRowList = Array.isArray(semanticAnswer.body) ? semanticAnswer.body : [];
					ok(`0. dme-semantic-search answers (${semanticRowList.length} rows), each with stableId`, semanticAnswer.statusCode === 200 && semanticRowList.length > 0 && semanticRowList.every((oneRow) => typeof oneRow.stableId === 'string'), `status ${semanticAnswer.statusCode}: ${JSON.stringify(semanticAnswer.body).slice(0, 160)}`);
					checkLookup();
				});
			});
		};
		const checkLookup = () => {
			// an Ed-Fi property with a metaEdId AND a match edge, so it shows as a row: a name CONTAINS match on the same digits
			// (SIF option values named '01381') would otherwise make 'something matched' prove nothing
			serverDb.runQuery("MATCH (n:ForgedNode {_source: 'EdFi', role: 'DmeProperty'})-[:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference) WHERE n.metaEdId IS NOT NULL RETURN DISTINCT n.metaEdId AS metaEdId, n.stableId AS stableId ORDER BY n.stableId LIMIT 1", {}, (sampleError, sampleRowList) => {
				const sampleRow = (sampleRowList || [])[0];
				if (!sampleRow) { ok('2. an Ed-Fi property carrying metaEdId exists to look up', false, String(sampleError || 'none')); checkStructure(); return; }
				runVerb('findMappings', { name: String(sampleRow.metaEdId) }, (verbError, verbResult) => {
					const foundByIdentifier = verbResult && !verbResult.refusalName && (verbResult.mappingRowList || []).some((oneRow) => oneRow.fromStableId === sampleRow.stableId);
					ok(`2. findMappings finds Ed-Fi ${sampleRow.stableId} by its metaEdId '${sampleRow.metaEdId}'`, !verbError && foundByIdentifier, verbError || JSON.stringify(verbResult).slice(0, 200));
					checkStructure();
				});
			});
		};
		const checkStructure = () => {
			serverDb.runQuery("MATCH (root:StandardLayer {role: 'DmeLayerRoot', layerKey: 'guide'}) RETURN root.layerUsageTips AS layerUsageTips LIMIT 1", {}, (rootError, rootRowList) => {
				const rootUsageTips = ((rootRowList || [])[0] || {}).layerUsageTips;
				runVerb('structure', { mode: 'classConcepts', name: 'C200013' }, (verbError, verbResult) => {
					ok('3. dme_structure carries the guide root\'s layerUsageTips, byte-identical', !rootError && !verbError && typeof rootUsageTips === 'string' && verbResult && verbResult.layerUsageTips === rootUsageTips, verbError || JSON.stringify(verbResult).slice(0, 200));
					finish();
				});
			});
		};
		checkStandard(0);
	});
});
