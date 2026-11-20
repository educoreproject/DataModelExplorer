'use strict';

// From bidConnector. 2026-09-24 (11.0): try { assert(false) } catch { assert(err) } blocks, which passed whatever happened, replaced with settle(); invalid-SQL test now requires the original driver message.
const { runTest, initTestDbInstance, promisify, settle, assert } = require('./test-helpers');
const config = require('./config');

module.exports = async () => {
  // Test basic runStatement functionality
  await runTest('runStatement should execute valid SQL statements', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const runStatementPromise = promisify(table.runStatement);
    const getDataPromise = promisify(table.getData);
    
    // Create a custom table using runStatement
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS <!tableName!>_custom (
        id INTEGER PRIMARY KEY,
        name TEXT,
        value REAL
      );
    `;
    
    await runStatementPromise(createTableSQL);
    
    // Insert data into custom table
    const insertSQL = `
      INSERT INTO <!tableName!>_custom (name, value)
      VALUES ('test1', 1.5), ('test2', 2.5), ('test3', 3.5);
    `;
    
    await runStatementPromise(insertSQL);
    
    // Verify data was inserted
    const results = await getDataPromise(
      'SELECT * FROM <!tableName!>_custom;', 
      { noTableNameOk: true }
    );
    
    assert(results.length === 3, 'Should insert 3 rows');
    assert(results[0].name === 'test1', 'First row should have correct name');
    assert(parseFloat(results[0].value) === 1.5, 'First row should have correct value');
  });

  // Test error handling with invalid SQL
  await runTest('runStatement should handle invalid SQL gracefully', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const runStatementPromise = promisify(table.runStatement);
    
    // The driver's own message must reach the caller, unreplaced.
    const { err } = await settle(table.runStatement)('CREATE INVALID SYNTAX;', { noTableNameOk: true });
    assert(err, 'invalid SQL must report an error');
    assert(/syntax error/.test(String(err)), `the original SQLite message must reach the callback, got: ${err}`);
  });

  // Test table name substitution
  await runTest('runStatement should replace <!tableName!> placeholder', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table with specific name
    const tableName = 'substitution_test';
    const table = await getTablePromise(tableName);
    const runStatementPromise = promisify(table.runStatement);
    const getDataPromise = promisify(table.getData);
    
    // Create and insert with tableName substitution
    const createAndInsertSQL = `
      CREATE TABLE IF NOT EXISTS <!tableName!>_derived (id INTEGER, value TEXT);
      INSERT INTO <!tableName!>_derived VALUES (1, 'test value');
    `;
    
    await runStatementPromise(createAndInsertSQL);
    
    // Verify table was created and data inserted
    const results = await getDataPromise(
      'SELECT * FROM <!tableName!>_derived;',
      { noTableNameOk: true }
    );
    
    assert(results.length === 1, 'Should insert 1 row');
    assert(results[0].id === 1, 'Row should have correct id');
    assert(results[0].value === 'test value', 'Row should have correct value');
  });

  // Test multiple statements
  await runTest('runStatement should execute multiple SQL statements', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const runStatementPromise = promisify(table.runStatement);
    const getDataPromise = promisify(table.getData);
    
    // Execute multiple statements
    const multipleSQL = `
      CREATE TABLE IF NOT EXISTS <!tableName!>_multi (id INTEGER, name TEXT);
      INSERT INTO <!tableName!>_multi VALUES (1, 'one');
      INSERT INTO <!tableName!>_multi VALUES (2, 'two');
      INSERT INTO <!tableName!>_multi VALUES (3, 'three');
    `;
    
    await runStatementPromise(multipleSQL);
    
    // Verify all statements were executed
    const results = await getDataPromise(
      'SELECT * FROM <!tableName!>_multi ORDER BY id;',
      { noTableNameOk: true }
    );
    
    assert(results.length === 3, 'Should insert 3 rows');
    assert(results[0].id === 1, 'First row should have id 1');
    assert(results[1].id === 2, 'Second row should have id 2');
    assert(results[2].id === 3, 'Third row should have id 3');
  });

  // Test noTableNameOk option
  await runTest('runStatement should enforce tableName tag unless noTableNameOk is true', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const runStatementPromise = promisify(table.runStatement);
    
    const { err } = await settle(table.runStatement)('CREATE TABLE temp_table (id INTEGER);', {});
    assert(err, 'a statement without the <!tableName!> tag must be refused');
    assert(/tableName/.test(String(err)), `the refusal must say why, got: ${err}`);
    
    try {
      // Missing tableName placeholder with noTableNameOk
      await runStatementPromise(
        'CREATE TABLE temp_table (id INTEGER);', 
        { noTableNameOk: true }
      );
      // Should not throw an error
      assert(true, 'Should allow statement without tableName placeholder when noTableNameOk is true');
    } catch (err) {
      assert(false, 'Should not throw error when noTableNameOk is true');
    }
  });
};