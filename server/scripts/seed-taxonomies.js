#!/usr/bin/env node
'use strict';

// Idempotent seeder for the taxonomies SQLite table. Reads the committed
// snapshot in ./data/taxonomies.data.js and upserts one row per slug.
//
// Slugs today: 'stakeholderTaxonomy', 'useCasesCedsRdf'
// The 'technicalResourcesTaxonomy' export in the source is not used by any
// current consumer so it is not seeded.

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const {
	stakeholderTaxonomy,
	useCasesCedsRdf,
} = require(path.join(__dirname, 'data', 'taxonomies.data.js'));

const defaultDbPath = path.resolve(__dirname, '..', '..', '..', 'dataStores', 'educore_dev.sqlite3');
const dbPath = process.env.EDUCORE_DB_PATH || defaultDbPath;

if (!fs.existsSync(dbPath)) {
	console.error(`seed-taxonomies: database not found at ${dbPath}`);
	process.exit(1);
}

const rows = [
	{ slug: 'stakeholderTaxonomy', data: stakeholderTaxonomy },
	{ slug: 'useCasesCedsRdf', data: useCasesCedsRdf },
];

console.log(`seed-taxonomies: using db ${dbPath}`);
console.log(`seed-taxonomies: ${rows.length} slugs to upsert`);

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
		CREATE TABLE IF NOT EXISTS taxonomies (
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
			'SELECT refId FROM taxonomies WHERE slug = ?',
			[slug],
		);
		if (existing) {
			await run(
				'UPDATE taxonomies SET dataJson = ?, updatedAt = ? WHERE slug = ?',
				[dataJson, nowIso(), slug],
			);
			updated++;
		} else {
			const refId = makeRefId();
			const now = nowIso();
			await run(
				'INSERT INTO taxonomies (refId, slug, dataJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
				[refId, slug, dataJson, now, now],
			);
			inserted++;
		}
	}

	const tally = await get('SELECT COUNT(*) AS n FROM taxonomies', []);
	console.log(`seed-taxonomies: inserted=${inserted} updated=${updated} total=${tally.n}`);

	await new Promise((resolve) => db.close(resolve));
};

main().catch((err) => {
	console.error('seed-taxonomies failed:', err);
	process.exit(1);
});
