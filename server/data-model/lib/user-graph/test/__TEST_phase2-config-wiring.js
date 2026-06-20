#!/usr/bin/env node
'use strict';

// __TEST_phase2-config-wiring.js — Phase 2 NON-DESTRUCTIVE proof of the config wiring.
// Proves the data path clone-manager now relies on, WITHOUT provisioning a clone (which would
// quiesce the live golden): the real dataModelExplorerSearch.ini supplies goldenContainerName,
// and the resolver derives the password/boltUri from that name alone. (The full end-to-end
// clone-provision proof is separately BLOCKED because gf_golden uses a docker NAMED VOLUME,
// not a host bind mount, so the host-side `cp -R` clone source path does not exist on macOS —
// a pre-existing infra divergence, escalated to CORAL_LOOM.)
//
// Run: node __TEST_phase2-config-wiring.js

const path = require('path');

const EXPECTED = {
	goldenContainerName: 'gf_golden',
	boltUri: 'bolt://localhost:7704',
	user: 'neo4j',
	password: 'ibirNVH_7i0wHM62ERdApt2rJmfL__LSmfKMDyxPjk4',
};

let failures = 0;
const check = (label, actual, expected) => {
	const ok = actual === expected;
	if (!ok) { failures += 1; }
	console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// Load the REAL config exactly as the CLI tool's loadConfig does (qtools-config-file-processor).
const configFileProcessor = require('qtools-config-file-processor');
const configDirPath = '/Users/tqwhite/Documents/webdev/educore/system/configs/instanceSpecific/qbook/';
const rawConfig = configFileProcessor.getConfig('dataModelExplorerSearch.ini', configDirPath);
const config = rawConfig.dataModelExplorerSearch;

console.log('Phase 2 — config -> name -> resolver wiring:');
check('config exposes goldenContainerName', config && config.goldenContainerName, EXPECTED.goldenContainerName);

const { resolveContainerConnection } = require('../container-connection-resolver');
const conn = resolveContainerConnection(config.goldenContainerName);
check('resolver error is null', conn.error, null);
check('resolver boltUri (derived from name)', conn.boltUri, EXPECTED.boltUri);
check('resolver user (derived from name)', conn.user, EXPECTED.user);
check('resolver password (derived from name == getGoldenPassword path)', conn.password, EXPECTED.password);

console.log(`\nRESULT: ${failures === 0 ? 'ALL GREEN' : `${failures} FAILURE(S)`}.`);
process.exit(failures === 0 ? 0 : 1);
