'use strict';

// strangerVectorStore — Rosetta's own store, <dataStores>/rosettaJobs.sqlite, created by the API (design 4.5, 4.6). P3 holds two tables. strangerVectorCache: a text's sha256, the embedding model and the vector, NEVER the text, so a resubmission costs no embedding call and an anonymous submission leaves no text behind.
// retrievalTokenDays: the tokens retrieval has spent per UTC day, in the file and not in a process, so a restart resets nothing. Bounded: rows past retentionDays go at every sweep and the oldest past maxRows go with them.
//
//   createStrangerVectorStore({ storeFilePath, maxRows, retentionDays, nowDate, xLog }, callback) → callback('', { readVectors, writeVectors, tokensSpentToday, addTokensToday, sweepNow, rowCount, storeHandle, close })
//     storeHandle: the one handle on this file, which the job store (rosettaJobStore.js) shares rather than opening a second writer
//     readVectors({ textHashList, embeddingModelVersion }, done(err, vectorByTextHash))
//     writeVectors({ vectorRowList: [{ textHash, vector }], embeddingModelVersion }, done(err))
//
// Vectors are Float32, 4 KB a row: at the row cap the file is under a gigabyte. A cached vector is therefore not bit-for-bit what the vendor sent, and is the same every time it is read, which is the property the byte-identity gates need: the vendor's own vectors differ between two calls.

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const OWNER_ONLY_MODE = 0o600;
const MILLISECONDS_PER_DAY = 86400000;
const SQLITE_VARIABLE_BATCH = 400;

const CREATE_STATEMENT_LIST = Object.freeze([
	'CREATE TABLE IF NOT EXISTS strangerVectorCache (textHash TEXT NOT NULL, embeddingModelVersion TEXT NOT NULL, vectorBlob BLOB NOT NULL, lastUsedAtMs INTEGER NOT NULL, PRIMARY KEY (textHash, embeddingModelVersion))',
	'CREATE INDEX IF NOT EXISTS strangerVectorCacheByLastUsed ON strangerVectorCache (lastUsedAtMs)',
	'CREATE TABLE IF NOT EXISTS retrievalTokenDays (utcDay TEXT PRIMARY KEY, tokenCount INTEGER NOT NULL)',
	'CREATE TABLE IF NOT EXISTS judgedTokenDays (utcDay TEXT PRIMARY KEY, tokenCount INTEGER NOT NULL)',
]);

const vectorOfBlob = (vectorBlob) => Array.from(new Float32Array(vectorBlob.buffer, vectorBlob.byteOffset, vectorBlob.length / Float32Array.BYTES_PER_ELEMENT));
const blobOfVector = (vector) => Buffer.from(Float32Array.from(vector).buffer);

const sliceListOf = (itemList, sliceSize) => {
	const sliceList = [];
	for (let startIndex = 0; startIndex < itemList.length; startIndex += sliceSize) {
		sliceList.push(itemList.slice(startIndex, startIndex + sliceSize));
	}
	return sliceList;
};

const eachInTurn = (itemList, workOnOne, done) => {
	const runNext = (itemIndex) => {
		if (itemIndex >= itemList.length) {
			done('');
			return;
		}
		workOnOne(itemList[itemIndex], (workError) => (workError ? done(workError) : runNext(itemIndex + 1)));
	};
	runNext(0);
};

const createStrangerVectorStore = ({ storeFilePath, maxRows, retentionDays, nowDate, xLog }, callback) => {
	const whatAndWhere = `rosetta store ${path.basename(storeFilePath)}`;
	const nowMs = () => nowDate().getTime();
	const utcDayText = () => nowDate().toISOString().slice(0, 10);
	const storeHandle = new sqlite3.Database(storeFilePath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (openError) => {
		if (openError) {
			callback(`${whatAndWhere} would not open: ${openError.message}`);
			return;
		}
		fs.chmod(storeFilePath, OWNER_ONLY_MODE, (chmodError) => {
			if (chmodError) {
				callback(`${whatAndWhere} would not take mode 600: ${chmodError.message}`);
				return;
			}
			eachInTurn(CREATE_STATEMENT_LIST, (oneStatement, next) => storeHandle.run(oneStatement, (runError) => next(runError ? runError.message : '')), (createError) => {
				if (createError) {
					callback(`${whatAndWhere} would not take its tables: ${createError}`);
					return;
				}
				callback('', storeApi);
			});
		});
	});

	const readVectors = ({ textHashList, embeddingModelVersion }, done) => {
		const vectorByTextHash = {};
		eachInTurn(sliceListOf(textHashList, SQLITE_VARIABLE_BATCH), (hashSlice, next) => {
			storeHandle.all(`SELECT textHash, vectorBlob FROM strangerVectorCache WHERE embeddingModelVersion = ? AND textHash IN (${hashSlice.map(() => '?').join(',')})`, [embeddingModelVersion, ...hashSlice], (readError, rowList) => {
				if (readError) {
					next(readError.message);
					return;
				}
				rowList.forEach((oneRow) => { vectorByTextHash[oneRow.textHash] = vectorOfBlob(oneRow.vectorBlob); });
				next('');
			});
		}, (readFault) => {
			if (readFault) {
				done(readFault);
				return;
			}
			// a row in use is young, so the oldest evicted is the least recently used
			eachInTurn(sliceListOf(Object.keys(vectorByTextHash), SQLITE_VARIABLE_BATCH), (hashSlice, next) => {
				storeHandle.run(`UPDATE strangerVectorCache SET lastUsedAtMs = ? WHERE embeddingModelVersion = ? AND textHash IN (${hashSlice.map(() => '?').join(',')})`, [nowMs(), embeddingModelVersion, ...hashSlice], (touchError) => next(touchError ? touchError.message : ''));
			}, (touchFault) => (touchFault ? done(touchFault) : done('', vectorByTextHash)));
		});
	};

	const sweepNow = (done) => {
		const oldestKeptMs = nowMs() - retentionDays * MILLISECONDS_PER_DAY;
		storeHandle.run('DELETE FROM strangerVectorCache WHERE lastUsedAtMs < ?', [oldestKeptMs], (ageError) => {
			if (ageError) {
				done(ageError.message);
				return;
			}
			storeHandle.run('DELETE FROM strangerVectorCache WHERE rowid IN (SELECT rowid FROM strangerVectorCache ORDER BY lastUsedAtMs DESC, rowid DESC LIMIT -1 OFFSET ?)', [maxRows], (capError) => done(capError ? capError.message : ''));
		});
	};

	const writeVectors = ({ vectorRowList, embeddingModelVersion }, done) => {
		eachInTurn(vectorRowList, ({ textHash, vector }, next) => {
			storeHandle.run('INSERT OR REPLACE INTO strangerVectorCache (textHash, embeddingModelVersion, vectorBlob, lastUsedAtMs) VALUES (?, ?, ?, ?)', [textHash, embeddingModelVersion, blobOfVector(vector), nowMs()], (writeError) => next(writeError ? writeError.message : ''));
		}, (writeFault) => (writeFault ? done(writeFault) : sweepNow(done)));
	};

	const tokensSpentToday = (done) => storeHandle.get('SELECT tokenCount FROM retrievalTokenDays WHERE utcDay = ?', [utcDayText()], (readError, oneRow) => (readError ? done(readError.message) : done('', oneRow ? oneRow.tokenCount : 0)));

	const addTokensToday = (tokenCount, done) => storeHandle.run('INSERT INTO retrievalTokenDays (utcDay, tokenCount) VALUES (?, ?) ON CONFLICT (utcDay) DO UPDATE SET tokenCount = tokenCount + excluded.tokenCount', [utcDayText(), tokenCount], (writeError) => done(writeError ? writeError.message : ''));

	// the judged step counts its own: an open retrieval spending its ceiling must not stop a job somebody signed in for (design 4.2)
	const judgedTokensSpentToday = (done) => storeHandle.get('SELECT tokenCount FROM judgedTokenDays WHERE utcDay = ?', [utcDayText()], (readError, oneRow) => (readError ? done(readError.message) : done('', oneRow ? oneRow.tokenCount : 0)));
	const addJudgedTokensToday = (tokenCount, done) => storeHandle.run('INSERT INTO judgedTokenDays (utcDay, tokenCount) VALUES (?, ?) ON CONFLICT (utcDay) DO UPDATE SET tokenCount = tokenCount + excluded.tokenCount', [utcDayText(), tokenCount], (writeError) => done(writeError ? writeError.message : ''));

	const rowCount = (done) => storeHandle.get('SELECT count(*) AS rowCount FROM strangerVectorCache', [], (readError, oneRow) => (readError ? done(readError.message) : done('', oneRow.rowCount)));

	const close = (done) => storeHandle.close((closeError) => {
		if (closeError) {
			xLog.error(`${whatAndWhere} would not close: ${closeError.message}`);
		}
		done();
	});

	const storeApi = { readVectors, writeVectors, tokensSpentToday, addTokensToday, judgedTokensSpentToday, addJudgedTokensToday, sweepNow, rowCount, storeHandle, close };
};

module.exports = { createStrangerVectorStore };
