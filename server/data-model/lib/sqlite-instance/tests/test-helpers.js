'use strict';

// Test code may use async/await (precedent: bidConnector's sqlite-instance tests);
// the module under test may not.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const config = require('./config');

const xLogLineList = [];
if (!process.global) {
  process.global = {};
}
if (!process.global.xLog) {
  const quietUnlessVerbose = (level) => (message) => {
    xLogLineList.push({ level, message: String(message) });
    process.env.SQLITE_INSTANCE_TEST_VERBOSE && console.log(`${level}: ${message}`);
  };
  process.global.xLog = {
    info: quietUnlessVerbose('info'),
    status: quietUnlessVerbose('status'),
    error: quietUnlessVerbose('error'),
    warning: quietUnlessVerbose('warning'),
  };
}
if (!process.global.getConfig) {
  process.global.getConfig = () => ({});
}

// A fresh, empty database file for every test (better-sqlite3 creates it on open).
const setupTestDb = async () => {
  fs.mkdirSync(path.dirname(config.testDbPath), { recursive: true });
  ['', '-wal', '-shm'].forEach((suffix) => {
    if (fs.existsSync(config.testDbPath + suffix)) {
      fs.unlinkSync(config.testDbPath + suffix);
    }
  });
};

const getSqliteInstance = () => {
  delete require.cache[require.resolve(config.modulePath)];
  return require(config.modulePath)({});
};

const initTestDbInstance = () =>
  new Promise((resolve, reject) => {
    getSqliteInstance().initDatabaseInstance(config.testDbPath, (err, instance) => {
      if (err) {
        return reject(new Error(`Failed to initialize database instance: ${err}`));
      }
      resolve(instance);
    });
  });

const testStats = { passed: 0, failed: 0, total: 0, failedNameList: [] };
const getTestStats = () => ({ ...testStats, failedNameList: [...testStats.failedNameList] });
const resetTestStats = () => {
  testStats.passed = 0;
  testStats.failed = 0;
  testStats.total = 0;
  testStats.failedNameList = [];
};

// Records the outcome and never rethrows, so one red test cannot hide the rest.
let rejectRunningTest;
process.on('uncaughtException', (err) => {
  if (!rejectRunningTest) {
    throw err;
  }
  rejectRunningTest(new Error(`uncaught exception (would have crashed the process): ${err.message}`));
});

const runTest = async (name, testFn) => {
  testStats.total++;
  await setupTestDb();
  let failure;
  // An exception thrown from a driver callback escapes the test's promise and would kill
  // the run (bidConnector's old save-list did exactly that); charge it to the running test.
  const uncaughtFailure = new Promise((resolve) => {
    rejectRunningTest = resolve;
  });
  await Promise.race([testFn().then(() => undefined, (err) => err), uncaughtFailure]).then((err) => {
    failure = err;
  });
  rejectRunningTest = undefined;
  if (failure) {
    testStats.failed++;
    testStats.failedNameList.push(name);
    console.log(`  [FAIL] ${name}\n         ${String(failure.message || failure).split('\n')[0]}`);
    return;
  }
  testStats.passed++;
  console.log(`  [PASS] ${name}`);
};

const promisify = (fn) => (...args) =>
  new Promise((resolve, reject) => {
    fn(...args, (err, result) => {
      if (err) {
        return reject(err);
      }
      resolve(result);
    });
  });

// callback results as {err, result}, never rejecting, so a test can assert on the error itself
const settle = (fn) => (...args) =>
  new Promise((resolve) => {
    fn(...args, (err, result) => resolve({ err, result }));
  });

module.exports = {
  setupTestDb,
  getSqliteInstance,
  initTestDbInstance,
  runTest,
  promisify,
  settle,
  assert,
  getTestStats,
  resetTestStats,
  xLogLineList,
};
