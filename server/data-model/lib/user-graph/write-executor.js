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
// Invariants enforced (doc 04):
//   - Every created node is stamped :UserContent + a stable userNodeId + an inline
//     embedding (voyage-3, the SAME model golden's forge uses) + embeddingModelVersion.
//   - Additive-only: the executor refuses to SET/DELETE/REMOVE on any node lacking
//     :UserContent (i.e. any golden node), with a clear error.
//   - user->standard links resolve the standard by its stable business key `uri`
//     (the property the real golden graph actually carries; the spec's "sourceUri").
//     Pending parent confirmation of the key; isolated to resolveStandardKeyName().

const https = require('https');
const makeRefId = require('../../../lib/make-ref-id');

// Same model golden's forge uses (cli/.../ceds/embedder.js: 'voyage-3', 1024-dim).
const EMBEDDING_MODEL = 'voyage-3';

// The stable business key on standard ELEMENTS in the real golden graph. The spec says
// "sourceUri"; the live graph carries `uri` (globally unique on the ~24k linkable
// elements). One place to change if the parent rules differently.
const resolveStandardKeyName = () => 'uri';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const validIdent = (s) => typeof s === 'string' && IDENT.test(s);

const RESERVED_PROPS = ['userNodeId', 'embedding', 'embeddingModelVersion'];

// ---------------------------------------------------------------------------
// embedText — Voyage embedding (callback style). Returns a 1024-float vector.
const embedText = (text, apiKey, callback) => {
	if (!apiKey) { callback('write-executor: missing voyageApiKey'); return; }
	const body = JSON.stringify({ model: EMBEDDING_MODEL, input: [text || ''], input_type: 'document' });
	const req = https.request(
		{
			hostname: 'api.voyageai.com',
			path: '/v1/embeddings',
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
		},
		(res) => {
			let data = '';
			res.on('data', (c) => (data += c));
			res.on('end', () => {
				if (res.statusCode !== 200) { callback(`Voyage API ${res.statusCode}: ${data}`); return; }
				let parsed;
				try { parsed = JSON.parse(data); } catch (e) { callback(`Voyage parse: ${e.message}`); return; }
				const vec = parsed && parsed.data && parsed.data[0] && parsed.data[0].embedding;
				if (!Array.isArray(vec)) { callback('Voyage: no embedding in response'); return; }
				callback('', vec);
			});
		},
	);
	req.on('error', (e) => callback(`Voyage request failed: ${e.message}`));
	req.write(body);
	req.end();
};

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
// createNode — stamp + create a :UserContent node with an inline embedding.
const createNode = ({ userGraphDb, voyageApiKey, labels, properties }, callback) => {
	const props = cleanProps(properties);
	const userLabels = (labels || []).filter(validIdent).filter((l) => l !== 'UserContent');
	const userNodeId = makeRefId(20);
	const text = ['name', 'title', 'description', 'text']
		.map((k) => props[k]).filter(Boolean).join(' ').trim() || (props.name || 'user node');

	embedText(text, voyageApiKey, (eErr, vector) => {
		if (eErr) { callback(eErr); return; }
		const labelClause = [':UserContent', ...userLabels.map((l) => `:${l}`)].join('');
		const cypher =
			`CREATE (n${labelClause} {userNodeId:$userNodeId, embedding:$embedding, embeddingModelVersion:$emv}) ` +
			`SET n += $props RETURN n.userNodeId AS userNodeId`;
		userGraphDb.runQuery(
			cypher,
			{ userNodeId, embedding: vector, emv: EMBEDDING_MODEL, props },
			(qErr) => {
				if (qErr) { callback(`createNode failed: ${qErr}`); return; }
				callback('', { userNodeId, embeddingDim: vector.length, embeddingModelVersion: EMBEDDING_MODEL });
			},
		);
	});
};

// ---------------------------------------------------------------------------
// connectToStandard — link a user node to a standard element by its stable key.
const connectToStandard = ({ userGraphDb, fromUserNodeId, relType, standardKey }, callback) => {
	if (!validIdent(relType)) { callback(`connectToStandard: invalid relType '${relType}'`); return; }
	const keyName = resolveStandardKeyName();
	const cypher =
		`MATCH (u:UserContent {userNodeId:$uid}) ` +
		`MATCH (s {${keyName}:$key}) ` +
		`MERGE (u)-[r:${relType}]->(s) RETURN type(r) AS relType, s.${keyName} AS targetKey`;
	userGraphDb.runQuery(cypher, { uid: fromUserNodeId, key: standardKey }, (qErr, rows) => {
		if (qErr) { callback(`connectToStandard failed: ${qErr}`); return; }
		if (!rows || rows.length === 0) {
			callback(`connectToStandard: user node not found, or no standard with ${keyName}='${standardKey}'`);
			return;
		}
		callback('', rows[0]);
	});
};

// ---------------------------------------------------------------------------
// connectUserNodes — link two user nodes (both :UserContent, by userNodeId).
const connectUserNodes = ({ userGraphDb, fromUserNodeId, toUserNodeId, relType }, callback) => {
	if (!validIdent(relType)) { callback(`connectUserNodes: invalid relType '${relType}'`); return; }
	const cypher =
		`MATCH (a:UserContent {userNodeId:$a}) MATCH (b:UserContent {userNodeId:$b}) ` +
		`MERGE (a)-[r:${relType}]->(b) RETURN type(r) AS relType`;
	userGraphDb.runQuery(cypher, { a: fromUserNodeId, b: toUserNodeId }, (qErr, rows) => {
		if (qErr) { callback(`connectUserNodes failed: ${qErr}`); return; }
		if (!rows || rows.length === 0) { callback('connectUserNodes: a user node was not found'); return; }
		callback('', rows[0]);
	});
};

// ---------------------------------------------------------------------------
// modifyNode — GUARDED mutate: SET props only on a :UserContent node. Refuses golden.
const modifyNode = ({ userGraphDb, selector, properties }, callback) => {
	let matchClause;
	const params = { props: cleanProps(properties) };
	if (selector && selector.userNodeId) { matchClause = '(n {userNodeId:$sel})'; params.sel = selector.userNodeId; }
	else if (selector && selector.uri) { matchClause = `(n {${resolveStandardKeyName()}:$sel})`; params.sel = selector.uri; }
	else { callback('modifyNode: selector requires userNodeId or uri'); return; }

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
// deleteNode — GUARDED delete: only :UserContent nodes (by userNodeId). Refuses golden.
const deleteNode = ({ userGraphDb, selector }, callback) => {
	const params = {};
	let matchClause;
	if (selector && selector.userNodeId) { matchClause = '(n {userNodeId:$sel})'; params.sel = selector.userNodeId; }
	else if (selector && selector.uri) { matchClause = `(n {${resolveStandardKeyName()}:$sel})`; params.sel = selector.uri; }
	else { callback('deleteNode: selector requires userNodeId or uri'); return; }

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
// executeWrite — dispatch one structured write action against a live clone connection.
const executeWrite = ({ userGraphDb, voyageApiKey, action, params }, callback) => {
	const p = params || {};
	switch (action) {
		case 'createNode':
			createNode({ userGraphDb, voyageApiKey, labels: p.labels, properties: p.properties }, callback);
			return;
		case 'connectToStandard':
			connectToStandard({ userGraphDb, fromUserNodeId: p.userNodeId, relType: p.relType, standardKey: p.standardKey || p.standardUri || p.uri }, callback);
			return;
		case 'connectUserNodes':
			connectUserNodes({ userGraphDb, fromUserNodeId: p.fromUserNodeId, toUserNodeId: p.toUserNodeId, relType: p.relType }, callback);
			return;
		case 'modifyNode':
			modifyNode({ userGraphDb, selector: p.selector, properties: p.properties }, callback);
			return;
		case 'deleteNode':
			deleteNode({ userGraphDb, selector: p.selector }, callback);
			return;
		default:
			callback(`write-executor: unknown action '${action}'`);
	}
};

module.exports = {
	executeWrite,
	embedText,
	EMBEDDING_MODEL,
	resolveStandardKeyName,
};
