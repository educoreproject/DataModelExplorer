#!/usr/bin/env node
'use strict';

// Neo4j RAG search template — copied and renamed by indexTextGraphForMilo
// Queries a Neo4j container via vector similarity for semantic search.
// Returns JSON results to stdout.
//
// This file works both as a CLI tool (called by askMilo's toolHandler
// via execFile) and as a require()-able module.

const os = require('os');
const path = require('path');
const https = require('https');
const configFileProcessor = require('qtools-config-file-processor');

// =====================================================================
// CONFIG
// =====================================================================

const moduleName = path.basename(__filename).replace(/.js$/, '');

// ---------------------------------------------------------------------
// loadConfig — Read .ini config for this search tool

const loadConfig = () => {
	const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
		__dirname.replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), "$1");
	const projectRoot = findProjectRoot();

	const configName = os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDirPath = `${projectRoot}/configs/${configName}/`;

	const config = configFileProcessor.getConfig(`${moduleName}.ini`, configDirPath, { resolve: false });
	if (!config || !config[moduleName]) {
		throw new Error(`Config section [${moduleName}] not found in ${configDirPath}${moduleName}.ini`);
	}
	return config[moduleName];
};

// =====================================================================
// VOYAGE AI EMBEDDING
// =====================================================================

// ---------------------------------------------------------------------
// getEmbedding — Call Voyage AI embedding API for a single query

const getEmbedding = (query, config, callback) => {
	const requestBody = JSON.stringify({
		model: config.embeddingModel,
		input: [query],
		output_dimension: parseInt(config.embeddingDimensions, 10),
	});

	const options = {
		hostname: 'api.voyageai.com',
		port: 443,
		path: '/v1/embeddings',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${config.voyageApiKey}`,
			'Content-Length': Buffer.byteLength(requestBody),
		},
	};

	const req = https.request(options, (res) => {
		let data = '';
		res.on('data', (chunk) => { data += chunk; });
		res.on('end', () => {
			if (res.statusCode !== 200) {
				callback(`Voyage AI API error ${res.statusCode}: ${data.slice(0, 300)}`);
				return;
			}
			try {
				const parsed = JSON.parse(data);
				const embedding = parsed.data && parsed.data[0] && parsed.data[0].embedding;
				if (!embedding) {
					callback('No embedding in Voyage AI response');
					return;
				}
				callback(null, embedding);
			} catch (err) {
				callback(`Parse error: ${err.message}`);
			}
		});
	});

	req.on('error', (err) => callback(`Request failed: ${err.message}`));
	req.write(requestBody);
	req.end();
};

// =====================================================================
// NEO4J VECTOR SEARCH
// =====================================================================

// ---------------------------------------------------------------------
// searchChunks — Query Neo4j for similar chunks via vector index

const searchChunks = (queryEmbedding, config, limit, callback) => {
	let neo4j, driver, session;
	try {
		neo4j = require('neo4j-driver');
		driver = neo4j.driver(
			config.neo4jBoltUri,
			neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
			{ encrypted: false }
		);
		session = driver.session();
	} catch (err) {
		callback(`Neo4j connection failed: ${err.message}\nIs the Neo4j container running? Run: indexTextGraphForMilo -start`);
		return;
	}

	session.run(
		`CALL db.index.vector.queryNodes('chunk_vector_index', $limit, $embedding)
		 YIELD node, score
		 RETURN node.text AS chunk_text,
				node.sourceFile AS source_file,
				node.label AS label,
				node.startLine AS start_line,
				score
		 ORDER BY score DESC`,
		{
			limit: neo4j.int(limit),
			embedding: queryEmbedding,
		}
	)
		.then((result) => {
			const rows = result.records.map((record) => ({
				chunk_text: record.get('chunk_text'),
				source_file: record.get('source_file'),
				label: record.get('label'),
				start_line: record.get('start_line').toNumber ? record.get('start_line').toNumber() : Number(record.get('start_line')),
				score: record.get('score'),
			}));

			session.close()
				.then(() => driver.close())
				.then(() => callback(null, rows))
				.catch(() => callback(null, rows));
		})
		.catch((err) => {
			session.close()
				.then(() => driver.close())
				.catch(() => {});
			callback(`Neo4j search failed: ${err.message}\nIs the Neo4j container running? Run: indexTextGraphForMilo -start`);
		});
};

// =====================================================================
// SEARCH API
// =====================================================================

// ---------------------------------------------------------------------
// search — Main search function (usable via require())

const search = (query, options, callback) => {
	const config = loadConfig();
	const limit = (options && options.limit) || parseInt(config.topK, 10) || 10;

	getEmbedding(query, config, (err, embedding) => {
		if (err) {
			callback(err);
			return;
		}

		searchChunks(embedding, config, limit, callback);
	});
};

// =====================================================================
// CLI ENTRY POINT
// =====================================================================

if (require.main === module) {
	const args = process.argv.slice(2);
	let query = '';
	let limit = null;

	for (const arg of args) {
		if (arg.startsWith('--limit=')) {
			limit = parseInt(arg.split('=')[1], 10);
		} else if (!query) {
			query = arg;
		} else {
			query += ' ' + arg;
		}
	}

	if (!query) {
		console.error(`Usage: node ${path.basename(__filename)} "your query" [--limit=N]`);
		process.exit(1);
	}

	search(query, { limit }, (err, results) => {
		if (err) {
			console.error(`Error: ${err}`);
			process.exit(1);
		}
		console.log(JSON.stringify(results, null, 2));
	});
}

module.exports = { search };
