#!/usr/bin/env node
'use strict';

// schema-summary-retired.test.js — W-D-18 (campaign P1, 2026-10-06; V2-C34, V2-P15, supervisor ruling 3: RETIRE).
// schema-summary.json was a June snapshot (container gf_golden, index pureGraph5_vector, match-edge props that no longer
// exist) with ONE reader: traversalGenerator's isPureModelSchema switch, which on a regenerated summary missing its
// marker would have emitted the LEGACY leg-assembly and, with --apply, reverted traversal.cypher. The summary, its
// exporter, the generated copy and the legacy path are retired: the generator emits the one template and nothing else.
// Hermetic.
//
//   node cli/lib.d/data-model-explorer/test/schema-summary-retired.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const dmeDirPath = path.join(__dirname, '..');
const generatorDirPath = path.join(dmeDirPath, '..', 'index-data-model-explorer-for-milo');

let passed = 0;
let failed = 0;
const assert = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ' — ' + detailText : ''}`);
};
console.log('\n=== W-D-18 schema-summary.json and the legacy traversal path are retired ===\n');

assert('schema-summary.json is gone', !fs.existsSync(path.join(dmeDirPath, 'schema-summary.json')));
assert('traversal.generated.cypher is gone', !fs.existsSync(path.join(dmeDirPath, 'traversal.generated.cypher')));
assert('schemaExporter.js is gone', !fs.existsSync(path.join(generatorDirPath, 'lib', 'schemaExporter.js')));
const generatorText = fs.readFileSync(path.join(generatorDirPath, 'lib', 'traversalGenerator.js'), 'utf8');
assert('traversalGenerator.js has no legacy path (no buildCypherQuery, isPureModelSchema or schemaPath)', !/buildCypherQuery|isPureModelSchema|schemaPath/.test(generatorText));
const indexerText = fs.readFileSync(path.join(generatorDirPath, 'indexDataModelExplorer.js'), 'utf8');
assert('indexDataModelExplorer -generateTraversal no longer exports a schema', !/schemaExporter|exportSchema/.test(indexerText));

process.global = { xLog: { status: () => {}, error: (errorText) => console.log(`    xLog.error: ${errorText}`), verbose: () => {} } };
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'wd18-'));
fs.copyFileSync(path.join(dmeDirPath, 'traversal.cypher'), path.join(scratchDirPath, 'traversal.cypher'));
const { generateTraversal } = require(path.join(generatorDirPath, 'lib', 'traversalGenerator'));
const emittedText = generateTraversal({ outputDir: scratchDirPath, preview: true });
assert('generateTraversal (no schema) emits the one template, equal to traversal.cypher', emittedText === fs.readFileSync(path.join(dmeDirPath, 'traversal.cypher'), 'utf8'));
assert('  and writes no generated copy', !fs.existsSync(path.join(scratchDirPath, 'traversal.generated.cypher')));
fs.rmSync(scratchDirPath, { recursive: true, force: true });
console.log(`\n=== W-D-18 — Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
