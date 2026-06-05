'use strict';
// Phase 9 (T9.6) — clone-cost validation. Reports the data volume's filesystem, whether
// reflink/CoW copies are available there, and the measured clone TIME + disk-per-clone.
// On dev macOS the data volume is APFS (clonefile available) BUT the design uses PLAIN
// copies (so the dev number reflects the prod copy cost); on a prod XFS volume reflink is
// validated here separately as a disk optimization.
//
// Run: node server/test/multiTenant/validate-clone.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

process.global = {
	getConfig: (name) => name === 'dataModelExplorerSearch'
		? { neo4jBoltUri: 'bolt://localhost:7706', neo4jUser: 'neo4j', neo4jPassword: '99d0615d205eead0ea65b3f642ffb3d5' }
		: {},
	xLog: { status: () => {}, error: (m) => console.error('xLog.error:', m) },
};

const cloneManager = require('../../data-model/lib/user-graph/clone-manager');

const userGraphsBase = cloneManager.getUserGraphsBase();
const volume = userGraphsBase.split('/dataStores/')[0];

// Filesystem of the data volume
let fsType = 'unknown';
try {
	fsType = execSync(`df -T 2>/dev/null "${volume}" | tail -1 | awk '{print $2}'`, { encoding: 'utf-8' }).trim();
} catch (e) {}
if (!fsType || fsType === 'unknown') {
	try { fsType = execSync(`df "${volume}" | tail -1 | awk '{print $1}'`, { encoding: 'utf-8' }).trim() + ' (macOS — APFS)'; } catch (e) {}
}

// Reflink / CoW availability: try a clonefile copy of a probe file.
let reflinkAvailable = false;
try {
	const a = path.join(os.tmpdir(), 'ruby_reflink_probe_a');
	const b = path.join(os.tmpdir(), 'ruby_reflink_probe_b');
	fs.writeFileSync(a, 'probe');
	try { execSync(`cp -c "${a}" "${b}" 2>/dev/null`); reflinkAvailable = fs.existsSync(b); } catch (e) { reflinkAvailable = false; }
	try { fs.unlinkSync(a); } catch (e) {}
	try { fs.unlinkSync(b); } catch (e) {}
} catch (e) {}

const dirSizeBytes = (dir) => {
	try { return parseInt(execSync(`du -sk "${dir}" 2>/dev/null | awk '{print $1}'`, { encoding: 'utf-8' }).trim(), 10) * 1024; }
	catch (e) { return 0; }
};

console.log('=== Clone-cost validation ===');
console.log('data volume     :', volume);
console.log('filesystem      :', fsType);
console.log('reflink/CoW (cp -c) available:', reflinkAvailable, '(design uses PLAIN copies regardless)');
console.log('provisioning a probe clone (timed)...');

const t0 = Date.now();
cloneManager.provisionClone({ userRefId: '__TEST_validate', versionRefId: 'probe' }, (err, d) => {
	if (err) { console.error('PROVISION FAILED:', err); process.exit(1); }
	const cloneSeconds = (Date.now() - t0) / 1000;
	const diskBytes = dirSizeBytes(d.cloneDir);
	const diskGB = (diskBytes / (1024 * 1024 * 1024)).toFixed(2);
	console.log('clone time      :', cloneSeconds.toFixed(1), 's');
	console.log('disk per clone  :', diskGB, 'GB', `(${d.cloneDir})`);
	console.log('container       :', d.containerName, '->', d.boltUri);
	cloneManager.teardownClone({ containerName: d.containerName, cloneDir: d.cloneDir }, () => {
		console.log('probe clone torn down.');
		console.log('VALIDATION_OK');
		process.exit(0);
	});
});
