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
//
// Control flow (lane S, 2026-10-05): every query handler answers through callback(err, result) and multi-step
// handlers run as qtools taskLists, TQ's CLI standard. neo4j-driver's promises are met in exactly one place,
// lib/runCypherQuery.js. Until then this file was async/await; the queries and their output are unchanged.

const os = require('os');
const path = require('path');
const neo4j = require('neo4j-driver');
const { pipeRunner, taskListPlus, mergeArgs } = new (require('qtools-asynchronous-pipe-plus'))();
const { runCypherQuery } = require('./lib/runCypherQuery');
// ⟪campaign P2⟫ the passport, read by contract (V2-C01/C04), and the embedder check every vector verb makes first (V2-C28)
const { readPassport } = require('./lib/passportReader');
const { checkGraphEmbeddingContract } = require('./lib/graphEmbeddingContract');
// W-D-1 (campaign P0, 2026-10-06): a refusal about the INPUT answers callback('', refusalFor(...)) and reaches stdout as
// JSON with exit 0; an ERROR (the tool could not run) stays callback(errorText) -> stderr, exit 1 (supervisor ruling 1)
const {
	refusalFor,
	listEnvelopeFor,
	VERB_INPUT_CONTRACT,
	VERB_FLAG_DEFAULT_BY_VERB,
	UNMAPPED_HUB_POLICY,
	hubDecompositionEdgeTypeList,
	FIND_MAPPINGS_IDENTIFIER_FIELD_LIST,
	FIND_MAPPINGS_COUNT_UNIT_BY_FIELD,
	INSTANCE_CONTEXT_PATH_RULE_LIST,
	MATCHED_INSTANCE_GROUP_LIST_CAP,
	HUB_TUPLE_SUMMARY_CAP,
	HUB_TUPLE_SUMMARY_CYPHER,
	COMPARE_CODESETS_ROW_CAP,
	VALUE_TIER_JUDGMENT_COUNT_CYPHER,
	SEARCH_PAGE_SIZE,
	SEARCH_OVER_FETCH_FACTOR,
	SEARCH_OVER_FETCH_CAP,
	EXPLORE_EDGE_CAP,
	NAME_MATCH_MODE_LIST,
	CALCULATE_OPERATION_ARITY_BY_NAME,
} = require('./lib/toolPayloadContract');
// W-D-2 / W-D-5 / W-D-8 / W-D-9 (campaign P1): the live _source list and the hub standard are read from the graph
const { resolveStandardFilter, resolveHubIdentity, familyExpansionFieldsFor } = require('./lib/liveInventory');
// X1 via the CLI: dme_raw_cypher is the model's own Cypher, so it passes the same read-only validator the HTTP / MCP /
// Slack seam uses (the READ session is the wall; this is the filter that also stops reads that fetch, LOAD CSV / apoc)
const validateReadOnly = require('../../../server/lib/cypher-validator');

const moduleName = path.basename(__filename).replace(/.js$/, '');

// =====================================================================
// CONFIG
// =====================================================================

const loadConfig = (callback) => {
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
		callback(`Config section [${moduleName}] not found in ${configDirPath}${moduleName}.ini`);
		return;
	}
	const moduleConfig = config[moduleName];

	// Single source of truth: derive the bolt connection {boltUri,user,password} from the golden
	// container NAME (goldenContainerName) instead of reading redundant neo4j* fields. The
	// neo4j* properties below are the RESOLVED values consumed by withNeo4jSession.
	const { goldenContainerName } = moduleConfig;
	if (!goldenContainerName) {
		callback(`Config [${moduleName}] is missing goldenContainerName (the DME connection source of truth)`);
		return;
	}
	const { boltUri, user, password, error } = resolveContainerConnection(goldenContainerName);
	if (error) {
		callback(`Cannot resolve DME connection from goldenContainerName '${goldenContainerName}': ${error}`);
		return;
	}
	moduleConfig.neo4jBoltUri = boltUri;
	moduleConfig.neo4jUser = user;
	moduleConfig.neo4jPassword = password;

	// Create provider-agnostic embedder from config
	// An unresolved ini token ('<!voyageApiKey!>') means the Voyage API key is absent — no embedder
	if (moduleConfig.voyageApiKey && !moduleConfig.voyageApiKey.startsWith('<!')) {
		const { embeddingClient } = require('qtools-graph-forge-core');
		// ⟪campaign P2, V2-C28⟫ the query embedder is the reader's ONE declaration, checked against the passport before use
		const { QUERY_EMBEDDER_CONTRACT } = require('./lib/queryEmbedderContract');
		moduleConfig.embedder = embeddingClient.create({
			provider: QUERY_EMBEDDER_CONTRACT.provider,
			model: QUERY_EMBEDDER_CONTRACT.model,
			dimension: QUERY_EMBEDDER_CONTRACT.dimension,
			apiKey: moduleConfig.voyageApiKey,
			batchSize: 20
		});
	}

	callback('', moduleConfig);
};

// =====================================================================
// NEO4J SESSION MANAGEMENT
// =====================================================================

// The session and driver are closed whether or not the handler failed; a close failure is reported in place
// of the handler's result, as the earlier try/finally did.
const withNeo4jSession = (config, { accessMode }, queryHandler, callback) => {
	if (accessMode !== neo4j.session.READ && accessMode !== neo4j.session.WRITE) {
		callback(`withNeo4jSession: accessMode must be neo4j.session.READ or neo4j.session.WRITE, named explicitly (got ${JSON.stringify(accessMode)})`);
		return;
	}
	const driver = neo4j.driver(
		config.neo4jBoltUri,
		neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
		{ encrypted: false }
	);
	// the mode is always EXPLICIT (sessionAccessModeFor), so a grep for session.WRITE finds every write session
	const session = driver.session({ defaultAccessMode: accessMode });

	queryHandler(session, (queryError, queryResult) => {
		session.close()
			.then(() => driver.close())
			.then(
				() => callback(queryError, queryResult),
				(closeError) => callback(closeError.message),
			);
	});
};

// =====================================================================
// QUERY EMBEDDING (via embedder object)
// =====================================================================

const embedQuery = (text, embedder, callback) => {
	embedder.embed([text], (err, embeddings) => {
		if (err) {
			callback(`Embedding failed: ${err}`);
			return;
		}
		callback('', embeddings[0]);
	});
};

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
// with an explicit refusal instead. Returns the refusal text, or '' when the argument is usable.
// A flag given with no value ('--query=') reaches here as the BOOLEAN true from the CLI parser, which is not text: it used
// to pass as the string 'true' and crash the driver (measured 2026-10-06, -rawCypher --query=), so non-strings refuse too.
const emptyArgumentRefusal = (value, whatFor) =>
	typeof value !== 'string' || value.trim() === ''
		? `${whatFor} requires a non-empty argument — an empty value would match every node in the graph.`
		: '';

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

const resolveVectorIndex = (session, callback) => {
	if (discoveredVectorIndex) {
		callback('', discoveredVectorIndex);
		return;
	}
	runCypherQuery(session, 'SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties', {}, (err, result) => {
		if (err) {
			callback(err);
			return;
		}
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
			callback('No VECTOR index on :ForgedNode(embedding) exists on this graph — vector search cannot run.');
			return;
		}
		if (candidates.length > 1) {
			callback(`Ambiguous VECTOR indexes on :ForgedNode(embedding): ${candidates.map(row => row.name).join(', ')} — cannot choose safely.`);
			return;
		}
		discoveredVectorIndex = candidates[0].name;
		callback('', discoveredVectorIndex);
	});
};

// W-D-10 (campaign P1): a filtered search over-fetches SEARCH_OVER_FETCH_FACTOR x the page (capped) so a small standard
// still fills it, and answers the §14 envelope. totalRowCount counts the matches inside the over-fetch window (the
// nearest overFetchWindow nodes), the most the vector index can say; a short filtered page says so in shortPageNote.
const hybridSearch = (session, query, config, params, callback) => {
	const emptyQueryRefusal = emptyArgumentRefusal(query, '-search'); // L8
	if (emptyQueryRefusal) {
		callback('', refusalFor('search', 'emptyQuery', emptyQueryRefusal));
		return;
	}
	if (!config.embedder) {
		callback('No embedder configured — vector search cannot run. Check voyageApiKey in dataModelExplorerSearch.ini.');
		return;
	}
	// ⟪campaign P2, V2-C28⟫ the passport must say this graph's vectors are the query embedder's, before anything is embedded
	checkGraphEmbeddingContract({ session, verbName: 'search' }, (contractError, contractVerdict) => {
	if (contractError) {
		callback(contractError);
		return;
	}
	if (contractVerdict.refusal) {
		callback('', contractVerdict.refusal);
		return;
	}
	resolveStandardFilter(session, 'search', params.standard, (filterError, standardFilter) => {
		if (filterError) {
			callback(filterError);
			return;
		}
		if (standardFilter.refusal) {
			callback('', standardFilter.refusal);
			return;
		}
		const { sourceList } = standardFilter;
		const overFetchWindow = sourceList ? Math.min(SEARCH_PAGE_SIZE * SEARCH_OVER_FETCH_FACTOR, SEARCH_OVER_FETCH_CAP) : SEARCH_PAGE_SIZE;

		const taskList = new taskListPlus();
		taskList.push((args, next) => {
			embedQuery(query, config.embedder, (err, queryEmbedding) => {
				if (err) {
					next(`Embedding the query failed: ${err}`, args);
					return;
				}
				next('', { ...args, queryEmbedding });
			});
		});
		taskList.push((args, next) => resolveVectorIndex(session, mergeArgs(args, next, 'vectorIndexName')));
		taskList.push((args, next) => {
			runCypherQuery(session, `
			CALL db.index.vector.queryNodes($indexName, $overFetchWindow, $embedding)
			YIELD node, score
			WITH node, score
			WHERE $sourceList IS NULL OR node._source IN $sourceList
			WITH node, score ORDER BY score DESC
			WITH collect({ standard: node._source, id: node._id, stableId: node.stableId, role: node.role,
			               labels: labels(node), name: node.name, description: node.description, score: score }) AS rowList
			RETURN rowList[..$pageSize] AS resultList, size(rowList) AS totalRowCount
		`, {
				indexName: args.vectorIndexName,
				overFetchWindow: neo4j.int(overFetchWindow),
				pageSize: neo4j.int(SEARCH_PAGE_SIZE),
				embedding: args.queryEmbedding,
				sourceList,
			}, mergeArgs(args, next, 'vecResult'));
		});

		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) {
				callback(err);
				return;
			}
			const searchRecord = args.vecResult.records[0];
			const resultList = searchRecord.get('resultList').map((oneRow) => ({
				...serializeValue(oneRow),
				labels: oneRow.labels.filter((labelName) => labelName !== 'ForgedNode' && labelName !== 'golden'),
			}));
			const searchPayload = {
				...listEnvelopeFor('search', resultList, toNumber(searchRecord.get('totalRowCount'))),
				overFetchWindow,
				...familyExpansionFieldsFor(standardFilter),
			};
			if (sourceList && resultList.length < SEARCH_PAGE_SIZE) {
				searchPayload.shortPageNote = `only ${resultList.length} of the ${overFetchWindow} nearest nodes belong to ${sourceList.join(', ')}; the page is short, not the standard`;
			}
			callback('', searchPayload);
		});
	});
	});
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

// findMappings returns at most FIND_MAPPINGS_ROW_CAP rows. Each relation present first gets up to
// FIND_MAPPINGS_ROWS_PER_RELATION rows (TQ/VIOLET_VALLEY ruling 2026-10-04: never silently drop a whole
// relation); the rest of the cap fills in composing-first, confidence order. Within a relation the rows are shared
// across source standards (interleaveRowsByStandard, 2026-10-05). truncatedRowCountByRelation and
// truncatedRowCountByRelationAndStandard say how many rows of each relation, and of each standard in it, were left out.
const FIND_MAPPINGS_ROW_CAP = 30;
const FIND_MAPPINGS_ROWS_PER_RELATION = Math.floor(FIND_MAPPINGS_ROW_CAP / MATCH_EDGE_TYPE_LIST.length);

const mappingRowRank = (row) => [
	COMPOSING_MATCH_EDGE_TYPE_LIST.includes(row.mappingType)
		&& (row.viaMatchType === null || COMPOSING_MATCH_EDGE_TYPE_LIST.includes(row.viaMatchType)) ? 0 : 1,
	-(row.confidence === null ? -1 : row.confidence),
];
const compareMappingRows = (rowA, rowB) => {
	const rankA = mappingRowRank(rowA);
	const rankB = mappingRowRank(rowB);
	return rankA[0] - rankB[0] || rankA[1] - rankB[1];
};

// Within one relation, rows are shared across SOURCE STANDARDS first (TQ, 2026-10-05: BirthDate's EXACT share was
// filled by 0.9 SIF/PESC rows and Ed-Fi's 0.7 rows never showed): round-robin by standard — standards in order of
// their best row, then by name — and within a standard by confidence. The relation's rows are then taken in that
// order, both for its guaranteed share and for any fill it wins.
const interleaveRowsByStandard = (rowListByStandard) => {
	const standardNameList = Object.keys(rowListByStandard).sort((standardNameA, standardNameB) =>
		compareMappingRows(rowListByStandard[standardNameA][0], rowListByStandard[standardNameB][0])
			|| (standardNameA < standardNameB ? -1 : standardNameA > standardNameB ? 1 : 0));
	const longestStandardRowCount = Math.max(0, ...standardNameList.map((standardName) => rowListByStandard[standardName].length));
	const interleavedRowList = [];
	for (let roundIndex = 0; roundIndex < longestStandardRowCount; roundIndex++) {
		standardNameList.forEach((standardName) => {
			const standardRow = rowListByStandard[standardName][roundIndex];
			if (standardRow) interleavedRowList.push(standardRow);
		});
	}
	return interleavedRowList;
};

// Each relation present gets up to FIND_MAPPINGS_ROWS_PER_RELATION rows; the rest of the cap is filled by merging the
// relations' remaining rows, at each step taking the best-ranked head (composing first, then confidence; ties to the
// earlier relation), so a relation's own standard order is never re-sorted away. Over sorted single-standard
// relations this is exactly the stable sort it replaces.
const allocateMappingRowsByRelation = (rowListByRelationAndStandard, totalRowCountByRelationAndStandard) => {
	const shownRowList = [];
	const leftoverRowListByRelation = {};
	const shownCountByRelationAndStandard = {};
	const takeRow = (edgeType, row) => {
		shownRowList.push(row);
		shownCountByRelationAndStandard[edgeType][row.fromSource] = (shownCountByRelationAndStandard[edgeType][row.fromSource] || 0) + 1;
	};
	MATCH_EDGE_TYPE_LIST.forEach((edgeType) => {
		shownCountByRelationAndStandard[edgeType] = {};
		const rowListByStandard = rowListByRelationAndStandard[edgeType] || {};
		Object.keys(rowListByStandard).forEach((standardName) => rowListByStandard[standardName].sort(compareMappingRows));
		const relationRowList = interleaveRowsByStandard(rowListByStandard);
		relationRowList.slice(0, FIND_MAPPINGS_ROWS_PER_RELATION).forEach((row) => takeRow(edgeType, row));
		leftoverRowListByRelation[edgeType] = relationRowList.slice(FIND_MAPPINGS_ROWS_PER_RELATION);
	});
	while (shownRowList.length < FIND_MAPPINGS_ROW_CAP) {
		const headRelationList = MATCH_EDGE_TYPE_LIST.filter((edgeType) => leftoverRowListByRelation[edgeType].length > 0);
		if (headRelationList.length === 0) break;
		const bestRelation = headRelationList.reduce((bestEdgeType, edgeType) =>
			compareMappingRows(leftoverRowListByRelation[edgeType][0], leftoverRowListByRelation[bestEdgeType][0]) < 0 ? edgeType : bestEdgeType);
		takeRow(bestRelation, leftoverRowListByRelation[bestRelation].shift());
	}

	const totalRowCountByRelation = {};
	const truncatedRowCountByRelation = {};
	const truncatedRowCountByRelationAndStandard = {};
	MATCH_EDGE_TYPE_LIST.forEach((edgeType) => {
		const standardTotalByName = totalRowCountByRelationAndStandard[edgeType] || {};
		truncatedRowCountByRelation[edgeType] = 0;
		Object.keys(standardTotalByName).forEach((standardName) => {
			const standardTruncatedCount = standardTotalByName[standardName] - (shownCountByRelationAndStandard[edgeType][standardName] || 0);
			totalRowCountByRelation[edgeType] = (totalRowCountByRelation[edgeType] || 0) + standardTotalByName[standardName];
			truncatedRowCountByRelation[edgeType] += standardTruncatedCount;
			truncatedRowCountByRelationAndStandard[edgeType] = truncatedRowCountByRelationAndStandard[edgeType] || {};
			truncatedRowCountByRelationAndStandard[edgeType][standardName] = standardTruncatedCount;
		});
	});
	return {
		shownRowList: shownRowList.sort(compareMappingRows),
		totalRowCountByRelation,
		truncatedRowCountByRelation,
		truncatedRowCountByRelationAndStandard,
	};
};

const JUDGMENT_FIELD_NAME_LIST = [
	'mappingConfidence',
	'mappingKind',
	'mappingSource',
	'viaMappingConfidence',
	'viaMappingKind',
	'viaMappingSource',
	// ⟪campaign P3, W-B-4 (a)⟫ the judge's own stated reason, on the edge since P3: a reader QUOTES it rather than
	// inventing one (PLAN A3: askMilo invented reasons for confidence values)
	'mappingRationale',
	'viaMappingRationale',
];
const JUDGMENT_CONFIDENCE_FIELD_NAME_LIST = ['mappingConfidence', 'viaMappingConfidence'];

// =====================================================================
// INSTANCE NODES (HAS_INSTANCE) — lane D, 2026-10-01
// =====================================================================
//
// SIF and PESC write their CEDS mapping edges onto INSTANCE nodes, not onto the element the
// DME finds. A SIF Question (DmeProperty) -[:HAS_INSTANCE]-> one Field (DmeInstance since P3) per object it
// appears in; a PESC element declaration (DmeProperty) -[:HAS_INSTANCE]-> one occurrence
// (DmeInstance since P3) per place it appears in the document. The bridges fan their verdicts out onto
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

// W-D-6 (campaign P1): a node matches findMappings by name (contains, any case) or EXACTLY by any identifier in
// FIND_MAPPINGS_IDENTIFIER_FIELD_LIST — cedsId among them, so a CEDS Global ID (P000033, OV…) finds its CEDS leaf, and
// the incoming arm then reaches every source element mapped to it
const findMappingsNameOrIdentifierPredicateFor = (nodeVariable) => [
	`toLower(${nodeVariable}.name) CONTAINS toLower($name)`,
	...FIND_MAPPINGS_IDENTIFIER_FIELD_LIST.map((identifierFieldName) => `${nodeVariable}.${identifierFieldName} = $name`),
].join(' OR ');
// ⟪campaign P4a, Q9⟫ an instance also matches by a segment of its context path above its own name (the first
// INSTANCE_CONTEXT_PATH_RULE_LIST rule whose field it carries), so SIF …/RaceList/Race/Code is found by 'race'
const instanceContextSegmentListOf = (nodeVariable) => `CASE ${INSTANCE_CONTEXT_PATH_RULE_LIST.map(({ pathFieldName, leadingSegmentDropCount }) =>
	`WHEN ${nodeVariable}.${pathFieldName} IS NOT NULL THEN split(${nodeVariable}.${pathFieldName}, '/')[${leadingSegmentDropCount}..-1]`).join(' ')} ELSE [] END`;
const instanceContextPathPredicateFor = (nodeVariable) =>
	`(${nodeVariable}.role = 'DmeInstance' AND any(contextSegment IN ${instanceContextSegmentListOf(nodeVariable)} WHERE toLower(contextSegment) CONTAINS toLower($name)))`;
const findMappingsMatchPredicateFor = (nodeVariable) => `${findMappingsNameOrIdentifierPredicateFor(nodeVariable)} OR ${instanceContextPathPredicateFor(nodeVariable)}`;

const findMappings = (session, nameOrId, callback) => {
	const emptyNameRefusal = emptyArgumentRefusal(nameOrId, '-findMappings'); // L8
	if (emptyNameRefusal) {
		callback('', refusalFor('findMappings', 'emptyName', emptyNameRefusal));
		return;
	}
	const taskList = new taskListPlus();
	taskList.push((args, next) => resolveHubIdentity(session, mergeArgs(args, next, 'hubIdentity')));
	taskList.push((args, next) => runCypherQuery(session, `MATCH (n:ForgedNode) WHERE ${findMappingsMatchPredicateFor('n')}
		RETURN count(n) AS matchedNodeCount, count(CASE WHEN ${findMappingsNameOrIdentifierPredicateFor('n')} THEN null ELSE 1 END) AS instancePathMatchedNodeCount`,
		{ name: nameOrId }, (err, countResult) => {
			if (err) {
				next(err, args);
				return;
			}
			next('', {
				...args,
				matchedNodeCount: toNumber(countResult.records[0].get('matchedNodeCount')),
				instancePathMatchedNodeCount: toNumber(countResult.records[0].get('instancePathMatchedNodeCount')),
			});
		}));
	taskList.push((args, next) => {
		if (args.matchedNodeCount === 0) {
			next('', args);
			return;
		}
		runFindMappingsQuery(session, nameOrId, args.hubIdentity, mergeArgs(args, next, 'mappingResult'));
	});
	// ⟪campaign P4a, Q9⟫ where the matched instances sit: per standard, the groups (SIF objects, PESC sections) holding an
	// instance the input matched directly or through its declaration, whether or not it carries a mapping
	taskList.push((args, next) => {
		if (args.matchedNodeCount === 0) {
			next('', args);
			return;
		}
		runCypherQuery(session, `
			MATCH (n:ForgedNode) WHERE ${findMappingsMatchPredicateFor('n')}
			OPTIONAL MATCH (n)-[:HAS_INSTANCE]->(declaredInstance:ForgedNode)
			WITH n, collect(declaredInstance) AS declaredInstanceList
			WITH CASE WHEN n.role = 'DmeInstance' THEN [n] ELSE declaredInstanceList END AS instanceList
			UNWIND instanceList AS instanceNode
			WITH DISTINCT instanceNode
			WITH instanceNode._source AS source, ${instanceGroupOf('instanceNode')} AS groupName
			WITH source, count(*) AS matchedInstanceCount, collect(DISTINCT groupName) AS groupList
			RETURN source, matchedInstanceCount, size(groupList) AS matchedInstanceGroupCount, groupList[..$groupListCap] AS groupList
			ORDER BY source
		`, { name: nameOrId, groupListCap: neo4j.int(MATCHED_INSTANCE_GROUP_LIST_CAP) }, mergeArgs(args, next, 'matchedInstanceGroupResult'));
	});
	// ⟪campaign P4a, Q1⟫ the EDGES and ELEMENTS behind every tuple the rows reach, counted from the graph: rows are views
	taskList.push((args, next) => {
		if (args.matchedNodeCount === 0) {
			next('', args);
			return;
		}
		const toIdList = [...new Set(args.mappingResult.records.reduce((soFar, standardRecord) => soFar.concat(standardRecord.get('toIdList')), []))];
		runCypherQuery(session, HUB_TUPLE_SUMMARY_CYPHER, { toIdList }, mergeArgs(args, next, 'hubTupleResult'));
	});
	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(err);
			return;
		}
		if (args.matchedNodeCount === 0) {
			callback('', refusalFor('findMappings', 'nothingMatched',
				`'${nameOrId}' matches no node by name, ${FIND_MAPPINGS_IDENTIFIER_FIELD_LIST.join(', ')}; a ${args.hubIdentity.hubName} Global ID looks like P000033 (property) or OV001637175776 (value) — read one from dme_search or dme_explore.`));
			return;
		}
		callback('', {
			...shapeFindMappingsResult(args.mappingResult),
			...shapeHubTupleSummary(args.hubTupleResult),
			matchedNodeCount: args.matchedNodeCount,
			instancePathMatchedNodeCount: args.instancePathMatchedNodeCount,
			matchedInstanceGroupSummaryList: args.matchedInstanceGroupResult.records.map((sourceRecord) => ({
				source: sourceRecord.get('source'),
				matchedInstanceCount: toNumber(sourceRecord.get('matchedInstanceCount')),
				matchedInstanceGroupCount: toNumber(sourceRecord.get('matchedInstanceGroupCount')),
				groupList: sourceRecord.get('groupList'),
			})),
			countUnitByField: FIND_MAPPINGS_COUNT_UNIT_BY_FIELD,
		});
	});
};

// W-D-5: the incoming arm reads EVERY hub slot, built from the one declared list. W-D-7: each arm returns the element's
// stableId (fromStableId) and the rows are folded to ONE per mapping (FIND_MAPPINGS_ROW_IDENTITY_FIELD_LIST) before
// they are counted, so two matched nodes reaching one (element, hub, relation) no longer count twice.
const runFindMappingsQuery = (session, nameOrId, { hubName, hubSource }, callback) => {
	const incomingHubEdgePattern = hubDecompositionEdgeTypeList(hubName).join('|');
	runCypherQuery(session, `
		MATCH (n:ForgedNode)
		WHERE ${findMappingsMatchPredicateFor('n')}
		// An instance whose declaration ALSO matched is reported through that declaration (the
		// outgoingViaInstance arm, grouped), not again as one loose same-named row per instance.
		WITH n
		WHERE NOT EXISTS {
			MATCH (matchedDeclaration:ForgedNode)-[:HAS_INSTANCE]->(n)
			WHERE ${findMappingsMatchPredicateFor('matchedDeclaration')}
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
			RETURN 'outgoing' AS direction, n._source AS fromSource, n.name AS fromName, n.stableId AS fromStableId,
			       $hubSource AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       type(m) AS mappingType, m.mappingConfidence AS confidence,
			       m.predicate AS matchPredicate,
			       m.mappingConfidence AS mappingConfidence, m.mappingKind AS mappingKind, m.mappingSource AS mappingSource, m.mappingRationale AS mappingRationale,
			       null AS viaMatchType, null AS viaConfidence, null AS viaPredicate,
			       null AS viaMappingConfidence, null AS viaMappingKind, null AS viaMappingSource, null AS viaMappingRationale,
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
			     type(m) AS farMatchType, m.mappingConfidence AS farConfidence, m.predicate AS farPredicate, m.mappingConfidence AS farMappingConfidence, m.mappingKind AS farMappingKind, m.mappingSource AS farMappingSource, m.mappingRationale AS farMappingRationale,
			     CASE WHEN otherDeclaration IS NULL THEN null ELSE ${instanceGroupOf('other')} END AS farGroupName
			WITH n, mNear, hub, farElement, farIsInstanced, farMatchType, farConfidence, farPredicate, farMappingConfidence, farMappingKind, farMappingSource, farMappingRationale,
			     collect(DISTINCT farGroupName) AS farGroupList, count(*) AS farInstanceCount
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN ${sharedHubDirectionOf('type(mNear)', 'farMatchType')} AS direction,
			       farElement._source AS fromSource, farElement.name AS fromName, farElement.stableId AS fromStableId,
			       $hubSource AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       farMatchType AS mappingType, farConfidence AS confidence,
			       farPredicate AS matchPredicate,
			       farMappingConfidence AS mappingConfidence, farMappingKind AS mappingKind, farMappingSource AS mappingSource, farMappingRationale AS mappingRationale,
			       type(mNear) AS viaMatchType, mNear.mappingConfidence AS viaConfidence, mNear.predicate AS viaPredicate,
			       mNear.mappingConfidence AS viaMappingConfidence, mNear.mappingKind AS viaMappingKind, mNear.mappingSource AS viaMappingSource, mNear.mappingRationale AS viaMappingRationale,
			       cd.name AS cedsDomain, cp.name AS cedsProperty,
			       coalesce(cr.name, hub.rangeDatatype) AS cedsRange, cv.name AS cedsValue, cq.name AS cedsQualifier,
			       CASE WHEN farIsInstanced THEN farElement._id ELSE null END AS fromElementId,
			       null AS instanceOf,
			       CASE WHEN farIsInstanced THEN farGroupList ELSE null END AS instanceGroupList,
			       CASE WHEN farIsInstanced THEN farInstanceCount ELSE null END AS instanceCount,
			       null AS viaInstanceGroupList, null AS viaInstanceCount
	UNION
			WITH n
			// incoming: when n is a hub leaf (class, property, range, value or qualifier — any slot), the source
			// elements that resolve to a tuple containing it. The hub decomposes like every other arm (no n.name stand-ins).
			// A source INSTANCE is reported as its declaration, its instances grouped and counted.
			MATCH (n)<-[:${incomingHubEdgePattern}]-(hub:HubReference)<-[m:${MATCH_EDGE_PATTERN}]-(src:ForgedNode)
			WITH n, hub, m, src, ${declarationOf('src')} AS srcDeclaration
			WITH n, hub, coalesce(srcDeclaration, src) AS sourceElement, srcDeclaration IS NOT NULL AS sourceIsInstanced,
			     type(m) AS srcMatchType, m.mappingConfidence AS srcConfidence, m.predicate AS srcPredicate, m.mappingConfidence AS srcMappingConfidence, m.mappingKind AS srcMappingKind, m.mappingSource AS srcMappingSource, m.mappingRationale AS srcMappingRationale,
			     CASE WHEN srcDeclaration IS NULL THEN null ELSE ${instanceGroupOf('src')} END AS srcGroupName
			WITH n, hub, sourceElement, sourceIsInstanced, srcMatchType, srcConfidence, srcPredicate, srcMappingConfidence, srcMappingKind, srcMappingSource, srcMappingRationale,
			     collect(DISTINCT srcGroupName) AS srcGroupList, count(*) AS srcInstanceCount
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN 'incoming' AS direction, sourceElement._source AS fromSource, sourceElement.name AS fromName, sourceElement.stableId AS fromStableId,
			       $hubSource AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       srcMatchType AS mappingType, srcConfidence AS confidence,
			       srcPredicate AS matchPredicate,
			       srcMappingConfidence AS mappingConfidence, srcMappingKind AS mappingKind, srcMappingSource AS mappingSource, srcMappingRationale AS mappingRationale,
			       null AS viaMatchType, null AS viaConfidence, null AS viaPredicate,
			       null AS viaMappingConfidence, null AS viaMappingKind, null AS viaMappingSource, null AS viaMappingRationale,
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
			WITH n, hub, type(m) AS instMatchType, m.mappingConfidence AS instConfidence, m.predicate AS instPredicate, m.mappingConfidence AS instMappingConfidence, m.mappingKind AS instMappingKind, m.mappingSource AS instMappingSource, m.mappingRationale AS instMappingRationale,
			     ${instanceGroupOf('instanceNode')} AS instGroupName
			// the rationale is per-instance evidence, not part of the verdict: grouping by it split one verdict into
			// fragments with partial counts. min() keeps one recorded text, deterministically (null only when none is)
			WITH n, hub, instMatchType, instConfidence, instPredicate, instMappingConfidence, instMappingKind, instMappingSource,
			     min(instMappingRationale) AS instMappingRationale,
			     collect(DISTINCT instGroupName) AS instGroupList, count(*) AS instInstanceCount
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN 'outgoingViaInstance' AS direction, n._source AS fromSource, n.name AS fromName, n.stableId AS fromStableId,
			       $hubSource AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       instMatchType AS mappingType, instConfidence AS confidence,
			       instPredicate AS matchPredicate,
			       instMappingConfidence AS mappingConfidence, instMappingKind AS mappingKind, instMappingSource AS mappingSource, instMappingRationale AS mappingRationale,
			       null AS viaMatchType, null AS viaConfidence, null AS viaPredicate,
			       null AS viaMappingConfidence, null AS viaMappingKind, null AS viaMappingSource, null AS viaMappingRationale,
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
			     type(mNear) AS nearMatchType, mNear.mappingConfidence AS nearConfidence, mNear.predicate AS nearPredicate,
			     mNear.mappingConfidence AS nearMappingConfidence, mNear.mappingKind AS nearMappingKind, mNear.mappingSource AS nearMappingSource, mNear.mappingRationale AS nearMappingRationale,
			     type(m) AS farMatchType, m.mappingConfidence AS farConfidence, m.predicate AS farPredicate, m.mappingConfidence AS farMappingConfidence, m.mappingKind AS farMappingKind, m.mappingSource AS farMappingSource, m.mappingRationale AS farMappingRationale,
			     nearInstance, ${instanceGroupOf('nearInstance')} AS nearGroupName,
			     other, CASE WHEN otherDeclaration IS NULL THEN null ELSE ${instanceGroupOf('other')} END AS farGroupName
			WITH n, hub, farElement, farIsInstanced, nearMatchType, nearConfidence, nearPredicate, nearMappingConfidence, nearMappingKind, nearMappingSource, nearMappingRationale,
			     farMatchType, farConfidence, farPredicate, farMappingConfidence, farMappingKind, farMappingSource, farMappingRationale,
			     collect(DISTINCT nearGroupName) AS nearGroupList, count(DISTINCT nearInstance) AS nearInstanceCount,
			     collect(DISTINCT farGroupName) AS farGroupList, count(DISTINCT other) AS farInstanceCount
			OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cd:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cp:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cr:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)-[:HAS_CEDS_QUALIFIER]->(cq:ForgedNode)
			RETURN ${sharedHubDirectionOf('nearMatchType', 'farMatchType')} AS direction,
			       farElement._source AS fromSource, farElement.name AS fromName, farElement.stableId AS fromStableId,
			       $hubSource AS toSource, hub.name AS toName, hub.canonicalKey AS toId,
			       farMatchType AS mappingType, farConfidence AS confidence,
			       farPredicate AS matchPredicate,
			       farMappingConfidence AS mappingConfidence, farMappingKind AS mappingKind, farMappingSource AS mappingSource, farMappingRationale AS mappingRationale,
			       nearMatchType AS viaMatchType, nearConfidence AS viaConfidence, nearPredicate AS viaPredicate,
			       nearMappingConfidence AS viaMappingConfidence, nearMappingKind AS viaMappingKind, nearMappingSource AS viaMappingSource, nearMappingRationale AS viaMappingRationale,
			       cd.name AS cedsDomain, cp.name AS cedsProperty,
			       coalesce(cr.name, hub.rangeDatatype) AS cedsRange, cv.name AS cedsValue, cq.name AS cedsQualifier,
			       farElement._id AS fromElementId,
			       null AS instanceOf,
			       CASE WHEN farIsInstanced THEN farGroupList ELSE null END AS instanceGroupList,
			       CASE WHEN farIsInstanced THEN farInstanceCount ELSE null END AS instanceCount,
			       nearGroupList AS viaInstanceGroupList, nearInstanceCount AS viaInstanceCount
		}
		// Each row belongs to ONE relation for the cap: a broad/narrow hop on either side wins, then
		// a close hop, else exact. Rows are kept per relation AND standard (best confidence first) and
		// allocated in JS (allocateMappingRowsByRelation) so no relation is ever silently dropped and,
		// within a relation, no standard crowds out the others.
		WITH *, CASE WHEN mappingType IN $nonComposingMatchEdgeTypeList THEN mappingType
		             WHEN viaMatchType IN $nonComposingMatchEdgeTypeList THEN viaMatchType
		             WHEN mappingType = 'CLOSE_MATCH' OR viaMatchType = 'CLOSE_MATCH' THEN 'CLOSE_MATCH'
		             ELSE 'EXACT_MATCH' END AS rowRelation
		ORDER BY confidence DESC
		// one row per mapping (FIND_MAPPINGS_ROW_IDENTITY_FIELD_LIST): the best-confidence evidence is kept
		WITH rowRelation, direction, fromStableId, toId, mappingType, viaMatchType, head(collect({
			direction: direction,
			fromSource: fromSource,
			fromName: fromName,
			fromStableId: fromStableId,
			toSource: toSource,
			toName: toName,
			toId: toId,
			mappingType: mappingType,
			confidence: confidence,
			matchPredicate: matchPredicate,
			mappingConfidence: mappingConfidence,
			mappingKind: mappingKind,
			mappingSource: mappingSource,
			mappingRationale: mappingRationale,
			viaMatchType: viaMatchType,
			viaConfidence: viaConfidence,
			viaPredicate: viaPredicate,
			viaMappingConfidence: viaMappingConfidence,
			viaMappingKind: viaMappingKind,
			viaMappingSource: viaMappingSource,
			viaMappingRationale: viaMappingRationale,
			cedsDomain: cedsDomain,
			cedsProperty: cedsProperty,
			cedsRange: cedsRange,
			cedsValue: cedsValue,
			cedsQualifier: cedsQualifier,
			fromElementId: fromElementId,
			instanceOf: instanceOf,
			instanceGroupList: instanceGroupList,
			instanceCount: instanceCount,
			viaInstanceGroupList: viaInstanceGroupList,
			viaInstanceCount: viaInstanceCount
		})) AS mappingRow
		WITH rowRelation, mappingRow ORDER BY mappingRow.confidence DESC
		WITH rowRelation, mappingRow.fromSource AS rowStandard, collect(mappingRow) AS standardRowList
		RETURN rowRelation, rowStandard, standardRowList[..$findMappingsRowCap] AS topRowList, size(standardRowList) AS standardRowCount,
		       [standardRow IN standardRowList | standardRow.direction] AS directionList, [standardRow IN standardRowList | standardRow.toId] AS toIdList
	`, {
		name: nameOrId,
		hubSource,
		composingMatchEdgeTypeList: COMPOSING_MATCH_EDGE_TYPE_LIST,
		nonComposingMatchEdgeTypeList: MATCH_EDGE_TYPE_LIST.filter((edgeType) => !COMPOSING_MATCH_EDGE_TYPE_LIST.includes(edgeType)),
		findMappingsRowCap: neo4j.int(FIND_MAPPINGS_ROW_CAP),
	}, callback);
};

const shapeFindMappingsResult = (result) => {
	const rowListByRelationAndStandard = {};
	const totalRowCountByRelationAndStandard = {};
	result.records.forEach((standardRecord) => {
		const rowRelation = standardRecord.get('rowRelation');
		const rowStandard = standardRecord.get('rowStandard');
		rowListByRelationAndStandard[rowRelation] = rowListByRelationAndStandard[rowRelation] || {};
		totalRowCountByRelationAndStandard[rowRelation] = totalRowCountByRelationAndStandard[rowRelation] || {};
		rowListByRelationAndStandard[rowRelation][rowStandard] = standardRecord.get('topRowList');
		totalRowCountByRelationAndStandard[rowRelation][rowStandard] = toNumber(standardRecord.get('standardRowCount'));
	});
	const {
		shownRowList,
		totalRowCountByRelation,
		truncatedRowCountByRelation,
		truncatedRowCountByRelationAndStandard,
	} = allocateMappingRowsByRelation(rowListByRelationAndStandard, totalRowCountByRelationAndStandard);

	const mappingRowList = shownRowList.map(rowObject => {
		const rec = { get: (columnName) => rowObject[columnName] };
		// cedsTuple: the CEDS anchor rendered as its full tuple (domain · property · range [· value]),
		// with the canonicalKey in parens — so consumers show the tuple, not just the bare Global ID.
		const tupleParts = [rec.get('cedsDomain'), rec.get('cedsProperty'), rec.get('cedsRange'), rec.get('cedsValue')].filter(Boolean);
		const mappingRow = {
			direction: rec.get('direction'),
			fromSource: rec.get('fromSource'),
			fromName: rec.get('fromName'),
			fromStableId: rec.get('fromStableId'),
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
	const totalRowCountByDirection = {};
	result.records.forEach((standardRecord) => standardRecord.get('directionList').forEach((direction) => {
		totalRowCountByDirection[direction] = (totalRowCountByDirection[direction] || 0) + 1;
	}));
	const sumOf = (countByRelation) => Object.values(countByRelation).reduce((runningTotal, oneCount) => runningTotal + oneCount, 0);
	return {
		...listEnvelopeFor('findMappings', mappingRowList, sumOf(totalRowCountByRelation)),
		totalRowCountByRelation,
		truncatedRowCountByRelation,
		totalRowCountByRelationAndStandard,
		truncatedRowCountByRelationAndStandard,
		totalRowCountByDirection,
	};
};

// ⟪campaign P4a, Q1⟫ one summary per CEDS tuple the rows reach: its match EDGES and distinct ELEMENTS by relation, read
// from the graph, most edges first, at most HUB_TUPLE_SUMMARY_CAP (hubTupleCount says how many there are)
const shapeHubTupleSummary = (hubTupleResult) => {
	const summaryByToId = {};
	hubTupleResult.records.forEach((relationRecord) => {
		const toId = relationRecord.get('toId');
		const summary = summaryByToId[toId] = summaryByToId[toId] || { toId, toName: relationRecord.get('toName'), edgeCount: 0, edgeCountByRelation: {}, elementCount: 0, elementCountByRelation: {}, instanceEdgeCount: 0, elementStableIdSet: new Set() };
		const relation = relationRecord.get('relation');
		summary.edgeCountByRelation[relation] = toNumber(relationRecord.get('edgeCount'));
		summary.elementCountByRelation[relation] = toNumber(relationRecord.get('elementCount'));
		summary.edgeCount += summary.edgeCountByRelation[relation];
		summary.instanceEdgeCount += toNumber(relationRecord.get('instanceEdgeCount'));
		relationRecord.get('elementStableIdList').forEach((elementStableId) => summary.elementStableIdSet.add(elementStableId));
	});
	const summaryList = Object.values(summaryByToId)
		.map(({ elementStableIdSet, ...summary }) => ({ ...summary, elementCount: elementStableIdSet.size }))
		.sort((summaryA, summaryB) => summaryB.edgeCount - summaryA.edgeCount || (summaryA.toId < summaryB.toId ? -1 : 1));
	return { hubTupleCount: summaryList.length, hubTupleSummaryList: summaryList.slice(0, HUB_TUPLE_SUMMARY_CAP) };
};

// W-D-8 (campaign P1; DME half of G9): whether the build judged option values at all is read from the graph
// (VALUE_TIER_JUDGMENT_COUNT_CYPHER), never assumed. With none, a null matchType means NOT JUDGED — the payload's
// verdict says which, and the rows drop crossStandardEquivalents (it can only be empty). The hub is read from
// :HubDefinition (it was the literal 'CEDS').
const compareCodesets = (session, name, callback) => {
	const emptyNameRefusal = emptyArgumentRefusal(name, '-compareCodesets'); // L8
	if (emptyNameRefusal) {
		callback('', refusalFor('compareCodesets', 'emptyName', emptyNameRefusal));
		return;
	}
	const taskList = new taskListPlus();
	taskList.push((args, next) => resolveHubIdentity(session, mergeArgs(args, next, 'hubIdentity')));
	taskList.push((args, next) => runCypherQuery(session, `
		MATCH (os:ForgedNode {role: 'DmeOptionSet'})
		WHERE toLower(os.name) CONTAINS toLower($name) AND os._source <> $hubSource
		RETURN count(os) AS matchedOptionSetCount
	`, { name, hubSource: args.hubIdentity.hubSource }, (err, countResult) => {
		if (err) {
			next(err, args);
			return;
		}
		next('', { ...args, matchedOptionSetCount: toNumber(countResult.records[0].get('matchedOptionSetCount')) });
	}));
	taskList.push((args, next) => runCypherQuery(session, VALUE_TIER_JUDGMENT_COUNT_CYPHER, {}, (err, countResult) => {
		if (err) {
			next(err, args);
			return;
		}
		next('', { ...args, valueTierJudgmentCount: toNumber(countResult.records[0].get('valueTierJudgmentCount')) });
	}));
	taskList.push((args, next) => {
		if (args.matchedOptionSetCount === 0) {
			next('', args);
			return;
		}
		// Each source option VALUE resolves to a value-tier HubReference; values from other standards on the same hub
		// are its cross-standard equivalents.
		runCypherQuery(session, `
			MATCH (os:ForgedNode {role: 'DmeOptionSet'})
			WHERE toLower(os.name) CONTAINS toLower($name) AND os._source <> $hubSource
			MATCH (os)-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})
			OPTIONAL MATCH (v)-[m:${MATCH_EDGE_PATTERN}]->(hub:HubReference {referenceTier: 'value'})
			OPTIONAL MATCH (hub)-[:HAS_CEDS_VALUE]->(cv:ForgedNode)
			OPTIONAL MATCH (hub)<-[:${MATCH_EDGE_PATTERN}]-(ov:ForgedNode)
			WHERE ov._source <> os._source
			WITH os, v, m, hub, cv, collect(DISTINCT ov._source + ': ' + ov.name) AS crossStandardEquivalents
			ORDER BY os._source, os.name, v.name
			WITH collect({ sourceStandard: os._source, optionSetName: os.name, sourceValue: v.name, matchType: type(m),
			               confidence: m.mappingConfidence, mappingConfidence: m.mappingConfidence, mappingKind: m.mappingKind,
			               mappingSource: m.mappingSource, cedsValue: cv.name, cedsValueKey: hub.canonicalKey,
			               crossStandardEquivalents: crossStandardEquivalents }) AS rowList
			RETURN rowList[..$rowCap] AS valueRowList, size(rowList) AS totalRowCount
		`, { name, hubSource: args.hubIdentity.hubSource, rowCap: neo4j.int(COMPARE_CODESETS_ROW_CAP) }, mergeArgs(args, next, 'valueResult'));
	});
	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(err);
			return;
		}
		if (args.matchedOptionSetCount === 0) {
			callback('', refusalFor('compareCodesets', 'noOptionSetMatched',
				`'${name}' matches no option set by name in any non-hub standard (SIF option sets carry no name in this build and cannot be found by name).`));
			return;
		}
		callback('', shapeCompareCodesetsResult(args));
	});
};

const shapeCompareCodesetsResult = ({ valueResult, valueTierJudgmentCount, matchedOptionSetCount }) => {
	const valueRecord = valueResult.records[0];
	const valuesJudged = valueTierJudgmentCount > 0;
	const valueRowList = valueRecord.get('valueRowList').map((oneRow) => {
		const plainRow = serializeValue(oneRow);
		const shapedRow = {
			sourceStandard: plainRow.sourceStandard,
			optionSetName: plainRow.optionSetName,
			sourceValue: plainRow.sourceValue,
			matchType: plainRow.matchType,
			confidence: plainRow.confidence != null ? Number(plainRow.confidence) : null,
			...(plainRow.mappingConfidence != null ? { mappingConfidence: Number(plainRow.mappingConfidence) } : {}),
			...(plainRow.mappingKind != null ? { mappingKind: plainRow.mappingKind } : {}),
			...(plainRow.mappingSource != null ? { mappingSource: plainRow.mappingSource } : {}),
			cedsValue: plainRow.cedsValue,
			cedsValueKey: plainRow.cedsValueKey,
		};
		if (valuesJudged) {
			shapedRow.crossStandardEquivalents = plainRow.crossStandardEquivalents.filter((equivalentText) => equivalentText && !equivalentText.startsWith('null'));
		}
		return shapedRow;
	});
	return {
		verdict: valuesJudged ? 'judged' : 'valuesNotJudgedInThisBuild',
		...(valuesJudged ? {} : { verdictText: "This build contains no value-level judgments (0 match edges leave an option value); matchType null means NOT JUDGED, not 'does not align'." }),
		valueTierJudgmentCount,
		matchedOptionSetCount,
		...listEnvelopeFor('compareCodesets', valueRowList, toNumber(valueRecord.get('totalRowCount'))),
	};
};

// W-D-9 (campaign P1; A10 ruled excludeHub): the hub does not map to itself, so the backlog of the NON-hub standards is
// listed; the hub is named in the result. UNMAPPED_HUB_POLICY picks the clause from this table (data, not a branch).
const HUB_POLICY_PROPERTY_FILTER_BY_NAME = Object.freeze({
	excludeHub: 'f._source <> $hubSource',
	reportHubSeparately: 'true',
});
const hubPolicyPropertyFilter = () => {
	const propertyFilterText = HUB_POLICY_PROPERTY_FILTER_BY_NAME[UNMAPPED_HUB_POLICY];
	if (!propertyFilterText) {
		throw new Error(`UNMAPPED_HUB_POLICY '${UNMAPPED_HUB_POLICY}' is not one of ${Object.keys(HUB_POLICY_PROPERTY_FILTER_BY_NAME).join(', ')}`);
	}
	return propertyFilterText;
};

const unmappedFields = (session, params, callback) => {
	const limit = parseInt(params.limit, 10);
	resolveStandardFilter(session, 'unmappedFields', params.standard, (filterError, standardFilter) => {
		if (filterError) {
			callback(filterError);
			return;
		}
		if (standardFilter.refusal) {
			callback('', standardFilter.refusal);
			return;
		}
		resolveHubIdentity(session, (hubError, hubIdentity) => {
			if (hubError) {
				callback(hubError);
				return;
			}
			runCypherQuery(session, `
				MATCH (f:ForgedNode {role: 'DmeProperty'})
				WHERE ($sourceList IS NULL OR f._source IN $sourceList)
				  AND ${hubPolicyPropertyFilter()}
				  // ANY edge into a HubReference counts (only match edges point at hubs), so an element mapped by a
				  // relation type this reader does not know is never reported as unmapped
				  AND NOT (f)-->(:HubReference)
				  // a SIF Question / PESC element is mapped when any of its HAS_INSTANCE instances is
				  AND NOT (f)-[:HAS_INSTANCE]->(:ForgedNode)-->(:HubReference)
				WITH f ORDER BY f._source, f.name
				WITH collect({ standard: f._source, fieldName: f.name, path: f.path, description: f.description,
				               isHubStandard: f._source = $hubSource }) AS rowList
				RETURN rowList[..$limit] AS unmappedRowList, size(rowList) AS totalRowCount
			`, { limit: neo4j.int(limit), sourceList: standardFilter.sourceList, hubSource: hubIdentity.hubSource }, (err, result) => {
				if (err) {
					callback(err);
					return;
				}
				const unmappedRecord = result.records[0];
				callback('', {
					...listEnvelopeFor('unmappedFields', unmappedRecord.get('unmappedRowList').map(serializeValue), toNumber(unmappedRecord.get('totalRowCount'))),
					hubStandard: hubIdentity.hubSource,
					hubPolicy: UNMAPPED_HUB_POLICY,
					...familyExpansionFieldsFor(standardFilter),
				});
			});
		});
	});
};

const getStats = (session, callback) => {
	const taskList = new taskListPlus();

	// Node counts by standard (_source)
	taskList.push((args, next) => runCypherQuery(session, `
		MATCH (n:ForgedNode)
		RETURN coalesce(n._source, 'UNSCOPED') AS source, count(n) AS count
		ORDER BY count DESC
	`, {}, mergeArgs(args, next, 'bySourceResult')));

	// Node counts by universal-contract role
	taskList.push((args, next) => runCypherQuery(session, `
		MATCH (n:ForgedNode)
		WHERE n.role IS NOT NULL
		RETURN n.role AS role, count(n) AS count
		ORDER BY count DESC
	`, {}, mergeArgs(args, next, 'byRoleResult')));

	// Cross-standard mapping edge counts
	taskList.push((args, next) => runCypherQuery(session, `
		MATCH ()-[r]->()
		WHERE type(r) IN $matchEdgeTypeList
		RETURN type(r) AS relType, count(r) AS count
	`, { matchEdgeTypeList: MATCH_EDGE_TYPE_LIST }, mergeArgs(args, next, 'mappingResult')));

	// Guard (VIOLET_VALLEY 2026-10-04): an edge into a HubReference of a type outside the four relations (e.g.
	// a future RELATED_MATCH) is counted here rather than silently ignored; it is {} when there are none.
	taskList.push((args, next) => runCypherQuery(session, `
		MATCH ()-[r]->(:HubReference)
		WHERE NOT type(r) IN $matchEdgeTypeList
		RETURN type(r) AS relType, count(r) AS count
	`, { matchEdgeTypeList: MATCH_EDGE_TYPE_LIST }, mergeArgs(args, next, 'otherMatchEdgeResult')));

	// Mapping coverage over DmeProperty nodes. A SIF Question / PESC element counts as mapped when
	// its mapping lives on one of its HAS_INSTANCE instances (the bridges fan verdicts out there).
	// W-D-9 (A10 excludeHub): the hub's own properties are counted apart, never in the denominator.
	taskList.push((args, next) => resolveHubIdentity(session, mergeArgs(args, next, 'hubIdentity')));
	taskList.push((args, next) => runCypherQuery(session, `
		MATCH (f:ForgedNode {role: 'DmeProperty'})
		WITH f, f._source = $hubSource AS isHubProperty,
		     ((f)-->(:HubReference) OR (f)-[:HAS_INSTANCE]->(:ForgedNode)-->(:HubReference)) AS isMapped
		WITH count(CASE WHEN ${hubPolicyPropertyFilter()} THEN 1 END) AS totalProperties,
		     count(CASE WHEN ${hubPolicyPropertyFilter()} AND isMapped THEN 1 END) AS mappedProperties,
		     count(CASE WHEN isHubProperty THEN 1 END) AS hubPropertyCount
		RETURN totalProperties, mappedProperties, hubPropertyCount
	`, { hubSource: args.hubIdentity.hubSource }, mergeArgs(args, next, 'coverageResult')));

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(err);
			return;
		}
		const { bySourceResult, byRoleResult, mappingResult, otherMatchEdgeResult, coverageResult, hubIdentity } = args;
		const bySource = {};
		bySourceResult.records.forEach((rec) => {
			bySource[rec.get('source')] = toNumber(rec.get('count'));
		});
		const byRole = {};
		byRoleResult.records.forEach((rec) => {
			byRole[rec.get('role')] = toNumber(rec.get('count'));
		});
		const mappings = {};
		mappingResult.records.forEach((rec) => {
			mappings[rec.get('relType')] = toNumber(rec.get('count'));
		});
		mappings.otherMatchEdgeCountByType = {};
		otherMatchEdgeResult.records.forEach((rec) => {
			mappings.otherMatchEdgeCountByType[rec.get('relType')] = toNumber(rec.get('count'));
		});
		const coverageRecord = coverageResult.records[0];
		const coverage = {
			totalProperties: toNumber(coverageRecord.get('totalProperties')),
			mappedProperties: toNumber(coverageRecord.get('mappedProperties')),
			hubStandard: hubIdentity.hubSource,
			hubPropertyCount: toNumber(coverageRecord.get('hubPropertyCount')),
			hubPolicy: UNMAPPED_HUB_POLICY,
		};
		callback('', { bySource, byRole, mappings, coverage });
	});
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

// W-D-13 / PLAN A4 edits 3-4 (campaign P1): the tool counts, so the model never counts. totals.standardCount and
// totals.familyList come from the tool's own queries; a family is StandardDefinition.standardFamily (stamped by the forges
// from P3) and NEVER derived from a _source prefix — until it exists familyList is [] and familyNote says why.
const getListStandards = (session, callback) => {
	const taskList = new taskListPlus();
	taskList.push((args, next) => runCypherQuery(session, `
		MATCH (r:DmeStandardRoot)
		OPTIONAL MATCH (d:StandardDefinition {sourceKey: r._source})
		CALL {
			WITH r
			MATCH (n:ForgedNode {_source: r._source})
			RETURN count(n) AS nodeCount
		}
		RETURN r._source AS source,
		       r.standardKey AS standardKey,
		       r.name AS name,
		       r.standardName AS standardName,
		       r.description AS description,
		       r.version AS version,
		       r.sourceUrl AS sourceUrl,
		       d.standardFamily AS standardFamily,
		       d.releaseLabel AS releaseLabel,
		       d.descriptionSource AS descriptionSource,
		       nodeCount
		ORDER BY source
	`, {}, mergeArgs(args, next, 'standardResult')));
	taskList.push((args, next) => runCypherQuery(session, 'MATCH (r:DmeStandardRoot) RETURN count(r) AS standardCount', {}, mergeArgs(args, next, 'standardCountResult')));
	// WEL (2026-10-07): the DME welcome screen renders this list, so each row says whether it IS the hub (read from the
	// one :HubDefinition, never a literal) and how many match edges carry its nodes to the hub. A hub row's count is 0
	// by construction: the hub does not map to itself.
	taskList.push((args, next) => resolveHubIdentity(session, mergeArgs(args, next, 'hubIdentity')));
	taskList.push((args, next) => runCypherQuery(session, `
		MATCH (r:DmeStandardRoot)
		OPTIONAL MATCH (n:ForgedNode {_source: r._source})-[m:${MATCH_EDGE_PATTERN}]->(:HubReference)
		RETURN r._source AS source, count(m) AS hubMatchEdgeCount
	`, {}, mergeArgs(args, next, 'hubMatchEdgeResult')));
	taskList.push((args, next) => runCypherQuery(session, `
		MATCH (d:StandardDefinition) WHERE d.standardFamily IS NOT NULL
		WITH d.standardFamily AS family, collect(d.sourceKey) AS sourceList
		RETURN family, size(sourceList) AS releaseCount, sourceList ORDER BY family
	`, {}, mergeArgs(args, next, 'familyResult')));
	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(err);
			return;
		}
		const hubMatchEdgeCountBySource = Object.fromEntries(args.hubMatchEdgeResult.records.map((rec) => [rec.get('source'), toNumber(rec.get('hubMatchEdgeCount'))]));
		const standards = args.standardResult.records.map((rec) => ({
			source: rec.get('source'),
			standardKey: rec.get('standardKey'),
			name: rec.get('name'),
			standardName: rec.get('standardName'),
			description: rec.get('description'),
			version: rec.get('version'),
			sourceUrl: rec.get('sourceUrl'),
			standardFamily: rec.get('standardFamily'),
			releaseLabel: rec.get('releaseLabel'),
			// educoreForge lane FIX, Fix 3 (TQ): the provenance of the standard's description text, from its card
			descriptionSource: rec.get('descriptionSource'),
			nodeCount: toNumber(rec.get('nodeCount')),
			isHub: rec.get('source') === args.hubIdentity.hubSource,
			hubMatchEdgeCount: hubMatchEdgeCountBySource[rec.get('source')],
			mappedToHub: hubMatchEdgeCountBySource[rec.get('source')] > 0,
		}));
		const familyList = args.familyResult.records.map((rec) => ({
			family: rec.get('family'),
			releaseCount: toNumber(rec.get('releaseCount')),
			sourceList: rec.get('sourceList'),
		}));
		const totals = {
			standardCount: toNumber(args.standardCountResult.records[0].get('standardCount')),
			hubSource: args.hubIdentity.hubSource,
			familyList,
			familyFieldPresent: familyList.length > 0,
			...(familyList.length > 0 ? {} : { familyNote: "this build's StandardDefinitions carry no standardFamily; family totals are unavailable (the forges declare the family — W-C-4, rebuild P3)" }),
		};
		callback('', { standards, count: standards.length, totals });
	});
};

// W-D-11 / W-D-12 (campaign P1): ONE entry per node, keyed by stableId (same-named nodes were merged by labels + name and
// kept the last record's edges), with matchedNodeCount. The name match is exact unless nameMatch says caseInsensitive,
// and an exact lookup ALWAYS reports its case-variant siblings (SIF splits BirthDate / birthDate) so the model can widen.
const EXPLORE_NAME_MATCH_PREDICATE = "(($nameMatch = 'exact' AND n.name = $name) OR ($nameMatch = 'caseInsensitive' AND toLower(n.name) = toLower($name)))";

const exploreNode = (session, params, callback) => {
	const name = params.name;
	const emptyNameRefusal = emptyArgumentRefusal(name, '-explore'); // L8
	if (emptyNameRefusal) {
		callback('', refusalFor('explore', 'emptyName', emptyNameRefusal));
		return;
	}
	const nameMatch = params.nameMatch;
	if (NAME_MATCH_MODE_LIST.indexOf(nameMatch) === -1) {
		callback('', refusalFor('explore', 'invalidNameMatch', `explore nameMatch must be one of ${NAME_MATCH_MODE_LIST.join(', ')}; got '${nameMatch}'.`, NAME_MATCH_MODE_LIST));
		return;
	}
	resolveStandardFilter(session, 'explore', params.standard, (filterError, standardFilter) => {
		if (filterError) {
			callback(filterError);
			return;
		}
		if (standardFilter.refusal) {
			callback('', standardFilter.refusal);
			return;
		}
		const queryParams = { name, nameMatch, sourceList: standardFilter.sourceList };
		const taskList = new taskListPlus();
		// L7: the per-node edge lists are bounded (a standard root explodes the JSON); truncation is REPORTED by the totals
		taskList.push((args, next) => runCypherQuery(session, `
			MATCH (n:ForgedNode)
			WHERE ${EXPLORE_NAME_MATCH_PREDICATE}
			  AND ($sourceList IS NULL OR n._source IN $sourceList)
			WITH n
			OPTIONAL MATCH (n)-[r]->(m:ForgedNode)
			RETURN n.stableId AS nodeStableId, n {.*, _labels: labels(n)} AS node,
			  collect(CASE WHEN m IS NOT NULL THEN {type: type(r), target: m.name, targetStableId: m.stableId, targetSource: m._source, targetLabels: labels(m)} ELSE NULL END) AS outgoing
		`, queryParams, mergeArgs(args, next, 'outgoingResult')));
		taskList.push((args, next) => runCypherQuery(session, `
			MATCH (n:ForgedNode)
			WHERE ${EXPLORE_NAME_MATCH_PREDICATE}
			  AND ($sourceList IS NULL OR n._source IN $sourceList)
			WITH n
			OPTIONAL MATCH (m:ForgedNode)-[r]->(n)
			RETURN n.stableId AS nodeStableId,
			  collect(CASE WHEN m IS NOT NULL THEN {type: type(r), source: m.name, sourceStableId: m.stableId, sourceStandard: m._source, sourceLabels: labels(m)} ELSE NULL END) AS incoming
		`, queryParams, mergeArgs(args, next, 'incomingResult')));
		taskList.push((args, next) => runCypherQuery(session, `
			MATCH (s:ForgedNode)
			WHERE toLower(s.name) = toLower($name) AND s.name <> $name
			  AND ($sourceList IS NULL OR s._source IN $sourceList)
			RETURN count(s) AS caseVariantNodeCount, collect(DISTINCT s.name) AS caseVariantNameList
		`, queryParams, mergeArgs(args, next, 'caseVariantResult')));

		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) {
				callback(err);
				return;
			}
			const { unkeyedNodeText, entryList } = shapeExploreEntryList(args.outgoingResult, args.incomingResult);
			if (unkeyedNodeText) {
				callback(`explore: node without stableId cannot be keyed — ${unkeyedNodeText}`);
				return;
			}
			const caseVariantRecord = args.caseVariantResult.records[0];
			const caseVariantNodeCount = toNumber(caseVariantRecord.get('caseVariantNodeCount'));
			if (entryList.length === 0) {
				callback('', refusalFor('explore', 'nothingMatched',
					`no node${standardFilter.sourceList ? ` in ${standardFilter.sourceList.join(', ')}` : ''} is named '${name}' (${nameMatch} match)${caseVariantNodeCount > 0 ? `; ${caseVariantNodeCount} node(s) bear a case variant (${caseVariantRecord.get('caseVariantNameList').join(', ')}) — retry with nameMatch=caseInsensitive` : '; dme_search finds nodes by meaning'}.`));
				return;
			}
			callback('', {
				...listEnvelopeFor('explore', entryList, entryList.length),
				matchedNodeCount: entryList.length,
				nameMatchMode: nameMatch,
				caseVariantNodeCount,
				caseVariantNameList: caseVariantRecord.get('caseVariantNameList'),
				...familyExpansionFieldsFor(standardFilter),
			});
		});
	});
};

// one entry per node, in _source, role, path order; a node without stableId cannot be keyed and is an error by name
const shapeExploreEntryList = (outgoingResult, incomingResult) => {
	const incomingByStableId = {};
	incomingResult.records.forEach((rec) => {
		incomingByStableId[rec.get('nodeStableId')] = rec.get('incoming').filter((incomingEdge) => incomingEdge !== null);
	});
	const unkeyedRecord = outgoingResult.records.find((rec) => !rec.get('nodeStableId'));
	if (unkeyedRecord) {
		return { unkeyedNodeText: String(unkeyedRecord.get('node')._id), entryList: [] };
	}
	const entryList = outgoingResult.records
		.map((rec) => {
			const node = Object.assign({}, rec.get('node'));
			delete node.embedding;
			const outgoingEdgeList = rec.get('outgoing').filter((outgoingEdge) => outgoingEdge !== null);
			const incomingEdgeList = incomingByStableId[rec.get('nodeStableId')] || [];
			return {
				stableId: rec.get('nodeStableId'),
				node: serializeValue(node),
				outgoingTotal: outgoingEdgeList.length,
				outgoing: outgoingEdgeList.slice(0, EXPLORE_EDGE_CAP).map(serializeValue),
				incomingTotal: incomingEdgeList.length,
				incoming: incomingEdgeList.slice(0, EXPLORE_EDGE_CAP).map(serializeValue),
				edgesTruncated: outgoingEdgeList.length > EXPLORE_EDGE_CAP || incomingEdgeList.length > EXPLORE_EDGE_CAP,
			};
		})
		.sort((entryA, entryB) => [entryA.node._source, entryA.node.role, entryA.node.path, entryA.stableId].join('\u0000')
			.localeCompare([entryB.node._source, entryB.node.role, entryB.node.path, entryB.stableId].join('\u0000')));
	return { unkeyedNodeText: '', entryList };
};

// ⟪campaign P2, V2-C04⟫ dme_history answers THE passport — one row, read by contract through passportReader. It is not an
// event log (no load/embed/bridge history is recorded anywhere); until P2 it read nine retired passport names and turned
// every null into 0, so it reported 'nodeCount 0' for a graph of 243,796 nodes.
const HISTORY_PASSPORT_FIELD_NAME_LIST = Object.freeze(['graphName', 'scratchGraphName', 'manifestRefId', 'builtAt', 'standardsIncluded', 'contentNodeCount', 'contentEdgeCount', 'trustworthyForMeaning', 'trustBasis', 'recipeName', 'recipeHash', 'engineVersions']);
const historyEvents = (session, params, callback) => {
	readPassport({ session, verbName: 'history' }, (err, passportRead) => {
		if (err) {
			callback(err);
			return;
		}
		if (passportRead.refusal) {
			callback('', passportRead.refusal);
			return;
		}
		const passportRow = HISTORY_PASSPORT_FIELD_NAME_LIST.reduce((soFar, fieldName) => (passportRead.passport[fieldName] === undefined ? soFar : { ...soFar, [fieldName]: passportRead.passport[fieldName] }), {});
		callback('', listEnvelopeFor('history', [passportRow], 1));
	});
};

const rawCypher = (session, query, callback) => {
	const emptyQueryRefusal = emptyArgumentRefusal(query, '-rawCypher'); // L8
	if (emptyQueryRefusal) {
		callback('', refusalFor('rawCypher', 'emptyQuery', emptyQueryRefusal));
		return;
	}
	const readOnlyVerdict = validateReadOnly(query);
	if (!readOnlyVerdict.valid) {
		callback('', refusalFor('rawCypher', 'notReadOnly', `-rawCypher runs read-only Cypher only: ${readOnlyVerdict.reason}`));
		return;
	}
	runCypherQuery(session, query, {}, (err, result) => {
		if (err) {
			callback(err);
			return;
		}
		// L7: deep serialization (nested Integers -> numbers, embeddings dropped) and a row
		// cap — truncation is REPORTED, never silent.
		const totalRecords = result.records.length;
		const records = result.records.slice(0, RAW_CYPHER_ROW_CAP).map(rec => {
			const obj = {};
			rec.keys.forEach((columnName) => {
				obj[columnName] = serializeValue(rec.get(columnName));
			});
			return obj;
		});
		callback('', {
			recordCount: records.length,
			totalRecordCount: totalRecords,
			truncated: totalRecords > records.length,
			records,
		});
	});
};

// =====================================================================
// GRAPH RETRIEVER (VectorCypherRetriever)
// =====================================================================

// Ruling C (TQ, 2026-10-05): the retriever answers a real error by name, never with an empty or degraded list; when
// traversal.cypher is absent it runs a flat vector search and its result says so (retrievalMode 'flat'). The
// never-built 'dynamic' traversal mode was deleted, and with it traversalMode: supplying it is refused by name.
// limit and searchMode carry their declared CLI defaults (-help); the retriever refuses either when invalid.
const graphRetriever = (session, query, config, params, callback) => {
	const { retrieve, RUNNABLE_SEARCH_MODE_LIST } = require('./lib/vectorCypherRetriever');

	const emptyQueryRefusal = emptyArgumentRefusal(query, '-graphRetriever');
	if (emptyQueryRefusal) {
		callback('', refusalFor('graphRetriever', 'emptyQuery', emptyQueryRefusal));
		return;
	}
	if (params.traversalMode !== undefined) {
		callback('', refusalFor('graphRetriever', 'traversalModeRemoved', `graphRetriever traversalMode was removed (got '${params.traversalMode}'): the 'dynamic' mode was never built, and graphRetriever always runs traversal.cypher.`));
		return;
	}
	// limit and searchMode are INPUT, so a bad one is a refusal on stdout here; the retriever keeps its own guard (ruling C)
	const limitNumber = Number(params.limit);
	if (!Number.isInteger(limitNumber) || limitNumber < 1) {
		callback('', refusalFor('graphRetriever', 'invalidLimit', `graphRetriever limit must be a positive integer; got ${params.limit}.`));
		return;
	}
	if (RUNNABLE_SEARCH_MODE_LIST.indexOf(params.searchMode) === -1) {
		callback('', refusalFor('graphRetriever', 'invalidSearchMode', `graphRetriever searchMode '${params.searchMode}' cannot run: this graph carries only the vector index on :ForgedNode(embedding) and no fulltext index, so searchMode must be one of ${RUNNABLE_SEARCH_MODE_LIST.join(', ')}.`, RUNNABLE_SEARCH_MODE_LIST));
		return;
	}

	// ⟪campaign P2, V2-C28⟫ the passport must say this graph's vectors are the query embedder's, before anything is embedded
	checkGraphEmbeddingContract({ session, verbName: 'graphRetriever' }, (contractError, contractVerdict) => {
		if (contractError) {
			callback(contractError);
			return;
		}
		if (contractVerdict.refusal) {
			callback('', contractVerdict.refusal);
			return;
		}
		retrieve({
			neo4jSession: session,
			queryText: query,
			embedder: config.embedder,
			traversalFilePath: path.join(__dirname, 'traversal.cypher'),
			limit: Number(params.limit),
			searchMode: params.searchMode,
		}, callback);
	});
};

// =====================================================================
// CALCULATE (A14, campaign P1) — arithmetic the model must not do itself
// =====================================================================
//
// The model is bad at arithmetic (askMilo said "six PESC documents" and listed seven). Every number it states comes
// from a tool result, a Cypher count, or this verb over numbers it already holds. Pure: no graph session. The operation
// names and arities are declared in toolPayloadContract.CALCULATE_OPERATION_ARITY_BY_NAME; the arithmetic is here, one
// function per name, and the two lists must agree (checked at load).

const CALCULATION_BY_OPERATION_NAME = Object.freeze({
	count: (numberList) => numberList.length,
	sum: (numberList) => numberList.reduce((runningTotal, oneNumber) => runningTotal + oneNumber, 0),
	average: (numberList) => numberList.reduce((runningTotal, oneNumber) => runningTotal + oneNumber, 0) / numberList.length,
	minimum: (numberList) => Math.min(...numberList),
	maximum: (numberList) => Math.max(...numberList),
	difference: ([minuend, subtrahend]) => minuend - subtrahend,
	ratio: ([numerator, denominator]) => numerator / denominator,
	percent: ([part, whole]) => (part / whole) * 100,
});
const DIVIDING_OPERATION_NAME_LIST = Object.freeze(['ratio', 'percent']);
if (Object.keys(CALCULATION_BY_OPERATION_NAME).sort().join() !== Object.keys(CALCULATE_OPERATION_ARITY_BY_NAME).sort().join()) {
	throw new Error('dataModelExplorerSearch: CALCULATION_BY_OPERATION_NAME and CALCULATE_OPERATION_ARITY_BY_NAME name different operations');
}
const PLAIN_NUMBER_PATTERN = /^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

const calculate = (params, callback) => {
	const operationName = params.operation;
	const operationArity = CALCULATE_OPERATION_ARITY_BY_NAME[operationName];
	if (!operationArity) {
		callback('', refusalFor('calculate', 'unknownOperation', `calculate operation must be one of ${Object.keys(CALCULATE_OPERATION_ARITY_BY_NAME).join(', ')}; got '${operationName}'.`, Object.keys(CALCULATE_OPERATION_ARITY_BY_NAME)));
		return;
	}
	if (typeof params.numberList !== 'string' || params.numberList.trim() === '') {
		callback('', refusalFor('calculate', 'emptyNumberList', `calculate ${operationName} needs numberList: plain numbers, comma separated (no thousands separators).`));
		return;
	}
	const numberTextList = params.numberList.split(',').map((numberText) => numberText.trim());
	const badNumberTextList = numberTextList.filter((numberText) => !PLAIN_NUMBER_PATTERN.test(numberText));
	if (badNumberTextList.length > 0) {
		callback('', refusalFor('calculate', 'invalidNumberList', `calculate numberList holds ${badNumberTextList.length} item(s) that are not plain numbers: ${badNumberTextList.slice(0, 5).map((numberText) => `'${numberText}'`).join(', ')} (no thousands separators, units or percent signs).`));
		return;
	}
	const numberList = numberTextList.map(Number);
	const countRefusalText = operationArity.exactNumberCount !== undefined && numberList.length !== operationArity.exactNumberCount
		? `exactly ${operationArity.exactNumberCount}`
		: (operationArity.minimumNumberCount !== undefined && numberList.length < operationArity.minimumNumberCount ? `at least ${operationArity.minimumNumberCount}` : '');
	if (countRefusalText) {
		callback('', refusalFor('calculate', 'invalidNumberList', `calculate ${operationName} takes ${countRefusalText} number(s); got ${numberList.length}.`));
		return;
	}
	if (DIVIDING_OPERATION_NAME_LIST.indexOf(operationName) !== -1 && numberList[1] === 0) {
		callback('', refusalFor('calculate', 'divisionByZero', `calculate ${operationName}: the second number (the denominator) is 0.`));
		return;
	}
	const result = CALCULATION_BY_OPERATION_NAME[operationName](numberList);
	callback('', { operation: operationName, numberList, result, resultRoundedToTwoDecimals: Math.round(result * 100) / 100 });
};

// =====================================================================
// SEARCH API (module interface)
// =====================================================================

// queryType -> handler. Every handler is (session, params, config, callback).
const QUERY_HANDLER_BY_QUERY_TYPE = {
	search: (session, params, config, callback) => hybridSearch(session, params.query, config, params, callback),
	graphRetriever: (session, params, config, callback) => graphRetriever(session, params.query, config, params, callback),
	findMappings: (session, params, config, callback) => findMappings(session, params.name, callback),
	compareCodesets: (session, params, config, callback) => compareCodesets(session, params.name, callback),
	unmappedFields: (session, params, config, callback) => unmappedFields(session, params, callback),
	stats: (session, params, config, callback) => getStats(session, callback),
	listStandards: (session, params, config, callback) => getListStandards(session, callback),
	rawCypher: (session, params, config, callback) => rawCypher(session, params.query, callback),
	explore: (session, params, config, callback) => exploreNode(session, params, callback),
	history: (session, params, config, callback) => historyEvents(session, params, callback),
	describeGraph: (session, params, config, callback) => require('./lib/describeGraph').describeGraph(session, params, callback),
};

// W-E-10 (X2, campaign P0, 2026-10-06): READ is the default and WRITE the exception that must be declared BY NAME. The
// DME CLI has no write verb, so the list is empty and every verb's session refuses writes at Neo4j itself, whatever a
// filter upstream let through. (Until 2026-10-06 the inverse list held only describeGraph, and ten verbs opened write
// sessions on the golden graph — rawCypher among them; measured on a scratch graph: all ten wrote.)
const WRITE_CAPABLE_QUERY_TYPE_LIST = Object.freeze([]);
const sessionAccessModeFor = (queryType) => (WRITE_CAPABLE_QUERY_TYPE_LIST.indexOf(queryType) === -1 ? neo4j.session.READ : neo4j.session.WRITE);

// a verb that needs no graph runs without config or a session
const GRAPHLESS_HANDLER_BY_QUERY_TYPE = Object.freeze({
	calculate: (params, callback) => calculate(params, callback),
});

const search = (queryType, params, callback) => {
	if (GRAPHLESS_HANDLER_BY_QUERY_TYPE[queryType]) {
		GRAPHLESS_HANDLER_BY_QUERY_TYPE[queryType](params, callback);
		return;
	}
	loadConfig((configError, config) => {
		if (configError) {
			callback(`Config error: ${configError}`);
			return;
		}
		const queryHandler = QUERY_HANDLER_BY_QUERY_TYPE[queryType];
		withNeo4jSession(config, { accessMode: sessionAccessModeFor(queryType) }, (session, sessionCallback) => {
			if (!queryHandler) {
				// an unknown type is answered by name as the result, as it always was
				sessionCallback('', { error: `Unknown query type: ${queryType}` });
				return;
			}
			queryHandler(session, params, config, sessionCallback);
		}, (queryError, result) => {
			if (queryError) {
				callback(`Query failed: ${queryError}`);
				return;
			}
			callback(null, result);
		});
	});
};

// =====================================================================
// CLI ENTRY POINT
// =====================================================================

// W-D-20 (campaign P1): the command line is read through VERB_INPUT_CONTRACT — the one registry provider.json is held
// to — instead of an if/else chain that silently ignored any flag a verb did not read. A flag, switch or argument the
// verb does not take is REFUSED by name (stdout JSON, exit 0, no graph session); a declared integer flag is refused when
// it is not a positive integer. A flag given with no value ('--query=') arrives as the boolean true, and the verb's own
// empty-argument refusal answers it.
const parseCommandLine = (argumentList) => {
	const switchNameList = [];
	const flagValueByName = {};
	const positionalArgumentList = [];
	argumentList.forEach((argumentText) => {
		if (argumentText.startsWith('--')) {
			const [flagName, ...valuePartList] = argumentText.slice(2).split('=');
			flagValueByName[flagName] = valuePartList.join('=') || true;
		} else if (argumentText.startsWith('-')) {
			switchNameList.push(argumentText.slice(1));
		} else {
			positionalArgumentList.push(argumentText);
		}
	});
	return { switchNameList, flagValueByName, positionalArgumentList };
};

const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const INTEGER_FLAG_REFUSAL_NAME_BY_FLAG = Object.freeze({ limit: 'invalidLimit' });

// answers { queryType, params } or { refusal }; the verb is the one switch VERB_INPUT_CONTRACT names
const resolveVerbInvocation = ({ switchNameList, flagValueByName, positionalArgumentList }) => {
	const verbNameList = switchNameList.filter((switchName) => VERB_INPUT_CONTRACT[switchName]);
	const queryType = verbNameList[0];
	const inputRow = VERB_INPUT_CONTRACT[queryType];
	const takesText = `it takes: ${[...inputRow.positionalList.map((positionalName) => `<${positionalName}>`), ...inputRow.flagList.map((flagName) => `--${flagName}=`)].join(' ') || 'nothing'}`;
	const strayText = [
		...switchNameList.filter((switchName) => switchName !== queryType).map((switchName) => `-${switchName}`),
		...Object.keys(flagValueByName).filter((flagName) => inputRow.flagList.indexOf(flagName) === -1 && !(inputRow.retiredFlagRefusalByName || {})[flagName]).map((flagName) => `--${flagName}`),
		...positionalArgumentList.slice(inputRow.positionalList.length).map((argumentText) => `'${argumentText}'`),
	];
	const retiredFlagName = Object.keys(flagValueByName).find((flagName) => (inputRow.retiredFlagRefusalByName || {})[flagName]);
	if (retiredFlagName) {
		const { refusalName, reasonText } = inputRow.retiredFlagRefusalByName[retiredFlagName];
		return { refusal: refusalFor(queryType, refusalName, `${queryType} --${retiredFlagName} was removed (got '${flagValueByName[retiredFlagName]}'): ${reasonText}.`) };
	}
	if (strayText.length > 0) {
		return { refusal: refusalFor(queryType, 'unknownFlag', `-${queryType} does not take ${strayText.join(', ')}; ${takesText}.`) };
	}
	const params = { ...(VERB_FLAG_DEFAULT_BY_VERB[queryType] || {}) };
	inputRow.positionalList.forEach((positionalName, positionalIndex) => {
		params[positionalName] = positionalArgumentList[positionalIndex] === undefined ? '' : positionalArgumentList[positionalIndex];
	});
	inputRow.flagList.forEach((flagName) => {
		if (flagValueByName[flagName] !== undefined) params[flagName] = flagValueByName[flagName];
	});
	const badIntegerFlagName = (inputRow.integerFlagList || []).find((flagName) => params[flagName] !== undefined && !POSITIVE_INTEGER_PATTERN.test(String(params[flagName])));
	if (badIntegerFlagName) {
		return { refusal: refusalFor(queryType, INTEGER_FLAG_REFUSAL_NAME_BY_FLAG[badIntegerFlagName], `${queryType} ${badIntegerFlagName} must be a positive integer; got ${params[badIntegerFlagName]}.`) };
	}
	return { queryType, params };
};

const usageText = () => Object.keys(VERB_INPUT_CONTRACT).map((verbName) => {
	const inputRow = VERB_INPUT_CONTRACT[verbName];
	const defaultByFlag = VERB_FLAG_DEFAULT_BY_VERB[verbName] || {};
	return `  ${moduleName} -${verbName} ${[
		...inputRow.positionalList.map((positionalName) => `"<${positionalName}>"`),
		...inputRow.flagList.map((flagName) => `[--${flagName}=${defaultByFlag[flagName] !== undefined ? defaultByFlag[flagName] : `<${flagName}>`}]`),
	].join(' ')}`;
}).join('\n');

if (require.main === module) {
	const commandLine = parseCommandLine(process.argv.slice(2));
	if (commandLine.switchNameList.indexOf('help') !== -1) {
		process.stderr.write(`Usage (a standard is a _source value from -listStandards; -describeGraph is the graph card):\n${usageText()}\n`);
		process.exit(0);
	}
	if (!commandLine.switchNameList.some((switchName) => VERB_INPUT_CONTRACT[switchName])) {
		process.stderr.write(`${moduleName}: No action specified. Use -help for usage.\n`);
		process.exit(1);
	}
	const invocation = resolveVerbInvocation(commandLine);
	if (invocation.refusal) {
		console.log(JSON.stringify(invocation.refusal, null, 2));
		process.exit(0);
	}
	search(invocation.queryType, invocation.params, (err, results) => {
		if (err) {
			process.stderr.write(`Error: ${err}\n`);
			process.exit(1);
		}
		console.log(JSON.stringify(results, null, 2));
	});
}

module.exports = { search, withNeo4jSession, sessionAccessModeFor, QUERY_HANDLER_BY_QUERY_TYPE, WRITE_CAPABLE_QUERY_TYPE_LIST };
