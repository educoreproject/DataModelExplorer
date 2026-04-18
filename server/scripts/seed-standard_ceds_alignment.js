#!/usr/bin/env node
'use strict';

// Idempotent seeder for the standard_ceds_alignment SQLite table. Reads the
// committed snapshot in ./data/ceds-alignment.data.js and upserts one row per
// alignment entry keyed by entryId. Re-runs are a no-op.
//
// Usage (from educore repo root):
//   node system/code/server/scripts/seed-standard_ceds_alignment.js
//
// Env override:
//   EDUCORE_DB_PATH — SQLite file path

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const { cedsDomains, cedsAlignmentMatrix } = require(path.join(__dirname, 'data', 'ceds-alignment.data.js'));

const defaultDbPath = path.resolve(__dirname, '..', '..', '..', 'dataStores', 'educore_dev.sqlite3');
const dbPath = process.env.EDUCORE_DB_PATH || defaultDbPath;

if (!fs.existsSync(dbPath)) {
	console.error(`seed-standard_ceds_alignment: database not found at ${dbPath}`);
	process.exit(1);
}

console.log(`seed-standard_ceds_alignment: using db ${dbPath}`);
console.log(`seed-standard_ceds_alignment: ${cedsAlignmentMatrix.length} entries, ${cedsDomains.length} domains`);

const db = new sqlite3.Database(dbPath);

const nowIso = () => new Date().toISOString();

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
		CREATE TABLE IF NOT EXISTS standard_ceds_alignment (
			[refId] TEXT PRIMARY KEY,
			[slug] TEXT UNIQUE NOT NULL,
			[dataJson] TEXT,
			[createdAt] TEXT,
			[updatedAt] TEXT
		)
	`, []);

	// The domains catalog lives in the same table as a single row keyed
	// by slug='__domains'. The alignment matrix rows use slug=entryId.
	// This keeps one physical table behind /api/standards/alignment instead
	// of two parallel tables that always load together.

	let inserted = 0;
	let updated = 0;

	const rows = [
		{ slug: '__domains', data: cedsDomains },
		...cedsAlignmentMatrix.map((entry) => ({ slug: entry.entryId, data: entry })),
	];

	for (const row of rows) {
		const { slug, data } = row;
		if (!slug) {
			console.warn('  skipping entry with no slug');
			continue;
		}
		const dataJson = JSON.stringify(data);
		const existing = await get(
			'SELECT refId FROM standard_ceds_alignment WHERE slug = ?',
			[slug],
		);
		if (existing) {
			await run(
				'UPDATE standard_ceds_alignment SET dataJson = ?, updatedAt = ? WHERE slug = ?',
				[dataJson, nowIso(), slug],
			);
			updated++;
		} else {
			const refId = makeRefId();
			const now = nowIso();
			await run(
				'INSERT INTO standard_ceds_alignment (refId, slug, dataJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
				[refId, slug, dataJson, now, now],
			);
			inserted++;
		}
	}

	const tally = await get('SELECT COUNT(*) AS n FROM standard_ceds_alignment', []);
	console.log(`seed-standard_ceds_alignment: inserted=${inserted} updated=${updated} total=${tally.n}`);

	await new Promise((resolve) => db.close(resolve));
};

main().catch((err) => {
	console.error('seed-standard_ceds_alignment failed:', err);
	process.exit(1);
});
