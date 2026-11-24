'use strict';

// From bidConnector. 2026-09-24 (11.0): try { assert(false) } catch { assert(err) } blocks, which passed whatever happened, replaced with settle(); invalid-SQL test now requires the original driver message.
const { runTest, initTestDbInstance, promisify, settle, assert } = require('./test-helpers');
const config = require('./config');

module.exports = async () => {
  // Test basic getData functionality
  await runTest('getData should retrieve data with valid SQL', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const saveObjectPromise = promisify(table.saveObject);
    const getDataPromise = promisify(table.getData);
    
    // Save test objects
    for (const obj of config.testObjects) {
      await saveObjectPromise(obj);
    }
    
    // Retrieve all data
    const results = await getDataPromise('SELECT * FROM <!tableName!>;');
    
    // Verify results
    assert(Array.isArray(results), 'Results should be an array');
    assert(results.length === config.testObjects.length, 'Should retrieve all inserted objects');
    
    // Check that each inserted object exists in results
    for (const testObj of config.testObjects) {
      const found = results.some(result => result.name === testObj.name);
      assert(found, `Should find object with name ${testObj.name}`);
    }
  });

  // Test filtering with WHERE clause
  await runTest('getData should filter results with WHERE clause', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const saveObjectPromise = promisify(table.saveObject);
    const getDataPromise = promisify(table.getData);
    
    // Save test objects
    for (const obj of config.testObjects) {
      await saveObjectPromise(obj);
    }
    
    // Find active items
    const results = await getDataPromise('SELECT * FROM <!tableName!> WHERE isActive = 1;');
    
    // Verify results
    const activeTestObjects = config.testObjects.filter(obj => obj.isActive);
    assert(results.length === activeTestObjects.length, 'Should retrieve only active objects');
    
    // Find items with price > 20
    const expensiveResults = await getDataPromise('SELECT * FROM <!tableName!> WHERE price > 20;');
    
    // Verify results
    const expensiveTestObjects = config.testObjects.filter(obj => obj.price > 20);
    assert(expensiveResults.length === expensiveTestObjects.length, 'Should retrieve only expensive objects');
  });

  // Test error handling for invalid SQL
  await runTest('getData should handle invalid SQL gracefully', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const getDataPromise = promisify(table.getData);
    
    // The driver's own message must reach the caller, unreplaced.
    const { err } = await settle(table.getData)('SELECT * FROM nonexistent_table;', { noTableNameOk: true });
    assert(err, 'invalid SQL must report an error');
    assert(/no such table: nonexistent_table/.test(String(err)), `the original SQLite message must reach the callback, got: ${err}`);
  });

  // Test tableName substitution
  await runTest('getData should replace <!tableName!> placeholder', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const saveObjectPromise = promisify(table.saveObject);
    const getDataPromise = promisify(table.getData);
    
    // Save a test object
    await saveObjectPromise(config.testObject);
    
    // Use tableName placeholder
    const results = await getDataPromise('SELECT COUNT(*) as count FROM <!tableName!>;');
    
    // Verify query worked (would fail if placeholder wasn't replaced)
    assert(results.length === 1, 'Query with tableName placeholder should work');
    assert(results[0].count > 0, 'Should return correct count');
  });

  // Test noTableNameOk option
  await runTest('getData should enforce tableName tag unless noTableNameOk is true', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const getDataPromise = promisify(table.getData);
    
    const { err } = await settle(table.getData)('SELECT 1;', {});
    assert(err, 'a query without the <!tableName!> tag must be refused');
    assert(/tableName/.test(String(err)), `the refusal must say why, got: ${err}`);
    
    try {
      // Missing tableName placeholder with noTableNameOk
      const result = await getDataPromise('SELECT 1;', { noTableNameOk: true });
      // Should not throw an error
      assert(result, 'Should allow query without tableName placeholder when noTableNameOk is true');
    } catch (err) {
      assert(false, 'Should not throw error when noTableNameOk is true');
    }
  });
};