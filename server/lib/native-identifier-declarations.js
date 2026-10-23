'use strict';

// native-identifier-declarations.js — ⟪lane zbE, E1-1⟫ the server's ONE read of which property carries each standard's own
// identifier (StandardDefinition.nativeIdentifierPropertyName), on the caller's own handle, for the
// endpoints and mappers that show a sourceId. The rule and its refusals live in the DME's lib/nativeIdentifier.js; this
// module only runs its query on the server's handle and turns a refusal into the error text the caller passes on.
//
//   readNativeIdentifierDeclarations({ accessPointsDotD } | { neo4jDb }, callback(errText, declarationList))
//     an endpoint passes its accessPointsDotD (the read goes through dme-cypher-query); an access point passes its neo4jDb
//     errText 'nativeIdentifierUnstamped: …' / 'nativeIdentifierDeclarationInvalid: …' when the graph cannot be read honestly

const { NATIVE_IDENTIFIER_DECLARATION_CYPHER, nativeIdentifierDeclarationVerdictFor } = require('../../cli/lib.d/data-model-explorer/lib/nativeIdentifier');

// the two declared ways a caller reaches the graph, each turned into (cypherText, params, callback(err, rowList))
const RUN_QUERY_BY_HANDLE_NAME = Object.freeze({
	accessPointsDotD: (accessPointsDotD) => (cypherText, queryParams, callback) => accessPointsDotD['dme-cypher-query']({ action: 'query', query: cypherText, params: queryParams }, callback),
	neo4jDb: (neo4jDb) => (cypherText, queryParams, callback) => neo4jDb.runQuery(cypherText, queryParams, callback),
});

const readNativeIdentifierDeclarations = (handleByName, callback) => {
	const handleNameList = Object.keys(RUN_QUERY_BY_HANDLE_NAME).filter((handleName) => handleByName && handleByName[handleName]);
	if (handleNameList.length !== 1) {
		callback(`native-identifier-declarations: pass exactly one of ${Object.keys(RUN_QUERY_BY_HANDLE_NAME).join(', ')} (got ${handleNameList.length ? handleNameList.join(', ') : 'none'})`);
		return;
	}
	const runQuery = RUN_QUERY_BY_HANDLE_NAME[handleNameList[0]](handleByName[handleNameList[0]]);
	runQuery(NATIVE_IDENTIFIER_DECLARATION_CYPHER, {}, (err, rowList) => {
		if (err) {
			callback(`native identifier declarations could not be read: ${err}`);
			return;
		}
		const verdict = nativeIdentifierDeclarationVerdictFor(rowList.filter((oneRow) => !oneRow._truncated));
		if (verdict.refusalName) {
			callback(`${verdict.refusalName}: ${verdict.reason}`);
			return;
		}
		callback('', verdict.declarationList);
	});
};

module.exports = { readNativeIdentifierDeclarations };
