'use strict';

// embedder.js — Voyage AI embedding generation module
// Calls Voyage AI embedding API to generate vector embeddings for chunks.
// Processes in batches to stay within API limits.

const https = require('https');

const BATCH_SIZE = 128;

// ---------------------------------------------------------------------
// callVoyageEmbeddingApi — Send texts to Voyage AI embedding endpoint

const callVoyageEmbeddingApi = ({ texts, voyageApiKey, embeddingModel, embeddingDimensions }, callback) => {
	const requestBody = JSON.stringify({
		model: embeddingModel,
		input: texts,
		output_dimension: embeddingDimensions,
	});

	const options = {
		hostname: 'api.voyageai.com',
		port: 443,
		path: '/v1/embeddings',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${voyageApiKey}`,
			'Content-Length': Buffer.byteLength(requestBody),
		},
	};

	const req = https.request(options, (res) => {
		let data = '';
		res.on('data', (chunk) => { data += chunk; });
		res.on('end', () => {
			if (res.statusCode !== 200) {
				callback(`Voyage AI API returned ${res.statusCode}: ${data.slice(0, 500)}`);
				return;
			}
			try {
				const parsed = JSON.parse(data);
				if (!parsed.data || !Array.isArray(parsed.data)) {
					callback('Unexpected Voyage AI response format');
					return;
				}
				// Sort by index to ensure order matches input
				const sorted = parsed.data.sort((a, b) => a.index - b.index);
				const embeddings = sorted.map(item => item.embedding);
				callback('', embeddings);
			} catch (err) {
				callback(`Failed to parse Voyage AI response: ${err.message}`);
			}
		});
	});

	req.on('error', (err) => {
		callback(`Voyage AI API request failed: ${err.message}`);
	});

	req.write(requestBody);
	req.end();
};

// ---------------------------------------------------------------------
// generateEmbeddings — Process all chunks in batches

const generateEmbeddings = ({ chunks, voyageApiKey, embeddingModel, embeddingDimensions }, callback) => {
	const { xLog } = process.global;
	const embeddedChunks = [];
	let batchStart = 0;

	const processNextBatch = () => {
		if (batchStart >= chunks.length) {
			callback('', embeddedChunks);
			return;
		}

		const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
		const batch = chunks.slice(batchStart, batchEnd);
		const texts = batch.map(chunk => chunk.text);

		xLog.status(`[embedder] Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (chunks ${batchStart + 1}-${batchEnd} of ${chunks.length})`);

		callVoyageEmbeddingApi({ texts, voyageApiKey, embeddingModel, embeddingDimensions }, (err, embeddings) => {
			if (err) {
				callback(`Embedding batch failed: ${err}`);
				return;
			}

			// Merge embeddings into chunk objects
			for (let i = 0; i < batch.length; i++) {
				embeddedChunks.push({
					...batch[i],
					embedding: embeddings[i],
				});
			}

			batchStart = batchEnd;
			processNextBatch();
		});
	};

	processNextBatch();
};

module.exports = { generateEmbeddings };
