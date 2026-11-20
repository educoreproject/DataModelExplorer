'use strict';

// Regression tests for the defects found by bidConnector's crmSync lane B probe (2026-09-24),
// carried to the scaffold for 11.0. Adapted to better-sqlite3 and to this line's contracts:
// - D3: two "concurrent" saves cannot race under a synchronous driver (the second becomes an
//   UPDATE), so the refusal is provoked deterministically with a UNIQUE index.
// - D2: this line returns the refId WITH the error (10.1, deliberate); the test asserts the
//   error and that no row exists, not that the refId is absent.

const fs = require('fs');
const path = require('path');
const { runTest, initTestDbInstance, promisify, settle, assert } = require('./test-helpers');
const config = require('./config');

const openTable = async (tableName) => {
  const instance = await initTestDbInstance();
  const table = await promisify(instance.getTable)(tableName);
  const saveObject = (inObj) => settle(table.saveObject)(inObj, {}).then(({ err, result }) => ({ err, refId: result }));
  const getData = (statement) => promisify(table.getData)(statement, {});
  const runStatement = (statement) => promisify(table.runStatement)(statement, {});
  return { saveObject, getData, runStatement };
};

// true when every segment of filePath exists with exactly this spelling (macOS is case-insensitive)
const pathExistsWithExactCase = (filePath) => {
  const segmentList = path.relative('/', filePath).split(path.sep);
  let parentPath = '/';
  return segmentList.every((segment) => {
    const found = fs.existsSync(parentPath) && fs.readdirSync(parentPath).includes(segment);
    parentPath = path.join(parentPath, segment);
    return found;
  });
};

module.exports = async () => {
  await runTest('D4 saveObject refId is escaped: a crafted refId does not rewrite another row', async () => {
    const { saveObject, getData } = await openTable('defectHijack');
    await saveObject({ refId: 'VICTIM', payload: 'original' });
    const { err } = await saveObject({ refId: "x' OR '1'='1", payload: 'HIJACKED' });
    const victimRowList = await getData(`SELECT payload FROM <!tableName!> WHERE refId = 'VICTIM';`);
    assert.strictEqual(victimRowList.length, 1, 'VICTIM row must still exist under its own refId');
    assert.strictEqual(victimRowList[0].payload, 'original', 'VICTIM row must be untouched');
    assert(!err, `saving a crafted refId should succeed as ordinary data, got: ${err}`);
    const craftedRowList = await getData(`SELECT payload FROM <!tableName!> WHERE refId = 'x'' OR ''1''=''1';`);
    assert.strictEqual(craftedRowList.length, 1, 'crafted refId must be stored as a literal row');
  });

  await runTest('D4 saveObject refId containing an apostrophe inserts and then updates', async () => {
    const { saveObject, getData } = await openTable('defectApostrophe');
    const insertResult = await saveObject({ refId: "O'Brien", payload: 'first' });
    assert(!insertResult.err, `insert failed: ${insertResult.err}`);
    const updateResult = await saveObject({ refId: "O'Brien", payload: 'second' });
    assert(!updateResult.err, `update failed: ${updateResult.err}`);
    const rowList = await getData(`SELECT payload FROM <!tableName!> WHERE refId = 'O''Brien';`);
    assert.deepStrictEqual(rowList.map(({ payload }) => payload), ['second']);
  });

  await runTest('D3 saveObject reports a refused INSERT (UNIQUE index), and no row is written', async () => {
    const { saveObject, getData, runStatement } = await openTable('defectSwallow');
    await saveObject({ refId: 'FIRST', payload: 'same' });
    await runStatement(`CREATE UNIQUE INDEX defectSwallowPayload ON <!tableName!>(payload);`);
    const { err } = await saveObject({ refId: 'SECOND', payload: 'same' });
    assert(/UNIQUE/.test(String(err)), `expected a UNIQUE constraint error, got: ${err}`);
    const rowList = await getData(`SELECT refId FROM <!tableName!> WHERE refId = 'SECOND';`);
    assert.strictEqual(rowList.length, 0, 'the refused row must not exist');
  });

  await runTest('D2 saveObject with a NUL character reports an error and writes no row', async () => {
    const { saveObject, getData } = await openTable('defectNul');
    const { err, refId } = await saveObject({ payload: 'a\u0000b' });
    const rowList = await getData(`SELECT * FROM <!tableName!>;`);
    assert(err, `saveObject must report the failed INSERT; it returned refId ${refId} and ${rowList.length} rows exist`);
    assert.strictEqual(rowList.length, 0, 'no row may exist for a failed write');
  });

  await runTest('D7 updatedAt trigger stamps only the updated row', async () => {
    const { saveObject, getData } = await openTable('defectStamp');
    const oldStamp = '2000-01-01 00:00:00';
    await saveObject({ refId: 'OLD', updatedAt: oldStamp, payload: 'old' });
    await saveObject({ refId: 'OTHER', payload: 'x' });
    const { err } = await saveObject({ refId: 'OTHER', payload: 'y' });
    assert(!err, `update failed: ${err}`);
    const rowList = await getData(`SELECT updatedAt FROM <!tableName!> WHERE refId = 'OLD';`);
    assert.strictEqual(rowList[0].updatedAt, oldStamp, 'updating OTHER must not restamp OLD');
  });

  await runTest('relative requires match the file names exactly (case-sensitive filesystems)', async () => {
    const libDirectory = path.join(config.moduleDirectory, 'lib');
    const sourceFileList = [
      'sqlite-instance.js',
      ...(fs.existsSync(libDirectory) ? fs.readdirSync(libDirectory).map((fileName) => path.join('lib', fileName)) : []),
    ];
    const mismatchList = [];
    sourceFileList.forEach((sourceFile) => {
      const sourcePath = path.join(config.moduleDirectory, sourceFile);
      const sourceText = fs.readFileSync(sourcePath, 'utf8');
      [...sourceText.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)].forEach(([, requirePath]) => {
        const targetPath = path.resolve(path.dirname(sourcePath), requirePath);
        const candidateList = [targetPath, `${targetPath}.js`, path.join(targetPath, 'index.js')];
        if (!candidateList.some(pathExistsWithExactCase)) {
          mismatchList.push(`${sourceFile}: require('${requirePath}')`);
        }
      });
    });
    assert.deepStrictEqual(mismatchList, [], `requires that only resolve on a case-insensitive filesystem: ${mismatchList.join(', ')}`);
  });
};
