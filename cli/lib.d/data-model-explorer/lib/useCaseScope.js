'use strict';

// useCaseScope.js — how the DME tells a USE-CASE node from a data standard's element (use-case forge Phase 5, 2026-10-30;
// educoreForge SPEC-useCaseForge-102926 §3.7). The use-case corpus is a standard of its own (_source UseCase, standardKind
// useCaseCorpus), but its reference nodes carry the names of the elements they CITE ('Birthdate' cites CEDS P000033), so a
// name lookup that counts data elements would count the citation as one more element (measured: findMappings Birthdate
// 106 -> 107 nodes on GOLD_EVAL_261030_useCases). The contract names the use-case roles (graphContract.json
// useCaseScopeRule, emitted by educoreForge lib/vocabulary/graph-contract.js), and this module is the ONE place the DME
// reads them. A citation stays reachable: from the cited element, its DECLARED_CORRESPONDENCE edge is listed apart.
//
//   { USE_CASE_STANDARD_KIND, USE_CASE_ROLE_LIST, useCaseNodeText(variableName), notUseCaseNodeText(variableName) }

const { contract } = require('./graphContract');

const useCaseScopeRule = contract.useCaseScopeRule;
if (!useCaseScopeRule || typeof useCaseScopeRule.standardKind !== 'string' || !Array.isArray(useCaseScopeRule.useCaseRoleList) || !useCaseScopeRule.useCaseRoleList.length) {
	throw new Error('useCaseScope: contract/graphContract.json declares no useCaseScopeRule — re-emit it from educoreForge (lib/vocabulary/tools/emitGraphContractJson.js)');
}
const USE_CASE_STANDARD_KIND = useCaseScopeRule.standardKind;
const USE_CASE_ROLE_LIST = Object.freeze(useCaseScopeRule.useCaseRoleList.slice());
// the Cypher predicates that say a node IS a use-case node, or keep it OUT of a data element lookup (the role names are
// contract data, not input)
const useCaseRoleListCypherText = `[${USE_CASE_ROLE_LIST.map((roleName) => `'${roleName}'`).join(', ')}]`;
const useCaseNodeText = (variableName) => `coalesce(${variableName}.role, '') IN ${useCaseRoleListCypherText}`;
const notUseCaseNodeText = (variableName) => `NOT ${useCaseNodeText(variableName)}`;

module.exports = { USE_CASE_STANDARD_KIND, USE_CASE_ROLE_LIST, useCaseNodeText, notUseCaseNodeText };
