// traversal.cypher — DataModelExplorer
// Vector-indexed: CedsProperty (?), SifField (sif_field_vector)
// BM25: dme_ceds_fulltext, dme_sif_fulltext
// Generated: 2026-03-24
// Parameters: $embedding (list<float>), $limit (int), $query (string)

// === Search preamble: hybrid across all indexes ===
CALL {
  CALL db.index.vector.queryNodes('ceds14_vector', $limit, $embedding) YIELD node, score
  RETURN node, score AS vecScore, 0.0 AS ftScore
  UNION ALL
  CALL db.index.vector.queryNodes('sif_field_vector', $limit, $embedding) YIELD node, score
  RETURN node, score AS vecScore, 0.0 AS ftScore
  UNION ALL
  CALL db.index.fulltext.queryNodes('dme_ceds_fulltext', $query) YIELD node, score
  RETURN node, 0.0 AS vecScore, score AS ftScore
  UNION ALL
  CALL db.index.fulltext.queryNodes('dme_sif_fulltext', $query) YIELD node, score
  RETURN node, 0.0 AS vecScore, score AS ftScore
}

// === Dedup and rank ===
WITH node, max(vecScore) AS vecScore, max(ftScore) AS ftScore
WITH node, vecScore, ftScore,
     (CASE WHEN ftScore > 0 THEN 0.5 ELSE 0 END) +
     (CASE WHEN vecScore > 0 THEN vecScore * 0.5 ELSE 0 END) AS combinedScore
ORDER BY combinedScore DESC LIMIT $limit

// === Traversal: label-filtered OPTIONAL MATCHes ===

// CedsProperty context (only fires when node is CedsProperty)
OPTIONAL MATCH (node:CedsProperty)-[:HAS_OPTION_SET]->(cedsOptionSet:CedsOptionSet)
CALL {
  WITH node
  OPTIONAL MATCH (s:CedsClass)-[:HAS_PROPERTY]->(node:CedsProperty)
  RETURN collect(DISTINCT s { .* })[..10] AS cedsClassHASPROPERTYList
}

// SifField context (only fires when node is SifField)
OPTIONAL MATCH (node:SifField)-[:MEMBER_OF]->(sifComplexType:SifComplexType)
OPTIONAL MATCH (node:SifField)-[:HAS_TYPE]->(sifPrimitiveType:SifPrimitiveType)
OPTIONAL MATCH (node:SifField)-[:HAS_TYPE]->(sifSimpleType:SifSimpleType)
OPTIONAL MATCH (node:SifField)-[:CONSTRAINED_BY]->(sifCodeset:SifCodeset)
CALL {
  WITH node
  OPTIONAL MATCH (s:SifObject)-[:HAS_FIELD]->(node:SifField)
  RETURN collect(DISTINCT s { .* })[..10] AS sifObjectHASFIELDList
}
CALL {
  WITH node
  OPTIONAL MATCH (s:SifXmlElement)-[:REALIZED_BY]->(node:SifField)
  RETURN collect(DISTINCT s { .* })[..10] AS sifXmlElementREALIZEDBYList
}

// Cross-standard bridge traversals
CALL {
  WITH node
  OPTIONAL MATCH (node:SifField)-[m:MAPS_TO]->(t:CedsProperty)
  RETURN collect({ cedsId: t.cedsId, label: t.label, confidence: m.confidence, source: m.source })[..5] AS sifFieldMapsToCedsProperty
}
CALL {
  WITH node
  OPTIONAL MATCH (s:SifField)-[m:MAPS_TO]->(node:CedsProperty)
  OPTIONAL MATCH (obj:SifObject)-[:HAS_FIELD]->(s)
  RETURN collect({ object: obj.name, field: s.name, confidence: m.confidence })[..5] AS cedsPropertyMappedFromSifField
}

// SIF reference network
CALL {
  WITH node
  OPTIONAL MATCH (sifObj:SifObject)-[:HAS_FIELD]->(node:SifField)
  OPTIONAL MATCH (referrer:SifObject)-[:REFERENCES]->(sifObj)
  RETURN collect(DISTINCT referrer.name)[..10] AS sifReferencedBy
}
CALL {
  WITH node
  OPTIONAL MATCH (sifObj:SifObject)-[:HAS_FIELD]->(node:SifField)
  OPTIONAL MATCH (sifObj)-[:REFERENCES]->(referenced:SifObject)
  RETURN collect(DISTINCT referenced.name)[..10] AS sifReferencesTo
}

// CEDS class context
CALL {
  WITH node
  OPTIONAL MATCH (cedsClass:CedsClass)-[:HAS_PROPERTY]->(node:CedsProperty)
  RETURN collect(DISTINCT cedsClass.label) AS cedsClasses
}
CALL {
  WITH node
  OPTIONAL MATCH (node:CedsProperty)-[:HAS_OPTION_SET]->(os:CedsOptionSet)
  RETURN collect(DISTINCT os.label) AS cedsOptionSets
}

// === Return ===
RETURN
  node,
  combinedScore,
  vecScore,
  ftScore,
  labels(node) AS nodeLabels,
  cedsOptionSet,
  cedsClassHASPROPERTYList,
  sifComplexType,
  sifPrimitiveType,
  sifSimpleType,
  sifCodeset,
  sifObjectHASFIELDList,
  sifXmlElementREALIZEDBYList,
  sifFieldMapsToCedsProperty,
  cedsPropertyMappedFromSifField,
  sifReferencedBy,
  sifReferencesTo,
  cedsClasses,
  cedsOptionSets
