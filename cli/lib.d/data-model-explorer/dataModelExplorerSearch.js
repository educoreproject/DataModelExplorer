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

const withNeo4jSession = async (config, queryFn, { readOnly = false } = {}) => {
	const driver = neo4j.driver(
		config.neo4jBoltUri,
		neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
		{ encrypted: false }
	);
	// Wave B carry-forward (CRIMSON gate 7): new query types are born READ-ONLY — the session itself
	// refuses writes, not just the query text. Existing verbs keep their prior behavior (the deferred
	// C2 read-only migration is a separate item, not silently changed here).
	const session = readOnly
		? driver.session({ defaultAccessMode: neo4j.session.READ })
		: driver.session();

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

// =====================================================================
// MATCH RELATIONS — lane Q, 2026-10-04
// =====================================================================
//
// A match edge asserts one of four SKOS relations, one edge type each. Every match edge is a
// JUDGMENT carrying mappingConfidence / mappingKind / mappingSource (absent on graphs built before
// those fields existed). EXACT and CLOSE are the COMPOSING relations: two elements sharing a hub
// through them are 'equivalent' (EXACT x EXACT) or 'candidateEquivalent'. A BROAD or NARROW hop
// makes the pair only 'related' — both elements narrower than one broad tuple are not the same
// thing. Composing rows sort ahead of broad/narrow ones, so a LIMIT never drops them for those.
//
// Match edges no longer carry provenanceTier (TQ, 2026-10-04): mappingKind ('inferred' | 'authored')
// replaces it, and a debug judge's edges are recognised by mappingSource 'bridge-debug'.

const MATCH_EDGE_TYPE_LIST = ['EXACT_MATCH', 'CLOSE_MATCH', 'BROAD_MATCH', 'NARROW_MATCH'];
const COMPOSING_MATCH_EDGE_TYPE_LIST = ['EXACT_MATCH', 'CLOSE_MATCH'];
const MATCH_EDGE_PATTERN = MATCH_EDGE_TYPE_LIST.join('|');

const sharedHubDirectionOf = (nearMatchTypeExpression, farMatchTypeExpression) =>
	`CASE WHEN ${nearMatchTypeExpression} = 'EXACT_MATCH' AND ${farMatchTypeExpression} = 'EXACT_MATCH' THEN 'equivalent'
	      WHEN ${nearMatchTypeExpression} IN $composingMatchEdgeTypeList AND ${farMatchTypeExpression} IN $composingMatchEdgeTypeList THEN 'candidateEquivalent'
	      ELSE 'related' END`;

const JUDGMENT_FIELD_NAME_LIST = [
	'mappingConfidence',
	'mappingKind',
	'mappingSource',
	'viaMappingConfidence',
	'viaMappingKind',
	'viaMappingSource',
];
const JUDGMENT_CONFIDENCE_FIELD_NAME_LIST = ['mappingConfidence', 'viaMappingConfidence'];

// =====================================================================
// INSTANCE NODES (HAS_INSTANCE) — lane D, 2026-10-01
// =====================================================================
//
// SIF and PESC write their CEDS mapping edges onto INSTANCE nodes, not onto the element the
// DME finds. A SIF Question (DmeProperty) -[:HAS_INSTANCE]-> one Field (DmeSupport) per object it
// appears in; a PESC element declaration (DmeProperty) -[:HAS_INSTANCE]-> one occurrence
// (DmeSupport) per place it appears in the document. The bridges fan their verdicts out onto
// those instances, so the declaration itself carries no mapping edge. CEDS and Ed-Fi have no
// HAS_INSTANCE edges, and every arm below reduces to its old self on them.
//
// An instance's GROUP is where it sits: the SIF Object that owns the Field (HAS_FIELD), else the
// PESC occurrence's sectionPath. When neither exists the instance contributes no group name —
// the count still includes it, and no group is invented.
//
// Instance fields are attached to a row ONLY when the row involves instances (an absent field
// means "no instances", never null), so CEDS and Ed-Fi rows serialize exactly as before.

const instanceGroupOf = (instanceVariable) =>
	`coalesce(head([(groupObject:ForgedNode)-[:HAS_FIELD]->(${instanceVariable}) | groupObject.name]), ${instanceVariable}.sectionPath)`;

const declarationOf = (instanceVariable) =>
	`head([(declaration:ForgedNode)-[:HAS_INSTANCE]->(${instanceVariable}) | declaration])`;

const INSTANCE_FIELD_NAME_LIST = [
	'fromElementId',
	'instanceOf',
	'instanceGroupList',
	'instanceCount',
	'viaInstanceGroupList',
	'viaInstanceCount',
];

const INSTANCE_GROUP_LIST_NAME_LIST = ['instanceGroupList', 'viaInstanceGroupList'];
const INSTANCE_GROUP_LIST_CAP = 25;

const findMappings = async (session, nameOrId) => {
	requireNonEmpty(nameOrId, '-findMappings'); // L8
	const result = await session.run(`
		MATCH (n:ForgedNode)
		WHERE toLower(n.name) CONTAINS toLower($name) OR n._id = $name
		   OR n.path = $name OR n.stableId = $name
		// An instance whose declaration ALSO matched is reported through that declaration (the
		// outgoingViaInstance arm, grouped), not again as one loose same-named row per instance.
		WITH n
		WHERE NOT EXISTS {
			MATCH (matchedDeclaration:ForgedNode)-[:HAS_INSTANCE]->(n)
			WHERE toLower(matchedDeclaration.name) CONTAINS toLower($name) OR matchedDeclaration._id = $name
			   OR matchedDeclaration.path = $name OR matchedDeclaration.stableId = $name
		}
		CALL {
			WITH n
			// outgoing: this element resolves to its CEDS tuple (a HubReference), shown via
			// its decomposed CEDS domain/property, under any of the four relations.
			MATCH (n)-[m:${MATCH_EDGE_PATTERN}]->(hub:HubReference)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			WITH n, m, hub, cd, cp, cr, cv, cq, ${declarationOf('n')} AS nDeclaration
			RETURN 'outgoing' AS direction, n._source AS fromSource, n.name AS fromName,
			       'CEDS' AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       type(m) AS mappingType, m.confidence AS confidence,
			       m.predicate AS matchPredicate,
			       m.mappingConfidence AS mappingConfidence, m.mappingKind AS mappingKind, m.mappingSource AS mappingSource,
			       null AS viaMatchType, null AS viaConfidence, null AS viaPredicate,
			       null AS viaMappingConfidence, null AS viaMappingKind, null AS viaMappingSource,
			       cd.name AS cedsDomain, cp.name AS cedsProperty,
			       coalesce(cr.name, hub.rangeDatatype) AS cedsRange, cv.name AS cedsValue, cq.name AS cedsQualifier,
			       CASE WHEN nDeclaration IS NULL THEN null ELSE n._id END AS fromElementId,
			       nDeclaration.name AS instanceOf,
			       CASE WHEN nDeclaration IS NULL THEN null ELSE [groupName IN [${instanceGroupOf('n')}] WHERE groupName IS NOT NULL] END AS instanceGroupList,
			       CASE WHEN nDeclaration IS NULL THEN null ELSE 1 END AS instanceCount,
			       null AS viaInstanceGroupList, null AS viaInstanceCount
			UNION
			WITH n
			// shared-hub pair: another standard's element resolving to the SAME CEDS tuple.
			// Conservativity: 'equivalent' ONLY when BOTH hops are EXACT_MATCH (two judgments of
			// sameness); an EXACT/CLOSE pair with a CLOSE hop is a hypothesis, 'candidateEquivalent';
			// any BROAD/NARROW hop makes it 'related' (sharedHubDirectionOf). Both hops' evidence is returned: the
			// far element's edge in mappingType/confidence/matchPredicate, n's own edge in
			// viaMatchType/viaConfidence/viaPredicate — never a fabricated combined score.
			// A far INSTANCE is reported as its declaration, its instances grouped and counted.
			MATCH (n)-[mNear:${MATCH_EDGE_PATTERN}]->(hub:HubReference)<-[m:${MATCH_EDGE_PATTERN}]-(other:ForgedNode)
			WHERE other <> n
			WITH n, mNear, hub, m, other, ${declarationOf('other')} AS otherDeclaration
			WITH n, mNear, hub, m, other, otherDeclaration, coalesce(otherDeclaration, other) AS farElement
			WHERE NOT (farElement)-[:HAS_INSTANCE]->(n)
			WITH n, mNear, hub, farElement, otherDeclaration IS NOT NULL AS farIsInstanced,
			     type(m) AS farMatchType, m.confidence AS farConfidence, m.predicate AS farPredicate, m.mappingConfidence AS farMappingConfidence, m.mappingKind AS farMappingKind, m.mappingSource AS farMappingSource,
			     CASE WHEN otherDeclaration IS NULL THEN null ELSE ${instanceGroupOf('other')} END AS farGroupName
			WITH n, mNear, hub, farElement, farIsInstanced, farMatchType, farConfidence, farPredicate, farMappingConfidence, farMappingKind, farMappingSource,
			     collect(DISTINCT farGroupName) AS farGroupList, count(*) AS farInstanceCount
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN ${sharedHubDirectionOf('type(mNear)', 'farMatchType')} AS direction,
			       farElement._source AS fromSource, farElement.name AS fromName,
			       'CEDS' AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       farMatchType AS mappingType, farConfidence AS confidence,
			       farPredicate AS matchPredicate,
			       farMappingConfidence AS mappingConfidence, farMappingKind AS mappingKind, farMappingSource AS mappingSource,
			       type(mNear) AS viaMatchType, mNear.confidence AS viaConfidence, mNear.predicate AS viaPredicate,
			       mNear.mappingConfidence AS viaMappingConfidence, mNear.mappingKind AS viaMappingKind, mNear.mappingSource AS viaMappingSource,
			       cd.name AS cedsDomain, cp.name AS cedsProperty,
			       coalesce(cr.name, hub.rangeDatatype) AS cedsRange, cv.name AS cedsValue, cq.name AS cedsQualifier,
			       CASE WHEN farIsInstanced THEN farElement._id ELSE null END AS fromElementId,
			       null AS instanceOf,
			       CASE WHEN farIsInstanced THEN farGroupList ELSE null END AS instanceGroupList,
			       CASE WHEN farIsInstanced THEN farInstanceCount ELSE null END AS instanceCount,
			       null AS viaInstanceGroupList, null AS viaInstanceCount
	UNION
			WITH n
			// incoming: when n is a CEDS leaf, the source elements that resolve to a tuple
			// containing it. The hub decomposes like every other arm (no n.name stand-ins).
			// A source INSTANCE is reported as its declaration, its instances grouped and counted.
			MATCH (n)<-[:HAS_CEDS_PROPERTY|HAS_CEDS_VALUE]-(hub:HubReference)<-[m:${MATCH_EDGE_PATTERN}]-(src:ForgedNode)
			WITH n, hub, m, src, ${declarationOf('src')} AS srcDeclaration
			WITH n, hub, coalesce(srcDeclaration, src) AS sourceElement, srcDeclaration IS NOT NULL AS sourceIsInstanced,
			     type(m) AS srcMatchType, m.confidence AS srcConfidence, m.predicate AS srcPredicate, m.mappingConfidence AS srcMappingConfidence, m.mappingKind AS srcMappingKind, m.mappingSource AS srcMappingSource,
			     CASE WHEN srcDeclaration IS NULL THEN null ELSE ${instanceGroupOf('src')} END AS srcGroupName
			WITH n, hub, sourceElement, sourceIsInstanced, srcMatchType, srcConfidence, srcPredicate, srcMappingConfidence, srcMappingKind, srcMappingSource,
			     collect(DISTINCT srcGroupName) AS srcGroupList, count(*) AS srcInstanceCount
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN 'incoming' AS direction, sourceElement._source AS fromSource, sourceElement.name AS fromName,
			       'CEDS' AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       srcMatchType AS mappingType, srcConfidence AS confidence,
			       srcPredicate AS matchPredicate,
			       srcMappingConfidence AS mappingConfidence, srcMappingKind AS mappingKind, srcMappingSource AS mappingSource,
			       null AS viaMatchType, null AS viaConfidence, null AS viaPredicate,
			       null AS viaMappingConfidence, null AS viaMappingKind, null AS viaMappingSource,
			       cd.name AS cedsDomain, cp.name AS cedsProperty,
			       coalesce(cr.name, hub.rangeDatatype) AS cedsRange, cv.name AS cedsValue, cq.name AS cedsQualifier,
			       CASE WHEN sourceIsInstanced THEN sourceElement._id ELSE null END AS fromElementId,
			       null AS instanceOf,
			       CASE WHEN sourceIsInstanced THEN srcGroupList ELSE null END AS instanceGroupList,
			       CASE WHEN sourceIsInstanced THEN srcInstanceCount ELSE null END AS instanceCount,
			       null AS viaInstanceGroupList, null AS viaInstanceCount
	UNION
			WITH n
			// outgoingViaInstance: n is a declaration (SIF Question, PESC element) whose mappings
			// live on its instances. One row per CEDS tuple and verdict, carrying the instance
			// groups (SIF objects / PESC sections) that hold it and how many instances do.
			MATCH (n)-[:HAS_INSTANCE]->(instanceNode:ForgedNode)-[m:${MATCH_EDGE_PATTERN}]->(hub:HubReference)
			WITH n, hub, type(m) AS instMatchType, m.confidence AS instConfidence, m.predicate AS instPredicate, m.mappingConfidence AS instMappingConfidence, m.mappingKind AS instMappingKind, m.mappingSource AS instMappingSource,
			     ${instanceGroupOf('instanceNode')} AS instGroupName
			WITH n, hub, instMatchType, instConfidence, instPredicate, instMappingConfidence, instMappingKind, instMappingSource,
			     collect(DISTINCT instGroupName) AS instGroupList, count(*) AS instInstanceCount
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN 'outgoingViaInstance' AS direction, n._source AS fromSource, n.name AS fromName,
			       'CEDS' AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       instMatchType AS mappingType, instConfidence AS confidence,
			       instPredicate AS matchPredicate,
			       instMappingConfidence AS mappingConfidence, instMappingKind AS mappingKind, instMappingSource AS mappingSource,
			       null AS viaMatchType, null AS viaConfidence, null AS viaPredicate,
			       null AS viaMappingConfidence, null AS viaMappingKind, null AS viaMappingSource,
			       cd.name AS cedsDomain, cp.name AS cedsProperty,
			       coalesce(cr.name, hub.rangeDatatype) AS cedsRange, cv.name AS cedsValue, cq.name AS cedsQualifier,
			       n._id AS fromElementId,
			       null AS instanceOf, instGroupList AS instanceGroupList, instInstanceCount AS instanceCount,
			       null AS viaInstanceGroupList, null AS viaInstanceCount
	UNION
			WITH n
			// shared-hub pair THROUGH n's instances: same conservativity as the shared-hub arm.
			// The near hop is the instance's edge (viaMatchType/viaConfidence/viaPredicate, with
			// viaInstanceGroupList/viaInstanceCount naming which of n's instances carry it); a far
			// instance is reported as its declaration with instanceGroupList/instanceCount.
			MATCH (n)-[:HAS_INSTANCE]->(nearInstance:ForgedNode)-[mNear:${MATCH_EDGE_PATTERN}]->(hub:HubReference)<-[m:${MATCH_EDGE_PATTERN}]-(other:ForgedNode)
			WHERE other <> n AND NOT (n)-[:HAS_INSTANCE]->(other)
			WITH n, nearInstance, mNear, hub, m, other, ${declarationOf('other')} AS otherDeclaration
			WITH n, nearInstance, mNear, hub, m, other, otherDeclaration, coalesce(otherDeclaration, other) AS farElement
			WITH n, hub, farElement, otherDeclaration IS NOT NULL AS farIsInstanced,
			     type(mNear) AS nearMatchType, mNear.confidence AS nearConfidence, mNear.predicate AS nearPredicate,
			     mNear.mappingConfidence AS nearMappingConfidence, mNear.mappingKind AS nearMappingKind, mNear.mappingSource AS nearMappingSource,
			     type(m) AS farMatchType, m.confidence AS farConfidence, m.predicate AS farPredicate, m.mappingConfidence AS farMappingConfidence, m.mappingKind AS farMappingKind, m.mappingSource AS farMappingSource,
			     nearInstance, ${instanceGroupOf('nearInstance')} AS nearGroupName,
			     other, CASE WHEN otherDeclaration IS NULL THEN null ELSE ${instanceGroupOf('other')} END AS farGroupName
			WITH n, hub, farElement, farIsInstanced, nearMatchType, nearConfidence, nearPredicate, nearMappingConfidence, nearMappingKind, nearMappingSource,
			     farMatchType, farConfidence, farPredicate, farMappingConfidence, farMappingKind, farMappingSource,
			     collect(DISTINCT nearGroupName) AS nearGroupList, count(DISTINCT nearInstance) AS nearInstanceCount,
			     collect(DISTINCT farGroupName) AS farGroupList, count(DISTINCT other) AS farInstanceCount
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN ${sharedHubDirectionOf('nearMatchType', 'farMatchType')} AS direction,
			       farElement._source AS fromSource, farElement.name AS fromName,
			       'CEDS' AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       farMatchType AS mappingType, farConfidence AS confidence,
			       farPredicate AS matchPredicate,
			       farMappingConfidence AS mappingConfidence, farMappingKind AS mappingKind, farMappingSource AS mappingSource,
			       nearMatchType AS viaMatchType, nearConfidence AS viaConfidence, nearPredicate AS viaPredicate,
			       nearMappingConfidence AS viaMappingConfidence, nearMappingKind AS viaMappingKind, nearMappingSource AS viaMappingSource,
			       cd.name AS cedsDomain, cp.name AS cedsProperty,
			       coalesce(cr.name, hub.rangeDatatype) AS cedsRange, cv.name AS cedsValue, cq.name AS cedsQualifier,
			       farElement._id AS fromElementId,
			       null AS instanceOf,
			       CASE WHEN farIsInstanced THEN farGroupList ELSE null END AS instanceGroupList,
			       CASE WHEN farIsInstanced THEN farInstanceCount ELSE null END AS instanceCount,
			       nearGroupList AS viaInstanceGroupList, nearInstanceCount AS viaInstanceCount
		}
		RETURN direction, fromSource, fromName, toSource, toName, toId,
		       mappingType, confidence, matchPredicate,
		       mappingConfidence, mappingKind, mappingSource,
		       viaMatchType, viaConfidence, viaPredicate,
		       viaMappingConfidence, viaMappingKind, viaMappingSource, cedsDomain, cedsProperty,
		       cedsRange, cedsValue, cedsQualifier,
		       fromElementId, instanceOf, instanceGroupList, instanceCount, viaInstanceGroupList, viaInstanceCount
		ORDER BY CASE WHEN mappingType IN $composingMatchEdgeTypeList
		                   AND (viaMatchType IS NULL OR viaMatchType IN $composingMatchEdgeTypeList) THEN 0 ELSE 1 END,
		         confidence DESC
		LIMIT 30
	`, { name: nameOrId, composingMatchEdgeTypeList: COMPOSING_MATCH_EDGE_TYPE_LIST });

	return result.records.map(rec => {
		// cedsTuple: the CEDS anchor rendered as its full tuple (domain · property · range [· value]),
		// with the canonicalKey in parens — so consumers show the tuple, not just the bare Global ID.
		const tupleParts = [rec.get('cedsDomain'), rec.get('cedsProperty'), rec.get('cedsRange'), rec.get('cedsValue')].filter(Boolean);
		const mappingRow = {
			direction: rec.get('direction'),
			fromSource: rec.get('fromSource'),
			fromName: rec.get('fromName'),
			toSource: rec.get('toSource'),
			toName: rec.get('toName'),
			toId: rec.get('toId'),
			mappingType: rec.get('mappingType'),
			confidence: rec.get('confidence') != null ? Number(rec.get('confidence')) : null,
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
		// The judgment fields are always present (null on a graph that predates them). mappingSource is
		// also the DEBUG flag: 'bridge-debug' marks an edge a debug judge produced mechanically, so it
		// is emitted for BOTH hops on every row — a flag nothing reads is documentation, not detection
		// (tqii, 2026-08-10; moved here from provenanceTier/decisionAlgorithm, TQ 2026-10-04).
		JUDGMENT_FIELD_NAME_LIST.forEach(judgmentFieldName => {
			const judgmentFieldValue = rec.get(judgmentFieldName);
			mappingRow[judgmentFieldName] = judgmentFieldValue !== null && JUDGMENT_CONFIDENCE_FIELD_NAME_LIST.includes(judgmentFieldName)
				? Number(judgmentFieldValue)
				: judgmentFieldValue;
		});
		INSTANCE_FIELD_NAME_LIST.forEach(instanceFieldName => {
			const instanceFieldValue = rec.get(instanceFieldName);
			if (instanceFieldValue !== null) {
				mappingRow[instanceFieldName] = serializeValue(instanceFieldValue);
			}
		});
		// A SIF metadata question can sit in every object (136 groups); the list is capped and the
		// full group count is always reported beside it, so a cut list is never mistaken for whole.
		INSTANCE_GROUP_LIST_NAME_LIST.forEach(groupListName => {
			if (!mappingRow[groupListName]) return;
			mappingRow[`${groupListName.replace(/List$/, '')}Count`] = mappingRow[groupListName].length;
			mappingRow[groupListName] = mappingRow[groupListName].slice(0, INSTANCE_GROUP_LIST_CAP);
		});
		return mappingRow;
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
		OPTIONAL MATCH (v)-[m:${MATCH_EDGE_PATTERN}]->(hub:HubReference {referenceTier: 'value'})
		OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
		OPTIONAL MATCH (hub)<-[:${MATCH_EDGE_PATTERN}]-(ov:ForgedNode)
		WHERE ov._source <> os._source
		RETURN os._source AS sourceStandard, os.name AS optionSetName,
		       v.name AS sourceValue, type(m) AS matchType, m.confidence AS confidence,
		       m.mappingConfidence AS mappingConfidence, m.mappingKind AS mappingKind, m.mappingSource AS mappingSource,
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
		...(rec.get('mappingConfidence') !== null ? { mappingConfidence: Number(rec.get('mappingConfidence')) } : {}),
		...(rec.get('mappingKind') !== null ? { mappingKind: rec.get('mappingKind') } : {}),
		...(rec.get('mappingSource') !== null ? { mappingSource: rec.get('mappingSource') } : {}),
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
		  AND NOT (f)-[:${MATCH_EDGE_PATTERN}]->(:HubReference)
		  // a SIF Question / PESC element is mapped when any of its HAS_INSTANCE instances is
		  AND NOT (f)-[:HAS_INSTANCE]->(:ForgedNode)-[:${MATCH_EDGE_PATTERN}]->(:HubReference)
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
		WHERE type(r) IN $matchEdgeTypeList
		RETURN type(r) AS relType, count(r) AS count
	`, { matchEdgeTypeList: MATCH_EDGE_TYPE_LIST });
	const mappings = {};
	for (const rec of mappingResult.records) {
		mappings[rec.get('relType')] = toNumber(rec.get('count'));
	}

	// Mapping coverage over DmeProperty nodes. A SIF Question / PESC element counts as mapped when
	// its mapping lives on one of its HAS_INSTANCE instances (the bridges fan verdicts out there).
	const coverageResult = await session.run(`
		MATCH (f:ForgedNode {role: 'DmeProperty'})
		WITH count(f) AS totalProperties,
		     count(CASE WHEN (f)-[:${MATCH_EDGE_PATTERN}]->(:HubReference)
		                  OR (f)-[:HAS_INSTANCE]->(:ForgedNode)-[:${MATCH_EDGE_PATTERN}]->(:HubReference)
		                THEN 1 END) AS mappedProperties
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
		// Wave B (CRIMSON gate 7): describeGraph runs in a READ-ONLY session from birth.
		const READ_ONLY_QUERY_TYPES = ['describeGraph'];
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
				case 'describeGraph': {
					const { describeGraph } = require('./lib/describeGraph');
					return describeGraph(session, params);
				}
				default: return { error: `Unknown query type: ${queryType}` };
			}
		}, { readOnly: READ_ONLY_QUERY_TYPES.indexOf(queryType) !== -1 });

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
	} else if (flags.describeGraph) {
		queryType = 'describeGraph';
		if (flags.limit) params.limit = flags.limit;
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
  ${moduleName} -describeGraph [--limit=200]     (the graph card: passport, recipe, lineage, per-standard definitions)
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
