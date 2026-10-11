'use strict';
// noContainerLiterals.test.js — W-E-11 meta-gate (campaign P1, 2026-10-06; V2-C29, A13). No live test may name a golden
// container, its bolt port or its password as a literal: the golden graph is declared once (_goldenContainer.ini, read by
// test/lib/goldenContainerName.js) and connections come from container-connection-resolver. Greps server/test and the
// user-graph tests; prints FILE:LINE only, never the matched text (a matched line may hold a secret).
//
// P1 scope: container names, the dead gf_golden port and edge type, and committed password literals. The count and
// embedding-model literals (75882, voyage-3) belong to W-E-5/W-E-6 (P2), which rewrite those tests; they join the
// pattern list then.
//
// Run: node server/test/noContainerLiterals.test.js   (hermetic)

const fs = require('fs');
const path = require('path');

const SCANNED_DIR_PATH_LIST = [path.join(__dirname), path.join(__dirname, '..', 'data-model', 'lib', 'user-graph', 'test')];
// widened in P1 after the multiTenant suites were found to name a retired golden by bolt port 7706 and neo4jPassword literal
const FORBIDDEN_LITERAL_PATTERN_LIST = [/gf_pvsEcand/, /gf_golden\b/, /rag_DataModelExplorer/, /localhost:770[46]\b/, /IMPLIED_MAPPING/, /\bpassword:\s*'[^']+'/, /neo4jPassword:\s*'[^']+'/, /\blogin\(\s*'[^']*',\s*'[^']+'/, /\bPASS\s*=\s*'[^']+'/, /password=\$\{encodeURIComponent\('[^']+'\)/];
const SELF_FILE_NAME = path.basename(__filename);

const listJsFiles = (dirPath) => fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((dirEntry) => {
	const entryPath = path.join(dirPath, dirEntry.name);
	if (dirEntry.isDirectory()) return dirEntry.name === 'node_modules' ? [] : listJsFiles(entryPath);
	return /\.(js|mjs)$/.test(dirEntry.name) && dirEntry.name !== SELF_FILE_NAME ? [entryPath] : [];
});

const hitList = [];
SCANNED_DIR_PATH_LIST.forEach((dirPath) => listJsFiles(dirPath).forEach((filePath) => {
	fs.readFileSync(filePath, 'utf8').split('\n').forEach((lineText, lineIndex) => {
		const matchedPattern = FORBIDDEN_LITERAL_PATTERN_LIST.find((onePattern) => onePattern.test(lineText));
		if (matchedPattern) hitList.push(`${path.relative(path.join(__dirname, '..'), filePath)}:${lineIndex + 1} (${matchedPattern.source})`);
	});
}));
console.log('\n=== W-E-11 no container / port / password literals in the live tests ===\n');
hitList.forEach((hitText) => console.log(`  FAIL: ${hitText}`));
console.log(`\n=== Results: ${hitList.length === 0 ? 1 : 0} passed, ${hitList.length === 0 ? 0 : 1} failed (${hitList.length} literal(s)) ===\n`);
process.exit(hitList.length === 0 ? 0 : 1);
