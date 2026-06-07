'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[ReEmitSerializer]]
// @concept: [[Replay]]
//
// re-emit.js — the keystone (design doc 04 + 05). The durable artifact is a
// DETERMINISTIC, IDEMPOTENT Cypher state script that asserts the CURRENT state of a
// user's layer (MERGE/SET, never CREATE), with standard references externalized by the
// stable business key (`uri`) and embeddings inlined as literal vectors. Replaying it
// into a fresh clone of the CURRENT golden reconstructs the layer exactly; a standard
// element that moved between golden versions is detected as a DANGLING reference,
// collected and surfaced — never silently dropped.

const { resolveStandardKeyName } = require('./write-executor');

const SERIALIZER_VERSION = '1';
const STMT_BOUNDARY = '\n/*STMT-BOUNDARY*/\n';
const PLACEHOLDER_MARKER = 'pending re-emit';

// ---------------------------------------------------------------------------
// Deterministic Cypher literal helpers

const toCypherValue = (v) => {
	if (v === null || v === undefined) return 'null';
	if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	if (Array.isArray(v)) return '[' + v.map(toCypherValue).join(',') + ']';
	if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
	return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
};

// A property map literal with keys in canonical (sorted) order.
const toMapLiteral = (obj) => {
	const keys = Object.keys(obj).sort();
	return '{' + keys.map((k) => `${k}:${toCypherValue(obj[k])}`).join(', ') + '}';
};

const labelClause = (labels) => labels.slice().sort().map((l) => `:${l}`).join('');

// ---------------------------------------------------------------------------
// reEmit — walk the live user layer, produce { stateScript, userNodeCount,
// relationshipCount } deterministically. callback(err, result)
const reEmit = ({ userGraphDb, embeddingModelVersion, goldenVersionAuthoredAgainst }, callback) => {
	const keyName = resolveStandardKeyName();

	const nodeQuery =
		// Include the UserGraphIdentity init node: it now carries a stable userNodeId and is
		// seeded once at create (MERGE ON CREATE in getUserGraph), so saving + replaying it makes
		// the graph's name DURABLE content rather than a per-load runtime stamp.
		`MATCH (n:UserContent) ` +
		`RETURN n.userNodeId AS userNodeId, labels(n) AS labels, properties(n) AS props ` +
		`ORDER BY n.userNodeId`;

	userGraphDb.runQuery(nodeQuery, {}, (nErr, nodeRows) => {
		if (nErr) { callback(`re-emit (nodes) failed: ${nErr}`); return; }

		const relQuery =
			`MATCH (a)-[r]->(b) ` +
			`WHERE (a:UserContent OR b:UserContent) ` +
			`RETURN a.userNodeId AS aUser, a.${keyName} AS aKey, ('UserContent' IN labels(a)) AS aIsUser, ` +
			`type(r) AS relType, properties(r) AS relProps, ` +
			`b.userNodeId AS bUser, b.${keyName} AS bKey, ('UserContent' IN labels(b)) AS bIsUser ` +
			`ORDER BY coalesce(a.userNodeId, a.${keyName}), type(r), coalesce(b.userNodeId, b.${keyName})`;

		userGraphDb.runQuery(relQuery, {}, (rErr, relRows) => {
			if (rErr) { callback(`re-emit (relationships) failed: ${rErr}`); return; }

			const statements = [];

			// 1) user node MERGEs (sorted by userNodeId), embeddings inline
			(nodeRows || []).forEach((row) => {
				const setProps = Object.assign({}, row.props);
				delete setProps.userNodeId; // it is the MERGE key
				statements.push(
					`MERGE (n${labelClause(row.labels)} {userNodeId:${toCypherValue(row.userNodeId)}}) ` +
					`SET n += ${toMapLiteral(setProps)}`,
				);
			});

			// 2) relationships incident to user nodes; standard endpoints externalized by key
			let relationshipCount = 0;
			(relRows || []).forEach((row) => {
				const relType = row.relType;
				if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(relType)) return; // defensive
				const relMap = toMapLiteral(row.relProps || {});
				relationshipCount++;

				if (row.aIsUser && row.bIsUser) {
					statements.push(
						`MATCH (a:UserContent {userNodeId:${toCypherValue(row.aUser)}}) ` +
						`MATCH (b:UserContent {userNodeId:${toCypherValue(row.bUser)}}) ` +
						`MERGE (a)-[r:${relType}]->(b) SET r += ${relMap}`,
					);
					return;
				}

				// user -> standard
				if (row.aIsUser && !row.bIsUser) {
					statements.push(
						`MATCH (a:UserContent {userNodeId:${toCypherValue(row.aUser)}}) ` +
						`OPTIONAL MATCH (b {${keyName}:${toCypherValue(row.bKey)}}) ` +
						`FOREACH (_ IN CASE WHEN b IS NULL THEN [] ELSE [1] END | MERGE (a)-[r:${relType}]->(b) SET r += ${relMap}) ` +
						`RETURN ${toCypherValue(row.bKey)} AS danglingKey, (b IS NULL) AS dangling, ` +
						`${toCypherValue(row.aUser)} AS fromUserNodeId, ${toCypherValue(relType)} AS relType`,
					);
					return;
				}

				// standard -> user
				if (!row.aIsUser && row.bIsUser) {
					statements.push(
						`MATCH (b:UserContent {userNodeId:${toCypherValue(row.bUser)}}) ` +
						`OPTIONAL MATCH (a {${keyName}:${toCypherValue(row.aKey)}}) ` +
						`FOREACH (_ IN CASE WHEN a IS NULL THEN [] ELSE [1] END | MERGE (a)-[r:${relType}]->(b) SET r += ${relMap}) ` +
						`RETURN ${toCypherValue(row.aKey)} AS danglingKey, (a IS NULL) AS dangling, ` +
						`${toCypherValue(row.bUser)} AS fromUserNodeId, ${toCypherValue(relType)} AS relType`,
					);
					return;
				}
				// standard -> standard: not user-authored in v1; skip.
				relationshipCount--;
			});

			const userNodeCount = (nodeRows || []).length;
			const header =
				`// === USER GRAPH STATE SCRIPT ===\n` +
				`// serializerVersion: ${SERIALIZER_VERSION}\n` +
				`// embeddingModelVersion: ${embeddingModelVersion || ''}\n` +
				`// goldenVersionAuthoredAgainst: ${goldenVersionAuthoredAgainst || ''}\n` +
				`// userNodeCount: ${userNodeCount}\n` +
				`// relationshipCount: ${relationshipCount}\n` +
				`// standardKeyName: ${keyName}`;

			const stateScript = statements.length
				? `${header}\n${statements.join(STMT_BOUNDARY)}`
				: header;

			callback('', { stateScript, userNodeCount, relationshipCount });
		});
	});
};

// ---------------------------------------------------------------------------
// replayStateScript — run a stored script into a fresh clone, collecting dangling
// references (standard endpoints that no longer resolve). callback(err, result)
const replayStateScript = ({ userGraphDb, stateScript }, callback) => {
	if (!stateScript || stateScript.indexOf(PLACEHOLDER_MARKER) !== -1) {
		// Empty / placeholder layer — nothing to replay.
		callback('', { danglingRefs: [], statementsRun: 0 });
		return;
	}

	// Strip the leading comment header, split into individual statements.
	const body = stateScript
		.split('\n')
		.filter((line) => line.indexOf('//') !== 0)
		.join('\n');
	const statements = body.split(STMT_BOUNDARY).map((s) => s.trim()).filter(Boolean);

	const danglingRefs = [];
	let idx = 0;

	const runNext = () => {
		if (idx >= statements.length) {
			callback('', { danglingRefs, statementsRun: statements.length });
			return;
		}
		const stmt = statements[idx++];
		userGraphDb.runQuery(stmt, {}, (err, rows) => {
			if (err) { callback(`replay failed on statement ${idx}: ${err}`); return; }
			// Statements that externalize a standard endpoint RETURN a dangling flag.
			(rows || []).forEach((row) => {
				if (row && row.dangling === true) {
					danglingRefs.push({
						standardKey: row.danglingKey,
						fromUserNodeId: row.fromUserNodeId,
						relType: row.relType,
					});
				}
			});
			runNext();
		});
	};

	runNext();
};

// ---------------------------------------------------------------------------
// State scripts are single-quote-heavy Cypher; the SQLite saveObject path doubles
// single quotes when storing TEXT, which corrupts the script on read-back. Store the
// script base64-encoded (no quotes) so it round-trips losslessly. One encode at the
// store boundary, one decode at every read.
const encodeStateScript = (s) => Buffer.from(s || '', 'utf8').toString('base64');
const decodeStateScript = (s) => {
	if (!s) return '';
	// A real re-emit always begins with the comment header; if it already looks like
	// plain script (legacy/empty), return as-is rather than mis-decoding.
	if (s.indexOf('//') === 0 || s.indexOf('MERGE') !== -1) return s;
	try { return Buffer.from(s, 'base64').toString('utf8'); } catch (e) { return s; }
};

module.exports = {
	reEmit,
	replayStateScript,
	encodeStateScript,
	decodeStateScript,
	PLACEHOLDER_MARKER,
	SERIALIZER_VERSION,
};
