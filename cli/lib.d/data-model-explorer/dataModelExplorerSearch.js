#!/usr/bin/env node
'use strict';

// dataModelExplorerSearch.js — Multi-tool search across unified education data standards graph
//
// Query types (via CLI flags):
//   -search "query"        Hybrid BM25 + vector search across ALL standards
//   -findMappings "name"   Find MAPS_TO counterparts for a field
//   -compareCodesets "name" Compare codeset values between standards
//   -unmappedFields        SIF fields with no or low-confidence mappings
//   -stats                 Counts by standard, mapping coverage
//   -rawCypher --query="..." Passthrough Cypher
//
// Outputs JSON to stdout, diagnostics to stderr.

const os = require('os');
const path = require('path');
const https = require('https');
const neo4j = require('neo4j-driver');

const moduleName = path.basename(__filename).replace(/.js$/, '');

// =====================================================================
// CONFIG
// =====================================================================

const loadConfig = () => {
	const configFileProcessor = require('qtools-config-file-processor');

	const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
		__dirname.replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), "$1");
	const projectRoot = findProjectRoot();

	const hostname = os.hostname();
	const configName = (hostname === 'qMini.local' || hostname === 'qbook.local') ? 'instanceSpecific/qbook' : '';
	const configDirPath = `${projectRoot}/configs/${configName}/`;

	const config = configFileProcessor.getConfig(`${moduleName}.ini`, configDirPath);
	if (!config || !config[moduleName]) {
		throw new Error(`Config section [${moduleName}] not found in ${configDirPath}${moduleName}.ini`);
	}
	return config[moduleName];
};

// =====================================================================
// NEO4J SESSION MANAGEMENT
// =====================================================================

const withNeo4jSession = async (config, queryFn) => {
	const driver = neo4j.driver(
		config.neo4jBoltUri,
		neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
		{ encrypted: false }
	);
	const session = driver.session();

	try {
		return await queryFn(session);
	} finally {
		await session.close();
		await driver.close();
	}
};

// =====================================================================
// VOYAGE AI QUERY EMBEDDING
// =====================================================================

const embedQuery = (text, apiKey) => new Promise((resolve, reject) => {
	const body = JSON.stringify({
		model: 'voyage-3',
		input: [text],
		input_type: 'query'
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
			resolve(parsed.data[0].embedding);
		});
	});
	req.on('error', reject);
	req.write(body);
	req.end();
});

// =====================================================================
// HELPERS
// =====================================================================

const toNumber = (val) => {
	if (val === null || val === undefined) return 0;
	if (typeof val === 'number') return val;
	if (typeof val.toNumber === 'function') return val.toNumber();
	return Number(val);
};

// =====================================================================
// QUERY HANDLERS
// =====================================================================

const hybridSearch = async (session, query, config) => {
	const limit = 20;
	const results = new Map();

	// BM25 search across CEDS
	try {
		const cedsResult = await session.run(`
			CALL db.index.fulltext.queryNodes('dme_ceds_fulltext', $query)
			YIELD node, score
			RETURN node.cedsId AS id, labels(node) AS labels, node.label AS name,
				node.description AS description, score AS ftScore
			LIMIT $limit
		`, { query, limit: neo4j.int(limit) });

		for (const rec of cedsResult.records) {
			const id = rec.get('id');
			results.set('ceds:' + id, {
				standard: 'CEDS',
				id,
				labels: rec.get('labels').filter(l => l !== 'CEDS'),
				name: rec.get('name'),
				description: rec.get('description'),
				ftScore: rec.get('ftScore'),
				vecScore: 0,
			});
		}
	} catch (err) {
		process.stderr.write(`${moduleName}: CEDS full-text search error: ${err.message}\n`);
	}

	// BM25 search across SIF
	try {
		const sifResult = await session.run(`
			CALL db.index.fulltext.queryNodes('dme_sif_fulltext', $query)
			YIELD node, score
			WITH node, score, labels(node) AS lbls
			OPTIONAL MATCH (obj:SifObject)-[:HAS_FIELD]->(node)
			RETURN COALESCE(node.xpath, node.name) AS id, lbls AS labels,
				node.name AS name, node.description AS description,
				COALESCE(obj.name, '') AS parentObject, score AS ftScore
			LIMIT $limit
		`, { query, limit: neo4j.int(limit) });

		for (const rec of sifResult.records) {
			const id = rec.get('id');
			results.set('sif:' + id, {
				standard: 'SIF',
				id,
				labels: rec.get('labels').filter(l => l !== 'SifModel'),
				name: rec.get('name'),
				description: rec.get('description'),
				parentObject: rec.get('parentObject'),
				ftScore: rec.get('ftScore'),
				vecScore: 0,
			});
		}
	} catch (err) {
		process.stderr.write(`${moduleName}: SIF full-text search error: ${err.message}\n`);
	}

	// Vector search across CEDS
	if (config.voyageApiKey) {
		try {
			const queryEmbedding = await embedQuery(query, config.voyageApiKey);

			// CEDS vector search
			try {
				const cedsVecResult = await session.run(`
					CALL db.index.vector.queryNodes('ceds14_vector', $limit, $embedding)
					YIELD node, score
					WHERE NOT node:CedsOntology
					RETURN node.cedsId AS id, labels(node) AS labels, node.label AS name,
						node.description AS description, score AS vecScore
				`, { limit: neo4j.int(limit), embedding: queryEmbedding });

				for (const rec of cedsVecResult.records) {
					const key = 'ceds:' + rec.get('id');
					if (results.has(key)) {
						results.get(key).vecScore = rec.get('vecScore');
					} else {
						results.set(key, {
							standard: 'CEDS',
							id: rec.get('id'),
							labels: rec.get('labels').filter(l => l !== 'CEDS'),
							name: rec.get('name'),
							description: rec.get('description'),
							ftScore: 0,
							vecScore: rec.get('vecScore'),
						});
					}
				}
			} catch (err) {
				process.stderr.write(`${moduleName}: CEDS vector search error: ${err.message}\n`);
			}

			// SIF vector search
			try {
				const sifVecResult = await session.run(`
					CALL db.index.vector.queryNodes('sif_field_vector', $limit, $embedding)
					YIELD node, score
					MATCH (obj:SifObject)-[:HAS_FIELD]->(node)
					RETURN node.xpath AS id, labels(node) AS labels, node.name AS name,
						node.description AS description, obj.name AS parentObject, score AS vecScore
				`, { limit: neo4j.int(limit), embedding: queryEmbedding });

				for (const rec of sifVecResult.records) {
					const key = 'sif:' + rec.get('id');
					if (results.has(key)) {
						results.get(key).vecScore = rec.get('vecScore');
					} else {
						results.set(key, {
							standard: 'SIF',
							id: rec.get('id'),
							labels: rec.get('labels').filter(l => l !== 'SifModel'),
							name: rec.get('name'),
							description: rec.get('description'),
							parentObject: rec.get('parentObject'),
							ftScore: 0,
							vecScore: rec.get('vecScore'),
						});
					}
				}
			} catch (err) {
				process.stderr.write(`${moduleName}: SIF vector search error: ${err.message}\n`);
			}
		} catch (err) {
			process.stderr.write(`${moduleName}: Embedding error: ${err.message}\n`);
		}
	}

	// Rank by combined score
	const ranked = [...results.values()]
		.map(r => ({
			...r,
			combinedScore: (r.ftScore > 0 ? 0.5 : 0) + (r.vecScore > 0 ? r.vecScore * 0.5 : 0)
		}))
		.sort((a, b) => b.combinedScore - a.combinedScore)
		.slice(0, limit);

	return ranked;
};

const findMappings = async (session, nameOrXpath) => {
	// Try as SIF field first (by xpath or name)
	const sifResult = await session.run(`
		MATCH (obj:SifObject)-[:HAS_FIELD]->(f:SifField)
		WHERE f.xpath = $name OR toLower(f.name) CONTAINS toLower($name)
		MATCH (f)-[m:MAPS_TO]->(p:CedsProperty)
		OPTIONAL MATCH (c:CedsClass)-[:HAS_PROPERTY]->(p)
		RETURN obj.name AS sifObject, f.name AS sifField, f.xpath AS sifXpath,
			p.cedsId AS cedsId, p.label AS cedsLabel, p.description AS cedsDescription,
			m.source AS source, m.confidence AS confidence, m.reviewed AS reviewed,
			collect(DISTINCT c.label) AS cedsClasses
		ORDER BY m.confidence DESC
		LIMIT 20
	`, { name: nameOrXpath });

	if (sifResult.records.length > 0) {
		return sifResult.records.map(rec => ({
			direction: 'SIF → CEDS',
			sifObject: rec.get('sifObject'),
			sifField: rec.get('sifField'),
			sifXpath: rec.get('sifXpath'),
			cedsId: rec.get('cedsId'),
			cedsLabel: rec.get('cedsLabel'),
			cedsDescription: rec.get('cedsDescription'),
			source: rec.get('source'),
			confidence: rec.get('confidence'),
			reviewed: rec.get('reviewed'),
			cedsClasses: rec.get('cedsClasses'),
		}));
	}

	// Try as CEDS property
	const cedsResult = await session.run(`
		MATCH (f:SifField)-[m:MAPS_TO]->(p:CedsProperty)
		WHERE p.cedsId = $name OR toLower(p.label) CONTAINS toLower($name)
		MATCH (obj:SifObject)-[:HAS_FIELD]->(f)
		RETURN p.cedsId AS cedsId, p.label AS cedsLabel,
			obj.name AS sifObject, f.name AS sifField, f.xpath AS sifXpath,
			m.source AS source, m.confidence AS confidence
		ORDER BY m.confidence DESC
		LIMIT 20
	`, { name: nameOrXpath });

	return cedsResult.records.map(rec => ({
		direction: 'CEDS → SIF',
		cedsId: rec.get('cedsId'),
		cedsLabel: rec.get('cedsLabel'),
		sifObject: rec.get('sifObject'),
		sifField: rec.get('sifField'),
		sifXpath: rec.get('sifXpath'),
		source: rec.get('source'),
		confidence: rec.get('confidence'),
	}));
};

const compareCodesets = async (session, name) => {
	const result = await session.run(`
		MATCH (sifCs:SifCodeset)-[a:ALIGNS_WITH]->(cedsOs:CedsOptionSet)
		MATCH (f:SifField)-[:CONSTRAINED_BY]->(sifCs)
		WHERE toLower(f.name) CONTAINS toLower($name) OR toLower(cedsOs.label) CONTAINS toLower($name)
		RETURN DISTINCT f.name AS fieldName, sifCs.values AS sifValues,
			cedsOs.label AS cedsOptionSetLabel, cedsOs.cedsId AS cedsOsCedsId,
			a.alignmentType AS alignmentType, a.coveragePercent AS coveragePercent,
			a.sifOnlyCount AS sifOnlyCount, a.cedsOnlyCount AS cedsOnlyCount,
			a.overlapCount AS overlapCount
		LIMIT 10
	`, { name });

	return result.records.map(rec => ({
		fieldName: rec.get('fieldName'),
		sifValues: rec.get('sifValues'),
		cedsOptionSetLabel: rec.get('cedsOptionSetLabel'),
		cedsOsCedsId: rec.get('cedsOsCedsId'),
		alignmentType: rec.get('alignmentType'),
		coveragePercent: toNumber(rec.get('coveragePercent')),
		sifOnlyCount: toNumber(rec.get('sifOnlyCount')),
		cedsOnlyCount: toNumber(rec.get('cedsOnlyCount')),
		overlapCount: toNumber(rec.get('overlapCount')),
	}));
};

const unmappedFields = async (session, params) => {
	const limit = params.limit ? parseInt(params.limit) : 50;

	const result = await session.run(`
		MATCH (obj:SifObject)-[:HAS_FIELD]->(f:SifField)
		WHERE NOT (f)-[:MAPS_TO]->(:CedsProperty)
		AND (f.cedsId IS NULL OR f.cedsId = '')
		RETURN obj.name AS objectName, f.name AS fieldName, f.xpath AS xpath,
			f.description AS description
		ORDER BY obj.name, f.name
		LIMIT $limit
	`, { limit: neo4j.int(limit) });

	return result.records.map(rec => ({
		objectName: rec.get('objectName'),
		fieldName: rec.get('fieldName'),
		xpath: rec.get('xpath'),
		description: rec.get('description'),
	}));
};

const getStats = async (session) => {
	// CEDS node counts
	const cedsResult = await session.run(`
		MATCH (n:CEDS)
		RETURN labels(n) AS labels, count(n) AS count
		ORDER BY count DESC
	`);

	const cedsNodes = {};
	for (const rec of cedsResult.records) {
		const label = rec.get('labels').filter(l => l !== 'CEDS')[0] || 'Unknown';
		cedsNodes[label] = toNumber(rec.get('count'));
	}

	// SIF node counts
	const sifResult = await session.run(`
		MATCH (n:SifModel)
		RETURN labels(n) AS labels, count(n) AS count
		ORDER BY count DESC
	`);

	const sifNodes = {};
	for (const rec of sifResult.records) {
		const label = rec.get('labels').filter(l => l !== 'SifModel')[0] || 'Unknown';
		sifNodes[label] = toNumber(rec.get('count'));
	}

	// Bridge edge counts
	const bridgeResult = await session.run(`
		MATCH ()-[r]->()
		WHERE type(r) IN ['MAPS_TO', 'ALIGNS_WITH', 'STRUCTURALLY_MAPS_TO']
		RETURN type(r) AS relType, count(r) AS count
	`);

	const bridges = {};
	for (const rec of bridgeResult.records) {
		bridges[rec.get('relType')] = toNumber(rec.get('count'));
	}

	// Mapping coverage
	const coverageResult = await session.run(`
		MATCH (f:SifField)
		WITH count(f) AS totalFields
		OPTIONAL MATCH (f2:SifField) WHERE f2.cedsId IS NOT NULL AND f2.cedsId <> ''
		WITH totalFields, count(f2) AS annotatedFields
		OPTIONAL MATCH (f3:SifField)-[:MAPS_TO]->(:CedsProperty)
		RETURN totalFields, annotatedFields, count(DISTINCT f3) AS mappedFields
	`);

	let coverage = {};
	if (coverageResult.records.length > 0) {
		const rec = coverageResult.records[0];
		coverage = {
			totalSifFields: toNumber(rec.get('totalFields')),
			specAnnotated: toNumber(rec.get('annotatedFields')),
			totalMapped: toNumber(rec.get('mappedFields')),
		};
	}

	return { ceds: cedsNodes, sif: sifNodes, bridges, coverage };
};

const rawCypher = async (session, query) => {
	const result = await session.run(query);
	return result.records.map(rec => {
		const obj = {};
		for (const key of rec.keys) {
			const val = rec.get(key);
			if (val && typeof val === 'object' && val.properties) {
				obj[key] = val.properties;
			} else if (Array.isArray(val)) {
				obj[key] = val;
			} else if (val && typeof val.toNumber === 'function') {
				obj[key] = val.toNumber();
			} else {
				obj[key] = val;
			}
		}
		return obj;
	});
};

// =====================================================================
// GRAPH RETRIEVER (VectorCypherRetriever)
// =====================================================================

const graphRetriever = async (session, query, config, params) => {
	const { retrieve } = require('/Users/tqwhite/tq_usr_bin/qbookSuperTool/system/code/cli/lib.d/ask-milo-multitool/lib/vectorCypherRetriever');

	const limit = params.limit ? parseInt(params.limit) : 10;
	const traversalMode = params.traversalMode || 'static';
	const searchMode = params.searchMode || 'hybrid';

	const traversalFilePath = path.join(__dirname, 'traversal.cypher');
	const schemaFilePath = path.join(__dirname, 'schema-summary.json');

	return retrieve({
		neo4jSession: session,
		queryText: query,
		voyageApiKey: config.voyageApiKey,
		traversalFilePath,
		schemaFilePath,
		limit,
		traversalMode,
		searchMode,
	});
};

// =====================================================================
// SEARCH API (module interface)
// =====================================================================

const search = async (queryType, params, callback) => {
	let config;
	try {
		config = loadConfig();
	} catch (err) {
		if (callback) return callback(`Config error: ${err.message}`);
		throw err;
	}

	try {
		const result = await withNeo4jSession(config, async (session) => {
			switch (queryType) {
				case 'search': return hybridSearch(session, params.query, config);
				case 'graphRetriever': return graphRetriever(session, params.query, config, params);
				case 'findMappings': return findMappings(session, params.name);
				case 'compareCodesets': return compareCodesets(session, params.name);
				case 'unmappedFields': return unmappedFields(session, params);
				case 'stats': return getStats(session);
				case 'rawCypher': return rawCypher(session, params.query);
				default: return { error: `Unknown query type: ${queryType}` };
			}
		});

		if (callback) return callback(null, result);
		return result;
	} catch (err) {
		if (callback) return callback(`Query failed: ${err.message}`);
		throw err;
	}
};

// =====================================================================
// CLI ENTRY POINT
// =====================================================================

if (require.main === module) {
	const args = process.argv.slice(2);
	const flags = {};
	const positionalArgs = [];

	for (const arg of args) {
		if (arg.startsWith('--')) {
			const [key, ...valueParts] = arg.slice(2).split('=');
			flags[key] = valueParts.join('=') || true;
		} else if (arg.startsWith('-') && !arg.startsWith('--')) {
			flags[arg.slice(1)] = true;
		} else {
			positionalArgs.push(arg);
		}
	}

	let queryType;
	let params = {};

	if (flags.search) {
		queryType = 'search';
		params.query = positionalArgs[0] || '';
	} else if (flags.findMappings) {
		queryType = 'findMappings';
		params.name = positionalArgs[0] || '';
	} else if (flags.compareCodesets) {
		queryType = 'compareCodesets';
		params.name = positionalArgs[0] || '';
	} else if (flags.unmappedFields) {
		queryType = 'unmappedFields';
		params.limit = flags.limit || '50';
	} else if (flags.stats) {
		queryType = 'stats';
	} else if (flags.graphRetriever) {
		queryType = 'graphRetriever';
		params.query = positionalArgs[0] || '';
		params.limit = flags.limit || '10';
		params.traversalMode = flags.traversalMode || 'static';
		params.searchMode = flags.searchMode || 'hybrid';
	} else if (flags.rawCypher) {
		queryType = 'rawCypher';
		params.query = flags.query || positionalArgs[0] || '';
	} else if (flags.help) {
		process.stderr.write(`Usage:
  ${moduleName} -search "query text"
  ${moduleName} -graphRetriever "query text" [--limit=10] [--traversalMode=static] [--searchMode=hybrid]
  ${moduleName} -findMappings "field name or xpath"
  ${moduleName} -compareCodesets "concept name"
  ${moduleName} -unmappedFields [--limit=50]
  ${moduleName} -stats
  ${moduleName} -rawCypher --query="CYPHER"
`);
		process.exit(0);
	} else {
		process.stderr.write(`${moduleName}: No action specified. Use -help for usage.\n`);
		process.exit(1);
	}

	search(queryType, params, (err, results) => {
		if (err) {
			process.stderr.write(`Error: ${err}\n`);
			process.exit(1);
		}
		console.log(JSON.stringify(results, null, 2));
	});
}

module.exports = { search };
