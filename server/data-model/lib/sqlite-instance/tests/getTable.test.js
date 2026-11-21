'use strict';

const { runTest, initTestDbInstance, promisify, assert } = require('./test-helpers');
const config = require('./config');

module.exports = async () => {
  // From bidConnector; 2026-09-24 (11.0): double-quoted string literals made single-quoted (better-sqlite3 rejects them).
  // Test getTable function
  await runTest('getTable should create and return a table object', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    
    // Verify table object structure
    assert(table, 'Table object should exist');
    assert(typeof table.getData === 'function', 'Table should have getData method');
    assert(typeof table.saveObject === 'function', 'Table should have saveObject method');
    assert(typeof table.runStatement === 'function', 'Table should have runStatement method');
  });

  // Test table initialization
  await runTest('getTable should initialize table with required columns', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const getDataPromise = promisify(table.getData);
    
    // Query table schema
    const schema = await getDataPromise(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='<!tableName!>';`,
      { noTableNameOk: true }
    );
    
    // Verify schema contains required columns
    const schemaString = schema[0].sql;
    assert(schemaString.includes('[refId]'), 'Schema should include refId column');
    assert(schemaString.includes('[createdAt]'), 'Schema should include createdAt column');
    assert(schemaString.includes('[updatedAt]'), 'Schema should include updatedAt column');
  });

  // Test table triggers
  await runTest('getTable should create updatedAt trigger', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table
    const table = await getTablePromise(config.testTable);
    const getDataPromise = promisify(table.getData);
    
    // Query table triggers
    const triggers = await getDataPromise(
      `SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='<!tableName!>';`,
      { noTableNameOk: true }
    );
    
    // Verify trigger exists and contains expected SQL
    assert(triggers.length > 0, 'Trigger should exist');
    const triggerName = `${config.testTable}UpdateTimestamp`;
    const trigger = triggers.find(t => t.name === triggerName);
    assert(trigger, 'UpdateTimestamp trigger should exist');
    assert(trigger.sql.includes('UPDATE'), 'Trigger should include UPDATE statement');
    assert(trigger.sql.includes('[updatedAt]'), 'Trigger should update updatedAt column');
  });

  // Test table name sanitization
  await runTest('getTable should sanitize table names', async () => {
    const instance = await initTestDbInstance();
    const getTablePromise = promisify(instance.getTable);
    
    // Get a table with special characters
    const unsanitizedName = 'test-table.with!special@chars';
    const table = await getTablePromise(unsanitizedName);
    const getDataPromise = promisify(table.getData);
    
    // Query to see if table was created with sanitized name
    const tablesQuery = `SELECT name FROM sqlite_master WHERE type='table';`;
    const tables = await getDataPromise(tablesQuery, { noTableNameOk: true });
    
    // Table name should be sanitized (replace non-word chars with _)
    const sanitizedName = unsanitizedName.replace(/\W/g, '_');
    const tableExists = tables.some(t => t.name === sanitizedName);
    assert(tableExists, 'Table should be created with sanitized name');
  });
};