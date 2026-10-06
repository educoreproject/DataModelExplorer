'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[ReEmitSerializer]]
// @concept: [[Replay]]
//
// re-emit.js — the keystone (design doc 04 + 05). The durable artifact is a
// DETERMINISTIC, IDEMPOTENT Cypher state script that asserts the CURRENT state of a
// user's layer (MERGE/SET, never CREATE), with standard references externalized by the
// contract's standard key (userLinkTargetRule.standardKeyName, stableId). Replaying it
// into a fresh clone of the CURRENT golden reconstructs the layer exactly; a standard
// element that moved between golden versions is detected as a DANGLING reference,
// collected and surfaced — never silently dropped.
//
// Campaign P2 (W-E-5/6/7): edges are captured BY THEIR STAMP (r.userAuthored = true), so a
// user edge between two standard nodes survives too; the layer is text-only, so no vector
// is carried; a script written under a RETIRED standard key ('uri', serializer 1) is
// rewritten to the current key on replay, and a key named in neither list is refused.

const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { USER_LINK_TARGET_RULE, USER_EMBEDDING_RULE, userEdgeStampOf } = require('./user-layer-contract');

const SERIALIZER_VERSION = '2';
const STMT_BOUNDARY = '\n/*STMT-BOUNDARY*/\n';
const PLACEHOLDER_MARKER = 'pending re-emit';
const STANDARD_KEY_HEADER_PREFIX = '// standardKeyName: ';

// Node properties a text-only layer does not carry forward (old writers stamped them).
const VECTOR_PROPERTY_NAME_LIST = ['embedding', 'embeddingModelVersion'];

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

// One endpoint of a captured edge: a user node is MATCHed by userNodeId; a standard node is OPTIONAL MATCHed by the
// contract's key on the contract's label, so a standard that left the golden reads as dangling instead of failing.
const endpointClauseFor = ({ alias, isUser, userNodeId, standardKey }) => {
	const { standardKeyName, targetLabel } = USER_LINK_TARGET_RULE;
	return isUser
		? { clause: `MATCH (${alias}:UserContent {userNodeId:${toCypherValue(userNodeId)}})`, isOptional: false }
		: { clause: `OPTIONAL MATCH (${alias}:${targetLabel} {${standardKeyName}:${toCypherValue(standardKey)}})`, isOptional: true, alias, standardKey };
};

const edgeStatementFor = (row) => {
	const endpointList = [
		endpointClauseFor({ alias: 'a', isUser: row.aIsUser, userNodeId: row.aUser, standardKey: row.aKey }),
		endpointClauseFor({ alias: 'b', isUser: row.bIsUser, userNodeId: row.bUser, standardKey: row.bKey }),
	];
	const matchText = endpointList.filter((one) => !one.isOptional).concat(endpointList.filter((one) => one.isOptional)).map((one) => one.clause).join(' ');
	const mergeText = `MERGE (a)-[r:${row.relType}]->(b) SET r += ${toMapLiteral(row.relProps || {})}`;
	const optionalList = endpointList.filter((one) => one.isOptional);
	if (optionalList.length === 0) {
		return `${matchText} ${mergeText}`;
	}
	const allPresentText = optionalList.map((one) => `${one.alias} IS NOT NULL`).join(' AND ');
	const danglingListText = '[k IN [' + optionalList.map((one) => `CASE WHEN ${one.alias} IS NULL THEN ${toCypherValue(one.standardKey)} END`).join(', ') + '] WHERE k IS NOT NULL]';
	return (
		`${matchText} ` +
		`FOREACH (_ IN CASE WHEN ${allPresentText} THEN [1] ELSE [] END | ${mergeText}) ` +
		`RETURN ${danglingListText} AS danglingKeyList, ` +
		`${toCypherValue(row.aIsUser ? row.aUser : row.bUser)} AS fromUserNodeId, ${toCypherValue(row.relType)} AS relType`
	);
};

// ---------------------------------------------------------------------------
// reEmit — walk the live user layer, produce { stateScript, userNodeCount,
// relationshipCount } deterministically. callback(err, result)
const reEmit = ({ userGraphDb, goldenVersionAuthoredAgainst }, callback) => {
	if (!goldenVersionAuthoredAgainst) {
		callback('re-emit: goldenVersionAuthoredAgainst is required (the manifestRefId on the clone\'s GraphProvenance)');
		return;
	}
	const { standardKeyName } = USER_LINK_TARGET_RULE;

	const nodeQuery =
		// Include the UserGraphIdentity init node: it now carries a stable userNodeId and is
		// seeded once at create (MERGE ON CREATE in getUserGraph), so saving + replaying it makes
		// the graph's name DURABLE content rather than a per-load runtime stamp.
		`MATCH (n:UserContent) ` +
		`RETURN n.userNodeId AS userNodeId, labels(n) AS labels, properties(n) AS props ` +
		`ORDER BY n.userNodeId`;

	userGraphDb.runQuery(nodeQuery, {}, (nErr, nodeRows) => {
		if (nErr) { callback(`re-emit (nodes) failed: ${nErr}`); return; }

		// The stamp is the capture rule: every user-made edge carries userAuthored, whatever its endpoints.
		const relQuery =
			`MATCH (a)-[r]->(b) ` +
			`WHERE r.userAuthored = true ` +
			`RETURN a.userNodeId AS aUser, a.${standardKeyName} AS aKey, ('UserContent' IN labels(a)) AS aIsUser, ` +
			`type(r) AS relType, properties(r) AS relProps, ` +
			`b.userNodeId AS bUser, b.${standardKeyName} AS bKey, ('UserContent' IN labels(b)) AS bIsUser ` +
			`ORDER BY coalesce(a.userNodeId, a.${standardKeyName}), type(r), coalesce(b.userNodeId, b.${standardKeyName}), r.userEdgeRefId`;

		userGraphDb.runQuery(relQuery, {}, (rErr, relRows) => {
			if (rErr) { callback(`re-emit (relationships) failed: ${rErr}`); return; }

			const unsafeRelTypeList = (relRows || []).map((row) => row.relType).filter((relType) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(relType));
			if (unsafeRelTypeList.length > 0) {
				callback(`re-emit: relationship type(s) not expressible in a state script: ${unsafeRelTypeList.join(', ')}`);
				return;
			}

			const nodeStatementList = (nodeRows || []).map((row) => {
				const setProps = Object.assign({}, row.props);
				delete setProps.userNodeId; // it is the MERGE key
				VECTOR_PROPERTY_NAME_LIST.forEach((onePropertyName) => delete setProps[onePropertyName]);
				return `MERGE (n${labelClause(row.labels)} {userNodeId:${toCypherValue(row.userNodeId)}}) SET n += ${toMapLiteral(setProps)}`;
			});
			const edgeStatementList = (relRows || []).map(edgeStatementFor);
			const statements = nodeStatementList.concat(edgeStatementList);

			const userNodeCount = nodeStatementList.length;
			const relationshipCount = edgeStatementList.length;
			const header =
				`// === USER GRAPH STATE SCRIPT ===\n` +
				`// serializerVersion: ${SERIALIZER_VERSION}\n` +
				`// userVectorPolicy: ${USER_EMBEDDING_RULE.userVectorPolicy}\n` +
				`// goldenVersionAuthoredAgainst: ${goldenVersionAuthoredAgainst}\n` +
				`// userNodeCount: ${userNodeCount}\n` +
				`// relationshipCount: ${relationshipCount}\n` +
				`${STANDARD_KEY_HEADER_PREFIX}${standardKeyName}`;

			const stateScript = statements.length
				? `${header}\n${statements.join(STMT_BOUNDARY)}`
				: header;

			callback('', { stateScript, userNodeCount, relationshipCount });
		});
	});
};

// ---------------------------------------------------------------------------
// statementPlanFor — split a stored script into runnable statements under the CURRENT standard key. A script written
// under a retired key (serializer 1 wrote 'uri' on unlabeled endpoints) has its standard endpoints rewritten; this is
// sound because uri = stableId wherever uri exists (CEDS, the only standard such a script could have linked). A key in
// neither list, or statements with no key named at all, is refused: guessing would bind the wrong nodes.
const statementPlanFor = (stateScript) => {
	const lineList = stateScript.split('\n');
	const headerLine = lineList.find((line) => line.indexOf(STANDARD_KEY_HEADER_PREFIX) === 0);
	const body = lineList.filter((line) => line.indexOf('//') !== 0).join('\n');
	const statementList = body.split(STMT_BOUNDARY).map((s) => s.trim()).filter(Boolean);
	if (statementList.length === 0) {
		return { statementList, scriptStandardKeyName: headerLine ? headerLine.slice(STANDARD_KEY_HEADER_PREFIX.length).trim() : '' };
	}
	if (!headerLine) {
		return { refusal: 'replayStateScript: the state script names no standardKeyName; refusing to guess its standard key' };
	}
	const scriptStandardKeyName = headerLine.slice(STANDARD_KEY_HEADER_PREFIX.length).trim();
	const { standardKeyName, targetLabel, retiredStandardKeyNameList } = USER_LINK_TARGET_RULE;
	if (scriptStandardKeyName === standardKeyName) {
		return { statementList, scriptStandardKeyName };
	}
	if (retiredStandardKeyNameList.indexOf(scriptStandardKeyName) === -1) {
		return { refusal: `replayStateScript: standardKeyName '${scriptStandardKeyName}' is neither the contract's '${standardKeyName}' nor a retired key (${retiredStandardKeyNameList.join(', ')})` };
	}
	const retiredEndpointPattern = new RegExp(`\\((a|b) \\{${scriptStandardKeyName}:`, 'g');
	const rewrittenList = statementList.map((oneStatement) => oneStatement.replace(retiredEndpointPattern, (wholeMatch, alias) => `(${alias}:${targetLabel} {${standardKeyName}:`));
	return { statementList: rewrittenList, scriptStandardKeyName };
};

const danglingRefsFromRow = (row) => {
	if (!row) return [];
	if (Array.isArray(row.danglingKeyList)) {
		return row.danglingKeyList.map((standardKey) => ({ standardKey, fromUserNodeId: row.fromUserNodeId, relType: row.relType }));
	}
	// serializer 1 statements return a single danglingKey with a dangling flag
	return row.dangling === true ? [{ standardKey: row.danglingKey, fromUserNodeId: row.fromUserNodeId, relType: row.relType }] : [];
};

// ---------------------------------------------------------------------------
// replayStateScript — run a stored script into a fresh clone, collecting dangling
// references (standard endpoints that no longer resolve), then bring a layer written by an
// older serializer up to the contract: stamp its unstamped user edges with the owner and
// remove the vectors a text-only layer does not carry. callback(err, result)
const replayStateScript = ({ userGraphDb, stateScript, userRefId }, callback) => {
	if (!stateScript || stateScript.indexOf(PLACEHOLDER_MARKER) !== -1) {
		// Empty / placeholder layer — nothing to replay.
		callback('', { danglingRefs: [], statementsRun: 0, legacyEdgeStampedCount: 0, vectorStrippedCount: 0 });
		return;
	}
	if (!userRefId) {
		callback('replayStateScript: userRefId is required (the owner every unstamped user edge is stamped with)');
		return;
	}
	const { statementList, scriptStandardKeyName, refusal } = statementPlanFor(stateScript);
	if (refusal) { callback(refusal); return; }

	const taskList = new taskListPlus();

	taskList.push((args, next) => {
		const danglingRefs = [];
		const runStatementAt = (statementIndex) => {
			if (statementIndex >= statementList.length) {
				next('', { ...args, danglingRefs });
				return;
			}
			userGraphDb.runQuery(statementList[statementIndex], {}, (err, rows) => {
				if (err) { next(`replay failed on statement ${statementIndex + 1}: ${err}`, args); return; }
				(rows || []).forEach((row) => danglingRefsFromRow(row).forEach((oneRef) => danglingRefs.push(oneRef)));
				runStatementAt(statementIndex + 1);
			});
		};
		runStatementAt(0);
	});

	// every edge incident to a :UserContent node in a clone is user-made by construction (the golden has none)
	taskList.push((args, next) => {
		const unstampedQuery =
			'MATCH (a)-[r]->(b) WHERE (a:UserContent OR b:UserContent) AND r.userAuthored IS NULL ' +
			'RETURN elementId(r) AS relElementId ORDER BY relElementId';
		userGraphDb.runQuery(unstampedQuery, {}, (err, rows) => {
			if (err) { next(`replay legacy-edge census failed: ${err}`, args); return; }
			const stampRowList = (rows || []).map((row) => ({ relElementId: row.relElementId, userEdgeStamp: userEdgeStampOf({ userRefId }).userEdgeStamp }));
			if (stampRowList.length === 0) { next('', { ...args, legacyEdgeStampedCount: 0 }); return; }
			userGraphDb.runQuery(
				'UNWIND $stampRowList AS stampRow MATCH ()-[r]->() WHERE elementId(r) = stampRow.relElementId SET r += stampRow.userEdgeStamp RETURN count(r) AS stampedCount',
				{ stampRowList },
				(sErr, sRows) => {
					if (sErr) { next(`replay legacy-edge stamp failed: ${sErr}`, args); return; }
					next('', { ...args, legacyEdgeStampedCount: Number(((sRows || [])[0] || {}).stampedCount || 0) });
				},
			);
		});
	});

	taskList.push((args, next) => {
		const vectorPredicate = VECTOR_PROPERTY_NAME_LIST.map((onePropertyName) => `n.${onePropertyName} IS NOT NULL`).join(' OR ');
		const removeList = VECTOR_PROPERTY_NAME_LIST.map((onePropertyName) => `n.${onePropertyName}`).join(', ');
		userGraphDb.runQuery(`MATCH (n:UserContent) WHERE ${vectorPredicate} REMOVE ${removeList} RETURN count(n) AS strippedCount`, {}, (err, rows) => {
			if (err) { next(`replay vector strip failed: ${err}`, args); return; }
			next('', { ...args, vectorStrippedCount: Number(((rows || [])[0] || {}).strippedCount || 0) });
		});
	});

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) { callback(err); return; }
		callback('', {
			danglingRefs: args.danglingRefs,
			statementsRun: statementList.length,
			scriptStandardKeyName,
			legacyEdgeStampedCount: args.legacyEdgeStampedCount,
			vectorStrippedCount: args.vectorStrippedCount,
		});
	});
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
	STMT_BOUNDARY,
	statementPlanFor,
};
