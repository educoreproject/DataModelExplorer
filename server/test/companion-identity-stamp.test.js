'use strict';
// companion-identity-stamp.test.js — a companion page's compile is current by the golden's CONTENT identity, never its name
// (WORKORDER-downloadsByIdentity-110626 survey row S7; ROMANTIC_PARASOL 2026-11-06: "companion freshness stamps the same identity, keeps
// graphName for display only, and reads existing graphName-only stamps compatibly"). Through the companion harness (the real
// sqlite-instance, data-mapping, access points and endpoints), against the LIVE goldens on read-only handles:
//   1. a companionCompile table made BEFORE this change (no graphIdentitySha256 column) and holding a row opens: the one declared
//      added column is added, the old row keeps its stamps and reads the new column as null;
//   2. that old row is never answered as current (it cannot prove its graph's identity): the page recompiles, stamped with the
//      identity sha256(manifestRefId|graphContractSha256) and, for display, the passport's graphName;
//   3. the same graph under another name (GOLD_EVAL_261106_useCases, a zero-spend replay of GOLD_261030_useCases: same manifest,
//      same contract, another name and builtAt) answers THAT compile, current, with no recompile;
//   4. another build under the original's name (its passport's manifestRefId changed) is not current: the page recompiles, and the
//      stale stamp named is graphIdentitySha256;
//   5. a table holding rows that lacks a column NOT declared as added is still refused by name, never altered.
// RED BEFORE: against main 3b6a37b (graphName in the freshness stamps, no identity column) items 1 to 4 fail.
//
// Run: /usr/local/bin/node server/test/companion-identity-stamp.test.js   (sqlite3 is built for that node)

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const SERVER_PATH = path.join(__dirname, '..');
const PROJECT_SYSTEM_PATH = path.join(SERVER_PATH, '..', '..');
const SEED_MANIFEST = JSON.parse(fs.readFileSync(path.join(SERVER_PATH, 'data-model', 'lib', 'companion-pages', 'seed', 'jedx-dictionary.seed.json'), 'utf8'));
const SEED_SOURCE_DIR_PATH = path.join(PROJECT_SYSTEM_PATH, SEED_MANIFEST.sourceDirProjectRelativePath);
const PAGE_SLUG = SEED_MANIFEST.pageRecord.pageSlug;
const ORIGINAL_CONTAINER_NAME = 'GOLD_261030_useCases';
const REPLAY_CONTAINER_NAME = 'GOLD_EVAL_261106_useCases';
const ADDRESS_ONLY_CONTAINER_NAME = 'GOLD_containerNameIsOnlyTheAddress';
const OTHER_MANIFEST_REF_ID = '4303bbdb61aa061e7b909734864e884eb55fc5e0d5473475864b85372a6c1fd5';
// the companionCompile table as main 3b6a37b declared it (companion-compile.js createTable), before the identity column
const PRE_IDENTITY_TABLE_SQL = `CREATE TABLE companionCompile ([refId] TEXT PRIMARY KEY, [createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, [updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, [pageSlug] TEXT NOT NULL, [graphName] TEXT NOT NULL, [graphContractSha256] TEXT NOT NULL, [sourceSetSha256] TEXT NOT NULL, [compiledAt] TEXT NOT NULL, [compilerVersion] TEXT NOT NULL, [payloadJson] TEXT NOT NULL, [statusText] TEXT NOT NULL CHECK ([statusText] IN ('compiled')));`;
const OLD_ROW_REF_ID = 'preIdentityCompileRow0001';

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
const sha256Of = (contentText) => crypto.createHash('sha256').update(contentText, 'utf8').digest('hex');
const testIdentityOf = ({ manifestRefId, graphContractSha256 }) => sha256Of(`${manifestRefId}|${graphContractSha256}`);
const sqliteRun = (databaseFilePath, sqlText) => {
	const runResult = spawnSync('/usr/bin/sqlite3', [databaseFilePath, sqlText], { encoding: 'utf8' });
	if (runResult.status !== 0) abort(`sqlite3 ${sqlText.slice(0, 60)}`, runResult.stderr);
	return runResult.stdout;
};

process.global = { getConfig: () => ({}), xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {}, debug: () => {} }, rawConfig: {}, commandLineParameters: { switches: {}, values: {} } };
const { resolveContainerConnection } = require('../data-model/lib/user-graph/container-connection-resolver');
const neo4jGen = require('../data-model/lib/neo4j-instance/neo4j-instance')({ unused: true });
const { bootCompanionServer, httpPost, loginEveryRole } = require('./lib/companionServerHarness');

const connectReadOnly = (containerName, callback) => {
	const connection = resolveContainerConnection(containerName);
	if (connection.error) abort(`${containerName} connection`, connection.error);
	neo4jGen.initDatabaseInstance({ neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password, readOnly: true, queryTimeoutMs: 120000 }, (connectError, graphDb) => {
		if (connectError) abort(`${containerName} connect`, connectError);
		callback(graphDb);
	});
};
const passportOf = (graphDb, callback) => graphDb.runQuery('MATCH (p:GraphProvenance) RETURN p.graphName AS graphName, p.manifestRefId AS manifestRefId, p.graphContractSha256 AS graphContractSha256', {}, (queryError, rowList) => setImmediate(() => {
	if (queryError || rowList.length !== 1) abort('passport read', queryError || rowList.length);
	callback(rowList[0]);
}));

// the one handle the companion server is given: it reads whichever golden the test points it at, and can override the passport
const switchboard = { targetDb: null, passportOverride: null };
const switchboardDb = {
	runQuery: (cypherText, params, callback) => switchboard.targetDb.runQuery(cypherText, params, (queryError, rowList) => {
		if (queryError || !switchboard.passportOverride || !/GraphProvenance/.test(cypherText)) { callback(queryError, rowList); return; }
		callback('', rowList.map((oneRow) => ({ ...oneRow, ...switchboard.passportOverride })));
	}),
	close: () => {},
};

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'companionIdentityStamp-'));
const databaseFilePath = path.join(scratchDirPath, 'companion.sqlite3');

console.log('\n=== Companion freshness by the graph\'s content identity ===\n');

connectReadOnly(ORIGINAL_CONTAINER_NAME, (originalDb) => connectReadOnly(REPLAY_CONTAINER_NAME, (replayDb) => passportOf(originalDb, (originalPassport) => passportOf(replayDb, (replayPassport) => {
	// 1. a table from before this change, holding one compile of the page
	sqliteRun(databaseFilePath, `${PRE_IDENTITY_TABLE_SQL} INSERT INTO companionCompile (refId, pageSlug, graphName, graphContractSha256, sourceSetSha256, compiledAt, compilerVersion, payloadJson, statusText) VALUES ('${OLD_ROW_REF_ID}', '${PAGE_SLUG}', '${originalPassport.graphName}', '${originalPassport.graphContractSha256}', 'preIdentitySourceSet', '2026-11-01T00:00:00.000Z', 'preIdentityCompiler', '{}', 'compiled');`);
	switchboard.targetDb = originalDb;
	bootCompanionServer({ scratchDirPath, neo4jDb: switchboardDb, configBySectionName: { dataModelExplorerSearch: { goldenContainerName: ADDRESS_ONLY_CONTAINER_NAME } } }, (bootError, server) => {
		if (bootError) abort('companion boot', bootError);
		server.accessPointByName['companion-page-save']({ pageRecord: SEED_MANIFEST.pageRecord }, (saveError) => {
			if (saveError) abort('companion seed page', saveError);
			const uploadNext = (remainingSourceList) => {
				if (remainingSourceList.length) {
					const oneSource = remainingSourceList[0];
					server.accessPointByName['companion-source-upload']({
						uploadedBy: 'companion-identity-stamp.test', pageSlug: PAGE_SLUG, sourceRole: oneSource.sourceRole, sourcePart: oneSource.sourcePart,
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
					runChecks({ server, authtoken: tokenByRoleName.user, originalPassport, replayPassport, originalDb, replayDb });
				});
			};
			uploadNext(SEED_MANIFEST.sourceList);
		});
	});
}))));

const askCurrent = ({ server, authtoken }, callback) => httpPost({ baseUrl: server.baseUrl, routePath: '/api/companion-compile-current', requestBody: { pageSlug: PAGE_SLUG }, authtoken }, (postError, response) => {
	const pageAnswer = !postError && response.statusCode === 200 && Array.isArray(response.bodyJson) ? response.bodyJson[0] : null;
	callback(pageAnswer, postError || `${response.statusCode} ${response.bodyText.slice(0, 300)}`);
});

const runChecks = ({ server, authtoken, originalPassport, replayPassport, originalDb, replayDb }) => {
	const columnNameList = sqliteRun(databaseFilePath, 'SELECT name FROM pragma_table_info(\'companionCompile\');').trim().split('\n');
	const oldRowText = columnNameList.includes('graphIdentitySha256') ? sqliteRun(databaseFilePath, `SELECT graphName || '|' || ifnull(graphIdentitySha256, 'NULL') FROM companionCompile WHERE refId = '${OLD_ROW_REF_ID}';`).trim() : 'no graphIdentitySha256 column';
	check('1. a table from before the identity column opens, and the column is added', columnNameList.includes('graphIdentitySha256'), columnNameList.join(','));
	check('1. the old row keeps its stamps and reads the new column as null', oldRowText === `${originalPassport.graphName}|NULL`, oldRowText);
	askCurrent({ server, authtoken }, (firstAnswer, firstDetail) => {
		const firstRecord = firstAnswer ? firstAnswer.compileRecord : {};
		check('2. the old row is not answered: the page recompiles, current, stamped with the identity and (for display) the passport\'s graphName', firstAnswer && firstAnswer.isCurrent === true && firstRecord.refId !== OLD_ROW_REF_ID && firstRecord.graphIdentitySha256 === testIdentityOf(originalPassport) && firstRecord.graphName === originalPassport.graphName, firstAnswer ? JSON.stringify(firstRecord) : firstDetail);
		switchboard.targetDb = replayDb;
		askCurrent({ server, authtoken }, (replayAnswer, replayDetail) => {
			check(`3. the same graph under another name (${replayPassport.graphName}) answers that compile, current, with no recompile`, replayAnswer && replayAnswer.isCurrent === true && replayAnswer.compileRecord.refId === firstRecord.refId, replayAnswer ? JSON.stringify({ refId: replayAnswer.compileRecord.refId, isCurrent: replayAnswer.isCurrent, staleStampList: replayAnswer.staleStampList }) : replayDetail);
			switchboard.targetDb = originalDb;
			switchboard.passportOverride = { manifestRefId: OTHER_MANIFEST_REF_ID };
			askCurrent({ server, authtoken }, (impostorAnswer, impostorDetail) => {
				const impostorRecord = impostorAnswer ? impostorAnswer.compileRecord : {};
				check(`4. another build under the name '${originalPassport.graphName}' is not current: the page recompiles under its identity`, impostorAnswer && impostorAnswer.isCurrent === true && impostorRecord.refId !== firstRecord.refId && impostorRecord.graphIdentitySha256 === testIdentityOf({ ...originalPassport, manifestRefId: OTHER_MANIFEST_REF_ID }) && impostorRecord.graphName === originalPassport.graphName, impostorAnswer ? JSON.stringify(impostorRecord) : impostorDetail);
				switchboard.passportOverride = null;
				server.close();
				refusalCheck(() => {
					originalDb.close();
					replayDb.close();
					fs.rmSync(scratchDirPath, { recursive: true, force: true });
					console.log(`companion-identity-stamp: ${passedCount} passed, ${failedCount} failed`);
					process.exit(failedCount ? 1 : 0);
				});
			});
		});
	});
};

// 5. a table with rows lacking a column that is NOT declared as added is refused by name, and left as it was
const refusalCheck = (callback) => {
	const refusalDirPath = path.join(scratchDirPath, 'refusal');
	fs.mkdirSync(refusalDirPath);
	const refusalDatabasePath = path.join(refusalDirPath, 'companion.sqlite3');
	sqliteRun(refusalDatabasePath, `${PRE_IDENTITY_TABLE_SQL.replace('[compilerVersion] TEXT NOT NULL, ', '')} INSERT INTO companionCompile (refId, pageSlug, graphName, graphContractSha256, sourceSetSha256, compiledAt, payloadJson, statusText) VALUES ('noCompilerRow', '${PAGE_SLUG}', 'g', 'c', 's', '2026-11-01', '{}', 'compiled');`);
	const columnListBefore = sqliteRun(refusalDatabasePath, 'SELECT name FROM pragma_table_info(\'companionCompile\');');
	const passwordTools = require(path.join(SERVER_PATH, 'data-model', 'lib', 'password-hash'))();
	const dataMapping = require(path.join(SERVER_PATH, 'data-model', 'data-mapping', 'data-mapping'))(passwordTools);
	const sqlDbGen = require(path.join(SERVER_PATH, 'data-model', 'lib', 'sqlite-instance'))({});
	const { getCompanionTables } = require(path.join(SERVER_PATH, 'data-model', 'lib', 'companion-pages', 'companion-tables'));
	sqlDbGen.initDatabaseInstance(refusalDatabasePath, (dbError, sqlDb) => {
		if (dbError) abort('refusal db', dbError);
		getCompanionTables({ sqlDb, dataMapping }, (tablesError) => {
			const columnListAfter = sqliteRun(refusalDatabasePath, 'SELECT name FROM pragma_table_info(\'companionCompile\');');
			check('5. a table with rows lacking an undeclared column (compilerVersion) is refused by name and left unaltered', /lacks declared column\(s\) compilerVersion/.test(`${tablesError}`) && columnListAfter === columnListBefore, `${tablesError} | ${columnListAfter.trim().split('\n').join(',')}`);
			callback();
		});
	});
};
