'use strict';

// rater-graph.js — the CEDS Rater's ONE way to reach a graph: the container NAMED by the DME's gold (⟪lane zbE, E4⟫
// dataModelExplorerSearch.goldenContainerName, passed in by the caller),
// resolved by container-connection-resolver, opened read-only. Used by the server (data-model.js) and by the
// rater-tool CLI scripts, so both read the same frozen gold the same way.
//
// openRaterGraph({ goldenContainerName, queryTimeoutMs }, callback(errText, { raterGraph } | { refusal }))
//   raterGraph = { goldenContainerName, runQuery(cypher, params, callback(errText, rowList)), close() }
//   refusal    = { refusalName, refusalText }: the named container is absent from config or cannot be resolved.
//                There is no alternative path: the tool never reads whatever the DME points at.
//
// Needs process.global.xLog (neo4j-instance logs bad Cypher through it).

const { resolveContainerConnection } = require('../user-graph/container-connection-resolver');

const RATER_GRAPH_REFUSAL_NAME_LIST = Object.freeze(['raterGoldenContainerNotConfigured', 'raterGoldenContainerUnresolvable', 'raterGoldenContainerUnreachable']);

const refusalOf = (refusalName, refusalText) => {
	if (RATER_GRAPH_REFUSAL_NAME_LIST.indexOf(refusalName) === -1) {
		throw new Error(`rater-graph: '${refusalName}' is not one of ${RATER_GRAPH_REFUSAL_NAME_LIST.join(', ')}`);
	}
	return { refusal: { refusalName, refusalText: `CEDS Rater: ${refusalText}` } };
};

const openRaterGraph = ({ goldenContainerName, queryTimeoutMs, resolveConnection = resolveContainerConnection }, callback) => {
	if (typeof goldenContainerName !== 'string' || goldenContainerName.trim() === '') {
		callback('', refusalOf('raterGoldenContainerNotConfigured', 'no gold was named (the DME\'s dataModelExplorerSearch.goldenContainerName); the tool reads only the DME\'s gold, and none was given.'));
		return;
	}
	if (!Number.isFinite(queryTimeoutMs) || queryTimeoutMs <= 0) {
		callback(`rater-graph: queryTimeoutMs must be a positive number of milliseconds; got ${queryTimeoutMs}`);
		return;
	}
	const connection = resolveConnection(goldenContainerName);
	if (connection.error) {
		callback('', refusalOf('raterGoldenContainerUnresolvable', `the configured gold '${goldenContainerName}' cannot be reached (${connection.errorName}: ${connection.error}). The tool does not read any other graph.`));
		return;
	}
	const neo4jGen = require('../neo4j-instance/neo4j-instance')({ unused: true });
	neo4jGen.initDatabaseInstance({ neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password, readOnly: true, queryTimeoutMs }, (initError, neo4jDb) => {
		if (initError) {
			callback('', refusalOf('raterGoldenContainerUnreachable', `the configured gold '${goldenContainerName}' resolved to ${connection.boltUri} but did not answer (${initError}).`));
			return;
		}
		callback('', { raterGraph: { goldenContainerName, runQuery: neo4jDb.runQuery, close: neo4jDb.close } });
	});
};

module.exports = { openRaterGraph, RATER_GRAPH_REFUSAL_NAME_LIST };
