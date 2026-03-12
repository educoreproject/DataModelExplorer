'use strict';

const path = require('path');
const os = require('os');
const https = require('https');
const configFileProcessor = require('qtools-config-file-processor');

const moduleName = path.basename(__filename).replace(/\.js$/, '');

// ============================================================
// Config
// ============================================================

const getLocalConfig = () => {
	const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
		__dirname.replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), "$1");
	const projectRoot = findProjectRoot();

	const configName = os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDirPath = `${projectRoot}/configs/${configName}/`;

	const config = configFileProcessor.getConfig('cedsOntology14Search.ini', configDirPath, { resolve: false });
	const localConfig = config['cedsOntology14Search'] || {};
	return localConfig;
};

// ============================================================
// Voyage AI embedding helper
// ============================================================

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

// ============================================================
// Neo4j helpers
// ============================================================

const toNumber = (val) => {
	if (val === null || val === undefined) { return 0; }
	if (typeof val === 'number') { return val; }
	if (typeof val.toNumber === 'function') { return val.toNumber(); }
	return Number(val);
};

// ============================================================
// Query implementations
// ============================================================

const hybridSearch = async (session, query, config, neo4j) => {
	const limit = 15;
	const results = new Map();

	// 1. BM25 full-text search
	try {
		const ftResult = await session.run(`
			CALL db.index.fulltext.queryNodes('ceds14_fulltext', $query)
			YIELD node, score
			RETURN node.cedsId AS cedsId, labels(node) AS labels, node.label AS label,
				node.description AS description, node.notation AS notation,
				node.dataType AS dataType, score AS ftScore
			LIMIT $limit
		`, { query, limit: neo4j.int(limit) });

		for (const rec of ftResult.records) {
			const cedsId = rec.get('cedsId');
			results.set(cedsId, {
				cedsId,
				labels: rec.get('labels').filter(l => l !== 'CEDS'),
				label: rec.get('label'),
				description: rec.get('description'),
				notation: rec.get('notation'),
				dataType: rec.get('dataType'),
				ftScore: rec.get('ftScore'),
				vecScore: 0,
			});
		}
	} catch (err) {
		process.stderr.write(`${moduleName}: Full-text search error: ${err.message}\n`);
	}

	// 2. Vector search (graceful degradation if index missing)
	try {
		const queryEmbedding = await embedQuery(query, config.voyageApiKey);
		const vecResult = await session.run(`
			CALL db.index.vector.queryNodes('ceds14_vector', $limit, $embedding)
			YIELD node, score
			RETURN node.cedsId AS cedsId, labels(node) AS labels, node.label AS label,
				node.description AS description, node.notation AS notation,
				node.dataType AS dataType, score AS vecScore
		`, { limit: neo4j.int(limit), embedding: queryEmbedding });

		for (const rec of vecResult.records) {
			const cedsId = rec.get('cedsId');
			if (results.has(cedsId)) {
				results.get(cedsId).vecScore = rec.get('vecScore');
			} else {
				results.set(cedsId, {
					cedsId,
					labels: rec.get('labels').filter(l => l !== 'CEDS'),
					label: rec.get('label'),
					description: rec.get('description'),
					notation: rec.get('notation'),
					dataType: rec.get('dataType'),
					ftScore: 0,
					vecScore: rec.get('vecScore'),
				});
			}
		}
	} catch (err) {
		process.stderr.write(`${moduleName}: Vector search error (falling back to BM25 only): ${err.message}\n`);
	}

	// 3. Rank by combined score
	const ranked = [...results.values()].map(r => ({
		...r,
		combinedScore: (r.ftScore > 0 ? 0.5 : 0) + (r.vecScore > 0 ? r.vecScore * 0.5 : 0)
	})).sort((a, b) => b.combinedScore - a.combinedScore).slice(0, limit);

	// 4. Neighborhood enrichment for top 5
	for (const r of ranked.slice(0, 5)) {
		const type = r.labels[0];
		if (type === 'CedsClass') {
			const propResult = await session.run(`
				MATCH (c:CedsClass {cedsId: $cedsId})-[:HAS_PROPERTY]->(p:CedsProperty)
				RETURN p.label AS label, p.cedsId AS cedsId, p.dataType AS dataType
				ORDER BY p.label LIMIT 20
			`, { cedsId: r.cedsId });
			r.properties = propResult.records.map(pr => ({
				label: pr.get('label'), cedsId: pr.get('cedsId'), dataType: pr.get('dataType')
			}));
		} else if (type === 'CedsProperty') {
			const classResult = await session.run(`
				MATCH (c:CedsClass)-[:HAS_PROPERTY]->(p:CedsProperty {cedsId: $cedsId})
				RETURN c.label AS label, c.cedsId AS cedsId LIMIT 5
			`, { cedsId: r.cedsId });
			r.usedByClasses = classResult.records.map(cr => ({
				label: cr.get('label'), cedsId: cr.get('cedsId')
			}));

			const osResult = await session.run(`
				MATCH (p:CedsProperty {cedsId: $cedsId})-[:HAS_OPTION_SET]->(os:CedsOptionSet)
				OPTIONAL MATCH (os)-[:HAS_VALUE]->(ov:CedsOptionValue)
				RETURN os.label AS osLabel, os.cedsId AS osCedsId, count(ov) AS valueCount
			`, { cedsId: r.cedsId });
			if (osResult.records.length > 0 && osResult.records[0].get('osLabel')) {
				r.optionSet = {
					label: osResult.records[0].get('osLabel'),
					cedsId: osResult.records[0].get('osCedsId'),
					valueCount: toNumber(osResult.records[0].get('valueCount'))
				};
			}
		} else if (type === 'CedsOptionSet') {
			const valResult = await session.run(`
				MATCH (os:CedsOptionSet {cedsId: $cedsId})-[:HAS_VALUE]->(ov:CedsOptionValue)
				RETURN ov.label AS label, ov.cedsId AS cedsId
				ORDER BY ov.label LIMIT 10
			`, { cedsId: r.cedsId });
			r.sampleValues = valResult.records.map(vr => ({
				label: vr.get('label'), cedsId: vr.get('cedsId')
			}));
		}
	}

	return ranked;
};

const exploreClass = async (session, name) => {
	// Try by label first, then by cedsId
	const matchResult = await session.run(`
		MATCH (c:CedsClass)
		WHERE c.label = $name OR c.cedsId = $name
		RETURN c.cedsId AS cedsId, c.label AS label, c.description AS description, c.notation AS notation, c.uri AS uri
		LIMIT 1
	`, { name });

	if (matchResult.records.length === 0) {
		return { error: `No CedsClass found matching "${name}"` };
	}

	const rec = matchResult.records[0];
	const cedsId = rec.get('cedsId');

	const result = {
		cedsId,
		label: rec.get('label'),
		description: rec.get('description'),
		notation: rec.get('notation'),
		uri: rec.get('uri'),
	};

	// Properties
	const propResult = await session.run(`
		MATCH (c:CedsClass {cedsId: $cedsId})-[:HAS_PROPERTY]->(p:CedsProperty)
		OPTIONAL MATCH (p)-[:HAS_OPTION_SET]->(os:CedsOptionSet)
		RETURN p.cedsId AS cedsId, p.label AS label, p.dataType AS dataType,
			p.description AS description, os.label AS optionSetLabel, os.cedsId AS optionSetCedsId
		ORDER BY p.label
	`, { cedsId });

	result.properties = propResult.records.map(pr => {
		const prop = {
			cedsId: pr.get('cedsId'),
			label: pr.get('label'),
			dataType: pr.get('dataType'),
			description: pr.get('description'),
		};
		if (pr.get('optionSetLabel')) {
			prop.optionSet = { label: pr.get('optionSetLabel'), cedsId: pr.get('optionSetCedsId') };
		}
		return prop;
	});

	// Parent class
	const parentResult = await session.run(`
		MATCH (c:CedsClass {cedsId: $cedsId})-[:SUBCLASS_OF]->(parent:CedsClass)
		RETURN parent.label AS label, parent.cedsId AS cedsId
		LIMIT 1
	`, { cedsId });

	if (parentResult.records.length > 0) {
		result.parent = {
			label: parentResult.records[0].get('label'),
			cedsId: parentResult.records[0].get('cedsId')
		};
	}

	// Child classes
	const childResult = await session.run(`
		MATCH (child:CedsClass)-[:SUBCLASS_OF]->(c:CedsClass {cedsId: $cedsId})
		RETURN child.label AS label, child.cedsId AS cedsId
		ORDER BY child.label
	`, { cedsId });

	result.children = childResult.records.map(cr => ({
		label: cr.get('label'), cedsId: cr.get('cedsId')
	}));

	return result;
};

const getOptionSet = async (session, name) => {
	const matchResult = await session.run(`
		MATCH (os:CedsOptionSet)
		WHERE os.label = $name OR os.cedsId = $name
		RETURN os.cedsId AS cedsId, os.label AS label, os.description AS description
		LIMIT 1
	`, { name });

	if (matchResult.records.length === 0) {
		return { error: `No CedsOptionSet found matching "${name}"` };
	}

	const rec = matchResult.records[0];
	const cedsId = rec.get('cedsId');

	const valResult = await session.run(`
		MATCH (os:CedsOptionSet {cedsId: $cedsId})-[:HAS_VALUE]->(ov:CedsOptionValue)
		RETURN ov.cedsId AS cedsId, ov.label AS label, ov.description AS description, ov.notation AS notation
		ORDER BY ov.label
	`, { cedsId });

	return {
		cedsId,
		label: rec.get('label'),
		description: rec.get('description'),
		values: valResult.records.map(vr => ({
			cedsId: vr.get('cedsId'),
			label: vr.get('label'),
			description: vr.get('description'),
			notation: vr.get('notation'),
		}))
	};
};

const getStats = async (session) => {
	const result = await session.run(`
		MATCH (n:CEDS)
		RETURN labels(n) AS labels, count(n) AS count
		ORDER BY count DESC
	`);

	const stats = {};
	for (const rec of result.records) {
		const label = rec.get('labels').filter(l => l !== 'CEDS')[0] || 'Unknown';
		stats[label] = toNumber(rec.get('count'));
	}

	// Relationship counts
	const relResult = await session.run(`
		MATCH (:CEDS)-[r]->(:CEDS)
		RETURN type(r) AS relType, count(r) AS count
		ORDER BY count DESC
	`);

	const relationships = {};
	for (const rec of relResult.records) {
		relationships[rec.get('relType')] = toNumber(rec.get('count'));
	}

	return { nodes: stats, relationships };
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

// ============================================================
// Main dispatch
// ============================================================

const search = async (queryType, params, callback) => {
	const neo4j = require('neo4j-driver');
	const config = getLocalConfig();
	const { neo4jBoltUri, neo4jUser, neo4jPassword } = config;

	if (!neo4jBoltUri || !neo4jUser || !neo4jPassword) {
		const err = new Error(`${moduleName}: Missing Neo4j config`);
		if (callback) { return callback(err); }
		throw err;
	}

	const driver = neo4j.driver(neo4jBoltUri, neo4j.auth.basic(neo4jUser, neo4jPassword));
	const session = driver.session();

	try {
		let result;

		switch (queryType) {
			case 'search':
				result = await hybridSearch(session, params.query, config, neo4j);
				break;
			case 'explore':
				result = await exploreClass(session, params.name);
				break;
			case 'optionSet':
				result = await getOptionSet(session, params.name);
				break;
			case 'stats':
				result = await getStats(session);
				break;
			case 'rawCypher':
				result = await rawCypher(session, params.query);
				break;
			default:
				result = { error: `Unknown query type: ${queryType}` };
		}

		if (callback) { return callback(null, result); }
		return result;
	} catch (err) {
		if (callback) { return callback(err); }
		throw err;
	} finally {
		await session.close();
		await driver.close();
	}
};

// ============================================================
// CLI entry point
// ============================================================

const runCli = async () => {
	const args = process.argv.slice(2);

	// Parse CLI args
	let queryType;
	let params = {};

	if (args.includes('-search')) {
		queryType = 'search';
		const idx = args.indexOf('-search');
		params.query = args[idx + 1] || '';
	} else if (args.includes('-explore')) {
		queryType = 'explore';
		const idx = args.indexOf('-explore');
		params.name = args[idx + 1] || '';
	} else if (args.includes('-optionSet')) {
		queryType = 'optionSet';
		const idx = args.indexOf('-optionSet');
		params.name = args[idx + 1] || '';
	} else if (args.includes('-stats')) {
		queryType = 'stats';
	} else if (args.includes('-rawCypher')) {
		queryType = 'rawCypher';
		const queryFlag = args.find(a => a.startsWith('--query='));
		params.query = queryFlag ? queryFlag.replace('--query=', '') : '';
	} else if (args.includes('-help') || args.includes('--help')) {
		process.stderr.write(`Usage:
  ${moduleName} -search "query text"
  ${moduleName} -explore "ClassName or CedsId"
  ${moduleName} -optionSet "OptionSetName or CedsId"
  ${moduleName} -stats
  ${moduleName} -rawCypher --query="MATCH (n:CEDS) RETURN count(n)"
`);
		return;
	}

	if (!queryType) {
		process.stderr.write(`${moduleName}: No action specified. Use -help for usage.\n`);
		process.exit(1);
	}

	try {
		const result = await search(queryType, params);
		process.stdout.write(JSON.stringify(result, null, '\t'));
		process.stdout.write('\n');
	} catch (err) {
		process.stderr.write(`${moduleName}: ERROR — ${err.message}\n`);
		process.exit(1);
	}
};

// ============================================================
// JSON stdin support (for web/server invocation)
// ============================================================

const handleStdin = () => {
	let input = '';
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', chunk => input += chunk);
	process.stdin.on('end', async () => {
		if (!input.trim()) {
			runCli();
			return;
		}

		try {
			const parsed = JSON.parse(input);
			const { action, args: positionalArgs = [], options = {} } = parsed;

			const queryType = action;
			let params = {};

			switch (queryType) {
				case 'search':
					params.query = positionalArgs[0] || options.query || '';
					break;
				case 'explore':
					params.name = positionalArgs[0] || options.name || '';
					break;
				case 'optionSet':
					params.name = positionalArgs[0] || options.name || '';
					break;
				case 'stats':
					break;
				case 'rawCypher':
					params.query = positionalArgs[0] || options.query || '';
					break;
				default:
					process.stdout.write(JSON.stringify({ error: `Unknown action: ${queryType}` }));
					return;
			}

			const result = await search(queryType, params);
			process.stdout.write(JSON.stringify(result, null, '\t'));
			process.stdout.write('\n');
		} catch (err) {
			process.stdout.write(JSON.stringify({ error: err.message }));
			process.stdout.write('\n');
			process.exit(1);
		}
	});
};

// ============================================================
// Entry point: detect stdin vs CLI
// ============================================================

if (require.main === module) {
	if (process.stdin.isTTY || process.argv.length > 2) {
		runCli();
	} else {
		handleStdin();
	}
}

module.exports = { search };
