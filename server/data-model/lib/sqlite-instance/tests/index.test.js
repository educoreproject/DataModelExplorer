'use strict';

// sqlite-instance test runner. Runs every module even when an earlier one fails, prints one
// summary, exits 1 on any failure.
//   node index.test.js                                   test ./../sqlite-instance.js
//   SQLITE_INSTANCE_UNDER_TEST=/abs/path.js node index.test.js   test another copy
// Test databases live in /tmp/sqliteInstanceTests; no project database is ever opened.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { testDbPath, modulePath } = require('./config');
const { getTestStats, resetTestStats } = require('./test-helpers');

const testModuleList = [
  ['getTable', require('./getTable.test')],
  ['saveObject', require('./saveObject.test')],
  ['getData', require('./getData.test')],
  ['runStatement', require('./runStatement.test')],
  ['suppressDynamicSchema', require('./suppressDynamicSchema.test')],
  ['strictSchema', require('./strictSchema.test')],
  ['defects', require('./defects.test')],
  ['consolidation', require('./consolidation.test')],
];

// The lennyPens proof suite keeps its own harness; it runs as a child process.
const runDeleteAndEscapingSuite = () => {
  const childResult = spawnSync(process.execPath, [path.join(__dirname, 'deleteAndEscaping.test.js')], {
    env: { ...process.env, SQLITE_INSTANCE_UNDER_TEST: modulePath },
    encoding: 'utf8',
  });
  const outputText = `${childResult.stdout || ''}${childResult.stderr || ''}`;
  const checkLineList = outputText.split('\n').filter((line) => /^\s*\[(PASS|FAIL)\]/.test(line));
  checkLineList.forEach((line) => console.log(`  ${line.trim()}`));
  const passedCount = checkLineList.filter((line) => /\[PASS\]/.test(line)).length;
  const failedCount = checkLineList.length - passedCount + (childResult.status !== 0 && checkLineList.length === passedCount ? 1 : 0);
  if (childResult.status !== 0 && checkLineList.length === passedCount) {
    console.log(`  [FAIL] deleteAndEscaping crashed:\n${outputText.split('\n').slice(-8).join('\n')}`);
  }
  return { passedCount, failedCount };
};

const runAllTests = async () => {
  resetTestStats();
  console.log(`sqlite-instance tests\n  module:   ${modulePath}\n  database: ${testDbPath}`);

  for (const [moduleLabel, testModule] of testModuleList) {
    console.log(`\n=== ${moduleLabel} ===`);
    await testModule();
  }

  console.log('\n=== deleteAndEscaping (lennyPens proof suite) ===');
  const childSummary = runDeleteAndEscapingSuite();

  const stats = getTestStats();
  const passedTotal = stats.passed + childSummary.passedCount;
  const failedTotal = stats.failed + childSummary.failedCount;
  console.log(`\nTEST SUMMARY: ${passedTotal} passed, ${failedTotal} failed, ${passedTotal + failedTotal} total`);
  stats.failedNameList.forEach((name) => console.log(`  FAILED: ${name}`));

  ['', '-wal', '-shm'].forEach((suffix) => fs.existsSync(testDbPath + suffix) && fs.unlinkSync(testDbPath + suffix));
  process.exit(failedTotal ? 1 : 0);
};

if (require.main === module) {
  runAllTests();
}
