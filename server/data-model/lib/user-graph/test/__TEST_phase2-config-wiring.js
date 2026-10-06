#!/usr/bin/env node
'use strict';

// __TEST_phase2-config-wiring.js — Phase 2 NON-DESTRUCTIVE proof of the config wiring.
// Proves the data path clone-manager now relies on, WITHOUT provisioning a clone (which would
// quiesce the live golden): the real dataModelExplorerSearch.ini supplies goldenContainerName,
// and the resolver derives the password/boltUri from that name alone. (The full end-to-end
// clone-provision proof is the multiTenant phase suites'.) Re-pointed W-E-11 (campaign P1, 2026-10-06): it used to
// expect a retired container, its port and its password as literals; the expectation is now the declaration itself.
//
// Run: node __TEST_phase2-config-wiring.js

const path = require('path');

const { readGoldenContainerName } = require('../../../../test/lib/goldenContainerName');

let failures = 0;
const check = (label, actual, expected) => {
	const ok = actual === expected;
	if (!ok) { failures += 1; }
	console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// Load the REAL config exactly as the CLI tool's loadConfig does (qtools-config-file-processor).
const configFileProcessor = require('qtools-config-file-processor');
const configDirPath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'configs', 'instanceSpecific', 'qbook') + '/';
const rawConfig = configFileProcessor.getConfig('dataModelExplorerSearch.ini', configDirPath);
const config = rawConfig.dataModelExplorerSearch;

console.log('Phase 2 — config -> name -> resolver wiring:');
check('config exposes the declared goldenContainerName (_goldenContainer.ini)', config && config.goldenContainerName, readGoldenContainerName());

const { resolveContainerConnection } = require('../container-connection-resolver');
const conn = resolveContainerConnection(config.goldenContainerName);
check('resolver error is null', conn.error, null);
check('resolver boltUri (derived from name) is a localhost bolt URI', /^bolt:\/\/localhost:\d+$/.test(String(conn.boltUri)), true);
check('resolver user (derived from name)', conn.user, 'neo4j');
check('resolver password derived from the name (non-empty; never printed)', typeof conn.password === 'string' && conn.password.length > 0, true);

console.log(`\nRESULT: ${failures === 0 ? 'ALL GREEN' : `${failures} FAILURE(S)`}.`);
process.exit(failures === 0 ? 0 : 1);
