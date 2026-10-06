'use strict';

// toolPayloadContract.js — the ONE declaration of what every dme_* verb returns (CONTRACTS-declared-100626 §14; W-D-1,
// campaign P0, 2026-10-06). Read by the verbs (dataModelExplorerSearch.js), by provider.json's description gate and by
// test/tool-payload-contract.test.js. Pure data plus one pure builder; nothing here touches Neo4j.
//
// A REFUSAL is a correct answer about the INPUT (an empty argument, a mode that cannot run, a query that is not read-only,
// a verb asked for what the build does not hold). It is written to STDOUT as JSON with exit 0, so askMilo receives it as a
// tool_result it can quote (supervisor ruling 1, 2026-10-06). An ERROR (the tool could not run: no embedder, no vector
// index, Neo4j down, a failing query) stays on stderr with exit 1 and reaches askMilo as is_error — ruling C unchanged.
//
// P0 declares the refusal half and the row-list field names. The list envelope (LIST_ENVELOPE_FIELD_LIST) is declared
// here but EMITTED by no verb yet: each verb's true totalRowCount needs its own counting Cypher (W-D-6..W-D-11, P1).

const REFUSAL_FIELD_LIST = Object.freeze(['refusedByName', 'refusalName', 'reason', 'validValueList']); // validValueList optional
const LIST_ENVELOPE_FIELD_LIST = Object.freeze(['totalRowCount', 'returnedRowCount', 'truncatedRowCount']);
const REFUSAL_CHANNEL = 'stdout-json-exit-0';
const ERROR_CHANNEL = 'stderr-exit-1';
const LIVE_SOURCE_LIST_CYPHER = 'MATCH (n:ForgedNode) WHERE n._source IS NOT NULL RETURN DISTINCT n._source AS source ORDER BY source';

// verb -> the field its rows will live under (P1) and the refusals it may answer, by name
const VERB_PAYLOAD_CONTRACT = Object.freeze({
	search: Object.freeze({ rowListFieldName: 'resultList', refusalNameList: Object.freeze(['emptyQuery', 'unknownStandard']) }),
	graphRetriever: Object.freeze({ rowListFieldName: 'hitList', refusalNameList: Object.freeze(['emptyQuery', 'invalidLimit', 'invalidSearchMode', 'traversalModeRemoved']) }),
	findMappings: Object.freeze({ rowListFieldName: 'mappingRowList', refusalNameList: Object.freeze(['emptyName', 'nothingMatched']) }),
	compareCodesets: Object.freeze({ rowListFieldName: 'valueRowList', refusalNameList: Object.freeze(['emptyName', 'noOptionSetMatched', 'valuesNotJudgedInThisBuild']) }),
	unmappedFields: Object.freeze({ rowListFieldName: 'unmappedRowList', refusalNameList: Object.freeze(['unknownStandard']) }),
	stats: Object.freeze({ rowListFieldName: null, refusalNameList: Object.freeze([]) }),
	listStandards: Object.freeze({ rowListFieldName: 'standards', refusalNameList: Object.freeze([]) }),
	explore: Object.freeze({ rowListFieldName: 'entryList', refusalNameList: Object.freeze(['emptyName', 'unknownStandard', 'nothingMatched']) }),
	history: Object.freeze({ rowListFieldName: 'passportList', refusalNameList: Object.freeze(['unknownPassportField']) }), // shape owned by V2-C04
	describeGraph: Object.freeze({ rowListFieldName: null, refusalNameList: Object.freeze(['passportShapeNotRecognised']) }), // owned by V2-C01
	rawCypher: Object.freeze({ rowListFieldName: 'records', refusalNameList: Object.freeze(['emptyQuery', 'notReadOnly']) }), // notReadOnly: X1, the read-only validator
});

// refusalFor — the refusal object, exactly REFUSAL_FIELD_LIST; a refusal name the verb does not declare is a programming
// error and throws by name (the contract is what makes two refusals of one verb tell apart)
const refusalFor = (verbName, refusalName, reason, validValueList) => {
	const verbRow = VERB_PAYLOAD_CONTRACT[verbName];
	if (!verbRow) {
		throw new Error(`toolPayloadContract.refusalFor: '${verbName}' is not a verb VERB_PAYLOAD_CONTRACT declares`);
	}
	if (verbRow.refusalNameList.indexOf(refusalName) === -1) {
		throw new Error(`toolPayloadContract.refusalFor: '${refusalName}' is not a refusal '${verbName}' declares (${verbRow.refusalNameList.join(', ')})`);
	}
	return { refusedByName: verbName, refusalName, reason, ...(validValueList ? { validValueList } : {}) };
};

module.exports = Object.freeze({
	REFUSAL_FIELD_LIST,
	LIST_ENVELOPE_FIELD_LIST,
	REFUSAL_CHANNEL,
	ERROR_CHANNEL,
	LIVE_SOURCE_LIST_CYPHER,
	VERB_PAYLOAD_CONTRACT,
	refusalFor,
});
