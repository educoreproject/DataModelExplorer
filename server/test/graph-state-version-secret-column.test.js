'use strict';
// graph-state-version-secret-column.test.js — W-E-12 (X4 mechanics, ruling B VIOLET_VALLEY, campaign P0, 2026-10-06).
// graph_state_versions no longer stores a live clone's neo4j password (liveBoltPassword). The clone carries it as
// DME_CLONE_NEO4J_AUTH (a variable Neo4j ignores) and container-connection-resolver reads it from the clone's own name.
//   1. the startup migration DROPS the column from an existing table, keeps every other value, and is idempotent;
//   2. STRUCTURAL (declared as such): the mapper maps no liveBoltPassword and no server source reads one off a row;
//   3. liveCloneConnectionFor resolves a clone-shaped container's credential from DME_CLONE_NEO4J_AUTH, and refuses by
//      name ('reopen this graph') for a container carrying no credential (a clone opened before this change).
// Part 3 starts two tiny alpine containers (named DEV_P0_cloneAuthProbe_*, removed with rm -f -v by name).
//
// Run with the node the API server runs on (sqlite3 is an x86_64 build here): /usr/local/bin/node server/test/graph-state-version-secret-column.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

console.log('\n=== W-E-12: no clone password in graph_state_versions ===\n');

// ---- 2. structural
const serverRootPath = path.join(__dirname, '..');
const mapperText = fs.readFileSync(path.join(serverRootPath, 'data-model', 'data-mapping', 'mappers', 'graph-state-version.js'), 'utf8');
ok('STRUCTURAL: the graph-state-version mapper maps no liveBoltPassword', !/\['liveBoltPassword'\]\s*:/.test(mapperText));
const listJsFiles = (dirPath) => fs.readdirSync(dirPath, { withFileTypes: true }).reduce((soFar, oneEntry) => {
	const entryPath = path.join(dirPath, oneEntry.name);
	if (oneEntry.isDirectory()) { return oneEntry.name === 'node_modules' ? soFar : soFar.concat(listJsFiles(entryPath)); }
	return /\.js$/.test(oneEntry.name) ? soFar.concat([entryPath]) : soFar;
}, []);
const rowReaderList = listJsFiles(path.join(serverRootPath, 'data-model')).filter((oneFilePath) => /\b(?!inputData)\w+\.liveBoltPassword\b/.test(fs.readFileSync(oneFilePath, 'utf8').replace(/inputData\.liveBoltPassword/g, '')));
ok('STRUCTURAL: no server source reads liveBoltPassword off a row (setLive only refuses an offered one)', rowReaderList.length === 0, rowReaderList.map((oneFilePath) => path.relative(serverRootPath, oneFilePath)).join(', '));

const cloneManagerText = fs.readFileSync(path.join(serverRootPath, 'data-model', 'lib', 'user-graph', 'clone-manager.js'), 'utf8');
ok('STRUCTURAL: clone-manager launches every clone with DME_CLONE_NEO4J_AUTH=neo4j/<password> (the write side of ruling B; not exercised live here: provisioning a clone quiesces the golden)', /'-e', `\$\{CLONE_AUTH_ENV_NAME\}=neo4j\/\$\{password\}`/.test(cloneManagerText));

// ---- 1. the migration
const sqliteInstance = require('../data-model/lib/sqlite-instance/sqlite-instance')({ unused: true });
const migration = require('../lib/graph-state-version-schema-migration');
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphStateVersionSecretColumn-'));
const databaseFilePath = path.join(scratchDir, 'versions.sqlite3');

const probeContainerNameWith = 'DEV_P0_cloneAuthProbe_with';
const probeContainerNameWithout = 'DEV_P0_cloneAuthProbe_without';
const removeProbeContainers = () => [probeContainerNameWith, probeContainerNameWithout].forEach((oneName) => { try { execFileSync('docker', ['rm', '-f', '-v', oneName], { stdio: 'ignore' }); } catch (e) { /* absent */ } });

const finish = () => {
	removeProbeContainers();
	fs.rmSync(scratchDir, { recursive: true, force: true });
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed > 0 ? 1 : 0);
};

sqliteInstance.initDatabaseInstance(databaseFilePath, (initError, sqlDb) => {
	ok('a throwaway database opens', !initError, initError);
	sqlDb.getTable('graph_state_versions', (tableError, versionsTable) => {
		// a pre-W-E-12 row: the column exists because a writer once saved it
		versionsTable.saveObject({ refId: 'versionRefIdProbe', versionName: 'probeVersion', liveBoltPassword: 'OLD_SECRET_PROBE' }, { suppressStatementLog: true }, (saveError) => {
			ok('a pre-W-E-12 row with a liveBoltPassword column is set up', !saveError, saveError);
			migration({ sqlDb })((migrationError, migrationResult) => {
				ok('the migration runs', !migrationError, migrationError);
				ok('  and says it dropped the retired column', /dropped retired column\(s\) liveBoltPassword/.test(((migrationResult || {}).logInfoList || []).join(' ')), JSON.stringify(migrationResult));
				versionsTable.getData('PRAGMA table_info(<!tableName!>);', { suppressStatementLog: true }, (pragmaError, columnRows = []) => {
					const columnNameList = columnRows.map((oneRow) => oneRow.name);
					ok('the table has NO liveBoltPassword column afterwards', columnNameList.indexOf('liveBoltPassword') === -1, columnNameList.join(','));
					versionsTable.getData(`SELECT * FROM <!tableName!> WHERE refId = 'versionRefIdProbe';`, { suppressStatementLog: true }, (rowError, rowList = []) => {
						ok('  and the row keeps its other values', rowList[0] && rowList[0].versionName === 'probeVersion', JSON.stringify(rowList[0]));
						const fileBytesList = [databaseFilePath, `${databaseFilePath}-wal`].filter((oneFilePath) => fs.existsSync(oneFilePath)).map((oneFilePath) => fs.readFileSync(oneFilePath));
						ok('  and the secret\'s bytes are nowhere in the database file (DROP COLUMN rewrites the table)', fileBytesList.every((oneBuffer) => !oneBuffer.includes(Buffer.from('OLD_SECRET_PROBE'))));
						migration({ sqlDb })((secondError, secondResult) => {
							ok('a second run is a no-op (idempotent)', !secondError && /no retired column present/.test(((secondResult || {}).logInfoList || []).join(' ')), secondError || JSON.stringify(secondResult));

							// ---- 3. the clone credential travels with the clone
							removeProbeContainers();
							execFileSync('docker', ['run', '-d', '--name', probeContainerNameWith, '-p', '7896:7687', '-e', 'DME_CLONE_NEO4J_AUTH=neo4j/cloneProbePassword', 'alpine:latest', 'sleep', '120'], { stdio: 'ignore' });
							execFileSync('docker', ['run', '-d', '--name', probeContainerNameWithout, '-p', '7897:7687', 'alpine:latest', 'sleep', '120'], { stdio: 'ignore' });
							const { liveCloneConnectionFor } = require('../data-model/lib/user-graph/user-graph');
							const withCredential = liveCloneConnectionFor({ liveContainerName: probeContainerNameWith, liveBoltUri: 'bolt://localhost:7896' });
							ok('a clone-shaped container: the credential comes from its DME_CLONE_NEO4J_AUTH', withCredential.neo4jUser === 'neo4j' && withCredential.neo4jPassword === 'cloneProbePassword' && withCredential.neo4jBoltUri === 'bolt://localhost:7896', JSON.stringify({ ...withCredential, neo4jPassword: withCredential.neo4jPassword ? '(set)' : withCredential.neo4jPassword }));
							const withoutCredential = liveCloneConnectionFor({ liveContainerName: probeContainerNameWithout, liveBoltUri: 'bolt://localhost:7897' });
							ok('a container carrying no credential (a clone opened before W-E-12) is refused by name: reopen this graph', /reopen this graph/.test(withoutCredential.error || ''), withoutCredential.error);
							finish();
						});
					});
				});
			});
		});
	});
});
