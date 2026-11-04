'use strict';
// rosetta-store.test.js — Rosetta's own store holds what it says and no more (design 4.5, 4.6): eviction past the row cap, age past retention, the day's tokens, and refusal when the file cannot open. Needs no graph.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStrangerVectorStore } = require('../lib/standards-query/rosetta/strangerVectorStore');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rosettaStore-'));
const MODEL_NAME = 'voyage-4-large';
const vectorOf = (firstNumber) => [firstNumber, 0.25, -0.5];
let currentMs = Date.parse('2026-11-04T12:00:00Z');
const nowDate = () => new Date(currentMs);
const xLog = { error() {} };

createStrangerVectorStore({ storeFilePath: path.join(scratchDirPath, 'rosettaJobs.sqlite'), maxRows: 3, retentionDays: 30, nowDate, xLog }, (openError, store) => {
	ok('opens', !openError, openError);
	ok('mode 600', (fs.statSync(path.join(scratchDirPath, 'rosettaJobs.sqlite')).mode & 0o777) === 0o600);
	store.writeVectors({ vectorRowList: [{ textHash: 'a', vector: vectorOf(0.5) }, { textHash: 'b', vector: vectorOf(0.75) }], embeddingModelVersion: MODEL_NAME }, (writeError) => {
		ok('writes', !writeError, writeError);
		store.readVectors({ textHashList: ['a', 'b', 'c'], embeddingModelVersion: MODEL_NAME }, (readError, vectorByTextHash) => {
			ok('reads what it wrote, and only what it holds', !readError && JSON.stringify(vectorByTextHash.a) === JSON.stringify(vectorOf(0.5)) && vectorByTextHash.c === undefined);
			store.readVectors({ textHashList: ['a'], embeddingModelVersion: 'anotherModel' }, (otherError, otherVectorByTextHash) => {
				ok('a vector of another model is no vector', Object.keys(otherVectorByTextHash).length === 0);
				currentMs += 1000;
				store.readVectors({ textHashList: ['a'], embeddingModelVersion: MODEL_NAME }, () => {
					currentMs += 1000;
					store.writeVectors({ vectorRowList: [{ textHash: 'c', vector: vectorOf(1) }, { textHash: 'd', vector: vectorOf(1) }], embeddingModelVersion: MODEL_NAME }, () => {
						store.rowCount((countError, rowCount) => {
							ok('never past the row cap', rowCount === 3, `${rowCount}`);
							store.readVectors({ textHashList: ['a', 'b', 'c', 'd'], embeddingModelVersion: MODEL_NAME }, (afterError, afterVectorByTextHash) => {
								ok('the least recently used went; a row read stayed', afterVectorByTextHash.b === undefined && afterVectorByTextHash.a !== undefined);
								currentMs += 31 * 86400000;
								store.sweepNow((sweepError) => {
									store.rowCount((ageCountError, ageRowCount) => {
										ok('past retention, the sweep takes them', !sweepError && ageRowCount === 0, `${ageRowCount}`);
										store.tokensSpentToday((spentError, tokensBefore) => {
											ok('a new day starts at nothing', tokensBefore === 0);
											store.addTokensToday(5, () => store.addTokensToday(7, () => store.tokensSpentToday((secondSpentError, tokensAfter) => {
												ok('the day adds up', tokensAfter === 12);
												currentMs += 86400000;
												store.tokensSpentToday((thirdSpentError, tokensNextDay) => {
													ok('and the next day starts afresh', tokensNextDay === 0);
													store.close(() => {
														createStrangerVectorStore({ storeFilePath: path.join(scratchDirPath, 'noSuchDirectory', 'x.sqlite'), maxRows: 3, retentionDays: 30, nowDate, xLog }, (badOpenError) => {
															ok('a store that cannot open says so', /would not open/.test(String(badOpenError)), badOpenError);
															fs.rmSync(scratchDirPath, { recursive: true, force: true });
															console.log(`\nrosetta-store: ${passedCount} passed, ${failedCount} failed`);
															process.exit(failedCount === 0 ? 0 : 1);
														});
													});
												});
											})));
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});
});
