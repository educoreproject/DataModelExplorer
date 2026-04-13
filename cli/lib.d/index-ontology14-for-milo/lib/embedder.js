'use strict';

// embedder.js — Generate Voyage AI vector embeddings for CEDS Ontology nodes

const https = require('https');

const embedBatch = (texts, apiKey) => new Promise((resolve, reject) => {
	const body = JSON.stringify({
		model: 'voyage-3',
		input: texts,
		input_type: 'document'
	});

	const req = https.request({
		hostname: 'api.voyageai.com',
		path: '/v1/embeddings',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		}
	}, (res) => {
		let data = '';
		res.on('data', chunk => data += chunk);
		res.on('end', () => {
			if (res.statusCode !== 200) {
				reject(new Error(`Voyage API ${res.statusCode}: ${data}`));
				return;
			}
			const parsed = JSON.parse(data);
			resolve(parsed.data.map(d => d.embedding));
		});
	});
	req.on('error', reject);
	req.write(body);
	req.end();
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const createEmbeddings = async ({ neo4jBoltUri, neo4jUser, neo4jPassword, voyageApiKey }) => {
	const neo4j = require('neo4j-driver');
	const { xLog } = process.global;

	if (!voyageApiKey) {
		throw new Error('Missing voyageApiKey');
	}

	xLog.status('[embedder] Creating vector embeddings...');
	const driver = neo4j.driver(neo4jBoltUri, neo4j.auth.basic(neo4jUser, neo4jPassword));

	try {
		await driver.verifyConnectivity();
		xLog.status('[embedder] Connected to Neo4j.');
	} catch (err) {
		throw new Error(`Cannot connect to Neo4j: ${err.message}`);
	}

	const session = driver.session();

	try {
		// Query all CEDS nodes without embeddings
		xLog.status('[embedder] Querying nodes without embeddings...');
		const result = await session.run(`
			MATCH (n:CEDS) WHERE n.embedding IS NULL AND NOT n:CedsOntology
			RETURN n.cedsId AS cedsId, labels(n) AS labels, n.label AS label, n.description AS description
		`);

		const nodes = result.records.map(r => ({
			cedsId: r.get('cedsId'),
			label: r.get('label'),
			description: r.get('description')
		}));

		xLog.status(`[embedder] Found ${nodes.length} nodes needing embeddings.`);

		if (nodes.length === 0) {
			xLog.status('[embedder] All nodes already have embeddings. Nothing to do.');
		} else {
			const batchSize = 128;
			let processed = 0;

			for (let i = 0; i < nodes.length; i += batchSize) {
				const batch = nodes.slice(i, i + batchSize);
				const texts = batch.map(n => {
					const desc = n.description || '';
					return desc ? `${n.label} — ${desc}` : n.label;
				});

				const embeddings = await embedBatch(texts, voyageApiKey);

				const writeBack = batch.map((n, idx) => ({
					cedsId: n.cedsId,
					embedding: embeddings[idx]
				}));

				await session.run(`
					UNWIND $batch AS item
					MATCH (n:CEDS {cedsId: item.cedsId})
					SET n.embedding = item.embedding
				`, { batch: writeBack });

				processed += batch.length;

				if (processed % 1000 < batchSize) {
					xLog.status(`[embedder] Embedded ${processed}/${nodes.length} nodes...`);
				}

				if (i + batchSize < nodes.length) {
					await delay(100);
				}
			}

			xLog.status(`[embedder] All ${processed} embeddings written.`);
		}

		// Create vector index
		xLog.status('[embedder] Creating vector index ceds14_vector...');
		await session.run(`
			CREATE VECTOR INDEX ceds14_vector IF NOT EXISTS
			FOR (n:CEDS)
			ON (n.embedding)
			OPTIONS {indexConfig: {\`vector.dimensions\`: 1024, \`vector.similarity_function\`: 'cosine'}}
		`);

		await session.run('CALL db.awaitIndexes(300)');

		const verifyResult = await session.run(`SHOW INDEXES WHERE name = 'ceds14_vector'`);
		if (verifyResult.records.length > 0) {
			const state = verifyResult.records[0].get('state');
			xLog.status(`[embedder] Index ceds14_vector state: ${state}`);
			xLog.status('[embedder] === VECTOR EMBEDDINGS AND INDEX COMPLETE ===');
		} else {
			xLog.status('[embedder] WARNING — Index ceds14_vector not found after creation');
		}
	} finally {
		await session.close();
		await driver.close();
	}
};

module.exports = { createEmbeddings };
