#!/usr/bin/env node
'use strict';

// sifSpecGraphSearch.js — Query the SIF Implementation Specification graph
//
// Dispatches Cypher queries against a Neo4j graph of SIF object types,
// fields, complex types, codesets, data types, and XML element tree.
//
// Query types:
//   --queryType=listObjects          List all SIF object types
//   --queryType=describeObject       Show fields for a named object
//   --queryType=describeField        Show full detail for a field by XPath
//   --queryType=searchFields         Search fields by name substring
//   --queryType=fieldsByCedsId       Find fields mapped to a CEDS ID
//   --queryType=inboundReferences    What objects reference X?
//   --queryType=outboundReferences   What does X reference?
//   --queryType=findPath             Shortest path between two objects
//   --queryType=searchByName         Substring search on object names
//   --queryType=describeComplexType  Show fields and structure of a complex type
//   --queryType=listComplexTypes     List all complex types with usage counts
//   --queryType=describeCodeset      Show codeset values for a field
//   --queryType=xmlTree              Show XML element tree for an object
//   --queryType=rawCypher            Execute arbitrary Cypher
//
// Outputs JSON to stdout, diagnostics to stderr.
// Works as both CLI tool and require()-able module.

const os = require('os');
const path = require('path');
const https = require('https');
const neo4j = require('neo4j-driver');

// =====================================================================
// CONFIG
// =====================================================================

const moduleName = path.basename(__filename).replace(/.js$/, '');

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
// QUERY HANDLERS
// =====================================================================

const queryHandlers = {

	listObjects: async (session, _params) => {
		const result = await session.run(
			`MATCH (s:SifObject)
			 RETURN s.name AS name, s.tableName AS tableName,
					s.fieldCount AS fieldCount, s.mandatoryFieldCount AS mandatoryFieldCount
			 ORDER BY s.name`
		);
		return result.records.map(rec => ({
			name: rec.get('name'),
			tableName: rec.get('tableName'),
			fieldCount: toNumber(rec.get('fieldCount')),
			mandatoryFieldCount: toNumber(rec.get('mandatoryFieldCount')),
		}));
	},

	describeObject: async (session, params) => {
		const objectName = params.name;
		if (!objectName) throw new Error('describeObject requires --name or positional arg');

		// Get object info
		const objResult = await session.run(
			`MATCH (s:SifObject)
			 WHERE toLower(s.name) = toLower($name) OR toLower(s.tableName) = toLower($name)
			 RETURN s.name AS name, s.tableName AS tableName,
					s.fieldCount AS fieldCount, s.mandatoryFieldCount AS mandatoryFieldCount`,
			{ name: objectName }
		);

		if (objResult.records.length === 0) {
			return { error: `No SIF object found matching "${objectName}"` };
		}

		const objRec = objResult.records[0];

		// Get fields via HAS_FIELD relationship
		const fieldResult = await session.run(
			`MATCH (s:SifObject)-[:HAS_FIELD]->(f:SifField)
			 WHERE toLower(s.name) = toLower($name) OR toLower(s.tableName) = toLower($name)
			 OPTIONAL MATCH (f)-[:HAS_TYPE]->(t)
			 RETURN f.name AS name, f.mandatory AS mandatory, f.characteristics AS characteristics,
					f.description AS description, f.xpath AS xpath, f.cedsId AS cedsId,
					f.depth AS depth, f.isAttribute AS isAttribute,
					t.name AS typeName
			 ORDER BY f.xpath`,
			{ name: objectName }
		);

		return {
			name: objRec.get('name'),
			tableName: objRec.get('tableName'),
			fieldCount: toNumber(objRec.get('fieldCount')),
			mandatoryFieldCount: toNumber(objRec.get('mandatoryFieldCount')),
			fields: fieldResult.records.map(rec => ({
				name: rec.get('name'),
				mandatory: rec.get('mandatory'),
				characteristics: rec.get('characteristics'),
				type: rec.get('typeName'),
				description: rec.get('description'),
				xpath: rec.get('xpath'),
				cedsId: rec.get('cedsId'),
				depth: toNumber(rec.get('depth')),
				isAttribute: rec.get('isAttribute'),
			})),
		};
	},

	describeField: async (session, params) => {
		const xpath = params.xpath;
		if (!xpath) throw new Error('describeField requires --xpath');

		const result = await session.run(
			`MATCH (obj:SifObject)-[:HAS_FIELD]->(f:SifField {xpath: $xpath})
			 OPTIONAL MATCH (f)-[:HAS_TYPE]->(t)
			 OPTIONAL MATCH (f)-[:MEMBER_OF]->(ct:SifComplexType)
			 OPTIONAL MATCH (f)-[:CONSTRAINED_BY]->(cs:SifCodeset)
			 RETURN obj.name AS objectName, f.name AS name, f.mandatory AS mandatory,
					f.characteristics AS characteristics, f.description AS description,
					f.xpath AS xpath, f.cedsId AS cedsId, f.depth AS depth,
					f.isAttribute AS isAttribute, f.pathSegments AS pathSegments,
					t.name AS typeName, ct.name AS complexTypeName,
					cs.values AS codesetValues, cs.valueCount AS codesetValueCount`,
			{ xpath }
		);

		if (result.records.length === 0) {
			return { error: `No field found with xpath "${xpath}"` };
		}

		const rec = result.records[0];
		return {
			objectName: rec.get('objectName'),
			name: rec.get('name'),
			mandatory: rec.get('mandatory'),
			characteristics: rec.get('characteristics'),
			type: rec.get('typeName'),
			description: rec.get('description'),
			xpath: rec.get('xpath'),
			cedsId: rec.get('cedsId'),
			depth: toNumber(rec.get('depth')),
			isAttribute: rec.get('isAttribute'),
			pathSegments: rec.get('pathSegments'),
			complexType: rec.get('complexTypeName'),
			codesetValues: rec.get('codesetValues'),
			codesetValueCount: rec.get('codesetValueCount') ? toNumber(rec.get('codesetValueCount')) : null,
		};
	},

	searchFields: async (session, params) => {
		const pattern = params.pattern;
		if (!pattern) throw new Error('searchFields requires --pattern');

		const limit = params.limit ? parseInt(params.limit) : 50;

		const result = await session.run(
			`MATCH (obj:SifObject)-[:HAS_FIELD]->(f:SifField)
			 WHERE toLower(f.name) CONTAINS toLower($pattern)
				OR toLower(f.description) CONTAINS toLower($pattern)
			 OPTIONAL MATCH (f)-[:HAS_TYPE]->(t)
			 RETURN obj.name AS objectName, f.name AS name, f.xpath AS xpath,
					f.cedsId AS cedsId, f.description AS description, t.name AS typeName
			 ORDER BY f.name
			 LIMIT $limit`,
			{ pattern, limit: neo4j.int(limit) }
		);

		return result.records.map(rec => ({
			objectName: rec.get('objectName'),
			name: rec.get('name'),
			xpath: rec.get('xpath'),
			cedsId: rec.get('cedsId'),
			type: rec.get('typeName'),
			description: rec.get('description'),
		}));
	},

	fieldsByCedsId: async (session, params) => {
		const cedsId = params.cedsId;
		if (!cedsId) throw new Error('fieldsByCedsId requires --cedsId');

		const result = await session.run(
			`MATCH (obj:SifObject)-[:HAS_FIELD]->(f:SifField)
			 WHERE f.cedsId = $cedsId
			 OPTIONAL MATCH (f)-[:HAS_TYPE]->(t)
			 RETURN obj.name AS objectName, f.name AS name, f.xpath AS xpath,
					f.description AS description, t.name AS typeName
			 ORDER BY obj.name`,
			{ cedsId }
		);

		return result.records.map(rec => ({
			objectName: rec.get('objectName'),
			name: rec.get('name'),
			xpath: rec.get('xpath'),
			type: rec.get('typeName'),
			description: rec.get('description'),
		}));
	},

	inboundReferences: async (session, params) => {
		const objectName = params.name;
		if (!objectName) throw new Error('inboundReferences requires --name or positional arg');

		const result = await session.run(
			`MATCH (other:SifObject)-[r:REFERENCES]->(s:SifObject)
			 WHERE toLower(s.name) = toLower($name) OR toLower(s.tableName) = toLower($name)
			 RETURN other.name AS referencingObject, r.via AS viaProperty, r.mandatory AS mandatory
			 ORDER BY other.name`,
			{ name: objectName }
		);

		return result.records.map(rec => ({
			referencingObject: rec.get('referencingObject'),
			viaProperty: rec.get('viaProperty'),
			mandatory: rec.get('mandatory'),
		}));
	},

	outboundReferences: async (session, params) => {
		const objectName = params.name;
		if (!objectName) throw new Error('outboundReferences requires --name or positional arg');

		const result = await session.run(
			`MATCH (s:SifObject)-[r:REFERENCES]->(other:SifObject)
			 WHERE toLower(s.name) = toLower($name) OR toLower(s.tableName) = toLower($name)
			 RETURN other.name AS referencedObject, r.via AS viaProperty, r.mandatory AS mandatory
			 ORDER BY other.name`,
			{ name: objectName }
		);

		return result.records.map(rec => ({
			referencedObject: rec.get('referencedObject'),
			viaProperty: rec.get('viaProperty'),
			mandatory: rec.get('mandatory'),
		}));
	},

	findPath: async (session, params) => {
		const sourceName = params.source;
		const targetName = params.target;
		if (!sourceName || !targetName) throw new Error('findPath requires --source and --target');

		const result = await session.run(
			`MATCH (a:SifObject), (b:SifObject)
			 WHERE (toLower(a.name) = toLower($source) OR toLower(a.tableName) = toLower($source))
			   AND (toLower(b.name) = toLower($target) OR toLower(b.tableName) = toLower($target))
			 MATCH pathResult = shortestPath((a)-[:REFERENCES*]-(b))
			 RETURN [n IN nodes(pathResult) | n.name] AS objectPath,
					[r IN relationships(pathResult) | r.via] AS viaProperties,
					length(pathResult) AS hops`,
			{ source: sourceName, target: targetName }
		);

		if (result.records.length === 0) {
			return { error: `No path found between "${sourceName}" and "${targetName}"` };
		}

		const rec = result.records[0];
		return {
			objectPath: rec.get('objectPath'),
			viaProperties: rec.get('viaProperties'),
			hops: toNumber(rec.get('hops')),
		};
	},

	searchByName: async (session, params) => {
		const pattern = params.pattern;
		if (!pattern) throw new Error('searchByName requires --pattern or positional arg');

		const result = await session.run(
			`MATCH (s:SifObject)
			 WHERE toLower(s.name) CONTAINS toLower($pattern)
				OR toLower(s.tableName) CONTAINS toLower($pattern)
			 RETURN s.name AS name, s.tableName AS tableName, s.fieldCount AS fieldCount
			 ORDER BY s.name`,
			{ pattern }
		);

		return result.records.map(rec => ({
			name: rec.get('name'),
			tableName: rec.get('tableName'),
			fieldCount: toNumber(rec.get('fieldCount')),
		}));
	},

	describeComplexType: async (session, params) => {
		const typeName = params.name;
		if (!typeName) throw new Error('describeComplexType requires --name');

		// Get the complex type and its fields
		const result = await session.run(
			`MATCH (ct:SifComplexType {name: $name})
			 OPTIONAL MATCH (f:SifField)-[:MEMBER_OF]->(ct)
			 OPTIONAL MATCH (obj:SifObject)-[:HAS_FIELD]->(f)
			 RETURN ct.name AS name, ct.objectCount AS objectCount, ct.fieldCount AS fieldCount,
					collect(DISTINCT obj.name) AS usedByObjects,
					collect(DISTINCT {fieldName: f.name, xpath: f.xpath, objectName: obj.name}) AS fields`,
			{ name: typeName }
		);

		if (result.records.length === 0) {
			return { error: `No complex type found matching "${typeName}"` };
		}

		const rec = result.records[0];

		// Get child complex types
		const childResult = await session.run(
			`MATCH (ct:SifComplexType {name: $name})-[:CONTAINS]->(child:SifComplexType)
			 RETURN child.name AS name, child.fieldCount AS fieldCount
			 ORDER BY child.name`,
			{ name: typeName }
		);

		return {
			name: rec.get('name'),
			objectCount: toNumber(rec.get('objectCount')),
			fieldCount: toNumber(rec.get('fieldCount')),
			usedByObjects: rec.get('usedByObjects'),
			children: childResult.records.map(r => ({
				name: r.get('name'),
				fieldCount: toNumber(r.get('fieldCount')),
			})),
			sampleFields: rec.get('fields').slice(0, 20),
		};
	},

	listComplexTypes: async (session, _params) => {
		const result = await session.run(
			`MATCH (ct:SifComplexType)
			 RETURN ct.name AS name, ct.objectCount AS objectCount, ct.fieldCount AS fieldCount
			 ORDER BY ct.objectCount DESC, ct.name
			 LIMIT 100`
		);

		return result.records.map(rec => ({
			name: rec.get('name'),
			objectCount: toNumber(rec.get('objectCount')),
			fieldCount: toNumber(rec.get('fieldCount')),
		}));
	},

	describeCodeset: async (session, params) => {
		const fieldXpath = params.xpath;
		const fieldName = params.name;
		if (!fieldXpath && !fieldName) throw new Error('describeCodeset requires --xpath or --name');

		let query, queryParams;
		if (fieldXpath) {
			query = `MATCH (f:SifField {xpath: $xpath})-[:CONSTRAINED_BY]->(cs:SifCodeset)
					 RETURN f.name AS fieldName, f.xpath AS xpath, cs.values AS values, cs.valueCount AS valueCount`;
			queryParams = { xpath: fieldXpath };
		} else {
			query = `MATCH (f:SifField)-[:CONSTRAINED_BY]->(cs:SifCodeset)
					 WHERE toLower(f.name) = toLower($name)
					 RETURN f.name AS fieldName, f.xpath AS xpath, cs.values AS values, cs.valueCount AS valueCount
					 LIMIT 10`;
			queryParams = { name: fieldName };
		}

		const result = await session.run(query, queryParams);

		if (result.records.length === 0) {
			return { error: `No codeset found for "${fieldXpath || fieldName}"` };
		}

		return result.records.map(rec => ({
			fieldName: rec.get('fieldName'),
			xpath: rec.get('xpath'),
			values: rec.get('values'),
			valueCount: toNumber(rec.get('valueCount')),
		}));
	},

	xmlTree: async (session, params) => {
		const objectName = params.name;
		if (!objectName) throw new Error('xmlTree requires --name');

		const maxDepth = params.depth ? parseInt(params.depth) : 3;

		const result = await session.run(
			`MATCH (obj:SifObject)-[:HAS_ROOT_ELEMENT]->(root:SifXmlElement)
			 WHERE toLower(obj.name) = toLower($name) OR toLower(obj.tableName) = toLower($name)
			 OPTIONAL MATCH path = (root)-[:CHILD_ELEMENT*0..` + maxDepth + `]->(descendant:SifXmlElement)
			 RETURN obj.name AS objectName,
					[n IN nodes(path) | {name: n.name, path: n.path, depth: n.depth, isLeaf: n.isLeaf}] AS treePath
			 ORDER BY [n IN nodes(path) | n.path]`,
			{ name: objectName }
		);

		if (result.records.length === 0) {
			return { error: `No XML tree found for "${objectName}"` };
		}

		return {
			objectName: result.records[0].get('objectName'),
			paths: result.records.map(rec => rec.get('treePath')),
		};
	},

	rawCypher: async (session, params) => {
		const cypherQuery = params.query;
		if (!cypherQuery) throw new Error('rawCypher requires --query');

		const result = await session.run(cypherQuery);

		return result.records.map(rec => {
			const row = {};
			for (const key of rec.keys) {
				const val = rec.get(key);
				if (val && val.toNumber) {
					row[key] = val.toNumber();
				} else if (val && typeof val === 'object' && val.properties) {
					row[key] = val.properties;
				} else {
					row[key] = val;
				}
			}
			return row;
		});
	},

	semanticSearch: async (session, params) => {
		const query = params.query;
		if (!query) throw new Error('semanticSearch requires --query or positional arg');

		const limit = params.limit ? parseInt(params.limit) : 20;

		// Load config to get voyageApiKey
		let config;
		try {
			config = loadConfig();
		} catch (err) {
			throw new Error(`Config error: ${err.message}`);
		}

		if (!config.voyageApiKey) {
			throw new Error('semanticSearch requires voyageApiKey in sifSpecGraphSearch.ini');
		}

		const queryEmbedding = await embedQuery(query, config.voyageApiKey);

		const result = await session.run(`
			CALL db.index.vector.queryNodes('sif_field_vector', $limit, $embedding)
			YIELD node, score
			MATCH (obj:SifObject)-[:HAS_FIELD]->(node)
			RETURN obj.name AS objectName, node.name AS fieldName, node.xpath AS xpath,
				node.description AS description, node.cedsId AS cedsId, score AS similarity
		`, { limit: neo4j.int(limit), embedding: queryEmbedding });

		return result.records.map(rec => ({
			objectName: rec.get('objectName'),
			fieldName: rec.get('fieldName'),
			xpath: rec.get('xpath'),
			description: rec.get('description'),
			cedsId: rec.get('cedsId'),
			similarity: rec.get('similarity'),
		}));
	},
};

// =====================================================================
// HELPERS
// =====================================================================

const toNumber = (val) => {
	if (val && val.toNumber) return val.toNumber();
	return Number(val);
};

// =====================================================================
// SEARCH API (module interface)
// =====================================================================

const search = (queryType, params, callback) => {
	const handler = queryHandlers[queryType];
	if (!handler) {
		callback(`Unknown queryType: "${queryType}". Valid types: ${Object.keys(queryHandlers).join(', ')}`);
		return;
	}

	let config;
	try {
		config = loadConfig();
	} catch (err) {
		callback(`Config error: ${err.message}`);
		return;
	}

	withNeo4jSession(config, (session) => handler(session, params))
		.then((results) => callback(null, results))
		.catch((err) => callback(`Query failed: ${err.message}`));
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
		} else {
			positionalArgs.push(arg);
		}
	}

	const queryType = flags.queryType;
	if (!queryType) {
		console.error(`Usage: node ${path.basename(__filename)} --queryType=<type> [args]`);
		console.error(`Types: ${Object.keys(queryHandlers).join(', ')}`);
		process.exit(1);
	}

	// Build params from flags + positional args
	const params = { ...flags };
	delete params.queryType;

	// Map first positional arg to the appropriate param name
	if (positionalArgs.length > 0) {
		const paramNameMap = {
			describeObject: 'name',
			describeField: 'xpath',
			searchFields: 'pattern',
			fieldsByCedsId: 'cedsId',
			inboundReferences: 'name',
			outboundReferences: 'name',
			findPath: 'source',
			searchByName: 'pattern',
			describeComplexType: 'name',
			describeCodeset: 'xpath',
			xmlTree: 'name',
			semanticSearch: 'query',
		};
		const paramName = paramNameMap[queryType];
		if (paramName && !params[paramName]) {
			params[paramName] = positionalArgs[0];
		}
	}

	search(queryType, params, (err, results) => {
		if (err) {
			console.error(`Error: ${err}`);
			process.exit(1);
		}
		console.log(JSON.stringify(results, null, 2));
	});
}

module.exports = { search };
