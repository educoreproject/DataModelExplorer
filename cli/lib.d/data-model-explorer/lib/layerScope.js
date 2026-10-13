'use strict';

// layerScope.js — how the DME tells a LAYER node from its standard's own (lane DES, educoreForge campaign cedsRichness-101226,
// 2026-10-12; COPPER_RIVER amendment B). A layer is a separately published companion of one standard (for CEDS: the Ontology
// Guide V14 Appendix A and the U+FFFD text repairs). Its nodes carry the standard's _source and
// ForgedNode, so every verb that counts or selects by _source, ForgedNode or standard would silently grow the standard by
// them; the contract names the label that tells them apart (graphContract.json layerScopeRule), and this module is the ONE
// place the DME reads it.
//
//   { LAYER_LABEL, LAYER_ROLE_LIST, notLayerNodeText(variableName) }

const { contract } = require('./graphContract');

const layerScopeRule = contract.layerScopeRule;
if (!layerScopeRule || typeof layerScopeRule.layerLabel !== 'string' || !Array.isArray(layerScopeRule.layerRoleList)) {
	throw new Error('layerScope: contract/graphContract.json declares no layerScopeRule — re-emit it from educoreForge (lib/vocabulary/tools/emitGraphContractJson.js)');
}
const LAYER_LABEL = layerScopeRule.layerLabel;
const LAYER_ROLE_LIST = Object.freeze(layerScopeRule.layerRoleList.slice());
// the Cypher predicate that keeps a node OUT of a standard's own population (the label is contract data, not input)
const notLayerNodeText = (variableName) => `NOT ${variableName}:\`${LAYER_LABEL}\``;

module.exports = { LAYER_LABEL, LAYER_ROLE_LIST, notLayerNodeText };
