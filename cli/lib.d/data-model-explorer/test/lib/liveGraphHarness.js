'use strict';

// liveGraphHarness.js — the ONE place the campaign-P1 live DME gates (2026-10-06) open the graph and run the CLI.
// Every live gate asserts a verb's answer against the test's OWN Cypher, so each needs: a READ session on the graph
// dataModelExplorerSearch.ini points at, a callback-style query runner, the CLI run as askMilo runs it (stdout JSON),
// and one pass/fail tally. Until P1 each test file carried its own copy of this connection boilerplate.
//
//   const harness = require('./lib/liveGraphHarness')({ gateTitle: '...' });
//   harness.runQuery(cypherText, params, (err, plainRowList) => ...);   // rows as plain objects, Integers as numbers
//   harness.runVerb(['-findMappings', 'P000033'], (err, { status, parsedStdout, stderrText }) => ...);
//   harness.finish(pipeError);   // closes the session and exits 0 / 1

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const dmeDirPath = path.join(__dirname, '..', '..');
const codeRootPath = path.join(dmeDirPath, '..', '..', '..');
const neo4j = require(path.join(dmeDirPath, 'node_modules', 'neo4j-driver'));
const configFileProcessor = require(path.join(dmeDirPath, 'node_modules', 'qtools-config-file-processor'));
const { resolveContainerConnection } = require(path.join(codeRootPath, 'server/data-model/lib/user-graph/container-connection-resolver'));
const asynchronousPipePlus = new (require(path.join(dmeDirPath, '..', '..', 'node_modules', 'qtools-asynchronous-pipe-plus')))();

const toPlainValue = (cypherValue) => {
	if (cypherValue === null || cypherValue === undefined) return cypherValue;
	if (neo4j.isInt(cypherValue)) return cypherValue.toNumber();
	if (Array.isArray(cypherValue)) return cypherValue.map(toPlainValue);
	if (typeof cypherValue === 'object') {
		const propertySource = cypherValue.properties && cypherValue.labels ? cypherValue.properties : cypherValue;
		const plainObject = {};
		Object.keys(propertySource).forEach((propertyName) => {
			if (propertyName === 'embedding') return;
			plainObject[propertyName] = toPlainValue(propertySource[propertyName]);
		});
		return plainObject;
	}
	return cypherValue;
};

const createLiveGraphHarness = ({ gateTitle }) => {
	const hostName = os.hostname();
	const configName = hostName === 'qMini.local' || hostName === 'qbook.local' ? 'instanceSpecific/qbook' : '';
	const dmeConfig = configFileProcessor.getConfig('dataModelExplorerSearch.ini', path.join(codeRootPath, '..', 'configs', configName) + '/').dataModelExplorerSearch;
	const connection = resolveContainerConnection(dmeConfig.goldenContainerName);
	if (connection.error) {
		console.error(`liveGraphHarness: ${connection.error}`);
		process.exit(2);
	}
	const driver = neo4j.driver(connection.boltUri, neo4j.auth.basic(connection.user, connection.password));
	const session = driver.session({ defaultAccessMode: neo4j.session.READ });

	let passed = 0;
	let failed = 0;
	const assert = (testName, condition, detailText) => {
		if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
		failed++;
		console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
	};

	// runQuery — rows as plain objects; the raw records too, for a test that needs elementIds or node objects
	const runQuery = (cypherText, queryParams, callback) => {
		session.run(cypherText, queryParams).then(
			(result) => callback('', result.records.map((oneRecord) => {
				const plainRow = {};
				oneRecord.keys.forEach((columnName) => { plainRow[columnName] = toPlainValue(oneRecord.get(columnName)); });
				return plainRow;
			}), result.records),
			(queryError) => callback(`query failed: ${queryError.message}`),
		);
	};

	// runVerb — the CLI exactly as toolHandler.js spawns it; dmeSearchFilePath lets a twin run a mutated copy
	const runVerb = (argumentList, callback, dmeSearchFilePath) => {
		const cliFilePath = dmeSearchFilePath || path.join(dmeDirPath, 'dataModelExplorerSearch.js');
		execFile(process.execPath, [cliFilePath, ...argumentList], { encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 }, (execError, stdoutText, stderrText) => {
			let parsedStdout = null;
			try { parsedStdout = JSON.parse(stdoutText); } catch (parseError) { parsedStdout = null; }
			callback('', { status: execError ? (execError.code || 1) : 0, parsedStdout, stderrText: stderrText || '' });
		});
	};

	const finish = (pipeError) => {
		if (pipeError) { failed++; console.log(`  FAIL: ${pipeError}`); }
		session.close().then(() => driver.close()).then(() => {
			console.log(`\n=== ${gateTitle} — Results: ${passed} passed, ${failed} failed ===\n`);
			process.exit(failed > 0 ? 1 : 0);
		});
	};

	console.log(`\n=== ${gateTitle} ===\n`);
	return Object.freeze({ assert, runQuery, runVerb, finish, neo4j, dmeDirPath, codeRootPath, toPlainValue, ...asynchronousPipePlus, readText: (filePath) => fs.readFileSync(filePath, 'utf8') });
};

module.exports = createLiveGraphHarness;
