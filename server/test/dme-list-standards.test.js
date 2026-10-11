'use strict';
// dme-list-standards.test.js — WEL (2026-10-07): the Data Model Explorer welcome screen lists the standards the graph
// holds, read live through the dme-list-standards access point, which runs askMilo's own dme_list_standards verb
// in-process (no second implementation).
//   1. LIVE: the access point's totals equal this test's OWN Cypher on the golden graph (read-only handle): standard
//      count, family count and each family's release count, the hub, Σ nodeCount, Σ hubMatchEdgeCount;
//   2. the access point is the CLI verb: its standards list is identical to `dataModelExplorerSearch -listStandards`;
//   3. the endpoint is logged-in only (never 'public') and answers 503 with the refusal text when the graph does not;
//   4. RED TWINS (in-memory doubles): an unreachable graph is refused by name (graphUnreachable) with no list; a
//      refusedByName answer is refused (listStandardsRefused); an inventory missing one standard, or with a wrong
//      edge count, turns conjunct 1 red.
//
// Reads the golden graph read-only. Run: /usr/local/bin/node server/test/dme-list-standards.test.js

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const { readGoldenContainerName } = require('./lib/goldenContainerName');
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
const ACCESS_POINT_PATH = path.join(CODE_ROOT_PATH, 'server/data-model/access-points-dot-d/accessPoints.d/dme-list-standards.js');
const ENDPOINT_PATH = path.join(CODE_ROOT_PATH, 'server/endpoints-dot-d/qtDotLib.d/dme-list-standards.js');
const DME_SEARCH_PATH = path.join(CODE_ROOT_PATH, 'cli/lib.d/data-model-explorer/dataModelExplorerSearch.js');

// loads the access point fresh; a twin hands it a double for the DME search module through the require cache
const loadAccessPoint = (dmeSearchDouble) => {
	delete require.cache[require.resolve(ACCESS_POINT_PATH)];
	const resolvedSearchPath = require.resolve(DME_SEARCH_PATH);
	const realSearchCacheEntry = require.cache[resolvedSearchPath];
	if (dmeSearchDouble) {
		require.cache[resolvedSearchPath] = { id: resolvedSearchPath, filename: resolvedSearchPath, loaded: true, exports: { search: dmeSearchDouble } };
	}
	const accessPointByName = {};
	require(ACCESS_POINT_PATH)({ dotD: { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } }, passThroughParameters: {} });
	if (dmeSearchDouble) {
		if (realSearchCacheEntry) require.cache[resolvedSearchPath] = realSearchCacheEntry; else delete require.cache[resolvedSearchPath];
	}
	return accessPointByName['dme-list-standards'];
};

// conjunct 1 as a pure function, so a twin can prove it goes red: answers the list of disagreements
const inventoryDisagreementList = (standardInventory, expected) => {
	const standardList = standardInventory.standards || [];
	const totals = standardInventory.totals || {};
	const sumOf = (fieldName) => standardList.reduce((runningTotal, oneStandard) => runningTotal + oneStandard[fieldName], 0);
	const disagreementList = [];
	if (standardList.length !== expected.standardCount || totals.standardCount !== expected.standardCount) disagreementList.push(`standards ${standardList.length} / totals.standardCount ${totals.standardCount} vs Cypher ${expected.standardCount}`);
	if ((totals.familyList || []).length !== expected.familyCountList.length) disagreementList.push(`families ${(totals.familyList || []).length} vs Cypher ${expected.familyCountList.length}`);
	expected.familyCountList.forEach((oneFamily) => {
		const listedFamily = (totals.familyList || []).find((candidateFamily) => candidateFamily.family === oneFamily.family) || {};
		if (listedFamily.releaseCount !== oneFamily.releaseCount) disagreementList.push(`family ${oneFamily.family} releaseCount ${listedFamily.releaseCount} vs Cypher ${oneFamily.releaseCount}`);
	});
	if (totals.hubSource !== expected.hubSource || standardList.filter((oneStandard) => oneStandard.isHub).map((oneStandard) => oneStandard.source).join() !== expected.hubSource) disagreementList.push(`hub ${totals.hubSource} vs Cypher ${expected.hubSource}`);
	if (sumOf('nodeCount') !== expected.forgedNodeCount) disagreementList.push(`Σ nodeCount ${sumOf('nodeCount')} vs Cypher ${expected.forgedNodeCount}`);
	if (sumOf('hubMatchEdgeCount') !== expected.hubMatchEdgeCount) disagreementList.push(`Σ hubMatchEdgeCount ${sumOf('hubMatchEdgeCount')} vs Cypher ${expected.hubMatchEdgeCount}`);
	return disagreementList;
};

const EXPECTED_CYPHER_BY_NAME = Object.freeze({
	standardCount: 'MATCH (r:DmeStandardRoot) RETURN count(r) AS standardCount',
	familyCountList: 'MATCH (d:StandardDefinition) WHERE d.standardFamily IS NOT NULL RETURN d.standardFamily AS family, count(d) AS releaseCount',
	hubSource: 'MATCH (h:HubDefinition) RETURN h._source AS hubSource',
	forgedNodeCount: 'MATCH (r:DmeStandardRoot) MATCH (n:ForgedNode {_source: r._source}) RETURN count(n) AS forgedNodeCount',
	hubMatchEdgeCount: 'MATCH (r:DmeStandardRoot) MATCH (:ForgedNode {_source: r._source})-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference) RETURN count(m) AS hubMatchEdgeCount',
});

const runExpectedQueries = (goldenDb, callback) => {
	const expected = {};
	const nameList = Object.keys(EXPECTED_CYPHER_BY_NAME);
	const runNext = (nameIndex) => {
		if (nameIndex === nameList.length) { callback('', expected); return; }
		const expectedName = nameList[nameIndex];
		goldenDb.runQuery(EXPECTED_CYPHER_BY_NAME[expectedName], {}, (queryError, rowList) => {
			if (queryError) { callback(`${expectedName}: ${queryError}`); return; }
			expected[expectedName] = expectedName === 'familyCountList' ? rowList : rowList[0][expectedName];
			runNext(nameIndex + 1);
		});
	};
	runNext(0);
};

console.log('\n=== WEL dme-list-standards: the welcome screen\'s standards list is the graph\'s ===\n');

// ---- 3. the endpoint, read as text
const endpointText = fs.readFileSync(ENDPOINT_PATH, 'utf8');
ok('endpoint: logged-in roles only (getValidator names user/client/admin, never public)', /getValidator\(\['user', 'client', 'admin'\]\)/.test(endpointText) && !/getValidator\(\[[^\]]*'public'/.test(endpointText));
ok('endpoint: an access-point refusal after permission is answered 503 with its text', /permissionPassed \? 503 : 401/.test(endpointText));

// ---- 4. red twins that need no graph
loadAccessPoint((queryType, params, callback) => callback('Query failed: Could not perform discovery. No routing servers available.'))({}, (refusalText, standardInventory) => {
	ok('red twin: an unreachable graph is refused by name (graphUnreachable), no list', /dme-list-standards: graphUnreachable: /.test(refusalText) && standardInventory === undefined, refusalText);
});
loadAccessPoint((queryType, params, callback) => callback('', { refusedByName: 'listStandards', refusalName: 'unknownFlag', reason: 'twin reason' }))({}, (refusalText) => {
	ok('red twin: a refusedByName answer is refused (listStandardsRefused), not shown as a list', /listStandardsRefused: twin reason/.test(refusalText || ''), refusalText);
});

// ---- 1, 2. live
const goldenConnection = resolveContainerConnection(readGoldenContainerName());
if (goldenConnection.error) {
	console.log(`  FAIL: golden connection: ${goldenConnection.error}`);
	process.exit(1);
}
neo4jGen.initDatabaseInstance({ neo4jBoltUri: goldenConnection.boltUri, neo4jUser: goldenConnection.user, neo4jPassword: goldenConnection.password, readOnly: true, queryTimeoutMs: 30000 }, (connectError, goldenDb) => {
	if (connectError) {
		console.log(`  FAIL: golden connect: ${connectError}`);
		process.exit(1);
	}
	runExpectedQueries(goldenDb, (expectedError, expected) => {
		if (expectedError) {
			console.log(`  FAIL: expected Cypher: ${expectedError}`);
			goldenDb.close();
			process.exit(1);
		}
		loadAccessPoint()({}, (accessPointError, standardInventory) => {
			ok('live: the access point answers an inventory', !accessPointError && standardInventory && Array.isArray(standardInventory.standards), accessPointError);
			const disagreementList = inventoryDisagreementList(standardInventory || {}, expected);
			ok(`live: totals equal this test's Cypher (${expected.standardCount} standards, ${expected.familyCountList.length} families, hub ${expected.hubSource}, Σ nodeCount ${expected.forgedNodeCount}, Σ hubMatchEdgeCount ${expected.hubMatchEdgeCount})`, disagreementList.length === 0, disagreementList.join('; '));

			const oneStandardDropped = { ...standardInventory, standards: standardInventory.standards.slice(1) };
			ok('red twin: an inventory missing one standard turns the Cypher conjunct red', inventoryDisagreementList(oneStandardDropped, expected).length > 0);
			const edgeCountWrong = { ...standardInventory, standards: standardInventory.standards.map((oneStandard, standardIndex) => (standardIndex === 1 ? { ...oneStandard, hubMatchEdgeCount: oneStandard.hubMatchEdgeCount + 1 } : oneStandard)) };
			ok('red twin: one wrong hubMatchEdgeCount turns the Cypher conjunct red', inventoryDisagreementList(edgeCountWrong, expected).length > 0);

			execFile(process.execPath, [DME_SEARCH_PATH, '-listStandards'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (execError, stdoutText) => {
				let cliInventory = {};
				try { cliInventory = JSON.parse(stdoutText); } catch (parseError) { cliInventory = {}; }
				ok('live: the access point\'s standards are exactly askMilo\'s dme_list_standards (CLI -listStandards)', !execError && JSON.stringify(cliInventory.standards) === JSON.stringify(standardInventory.standards), execError ? execError.message : '');
				goldenDb.close();
				console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
				process.exit(failed > 0 ? 1 : 0);
			});
		});
	});
});
