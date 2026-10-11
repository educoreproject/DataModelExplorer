'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[UserGraphSeam]]
// @concept: [[AuthoringWrites]]
//
// write-executor.js — the server-side, write-enabled "low-level executor" beneath the
// conversational authoring path (design doc 02/04/09). It is what an askMilo write tool
// WOULD call; per the parent's ruling (Option A), the ownership invariant and the
// additive-only guardrail are enforced HERE in hard server code, not trusted to a prompt.
//
// Invariants enforced (doc 04; graph-contract §14 via user-layer-contract.js, campaign P2 W-E-5/6/7):
//   - Every created node is stamped :UserContent + a stable userNodeId. The user layer is
//     TEXT-ONLY (userEmbeddingRule.userVectorPolicy): no vector is made, so no embedding model
//     can disagree with the build's.
//   - Additive-only: the executor refuses to SET/DELETE/REMOVE on any node lacking
//     :UserContent (i.e. any golden node), with a clear error.
//   - user->standard links name the standard by userLinkTargetRule.standardKeyName (stableId,
//     carried by every standard) on a :ForgedNode in a declared linkable role; 'uri' (CEDS-only)
//     is retired and refused by name.
//   - every user-made edge carries the declared stamp (userEdgeStampFieldList); the four match
//     relation types are judge relations and are refused (userEdgeRule.matchRelationPolicy).

const makeRefId = require('../../../lib/make-ref-id');
const {
	USER_LINK_TARGET_RULE,
	USER_EMBEDDING_RULE,
	matchRelationRefusalFor,
	userEdgeStampOf,
} = require('./user-layer-contract');

const resolveStandardKeyName = () => USER_LINK_TARGET_RULE.standardKeyName;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const validIdent = (s) => typeof s === 'string' && IDENT.test(s);

// Old writers stamped embedding/embeddingModelVersion on user nodes; under the text-only rule a caller may not set them.
const RESERVED_PROPS = ['userNodeId', 'embedding', 'embeddingModelVersion'];

// Payload names a retired key wore; each is refused by name rather than read (W-E-5).
const RETIRED_STANDARD_PAYLOAD_NAME_LIST = ['standardKey', 'standardUri', 'uri'];

const cleanProps = (properties) => {
	const out = {};
	Object.keys(properties || {}).forEach((k) => {
		if (!RESERVED_PROPS.includes(k) && validIdent(k)) {
			const v = properties[k];
			if (['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
		}
	});
	return out;
};

// ---------------------------------------------------------------------------
// createNode — stamp + create a :UserContent node (text only).
const createNode = ({ userGraphDb, labels, properties }, callback) => {
	const props = cleanProps(properties);
	const userLabels = (labels || []).filter(validIdent).filter((l) => l !== 'UserContent');
	const userNodeId = makeRefId(20);
	const labelClause = [':UserContent', ...userLabels.map((l) => `:${l}`)].join('');
	const cypher = `CREATE (n${labelClause} {userNodeId:$userNodeId}) SET n += $props RETURN n.userNodeId AS userNodeId`;
	userGraphDb.runQuery(cypher, { userNodeId, props }, (qErr) => {
		if (qErr) { callback(`createNode failed: ${qErr}`); return; }
		callback('', { userNodeId, userVectorPolicy: USER_EMBEDDING_RULE.userVectorPolicy });
	});
};

// ---------------------------------------------------------------------------
// connectToStandard — link a user node to a standard element by its stableId, in a linkable role.
const connectToStandard = ({ userGraphDb, userRefId, fromUserNodeId, relType, standardStableId }, callback) => {
	if (!validIdent(relType)) { callback(`connectToStandard: invalid relType '${relType}'`); return; }
	const matchRelationRefusal = matchRelationRefusalFor({ verbName: 'connectToStandard', relType });
	if (matchRelationRefusal) { callback(matchRelationRefusal); return; }
	if (!standardStableId) { callback('connectToStandard: standardStableId is required'); return; }
	const { userEdgeStamp, refusal } = userEdgeStampOf({ userRefId });
	if (refusal) { callback(`connectToStandard: ${refusal}`); return; }

	const { standardKeyName, targetLabel, linkableRoleList } = USER_LINK_TARGET_RULE;
	const cypher =
		`MATCH (u:UserContent {userNodeId:$userNodeId}) ` +
		`MATCH (s:${targetLabel} {${standardKeyName}:$standardStableId}) WHERE s.role IN $linkableRoleList ` +
		`MERGE (u)-[r:${relType}]->(s) SET r += $userEdgeStamp ` +
		`RETURN type(r) AS relType, s.${standardKeyName} AS targetStableId`;
	userGraphDb.runQuery(cypher, { userNodeId: fromUserNodeId, standardStableId, linkableRoleList, userEdgeStamp }, (qErr, rows) => {
		if (qErr) { callback(`connectToStandard failed: ${qErr}`); return; }
		if (!rows || rows.length === 0) {
			callback(`connectToStandard: no :${targetLabel} with ${standardKeyName}='${standardStableId}' in role ${linkableRoleList.join('|')}, or user node not found`);
			return;
		}
		callback('', rows[0]);
	});
};

// ---------------------------------------------------------------------------
// connectUserNodes — link two user nodes (both :UserContent, by userNodeId).
const connectUserNodes = ({ userGraphDb, userRefId, fromUserNodeId, toUserNodeId, relType }, callback) => {
	if (!validIdent(relType)) { callback(`connectUserNodes: invalid relType '${relType}'`); return; }
	const matchRelationRefusal = matchRelationRefusalFor({ verbName: 'connectUserNodes', relType });
	if (matchRelationRefusal) { callback(matchRelationRefusal); return; }
	const { userEdgeStamp, refusal } = userEdgeStampOf({ userRefId });
	if (refusal) { callback(`connectUserNodes: ${refusal}`); return; }
	const cypher =
		`MATCH (a:UserContent {userNodeId:$a}) MATCH (b:UserContent {userNodeId:$b}) ` +
		`MERGE (a)-[r:${relType}]->(b) SET r += $userEdgeStamp RETURN type(r) AS relType`;
	userGraphDb.runQuery(cypher, { a: fromUserNodeId, b: toUserNodeId, userEdgeStamp }, (qErr, rows) => {
		if (qErr) { callback(`connectUserNodes failed: ${qErr}`); return; }
		if (!rows || rows.length === 0) { callback('connectUserNodes: a user node was not found'); return; }
		callback('', rows[0]);
	});
};

// ---------------------------------------------------------------------------
// A selector names a node by userNodeId or by standardStableId (keyed on the contract's standardKeyName). Either can
// only ever match a UserContent node in practice — the additive-only check below refuses everything else.
const selectorMatchFor = ({ verbName, selector }) => {
	if (selector && selector.uri !== undefined) {
		return { refusal: `${verbName}: selector.uri is a retired key; pass selector.standardStableId` };
	}
	if (selector && selector.userNodeId) {
		return { matchClause: '(n {userNodeId:$sel})', sel: selector.userNodeId };
	}
	if (selector && selector.standardStableId) {
		return { matchClause: `(n {${resolveStandardKeyName()}:$sel})`, sel: selector.standardStableId };
	}
	return { refusal: `${verbName}: selector requires userNodeId or standardStableId` };
};

// ---------------------------------------------------------------------------
// modifyNode — GUARDED mutate: SET props only on a :UserContent node. Refuses golden.
const modifyNode = ({ userGraphDb, selector, properties }, callback) => {
	const { matchClause, sel, refusal } = selectorMatchFor({ verbName: 'modifyNode', selector });
	if (refusal) { callback(refusal); return; }
	const params = { sel, props: cleanProps(properties) };

	userGraphDb.runQuery(`MATCH ${matchClause} RETURN 'UserContent' IN labels(n) AS isUser LIMIT 1`, params, (cErr, rows) => {
		if (cErr) { callback(`modifyNode check failed: ${cErr}`); return; }
		if (!rows || rows.length === 0) { callback('modifyNode: target node not found'); return; }
		if (!rows[0].isUser) { callback('additive-only: refusing to modify a non-UserContent (golden) node'); return; }
		userGraphDb.runQuery(`MATCH ${matchClause} SET n += $props RETURN n.userNodeId AS userNodeId`, params, (sErr) => {
			if (sErr) { callback(`modifyNode set failed: ${sErr}`); return; }
			callback('', { modified: true });
		});
	});
};

// ---------------------------------------------------------------------------
// deleteNode — GUARDED delete: only :UserContent nodes. Refuses golden.
const deleteNode = ({ userGraphDb, selector }, callback) => {
	const { matchClause, sel, refusal } = selectorMatchFor({ verbName: 'deleteNode', selector });
	if (refusal) { callback(refusal); return; }
	const params = { sel };

	userGraphDb.runQuery(`MATCH ${matchClause} RETURN 'UserContent' IN labels(n) AS isUser LIMIT 1`, params, (cErr, rows) => {
		if (cErr) { callback(`deleteNode check failed: ${cErr}`); return; }
		if (!rows || rows.length === 0) { callback('deleteNode: target node not found'); return; }
		if (!rows[0].isUser) { callback('additive-only: refusing to delete a non-UserContent (golden) node'); return; }
		userGraphDb.runQuery(`MATCH ${matchClause} DETACH DELETE n`, params, (dErr) => {
			if (dErr) { callback(`deleteNode failed: ${dErr}`); return; }
			callback('', { deleted: true });
		});
	});
};

// ---------------------------------------------------------------------------
// The action registry: each structured action maps its payload onto one guarded writer.
const WRITE_ACTION_BY_NAME = {
	createNode: ({ userGraphDb, params }, callback) => createNode({ userGraphDb, labels: params.labels, properties: params.properties }, callback),
	connectToStandard: ({ userGraphDb, userRefId, params }, callback) => {
		const retiredNameList = RETIRED_STANDARD_PAYLOAD_NAME_LIST.filter((onePayloadName) => params[onePayloadName] !== undefined);
		if (retiredNameList.length > 0) {
			callback(`connectToStandard: pass standardStableId; ${retiredNameList.join(', ')} is a retired key`);
			return;
		}
		connectToStandard({ userGraphDb, userRefId, fromUserNodeId: params.userNodeId, relType: params.relType, standardStableId: params.standardStableId }, callback);
	},
	connectUserNodes: ({ userGraphDb, userRefId, params }, callback) => connectUserNodes({ userGraphDb, userRefId, fromUserNodeId: params.fromUserNodeId, toUserNodeId: params.toUserNodeId, relType: params.relType }, callback),
	modifyNode: ({ userGraphDb, params }, callback) => modifyNode({ userGraphDb, selector: params.selector, properties: params.properties }, callback),
	deleteNode: ({ userGraphDb, params }, callback) => deleteNode({ userGraphDb, selector: params.selector }, callback),
};

// ---------------------------------------------------------------------------
// executeWrite — dispatch one structured write action against a live clone connection.
const executeWrite = ({ userGraphDb, userRefId, action, params }, callback) => {
	const writeAction = WRITE_ACTION_BY_NAME[action];
	if (!writeAction) {
		callback(`write-executor: unknown action '${action}' (known: ${Object.keys(WRITE_ACTION_BY_NAME).join(', ')})`);
		return;
	}
	if (!params || typeof params !== 'object') {
		callback(`write-executor: action '${action}' requires a params object`);
		return;
	}
	writeAction({ userGraphDb, userRefId, params }, callback);
};

module.exports = {
	executeWrite,
	resolveStandardKeyName,
	WRITE_ACTION_BY_NAME,
};
