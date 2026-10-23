'use strict';
// rater-reads-dme-gold.test.js — ⟪lane zbE, E4 (TQ ruling 2026-10-23)⟫ the CEDS Rater stops pinning its own graph: it reads
// the DME's configured gold (dataModelExplorerSearch.goldenContainerName, the golden pointer) like the rest of the DME, and
// carries no separate container name and no 'built from another gold' refusal.
//   1. rater-tool-access, booted through the REAL server pieces (raterServerHarness) with a raterTool config that names NO
//      gold and the DME's gold passed in: the tool is on, and reads that gold (raterToolAccess.goldenContainerName).
//   2. without the DME's gold it refuses by name, raterConfigInvalid, naming dataModelExplorerSearch.goldenContainerName.
//   3. no dead key: rater-tool-access and the CLI name neither raterTool.goldenContainerName nor frozenInputsFromAnotherGold,
//      and no raterTool.ini in the configs tree carries goldenContainerName.
// Hermetic for 1 and 2 (the graph is opened only on first use; nothing here reads it).
//
// Run: /usr/local/bin/node server/test/rater-reads-dme-gold.test.js [configsDirPath]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootRaterServer } = require('./lib/raterServerHarness');

const codeRootPath = path.join(__dirname, '..', '..');
const configsDirPath = process.argv[2] || path.join(codeRootPath, '..', 'configs');
const FROZEN_INPUT_DIR_PATH = path.join(codeRootPath, 'cli', 'lib.d', 'rater-tool', 'frozenInputs');
const STUB_DME_GOLD_NAME = 'GOLD_EVAL_raterTest_dmeGold';

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};
const finish = () => {
	console.log(`\n=== rater-reads-dme-gold — Results: ${passed} passed, ${failed} failed ===`);
	process.exit(failed > 0 ? 1 : 0);
};

console.log('\n=== E4: the CEDS Rater reads the DME\'s gold ===\n');
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raterReadsDmeGold-'));
const raterToolConfigOf = (storeName) => ({ storeFilePath: path.join(scratchDirPath, storeName, 'rater.sqlite3'), frozenInputDirPath: FROZEN_INPUT_DIR_PATH, queryTimeoutMs: 30000 });

bootRaterServer({ scratchDirPath: path.join(scratchDirPath, 'withGold'), raterToolConfig: raterToolConfigOf('withGold'), goldenContainerName: STUB_DME_GOLD_NAME }, (bootError, harness) => {
	const raterToolAccess = (harness || {}).raterToolAccess || {};
	ok('1. with no gold of its own and the DME\'s gold passed in, the rater tool is on', !bootError && raterToolAccess.setupRefusal === null, bootError || JSON.stringify(raterToolAccess.setupRefusal));
	ok('   and reads the DME\'s gold', raterToolAccess.goldenContainerName === STUB_DME_GOLD_NAME, String(raterToolAccess.goldenContainerName));
	if (harness) harness.close();
	bootRaterServer({ scratchDirPath: path.join(scratchDirPath, 'noGold'), raterToolConfig: raterToolConfigOf('noGold') }, (noGoldBootError, noGoldHarness) => {
		const noGoldRefusal = ((noGoldHarness || {}).raterToolAccess || {}).setupRefusal || {};
		ok('2. without the DME\'s gold it refuses by name, naming the DME\'s setting', !noGoldBootError && noGoldRefusal.refusalName === 'raterConfigInvalid' && /dataModelExplorerSearch\.goldenContainerName/.test(noGoldRefusal.refusalText || ''), noGoldBootError || JSON.stringify(noGoldRefusal));
		if (noGoldHarness) noGoldHarness.close();
		const sourceFileList = ['server/data-model/lib/rater-tool/rater-tool-access.js', 'server/data-model/lib/rater-tool/rater-graph.js', 'cli/lib.d/rater-tool/raterTool.js', 'cli/lib.d/rater-tool/lib/buildSample.js', 'cli/lib.d/rater-tool/lib/buildSuggested.js'];
		const deadNameHitList = sourceFileList.filter((relativePath) => /raterTool(Config)?\.goldenContainerName|frozenInputsFromAnotherGold|\[raterTool\] goldenContainerName/.test(fs.readFileSync(path.join(codeRootPath, relativePath), 'utf8')));
		ok('3. no rater source names the retired pin (raterTool.goldenContainerName, frozenInputsFromAnotherGold)', deadNameHitList.length === 0, deadNameHitList.join(', '));
		const instanceDirPath = path.join(configsDirPath, 'instanceSpecific');
		const iniWithPinList = fs.readdirSync(instanceDirPath).map((instanceName) => path.join(instanceDirPath, instanceName, 'raterTool.ini')).filter((iniPath) => fs.existsSync(iniPath) && /^\s*goldenContainerName\s*=/m.test(fs.readFileSync(iniPath, 'utf8')));
		ok(`   and no raterTool.ini under ${configsDirPath} carries goldenContainerName`, iniWithPinList.length === 0, iniWithPinList.join(', '));
		finish();
	});
});
