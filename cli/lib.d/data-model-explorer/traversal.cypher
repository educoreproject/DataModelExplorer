// traversal.cypher — DataModelExplorer (5 standards)
// Vector: ceds_vector, sif_vector, edfi_vector, jedx_vector, edmatrix_vector
// BM25: ceds_fulltext, sif_fulltext, edfi_fulltext, jedx_fulltext, edmatrix_fulltext
// Updated: 2026-04-01
// Parameters: $embedding (list<float>), $limit (int), $query (string)

// === Search preamble: hybrid across all indexes ===
CALL {
  CALL db.index.vector.queryNodes('ceds_vector', $limit, $embedding) YIELD node, score
  RETURN node, score AS vecScore, 0.0 AS ftScore
  UNION ALL
  CALL db.index.vector.queryNodes('sif_vector', $limit, $embedding) YIELD node, score
  RETURN node, score AS vecScore, 0.0 AS ftScore
  UNION ALL
  CALL db.index.vector.queryNodes('edfi_vector', $limit, $embedding) YIELD node, score
  RETURN node, score AS vecScore, 0.0 AS ftScore
  UNION ALL
  CALL db.index.vector.queryNodes('jedx_vector', $limit, $embedding) YIELD node, score
  RETURN node, score AS vecScore, 0.0 AS ftScore
  UNION ALL
  CALL db.index.vector.queryNodes('edmatrix_vector', $limit, $embedding) YIELD node, score
  RETURN node, score AS vecScore, 0.0 AS ftScore
  UNION ALL
  CALL db.index.fulltext.queryNodes('ceds_fulltext', $query) YIELD node, score
  RETURN node, 0.0 AS vecScore, score AS ftScore
  UNION ALL
  CALL db.index.fulltext.queryNodes('sif_fulltext', $query) YIELD node, score
  RETURN node, 0.0 AS vecScore, score AS ftScore
  UNION ALL
  CALL db.index.fulltext.queryNodes('edfi_fulltext', $query) YIELD node, score
  RETURN node, 0.0 AS vecScore, score AS ftScore
  UNION ALL
  CALL db.index.fulltext.queryNodes('jedx_fulltext', $query) YIELD node, score
  RETURN node, 0.0 AS vecScore, score AS ftScore
  UNION ALL
  CALL db.index.fulltext.queryNodes('edmatrix_fulltext', $query) YIELD node, score
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

// EdfiField context (only fires when node is EdfiField)
CALL {
  WITH node
  OPTIONAL MATCH (e:EdfiEntity)-[:HAS_FIELD]->(node:EdfiField)
  RETURN collect(DISTINCT e { .* })[..10] AS edfiEntityHASFIELDList
}
CALL {
  WITH node
  OPTIONAL MATCH (node:EdfiField)-[:CONSTRAINED_BY]->(d:EdfiDescriptor)
  RETURN collect(DISTINCT d { .name })[..10] AS edfiFieldConstrainedByDescriptor
}

// EdfiDescriptor context (only fires when node is EdfiDescriptor)
CALL {
  WITH node
  OPTIONAL MATCH (node:EdfiDescriptor)-[:HAS_VALUE]->(v:EdfiDescriptorValue)
  RETURN collect(DISTINCT v { .name, .description })[..20] AS edfiDescriptorValues
}

// JedxField context (only fires when node is JedxField)
CALL {
  WITH node
  OPTIONAL MATCH (je:JedxEntity)-[:HAS_FIELD]->(node:JedxField)
  RETURN collect(DISTINCT je { .* })[..10] AS jedxEntityHASFIELDList
}
CALL {
  WITH node
  OPTIONAL MATCH (node:JedxField)-[:CONSTRAINED_BY]->(jc:JedxCodeSet)
  RETURN collect(DISTINCT jc { .name })[..10] AS jedxFieldConstrainedByCodeSet
}

// EdMatrix EdStandard context (only fires when node is EdStandard)
CALL {
  WITH node
  OPTIONAL MATCH (node:EdStandard)-[:PUBLISHED_BY]->(org:Organization)
  RETURN collect(DISTINCT org { .name })[..5] AS edmatrixPublishedBy
}
CALL {
  WITH node
  OPTIONAL MATCH (node:EdStandard)-[:AT_LAYER]->(layer:SpecLayer)
  RETURN collect(DISTINCT layer { .name })[..5] AS edmatrixAtLayer
}
CALL {
  WITH node
  OPTIONAL MATCH (node:EdStandard)-[:IN_USE_CASE]->(uc:UseCaseCategory)
  RETURN collect(DISTINCT uc { .name })[..5] AS edmatrixInUseCase
}

// Cross-standard bridge traversals (SIF <-> CEDS)
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

// Cross-standard bridge traversals (EdFi <-> CEDS)
CALL {
  WITH node
  OPTIONAL MATCH (node:EdfiField)-[m:MAPS_TO]->(t:CedsProperty)
  RETURN collect({ cedsId: t.cedsId, label: t.label, confidence: m.confidence, source: m.source })[..5] AS edfiFieldMapsToCedsProperty
}
CALL {
  WITH node
  OPTIONAL MATCH (ef:EdfiField)-[m:MAPS_TO]->(node:CedsProperty)
  OPTIONAL MATCH (ee:EdfiEntity)-[:HAS_FIELD]->(ef)
  RETURN collect({ entity: ee.name, field: ef.name, confidence: m.confidence })[..5] AS cedsPropertyMappedFromEdfiField
}

// Cross-standard implied mapping traversals
CALL {
  WITH node
  OPTIONAL MATCH (node)-[im:IMPLIED_MAPPING]->(t:CedsProperty)
  RETURN collect({ cedsId: t.cedsId, label: t.label, score: im.score, method: im.method })[..5] AS impliedMappingsToCeds
}
CALL {
  WITH node
  OPTIONAL MATCH (s)-[im:IMPLIED_MAPPING]->(node:CedsProperty)
  RETURN collect({ source: s._source, name: s.name, score: im.score, method: im.method })[..5] AS impliedMappingsFromOtherStandards
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
  edfiEntityHASFIELDList,
  edfiFieldConstrainedByDescriptor,
  edfiDescriptorValues,
  jedxEntityHASFIELDList,
  jedxFieldConstrainedByCodeSet,
  edmatrixPublishedBy,
  edmatrixAtLayer,
  edmatrixInUseCase,
  sifFieldMapsToCedsProperty,
  cedsPropertyMappedFromSifField,
  edfiFieldMapsToCedsProperty,
  cedsPropertyMappedFromEdfiField,
  impliedMappingsToCeds,
  impliedMappingsFromOtherStandards,
  sifReferencedBy,
  sifReferencesTo,
  cedsClasses,
  cedsOptionSets
