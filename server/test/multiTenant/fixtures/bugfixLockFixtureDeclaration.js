'use strict';
// bugfixLockFixtureDeclaration.js — campaign P4a. What the BUG-1 lock-lifecycle fixture is, declared once for the tool that
// captures it (captureBugfixLockFixture.js, from a SCRATCH user graph) and the gate that seeds it (bugfix-lock-lifecycle.js).
// The fixture is synthetic by construction: every node it re-creates is a DebugNode named FIXTURE_NODE_NAME_PREFIX<n>;
// the gate refuses a fixture carrying any other user node, so real user data cannot be slipped in under this name.
const path = require('path');

module.exports = Object.freeze({
	FIXTURE_FILE_PATH: path.join(__dirname, 'bugfixLockStateScript.base64.txt'),
	FIXTURE_NODE_COUNT: 2,
	FIXTURE_NODE_LABEL: 'DebugNode',
	FIXTURE_NODE_NAME_PREFIX: '__TEST_bugfixLockFixtureNode',
});
