// traversal.cypher — DataModelExplorer (forge pure-graph contract)
// Vector: single unified index on :ForgedNode(embedding), COSINE, 1024-dim. The
//   builder names it <graphName>_vector, so the name is DISCOVERED at runtime by
//   the caller and passed in as $indexName — never hardcoded here.
// No fulltext index exists in the forge graph.
// Node model: :ForgedNode distinguished by role (DmeClass, DmeProperty, DmeOptionSet,
//   DmeOptionValue, DmeSupport, DmeStandardRoot) and _source (CEDS/EdFi/LIF/…).
// Cross-standard equivalence: elements resolve to CEDS tuples (:HubReference) via
//   EXACT_MATCH (authored) / CLOSE_MATCH (inferred). Two elements sharing a hub are
//   equivalent ONLY when both hops are EXACT_MATCH; any CLOSE_MATCH hop makes the
//   pair a candidateEquivalent (conservativity). SPECIFIED_MAPPING/IMPLIED_MAPPING
//   are retired — zero such edges exist on the pure graph.
// Structural edges: HAS_PROPERTY, HAS_OPTION_SET, HAS_VALUE, HAS_SUPPORT, HAS_CLASS,
//   SUBCLASS_OF, REFERENCES.
// Updated: 2026-07-01 (equivalence-model rewrite + runtime index discovery)
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

// CEDS anchors (outgoing) — this element's resolution to CEDS tuples (:HubReference).
// EXACT_MATCH = authored, CLOSE_MATCH = inferred.
CALL {
  WITH node
  OPTIONAL MATCH (node)-[m:EXACT_MATCH|CLOSE_MATCH]->(hub:HubReference)
  RETURN collect({
    toSource: 'CEDS', toName: hub.name, toId: hub.canonicalKey,
    mappingType: type(m), confidence: m.confidence,
    provenanceTier: m.provenanceTier, matchPredicate: m.predicate
  })[..20] AS mappingsOutgoing
}

// Cross-standard equivalents (shared hub) — other standards' elements resolving to
// the SAME CEDS tuple. equivalence = 'equivalent' ONLY for EXACT×EXACT; any
// CLOSE_MATCH hop = 'candidateEquivalent' (a hypothesis, not an assertion). Both
// hops' evidence is carried — never a fabricated combined score.
CALL {
  WITH node
  OPTIONAL MATCH (node)-[mNear:EXACT_MATCH|CLOSE_MATCH]->(hub:HubReference)<-[mFar:EXACT_MATCH|CLOSE_MATCH]-(other:ForgedNode)
  WHERE other <> node
  RETURN collect({
    otherSource: other._source, otherName: other.name, otherId: other._id,
    hubName: hub.name, hubKey: hub.canonicalKey,
    equivalence: CASE WHEN type(mNear) = 'EXACT_MATCH' AND type(mFar) = 'EXACT_MATCH'
                      THEN 'equivalent' ELSE 'candidateEquivalent' END,
    nearMatchType: type(mNear), nearConfidence: mNear.confidence, nearPredicate: mNear.predicate,
    farMatchType: type(mFar), farConfidence: mFar.confidence, farPredicate: mFar.predicate
  })[..20] AS crossStandardEquivalents
}

// Source elements resolving here (incoming) — when this node is a CEDS leaf, the
// standards' elements whose tuple contains it.
CALL {
  WITH node
  OPTIONAL MATCH (node)<-[:HAS_CEDS_DOMAIN|HAS_CEDS_PROPERTY|HAS_CEDS_RANGE|HAS_CEDS_VALUE|HAS_CEDS_QUALIFIER]-(hub:HubReference)<-[m:EXACT_MATCH|CLOSE_MATCH]-(src:ForgedNode)
  RETURN collect({
    fromSource: src._source, fromName: src.name, fromId: src._id,
    hubName: hub.name, hubKey: hub.canonicalKey,
    mappingType: type(m), confidence: m.confidence,
    provenanceTier: m.provenanceTier, matchPredicate: m.predicate
  })[..20] AS mappingsIncoming
}

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
  mappingsIncoming
