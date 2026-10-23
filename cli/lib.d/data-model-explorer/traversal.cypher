// traversal.cypher — DataModelExplorer (forge pure-graph contract)
// Search: this file ranks nothing. The hits arrive as $hitList, ranked by lib/hybridRetrieval.js (lane BM25, 2026-10-10):
//   a keyword (BM25) leg over the <graphName>_fulltext index and/or a vector leg over <graphName>_vector, per searchMode,
//   fused by reciprocal rank. Each hit names its node by stableId and carries hitRank, fusedScore, foundByLegList and
//   both legs' ranks and scores, returned unchanged so every row says which leg found it.
// Node model: :ForgedNode distinguished by role (DmeClass, DmeProperty, DmeOptionSet,
//   DmeOptionValue, DmeSupport, DmeInstance, DmeStandardRoot, …) and _source (the live inventory: dme_list_standards).
// Cross-standard mapping: elements resolve to hub tuples (:HubReference cards; one hub or several, each a
//   :HubDefinition — every entry names its card's hub) through four
//   match edges, one per SKOS relation (EXACT/CLOSE/BROAD/NARROW_MATCH). Every one is a
//   judgment carrying mappingConfidence/mappingKind/mappingSource; none is authored fact.
//   mappingSource 'bridge-debug' marks a debug judge's edge (match edges carry no provenanceTier).
//   Two elements sharing a hub are 'equivalent' ONLY when both hops are EXACT_MATCH; an
//   EXACT/CLOSE pair with a CLOSE hop is a candidateEquivalent; any BROAD/NARROW hop makes
//   the pair 'related', never equivalent. Each mapping list is capped at 20 entries PER HUB (lane zbE, E2-2: each hub's
//   entries are allocated on their own and shown hub by hub, as findMappings does, so one hub never crowds out another;
//   every truncation entry names its hub), SHARED per relation within a hub: every relation present first gets up to 5
//   entries (best confidence first),
//   then the rest fill in relation order; <list>TruncatedByRelation names what was left out,
//   so no relation is ever silently dropped (ruling 2026-10-04). Fill entries are counted by a carried
//   rowRelation, never by `entry IN list`: map equality with null values is null, so IN never matches.
//   Within a relation, crossStandardEquivalents and mappingsIncoming share entries across STANDARDS first:
//   round-robin by standard (standards ordered by their best confidence, then name), then by confidence,
//   so one standard never crowds out the others (TQ, 2026-10-05: Birthdate showed no Ed-Fi entry);
//   <list>TruncatedByRelationAndStandard names what was left out per relation and standard. The other
//   two lists hold one standard's entries (the node's own), so there is nothing to share there.
//   SPECIFIED/IMPLIED_MAPPING retired.
// Structural edges: HAS_PROPERTY, HAS_OPTION_SET (in SIF from the Field, the instance), HAS_VALUE, HAS_SUPPORT,
//   HAS_CLASS, SUBCLASS_OF, REFERENCES / REFERENCES_TYPE / REFERENCES_OBJECT; SIF/PESC add HAS_INSTANCE, HAS_FIELD,
//   HAS_CHILD (see instanceView).
// Every confidence shown is the edge's mappingConfidence (the duplicate `confidence` property retires, W-B-2).
// Updated: 2026-10-21 ctdlHub P7 (several hubs: the incoming arm reads $hubIncomingSlotEdgeTypeList, every hub's slot edges;
//   each entry names its card's hub — toSource, or hubSource where hubName is the card's own name; pairs share ONE card,
//   so never cross hubs); 2026-10-10 lane BM25 (the search preamble became $hitList: keyword + vector legs fused upstream); 2026-10-06 campaign P3 (CONSTRAINED_BY retired, S3: SIF Field -> Codeset is HAS_OPTION_SET; mappingRationale carried, W-B-4); 2026-10-06 (no phantom entries: hub IS NOT NULL before every grouped collect, W-D-3; SIF code sets through
//   instances and the REFERENCES_* family, W-D-4; mappingConfidence read, W-B-2 step A); 2026-10-05 (per-standard sharing within a relation; 2026-10-04 four SKOS relations + judgment fields;
//   2026-07-01 equivalence-model rewrite)
// Parameters: $hitList (list of {stableId, hitRank, fusedScore, foundByLegList, keywordRank, keywordScore, vectorRank, vectorScore});
//   $hubIncomingSlotEdgeTypeList (every HAS_<HUB>_<SLOT> edge type of the graph's hubs, from the graph contract's slot lists)

// === Hits: the fused search result, one row per hit (lib/hybridRetrieval.js) ===
UNWIND $hitList AS hit
MATCH (node:ForgedNode {stableId: hit.stableId})
WITH node, hit

// === Traversal: forge-contract structural neighborhood ===

// Parent classes that own this property (role-filtered)
CALL {
  WITH node
  OPTIONAL MATCH (c:ForgedNode {role: 'DmeClass'})-[:HAS_PROPERTY]->(node:ForgedNode {role: 'DmeProperty'})
  RETURN collect(DISTINCT c { ._id, ._source, .name, .path })[..10] AS parentClasses
}

// Option set attached to this property — directly (HAS_OPTION_SET: CEDS, Ed-Fi, PESC) or through the property's
// instances (SIF: Question -[:HAS_INSTANCE]-> Field -[:HAS_OPTION_SET]-> Codeset; it was CONSTRAINED_BY until campaign P3, S3).
// SIF code sets are named since P3 (G18) from the elements that carry them; each entry also carries path and valueCount;
// optionSetCount is the total behind the capped list (W-D-4, S3).
CALL {
  WITH node
  OPTIONAL MATCH (node:ForgedNode {role: 'DmeProperty'})-[:HAS_OPTION_SET]->(os:ForgedNode {role: 'DmeOptionSet'})
  WITH node, collect(DISTINCT os { ._id, ._source, .name, .path, .valueCount, viaInstance: false }) AS directOptionSets
  OPTIONAL MATCH (node)-[:HAS_INSTANCE]->(:ForgedNode)-[:HAS_OPTION_SET]->(ios:ForgedNode {role: 'DmeOptionSet'})
  WITH directOptionSets, collect(DISTINCT ios { ._id, ._source, .name, .path, .valueCount, viaInstance: true }) AS instanceOptionSets
  RETURN (directOptionSets + instanceOptionSets)[..10] AS optionSets, size(directOptionSets + instanceOptionSets) AS optionSetCount
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
  OPTIONAL MATCH (node)-[r:REFERENCES|REFERENCES_TYPE|REFERENCES_OBJECT]->(ref:ForgedNode)
  RETURN collect(DISTINCT ref { ._id, ._source, .name, .role, referenceEdgeType: type(r) })[..10] AS referencesTo
}
CALL {
  WITH node
  OPTIONAL MATCH (referrer:ForgedNode)-[r:REFERENCES|REFERENCES_TYPE|REFERENCES_OBJECT]->(node)
  RETURN collect(DISTINCT referrer { ._id, ._source, .name, .role, referenceEdgeType: type(r) })[..10] AS referencedBy
}

// Hub anchors (outgoing) — this element's resolution to hub tuples (:HubReference cards),
// each a judgment (relation + mappingConfidence + mappingSource); toSource is the card's hub.
CALL {
  WITH node
  OPTIONAL MATCH (node)-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub:HubReference)
  WITH m, hub, type(m) AS rowRelation
  WHERE hub IS NOT NULL
  WITH m, hub, rowRelation, CASE rowRelation WHEN 'EXACT_MATCH' THEN 0 WHEN 'CLOSE_MATCH' THEN 1 WHEN 'BROAD_MATCH' THEN 2 WHEN 'NARROW_MATCH' THEN 3 ELSE 4 END AS relationOrder
  ORDER BY m.mappingConfidence DESC
  WITH hub.hubName AS rowHub, rowRelation, relationOrder, collect({
    toSource: hub.hubName, toName: hub.name, toId: hub.canonicalKey,
    mappingType: type(m), confidence: m.mappingConfidence,
    matchPredicate: m.predicate,
    mappingConfidence: m.mappingConfidence, mappingKind: m.mappingKind, mappingSource: m.mappingSource, mappingRationale: m.mappingRationale
  }) AS relationEntryList
  ORDER BY rowHub, relationOrder
  WITH rowHub, collect({rowRelation: rowRelation, entryList: relationEntryList}) AS relationGroupList
  WITH rowHub, relationGroupList,
       reduce(keptList = [], relationGroup IN relationGroupList | keptList + relationGroup.entryList[..5]) AS guaranteedEntryList,
       reduce(keptList = [], relationGroup IN relationGroupList |
              keptList + [leftoverEntry IN relationGroup.entryList[5..] | {rowRelation: relationGroup.rowRelation, entry: leftoverEntry}]) AS leftoverPairList
  WITH rowHub, relationGroupList, guaranteedEntryList, leftoverPairList[..(20 - size(guaranteedEntryList))] AS fillPairList
  ORDER BY rowHub
  WITH collect({rowHub: rowHub, relationGroupList: relationGroupList, guaranteedEntryList: guaranteedEntryList, fillPairList: fillPairList}) AS hubAllocationList
  RETURN reduce(shownList = [], hubAllocation IN hubAllocationList | shownList + hubAllocation.guaranteedEntryList + [fillPair IN hubAllocation.fillPairList | fillPair.entry]) AS mappingsOutgoing,
         reduce(truncationList = [], hubAllocation IN hubAllocationList | truncationList +
           [truncation IN [relationGroup IN hubAllocation.relationGroupList WHERE relationGroup.rowRelation IS NOT NULL |
              {hub: hubAllocation.rowHub, relation: relationGroup.rowRelation,
               truncatedCount: size(relationGroup.entryList) - size(relationGroup.entryList[..5])
                               - size([fillPair IN hubAllocation.fillPairList WHERE fillPair.rowRelation = relationGroup.rowRelation])}]
            WHERE truncation.truncatedCount > 0]) AS mappingsOutgoingTruncatedByRelation
}

// Cross-standard pairs (shared hub) — other standards' elements resolving to the SAME
// hub card (so the same hub: no pair crosses hubs); hubSource names that hub. equivalence = 'equivalent' ONLY for EXACT×EXACT (two judgments); an
// EXACT/CLOSE pair with a CLOSE hop = 'candidateEquivalent'; any BROAD/NARROW hop =
// 'related' (never equivalent). Both hops' evidence is carried — never a combined score.
CALL {
  WITH node
  OPTIONAL MATCH (node)-[mNear:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub:HubReference)<-[mFar:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(other:ForgedNode)
  WHERE other <> node
  WITH mNear, hub, mFar, other
  WHERE hub IS NOT NULL
  WITH mNear, hub, mFar, other, CASE WHEN type(mFar) IN ['BROAD_MATCH', 'NARROW_MATCH'] THEN type(mFar) WHEN type(mNear) IN ['BROAD_MATCH', 'NARROW_MATCH'] THEN type(mNear) WHEN type(mNear) = 'CLOSE_MATCH' OR type(mFar) = 'CLOSE_MATCH' THEN 'CLOSE_MATCH' ELSE 'EXACT_MATCH' END AS rowRelation
  WITH mNear, hub, mFar, other, rowRelation, CASE rowRelation WHEN 'EXACT_MATCH' THEN 0 WHEN 'CLOSE_MATCH' THEN 1 WHEN 'BROAD_MATCH' THEN 2 WHEN 'NARROW_MATCH' THEN 3 ELSE 4 END AS relationOrder
  ORDER BY mFar.mappingConfidence DESC
  WITH hub.hubName AS rowHub, rowRelation, relationOrder, other._source AS rowStandard, collect({
    otherSource: other._source, otherName: other.name, otherId: other._id,
    hubName: hub.name, hubKey: hub.canonicalKey, hubSource: hub.hubName,
    equivalence: CASE WHEN type(mNear) = 'EXACT_MATCH' AND type(mFar) = 'EXACT_MATCH' THEN 'equivalent'
                      WHEN type(mNear) IN ['BROAD_MATCH', 'NARROW_MATCH'] OR type(mFar) IN ['BROAD_MATCH', 'NARROW_MATCH'] THEN 'related'
                      ELSE 'candidateEquivalent' END,
    nearMatchType: type(mNear), nearConfidence: mNear.mappingConfidence, nearPredicate: mNear.predicate,
    farMatchType: type(mFar), farConfidence: mFar.mappingConfidence, farPredicate: mFar.predicate,
    nearMappingConfidence: mNear.mappingConfidence, nearMappingKind: mNear.mappingKind, nearMappingSource: mNear.mappingSource,
    farMappingConfidence: mFar.mappingConfidence, farMappingKind: mFar.mappingKind, farMappingSource: mFar.mappingSource
  }) AS standardEntryList
  ORDER BY rowHub, relationOrder, standardEntryList[0].farConfidence DESC, rowStandard
  WITH rowHub, rowRelation, relationOrder, collect({rowStandard: rowStandard, entryList: standardEntryList}) AS standardGroupList
  WITH rowHub, rowRelation, relationOrder, standardGroupList,
       reduce(longestSize = 0, standardGroup IN standardGroupList | CASE WHEN size(standardGroup.entryList) > longestSize THEN size(standardGroup.entryList) ELSE longestSize END) AS longestStandardListSize
  WITH rowHub, rowRelation, relationOrder, standardGroupList,
       reduce(interleavedPairList = [], roundIndex IN range(0, longestStandardListSize - 1) |
              interleavedPairList + [standardGroup IN standardGroupList WHERE size(standardGroup.entryList) > roundIndex |
                                     {rowStandard: standardGroup.rowStandard, entry: standardGroup.entryList[roundIndex]}]) AS relationPairList
  ORDER BY rowHub, relationOrder
  WITH rowHub, collect({rowRelation: rowRelation, pairList: relationPairList, standardGroupList: standardGroupList}) AS relationGroupList
  WITH rowHub, relationGroupList,
       reduce(keptList = [], relationGroup IN relationGroupList | keptList + relationGroup.pairList[..5]) AS guaranteedPairList,
       reduce(keptList = [], relationGroup IN relationGroupList |
              keptList + [leftoverPair IN relationGroup.pairList[5..] | {rowRelation: relationGroup.rowRelation, rowStandard: leftoverPair.rowStandard, entry: leftoverPair.entry}]) AS leftoverPairList
  WITH rowHub, relationGroupList, guaranteedPairList, leftoverPairList[..(20 - size(guaranteedPairList))] AS fillPairList
  ORDER BY rowHub
  WITH collect({rowHub: rowHub, relationGroupList: relationGroupList, guaranteedPairList: guaranteedPairList, fillPairList: fillPairList}) AS hubAllocationList
  RETURN reduce(shownList = [], hubAllocation IN hubAllocationList | shownList + [guaranteedPair IN hubAllocation.guaranteedPairList | guaranteedPair.entry] + [fillPair IN hubAllocation.fillPairList | fillPair.entry]) AS crossStandardEquivalents,
         reduce(truncationList = [], hubAllocation IN hubAllocationList | truncationList +
           [truncation IN [relationGroup IN hubAllocation.relationGroupList WHERE relationGroup.rowRelation IS NOT NULL |
              {hub: hubAllocation.rowHub, relation: relationGroup.rowRelation,
               truncatedCount: size(relationGroup.pairList) - size(relationGroup.pairList[..5])
                               - size([fillPair IN hubAllocation.fillPairList WHERE fillPair.rowRelation = relationGroup.rowRelation])}]
            WHERE truncation.truncatedCount > 0]) AS crossStandardEquivalentsTruncatedByRelation,
         reduce(truncationList = [], hubAllocation IN hubAllocationList | truncationList +
           [truncation IN reduce(standardTruncationList = [], relationGroup IN [presentGroup IN hubAllocation.relationGroupList WHERE presentGroup.rowRelation IS NOT NULL] |
                standardTruncationList + [standardGroup IN relationGroup.standardGroupList |
                  {hub: hubAllocation.rowHub, relation: relationGroup.rowRelation, standard: standardGroup.rowStandard,
                   truncatedCount: size(standardGroup.entryList)
                                   - size([guaranteedPair IN relationGroup.pairList[..5] WHERE guaranteedPair.rowStandard = standardGroup.rowStandard])
                                   - size([fillPair IN hubAllocation.fillPairList WHERE fillPair.rowRelation = relationGroup.rowRelation AND fillPair.rowStandard = standardGroup.rowStandard])}])
            WHERE truncation.truncatedCount > 0]) AS crossStandardEquivalentsTruncatedByRelationAndStandard
}

// Source elements resolving here (incoming) — when this node is a hub leaf (of any hub), the
// standards' elements whose tuple contains it; hubSource names the card's hub.
CALL {
  WITH node
  OPTIONAL MATCH (node)<-[slotEdge]-(hub:HubReference)<-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]-(src:ForgedNode)
  WHERE type(slotEdge) IN $hubIncomingSlotEdgeTypeList
  WITH hub, m, src, type(m) AS rowRelation
  WHERE hub IS NOT NULL
  WITH hub, m, src, rowRelation, CASE rowRelation WHEN 'EXACT_MATCH' THEN 0 WHEN 'CLOSE_MATCH' THEN 1 WHEN 'BROAD_MATCH' THEN 2 WHEN 'NARROW_MATCH' THEN 3 ELSE 4 END AS relationOrder
  ORDER BY m.mappingConfidence DESC
  WITH hub.hubName AS rowHub, rowRelation, relationOrder, src._source AS rowStandard, collect({
    fromSource: src._source, fromName: src.name, fromId: src._id,
    hubName: hub.name, hubKey: hub.canonicalKey, hubSource: hub.hubName,
    mappingType: type(m), confidence: m.mappingConfidence,
    matchPredicate: m.predicate,
    mappingConfidence: m.mappingConfidence, mappingKind: m.mappingKind, mappingSource: m.mappingSource, mappingRationale: m.mappingRationale
  }) AS standardEntryList
  ORDER BY rowHub, relationOrder, standardEntryList[0].confidence DESC, rowStandard
  WITH rowHub, rowRelation, relationOrder, collect({rowStandard: rowStandard, entryList: standardEntryList}) AS standardGroupList
  WITH rowHub, rowRelation, relationOrder, standardGroupList,
       reduce(longestSize = 0, standardGroup IN standardGroupList | CASE WHEN size(standardGroup.entryList) > longestSize THEN size(standardGroup.entryList) ELSE longestSize END) AS longestStandardListSize
  WITH rowHub, rowRelation, relationOrder, standardGroupList,
       reduce(interleavedPairList = [], roundIndex IN range(0, longestStandardListSize - 1) |
              interleavedPairList + [standardGroup IN standardGroupList WHERE size(standardGroup.entryList) > roundIndex |
                                     {rowStandard: standardGroup.rowStandard, entry: standardGroup.entryList[roundIndex]}]) AS relationPairList
  ORDER BY rowHub, relationOrder
  WITH rowHub, collect({rowRelation: rowRelation, pairList: relationPairList, standardGroupList: standardGroupList}) AS relationGroupList
  WITH rowHub, relationGroupList,
       reduce(keptList = [], relationGroup IN relationGroupList | keptList + relationGroup.pairList[..5]) AS guaranteedPairList,
       reduce(keptList = [], relationGroup IN relationGroupList |
              keptList + [leftoverPair IN relationGroup.pairList[5..] | {rowRelation: relationGroup.rowRelation, rowStandard: leftoverPair.rowStandard, entry: leftoverPair.entry}]) AS leftoverPairList
  WITH rowHub, relationGroupList, guaranteedPairList, leftoverPairList[..(20 - size(guaranteedPairList))] AS fillPairList
  ORDER BY rowHub
  WITH collect({rowHub: rowHub, relationGroupList: relationGroupList, guaranteedPairList: guaranteedPairList, fillPairList: fillPairList}) AS hubAllocationList
  RETURN reduce(shownList = [], hubAllocation IN hubAllocationList | shownList + [guaranteedPair IN hubAllocation.guaranteedPairList | guaranteedPair.entry] + [fillPair IN hubAllocation.fillPairList | fillPair.entry]) AS mappingsIncoming,
         reduce(truncationList = [], hubAllocation IN hubAllocationList | truncationList +
           [truncation IN [relationGroup IN hubAllocation.relationGroupList WHERE relationGroup.rowRelation IS NOT NULL |
              {hub: hubAllocation.rowHub, relation: relationGroup.rowRelation,
               truncatedCount: size(relationGroup.pairList) - size(relationGroup.pairList[..5])
                               - size([fillPair IN hubAllocation.fillPairList WHERE fillPair.rowRelation = relationGroup.rowRelation])}]
            WHERE truncation.truncatedCount > 0]) AS mappingsIncomingTruncatedByRelation,
         reduce(truncationList = [], hubAllocation IN hubAllocationList | truncationList +
           [truncation IN reduce(standardTruncationList = [], relationGroup IN [presentGroup IN hubAllocation.relationGroupList WHERE presentGroup.rowRelation IS NOT NULL] |
                standardTruncationList + [standardGroup IN relationGroup.standardGroupList |
                  {hub: hubAllocation.rowHub, relation: relationGroup.rowRelation, standard: standardGroup.rowStandard,
                   truncatedCount: size(standardGroup.entryList)
                                   - size([guaranteedPair IN relationGroup.pairList[..5] WHERE guaranteedPair.rowStandard = standardGroup.rowStandard])
                                   - size([fillPair IN hubAllocation.fillPairList WHERE fillPair.rowRelation = relationGroup.rowRelation AND fillPair.rowStandard = standardGroup.rowStandard])}])
            WHERE truncation.truncatedCount > 0]) AS mappingsIncomingTruncatedByRelationAndStandard
}

// Instance view (lane D, 2026-10-01) — SIF and PESC put their hub mappings on INSTANCE nodes:
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
  WITH hub, type(m) AS matchType, m.mappingConfidence AS confidence, m.predicate AS matchPredicate,
       m.mappingConfidence AS mappingConfidence, m.mappingKind AS mappingKind, m.mappingSource AS mappingSource, m.mappingRationale AS mappingRationale,
       coalesce(head([(groupObject:ForgedNode)-[:HAS_FIELD]->(inst) | groupObject.name]), inst.sectionPath) AS instGroupName,
       inst
  // the rationale is per-instance evidence, not part of the verdict: min() keeps one recorded text without splitting the row
  WITH hub, matchType, confidence, matchPredicate,
       mappingConfidence, mappingKind, mappingSource, min(mappingRationale) AS mappingRationale,
       collect(DISTINCT instGroupName) AS instanceGroupList, count(inst) AS instanceCount
  WHERE hub IS NOT NULL
  WITH hub, matchType, confidence, matchPredicate, mappingConfidence, mappingKind, mappingSource, mappingRationale, instanceGroupList, instanceCount, matchType AS rowRelation
  WITH hub, matchType, confidence, matchPredicate, mappingConfidence, mappingKind, mappingSource, mappingRationale, instanceGroupList, instanceCount, rowRelation, CASE rowRelation WHEN 'EXACT_MATCH' THEN 0 WHEN 'CLOSE_MATCH' THEN 1 WHEN 'BROAD_MATCH' THEN 2 WHEN 'NARROW_MATCH' THEN 3 ELSE 4 END AS relationOrder
  ORDER BY confidence DESC
  WITH hub.hubName AS rowHub, rowRelation, relationOrder, collect({
    toSource: hub.hubName, toName: hub.name, toId: hub.canonicalKey,
    mappingType: matchType, confidence: confidence, matchPredicate: matchPredicate,
    mappingConfidence: mappingConfidence, mappingKind: mappingKind, mappingSource: mappingSource, mappingRationale: mappingRationale,
    instanceGroupList: instanceGroupList[..25], instanceGroupCount: size(instanceGroupList), instanceCount: instanceCount
  }) AS relationEntryList
  ORDER BY rowHub, relationOrder
  WITH rowHub, collect({rowRelation: rowRelation, entryList: relationEntryList}) AS relationGroupList
  WITH rowHub, relationGroupList,
       reduce(keptList = [], relationGroup IN relationGroupList | keptList + relationGroup.entryList[..5]) AS guaranteedEntryList,
       reduce(keptList = [], relationGroup IN relationGroupList |
              keptList + [leftoverEntry IN relationGroup.entryList[5..] | {rowRelation: relationGroup.rowRelation, entry: leftoverEntry}]) AS leftoverPairList
  WITH rowHub, relationGroupList, guaranteedEntryList, leftoverPairList[..(20 - size(guaranteedEntryList))] AS fillPairList
  ORDER BY rowHub
  WITH collect({rowHub: rowHub, relationGroupList: relationGroupList, guaranteedEntryList: guaranteedEntryList, fillPairList: fillPairList}) AS hubAllocationList
  RETURN reduce(shownList = [], hubAllocation IN hubAllocationList | shownList + hubAllocation.guaranteedEntryList + [fillPair IN hubAllocation.fillPairList | fillPair.entry]) AS mappingsViaInstances,
         reduce(truncationList = [], hubAllocation IN hubAllocationList | truncationList +
           [truncation IN [relationGroup IN hubAllocation.relationGroupList WHERE relationGroup.rowRelation IS NOT NULL |
              {hub: hubAllocation.rowHub, relation: relationGroup.rowRelation,
               truncatedCount: size(relationGroup.entryList) - size(relationGroup.entryList[..5])
                               - size([fillPair IN hubAllocation.fillPairList WHERE fillPair.rowRelation = relationGroup.rowRelation])}]
            WHERE truncation.truncatedCount > 0]) AS mappingsViaInstancesTruncatedByRelation
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
            mappingsViaInstances: mappingsViaInstances, mappingsViaInstancesTruncatedByRelation: mappingsViaInstancesTruncatedByRelation,
            ownedFieldCount: ownedFieldCount, ownedFields: ownedFields, owningObjects: owningObjects,
            structuralParents: structuralParents,
            structuralChildCount: structuralChildCount, structuralChildren: structuralChildren
          }
     END AS instanceView

// === Return ===
RETURN
  node,
  hit.hitRank AS hitRank,
  hit.fusedScore AS fusedScore,
  hit.foundByLegList AS foundByLegList,
  hit.keywordRank AS keywordRank,
  hit.keywordScore AS keywordScore,
  hit.vectorRank AS vectorRank,
  hit.vectorScore AS vectorScore,
  labels(node) AS nodeLabels,
  node.role AS role,
  node._source AS source,
  parentClasses,
  optionSets,
  optionSetCount,
  optionValues,
  supports,
  superClasses,
  subClasses,
  ownedClasses,
  referencesTo,
  referencedBy,
  mappingsOutgoing,
  mappingsOutgoingTruncatedByRelation,
  crossStandardEquivalents,
  crossStandardEquivalentsTruncatedByRelation,
  crossStandardEquivalentsTruncatedByRelationAndStandard,
  mappingsIncoming,
  mappingsIncomingTruncatedByRelation,
  mappingsIncomingTruncatedByRelationAndStandard,
  instanceView
ORDER BY hitRank
