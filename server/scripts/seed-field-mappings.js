#!/usr/bin/env node
'use strict';

// Idempotent seeder for the field_mappings SQLite table. Reads the committed
// snapshot in ./data/field-mappings.data.js and upserts two rows keyed by slug:
// 'specLabels' (spec-id→label lookup) and 'fieldMappings' (crosswalk array).

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const { specLabels, fieldMappings } = require(path.join(__dirname, 'data', 'field-mappings.data.js'));

const defaultDbPath = path.resolve(__dirname, '..', '..', '..', 'dataStores', 'educore_dev.sqlite3');
const dbPath = process.env.EDUCORE_DB_PATH || defaultDbPath;

if (!fs.existsSync(dbPath)) {
	console.error(`seed-field-mappings: database not found at ${dbPath}`);
	process.exit(1);
}

const rows = [
	{ slug: 'specLabels', data: specLabels },
	{ slug: 'fieldMappings', data: fieldMappings },
];

console.log(`seed-field-mappings: using db ${dbPath}`);
console.log(`seed-field-mappings: ${rows.length} slugs to upsert (${fieldMappings.length} mappings)`);

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
		CREATE TABLE IF NOT EXISTS field_mappings (
			[refId] TEXT PRIMARY KEY,
			[slug] TEXT UNIQUE NOT NULL,
			[dataJson] TEXT,
			[createdAt] TEXT,
			[updatedAt] TEXT
		)
	`, []);

	let inserted = 0;
	let updated = 0;

	for (const row of rows) {
		const { slug, data } = row;
		const dataJson = JSON.stringify(data);
		const existing = await get(
			'SELECT refId FROM field_mappings WHERE slug = ?',
			[slug],
		);
		if (existing) {
			await run(
				'UPDATE field_mappings SET dataJson = ?, updatedAt = ? WHERE slug = ?',
				[dataJson, nowIso(), slug],
			);
			updated++;
		} else {
			const refId = makeRefId();
			const now = nowIso();
			await run(
				'INSERT INTO field_mappings (refId, slug, dataJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
				[refId, slug, dataJson, now, now],
			);
			inserted++;
		}
	}

	const tally = await get('SELECT COUNT(*) AS n FROM field_mappings', []);
	console.log(`seed-field-mappings: inserted=${inserted} updated=${updated} total=${tally.n}`);

	await new Promise((resolve) => db.close(resolve));
};

main().catch((err) => {
	console.error('seed-field-mappings failed:', err);
	process.exit(1);
});
