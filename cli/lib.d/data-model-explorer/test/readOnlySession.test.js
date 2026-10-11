#!/usr/bin/env node
'use strict';

// readOnlySession.test.js — W-E-10 (X2, campaign P0, 2026-10-06): every DME verb opens a READ session, so Neo4j itself
// refuses a write that slips past any filter. A verb gets a WRITE session only by being named in
// WRITE_CAPABLE_QUERY_TYPE_LIST, which is empty: the DME CLI has no write verb.
//
// HERMETIC half: for every verb in QUERY_HANDLER_BY_QUERY_TYPE, sessionAccessModeFor(verb) is READ unless the verb is
// declared write-capable.
// LIVE half, NEVER against the golden graph: a SCRATCH Neo4j named by DME_SCRATCH_BOLT_URI and DME_SCRATCH_NEO4J_PASSWORD
// (evidence/P0/scratchNeo4j.sh). For every verb it opens the session search() would open, through the module's own
// withNeo4jSession, and runs a CREATE: Neo4j must answer Neo.ClientError.Statement.AccessMode, and no probe node may exist
// afterwards. Refuses to run when either variable is unset, and when the scratch URI is the golden container's.
//
//   DME_SCRATCH_BOLT_URI=bolt://localhost:7891 DME_SCRATCH_NEO4J_PASSWORD=... node test/readOnlySession.test.js

const os = require('os');
const path = require('path');
const dmeDirPath = path.join(__dirname, '..');
const neo4j = require(path.join(dmeDirPath, 'node_modules', 'neo4j-driver'));
const configFileProcessor = require(path.join(dmeDirPath, 'node_modules', 'qtools-config-file-processor'));
const codeRootPath = path.join(dmeDirPath, '..', '..', '..');
const { resolveContainerConnection } = require(path.join(codeRootPath, 'server/data-model/lib/user-graph/container-connection-resolver'));
const dmeModule = require(path.join(dmeDirPath, 'dataModelExplorerSearch'));

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};
const finish = () => {
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	process.exit(failed > 0 ? 1 : 0);
};

const verbNameList = Object.keys(dmeModule.QUERY_HANDLER_BY_QUERY_TYPE || {});
const writeCapableList = dmeModule.WRITE_CAPABLE_QUERY_TYPE_LIST || [];

console.log('\n=== W-E-10: every DME verb opens a READ session ===\n');
assert('the module declares its verbs', verbNameList.length >= 11, `${verbNameList.length} verbs`);
assert('WRITE_CAPABLE_QUERY_TYPE_LIST is declared and EMPTY (the DME CLI has no write verb)', Array.isArray(dmeModule.WRITE_CAPABLE_QUERY_TYPE_LIST) && writeCapableList.length === 0, JSON.stringify(dmeModule.WRITE_CAPABLE_QUERY_TYPE_LIST));
const writeModeVerbList = verbNameList.filter((oneVerb) => writeCapableList.indexOf(oneVerb) === -1 && dmeModule.sessionAccessModeFor(oneVerb) !== neo4j.session.READ);
assert('every verb not declared write-capable gets a READ session', writeModeVerbList.length === 0, `WRITE sessions for: ${writeModeVerbList.join(', ')}`);

// the generated per-standard tools reach the graph through qtools-graph-forge-core's graphSearchTool, whose rawCypher
// opens a write-capable session with no validator; until that package is fixed and republished, no provider offers a
// raw Cypher tool other than dme_raw_cypher, whose verb is READ (W-E-10 §4)
const fs = require('fs');
const rawCypherToolNameList = ['data-model-explorer', 'ceds-ontology14']
	.map((oneProviderDir) => path.join(dmeDirPath, '..', oneProviderDir, 'provider.json'))
	.filter((oneProviderPath) => fs.existsSync(oneProviderPath))
	.reduce((soFar, oneProviderPath) => soFar.concat(JSON.parse(fs.readFileSync(oneProviderPath, 'utf8')).tools.map((oneTool) => oneTool.definition.name)), [])
	.filter((oneToolName) => /raw_cypher/.test(oneToolName));
assert('the only raw Cypher tool any DME provider offers is dme_raw_cypher', JSON.stringify(rawCypherToolNameList) === JSON.stringify(['dme_raw_cypher']), JSON.stringify(rawCypherToolNameList));

const scratchBoltUri = process.env.DME_SCRATCH_BOLT_URI;
const scratchPassword = process.env.DME_SCRATCH_NEO4J_PASSWORD;
if (!scratchBoltUri || !scratchPassword) {
	console.log('\nREFUSED: the live half needs DME_SCRATCH_BOLT_URI and DME_SCRATCH_NEO4J_PASSWORD naming a SCRATCH Neo4j; there is no default, and never the golden graph.');
	failed++;
	finish();
}
const hostName = os.hostname();
const configName = hostName === 'qMini.local' || hostName === 'qbook.local' ? 'instanceSpecific/qbook' : '';
// the configs directory is found the way dataModelExplorerSearch.js's loadConfig finds it (the path up to /system), so
// the gate also runs from a git worktree, where codeRoot/../configs does not exist
const configsDirPath = `${dmeDirPath.replace(/^(.*\/system).*$/, '$1')}/configs/${configName}/`;
const dmeConfig = configFileProcessor.getConfig('dataModelExplorerSearch.ini', configsDirPath).dataModelExplorerSearch;
const goldenConnection = resolveContainerConnection(dmeConfig.goldenContainerName);
if (!goldenConnection.error && goldenConnection.boltUri.replace('127.0.0.1', 'localhost') === scratchBoltUri.replace('127.0.0.1', 'localhost')) {
	console.log(`\nREFUSED: DME_SCRATCH_BOLT_URI ${scratchBoltUri} is the GOLDEN container's bolt; this gate writes, so it never runs there.`);
	failed++;
	finish();
}
const scratchConfig = { neo4jBoltUri: scratchBoltUri, neo4jUser: 'neo4j', neo4jPassword: scratchPassword };

console.log(`\n--- live, on the scratch graph ${scratchBoltUri} ---`);
const probeVerb = (verbIndex) => {
	if (verbIndex >= verbNameList.length) {
		dmeModule.withNeo4jSession(scratchConfig, { accessMode: neo4j.session.READ }, (session, sessionCallback) => {
			session.run('MATCH (n:P0WriteProbe) RETURN count(n) AS probeCount').then(
				(result) => sessionCallback('', result.records[0].get('probeCount').toNumber()),
				(countError) => sessionCallback(countError.message),
			);
		}, (countError, probeCount) => {
			assert('and the scratch graph holds NO probe node afterwards', !countError && probeCount === 0, countError || `${probeCount} probe node(s) were written`);
			finish();
		});
		return;
	}
	const verbName = verbNameList[verbIndex];
	const accessMode = dmeModule.sessionAccessModeFor(verbName);
	dmeModule.withNeo4jSession(scratchConfig, { accessMode }, (session, sessionCallback) => {
		session.run('CREATE (n:P0WriteProbe {verbName: $verbName}) RETURN n', { verbName }).then(
			() => sessionCallback('', 'WROTE'),
			(writeError) => sessionCallback('', `${writeError.code}: ${writeError.message}`),
		);
	}, (sessionError, outcomeText) => {
		assert(`${verbName}: a CREATE in the session this verb opens is refused by Neo4j (AccessMode)`, !sessionError && /Neo\.ClientError\.Statement\.AccessMode/.test(outcomeText || ''), sessionError || outcomeText);
		probeVerb(verbIndex + 1);
	});
};
probeVerb(0);
