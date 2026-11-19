'use strict';

// From bidConnector, 2026-09-24 (11.0): double-quoted string literals replaced (better-sqlite3
// rejects them) and the try { assert(false) } catch { assert(err) } pattern removed.

const { runTest, initTestDbInstance, promisify, settle, assert } = require('./test-helpers');

module.exports = async () => {
  await runTest('strictSchema should reject objects with non-matching fields', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('strict_schema_test');
    await promisify(table.saveObject)({ name: 'Initial Object', value: 123 }, {});

    const { err } = await settle(table.saveObject)(
      { name: 'Strict Object', value: 456, extraField: 'This should cause an error' },
      { suppressDynamicSchema: true, strictSchema: true },
    );
    assert(err, 'strictSchema must refuse an object with a field the table lacks');
    assert(/extraField/.test(String(err)), `the error must name the field, got: ${err}`);

    const results = await promisify(table.getData)(`SELECT COUNT(*) as count FROM <!tableName!> WHERE name = 'Strict Object';`, {});
    assert.strictEqual(results[0].count, 0, 'Object should not be saved with strictSchema when fields do not match');
  });

  await runTest('suppressDynamicSchema without strictSchema should filter non-matching fields', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('non_strict_test');
    const getDataPromise = promisify(table.getData);
    await promisify(table.saveObject)({ name: 'Initial Object', value: 123 }, {});
    const initialColumnNames = (await getDataPromise('PRAGMA table_info(<!tableName!>);', {})).map((col) => col.name.toLowerCase());

    await promisify(table.saveObject)(
      { name: 'Filtered Object', value: 456, extraField1: 'filtered out', extraField2: 'also filtered out' },
      { suppressDynamicSchema: true },
    );

    const savedObjects = await getDataPromise(`SELECT * FROM <!tableName!> WHERE name = 'Filtered Object';`, {});
    assert.strictEqual(savedObjects.length, 1, 'Object should be saved even with extra fields');
    assert.strictEqual(parseInt(savedObjects[0].value), 456, 'Core field "value" should be saved');
    assert.strictEqual(savedObjects[0].extraField1, undefined);
    assert.strictEqual(savedObjects[0].extraField2, undefined);

    const updatedColumnNames = (await getDataPromise('PRAGMA table_info(<!tableName!>);', {})).map((col) => col.name.toLowerCase());
    assert.deepStrictEqual(updatedColumnNames, initialColumnNames, 'Schema should not have changed');
  });

  await runTest('strictSchema without suppressDynamicSchema is refused by name, not ignored', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('strict_alone_test');
    const { err } = await settle(table.saveObject)({ name: 'x' }, { strictSchema: true });
    assert(err, 'strictSchema alone has no meaning and must be refused');
    assert(/strictSchema/.test(String(err)) && /suppressDynamicSchema/.test(String(err)), `the error must name both options, got: ${err}`);
  });

  await runTest('a non-boolean schema option is refused by name', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('option_type_test');
    const { err } = await settle(table.saveObject)({ name: 'x' }, { suppressDynamicSchema: 'yes' });
    assert(err, "suppressDynamicSchema: 'yes' must be refused");
    assert(/suppressDynamicSchema/.test(String(err)), `the error must name the option, got: ${err}`);
  });
};
