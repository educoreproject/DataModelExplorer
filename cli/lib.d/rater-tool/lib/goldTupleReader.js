'use strict';

// goldTupleReader.js — revision 3 (TQ-approved exception to the truth-set rule "no machine results"): the CEDS tuples the
// named gold maps a sampled element to, so that -buildSuggested can put them ON the element's candidate list. The gold
// decides only what is on the list, never how a card looks or where it sits; nothing it returns reaches a rater.
//
// The member rule is the one isMappedInGold uses (frameReaders.js): an element's members carry the match edges
// themselves (Ed-Fi, SIF), or, for PESC, the occurrence nodes whose stableId starts with a member's stableId + '/at/' do.
// Which standard uses which rule is data: suggestRules.json goldInjection.memberRuleNameByStandard.
//
//   readGoldTupleList({ raterGraph, memberRuleName, mappingEdgeTypeList, memberStableIdList }, callback(errText, goldTupleList))
//     goldTupleList = [{ cedsTupleId, referenceTier }] sorted by cedsTupleId, one per distinct HubReference reached.
//     cedsTupleId is HubReference.stableId: the same property a card's cedsTupleId is read from (ceds-cards.js
//     CARD_RETURN_TEXT); on every property-tier tuple of this gold it also equals the tuple's uri.

const MEMBER_RULE_CYPHER_BY_NAME = Object.freeze({
	memberCarriesEdge: (edgeTypeText) => `UNWIND $memberStableIdList AS memberStableId
		MATCH (member:ForgedNode {stableId: memberStableId})-[:${edgeTypeText}]->(tuple:HubReference {hubName: 'CEDS'})
		RETURN DISTINCT tuple.stableId AS cedsTupleId, tuple.referenceTier AS referenceTier ORDER BY cedsTupleId`,
	occurrencesCarryEdge: (edgeTypeText) => `UNWIND $memberStableIdList AS memberStableId
		MATCH (occurrence:ForgedNode) WHERE occurrence.stableId STARTS WITH memberStableId + '/at/'
		MATCH (occurrence)-[:${edgeTypeText}]->(tuple:HubReference {hubName: 'CEDS'})
		RETURN DISTINCT tuple.stableId AS cedsTupleId, tuple.referenceTier AS referenceTier ORDER BY cedsTupleId`,
});

// ⟪lane zbE, E4⟫ only CEDS cards are gold for the CEDS Rater: on a gold with a second hub an element's CTDL cards (B3) must
// never be injected into a CEDS candidate list

// relationship types cannot be Cypher parameters, so they are checked to be plain type names before they are spliced in
const EDGE_TYPE_NAME_PATTERN = /^[A-Z][A-Z_]*$/;

const readGoldTupleList = ({ raterGraph, memberRuleName, mappingEdgeTypeList, memberStableIdList }, callback) => {
	const cypherOf = MEMBER_RULE_CYPHER_BY_NAME[memberRuleName];
	if (!cypherOf) {
		callback(`goldTupleReader: unknown member rule '${memberRuleName}'; known: ${Object.keys(MEMBER_RULE_CYPHER_BY_NAME).join(', ')}`);
		return;
	}
	if (!Array.isArray(mappingEdgeTypeList) || mappingEdgeTypeList.length === 0 || !mappingEdgeTypeList.every((edgeTypeName) => EDGE_TYPE_NAME_PATTERN.test(edgeTypeName))) {
		callback(`goldTupleReader: mappingEdgeTypeList must be a non-empty list of relationship type names; got ${JSON.stringify(mappingEdgeTypeList)}`);
		return;
	}
	if (!Array.isArray(memberStableIdList) || memberStableIdList.length === 0) {
		callback(`goldTupleReader: memberStableIdList must be a non-empty list; got ${JSON.stringify(memberStableIdList)}`);
		return;
	}
	raterGraph.runQuery(cypherOf(mappingEdgeTypeList.join('|')), { memberStableIdList }, (queryError, rowList) =>
		queryError ? callback(`the gold tuple read failed: ${queryError}`) : callback('', rowList.map((row) => ({ cedsTupleId: row.cedsTupleId, referenceTier: row.referenceTier }))));
};

module.exports = { readGoldTupleList, MEMBER_RULE_CYPHER_BY_NAME };
