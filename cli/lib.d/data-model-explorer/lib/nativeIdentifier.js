'use strict';

// nativeIdentifier.js — ⟪lane zbE, E1-1 (census 10, deferred row R6-1)⟫ which property carries each standard's OWN published
// identifier, read from the graph instead of assumed. Each forge stamps StandardDefinition.nativeIdentifierPropertyName
// (graph contract D0, optional; lane A2): CEDS cedsId, the CTDL family uri, Ed-Fi metaEdId; a standard that publishes none
// carries no field. Until this module the DME named one standard's property for every standard
// (STANDARD_NATIVE_IDENTIFIER_PROPERTY_NAME_LIST = ['cedsId']).
//
// Ruled by BRONZE_CROWN (2026-10-23):
//   - the displayed sourceId is the node's OWN standard's native identifier where the node carries it, else stableId (else
//     persistentId, else ''); every payload showing sourceId also carries stableId as its own field;
//   - findMappings' lookup accepts every declared name (additive);
//   - a graph in which NO StandardDefinition carries the field was built before A2 and is REFUSED BY NAME
//     (nativeIdentifierUnstamped): treating it as 'no standard has one' would silently drop CEDS's cedsId.
//
//   NATIVE_IDENTIFIER_DECLARATION_CYPHER                       the one read; rows { sourceKey, nativeIdentifierPropertyName }
//   nativeIdentifierDeclarationVerdictFor(rowList)             PURE -> { declarationList } | { refusalName, reason }
//   sourceIdentifierCypherTextFor(nodeVariableName, declarationList)
//   nativeIdentifierPropertyNameListOf(declarationList)        the distinct declared names, sorted (for lookups)
//
// Both names are written INTO Cypher text, so each is checked against a plain-identifier grammar first and a value outside
// it is refused by name (nativeIdentifierDeclarationInvalid); nothing from the graph reaches a query unchecked.

const NATIVE_IDENTIFIER_DECLARATION_CYPHER = 'MATCH (d:StandardDefinition) RETURN d.sourceKey AS sourceKey, d.nativeIdentifierPropertyName AS nativeIdentifierPropertyName ORDER BY sourceKey';

const PROPERTY_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SOURCE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
// the identifiers every node may fall back to, in order, after its standard's own
const FALLBACK_IDENTIFIER_PROPERTY_NAME_LIST = Object.freeze(['stableId', 'persistentId']);

// nativeIdentifierDeclarationVerdictFor — the StandardDefinition rows -> the declarations, or the reason they cannot be used
const nativeIdentifierDeclarationVerdictFor = (rowList) => {
	const declaredRowList = rowList.filter((oneRow) => oneRow.nativeIdentifierPropertyName !== null && oneRow.nativeIdentifierPropertyName !== undefined);
	if (rowList.length === 0) {
		return { refusalName: 'nativeIdentifierUnstamped', reason: 'this graph holds no :StandardDefinition, so no standard declares its native identifier property' };
	}
	if (declaredRowList.length === 0) {
		return { refusalName: 'nativeIdentifierUnstamped', reason: `none of this graph's ${rowList.length} :StandardDefinition nodes carries nativeIdentifierPropertyName: it was built before the forges stamped it (educoreForge zeroBacklog lane A2); rebuild it, or read it with a reader from its own era` };
	}
	const invalidTextList = declaredRowList
		.filter((oneRow) => typeof oneRow.sourceKey !== 'string' || !SOURCE_KEY_PATTERN.test(oneRow.sourceKey) || typeof oneRow.nativeIdentifierPropertyName !== 'string' || !PROPERTY_NAME_PATTERN.test(oneRow.nativeIdentifierPropertyName))
		.map((oneRow) => `${JSON.stringify(oneRow.sourceKey)} -> ${JSON.stringify(oneRow.nativeIdentifierPropertyName)}`);
	if (invalidTextList.length) {
		return { refusalName: 'nativeIdentifierDeclarationInvalid', reason: `StandardDefinition native identifier declaration(s) outside the identifier grammar: ${invalidTextList.join('; ')}` };
	}
	return { declarationList: declaredRowList.map((oneRow) => Object.freeze({ sourceKey: oneRow.sourceKey, nativeIdentifierPropertyName: oneRow.nativeIdentifierPropertyName })) };
};

// sourceIdentifierCypherTextFor — a node's source identifier as the endpoints and mappers return it (sourceId): its OWN
// standard's native identifier where declared and carried, else stableId, else persistentId, else ''
const sourceIdentifierCypherTextFor = (nodeVariableName, declarationList) => {
	if (!PROPERTY_NAME_PATTERN.test(nodeVariableName)) {
		throw new Error(`nativeIdentifier.sourceIdentifierCypherTextFor: node variable must be a plain identifier (got ${JSON.stringify(nodeVariableName)})`);
	}
	if (!Array.isArray(declarationList) || declarationList.length === 0) {
		throw new Error('nativeIdentifier.sourceIdentifierCypherTextFor: needs the graph\'s declarationList (nativeIdentifierDeclarationVerdictFor); a reader without one would assume an identifier');
	}
	const nativeCaseText = `CASE ${nodeVariableName}._source ${declarationList.map((oneDeclaration) => `WHEN '${oneDeclaration.sourceKey}' THEN ${nodeVariableName}.${oneDeclaration.nativeIdentifierPropertyName}`).join(' ')} END`;
	return `coalesce(${[nativeCaseText, ...FALLBACK_IDENTIFIER_PROPERTY_NAME_LIST.map((propertyName) => `${nodeVariableName}.${propertyName}`)].join(', ')}, '')`;
};

const nativeIdentifierPropertyNameListOf = (declarationList) => [...new Set(declarationList.map((oneDeclaration) => oneDeclaration.nativeIdentifierPropertyName))].sort();

module.exports = {
	NATIVE_IDENTIFIER_DECLARATION_CYPHER,
	nativeIdentifierDeclarationVerdictFor,
	sourceIdentifierCypherTextFor,
	nativeIdentifierPropertyNameListOf,
	FALLBACK_IDENTIFIER_PROPERTY_NAME_LIST,
};
