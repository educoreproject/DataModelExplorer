'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[UserGraphSeam]]
//
// user-layer-contract.js — the user graph's reading of graph-contract §14 (campaign P2, W-E-5/6/7; ruling A12: a user
// links by stableId to a declaration role, the user layer is TEXT-ONLY, the four match relation types are REFUSED to
// users). The rules are not restated here: they arrive in the DME's shipped contract/graphContract.json, the one copy
// educore holds of educoreForge's graph-contract.js, read through the DME's own loader so both sides of educore read
// the same bytes.
//
//   { USER_LINK_TARGET_RULE, USER_EDGE_STAMP_FIELD_LIST, USER_EDGE_RULE, USER_EMBEDDING_RULE,
//     isMatchRelationType, matchRelationRefusalFor, userEdgeStampOf }
//
// An absent rule is fatal at load: a write path with no link rule would either write nothing or guess, and a guess is
// what this file replaced (the hard-coded 'uri').

const makeRefId = require('../../../lib/make-ref-id');
const { contract, CONTRACT_FILE_PATH } = require('../../../../cli/lib.d/data-model-explorer/lib/graphContract');

const REQUIRED_RULE_NAME_LIST = ['userLinkTargetRule', 'userEdgeStampFieldList', 'userEdgeRule', 'userEmbeddingRule'];
const absentRuleNameList = REQUIRED_RULE_NAME_LIST.filter((oneRuleName) => contract[oneRuleName] === undefined);
if (absentRuleNameList.length > 0) {
	throw new Error(`user-layer-contract REFUSED: ${CONTRACT_FILE_PATH} lacks ${absentRuleNameList.join(', ')} (graph-contract §14); re-emit graphContract.json from educoreForge`);
}

const USER_LINK_TARGET_RULE = Object.freeze(contract.userLinkTargetRule);
const USER_EDGE_STAMP_FIELD_LIST = Object.freeze(contract.userEdgeStampFieldList.slice());
const USER_EDGE_RULE = Object.freeze(contract.userEdgeRule);
const USER_EMBEDDING_RULE = Object.freeze(contract.userEmbeddingRule);

const isMatchRelationType = (relType) => USER_EDGE_RULE.matchRelationTypeList.indexOf(relType) !== -1;

// The only policy the contract declares today is 'refuse'; any other value is refused by name rather than guessed at.
const matchRelationRefusalFor = ({ verbName, relType }) => {
	if (!isMatchRelationType(relType)) {
		return '';
	}
	if (USER_EDGE_RULE.matchRelationPolicy !== 'refuse') {
		return `${verbName}: graph contract matchRelationPolicy '${USER_EDGE_RULE.matchRelationPolicy}' is not one this writer implements`;
	}
	return `${verbName}: '${relType}' is a judge relation (${USER_EDGE_RULE.matchRelationTypeList.join('|')}); user links use their own relation types, e.g. ALIGNS_WITH`;
};

// The stamp every user-made edge carries; re-emit captures edges BY this stamp. Field names come from the declared list,
// so a field added to the contract without a value here is refused, not silently written as null.
const STAMP_VALUE_BY_FIELD_NAME = {
	userAuthored: () => true,
	userRefId: ({ userRefId }) => userRefId,
	userEdgeRefId: () => makeRefId(20),
	authoredAt: ({ authoredAt }) => authoredAt,
};
const userEdgeStampOf = ({ userRefId, authoredAt }) => {
	if (!userRefId) {
		return { refusal: 'user edge stamp: userRefId is required (the signed-in user who authored the edge)' };
	}
	const unproducibleList = USER_EDGE_STAMP_FIELD_LIST.filter((oneFieldName) => !STAMP_VALUE_BY_FIELD_NAME[oneFieldName]);
	if (unproducibleList.length > 0) {
		return { refusal: `user edge stamp: no producer for declared field(s) ${unproducibleList.join(', ')}` };
	}
	const stampedAt = authoredAt || new Date().toISOString();
	const userEdgeStamp = USER_EDGE_STAMP_FIELD_LIST.reduce((soFar, oneFieldName) => ({ ...soFar, [oneFieldName]: STAMP_VALUE_BY_FIELD_NAME[oneFieldName]({ userRefId, authoredAt: stampedAt }) }), {});
	return { userEdgeStamp };
};

module.exports = {
	USER_LINK_TARGET_RULE,
	USER_EDGE_STAMP_FIELD_LIST,
	USER_EDGE_RULE,
	USER_EMBEDDING_RULE,
	isMatchRelationType,
	matchRelationRefusalFor,
	userEdgeStampOf,
};
