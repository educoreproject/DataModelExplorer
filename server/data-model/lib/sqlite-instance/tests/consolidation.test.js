'use strict';

// Gates for the 11.0 consolidation (2026-09-24). Each was run against 10.1 and observed
// failing before the module was changed, except where marked CONTROL (pins behavior 10.1
// already had, so a later change cannot silently lose it).

const fs = require('fs');
const { runTest, initTestDbInstance, promisify, settle, assert, xLogLineList } = require('./test-helpers');
const config = require('./config');

const bulkOptions = { bulkInsert: true };

module.exports = async () => {
  // ---------------------------------------------------------------- options leak
  // 10.1 merged each call's options INTO the shared defaults. A call that passes its own
  // options object is judged by that object, so the leak reaches the calls that pass none:
  // getData(statement, callback), runStatement(statement, callback), and saveObject's own
  // internal queries when saveObject itself was called without options.
  await runTest('options: noTableNameOk on table X does not switch the guard off for table Y', async () => {
    const instance = await initTestDbInstance();
    const tableX = await promisify(instance.getTable)('leakTableX');
    const tableY = await promisify(instance.getTable)('leakTableY');
    await promisify(tableX.getData)('SELECT 1 AS one;', { noTableNameOk: true });
    const { err } = await settle(tableY.getData)('SELECT 1 AS one;');
    assert(err, 'table Y must still refuse an untagged query');
  });

  await runTest('options: noTableNameOk on one call does not carry to the next call on the same table', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('leakSameTable');
    await promisify(table.runStatement)('SELECT 1;', { noTableNameOk: true });
    const { err } = await settle(table.runStatement)('SELECT 1;');
    assert(err, 'the next untagged statement must be refused');
  });

  await runTest('options: suppressStatementLog:false on one call does not turn statement logging on for other tables', async () => {
    const instance = await initTestDbInstance();
    const tableX = await promisify(instance.getTable)('leakLogX');
    const tableY = await promisify(instance.getTable)('leakLogY');
    await promisify(tableX.getData)('SELECT 1 AS one FROM <!tableName!>;', { suppressStatementLog: false });
    const logCountBefore = xLogLineList.length;
    await promisify(tableY.getData)('SELECT 2 AS two FROM <!tableName!>;');
    const loggedStatementList = xLogLineList.slice(logCountBefore).filter(({ message }) => /SELECT 2 AS two/.test(message));
    assert.strictEqual(loggedStatementList.length, 0, 'table Y must keep the default (suppressed) statement log');
  });

  await runTest('options: a partial options object still gets the defaults for what it omits', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('partialOptions');
    const logCountBefore = xLogLineList.length;
    await promisify(table.getData)('SELECT 3 AS three;', { noTableNameOk: true });
    const loggedStatementList = xLogLineList.slice(logCountBefore).filter(({ message }) => /SELECT 3 AS three/.test(message));
    assert.strictEqual(loggedStatementList.length, 0, 'suppressStatementLog defaults to true and must stay true when the caller passes only noTableNameOk');
  });

  await runTest('CONTROL a call that passes its own options object is judged by that object', async () => {
    const instance = await initTestDbInstance();
    const tableX = await promisify(instance.getTable)('explicitX');
    const tableY = await promisify(instance.getTable)('explicitY');
    await promisify(tableX.getData)('SELECT 1 AS one;', { noTableNameOk: true });
    const { err } = await settle(tableY.getData)('SELECT 1 AS one;', {});
    assert(err, 'an explicit {} must refuse an untagged query');
  });

  // ---------------------------------------------------------------- D5
  await runTest('D5 a value containing <!tableName!> is stored exactly', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('templateTagValue');
    const storedText = 'see <!tableName!> here';
    const refId = await promisify(table.saveObject)({ payload: storedText }, {});
    await promisify(table.saveObject)({ refId, other: `and <!tableName!> again` }, {});
    const rowList = await promisify(table.getData)(`SELECT payload, other FROM <!tableName!> WHERE refId = '${refId}';`, {});
    assert.strictEqual(rowList[0].payload, storedText, 'INSERT path must not substitute inside values');
    assert.strictEqual(rowList[0].other, 'and <!tableName!> again', 'UPDATE path must not substitute inside values');
  });

  // ---------------------------------------------------------------- single try/catch boundary
  await runTest('the module has exactly one try/catch: the named better-sqlite3 boundary adapter', async () => {
    // better-sqlite3 throws on SQL errors and has no non-throwing exec/prepare, so exactly
    // one try block is allowed, inside callbackFromThrowingCall (supervisor ruling (d)).
    const sourceText = fs.readFileSync(config.modulePath, 'utf8');
    const tryCount = (sourceText.match(/\btry\s*\{/g) || []).length;
    assert.strictEqual(tryCount, 1, `expected exactly one try block, found ${tryCount}`);
    assert(/const callbackFromThrowingCall\s*=/.test(sourceText), 'the boundary adapter must be named callbackFromThrowingCall');
  });

  await runTest('CONTROL a SQL error reaches the callback with the original SQLite message', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('errorText');
    const { err: queryErr } = await settle(table.getData)('SELECT * FROM <!tableName!> WHERE noSuchColumn = 1;', {});
    assert(/no such column: noSuchColumn/.test(String(queryErr)), `getData lost the message: ${queryErr}`);
    const { err: statementErr } = await settle(table.runStatement)('INSERT INTO <!tableName!> (noSuchColumn) VALUES (1);', {});
    assert(/no column named noSuchColumn/.test(String(statementErr)), `runStatement lost the message: ${statementErr}`);
    const { err: existsErr } = await settle(instance.checkTableExists)({ notAString: true });
    assert(existsErr, 'checkTableExists must report a driver error');
  });

  // ---------------------------------------------------------------- bulk saveList
  await runTest('bulk: saveObject([...], {bulkInsert:true}) writes every row and returns their refIds', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkBasic');
    const inputList = Array.from({ length: 1203 }, (unused, index) => ({ refId: `R${index}`, sequence: index, label: `row ${index}` }));
    const refIdList = await promisify(table.saveObject)(inputList, bulkOptions);
    assert.strictEqual(refIdList.length, 1203);
    assert.deepStrictEqual(refIdList.slice(0, 3), ['R0', 'R1', 'R2']);
    const countRowList = await promisify(table.getData)('SELECT COUNT(*) AS count FROM <!tableName!>;', {});
    assert.strictEqual(countRowList[0].count, 1203);
  });

  await runTest('bulk: writes the rows in one statement per batch (a bad row in a batch writes none of that batch)', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkAtomic');
    await promisify(table.saveObject)({ refId: 'SEED', payload: 'unique' }, {});
    await promisify(table.runStatement)('CREATE UNIQUE INDEX bulkAtomicPayload ON <!tableName!>(payload);', {});
    const { err, result: refIdList } = await settle(table.saveObject)(
      [{ refId: 'A', payload: 'a' }, { refId: 'B', payload: 'unique' }, { refId: 'C', payload: 'c' }],
      bulkOptions,
    );
    assert(/UNIQUE/.test(String(err)), `the batch error must be reported, got: ${err}`);
    assert.deepStrictEqual(refIdList, [], 'no refId may be reported for rows that were not written');
    const rowList = await promisify(table.getData)(`SELECT refId FROM <!tableName!> WHERE refId IN ('A','B','C');`, {});
    assert.strictEqual(rowList.length, 0, 'none of the failing batch may be written');
  });

  await runTest('bulk: apostrophes are stored once (not doubled)', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkApostrophe');
    await promisify(table.saveObject)([{ refId: 'L1', payload: "O'Brien" }, { refId: 'L2', payload: "d'Arc" }], bulkOptions);
    const rowList = await promisify(table.getData)('SELECT payload FROM <!tableName!> ORDER BY refId;', {});
    assert.deepStrictEqual(rowList.map(({ payload }) => payload), ["O'Brien", "d'Arc"]);
  });

  await runTest('bulk: re-saving existing rows updates them in place and keeps createdAt', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkUpsert');
    await promisify(table.saveObject)([{ refId: 'U1', payload: 'first', keep: 'kept' }, { refId: 'U2', payload: 'first' }], bulkOptions);
    await promisify(table.runStatement)(`UPDATE <!tableName!> SET createdAt = '2000-01-01 00:00:00';`, {});
    await promisify(table.saveObject)([{ refId: 'U1', payload: 'second' }, { refId: 'U2', payload: 'second' }], bulkOptions);
    const rowList = await promisify(table.getData)('SELECT refId, payload, keep, createdAt FROM <!tableName!> ORDER BY refId;', {});
    assert.deepStrictEqual(rowList.map(({ payload }) => payload), ['second', 'second'], 'rows must be updated');
    assert.deepStrictEqual(rowList.map(({ createdAt }) => createdAt), ['2000-01-01 00:00:00', '2000-01-01 00:00:00'], 'createdAt must survive a re-save');
    assert.strictEqual(rowList[0].keep, 'kept', 'a field absent from the re-saved record must keep its value, as saveObject does');
  });

  await runTest('bulk: a field absent from one record keeps that row\'s stored value even when another record in the batch has it', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkPartialRecord');
    await promisify(table.saveObject)([{ refId: 'P1', note: 'keep me' }, { refId: 'P2', note: 'old' }], bulkOptions);
    await promisify(table.saveObject)([{ refId: 'P1', other: 'x' }, { refId: 'P2', note: 'new' }], bulkOptions);
    const rowList = await promisify(table.getData)('SELECT refId, note FROM <!tableName!> ORDER BY refId;', {});
    assert.deepStrictEqual(rowList.map(({ note }) => note), ['keep me', 'new'], 'P1 did not carry note, so its note must survive');
  });

  await runTest('bulk: a new camelCase field becomes a column with its own spelling', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkColumnCase');
    await promisify(table.saveObject)([{ refId: 'C1', camelCaseField: 'v' }], bulkOptions);
    const columnNameList = (await promisify(table.getData)('PRAGMA table_info(<!tableName!>);', {})).map(({ name }) => name);
    assert(columnNameList.includes('camelCaseField'), `expected column camelCaseField, got: ${columnNameList.join(', ')}`);
  });

  await runTest('bulk: fields that are new to the table become columns, and missing refIds are generated', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkColumns');
    const refIdList = await promisify(table.saveObject)([{ alpha: 'a' }, { beta: 'b', refId: 'GIVEN' }], bulkOptions);
    assert.strictEqual(refIdList.length, 2);
    assert.strictEqual(refIdList[1], 'GIVEN');
    assert(refIdList[0] && refIdList[0] !== 'GIVEN', 'a refId must be generated for the first record');
    const rowList = await promisify(table.getData)('SELECT refId, alpha, beta FROM <!tableName!> ORDER BY alpha DESC;', {});
    assert.deepStrictEqual(rowList.map(({ alpha, beta }) => [alpha, beta]), [['a', null], [null, 'b']]);
  });

  await runTest('bulk + suppressDynamicSchema: camelCase fields are stored, unknown fields dropped, no NULL-refId rows', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkSuppressed');
    await promisify(table.saveObject)({ refId: 'SEED', camelColumn: 'seed' }, {});
    const refIdList = await promisify(table.saveObject)(
      [{ refId: 'B1', camelColumn: 'one', unknownField: 'x' }, { refId: 'B2', camelColumn: 'two' }],
      { bulkInsert: true, suppressDynamicSchema: true },
    );
    assert.deepStrictEqual(refIdList, ['B1', 'B2']);
    const rowList = await promisify(table.getData)('SELECT refId, camelColumn FROM <!tableName!> ORDER BY refId;', {});
    assert.deepStrictEqual(rowList, [{ refId: 'B1', camelColumn: 'one' }, { refId: 'B2', camelColumn: 'two' }, { refId: 'SEED', camelColumn: 'seed' }]);
    const columnNameList = (await promisify(table.getData)('PRAGMA table_info(<!tableName!>);', {})).map(({ name }) => name);
    assert(!columnNameList.includes('unknownField'), 'no column may be added');
  });

  await runTest('bulk + strictSchema: an unknown field refuses the whole list by name, nothing written', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkStrict');
    await promisify(table.saveObject)({ refId: 'SEED', known: 'k' }, {});
    const { err } = await settle(table.saveObject)(
      [{ refId: 'S1', known: 'a' }, { refId: 'S2', surprise: 'b' }],
      { bulkInsert: true, suppressDynamicSchema: true, strictSchema: true },
    );
    assert(/surprise/.test(String(err)), `the error must name the field, got: ${err}`);
    const rowList = await promisify(table.getData)(`SELECT refId FROM <!tableName!> WHERE refId IN ('S1','S2');`, {});
    assert.strictEqual(rowList.length, 0);
  });

  await runTest('bulk: an empty list writes nothing and reports no error, like the row-by-row path', async () => {
    // helix-sync-set saves whatever Helix returned; an empty sync window must not be an error.
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkEmpty');
    const { err, result } = await settle(table.saveObject)([], bulkOptions);
    assert(!err, `an empty bulk list must not be an error, got: ${err}`);
    assert.deepStrictEqual(result, []);
  });

  await runTest('bulk: a non-boolean bulkInsert is refused by name', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('bulkOptionType');
    const { err } = await settle(table.saveObject)([{ refId: 'X' }], { bulkInsert: 'true' });
    assert(/bulkInsert/.test(String(err)), `bulkInsert: 'true' must be refused, got: ${err}`);
  });

  // ---------------------------------------------------------------- synchronous driver, long lists
  // better-sqlite3 calls back before returning, so a pipeRunner over a long list recurses
  // one stack frame chain per item. 10.1 hit 'Maximum call stack size exceeded' at about
  // 250 rows (and reported it as a save error); list paths must not depend on list length.
  await runTest('long list: row-by-row saveObject of 3000 records completes', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('longRowByRow');
    const inputList = Array.from({ length: 3000 }, (unused, index) => ({ refId: `L${index}`, payload: `p${index}` }));
    const { err, result: refIdList } = await settle(table.saveObject)(inputList, {});
    assert(!err, `row-by-row save of 3000 failed: ${String(err).slice(0, 200)}`);
    assert.strictEqual(refIdList.length, 3000);
  });

  await runTest('long list: deleteObject of 3000 refIds completes', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('longDelete');
    const refIdList = Array.from({ length: 3000 }, (unused, index) => `D${index}`);
    await promisify(table.saveObject)(refIdList.map((refId) => ({ refId, payload: 'x' })), bulkOptions);
    const { err, result: deletedList } = await settle(table.deleteObject)(refIdList, {});
    assert(!err, `delete of 3000 failed: ${String(err).slice(0, 200)}`);
    assert.strictEqual(deletedList.length, 3000);
  });

  await runTest('long list: bulk save of 300,000 records (600 batches) completes', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('longBulk');
    const inputList = Array.from({ length: 300000 }, (unused, index) => ({ refId: `B${index}`, payload: 'x' }));
    const { err, result: refIdList } = await settle(table.saveObject)(inputList, bulkOptions);
    assert(!err, `bulk save of 300000 failed: ${String(err).slice(0, 200)}`);
    assert.strictEqual(refIdList.length, 300000);
  });

  await runTest('CONTROL array saveObject WITHOUT bulkInsert keeps the 10.1 row-by-row behavior', async () => {
    const instance = await initTestDbInstance();
    const table = await promisify(instance.getTable)('rowByRow');
    const refIdList = await promisify(table.saveObject)([{ refId: 'Q1', payload: "it's" }, { refId: 'Q2', payload: 'b' }], {});
    assert.deepStrictEqual(refIdList, ['Q1', 'Q2']);
    const rowList = await promisify(table.getData)('SELECT payload FROM <!tableName!> ORDER BY refId;', {});
    assert.deepStrictEqual(rowList.map(({ payload }) => payload), ["it's", 'b']);
  });
};
