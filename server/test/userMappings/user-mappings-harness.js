#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
//
// End-to-end harness for the user-mapping access points against a THROWAWAY
// SQLite file, using the server's real sqlite-instance, data-mapping, and
// access-point modules. No config file, no network, no Neo4j.
//
//   cd /home/educore/system/code && node server/test/userMappings/user-mappings-harness.js
//
// Exit code 0 and "ALL PASSED" means the table, upsert, shared listing, review
// workflow, admin delete, and all three export formats behave. Pass --keep to
// leave the temp database behind for inspection with the sqlite3 CLI (the path
// is printed).
//
// On Windows dev boxes sqlite3 may not resolve from the repo; point NODE_PATH at
// a node_modules that has it:  NODE_PATH=/path/to/node_modules node …

const path = require('path');
const fs = require('fs');
const os = require('os');

const SERVER = path.resolve(__dirname, '..', '..');
const DM = path.join(SERVER, 'data-model');
const KEEP = process.argv.includes('--keep');

// The server modules read their logger/config from process.global.
process.global = {
	xLog: {
		status: () => {},
		error: (m) => (String(m).includes('HACKED') ? null : console.log('[xLog.error]', m)),
	},
	getConfig: () => ({}),
	rawConfig: {},
	commandLineParameters: {},
};

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dme-user-mappings-')), 'harness.sqlite');
console.log('temp database:', dbFile);

const dataMapping = require(path.join(DM, 'data-mapping', 'data-mapping.js'))({});
const { initDatabaseInstance } = require(path.join(DM, 'lib', 'sqlite-instance', 'sqlite-instance.js'))({});
const { renderExport } = require(path.join(DM, 'lib', 'dme-user-mapping-export.js'));

// Access points register themselves into a dotD library; capture them by basename
// (the module's own name computation keeps a full path on Windows).
const lib = {};
const dotD = { logList: [], library: { add: (name, fn) => (lib[path.basename(name).replace(/\.js$/, '')] = fn) } };

let failures = 0;
const ok = (cond, msg, detail) => {
	console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
	if (!cond) {
		failures++;
		if (detail !== undefined) console.log('     detail:', typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail, null, 1).slice(0, 1500));
	}
};
const call = (name, input) =>
	new Promise((resolve) => lib[name](input, (err, result) => resolve({ err, result })));

async function main(sqlDb) {
	const passThroughParameters = { sqlDb, dataMapping, hxAccess: {} };
	for (const op of ['save', 'list', 'delete', 'review', 'export']) {
		require(path.join(DM, 'access-points-dot-d', 'accessPoints.d', `dme-user-mapping-${op}.js`))({
			dotD,
			passThroughParameters,
		});
	}

	// Two users, so proposer names and ownership can be checked.
	await new Promise((resolve) =>
		sqlDb.getTable('users', (err, users) => {
			users.saveObject(
				[
					{ refId: 'userAlice', username: 'alice', first: 'Alice', last: 'Analyst', role: 'user' },
					{ refId: 'userTq', username: 'tq', first: 'TQ', last: 'White', role: 'admin' },
				],
				{ suppressStatementLog: true },
				() => resolve(),
			);
		}),
	);

	// --- save (alice proposes two mappings) -------------------------------------
	let r = await call('dme-user-mapping-save', {
		userRefId: 'userAlice',
		mappings: [
			{
				mappingKey: 'LIF::Person.Name.firstName',
				sourceStandard: 'LIF', sourceName: 'firstName', sourcePath: 'Person.Name.firstName',
				targetStandard: 'CEDS', targetName: 'First Name', targetSourceId: 'P000115',
				rel: 'CLOSE_MATCH', transformType: 'direct',
			},
			{
				mappingKey: 'I.G.1',
				sourceStandard: 'JEDx', sourceName: 'Legal Name',
				targetStandard: 'HR Open', targetName: 'LegalName', rel: 'crosswalk',
				transformType: 'valueMap', transformRule: "Y => true\nN => false\n'quoted' => \"x\"", transformNotes: "O'Brien; -- ok",
			},
		],
	});
	ok(!r.err, `save: ${r.err || 'ok'}`);
	ok(r.result.length === 2, `save returned 2 rows (${r.result.length})`);
	const lif = r.result.find((x) => x.sourceStandard === 'LIF');
	const jedx = r.result.find((x) => x.sourceStandard === 'JEDx');
	ok(lif.status === 'proposed', `new row is 'proposed' (${lif.status})`);
	ok(lif.proposedBy === 'Alice Analyst' && lif.mine === true, `proposer resolved to a name (${lif.proposedBy}), mine=${lif.mine}`, lif);
	ok(jedx.transformRule.includes("'quoted'") && jedx.transformNotes === "O'Brien; -- ok", 'apostrophes / newlines round-trip');

	// --- shared listing -----------------------------------------------------------
	r = await call('dme-user-mapping-list', { userRefId: 'userTq', scope: 'all' });
	ok(!r.err && r.result.length === 2, `scope=all: TQ sees alice's 2 proposals (${r.result.length})`);
	ok(r.result.every((x) => x.mine === false && x.proposedBy === 'Alice Analyst'), 'rows flagged not-mine with proposer name');
	r = await call('dme-user-mapping-list', { userRefId: 'userTq' });
	ok(!r.err && r.result.length === 0, 'scope=mine: TQ has none of his own');
	r = await call('dme-user-mapping-list', { userRefId: 'userTq', scope: 'all', status: 'bogus' });
	ok(!!r.err, `bad status rejected: ${r.err}`);

	// --- review (admin accepts one, rejects the other) --------------------------
	r = await call('dme-user-mapping-review', { reviewerRefId: 'userTq', refId: lif.refId, status: 'accepted', note: 'matches CEDS First Name' });
	ok(!r.err && r.result.status === 'accepted' && r.result.reviewedByName === 'TQ White', `accept: status=${r.result && r.result.status}, by ${r.result && r.result.reviewedByName}`);
	r = await call('dme-user-mapping-review', { reviewerRefId: 'userTq', refId: jedx.refId, status: 'rejected' });
	ok(!r.err && r.result.status === 'rejected', 'reject works');
	r = await call('dme-user-mapping-review', { reviewerRefId: 'userTq', refId: 'nope', status: 'accepted' });
	ok(!!r.err, `unknown refId rejected: ${r.err}`);

	// owner re-save must not clobber the review
	r = await call('dme-user-mapping-save', {
		userRefId: 'userAlice',
		mappings: [{ mappingKey: 'LIF::Person.Name.firstName', targetStandard: 'CEDS', targetName: 'First Name', transformType: 'rename', transformRule: 'person.firstName' }],
	});
	ok(!r.err && r.result[0].refId === lif.refId && r.result[0].status === 'accepted' && r.result[0].transformType === 'rename',
		`owner re-save keeps refId + accepted status, updates rule (${r.result[0].status}, ${r.result[0].transformType})`);

	// --- export -------------------------------------------------------------------
	r = await call('dme-user-mapping-export', { format: 'cypher', status: 'accepted' });
	ok(!r.err && r.result.count === 1, `cypher export of accepted rows: ${r.result.count} row`);
	ok(r.result.content.includes('MERGE (s)-[r:PROPOSED_MATCH {proposalId: "' + lif.refId + '"}]->(t)'), 'cypher MERGE carries proposalId', r.result.content);
	ok(r.result.content.includes('s.path = "Person.Name.firstName"') && r.result.content.includes('t.stableId = "P000115"'), 'cypher resolves by path / stable id');
	ok(r.result.content.includes('r.proposedBy = "Alice Analyst"') && r.result.content.includes('r.transformRule = "person.firstName"'), 'cypher carries proposer + rule');
	ok(r.result.filename.endsWith('.cypher') && r.result.mimeType === 'text/plain', `filename ${r.result.filename}`);

	r = await call('dme-user-mapping-export', { format: 'cypher', status: 'all' });
	ok(r.result.count === 2 && r.result.content.includes('// SKIPPED ' + jedx.refId) && r.result.content.includes('HR Open is not in the graph'), 'cypher skips HR Open row with a comment');

	r = await call('dme-user-mapping-export', { format: 'csv', status: 'all' });
	const lines = r.result.content.split('\r\n');
	ok(lines[0].startsWith('refId,status,sourceStandard') && lines.length === 3, `csv header + 2 rows (${lines.length - 1})`);
	ok(r.result.content.includes('"Y => true\nN => false'), 'csv quotes the multi-line rule');

	r = await call('dme-user-mapping-export', { format: 'json', status: 'rejected' });
	const parsed = JSON.parse(r.result.content);
	ok(parsed.mappingCount === 1 && parsed.mappings[0].status === 'rejected' && parsed.mappings[0].proposedBy === 'Alice Analyst', 'json export filters by status and names proposer');

	r = await call('dme-user-mapping-export', { format: 'xml' });
	ok(!!r.err, `bad format rejected: ${r.err}`);

	// --- delete: owner-only unless admin ------------------------------------------
	r = await call('dme-user-mapping-delete', { userRefId: 'userTq', refId: lif.refId });
	r = await call('dme-user-mapping-list', { userRefId: 'userTq', scope: 'all' });
	ok(r.result.length === 2, 'non-owner delete without admin flag is a no-op');
	r = await call('dme-user-mapping-delete', { userRefId: 'userTq', isAdmin: true, refId: lif.refId });
	r = await call('dme-user-mapping-list', { userRefId: 'userTq', scope: 'all' });
	ok(r.result.length === 1, 'admin delete removes another user\'s row');
	r = await call('dme-user-mapping-delete', { userRefId: 'userAlice', mappingKey: 'I.G.1', targetStandard: 'HR Open', targetName: 'LegalName' });
	r = await call('dme-user-mapping-list', { userRefId: 'userAlice', scope: 'all' });
	ok(r.result.length === 0, 'owner delete by identity');

	// --- pure export renderer, no DB ---------------------------------------------
	const rendered = renderExport([], { format: 'cypher', statusFilter: 'accepted' });
	ok(rendered.content.startsWith('// EDUcore Schema Verifier') && rendered.content.includes('0 row(s)'), 'renderer handles an empty set');

	console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
	if (!KEEP) {
		try { fs.rmSync(path.dirname(dbFile), { recursive: true, force: true }); } catch (_) {}
	} else {
		console.log(`kept: sqlite3 "${dbFile}" "SELECT refId,status,sourceStandard,sourceName,targetStandard,targetName FROM dme_user_mappings;"`);
	}
	process.exit(failures ? 1 : 0);
}

initDatabaseInstance(dbFile, (err, sqlDb) => {
	if (err) {
		console.error(err);
		process.exit(1);
	}
	main(sqlDb).catch((e) => {
		console.error(e);
		process.exit(1);
	});
});
