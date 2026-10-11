'use strict';
// Gate (lane D, 2026-10-01): traversalGenerator.js emits PURE_MODEL_TRAVERSAL verbatim for every
// pure-model graph, and `indexDataModelExplorer -generateTraversal --apply` writes it over
// traversal.cypher. If the two drift apart, regenerating silently reverts traversal.cypher
// (including the HAS_INSTANCE instanceView). This test refuses the drift.
//
// Run: node cli/lib.d/data-model-explorer/test/traversal-template-in-step.test.js   (hermetic)

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const traversalFilePath = path.join(__dirname, '..', 'traversal.cypher');
const generatorFilePath = path.join(__dirname, '..', '..', 'index-data-model-explorer-for-milo', 'lib', 'traversalGenerator.js');

const generatorSource = fs.readFileSync(generatorFilePath, 'utf8');
const literalMatch = generatorSource.match(/const PURE_MODEL_TRAVERSAL = (".*");\n/);
assert.ok(literalMatch, `PURE_MODEL_TRAVERSAL literal not found in ${generatorFilePath}`);

const templateText = JSON.parse(literalMatch[1]);
const traversalText = fs.readFileSync(traversalFilePath, 'utf8');

assert.strictEqual(templateText, traversalText,
	'traversalGenerator.js PURE_MODEL_TRAVERSAL differs from traversal.cypher — update the literal (JSON.stringify of the file)');
assert.ok(traversalText.includes('instanceView'), 'traversal.cypher has lost its instanceView column');

process.stdout.write('PASS traversal-template-in-step (2 checks)\n');
