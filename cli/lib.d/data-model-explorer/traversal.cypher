// traversal.cypher — DataModelExplorer (forge pure-graph contract)
// Vector: single unified index on :ForgedNode(embedding), COSINE, 1024-dim. The
//   builder names it <graphName>_vector, so the name is DISCOVERED at runtime by
//   the caller and passed in as $indexName — never hardcoded here.
// No fulltext index exists in the forge graph.
// Node model: :ForgedNode distinguished by role (DmeClass, DmeProperty, DmeOptionSet,
//   DmeOptionValue, DmeSupport, DmeStandardRoot) and _source (CEDS/EdFi/LIF/…).
// Cross-standard mapping: elements resolve to CEDS tuples (:HubReference) through four
//   match edges, one per SKOS relation (EXACT/CLOSE/BROAD/NARROW_MATCH). Every one is a
//   judgment carrying mappingConfidence/mappingKind/mappingSource; none is authored fact.
//   mappingKind 'invalid-debug' marks a debug judge's edge (match edges carry no provenanceTier).
//   Two elements sharing a hub are 'equivalent' ONLY when both hops are EXACT_MATCH; an
//   EXACT/CLOSE pair with a CLOSE hop is a candidateEquivalent; any BROAD/NARROW hop makes
//   the pair 'related', never equivalent. EXACT/CLOSE entries sort ahead of BROAD/NARROW
//   so the list caps never drop them. SPECIFIED_MAPPING/IMPLIED_MAPPING are retired.
// Structural edges: HAS_PROPERTY, HAS_OPTION_SET, HAS_VALUE, HAS_SUPPORT, HAS_CLASS,
//   SUBCLASS_OF, REFERENCES; SIF/PESC add HAS_INSTANCE, HAS_FIELD, HAS_CHILD (see instanceView).
// Updated: 2026-10-04 (four SKOS relations + judgment fields; was 2026-07-01 equivalence-model rewrite)
// Parameters: $embedding (list<float>), $limit (int), $query (string), $indexName (string)

// === Search preamble: single unified vector query over the discovered index ===
CALL db.index.vector.queryNodes($indexName, $limit, $embedding) YIELD node, score
WITH node, score AS vecScore, 0.0 AS ftScore

// === Rank ===
WITH node, vecScore, ftScore,
     (CASE WHEN ftScore > 0 THEN 0.5 ELSE 0 END) +
     (CASE WHEN vecScore > 0 THEN vecScore * 0.5 ELSE 0 END) AS combinedScore
ORDER BY combinedScore DESC LIMIT $limit

// === Traversal: forge-contract structural neighborhood ===

// Parent classes that own this property (role-filtered)
CALL {
  WITH node
  OPTIONAL MATCH (c:ForgedNode {role: 'DmeClass'})-[:HAS_PROPERTY]->(node:ForgedNode {role: 'DmeProperty'})
  RETURN collect(DISTINCT c { ._id, ._source, .name, .path })[..10] AS parentClasses
}

// Option set attached to this property
CALL {
  WITH node
  OPTIONAL MATCH (node:ForgedNode {role: 'DmeProperty'})-[:HAS_OPTION_SET]->(os:ForgedNode {role: 'DmeOptionSet'})
  RETURN collect(DISTINCT os { ._id, ._source, .name })[..10] AS optionSets
}

// Allowed values when this node is an option set (DmeOptionValue.value text is in name)
CALL {
  WITH node
  OPTIONAL MATCH (node:ForgedNode {role: 'DmeOptionSet'})-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})
  RETURN collect(DISTINCT v { ._id, .name, .description })[..50] AS optionValues
}

// Supports attached to this node
CALL {
  WITH node
  OPTIONAL MATCH (node)-[:HAS_SUPPORT]->(sup:ForgedNode {role: 'DmeSupport'})
  RETURN collect(DISTINCT sup { ._id, ._source, .name, .description })[..10] AS supports
}

// Subclass / superclass relationships
CALL {
  WITH node
  OPTIONAL MATCH (node)-[:SUBCLASS_OF]->(parent:ForgedNode)
  RETURN collect(DISTINCT parent { ._id, ._source, .name })[..10] AS superClasses
}
CALL {
  WITH node
  OPTIONAL MATCH (child:ForgedNode)-[:SUBCLASS_OF]->(node)
  RETURN collect(DISTINCT child { ._id, ._source, .name })[..10] AS subClasses
}

// Classes owned by this standard root / properties owned by a class
CALL {
  WITH node
  OPTIONAL MATCH (node)-[:HAS_CLASS]->(cls:ForgedNode {role: 'DmeClass'})
  RETURN collect(DISTINCT cls { ._id, ._source, .name })[..20] AS ownedClasses
}

// Intra-standard cross references
CALL {
  WITH node
  OPTIONAL MATCH (node)-[:REFERENCES]->(ref:ForgedNode)
  RETURN collect(DISTINCT ref { ._id, ._source, .name, .role })[..10] AS referencesTo
}
CALL {
  WITH node
  OPTIONAL MATCH (referrer:ForgedNode)-[:REFERENCES]->(node)
  RETURN collect(DISTINCT referrer { ._id, ._source, .name, .role })[..10] AS referencedBy
}

// CEDS anchors (outgoing) — this element's resolution to CEDS tuples (:HubReference),
// each a judgment (relation + mappingConfidence + mappingSource).
CALL {
  WITH node
  OPTIONAL MATCH (node)-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub:HubReference)
  WITH m, hub ORDER BY CASE WHEN type(m) IN ['EXACT_MATCH', 'CLOSE_MATCH'] THEN 0 ELSE 1 END
  RETURN collect({
    toSource: 'CEDS', toName: hub.name, toId: hub.canonicalKey,
    mappingType: type(m), confidence: m.confidence,
    matchPredicate: m.predicate,
    mappingConfidence: m.mappingConfidence, mappingKind: m.mappingKind, mappingSource: m.mappingSource
  })[..20] AS mappingsOutgoing
}

// Cross-standard pairs (shared hub) — other standards' elements resolving to the SAME
// CEDS tuple. equivalence = 'equivalent' ONLY for EXACT×EXACT (two judgments); an
// EXACT/CLOSE pair with a CLOSE hop = 'candidateEquivalent'; any BROAD/NARROW hop =
// 'related' (never equivalent). Both hops' evidence is carried — never a combined score.
CALL {
  WITH node
  OPTIONAL MATCH (node)-[mNear:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub:HubReference)<-[mFar:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(other:ForgedNode)
  WHERE other <> node
  WITH mNear, hub, mFar, other
  ORDER BY CASE WHEN type(mNear) IN ['EXACT_MATCH', 'CLOSE_MATCH'] AND type(mFar) IN ['EXACT_MATCH', 'CLOSE_MATCH'] THEN 0 ELSE 1 END
  RETURN collect({
    otherSource: other._source, otherName: other.name, otherId: other._id,
    hubName: hub.name, hubKey: hub.canonicalKey,
    equivalence: CASE WHEN type(mNear) = 'EXACT_MATCH' AND type(mFar) = 'EXACT_MATCH' THEN 'equivalent'
                      WHEN type(mNear) IN ['BROAD_MATCH', 'NARROW_MATCH'] OR type(mFar) IN ['BROAD_MATCH', 'NARROW_MATCH'] THEN 'related'
                      ELSE 'candidateEquivalent' END,
    nearMatchType: type(mNear), nearConfidence: mNear.confidence, nearPredicate: mNear.predicate,
    farMatchType: type(mFar), farConfidence: mFar.confidence, farPredicate: mFar.predicate,
    nearMappingConfidence: mNear.mappingConfidence, nearMappingKind: mNear.mappingKind, nearMappingSource: mNear.mappingSource,
    farMappingConfidence: mFar.mappingConfidence, farMappingKind: mFar.mappingKind, farMappingSource: mFar.mappingSource
  })[..20] AS crossStandardEquivalents
}

// Source elements resolving here (incoming) — when this node is a CEDS leaf, the
// standards' elements whose tuple contains it.
CALL {
  WITH node
  OPTIONAL MATCH (node)<-[:HAS_CEDS_DOMAIN|HAS_CEDS_PROPERTY|HAS_CEDS_RANGE|HAS_CEDS_VALUE|HAS_CEDS_QUALIFIER]-(hub:HubReference)<-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(src:ForgedNode)
  WITH hub, m, src ORDER BY CASE WHEN type(m) IN ['EXACT_MATCH', 'CLOSE_MATCH'] THEN 0 ELSE 1 END
  RETURN collect({
    fromSource: src._source, fromName: src.name, fromId: src._id,
    hubName: hub.name, hubKey: hub.canonicalKey,
    mappingType: type(m), confidence: m.confidence,
    matchPredicate: m.predicate,
    mappingConfidence: m.mappingConfidence, mappingKind: m.mappingKind, mappingSource: m.mappingSource
  })[..20] AS mappingsIncoming
}

// Instance view (lane D, 2026-10-01) — SIF and PESC put their CEDS mappings on INSTANCE nodes:
// SIF Question -[:HAS_INSTANCE]-> Field (one per object), PESC element -[:HAS_INSTANCE]-> occurrence
// (one per document position). The vector hit is the declaration, which carries no mapping edge,
// so its mappings are read through its instances and grouped by where each instance sits: the
// owning SIF Object (HAS_FIELD), else the PESC occurrence's sectionPath. SIF structure rides along:
// HAS_FIELD (object owns field) and HAS_CHILD (element contains element). instanceView is null
// when the node has none of these, and the caller omits a null instanceView, so CEDS and Ed-Fi
// results carry no new key.
CALL {
  WITH node
  OPTIONAL MATCH (node)-[:HAS_INSTANCE]->(inst:ForgedNode)
  WITH node, inst,
       coalesce(head([(groupObject:ForgedNode)-[:HAS_FIELD]->(inst) | groupObject.name]), inst.sectionPath) AS instGroupName
  WITH node, instGroupName, count(inst) AS groupInstanceCount, collect(inst.path)[..3] AS groupPathSampleList
  WHERE groupInstanceCount > 0
  RETURN collect({ group: instGroupName, instanceCount: groupInstanceCount, pathSampleList: groupPathSampleList })[..30] AS instancesByGroup,
         sum(groupInstanceCount) AS instanceTotal
}
CALL {
  WITH node
  OPTIONAL MATCH (node)-[:HAS_INSTANCE]->(inst:ForgedNode)-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub:HubReference)
  WITH hub, type(m) AS matchType, m.confidence AS confidence, m.predicate AS matchPredicate,
       m.mappingConfidence AS mappingConfidence, m.mappingKind AS mappingKind, m.mappingSource AS mappingSource,
       coalesce(head([(groupObject:ForgedNode)-[:HAS_FIELD]->(inst) | groupObject.name]), inst.sectionPath) AS instGroupName,
       inst
  WITH hub, matchType, confidence, matchPredicate,
       mappingConfidence, mappingKind, mappingSource,
       collect(DISTINCT instGroupName) AS instanceGroupList, count(inst) AS instanceCount
  WHERE hub IS NOT NULL
  WITH hub, matchType, confidence, matchPredicate,
       mappingConfidence, mappingKind, mappingSource, instanceGroupList, instanceCount
  ORDER BY CASE WHEN matchType IN ['EXACT_MATCH', 'CLOSE_MATCH'] THEN 0 ELSE 1 END
  RETURN collect({
    toSource: 'CEDS', toName: hub.name, toId: hub.canonicalKey,
    mappingType: matchType, confidence: confidence, matchPredicate: matchPredicate,
    mappingConfidence: mappingConfidence, mappingKind: mappingKind, mappingSource: mappingSource,
    instanceGroupList: instanceGroupList[..25], instanceGroupCount: size(instanceGroupList), instanceCount: instanceCount
  })[..20] AS mappingsViaInstances
}
CALL {
  WITH node
  OPTIONAL MATCH (declaration:ForgedNode)-[:HAS_INSTANCE]->(node)
  RETURN head(collect(declaration { ._id, ._source, .name, .role })) AS instanceOf
}
CALL {
  WITH node
  OPTIONAL MATCH (node)-[:HAS_FIELD]->(ownedField:ForgedNode)
  RETURN collect(ownedField { ._id, .name, .path })[..20] AS ownedFields, count(ownedField) AS ownedFieldCount
}
CALL {
  WITH node
  OPTIONAL MATCH (owningObject:ForgedNode)-[:HAS_FIELD]->(node)
  RETURN collect(owningObject { ._id, ._source, .name })[..10] AS owningObjects
}
CALL {
  WITH node
  OPTIONAL MATCH (structuralParent:ForgedNode)-[:HAS_CHILD]->(node)
  RETURN collect(structuralParent { ._id, .name, .path, .role })[..10] AS structuralParents
}
CALL {
  WITH node
  OPTIONAL MATCH (node)-[:HAS_CHILD]->(structuralChild:ForgedNode)
  RETURN collect(structuralChild { ._id, .name, .path, .role })[..20] AS structuralChildren, count(structuralChild) AS structuralChildCount
}
WITH *,
     CASE WHEN instanceTotal = 0 AND instanceOf IS NULL AND ownedFieldCount = 0
               AND size(owningObjects) = 0 AND size(structuralParents) = 0 AND structuralChildCount = 0
          THEN null
          ELSE {
            instanceOf: instanceOf, instanceTotal: instanceTotal, instancesByGroup: instancesByGroup,
            mappingsViaInstances: mappingsViaInstances,
            ownedFieldCount: ownedFieldCount, ownedFields: ownedFields, owningObjects: owningObjects,
            structuralParents: structuralParents,
            structuralChildCount: structuralChildCount, structuralChildren: structuralChildren
          }
     END AS instanceView

// === Return ===
RETURN
  node,
  combinedScore,
  vecScore,
  ftScore,
  labels(node) AS nodeLabels,
  node.role AS role,
  node._source AS source,
  parentClasses,
  optionSets,
  optionValues,
  supports,
  superClasses,
  subClasses,
  ownedClasses,
  referencesTo,
  referencedBy,
  mappingsOutgoing,
  crossStandardEquivalents,
  mappingsIncoming,
  instanceView
