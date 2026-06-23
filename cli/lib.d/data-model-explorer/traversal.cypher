// traversal.cypher — DataModelExplorer (forge golden contract)
// Vector: golden_vector (single unified index on :ForgedNode(embedding), COSINE, 1024-dim)
// No fulltext index exists in the forge golden graph.
// Node model: :ForgedNode distinguished by role (DmeClass, DmeProperty, DmeOptionSet,
//   DmeOptionValue, DmeSupport, DmeStandardRoot) and _source (CEDS/LIF/SIF/…).
// Cross-standard mapping edges: SPECIFIED_MAPPING (authoritative), IMPLIED_MAPPING (inferred).
// Structural edges: HAS_PROPERTY, HAS_OPTION_SET, HAS_VALUE, HAS_SUPPORT, HAS_CLASS,
//   SUBCLASS_OF, REFERENCES.
// Updated: 2026-06-23 (forge-contract refactor)
// Parameters: $embedding (list<float>), $limit (int), $query (string)

// === Search preamble: single unified vector query over golden_vector ===
CALL db.index.vector.queryNodes('golden_vector', $limit, $embedding) YIELD node, score
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

// Cross-standard mapping edges (outgoing) — SPECIFIED_MAPPING + IMPLIED_MAPPING
CALL {
  WITH node
  OPTIONAL MATCH (node)-[m:SPECIFIED_MAPPING|IMPLIED_MAPPING]->(t:ForgedNode)
  RETURN collect({
    toSource: t._source, toName: t.name, toId: t._id,
    mappingType: type(m), confidence: m.confidence,
    provenanceTier: m.provenanceTier, matchPredicate: m.matchPredicate
  })[..20] AS mappingsOutgoing
}

// Cross-standard mapping edges (incoming) — SPECIFIED_MAPPING + IMPLIED_MAPPING
CALL {
  WITH node
  OPTIONAL MATCH (s:ForgedNode)-[m:SPECIFIED_MAPPING|IMPLIED_MAPPING]->(node)
  RETURN collect({
    fromSource: s._source, fromName: s.name, fromId: s._id,
    mappingType: type(m), confidence: m.confidence,
    provenanceTier: m.provenanceTier, matchPredicate: m.matchPredicate
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
  mappingsIncoming
