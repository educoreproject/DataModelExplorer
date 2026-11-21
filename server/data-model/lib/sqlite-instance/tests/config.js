'use strict';

const path = require('path');

// The module under test is this directory's own sqlite-instance.js. To run the suite
// against another copy (e.g. an older version, to watch a new test go red), name it
// explicitly: SQLITE_INSTANCE_UNDER_TEST=/abs/path/sqlite-instance.js node index.test.js
const modulePathUnderTest = process.env.SQLITE_INSTANCE_UNDER_TEST || path.join(__dirname, '..', 'sqlite-instance.js');

module.exports = {
  testDbPath: `/tmp/sqliteInstanceTests/sqlite-instance-test-${process.pid}.sqlite3`,
  modulePath: modulePathUnderTest,
  moduleDirectory: path.dirname(modulePathUnderTest),
  // Test data
  testTable: 'test_table',
  testObject: {
    name: 'Test Item',
    description: 'This is a test item',
    price: 99.99,
    isActive: true
  },
  testObjects: [
    {
      name: 'Test Item 1',
      description: 'This is test item 1',
      price: 10.99,
      isActive: true
    },
    {
      name: 'Test Item 2',
      description: 'This is test item 2',
      price: 20.99,
      isActive: false
    },
    {
      name: 'Test Item 3',
      description: 'This is test item 3',
      price: 30.99,
      isActive: true
    }
  ]
};
