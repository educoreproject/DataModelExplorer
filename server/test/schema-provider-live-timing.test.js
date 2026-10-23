#!/usr/bin/env node
'use strict';

// schema-provider-live-timing.test.js — ⟪lane zbE, E2-4⟫ getSchema must answer on the golden graph WITHIN the timeout the
// server's golden handle actually carries. It did not: CALL db.schema.nodeTypeProperties() took 45-71 s on
// GOLD_EVAL_261021_ctdlHub (268k nodes) against the handle's 30 s, so the MCP getSchema tool failed live (measured
// 2026-10-22). The P-d question set never saw it, because it opens its own handle at 120 s. LIVE, READ session, the graph
// the DEV pointer names (GOLDEN_CONTAINER overrides).
//   1. schema-provider renders on a handle carrying the server's configured timeout (startApiServer.ini
//      [dataModelExplorerSearch] queryTimeoutMs, REQUIRED as in data-model.js: absent is refused by name);
//   2. the keys() scan it now uses gives the SAME label -> property-name sets as db.schema.nodeTypeProperties() (read on a
//      long handle), so the one change in the text is alphabetical order within a label line;
//   3. RED TWIN: a schema-provider copy still calling db.schema.nodeTypeProperties() FAILS on the configured handle (if it
//      ever stops failing, the twin is blind and says so: the gate would then no longer prove it can see the defect).
//
//   /usr/local/bin/node server/test/schema-provider-live-timing.test.js      (about two minutes)

const fs = require('fs');
const path = require('path');
process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {} } };
const configFileProcessor = require('qtools-config-file-processor');
const schemaProviderFilePath = path.join(__dirname, '..', 'lib', 'schema-provider.js');
const schemaProvider = require(schemaProviderFilePath);
const { LABEL_PROPERTY_NAME_LIST_CYPHER } = schemaProvider;
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const { readGoldenContainerName, serverConfigDirPath } = require('./lib/goldenContainerName');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });

const LONG_HANDLE_TIMEOUT_MS = 300000;
const NODE_TYPE_PROPERTIES_CYPHER = 'CALL db.schema.nodeTypeProperties() YIELD nodeLabels, propertyName UNWIND nodeLabels AS label RETURN label, collect(DISTINCT propertyName) AS properties ORDER BY label';

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};
const finish = (handleList) => {
	handleList.forEach((oneHandle) => oneHandle && oneHandle.close && oneHandle.close());
	console.log(`\n=== schema-provider live timing — Results: ${passed} passed, ${failed} failed ===`);
	process.exit(failed > 0 ? 1 : 0);
};

// the server's golden-handle timeout: startApiServer.ini [dataModelExplorerSearch] queryTimeoutMs. data-model.js refuses
// to connect without it, so this test refuses too rather than assuming a value.
const configuredHandleTimeoutMs = () => {
	const serverConfig = configFileProcessor.getConfig('startApiServer.ini', serverConfigDirPath()) || {};
	const queryTimeoutMs = parseInt((serverConfig.dataModelExplorerSearch || {}).queryTimeoutMs, 10);
	if (!(queryTimeoutMs > 0)) {
		throw new Error(`schema-provider-live-timing: ${serverConfigDirPath()}startApiServer.ini declares no positive [dataModelExplorerSearch] queryTimeoutMs`);
	}
	return queryTimeoutMs;
};

const propertySetTextByLabelOf = (recordList) => {
	const setTextByLabel = {};
	recordList.forEach((oneRecord) => { setTextByLabel[oneRecord.label] = oneRecord.properties.filter((propertyName) => propertyName !== null).sort().join(','); });
	return setTextByLabel;
};

const openHandle = (connection, queryTimeoutMs, callback) => neo4jGen.initDatabaseInstance({ neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password, readOnly: true, queryTimeoutMs }, callback);

console.log('\n=== schema-provider: getSchema answers within the golden handle\'s own timeout ===\n');
const containerName = readGoldenContainerName();
const connection = resolveContainerConnection(containerName);
if (connection.error) { console.log(`  FAIL: golden connection: ${connection.error}`); process.exit(1); }
const handleTimeoutMs = configuredHandleTimeoutMs();

openHandle(connection, handleTimeoutMs, (configuredError, configuredDb) => {
	if (configuredError) { console.log(`  FAIL: open configured handle: ${configuredError}`); process.exit(1); }
	const startedAtMs = Date.now();
	schemaProvider({ neo4jDb: configuredDb })((schemaError, schemaText) => {
		const elapsedMs = Date.now() - startedAtMs;
		ok(`1. getSchema renders on ${containerName} within the configured ${handleTimeoutMs} ms handle (${elapsedMs} ms)`, !schemaError && typeof schemaText === 'string' && schemaText.length > 0, String(schemaError || ''));

		openHandle(connection, LONG_HANDLE_TIMEOUT_MS, (longError, longDb) => {
			if (longError) { console.log(`  FAIL: open long handle: ${longError}`); finish([configuredDb]); return; }
			longDb.runQuery(LABEL_PROPERTY_NAME_LIST_CYPHER, {}, (scanError, scanRecordList) => {
				longDb.runQuery(NODE_TYPE_PROPERTIES_CYPHER, {}, (typeError, typeRecordList) => {
					const scanSetTextByLabel = propertySetTextByLabelOf(scanRecordList || []);
					const typeSetTextByLabel = propertySetTextByLabelOf(typeRecordList || []);
					const labelList = Object.keys(typeSetTextByLabel);
					const differingLabelList = labelList.filter((labelName) => scanSetTextByLabel[labelName] !== typeSetTextByLabel[labelName]);
					ok(`2. the keys() scan gives nodeTypeProperties' label -> property sets on all ${labelList.length} labels`, !scanError && !typeError && labelList.length > 0 && Object.keys(scanSetTextByLabel).length === labelList.length && differingLabelList.length === 0, String(scanError || typeError || '') + differingLabelList.slice(0, 5).join(', '));

					// 3. red twin: the provider as it was, calling nodeTypeProperties, on the configured handle
					const twinFilePath = path.join(path.dirname(schemaProviderFilePath), `schema-provider-twin-${process.pid}.js`);
					const providerSourceText = fs.readFileSync(schemaProviderFilePath, 'utf8');
					const twinSourceText = providerSourceText.replace(/const LABEL_PROPERTY_NAME_LIST_CYPHER = `[^`]*`;/, `const LABEL_PROPERTY_NAME_LIST_CYPHER = '${NODE_TYPE_PROPERTIES_CYPHER}';`);
					if (twinSourceText === providerSourceText) {
						ok('3. RED TWIN: the label query is found in the source to swap', false, 'not found; the twin is blind');
						finish([configuredDb, longDb]);
						return;
					}
					fs.writeFileSync(twinFilePath, twinSourceText);
					const twinProvider = require(twinFilePath);
					fs.unlinkSync(twinFilePath);
					twinProvider({ neo4jDb: configuredDb })((twinError) => {
						ok(`3. RED TWIN: the nodeTypeProperties provider fails on the configured ${handleTimeoutMs} ms handle`, !!twinError, 'it rendered: the old query now fits the timeout, so this twin is blind');
						finish([configuredDb, longDb]);
					});
				});
			});
		});
	});
});
