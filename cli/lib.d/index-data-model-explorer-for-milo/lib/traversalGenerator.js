'use strict';

// traversalGenerator.js — Generate complete traversal.cypher from schema-summary.json
// Produces a self-contained, executable Cypher query with:
//   - UNION ALL preamble (vector + BM25 indexes)
//   - Dedup and ranking
//   - Label-filtered OPTIONAL MATCHes for graph context
//   - Complete RETURN clause

const fs = require('fs');
const path = require('path');

const UMBRELLA_LABELS = ['CEDS', 'SifModel'];

// Cardinality threshold: above this, use CALL {} subquery with collect() to prevent Cartesian products
const HIGH_CARDINALITY_THRESHOLD = 2;

// The PURE-MODEL traversal (forge pure-graph contract). The leg-assembly in
// buildCypherQuery below is legacy-schema-row-driven — its bridge types (MAPS_TO/
// ALIGNS_WITH/STRUCTURALLY_MAPS_TO) are retired on the pure model, so against a
// pure-model schema it emitted NO mapping legs and --apply would DESTROY the
// hand-authored match-edge->HubReference legs (the 2026-07-01 M6
// rewrite). When the schema-summary declares the pure-model contract, the generator
// emits this canonical template verbatim instead. The template is graph-agnostic:
// the vector index name arrives at runtime as $indexName (runtime discovery), so one
// frozen template serves every pure-model graph.
const PURE_MODEL_TRAVERSAL = "// traversal.cypher — DataModelExplorer (forge pure-graph contract)\n// Vector: single unified index on :ForgedNode(embedding), COSINE, 1024-dim. The\n//   builder names it <graphName>_vector, so the name is DISCOVERED at runtime by\n//   the caller and passed in as $indexName — never hardcoded here.\n// No fulltext index exists in the forge graph.\n// Node model: :ForgedNode distinguished by role (DmeClass, DmeProperty, DmeOptionSet,\n//   DmeOptionValue, DmeSupport, DmeStandardRoot) and _source (CEDS/EdFi/LIF/…).\n// Cross-standard mapping: elements resolve to CEDS tuples (:HubReference) through four\n//   match edges, one per SKOS relation (EXACT/CLOSE/BROAD/NARROW_MATCH). Every one is a\n//   judgment carrying mappingConfidence/mappingKind/mappingSource; none is authored fact.\n//   mappingSource 'bridge-debug' marks a debug judge's edge (match edges carry no provenanceTier).\n//   Two elements sharing a hub are 'equivalent' ONLY when both hops are EXACT_MATCH; an\n//   EXACT/CLOSE pair with a CLOSE hop is a candidateEquivalent; any BROAD/NARROW hop makes\n//   the pair 'related', never equivalent. Each mapping list is capped at 20 entries SHARED\n//   per relation: every relation present first gets up to 5 entries (best confidence first),\n//   then the rest fill in relation order; <list>TruncatedByRelation names what was left out,\n//   so no relation is ever silently dropped (ruling 2026-10-04). Fill entries are counted by a carried\n//   rowRelation, never by `entry IN list`: map equality with null values is null, so IN never matches.\n//   SPECIFIED/IMPLIED_MAPPING retired.\n// Structural edges: HAS_PROPERTY, HAS_OPTION_SET, HAS_VALUE, HAS_SUPPORT, HAS_CLASS,\n//   SUBCLASS_OF, REFERENCES; SIF/PESC add HAS_INSTANCE, HAS_FIELD, HAS_CHILD (see instanceView).\n// Updated: 2026-10-04 (four SKOS relations + judgment fields; was 2026-07-01 equivalence-model rewrite)\n// Parameters: $embedding (list<float>), $limit (int), $query (string), $indexName (string)\n\n// === Search preamble: single unified vector query over the discovered index ===\nCALL db.index.vector.queryNodes($indexName, $limit, $embedding) YIELD node, score\nWITH node, score AS vecScore, 0.0 AS ftScore\n\n// === Rank ===\nWITH node, vecScore, ftScore,\n     (CASE WHEN ftScore > 0 THEN 0.5 ELSE 0 END) +\n     (CASE WHEN vecScore > 0 THEN vecScore * 0.5 ELSE 0 END) AS combinedScore\nORDER BY combinedScore DESC LIMIT $limit\n\n// === Traversal: forge-contract structural neighborhood ===\n\n// Parent classes that own this property (role-filtered)\nCALL {\n  WITH node\n  OPTIONAL MATCH (c:ForgedNode {role: 'DmeClass'})-[:HAS_PROPERTY]->(node:ForgedNode {role: 'DmeProperty'})\n  RETURN collect(DISTINCT c { ._id, ._source, .name, .path })[..10] AS parentClasses\n}\n\n// Option set attached to this property\nCALL {\n  WITH node\n  OPTIONAL MATCH (node:ForgedNode {role: 'DmeProperty'})-[:HAS_OPTION_SET]->(os:ForgedNode {role: 'DmeOptionSet'})\n  RETURN collect(DISTINCT os { ._id, ._source, .name })[..10] AS optionSets\n}\n\n// Allowed values when this node is an option set (DmeOptionValue.value text is in name)\nCALL {\n  WITH node\n  OPTIONAL MATCH (node:ForgedNode {role: 'DmeOptionSet'})-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})\n  RETURN collect(DISTINCT v { ._id, .name, .description })[..50] AS optionValues\n}\n\n// Supports attached to this node\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)-[:HAS_SUPPORT]->(sup:ForgedNode {role: 'DmeSupport'})\n  RETURN collect(DISTINCT sup { ._id, ._source, .name, .description })[..10] AS supports\n}\n\n// Subclass / superclass relationships\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)-[:SUBCLASS_OF]->(parent:ForgedNode)\n  RETURN collect(DISTINCT parent { ._id, ._source, .name })[..10] AS superClasses\n}\nCALL {\n  WITH node\n  OPTIONAL MATCH (child:ForgedNode)-[:SUBCLASS_OF]->(node)\n  RETURN collect(DISTINCT child { ._id, ._source, .name })[..10] AS subClasses\n}\n\n// Classes owned by this standard root / properties owned by a class\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)-[:HAS_CLASS]->(cls:ForgedNode {role: 'DmeClass'})\n  RETURN collect(DISTINCT cls { ._id, ._source, .name })[..20] AS ownedClasses\n}\n\n// Intra-standard cross references\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)-[:REFERENCES]->(ref:ForgedNode)\n  RETURN collect(DISTINCT ref { ._id, ._source, .name, .role })[..10] AS referencesTo\n}\nCALL {\n  WITH node\n  OPTIONAL MATCH (referrer:ForgedNode)-[:REFERENCES]->(node)\n  RETURN collect(DISTINCT referrer { ._id, ._source, .name, .role })[..10] AS referencedBy\n}\n\n// CEDS anchors (outgoing) — this element's resolution to CEDS tuples (:HubReference),\n// each a judgment (relation + mappingConfidence + mappingSource).\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub:HubReference)\n  WITH m, hub, type(m) AS rowRelation\n  WITH m, hub, rowRelation, CASE rowRelation WHEN 'EXACT_MATCH' THEN 0 WHEN 'CLOSE_MATCH' THEN 1 WHEN 'BROAD_MATCH' THEN 2 WHEN 'NARROW_MATCH' THEN 3 ELSE 4 END AS relationOrder\n  ORDER BY m.confidence DESC\n  WITH rowRelation, relationOrder, collect({\n    toSource: 'CEDS', toName: hub.name, toId: hub.canonicalKey,\n    mappingType: type(m), confidence: m.confidence,\n    matchPredicate: m.predicate,\n    mappingConfidence: m.mappingConfidence, mappingKind: m.mappingKind, mappingSource: m.mappingSource\n  }) AS relationEntryList\n  ORDER BY relationOrder\n  WITH collect({rowRelation: rowRelation, entryList: relationEntryList}) AS relationGroupList\n  WITH relationGroupList,\n       reduce(keptList = [], relationGroup IN relationGroupList | keptList + relationGroup.entryList[..5]) AS guaranteedEntryList,\n       reduce(keptList = [], relationGroup IN relationGroupList |\n              keptList + [leftoverEntry IN relationGroup.entryList[5..] | {rowRelation: relationGroup.rowRelation, entry: leftoverEntry}]) AS leftoverPairList\n  WITH relationGroupList, guaranteedEntryList, leftoverPairList[..(20 - size(guaranteedEntryList))] AS fillPairList\n  RETURN guaranteedEntryList + [fillPair IN fillPairList | fillPair.entry] AS mappingsOutgoing,\n         [truncation IN [relationGroup IN relationGroupList WHERE relationGroup.rowRelation IS NOT NULL |\n            {relation: relationGroup.rowRelation,\n             truncatedCount: size(relationGroup.entryList) - size(relationGroup.entryList[..5])\n                             - size([fillPair IN fillPairList WHERE fillPair.rowRelation = relationGroup.rowRelation])}]\n          WHERE truncation.truncatedCount > 0] AS mappingsOutgoingTruncatedByRelation\n}\n\n// Cross-standard pairs (shared hub) — other standards' elements resolving to the SAME\n// CEDS tuple. equivalence = 'equivalent' ONLY for EXACT×EXACT (two judgments); an\n// EXACT/CLOSE pair with a CLOSE hop = 'candidateEquivalent'; any BROAD/NARROW hop =\n// 'related' (never equivalent). Both hops' evidence is carried — never a combined score.\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)-[mNear:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub:HubReference)<-[mFar:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(other:ForgedNode)\n  WHERE other <> node\n  WITH mNear, hub, mFar, other, CASE WHEN mNear IS NULL THEN null WHEN type(mFar) IN ['BROAD_MATCH', 'NARROW_MATCH'] THEN type(mFar) WHEN type(mNear) IN ['BROAD_MATCH', 'NARROW_MATCH'] THEN type(mNear) WHEN type(mNear) = 'CLOSE_MATCH' OR type(mFar) = 'CLOSE_MATCH' THEN 'CLOSE_MATCH' ELSE 'EXACT_MATCH' END AS rowRelation\n  WITH mNear, hub, mFar, other, rowRelation, CASE rowRelation WHEN 'EXACT_MATCH' THEN 0 WHEN 'CLOSE_MATCH' THEN 1 WHEN 'BROAD_MATCH' THEN 2 WHEN 'NARROW_MATCH' THEN 3 ELSE 4 END AS relationOrder\n  ORDER BY mFar.confidence DESC\n  WITH rowRelation, relationOrder, collect({\n    otherSource: other._source, otherName: other.name, otherId: other._id,\n    hubName: hub.name, hubKey: hub.canonicalKey,\n    equivalence: CASE WHEN type(mNear) = 'EXACT_MATCH' AND type(mFar) = 'EXACT_MATCH' THEN 'equivalent'\n                      WHEN type(mNear) IN ['BROAD_MATCH', 'NARROW_MATCH'] OR type(mFar) IN ['BROAD_MATCH', 'NARROW_MATCH'] THEN 'related'\n                      ELSE 'candidateEquivalent' END,\n    nearMatchType: type(mNear), nearConfidence: mNear.confidence, nearPredicate: mNear.predicate,\n    farMatchType: type(mFar), farConfidence: mFar.confidence, farPredicate: mFar.predicate,\n    nearMappingConfidence: mNear.mappingConfidence, nearMappingKind: mNear.mappingKind, nearMappingSource: mNear.mappingSource,\n    farMappingConfidence: mFar.mappingConfidence, farMappingKind: mFar.mappingKind, farMappingSource: mFar.mappingSource\n  }) AS relationEntryList\n  ORDER BY relationOrder\n  WITH collect({rowRelation: rowRelation, entryList: relationEntryList}) AS relationGroupList\n  WITH relationGroupList,\n       reduce(keptList = [], relationGroup IN relationGroupList | keptList + relationGroup.entryList[..5]) AS guaranteedEntryList,\n       reduce(keptList = [], relationGroup IN relationGroupList |\n              keptList + [leftoverEntry IN relationGroup.entryList[5..] | {rowRelation: relationGroup.rowRelation, entry: leftoverEntry}]) AS leftoverPairList\n  WITH relationGroupList, guaranteedEntryList, leftoverPairList[..(20 - size(guaranteedEntryList))] AS fillPairList\n  RETURN guaranteedEntryList + [fillPair IN fillPairList | fillPair.entry] AS crossStandardEquivalents,\n         [truncation IN [relationGroup IN relationGroupList WHERE relationGroup.rowRelation IS NOT NULL |\n            {relation: relationGroup.rowRelation,\n             truncatedCount: size(relationGroup.entryList) - size(relationGroup.entryList[..5])\n                             - size([fillPair IN fillPairList WHERE fillPair.rowRelation = relationGroup.rowRelation])}]\n          WHERE truncation.truncatedCount > 0] AS crossStandardEquivalentsTruncatedByRelation\n}\n\n// Source elements resolving here (incoming) — when this node is a CEDS leaf, the\n// standards' elements whose tuple contains it.\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)<-[:HAS_CEDS_DOMAIN|HAS_CEDS_PROPERTY|HAS_CEDS_RANGE|HAS_CEDS_VALUE|HAS_CEDS_QUALIFIER]-(hub:HubReference)<-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(src:ForgedNode)\n  WITH hub, m, src, type(m) AS rowRelation\n  WITH hub, m, src, rowRelation, CASE rowRelation WHEN 'EXACT_MATCH' THEN 0 WHEN 'CLOSE_MATCH' THEN 1 WHEN 'BROAD_MATCH' THEN 2 WHEN 'NARROW_MATCH' THEN 3 ELSE 4 END AS relationOrder\n  ORDER BY m.confidence DESC\n  WITH rowRelation, relationOrder, collect({\n    fromSource: src._source, fromName: src.name, fromId: src._id,\n    hubName: hub.name, hubKey: hub.canonicalKey,\n    mappingType: type(m), confidence: m.confidence,\n    matchPredicate: m.predicate,\n    mappingConfidence: m.mappingConfidence, mappingKind: m.mappingKind, mappingSource: m.mappingSource\n  }) AS relationEntryList\n  ORDER BY relationOrder\n  WITH collect({rowRelation: rowRelation, entryList: relationEntryList}) AS relationGroupList\n  WITH relationGroupList,\n       reduce(keptList = [], relationGroup IN relationGroupList | keptList + relationGroup.entryList[..5]) AS guaranteedEntryList,\n       reduce(keptList = [], relationGroup IN relationGroupList |\n              keptList + [leftoverEntry IN relationGroup.entryList[5..] | {rowRelation: relationGroup.rowRelation, entry: leftoverEntry}]) AS leftoverPairList\n  WITH relationGroupList, guaranteedEntryList, leftoverPairList[..(20 - size(guaranteedEntryList))] AS fillPairList\n  RETURN guaranteedEntryList + [fillPair IN fillPairList | fillPair.entry] AS mappingsIncoming,\n         [truncation IN [relationGroup IN relationGroupList WHERE relationGroup.rowRelation IS NOT NULL |\n            {relation: relationGroup.rowRelation,\n             truncatedCount: size(relationGroup.entryList) - size(relationGroup.entryList[..5])\n                             - size([fillPair IN fillPairList WHERE fillPair.rowRelation = relationGroup.rowRelation])}]\n          WHERE truncation.truncatedCount > 0] AS mappingsIncomingTruncatedByRelation\n}\n\n// Instance view (lane D, 2026-10-01) — SIF and PESC put their CEDS mappings on INSTANCE nodes:\n// SIF Question -[:HAS_INSTANCE]-> Field (one per object), PESC element -[:HAS_INSTANCE]-> occurrence\n// (one per document position). The vector hit is the declaration, which carries no mapping edge,\n// so its mappings are read through its instances and grouped by where each instance sits: the\n// owning SIF Object (HAS_FIELD), else the PESC occurrence's sectionPath. SIF structure rides along:\n// HAS_FIELD (object owns field) and HAS_CHILD (element contains element). instanceView is null\n// when the node has none of these, and the caller omits a null instanceView, so CEDS and Ed-Fi\n// results carry no new key.\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)-[:HAS_INSTANCE]->(inst:ForgedNode)\n  WITH node, inst,\n       coalesce(head([(groupObject:ForgedNode)-[:HAS_FIELD]->(inst) | groupObject.name]), inst.sectionPath) AS instGroupName\n  WITH node, instGroupName, count(inst) AS groupInstanceCount, collect(inst.path)[..3] AS groupPathSampleList\n  WHERE groupInstanceCount > 0\n  RETURN collect({ group: instGroupName, instanceCount: groupInstanceCount, pathSampleList: groupPathSampleList })[..30] AS instancesByGroup,\n         sum(groupInstanceCount) AS instanceTotal\n}\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)-[:HAS_INSTANCE]->(inst:ForgedNode)-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub:HubReference)\n  WITH hub, type(m) AS matchType, m.confidence AS confidence, m.predicate AS matchPredicate,\n       m.mappingConfidence AS mappingConfidence, m.mappingKind AS mappingKind, m.mappingSource AS mappingSource,\n       coalesce(head([(groupObject:ForgedNode)-[:HAS_FIELD]->(inst) | groupObject.name]), inst.sectionPath) AS instGroupName,\n       inst\n  WITH hub, matchType, confidence, matchPredicate,\n       mappingConfidence, mappingKind, mappingSource,\n       collect(DISTINCT instGroupName) AS instanceGroupList, count(inst) AS instanceCount\n  WHERE hub IS NOT NULL\n  WITH hub, matchType, confidence, matchPredicate, mappingConfidence, mappingKind, mappingSource, instanceGroupList, instanceCount, matchType AS rowRelation\n  WITH hub, matchType, confidence, matchPredicate, mappingConfidence, mappingKind, mappingSource, instanceGroupList, instanceCount, rowRelation, CASE rowRelation WHEN 'EXACT_MATCH' THEN 0 WHEN 'CLOSE_MATCH' THEN 1 WHEN 'BROAD_MATCH' THEN 2 WHEN 'NARROW_MATCH' THEN 3 ELSE 4 END AS relationOrder\n  ORDER BY confidence DESC\n  WITH rowRelation, relationOrder, collect({\n    toSource: 'CEDS', toName: hub.name, toId: hub.canonicalKey,\n    mappingType: matchType, confidence: confidence, matchPredicate: matchPredicate,\n    mappingConfidence: mappingConfidence, mappingKind: mappingKind, mappingSource: mappingSource,\n    instanceGroupList: instanceGroupList[..25], instanceGroupCount: size(instanceGroupList), instanceCount: instanceCount\n  }) AS relationEntryList\n  ORDER BY relationOrder\n  WITH collect({rowRelation: rowRelation, entryList: relationEntryList}) AS relationGroupList\n  WITH relationGroupList,\n       reduce(keptList = [], relationGroup IN relationGroupList | keptList + relationGroup.entryList[..5]) AS guaranteedEntryList,\n       reduce(keptList = [], relationGroup IN relationGroupList |\n              keptList + [leftoverEntry IN relationGroup.entryList[5..] | {rowRelation: relationGroup.rowRelation, entry: leftoverEntry}]) AS leftoverPairList\n  WITH relationGroupList, guaranteedEntryList, leftoverPairList[..(20 - size(guaranteedEntryList))] AS fillPairList\n  RETURN guaranteedEntryList + [fillPair IN fillPairList | fillPair.entry] AS mappingsViaInstances,\n         [truncation IN [relationGroup IN relationGroupList WHERE relationGroup.rowRelation IS NOT NULL |\n            {relation: relationGroup.rowRelation,\n             truncatedCount: size(relationGroup.entryList) - size(relationGroup.entryList[..5])\n                             - size([fillPair IN fillPairList WHERE fillPair.rowRelation = relationGroup.rowRelation])}]\n          WHERE truncation.truncatedCount > 0] AS mappingsViaInstancesTruncatedByRelation\n}\nCALL {\n  WITH node\n  OPTIONAL MATCH (declaration:ForgedNode)-[:HAS_INSTANCE]->(node)\n  RETURN head(collect(declaration { ._id, ._source, .name, .role })) AS instanceOf\n}\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)-[:HAS_FIELD]->(ownedField:ForgedNode)\n  RETURN collect(ownedField { ._id, .name, .path })[..20] AS ownedFields, count(ownedField) AS ownedFieldCount\n}\nCALL {\n  WITH node\n  OPTIONAL MATCH (owningObject:ForgedNode)-[:HAS_FIELD]->(node)\n  RETURN collect(owningObject { ._id, ._source, .name })[..10] AS owningObjects\n}\nCALL {\n  WITH node\n  OPTIONAL MATCH (structuralParent:ForgedNode)-[:HAS_CHILD]->(node)\n  RETURN collect(structuralParent { ._id, .name, .path, .role })[..10] AS structuralParents\n}\nCALL {\n  WITH node\n  OPTIONAL MATCH (node)-[:HAS_CHILD]->(structuralChild:ForgedNode)\n  RETURN collect(structuralChild { ._id, .name, .path, .role })[..20] AS structuralChildren, count(structuralChild) AS structuralChildCount\n}\nWITH *,\n     CASE WHEN instanceTotal = 0 AND instanceOf IS NULL AND ownedFieldCount = 0\n               AND size(owningObjects) = 0 AND size(structuralParents) = 0 AND structuralChildCount = 0\n          THEN null\n          ELSE {\n            instanceOf: instanceOf, instanceTotal: instanceTotal, instancesByGroup: instancesByGroup,\n            mappingsViaInstances: mappingsViaInstances, mappingsViaInstancesTruncatedByRelation: mappingsViaInstancesTruncatedByRelation,\n            ownedFieldCount: ownedFieldCount, ownedFields: ownedFields, owningObjects: owningObjects,\n            structuralParents: structuralParents,\n            structuralChildCount: structuralChildCount, structuralChildren: structuralChildren\n          }\n     END AS instanceView\n\n// === Return ===\nRETURN\n  node,\n  combinedScore,\n  vecScore,\n  ftScore,\n  labels(node) AS nodeLabels,\n  node.role AS role,\n  node._source AS source,\n  parentClasses,\n  optionSets,\n  optionValues,\n  supports,\n  superClasses,\n  subClasses,\n  ownedClasses,\n  referencesTo,\n  referencedBy,\n  mappingsOutgoing,\n  mappingsOutgoingTruncatedByRelation,\n  crossStandardEquivalents,\n  crossStandardEquivalentsTruncatedByRelation,\n  mappingsIncoming,\n  mappingsIncomingTruncatedByRelation,\n  instanceView\n";

// pure-model schema = declares the forge contract and carries the EXACT_MATCH edge type
const isPureModelSchema = (schema) =>
	Boolean(schema.contract) &&
	(schema.relationships || []).some((oneRel) => oneRel.type === 'EXACT_MATCH');

const generateTraversal = ({ schemaPath, outputDir, apply, preview }) => {
	const { xLog } = process.global;

	if (!fs.existsSync(schemaPath)) {
		xLog.error(`[traversalGenerator] schema-summary.json not found: ${schemaPath}`);
		return null;
	}

	const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
	xLog.status(`[traversalGenerator] Loaded schema from ${schemaPath}`);

	// Identify the PRIMARY vector-indexed node types (the ones with actual embeddings)
	const vectorNodeLabels = identifyPrimaryVectorTypes(schema);
	xLog.status(`[traversalGenerator] Primary vector-indexed types: ${vectorNodeLabels.join(', ')}`);

	// Generate the complete Cypher query
	const pureModel = isPureModelSchema(schema);
	if (pureModel) {
		xLog.status('[traversalGenerator] pure-model contract detected: emitting the canonical pure-model traversal (EXACT/CLOSE/BROAD/NARROW_MATCH -> HubReference mapping legs included)');
	}
	const cypher = pureModel
		? PURE_MODEL_TRAVERSAL
		: buildCypherQuery(schema, vectorNodeLabels);

	// Write traversal.generated.cypher (always overwritten)
	const generatedPath = path.join(outputDir, 'traversal.generated.cypher');
	fs.writeFileSync(generatedPath, cypher);
	xLog.status(`[traversalGenerator] Wrote ${generatedPath}`);

	// Handle traversal.cypher
	const traversalPath = path.join(outputDir, 'traversal.cypher');

	if (!fs.existsSync(traversalPath)) {
		fs.writeFileSync(traversalPath, cypher);
		xLog.status(`[traversalGenerator] Created ${traversalPath} (first generation)`);
	} else if (preview) {
		const existing = fs.readFileSync(traversalPath, 'utf8');
		if (existing === cypher) {
			xLog.status('[traversalGenerator] traversal.cypher is already up-to-date');
		} else {
			const existingLines = existing.split('\n').length;
			const newLines = cypher.split('\n').length;
			xLog.status(`[traversalGenerator] traversal.cypher differs: existing ${existingLines} lines, generated ${newLines} lines`);
			xLog.status('[traversalGenerator] Run -generateTraversal --apply to update (backs up current via filestash)');
		}
	} else if (apply) {
		try {
			const { execSync } = require('child_process');
			execSync(`filestash "${traversalPath}"`, { encoding: 'utf8' });
			xLog.status(`[traversalGenerator] Backed up existing traversal.cypher via filestash`);
		} catch (err) {
			xLog.error(`[traversalGenerator] filestash backup failed: ${err.message}`);
			xLog.error('[traversalGenerator] Aborting --apply to protect existing file');
			return cypher;
		}
		fs.writeFileSync(traversalPath, cypher);
		xLog.status(`[traversalGenerator] Updated ${traversalPath}`);
	} else {
		const existing = fs.readFileSync(traversalPath, 'utf8');
		if (existing !== cypher) {
			xLog.status('[traversalGenerator] Generated file differs from traversal.cypher.');
			xLog.status('[traversalGenerator] Run -generateTraversal --apply to update (backs up current via filestash).');
			xLog.status('[traversalGenerator] Run -generateTraversal --preview to see diff.');
		} else {
			xLog.status('[traversalGenerator] traversal.cypher is already up-to-date');
		}
	}

	return cypher;
};

// Identify primary vector-indexed types for traversal generation
// For each vector index, pick the ONE type with the richest cross-type connectivity
// (most distinct relationship types involving other node types)
const identifyPrimaryVectorTypes = (schema) => {
	const result = [];

	for (const vecIdx of schema.vectorIndexes) {
		if (vecIdx.embeddedTypes && vecIdx.embeddedTypes.length > 1) {
			// Multiple embedded types — pick the one with most relationship diversity
			let best = null;
			let bestScore = -1;

			for (const et of vecIdx.embeddedTypes) {
				const rels = schema.relationships.filter(r =>
					(r.from === et.label || r.to === et.label) &&
					r.type !== 'PART_OF'
				);
				const distinctRelTypes = new Set(rels.map(r => r.type)).size;
				if (distinctRelTypes > bestScore) {
					bestScore = distinctRelTypes;
					best = et.label;
				}
			}
			if (best) result.push(best);
		} else {
			result.push(vecIdx.primaryNodeLabel || vecIdx.nodeLabel);
		}
	}

	return [...new Set(result)];
};

const buildCypherQuery = (schema, vectorNodeLabels) => {
	const lines = [];
	const returnFields = ['node', 'combinedScore', 'vecScore', 'ftScore', 'labels(node) AS nodeLabels'];

	// Header
	lines.push('// traversal.cypher — DataModelExplorer');
	lines.push(`// Vector-indexed: ${vectorNodeLabels.map(l => {
		const idx = schema.vectorIndexes.find(v => v.nodeLabel === l || resolveUmbrella(v.nodeLabel, schema) === l);
		return `${l} (${idx ? idx.name : '?'})`;
	}).join(', ')}`);
	lines.push(`// BM25: ${schema.fulltextIndexes.map(f => f.name).join(', ')}`);
	lines.push(`// Generated: ${new Date().toISOString().split('T')[0]}`);
	lines.push('// Parameters: $embedding (list<float>), $limit (int), $query (string)');
	lines.push('');

	// === Search preamble ===
	lines.push('// === Search preamble: hybrid across all indexes ===');
	lines.push('CALL {');

	const unionParts = [];
	for (const vecIdx of schema.vectorIndexes) {
		unionParts.push(`  CALL db.index.vector.queryNodes('${vecIdx.name}', $limit, $embedding) YIELD node, score\n  RETURN node, score AS vecScore, 0.0 AS ftScore`);
	}
	for (const ftIdx of schema.fulltextIndexes) {
		unionParts.push(`  CALL db.index.fulltext.queryNodes('${ftIdx.name}', $query) YIELD node, score\n  RETURN node, 0.0 AS vecScore, score AS ftScore`);
	}
	lines.push(unionParts.join('\n  UNION ALL\n'));
	lines.push('}');
	lines.push('');

	// === Dedup and rank ===
	lines.push('// === Dedup and rank ===');
	lines.push('WITH node, max(vecScore) AS vecScore, max(ftScore) AS ftScore');
	lines.push('WITH node, vecScore, ftScore,');
	lines.push('     (CASE WHEN ftScore > 0 THEN 0.5 ELSE 0 END) +');
	lines.push('     (CASE WHEN vecScore > 0 THEN vecScore * 0.5 ELSE 0 END) AS combinedScore');
	lines.push('ORDER BY combinedScore DESC LIMIT $limit');
	lines.push('');

	// === Traversal ===
	lines.push('// === Traversal: label-filtered OPTIONAL MATCHes ===');

	for (const nodeLabel of vectorNodeLabels) {
		lines.push('');
		lines.push(`// ${nodeLabel} context (only fires when node is ${nodeLabel})`);

		// Get outbound relationships from this type
		const outbound = schema.relationships.filter(r =>
			r.from === nodeLabel &&
			!UMBRELLA_LABELS.includes(r.to) &&
			r.to !== 'CedsOntology' // Skip ontology self-refs
		);

		// Get inbound relationships to this type
		const inbound = schema.relationships.filter(r =>
			r.to === nodeLabel &&
			!UMBRELLA_LABELS.includes(r.from) &&
			r.from !== 'CedsOntology' &&
			// Skip if this is a cross-bridge (handled separately below)
			!vectorNodeLabels.includes(r.from)
		);

		// Process outbound (node -> target)
		for (const rel of outbound) {
			// Skip cross-type bridges (handled separately)
			if (vectorNodeLabels.includes(rel.to)) continue;

			const varSuffix = lcFirst(rel.to);

			if (rel.avgCardinality <= HIGH_CARDINALITY_THRESHOLD) {
				lines.push(`OPTIONAL MATCH (node:${nodeLabel})-[:${rel.type}]->(${varSuffix}:${rel.to})`);
				returnFields.push(varSuffix);
			} else {
				const collectVar = lcFirst(`${nodeLabel}${rel.type.replace(/_/g, '')}${rel.to}List`);
				lines.push('CALL {');
				lines.push('  WITH node');
				lines.push(`  OPTIONAL MATCH (node:${nodeLabel})-[:${rel.type}]->(t:${rel.to})`);
				lines.push(`  RETURN collect(DISTINCT t { .* })[..10] AS ${collectVar}`);
				lines.push('}');
				returnFields.push(collectVar);
			}
		}

		// Process inbound (source -> node)
		for (const rel of inbound) {
			const varSuffix = lcFirst(`${rel.from}Via${rel.type.replace(/_/g, '')}`);

			if (rel.avgCardinality <= HIGH_CARDINALITY_THRESHOLD) {
				lines.push(`OPTIONAL MATCH (${varSuffix}:${rel.from})-[:${rel.type}]->(node:${nodeLabel})`);
				returnFields.push(varSuffix);
			} else {
				const collectVar = lcFirst(`${rel.from}${rel.type.replace(/_/g, '')}List`);
				lines.push('CALL {');
				lines.push('  WITH node');
				lines.push(`  OPTIONAL MATCH (s:${rel.from})-[:${rel.type}]->(node:${nodeLabel})`);
				lines.push(`  RETURN collect(DISTINCT s { .* })[..10] AS ${collectVar}`);
				lines.push('}');
				returnFields.push(collectVar);
			}
		}
	}

	// === Cross-standard bridges ===
	// Only actual cross-standard relationships (MAPS_TO, ALIGNS_WITH, STRUCTURALLY_MAPS_TO)
	const BRIDGE_TYPES = ['MAPS_TO', 'ALIGNS_WITH', 'STRUCTURALLY_MAPS_TO'];
	const crossBridges = schema.relationships.filter(r =>
		BRIDGE_TYPES.includes(r.type) &&
		(vectorNodeLabels.includes(r.from) || vectorNodeLabels.includes(r.to))
	);

	if (crossBridges.length > 0) {
		lines.push('');
		lines.push('// Cross-standard bridge traversals');

		for (const bridge of crossBridges) {
			// Forward: node as source
			const fwdVar = lcFirst(`${bridge.from}MapsTo${bridge.to}`);
			const fwdProps = getKeyProps(bridge.to, schema, 't');
			lines.push('CALL {');
			lines.push('  WITH node');
			lines.push(`  OPTIONAL MATCH (node:${bridge.from})-[m:${bridge.type}]->(t:${bridge.to})`);
			lines.push(`  RETURN collect({ ${fwdProps}, confidence: m.confidence, source: m.source })[..5] AS ${fwdVar}`);
			lines.push('}');
			returnFields.push(fwdVar);

			// Reverse: node as target
			const revVar = lcFirst(`${bridge.to}MappedFrom${bridge.from}`);
			lines.push('CALL {');
			lines.push('  WITH node');
			lines.push(`  OPTIONAL MATCH (s:${bridge.from})-[m:${bridge.type}]->(node:${bridge.to})`);

			// Special case: SifField->CedsProperty — include parent SifObject
			if (bridge.from === 'SifField') {
				lines.push('  OPTIONAL MATCH (obj:SifObject)-[:HAS_FIELD]->(s)');
				lines.push(`  RETURN collect({ object: obj.name, field: s.name, confidence: m.confidence })[..5] AS ${revVar}`);
			} else {
				const revProps = getKeyProps(bridge.from, schema, 's');
				lines.push(`  RETURN collect({ ${revProps}, confidence: m.confidence })[..5] AS ${revVar}`);
			}
			lines.push('}');
			returnFields.push(revVar);
		}
	}

	// === SIF reference network ===
	if (vectorNodeLabels.includes('SifField')) {
		lines.push('');
		lines.push('// SIF reference network');
		lines.push('CALL {');
		lines.push('  WITH node');
		lines.push('  OPTIONAL MATCH (sifObj:SifObject)-[:HAS_FIELD]->(node:SifField)');
		lines.push('  OPTIONAL MATCH (referrer:SifObject)-[:REFERENCES]->(sifObj)');
		lines.push('  RETURN collect(DISTINCT referrer.name)[..10] AS sifReferencedBy');
		lines.push('}');
		returnFields.push('sifReferencedBy');

		lines.push('CALL {');
		lines.push('  WITH node');
		lines.push('  OPTIONAL MATCH (sifObj:SifObject)-[:HAS_FIELD]->(node:SifField)');
		lines.push('  OPTIONAL MATCH (sifObj)-[:REFERENCES]->(referenced:SifObject)');
		lines.push('  RETURN collect(DISTINCT referenced.name)[..10] AS sifReferencesTo');
		lines.push('}');
		returnFields.push('sifReferencesTo');
	}

	// === CEDS class context ===
	if (vectorNodeLabels.includes('CedsProperty')) {
		lines.push('');
		lines.push('// CEDS class context');
		lines.push('CALL {');
		lines.push('  WITH node');
		lines.push('  OPTIONAL MATCH (cedsClass:CedsClass)-[:HAS_PROPERTY]->(node:CedsProperty)');
		lines.push('  RETURN collect(DISTINCT cedsClass.label) AS cedsClasses');
		lines.push('}');
		returnFields.push('cedsClasses');

		lines.push('CALL {');
		lines.push('  WITH node');
		lines.push('  OPTIONAL MATCH (node:CedsProperty)-[:HAS_OPTION_SET]->(os:CedsOptionSet)');
		lines.push('  RETURN collect(DISTINCT os.label) AS cedsOptionSets');
		lines.push('}');
		returnFields.push('cedsOptionSets');
	}

	// === RETURN ===
	lines.push('');
	lines.push('// === Return ===');
	const uniqueFields = [...new Set(returnFields)];
	lines.push(`RETURN\n  ${uniqueFields.join(',\n  ')}`);
	lines.push('');

	return lines.join('\n');
};

// Get key property accessors for return maps
const getKeyProps = (label, schema, varName) => {
	const nodeType = schema.nodeTypes.find(n => n.label === label);
	if (!nodeType) return `name: ${varName}.name`;

	const props = nodeType.properties;
	const keyProps = [];

	if (props.includes('cedsId')) keyProps.push(`cedsId: ${varName}.cedsId`);
	if (props.includes('label') && label.startsWith('Ceds')) keyProps.push(`label: ${varName}.label`);
	if (props.includes('name') && !label.startsWith('Ceds')) keyProps.push(`name: ${varName}.name`);
	if (props.includes('xpath')) keyProps.push(`xpath: ${varName}.xpath`);

	return keyProps.length > 0 ? keyProps.join(', ') : `name: ${varName}.name`;
};

// Resolve umbrella label to specific
const resolveUmbrella = (label, schema) => {
	if (!UMBRELLA_LABELS.includes(label)) return label;
	const candidates = schema.nodeTypes
		.filter(nt => nt.properties.includes('embedding') && !UMBRELLA_LABELS.includes(nt.label))
		.sort((a, b) => b.count - a.count);
	return candidates.length > 0 ? candidates[0].label : label;
};

// Lowercase first character
const lcFirst = (str) => str.charAt(0).toLowerCase() + str.slice(1);

module.exports = { generateTraversal };
