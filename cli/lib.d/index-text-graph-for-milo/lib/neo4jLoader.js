'use strict';

// neo4jLoader.js — Load embedded chunks into Neo4j container
// Creates Chunk nodes with vector embeddings and writes JSONL for human inspection.

const fs = require('fs');
const path = require('path');

const BATCH_SIZE = 100;

// ---------------------------------------------------------------------
// writeJsonl — Write chunks to JSONL file (no embeddings, human-readable)

const writeJsonl = (chunks, jsonlPath) => {
	const lines = chunks.map(chunk => {
		return JSON.stringify({
			text: chunk.text,
			label: chunk.label,
			sourceFile: chunk.sourceFile,
			startLine: chunk.startLine,
		});
	});
	fs.writeFileSync(jsonlPath, lines.join('\n') + '\n');
};

// ---------------------------------------------------------------------
// loadChunks — Load embedded chunks into Neo4j and write JSONL

const loadChunks = ({ embeddedChunks, boltUri, neo4jUser, neo4jPassword, outDirPath }, callback) => {
	const { xLog } = process.global;

	// Write JSONL first (synchronous, no embeddings)
	const jsonlPath = path.join(outDirPath, 'chunks.jsonl');
	writeJsonl(embeddedChunks, jsonlPath);
	xLog.status(`[neo4jLoader] Wrote ${embeddedChunks.length} chunks to chunks.jsonl`);

	// Load Neo4j driver and connect
	let neo4j, driver, session;
	try {
		neo4j = require('neo4j-driver');
		driver = neo4j.driver(boltUri, neo4j.auth.basic(neo4jUser, neo4jPassword));
		session = driver.session();
	} catch (err) {
		callback(`Neo4j connection failed: ${err.message}`);
		return;
	}

	// Clear existing chunks, then batch insert, then verify
	// Using .then()/.catch() to wrap promises into callback flow
	session.run('MATCH (c:Chunk) DETACH DELETE c')
		.then(() => {
			xLog.status('[neo4jLoader] Cleared existing Chunk nodes');

			// Batch insert
			const batches = [];
			for (let i = 0; i < embeddedChunks.length; i += BATCH_SIZE) {
				batches.push(embeddedChunks.slice(i, i + BATCH_SIZE));
			}

			let batchIndex = 0;

			const processNextBatch = () => {
				if (batchIndex >= batches.length) {
					// All batches loaded — verify and create index
					verifyAndFinish();
					return;
				}

				const batch = batches[batchIndex];
				const batchData = batch.map((chunk, idx) => ({
					chunkId: `chunk_${batchIndex * BATCH_SIZE + idx}`,
					text: chunk.text,
					label: chunk.label,
					sourceFile: chunk.sourceFile,
					startLine: parseInt(chunk.startLine, 10) || 0,
					embedding: chunk.embedding,
				}));

				session.run(
					`UNWIND $chunks AS chunk
					 CREATE (c:Chunk {
						 chunkId: chunk.chunkId,
						 text: chunk.text,
						 label: chunk.label,
						 sourceFile: chunk.sourceFile,
						 startLine: chunk.startLine,
						 embedding: chunk.embedding
					 })`,
					{ chunks: batchData }
				)
					.then(() => {
						xLog.status(`[neo4jLoader] Loaded batch ${batchIndex + 1}/${batches.length}`);
						batchIndex++;
						processNextBatch();
					})
					.catch((batchErr) => {
						cleanup(`Batch ${batchIndex + 1} insert failed: ${batchErr.message}`);
					});
			};

			const verifyAndFinish = () => {
				// Create/verify vector index
				session.run(`
					CREATE VECTOR INDEX chunk_vector_index IF NOT EXISTS
					FOR (c:Chunk) ON (c.embedding)
					OPTIONS {indexConfig: {
						\`vector.dimensions\`: 1024,
						\`vector.similarity_function\`: 'cosine'
					}}
				`)
					.then(() => {
						// Verify count
						return session.run('MATCH (c:Chunk) RETURN count(c) AS total');
					})
					.then((result) => {
						const total = result.records[0].get('total').toNumber();
						xLog.status(`[neo4jLoader] Verified ${total} chunks in Neo4j`);
						cleanup('', { totalChunks: total });
					})
					.catch((verifyErr) => {
						cleanup(`Verification failed: ${verifyErr.message}`);
					});
			};

			processNextBatch();
		})
		.catch((clearErr) => {
			cleanup(`Failed to clear existing chunks: ${clearErr.message}`);
		});

	const cleanup = (err, result) => {
		session.close()
			.then(() => driver.close())
			.then(() => {
				callback(err || '', result);
			})
			.catch(() => {
				callback(err || '', result);
			});
	};
};

module.exports = { loadChunks };
