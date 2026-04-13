'use strict';

// embedder.js — Generate Voyage AI vector embeddings for SifField nodes
//
// Two-tier embedding text formula:
//   Tier 1 (rich)  — fields with description: "[SifObject] [fieldName]: [description]"
//   Tier 2 (path)  — fields without description: "[SifObject] [fieldName]: [humanized path segments]"

const https = require('https');

// =====================================================================
// PASCAL-CASE HUMANIZER
// =====================================================================

const humanizePascalCase = (text) =>
	text
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.toLowerCase();

// =====================================================================
// EMBEDDING TEXT BUILDER
// =====================================================================

const buildEmbeddingText = ({ objectName, fieldName, description, pathSegments }) => {
	if (description && description.trim()) {
		// Tier 1 — rich: object + field + description
		return `${objectName} ${fieldName}: ${description}`.slice(0, 8000);
	}

	// Tier 2 — path-only: humanize path segments for semantic signal
	if (pathSegments && pathSegments.length > 0) {
		const segments = (typeof pathSegments === 'string')
			? pathSegments.split(',').map(s => s.trim())
			: pathSegments;

		const filtered = segments.filter(seg =>
			seg !== objectName &&
			seg !== fieldName &&
			seg !== 'SIF_Metadata'
		);

		const humanized = filtered.map(humanizePascalCase).join(' ');
		return `${objectName} ${fieldName}: ${humanized}`.slice(0, 8000);
	}

	// Fallback — just object + field name
	return `${objectName} ${fieldName}`;
};

// =====================================================================
// VOYAGE AI BATCH EMBEDDING
// =====================================================================

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

// =====================================================================
// MAIN EMBEDDING FUNCTION
// =====================================================================

const createEmbeddings = async ({ neo4jBoltUri, neo4jUser, neo4jPassword, voyageApiKey }) => {
	const neo4j = require('neo4j-driver');
	const { xLog } = process.global;

	if (!voyageApiKey) {
		xLog.error('[embedder] Missing voyageApiKey');
		process.exit(1);
	}

	xLog.status('[embedder] Creating vector embeddings for SifField nodes...');
	const driver = neo4j.driver(neo4jBoltUri, neo4j.auth.basic(neo4jUser, neo4jPassword), { encrypted: false });

	try {
		await driver.verifyConnectivity();
	} catch (err) {
		xLog.error(`[embedder] Cannot connect to Neo4j: ${err.message}`);
		process.exit(1);
	}

	const session = driver.session();

	try {
		// Query SifField nodes without embeddings
		xLog.status('[embedder] Querying SifField nodes without embeddings...');
		const result = await session.run(`
			MATCH (obj:SifObject)-[:HAS_FIELD]->(f:SifField)
			WHERE f.embedding IS NULL
			RETURN obj.name AS objectName, f.name AS fieldName, f.description AS description,
				f.xpath AS xpath, f.pathSegments AS pathSegments, elementId(f) AS elementId
		`);

		const nodes = result.records.map(r => ({
			objectName: r.get('objectName'),
			fieldName: r.get('fieldName'),
			description: r.get('description') || '',
			xpath: r.get('xpath'),
			pathSegments: r.get('pathSegments'),
		}));

		xLog.status(`[embedder] Found ${nodes.length} nodes needing embeddings.`);

		if (nodes.length === 0) {
			xLog.status('[embedder] All nodes already have embeddings.');
		} else {
			const batchSize = 128;
			let processed = 0;
			let tier1Count = 0;
			let tier2Count = 0;

			for (let i = 0; i < nodes.length; i += batchSize) {
				const batch = nodes.slice(i, i + batchSize);
				const texts = batch.map(n => {
					const text = buildEmbeddingText(n);
					if (n.description && n.description.trim()) {
						tier1Count++;
					} else {
						tier2Count++;
					}
					return text;
				});

				const embeddings = await embedBatch(texts, voyageApiKey);

				const writeBack = batch.map((n, idx) => ({
					xpath: n.xpath,
					embedding: embeddings[idx]
				}));

				await session.run(`
					UNWIND $batch AS item
					MATCH (f:SifField {xpath: item.xpath})
					SET f.embedding = item.embedding
				`, { batch: writeBack });

				processed += batch.length;

				if (processed % 1000 < batchSize) {
					xLog.status(`[embedder] Embedded ${processed}/${nodes.length} nodes...`);
				}

				if (i + batchSize < nodes.length) {
					await delay(100);
				}
			}

			xLog.status(`[embedder] All ${processed} embeddings written (${tier1Count} rich, ${tier2Count} path-only).`);
		}

		// Create vector index
		xLog.status('[embedder] Creating vector index sif_field_vector...');
		await session.run(`
			CREATE VECTOR INDEX sif_field_vector IF NOT EXISTS
			FOR (n:SifField)
			ON (n.embedding)
			OPTIONS {indexConfig: {\`vector.dimensions\`: 1024, \`vector.similarity_function\`: 'cosine'}}
		`);

		await session.run('CALL db.awaitIndexes(300)');

		const verifyResult = await session.run(`SHOW INDEXES WHERE name = 'sif_field_vector'`);
		if (verifyResult.records.length > 0) {
			const state = verifyResult.records[0].get('state');
			xLog.status(`[embedder] Index sif_field_vector state: ${state}`);
			xLog.status('[embedder] === VECTOR EMBEDDINGS AND INDEX COMPLETE ===');
		} else {
			xLog.status('[embedder] WARNING — Index sif_field_vector not found after creation');
		}
	} finally {
		await session.close();
		await driver.close();
	}
};

module.exports = { createEmbeddings };
