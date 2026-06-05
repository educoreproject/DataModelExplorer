'use strict';
// Phase 3 seam unit test (T3.1 handle contract, T3.5 lock acquire/release).
// Stubs process.global so the seam runs without booting the full server.
// Run: node server/test/multiTenant/phase3-seam-unit.js

process.global = {
	getConfig: (name) =>
		name === 'dataModelExplorerSearch'
			? {
					neo4jBoltUri: 'bolt://localhost:7706',
					neo4jUser: 'neo4j',
					neo4jPassword: '__TEST_PW__',
			  }
			: {},
	xLog: { status: () => {}, error: () => {} },
};

const seam = require('../../data-model/lib/user-graph/user-graph');

const userRefId = '__TEST_u1';
const versionRefId = '__TEST_v1';
const results = [];
const ok = (name, cond) => results.push([name, !!cond]);

seam.getUserGraph({ userRefId, versionRefId, username: 'tester' }, (err, handle) => {
	ok('T3.1 no error', !err);
	ok('T3.1 handle present', handle);
	ok('T3.1 versionRefId populated', handle && handle.versionRefId === versionRefId);
	ok('T3.1 graphConnection.boltUri usable', handle && handle.graphConnection && handle.graphConnection.boltUri === 'bolt://localhost:7706');
	ok('T3.1 graphConnection.user', handle && handle.graphConnection.user === 'neo4j');
	ok('T3.1 graphConnection.password present', handle && !!handle.graphConnection.password);
	ok('T3.1 containerName null (stub)', handle && handle.containerName === null);
	ok('T3.1 lockToken present', handle && typeof handle.lockToken === 'string' && handle.lockToken.length > 0);
	ok('T3.1 identityMarker.userRefId', handle && handle.identityMarker.userRefId === userRefId);
	ok('T3.1 identityMarker.username', handle && handle.identityMarker.username === 'tester');
	ok('T3.1 identityMarker.versionRefId', handle && handle.identityMarker.versionRefId === versionRefId);
	ok('T3.1 identityMarker.versionName populated', handle && !!handle.identityMarker.versionName);
	ok('T3.5 lock held after get', seam.isLockHeld(userRefId, versionRefId) === true);

	seam.releaseUserGraph(handle, (rErr, rRes) => {
		ok('T3.5 release no error', !rErr);
		ok('T3.5 release reports lockWasHeld', rRes && rRes.lockWasHeld === true);
		ok('T3.5 lock freed after release', seam.isLockHeld(userRefId, versionRefId) === false);

		let allPass = true;
		results.forEach(([n, good]) => {
			if (!good) allPass = false;
			console.log(`${good ? 'PASS' : 'FAIL'} - ${n}`);
		});
		console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL');
		process.exit(allPass ? 0 : 1);
	});
});
