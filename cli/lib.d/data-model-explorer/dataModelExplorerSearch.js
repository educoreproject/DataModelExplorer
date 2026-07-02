#!/usr/bin/env node
'use strict';

// dataModelExplorerSearch.js — Multi-tool search across unified education data standards graph
//
// Query types (via CLI flags):
//   -search "query"        Vector search (index discovered at runtime) across ALL standards
//   -findMappings "name"   Find an element's CEDS concept (HubReference) + cross-standard equivalents
//   -compareCodesets "name" Compare codeset values between standards
//   -unmappedFields        DmeProperty nodes with no cross-standard mapping
//   -stats                 Counts by standard and role, mapping coverage
//   -rawCypher --query="..." Passthrough Cypher
//
// Outputs JSON to stdout, diagnostics to stderr.

const os = require('os');
const path = require('path');
const neo4j = require('neo4j-driver');

const moduleName = path.basename(__filename).replace(/.js$/, '');

// =====================================================================
// CONFIG
// =====================================================================

const loadConfig = () => {
	const configFileProcessor = require('qtools-config-file-processor');
	const { resolveContainerConnection } = require('../../../server/data-model/lib/user-graph/container-connection-resolver');

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
	const moduleConfig = config[moduleName];

	// Single source of truth: derive the bolt connection {boltUri,user,password} from the golden
	// container NAME (goldenContainerName) instead of reading redundant neo4j* fields. The
	// neo4j* properties below are the RESOLVED values consumed by withNeo4jSession.
	const { goldenContainerName } = moduleConfig;
	if (!goldenContainerName) {
		throw new Error(`Config [${moduleName}] is missing goldenContainerName (the DME connection source of truth)`);
	}
	const { boltUri, user, password, error } = resolveContainerConnection(goldenContainerName);
	if (error) {
		throw new Error(`Cannot resolve DME connection from goldenContainerName '${goldenContainerName}': ${error}`);
	}
	moduleConfig.neo4jBoltUri = boltUri;
	moduleConfig.neo4jUser = user;
	moduleConfig.neo4jPassword = password;

	return moduleConfig;
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
// QUERY EMBEDDING (via embedder object)
// =====================================================================

const embedQuery = (text, embedder) => new Promise((resolve, reject) => {
	embedder.embed([text], (err, embeddings) => {
		if (err) { reject(new Error(`Embedding failed: ${err}`)); return; }
		resolve(embeddings[0]);
	});
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

// L8: an empty positional arg used to reach CONTAINS '' — matching EVERY node and running
// the three-branch findMappings subquery graph-wide before LIMIT. Reject empty names/queries
// with an explicit error instead.
const requireNonEmpty = (value, whatFor) => {
	if (value === null || value === undefined || `${value}`.trim() === '') {
		throw new Error(`${whatFor} requires a non-empty argument — an empty value would match every node in the graph.`);
	}
};

// L7: deep result serialization — Neo4j Integers become plain numbers at EVERY depth
// (nested node properties previously leaked {low, high} objects), node/relationship
// objects flatten to their properties, and `embedding` vectors are dropped (multi-KB
// float arrays that swamp an LLM consumer for zero value).
const serializeValue = (val) => {
	if (val === null || val === undefined) return val;
	if (neo4j.isInt(val)) return val.toNumber();
	if (Array.isArray(val)) return val.map(serializeValue);
	if (typeof val === 'object') {
		const source = val.properties ? val.properties : val;
		const out = {};
		for (const key of Object.keys(source)) {
			if (key === 'embedding') continue;
			out[key] = serializeValue(source[key]);
		}
		return out;
	}
	return val;
};

// L7 output bounds — a popular hub or a graph-wide rawCypher would otherwise explode the
// JSON output (the known output-cap failure mode for LLM consumers).
const RAW_CYPHER_ROW_CAP = 1000;
const EXPLORE_EDGE_CAP = 200;

// =====================================================================
// QUERY HANDLERS
// =====================================================================

// =====================================================================
// HYBRID SEARCH (single unified vector index, discovered at runtime)
// =====================================================================
//
// The forge graph carries ONE vector index on :ForgedNode(embedding) and no
// fulltext index. All standards share that index, distinguished by the
// _source property. The builder names the index <graphName>_vector
// (replay-engine contract), so the name changes on every rebuild — it is
// discovered live from SHOW INDEXES, cached per process, never hardcoded.

let discoveredVectorIndex = null;

const resolveVectorIndex = async (session) => {
	if (discoveredVectorIndex) return discoveredVectorIndex;
	const result = await session.run(
		'SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties'
	);
	const candidates = result.records
		.map(rec => ({
			name: rec.get('name'),
			type: rec.get('type'),
			entityType: rec.get('entityType'),
			labels: rec.get('labelsOrTypes') || [],
			properties: rec.get('properties') || [],
		}))
		.filter(row =>
			row.type === 'VECTOR' && row.entityType === 'NODE' &&
			row.labels.includes('ForgedNode') && row.properties.includes('embedding')
		);
	if (candidates.length === 0) {
		throw new Error('No VECTOR index on :ForgedNode(embedding) exists on this graph — vector search cannot run.');
	}
	if (candidates.length > 1) {
		throw new Error(`Ambiguous VECTOR indexes on :ForgedNode(embedding): ${candidates.map(row => row.name).join(', ')} — cannot choose safely.`);
	}
	discoveredVectorIndex = candidates[0].name;
	return discoveredVectorIndex;
};

const hybridSearch = async (session, query, config, params) => {
	requireNonEmpty(query, '-search'); // L8
	const limit = 20;
	const standardFilter = (params && params.standard) ? params.standard : null;

	if (!config.embedder) {
		throw new Error('No embedder configured — vector search cannot run. Check voyageApiKey in dataModelExplorerSearch.ini.');
	}

	let queryEmbedding;
	try {
		queryEmbedding = await embedQuery(query, config.embedder);
	} catch (err) {
		throw new Error(`Embedding the query failed: ${err.message}`);
	}

	const vectorIndexName = await resolveVectorIndex(session);

	// Over-fetch so a standard filter still yields a full page after filtering.
	const fetchLimit = standardFilter ? limit * 5 : limit;

	const vecResult = await session.run(`
		CALL db.index.vector.queryNodes($indexName, $limit, $embedding)
		YIELD node, score
		WHERE $standard IS NULL OR node._source = $standard
		RETURN node._id AS id, node._source AS standard, node.role AS role,
			labels(node) AS labels, node.name AS name, node.description AS description,
			score AS vecScore
		LIMIT $outLimit
	`, {
		indexName: vectorIndexName,
		limit: neo4j.int(fetchLimit),
		outLimit: neo4j.int(limit),
		embedding: queryEmbedding,
		standard: standardFilter,
	});

	return vecResult.records.map(rec => ({
		standard: rec.get('standard'),
		id: rec.get('id'),
		role: rec.get('role'),
		labels: rec.get('labels').filter(l => l !== 'ForgedNode' && l !== 'golden'),
		name: rec.get('name'),
		description: rec.get('description'),
		score: rec.get('vecScore'),
	}));
};

const findMappings = async (session, nameOrId) => {
	requireNonEmpty(nameOrId, '-findMappings'); // L8
	const result = await session.run(`
		MATCH (n:ForgedNode)
		WHERE toLower(n.name) CONTAINS toLower($name) OR n._id = $name
		   OR n.path = $name OR n.stableId = $name
		CALL {
			WITH n
			// outgoing: this element resolves to its CEDS tuple (a HubReference), shown via
			// its decomposed CEDS domain/property. EXACT_MATCH = authored, CLOSE_MATCH = inferred.
			MATCH (n)-[m:EXACT_MATCH|CLOSE_MATCH]->(hub:HubReference)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN 'outgoing' AS direction, n._source AS fromSource, n.name AS fromName,
			       'CEDS' AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       type(m) AS mappingType, m.confidence AS confidence,
			       m.provenanceTier AS provenanceTier, m.predicate AS matchPredicate,
			       null AS viaMatchType, null AS viaConfidence, null AS viaPredicate,
			       cd.name AS cedsDomain, cp.name AS cedsProperty,
			       coalesce(cr.name, hub.rangeDatatype) AS cedsRange, cv.name AS cedsValue, cq.name AS cedsQualifier
			UNION
			WITH n
			// shared-hub pair: another standard's element resolving to the SAME CEDS tuple.
			// Conservativity: 'equivalent' ONLY when BOTH hops are authored (EXACT_MATCH x
			// EXACT_MATCH); if either hop is inferred (CLOSE_MATCH) the pair is a hypothesis
			// and is labeled 'candidateEquivalent'. Both hops' evidence is returned: the
			// far element's edge in mappingType/confidence/matchPredicate, n's own edge in
			// viaMatchType/viaConfidence/viaPredicate — never a fabricated combined score.
			MATCH (n)-[mNear:EXACT_MATCH|CLOSE_MATCH]->(hub:HubReference)<-[m:EXACT_MATCH|CLOSE_MATCH]-(other:ForgedNode)
			WHERE other <> n
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN CASE WHEN type(mNear) = 'EXACT_MATCH' AND type(m) = 'EXACT_MATCH'
			            THEN 'equivalent' ELSE 'candidateEquivalent' END AS direction,
			       other._source AS fromSource, other.name AS fromName,
			       'CEDS' AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       type(m) AS mappingType, m.confidence AS confidence,
			       m.provenanceTier AS provenanceTier, m.predicate AS matchPredicate,
			       type(mNear) AS viaMatchType, mNear.confidence AS viaConfidence, mNear.predicate AS viaPredicate,
			       cd.name AS cedsDomain, cp.name AS cedsProperty,
			       coalesce(cr.name, hub.rangeDatatype) AS cedsRange, cv.name AS cedsValue, cq.name AS cedsQualifier
	UNION
			WITH n
			// incoming: when n is a CEDS leaf, the source elements that resolve to a tuple
			// containing it. The hub decomposes like every other arm (no n.name stand-ins).
			MATCH (n)<-[:HAS_CEDS_PROPERTY|HAS_CEDS_VALUE]-(hub:HubReference)<-[m:EXACT_MATCH|CLOSE_MATCH]-(src:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN 'incoming' AS direction, src._source AS fromSource, src.name AS fromName,
			       'CEDS' AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       type(m) AS mappingType, m.confidence AS confidence,
			       m.provenanceTier AS provenanceTier, m.predicate AS matchPredicate,
			       null AS viaMatchType, null AS viaConfidence, null AS viaPredicate,
			       cd.name AS cedsDomain, cp.name AS cedsProperty,
			       coalesce(cr.name, hub.rangeDatatype) AS cedsRange, cv.name AS cedsValue, cq.name AS cedsQualifier
		}
		RETURN direction, fromSource, fromName, toSource, toName, toId,
		       mappingType, confidence, provenanceTier, matchPredicate,
		       viaMatchType, viaConfidence, viaPredicate, cedsDomain, cedsProperty,
		       cedsRange, cedsValue, cedsQualifier
		ORDER BY confidence DESC
		LIMIT 30
	`, { name: nameOrId });

	return result.records.map(rec => {
		// cedsTuple: the CEDS anchor rendered as its full tuple (domain · property · range [· value]),
		// with the canonicalKey in parens — so consumers show the tuple, not just the bare Global ID.
		const tupleParts = [rec.get('cedsDomain'), rec.get('cedsProperty'), rec.get('cedsRange'), rec.get('cedsValue')].filter(Boolean);
		return {
			direction: rec.get('direction'),
			fromSource: rec.get('fromSource'),
			fromName: rec.get('fromName'),
			toSource: rec.get('toSource'),
			toName: rec.get('toName'),
			toId: rec.get('toId'),
			mappingType: rec.get('mappingType'),
			confidence: rec.get('confidence') != null ? Number(rec.get('confidence')) : null,
			provenanceTier: rec.get('provenanceTier'),
			matchPredicate: rec.get('matchPredicate'),
			viaMatchType: rec.get('viaMatchType'),
			viaConfidence: rec.get('viaConfidence') != null ? Number(rec.get('viaConfidence')) : null,
			viaPredicate: rec.get('viaPredicate'),
			cedsDomain: rec.get('cedsDomain'),
			cedsProperty: rec.get('cedsProperty'),
			cedsRange: rec.get('cedsRange'),
			cedsValue: rec.get('cedsValue'),
			cedsQualifier: rec.get('cedsQualifier'),
			cedsTuple: tupleParts.length ? `${tupleParts.join(' · ')} (${rec.get('toId')})` : null,
		};
	});
};

const compareCodesets = async (session, name) => {
	requireNonEmpty(name, '-compareCodesets'); // L8
	// Codeset comparison in the equivalence model: each source option VALUE resolves to a
	// value-tier HubReference (the canonical CEDS option value); values from other standards that
	// land on the same HubReference are the cross-standard equivalents. Unmatched values (matchType
	// null) show where a codeset does NOT align to CEDS.
	const result = await session.run(`
		MATCH (os:ForgedNode {role: 'DmeOptionSet'})
		WHERE toLower(os.name) CONTAINS toLower($name) AND os._source <> 'CEDS'
		MATCH (os)-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})
		OPTIONAL MATCH (v)-[m:EXACT_MATCH|CLOSE_MATCH]->(hub:HubReference {referenceTier: 'value'})
		OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
		OPTIONAL MATCH (hub)<-[:EXACT_MATCH|CLOSE_MATCH]-(ov:ForgedNode)
		WHERE ov._source <> os._source
		RETURN os._source AS sourceStandard, os.name AS optionSetName,
		       v.name AS sourceValue, type(m) AS matchType, m.confidence AS confidence,
		       cv.name AS cedsValue, hub.canonicalKey AS cedsValueKey,
		       collect(DISTINCT ov._source + ': ' + ov.name) AS crossStandardEquivalents
		ORDER BY os._source, os.name, v.name
		LIMIT 100
	`, { name });

	return result.records.map(rec => ({
		sourceStandard: rec.get('sourceStandard'),
		optionSetName: rec.get('optionSetName'),
		sourceValue: rec.get('sourceValue'),
		matchType: rec.get('matchType'),
		confidence: rec.get('confidence') != null ? Number(rec.get('confidence')) : null,
		cedsValue: rec.get('cedsValue'),
		cedsValueKey: rec.get('cedsValueKey'),
		crossStandardEquivalents: rec.get('crossStandardEquivalents').filter(s => s && !s.startsWith('null')),
	}));
};

const unmappedFields = async (session, params) => {
	const limit = params.limit ? parseInt(params.limit) : 50;
	const standard = params.standard || null;

	const result = await session.run(`
		MATCH (f:ForgedNode {role: 'DmeProperty'})
		WHERE ($standard IS NULL OR f._source = $standard)
		  AND NOT (f)-[:EXACT_MATCH|CLOSE_MATCH]->(:HubReference)
		RETURN f._source AS standard, f.name AS fieldName, f.path AS path,
		       f.description AS description
		ORDER BY f._source, f.name
		LIMIT $limit
	`, { limit: neo4j.int(limit), standard });

	return result.records.map(rec => ({
		standard: rec.get('standard'),
		fieldName: rec.get('fieldName'),
		path: rec.get('path'),
		description: rec.get('description'),
	}));
};

const getStats = async (session) => {
	// Node counts by standard (_source)
	const bySourceResult = await session.run(`
		MATCH (n:ForgedNode)
		RETURN coalesce(n._source, 'UNSCOPED') AS source, count(n) AS count
		ORDER BY count DESC
	`);
	const bySource = {};
	for (const rec of bySourceResult.records) {
		bySource[rec.get('source')] = toNumber(rec.get('count'));
	}

	// Node counts by universal-contract role
	const byRoleResult = await session.run(`
		MATCH (n:ForgedNode)
		WHERE n.role IS NOT NULL
		RETURN n.role AS role, count(n) AS count
		ORDER BY count DESC
	`);
	const byRole = {};
	for (const rec of byRoleResult.records) {
		byRole[rec.get('role')] = toNumber(rec.get('count'));
	}

	// Cross-standard mapping edge counts
	const mappingResult = await session.run(`
		MATCH ()-[r]->()
		WHERE type(r) IN ['EXACT_MATCH', 'CLOSE_MATCH']
		RETURN type(r) AS relType, count(r) AS count
	`);
	const mappings = {};
	for (const rec of mappingResult.records) {
		mappings[rec.get('relType')] = toNumber(rec.get('count'));
	}

	// Mapping coverage over DmeProperty nodes
	const coverageResult = await session.run(`
		MATCH (f:ForgedNode {role: 'DmeProperty'})
		WITH count(f) AS totalProperties,
		     count(CASE WHEN (f)-[:EXACT_MATCH|CLOSE_MATCH]->(:HubReference) THEN 1 END) AS mappedProperties
		RETURN totalProperties, mappedProperties
	`);
	let coverage = {};
	if (coverageResult.records.length > 0) {
		const rec = coverageResult.records[0];
		coverage = {
			totalProperties: toNumber(rec.get('totalProperties')),
			mappedProperties: toNumber(rec.get('mappedProperties')),
		};
	}

	return { bySource, byRole, mappings, coverage };
};

// =====================================================================
// LIST STANDARDS
// =====================================================================
//
// The authoritative inventory of every registered standard in the forge
// golden graph, joined live against ForgedNode counts. Use this — not
// getStats — to answer "what standards are loaded?" or "list all standards."
// getStats covers node counts by _source and role; this query reads
// :DmeStandardRoot, the per-standard passport node emitted by every forge
// during -export, and counts the ForgedNodes sharing its _source.

const getListStandards = async (session) => {
	const result = await session.run(`
		MATCH (r:DmeStandardRoot)
		CALL {
			WITH r
			MATCH (n:ForgedNode {_source: r._source})
			RETURN count(n) AS nodeCount
		}
		RETURN r._source AS source,
		       r.name AS name,
		       r.standardName AS standardName,
		       r.description AS description,
		       r.version AS version,
		       r.sourceUrl AS sourceUrl,
		       nodeCount
		ORDER BY source
	`);

	const standards = result.records.map(rec => ({
		source: rec.get('source'),
		name: rec.get('name'),
		standardName: rec.get('standardName'),
		description: rec.get('description'),
		version: rec.get('version'),
		sourceUrl: rec.get('sourceUrl'),
		nodeCount: toNumber(rec.get('nodeCount'))
	}));

	return { standards, count: standards.length };
};

const exploreNode = async (session, params) => {
	const name = params.name;
	requireNonEmpty(name, '-explore'); // L8
	const standard = params.standard || null;
	// L7: bound the per-node edge lists — a standard root or popular hub explodes the JSON
	// otherwise. Truncation is REPORTED via the totals, never silent.
	const edgeCap = params.limit ? parseInt(params.limit) : EXPLORE_EDGE_CAP;

	// Get outgoing relationships
	const outgoingResult = await session.run(`
		MATCH (n:ForgedNode)
		WHERE n.name = $name
		  AND ($standard IS NULL OR n._source = $standard)
		WITH n
		OPTIONAL MATCH (n)-[r]->(m:ForgedNode)
		RETURN n {.*, _labels: labels(n)} AS node,
		  collect(CASE WHEN m IS NOT NULL THEN {type: type(r), target: m.name, targetSource: m._source, targetLabels: labels(m)} ELSE NULL END) AS outgoing
	`, { name, standard });

	// Get incoming relationships
	const incomingResult = await session.run(`
		MATCH (n:ForgedNode)
		WHERE n.name = $name
		  AND ($standard IS NULL OR n._source = $standard)
		WITH n
		OPTIONAL MATCH (m:ForgedNode)-[r]->(n)
		RETURN n {.*, _labels: labels(n)} AS node,
		  collect(CASE WHEN m IS NOT NULL THEN {type: type(r), source: m.name, sourceStandard: m._source, sourceLabels: labels(m)} ELSE NULL END) AS incoming
	`, { name, standard });

	const nodes = new Map();

	const cleanNode = (node) => {
		const cleaned = Object.assign({}, node);
		delete cleaned.embedding;
		return cleaned;
	};

	for (const rec of outgoingResult.records) {
		const node = rec.get('node');
		const key = JSON.stringify(node._labels) + ':' + node.name;
		if (!nodes.has(key)) {
			nodes.set(key, { node: cleanNode(node), outgoing: [], incoming: [] });
		}
		const out = rec.get('outgoing').filter(o => o !== null);
		const entry = nodes.get(key);
		entry.outgoingTotal = out.length;
		entry.outgoing = out.slice(0, edgeCap).map(serializeValue);
	}

	for (const rec of incomingResult.records) {
		const node = rec.get('node');
		const key = JSON.stringify(node._labels) + ':' + node.name;
		if (!nodes.has(key)) {
			nodes.set(key, { node: cleanNode(node), outgoing: [], incoming: [] });
		}
		const inc = rec.get('incoming').filter(i => i !== null);
		const entry = nodes.get(key);
		entry.incomingTotal = inc.length;
		entry.incoming = inc.slice(0, edgeCap).map(serializeValue);
	}

	return [...nodes.values()].map((entry) => ({
		...entry,
		edgesTruncated:
			(entry.outgoingTotal || 0) > edgeCap || (entry.incomingTotal || 0) > edgeCap,
	}));
};

const historyEvents = async (session, params) => {
	// L7: the limit param is now actually applied (it was accepted and ignored).
	const limit = params.limit ? parseInt(params.limit) : 20;
	const result = await session.run(`
		MATCH (g:GraphProvenance)
		RETURN g.graphName AS graphName, g.manifestKey AS manifestKey,
		       toString(g.builtAt) AS builtAt, g.builtBy AS builtBy,
		       g.standardsIncluded AS standardsIncluded,
		       g.nodeCountAtBuild AS nodeCount, g.edgeCountAtBuild AS edgeCount,
		       g.status AS status, g.provenanceTierComplete AS provenanceTierComplete
		ORDER BY builtAt DESC
		LIMIT $limit
	`, { limit: neo4j.int(limit) });

	return result.records.map(rec => ({
		graphName: rec.get('graphName'),
		manifestKey: rec.get('manifestKey'),
		builtAt: rec.get('builtAt'),
		builtBy: rec.get('builtBy'),
		standardsIncluded: rec.get('standardsIncluded'),
		nodeCount: toNumber(rec.get('nodeCount')),
		edgeCount: toNumber(rec.get('edgeCount')),
		status: rec.get('status'),
		provenanceTierComplete: rec.get('provenanceTierComplete'),
	}));
};

const rawCypher = async (session, query) => {
	requireNonEmpty(query, '-rawCypher'); // L8
	const result = await session.run(query);
	// L7: deep serialization (nested Integers -> numbers, embeddings dropped) and a row
	// cap — truncation is REPORTED, never silent.
	const totalRecords = result.records.length;
	const records = result.records.slice(0, RAW_CYPHER_ROW_CAP).map(rec => {
		const obj = {};
		for (const key of rec.keys) {
			obj[key] = serializeValue(rec.get(key));
		}
		return obj;
	});
	return {
		recordCount: records.length,
		totalRecordCount: totalRecords,
		truncated: totalRecords > records.length,
		records,
	};
};

// =====================================================================
// GRAPH RETRIEVER (VectorCypherRetriever)
// =====================================================================

const graphRetriever = async (session, query, config, params) => {
	const { retrieve } = require('./lib/vectorCypherRetriever');

	const limit = params.limit ? parseInt(params.limit) : 10;
	const traversalMode = params.traversalMode || 'static';
	const searchMode = params.searchMode || 'hybrid';

	const traversalFilePath = path.join(__dirname, 'traversal.cypher');
	const schemaFilePath = path.join(__dirname, 'schema-summary.json');

	return retrieve({
		neo4jSession: session,
		queryText: query,
		embedder: config.embedder,
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
		// Create provider-agnostic embedder from config
		// An unresolved ini token ('<!voyageApiKey!>') means the key is absent — no embedder
		if (config.voyageApiKey && !config.voyageApiKey.startsWith('<!')) {
			const { embeddingClient } = require('qtools-graph-forge-core');
			config.embedder = embeddingClient.create({
				provider: 'voyage',
				model: 'voyage-4-large',
				dimension: 1024,
				apiKey: config.voyageApiKey,
				batchSize: 20
			});
		}
	} catch (err) {
		if (callback) return callback(`Config error: ${err.message}`);
		throw err;
	}

	try {
		const result = await withNeo4jSession(config, async (session) => {
			switch (queryType) {
				case 'search': return hybridSearch(session, params.query, config, params);
				case 'graphRetriever': return graphRetriever(session, params.query, config, params);
				case 'findMappings': return findMappings(session, params.name);
				case 'compareCodesets': return compareCodesets(session, params.name);
				case 'unmappedFields': return unmappedFields(session, params);
				case 'stats': return getStats(session);
				case 'listStandards': return getListStandards(session);
				case 'rawCypher': return rawCypher(session, params.query);
				case 'explore': return exploreNode(session, params);
				case 'history': return historyEvents(session, params);
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
		params.query = flags.query || positionalArgs[0] || '';
		if (flags.standard) params.standard = flags.standard;
	} else if (flags.explore) {
		queryType = 'explore';
		params.name = flags.name || positionalArgs[0] || '';
		if (flags.standard) params.standard = flags.standard;
	} else if (flags.history) {
		queryType = 'history';
		params.limit = flags.limit || '20';
		if (flags.standard) params.standard = flags.standard;
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
	} else if (flags.listStandards) {
		queryType = 'listStandards';
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
  ${moduleName} -search "query text" [--standard=PESC]
  ${moduleName} -graphRetriever "query text" [--limit=10] [--traversalMode=static] [--searchMode=hybrid]
  ${moduleName} -explore --name="NodeName" [--standard=PESC]
  ${moduleName} -history [--standard=PESC] [--limit=20]
  ${moduleName} -findMappings "field name or xpath"
  ${moduleName} -compareCodesets "concept name"
  ${moduleName} -unmappedFields [--limit=50]
  ${moduleName} -stats
  ${moduleName} -listStandards
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
