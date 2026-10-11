'use strict';
// graph-container-security-env.test.js — X5 (campaign P4b, ruled B by VIOLET_VALLEY 2026-10-07).
// A user clone is a Neo4j container the DME launches itself, so it carries the same security environment as every
// graph container educoreForge's replayManager launches:
//   1. CLONE_CONTAINER_SECURITY_ENV_LIST is exported and frozen: APOC allowed only as apoc.merge.*, Neo4j's URL
//      blocklist covering every IPv4 and IPv6 address (so LOAD CSV FROM <url> cannot fetch), no unrestricted grant;
//   2. STRUCTURAL (declared as such): the clone `docker run` spreads that list, grants no unrestricted procedure,
//      allows no apoc.* wildcard, and mounts no import directory (nothing in the DME reads one);
//   3. RED TWINS (in-memory text doubles of clone-manager.js): put back the apoc.* wildcard, or the import mount -> red.
// Not exercised live here: provisioning a clone quiesces the golden. The live half of X5 is proved on replayManager's
// launch site and on the gold container (evidence/P4b/X5-*.log in educoreForge's campaign folder).
//
// Run: /usr/local/bin/node server/test/graph-container-security-env.test.js

const fs = require('fs');
const path = require('path');

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

console.log('\n=== X5: user clones launch with the declared container security env ===\n');

const cloneManagerFilePath = path.join(__dirname, '..', 'data-model', 'lib', 'user-graph', 'clone-manager.js');
const cloneManagerModule = require(cloneManagerFilePath);
const securityEnvList = cloneManagerModule.CLONE_CONTAINER_SECURITY_ENV_LIST || [];

ok('CLONE_CONTAINER_SECURITY_ENV_LIST is exported and frozen', Array.isArray(securityEnvList) && securityEnvList.length > 0 && Object.isFrozen(securityEnvList), JSON.stringify(securityEnvList));
ok('it allows exactly apoc.merge.*', securityEnvList.indexOf('NEO4J_dbms_security_procedures_allowlist=apoc.merge.*') !== -1, JSON.stringify(securityEnvList));
ok('it blocks every IPv4 and IPv6 URL', securityEnvList.indexOf('NEO4J_internal_dbms_cypher__ip__blocklist=0.0.0.0/0,::/0') !== -1, JSON.stringify(securityEnvList));
ok('it grants no unrestricted procedure', securityEnvList.every((oneEnv) => oneEnv.indexOf('procedures_unrestricted') === -1), JSON.stringify(securityEnvList));

const cloneLaunchJudgeList = [
	{ judgeName: 'the clone docker run spreads CLONE_CONTAINER_SECURITY_ENV_LIST', judge: (sourceText) => /\.\.\.CLONE_CONTAINER_SECURITY_ENV_LIST\.reduce\(/.test(sourceText) },
	{ judgeName: 'no unrestricted procedure grant anywhere in clone-manager', judge: (sourceText) => sourceText.indexOf("'NEO4J_dbms_security_procedures_unrestricted=") === -1 },
	{ judgeName: 'no apoc.* wildcard allowlist anywhere in clone-manager', judge: (sourceText) => sourceText.indexOf("procedures_allowlist=apoc.*'") === -1 },
	{ judgeName: 'no import directory mounted into a clone', judge: (sourceText) => sourceText.indexOf(':/var/lib/neo4j/import') === -1 },
];
const cloneManagerText = fs.readFileSync(cloneManagerFilePath, 'utf8');
cloneLaunchJudgeList.forEach((oneJudge) => ok(`STRUCTURAL: ${oneJudge.judgeName}`, oneJudge.judge(cloneManagerText)));

const twinList = [
	{ twinName: 'apocWildcardRestored', judgeName: 'no apoc.* wildcard allowlist anywhere in clone-manager', mutate: (sourceText) => `${sourceText}\n// '-e', 'NEO4J_dbms_security_procedures_allowlist=apoc.*',\n` },
	{ twinName: 'importMountRestored', judgeName: 'no import directory mounted into a clone', mutate: (sourceText) => `${sourceText}\n// '-v', \`\${cloneDir}/import:/var/lib/neo4j/import\`,\n` },
];
twinList.forEach((oneTwin) => {
	const judgeEntry = cloneLaunchJudgeList.find((oneJudge) => oneJudge.judgeName === oneTwin.judgeName);
	ok(`RED TWIN '${oneTwin.twinName}' turns '${oneTwin.judgeName}' red`, judgeEntry.judge(oneTwin.mutate(cloneManagerText)) === false);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed === 0 ? 0 : 1);
