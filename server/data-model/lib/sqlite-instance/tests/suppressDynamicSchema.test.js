'use strict';

// Rewritten 2026-09-24 (11.0). The bidConnector originals put assert(false) inside a try
// whose catch asserted that an error existed, so the assertion's own failure counted as a
// pass: both passed against a module that had no suppressDynamicSchema at all. These fail
// on such a module.

const { runTest, initTestDbInstance, promisify, settle, assert } = require('./test-helpers');

module.exports = async () => {
  await runTest('suppressDynamicSchema: getTable does not create a missing table, and saveObject refuses by name', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('suppressed_table', { suppressDynamicSchema: true });

    const existsAfterGetTable = await promisify(instance.checkTableExists)('suppressed_table');
    assert.strictEqual(existsAfterGetTable, false, 'getTable with suppressDynamicSchema must not create the table');

    const { err } = await settle(table.saveObject)({ refId: 'test123', name: 'x' }, {});
    assert(err, 'saveObject into a missing table under suppressDynamicSchema must report an error');
    assert(/suppressed_table/.test(String(err)), `the error must name the table, got: ${err}`);

    const existsAfterSave = await promisify(instance.checkTableExists)('suppressed_table');
    assert.strictEqual(existsAfterSave, false, 'saveObject must not have created the table either');
  });

  await runTest('suppressDynamicSchema: an unknown field is dropped, no column is added, the row is saved', async () => {
    const instance = await initTestDbInstance();
    const plainTable = await promisify(instance.getTable)('column_test');
    await promisify(plainTable.saveObject)({ name: 'Initial Object' }, {});
    const columnNamesBefore = (await promisify(plainTable.getData)('PRAGMA table_info(<!tableName!>);', {})).map(({ name }) => name);

    const { err, result: refId } = await settle(plainTable.saveObject)(
      { name: 'New Object', newColumn: 'must not become a column' },
      { suppressDynamicSchema: true },
    );
    assert(!err, `a non-strict save must succeed, got: ${err}`);

    const columnNamesAfter = (await promisify(plainTable.getData)('PRAGMA table_info(<!tableName!>);', {})).map(({ name }) => name);
    assert.deepStrictEqual(columnNamesAfter, columnNamesBefore, 'no column may be added');

    const savedRowList = await promisify(plainTable.getData)(`SELECT * FROM <!tableName!> WHERE refId = '${refId}';`, {});
    assert.strictEqual(savedRowList.length, 1, 'the row must be saved');
    assert.strictEqual(savedRowList[0].name, 'New Object');
    assert.strictEqual(savedRowList[0].newColumn, undefined);
  });

  await runTest('suppressDynamicSchema given to getTable applies to every call on that table', async () => {
    const instance = await initTestDbInstance();
    const plainTable = await promisify(instance.getTable)('table_level_option');
    await promisify(plainTable.saveObject)({ name: 'seed' }, {});

    const suppressedTable = await promisify(instance.getTable)('table_level_option', { suppressDynamicSchema: true, strictSchema: true });
    const { err } = await settle(suppressedTable.saveObject)({ name: 'x', extraField: 'y' }, {});
    assert(err, 'the table-level strict option must refuse an unknown field without being repeated on the call');
    assert(/extraField/.test(String(err)), `the error must name the field, got: ${err}`);
  });
};
