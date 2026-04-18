#!/usr/bin/env node
'use strict';

// Idempotent seeder for the standard_dossier SQLite table. Reads the committed
// snapshot in ./data/library-entries.data.js and upserts one row per entry keyed
// by standardId. Re-running is a no-op because INSERT OR REPLACE keeps the same
// refId when one already exists for that standardId.
//
// Usage (from educore repo root):
//   node system/code/server/scripts/seed-standard_dossier.js
//
// Env override:
//   EDUCORE_DB_PATH — SQLite file path (default: dataStores/educore_dev.sqlite3 relative to system/)

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const entries = require(path.join(__dirname, 'data', 'library-entries.data.js'));

const defaultDbPath = path.resolve(__dirname, '..', '..', '..', 'dataStores', 'educore_dev.sqlite3');
const dbPath = process.env.EDUCORE_DB_PATH || defaultDbPath;

if (!fs.existsSync(dbPath)) {
	console.error(`seed-standard_dossier: database not found at ${dbPath}`);
	console.error('Run the API once to create it, or set EDUCORE_DB_PATH to the correct location.');
	process.exit(1);
}

console.log(`seed-standard_dossier: using db ${dbPath}`);
console.log(`seed-standard_dossier: ${entries.length} entries to upsert`);

const db = new sqlite3.Database(dbPath);

const nowIso = () => new Date().toISOString();

// Generate refIds compatible with the rest of the app's scheme: 20 alphanumerics,
// excluding look-alikes 0 O 1 l (see server/data-model/new-refid).
const EXCLUDED = new Set(['0', 'O', '1', 'l']);
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const makeRefId = () => {
	let s = '';
	while (s.length < 20) {
		const ch = ALPHABET[crypto.randomInt(ALPHABET.length)];
		if (!EXCLUDED.has(ch)) s += ch;
	}
	return s;
};

const run = (sql, params) => new Promise((resolve, reject) => {
	db.run(sql, params, function (err) {
		if (err) reject(err);
		else resolve(this);
	});
});

const get = (sql, params) => new Promise((resolve, reject) => {
	db.get(sql, params, (err, row) => {
		if (err) reject(err);
		else resolve(row);
	});
});

const main = async () => {
	await run(`
		CREATE TABLE IF NOT EXISTS standard_dossier (
			[refId] TEXT PRIMARY KEY,
			[standardId] TEXT UNIQUE NOT NULL,
			[dataJson] TEXT,
			[createdAt] TEXT,
			[updatedAt] TEXT
		)
	`, []);

	let inserted = 0;
	let updated = 0;

	for (const entry of entries) {
		const standardId = entry.id;
		if (!standardId) {
			console.warn('  skipping entry with no id:', Object.keys(entry).slice(0, 4));
			continue;
		}

		const { id: _id, ...rest } = entry;
		const dataJson = JSON.stringify(rest);
		const existing = await get(
			'SELECT refId FROM standard_dossier WHERE standardId = ?',
			[standardId],
		);

		if (existing) {
			await run(
				'UPDATE standard_dossier SET dataJson = ?, updatedAt = ? WHERE standardId = ?',
				[dataJson, nowIso(), standardId],
			);
			updated++;
		} else {
			const refId = makeRefId();
			const now = nowIso();
			await run(
				'INSERT INTO standard_dossier (refId, standardId, dataJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
				[refId, standardId, dataJson, now, now],
			);
			inserted++;
		}
	}

	const row = await get('SELECT COUNT(*) AS n FROM standard_dossier', []);
	console.log(`seed-standard_dossier: inserted=${inserted} updated=${updated} total=${row.n}`);

	await new Promise((resolve) => db.close(resolve));
};

main().catch((err) => {
	console.error('seed-standard_dossier failed:', err);
	process.exit(1);
});
