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
// P0 declared the refusal half and the row-list field names. P1 (W-D-2..W-D-21, W-E-1..W-E-3) emits the list envelope
// (LIST_ENVELOPE_FIELD_LIST) from every list verb, each totalRowCount from the verb's own counting Cypher, and declares
// here every list, cap and rule the verbs, the Slack card and the askMilo report read.

const REFUSAL_FIELD_LIST = Object.freeze(['refusedByName', 'refusalName', 'reason', 'validValueList']); // validValueList optional
const LIST_ENVELOPE_FIELD_LIST = Object.freeze(['totalRowCount', 'returnedRowCount', 'truncatedRowCount', 'rowUnit']);
const REFUSAL_CHANNEL = 'stdout-json-exit-0';
const ERROR_CHANNEL = 'stderr-exit-1';
const LIVE_SOURCE_LIST_CYPHER = 'MATCH (n:ForgedNode) WHERE n._source IS NOT NULL RETURN DISTINCT n._source AS source ORDER BY source';

// verb -> the field its rows live under and the refusals it may answer, by name. Every verb may answer unknownFlag: the
// CLI refuses a flag, switch or argument VERB_INPUT_CONTRACT does not give the verb (W-D-20).
const VERB_PAYLOAD_CONTRACT = Object.freeze({
	// ⟪campaign P2, V2-C28⟫ the two vector verbs also answer graphEmbeddingContract's refusals (the passport and the embedder)
	search: Object.freeze({ rowUnitText: 'a node the vector index returned: one row per node, nearest first', rowListFieldName: 'resultList', refusalNameList: Object.freeze(['unknownFlag', 'emptyQuery', 'unknownStandard', 'passportAbsent', 'passportShapeNotRecognised', 'graphContractMismatch', 'graphHasNoVectors', 'embedderMismatch', 'vectorIndexNotInPassport']) }),
	graphRetriever: Object.freeze({ rowUnitText: 'a node the vector search hit, with its traversal context: one row per hit node', rowListFieldName: 'hitList', refusalNameList: Object.freeze(['unknownFlag', 'emptyQuery', 'invalidLimit', 'invalidSearchMode', 'traversalModeRemoved', 'passportAbsent', 'passportShapeNotRecognised', 'graphContractMismatch', 'graphHasNoVectors', 'embedderMismatch', 'vectorIndexNotInPassport']) }),
	findMappings: Object.freeze({ rowUnitText: "a mapping VIEW: one row per (direction, element, CEDS tuple, relation, via-relation). Rows are not edges: one graph edge can be more than one row (as 'incoming' through the CEDS leaf AND as 'equivalent' through another matched element), and an instanced element (SIF Question, PESC element) is ONE row for all of its instances. hubTupleSummaryList counts the edges and the elements", rowListFieldName: 'mappingRowList', refusalNameList: Object.freeze(['unknownFlag', 'emptyName', 'nothingMatched']) }),
	compareCodesets: Object.freeze({ rowUnitText: 'an option value of a matched option set: one row per value', rowListFieldName: 'valueRowList', refusalNameList: Object.freeze(['unknownFlag', 'emptyName', 'noOptionSetMatched']) }),
	unmappedFields: Object.freeze({ rowUnitText: 'a DmeProperty with no match edge on itself or on any of its instances: one row per property', rowListFieldName: 'unmappedRowList', refusalNameList: Object.freeze(['unknownFlag', 'unknownStandard', 'invalidLimit']) }),
	stats: Object.freeze({ rowListFieldName: null, refusalNameList: Object.freeze(['unknownFlag']) }),
	listStandards: Object.freeze({ rowUnitText: 'a standard root (:DmeStandardRoot): one row per standard', rowListFieldName: 'standards', refusalNameList: Object.freeze(['unknownFlag']) }),
	explore: Object.freeze({ rowUnitText: 'a node bearing the name: one entry per node (stableId)', rowListFieldName: 'entryList', refusalNameList: Object.freeze(['unknownFlag', 'emptyName', 'unknownStandard', 'nothingMatched', 'invalidNameMatch', 'invalidLimit']) }),
	// ⟪campaign P2, V2-C04⟫ history answers the ONE passport (it is not an event log); its refusals are passportReader's
	history: Object.freeze({ rowUnitText: 'the passport: always one row', rowListFieldName: 'passportList', refusalNameList: Object.freeze(['unknownFlag', 'passportAbsent', 'passportShapeNotRecognised', 'graphContractMismatch']) }),
	// ⟪campaign P2, V2-C01..C03⟫ describeGraph reads the passport, recipe, lineage, standards and attestations by contract
	describeGraph: Object.freeze({ rowListFieldName: null, refusalNameList: Object.freeze(['unknownFlag', 'passportAbsent', 'passportShapeNotRecognised', 'graphContractMismatch', 'recipeShapeNotRecognised', 'standardDefinitionShapeNotRecognised', 'attestationShapeNotRecognised', 'invalidLimit']) }),
	rawCypher: Object.freeze({ rowUnitText: 'a record your Cypher returned', rowListFieldName: 'records', refusalNameList: Object.freeze(['unknownFlag', 'emptyQuery', 'notReadOnly']) }), // notReadOnly: X1, the read-only validator
	calculate: Object.freeze({ rowListFieldName: null, refusalNameList: Object.freeze(['unknownFlag', 'unknownOperation', 'invalidNumberList', 'emptyNumberList', 'divisionByZero']) }), // A14
});

// W-D-20: what each verb takes. The CLI parser walks this table (no if/else chain) and refuses any other flag by name;
// provider.json's input_schema for the verb's tool must name exactly positionalList ∪ flagList. A flag listed in
// retiredFlagRefusalByName is refused with its own refusal name and reason. integerFlagList values are refused when not a positive
// integer.
const VERB_INPUT_CONTRACT = Object.freeze({
	search: Object.freeze({ positionalList: Object.freeze(['query']), flagList: Object.freeze(['standard']) }),
	graphRetriever: Object.freeze({ positionalList: Object.freeze(['query']), flagList: Object.freeze(['limit', 'searchMode']), integerFlagList: Object.freeze(['limit']), retiredFlagRefusalByName: Object.freeze({ traversalMode: Object.freeze({ refusalName: 'traversalModeRemoved', reasonText: "the 'dynamic' mode was never built, and graphRetriever always runs traversal.cypher" }) }) }),
	explore: Object.freeze({ positionalList: Object.freeze([]), flagList: Object.freeze(['name', 'standard', 'nameMatch']) }),
	// ⟪campaign P2, V2-C04⟫ history answers the ONE passport: a limit over one row would be a flag that does nothing
	history: Object.freeze({ positionalList: Object.freeze([]), flagList: Object.freeze([]), integerFlagList: Object.freeze([]) }),
	findMappings: Object.freeze({ positionalList: Object.freeze(['name']), flagList: Object.freeze([]) }),
	compareCodesets: Object.freeze({ positionalList: Object.freeze(['name']), flagList: Object.freeze([]) }),
	unmappedFields: Object.freeze({ positionalList: Object.freeze([]), flagList: Object.freeze(['standard', 'limit']), integerFlagList: Object.freeze(['limit']) }),
	stats: Object.freeze({ positionalList: Object.freeze([]), flagList: Object.freeze([]) }),
	listStandards: Object.freeze({ positionalList: Object.freeze([]), flagList: Object.freeze([]) }),
	describeGraph: Object.freeze({ positionalList: Object.freeze([]), flagList: Object.freeze(['limit']), integerFlagList: Object.freeze(['limit']) }),
	rawCypher: Object.freeze({ positionalList: Object.freeze([]), flagList: Object.freeze(['query']) }),
	calculate: Object.freeze({ positionalList: Object.freeze([]), flagList: Object.freeze(['operation', 'numberList']) }),
});
// the default a verb's flag takes when it is not given (declared, so -help and the parser read one source)
const VERB_FLAG_DEFAULT_BY_VERB = Object.freeze({
	graphRetriever: Object.freeze({ limit: '10', searchMode: 'hybrid' }),
	explore: Object.freeze({ nameMatch: 'exact' }),
	history: Object.freeze({}),
	unmappedFields: Object.freeze({ limit: '50' }),
});

// W-D-2 / A5 (ruled 2026-10-06): a `standard` filter takes a live `_source` value. A family name (StandardDefinition
// .standardFamily) expands to its releases; until the forges stamp standardFamily (P3) no family exists, so a family name
// is refused by name with the valid list. A family is NEVER derived from a _source prefix.
const STANDARD_FILTER_FAMILY_RULE_LIST = Object.freeze(['expandFamilyToReleases', 'refuseFamilyNamingReleases']);
const STANDARD_FILTER_FAMILY_RULE = 'expandFamilyToReleases';
const STANDARD_FAMILY_LIST_CYPHER = 'MATCH (d:StandardDefinition) WHERE d.standardFamily IS NOT NULL RETURN d.standardFamily AS family, collect(d.sourceKey) AS sourceList ORDER BY family';
// W-D-9 / W-D-8 / W-D-5: the hub is read from the graph, never assumed; exactly one HubDefinition or a refusal
const HUB_STANDARD_SOURCE_CYPHER = 'MATCH (h:HubDefinition) RETURN h._source AS hubSource, h.hubName AS hubName';
// A10 (ruled 2026-10-06): the hub does not map to itself, so it is excluded from "unmapped" and from coverage and its
// property count is reported beside them
const UNMAPPED_HUB_POLICY = 'excludeHub';

// W-D-5: the hub decomposes through one edge per slot, HAS_<HUBNAME>_<SLOT>. Both incoming arms (traversal.cypher and
// findMappings) read ALL slots; test/hub-slot-list-shared.test.js holds the list equal to the forge's.
// ⟪campaign P2⟫ no longer an interim copy: the graph contract carries the hub slot list (graphContract.json hubSlotList,
// emitted from educoreForge vocabulary HUB_DECOMPOSITION_SLOTS), so the DME reads the forge's own declaration
const HUB_DECOMPOSITION_SLOT_LIST = Object.freeze(require('../contract/graphContract.json').hubSlotList.slice());
const hubDecompositionEdgeTypeList = (hubName) => {
	if (typeof hubName !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(hubName)) {
		throw new Error(`toolPayloadContract.hubDecompositionEdgeTypeList: hubName must be a plain identifier from HubDefinition.hubName (got ${JSON.stringify(hubName)})`);
	}
	return HUB_DECOMPOSITION_SLOT_LIST.map((slotName) => `HAS_${hubName.toUpperCase()}_${slotName}`);
};

// W-D-3: a traversal mapping list holds only real match edges — toId / hubKey is never null in any entry
const TRAVERSAL_MAPPING_LIST_NAME_LIST = Object.freeze(['mappingsOutgoing', 'crossStandardEquivalents', 'mappingsIncoming', 'instanceView.mappingsViaInstances']);
// W-D-4 / campaign P3 (S3 as ruled: the forge normalises SIF's Field -> Codeset to HAS_OPTION_SET and names the codesets;
// the DME keeps the instance hop). CONSTRAINED_BY no longer exists in any graph this DME reads.
const OPTION_SET_EDGE_TYPE_LIST = Object.freeze(['HAS_OPTION_SET']);
const INTRA_STANDARD_REFERENCE_EDGE_TYPE_LIST = Object.freeze(['REFERENCES', 'REFERENCES_TYPE', 'REFERENCES_OBJECT']);

// W-D-6 / W-D-7: findMappings matches a node by any of these; two rows are the same mapping when these agree. The
// element is identified by its stableId (fromStableId), not by source + name: Ed-Fi alone holds three distinct BirthDate
// properties, which a name identity would fold into one (the plan's list did; corrected in P1, DEVLOG-P1 W-D-7).
const FIND_MAPPINGS_IDENTIFIER_FIELD_LIST = Object.freeze(['_id', 'path', 'stableId', 'cedsId']);
// ⟪campaign P4a, Q9 (acceptance iteration 2)⟫ an INSTANCE (DmeInstance) whose meaning is in its path — SIF
// …/RaceList/Race/Code, a Field named Code — is invisible to a name lookup. findMappings also matches an instance by a
// segment of its CONTEXT PATH: the path inside its group, above its own name (the leaf is its name, already matched).
// The first rule whose field the instance carries is used: SIF Fields carry relativePath (the path inside their object);
// PESC occurrences carry path, whose first segment is the document root (a segment every occurrence of the document
// shares, so it is dropped: 'CollegeTranscript' must not match all 1,367). A DmeInstance carrying neither is unsearchable
// by path; test/find-mappings-instance-path.test.js measures that none is.
const INSTANCE_CONTEXT_PATH_RULE_LIST = Object.freeze([
	Object.freeze({ pathFieldName: 'relativePath', leadingSegmentDropCount: 0 }),
	Object.freeze({ pathFieldName: 'path', leadingSegmentDropCount: 1 }),
]);
// the groups (SIF objects, PESC sections) of the matched instances, per standard, at most this many named
const MATCHED_INSTANCE_GROUP_LIST_CAP = 200;
const FIND_MAPPINGS_ROW_IDENTITY_FIELD_LIST = Object.freeze(['direction', 'fromStableId', 'toId', 'mappingType', 'viaMatchType']);

// ⟪campaign P4a, Q1 (acceptance iteration 2)⟫ askMilo read "94 rows, 60 EXACT" for Birthdate as if they were mappings; the
// graph holds 71 match edges into P000033. Both were right about different UNITS. Every count field findMappings answers is
// named here with its unit, the payload carries this table as countUnitByField, and test/find-mappings-count-units.test.js
// fails on any count field it does not name.
const FIND_MAPPINGS_COUNT_UNIT_BY_FIELD = Object.freeze({
	matchedNodeCount: 'NODES the input matched (by name, by identifier, or by a segment of an instance context path); a SIF Question and each of its Fields are separate nodes',
	instancePathMatchedNodeCount: 'NODES (instances) matched ONLY by a segment of their context path, not by name or identifier — e.g. SIF …/RaceList/Race/Code for race',
	matchedInstanceCount: "INSTANCES of this standard matched, directly or as an instance of a matched declaration",
	matchedInstanceGroupCount: 'GROUPS (SIF objects / PESC sections) holding a matched instance; groupList names at most MATCHED_INSTANCE_GROUP_LIST_CAP',
	totalRowCount: 'ROWS (rowUnit): mapping views, not edges',
	returnedRowCount: 'ROWS shown in mappingRowList',
	truncatedRowCount: 'ROWS not shown',
	totalRowCountByRelation: 'ROWS per relation; a row belongs to the relation of its weaker hop (broad/narrow, then close, else exact)',
	truncatedRowCountByRelation: 'ROWS per relation not shown',
	totalRowCountByRelationAndStandard: 'ROWS per relation and source standard',
	truncatedRowCountByRelationAndStandard: 'ROWS per relation and source standard not shown',
	totalRowCountByDirection: 'ROWS per direction; one graph edge can appear under more than one direction',
	hubTupleCount: 'CEDS TUPLES (HubReferences) the rows reach; hubTupleSummaryList shows at most HUB_TUPLE_SUMMARY_CAP of them, most edges first',
	edgeCount: 'EDGES: match edges in the graph into this CEDS tuple, each counted once, from any element (not only the matched ones)',
	edgeCountByRelation: 'EDGES into this CEDS tuple per relation',
	elementCount: 'ELEMENTS: distinct elements with a match edge into this tuple; an instanced element (SIF Question, PESC element) counts ONCE for all its instances',
	elementCountByRelation: 'ELEMENTS per relation',
	instanceEdgeCount: 'EDGES into this tuple carried by instances (SIF Fields, PESC occurrences) rather than by the element itself',
	instanceCount: "INSTANCES (SIF Fields / PESC occurrences) carrying this row's verdict",
	instanceGroupCount: 'GROUPS (SIF objects / PESC sections) holding those instances; instanceGroupList shows at most 25',
	viaInstanceCount: "INSTANCES of the queried element carrying the near hop's verdict",
	viaInstanceGroupCount: 'GROUPS holding those instances',
});
// the edges into every tuple a findMappings answer reaches, counted from the graph (not from the rows)
const HUB_TUPLE_SUMMARY_CAP = 25;
const HUB_TUPLE_SUMMARY_CYPHER = `
	MATCH (hub:HubReference) WHERE hub.canonicalKey IN $toIdList
	MATCH (subject:ForgedNode)-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub)
	WITH hub, type(m) AS relation, subject, head([(declaration:ForgedNode)-[:HAS_INSTANCE]->(subject) | declaration]) AS subjectDeclaration
	RETURN hub.canonicalKey AS toId, hub.name AS toName, relation, count(*) AS edgeCount,
	       count(DISTINCT coalesce(subjectDeclaration, subject)) AS elementCount, count(subjectDeclaration) AS instanceEdgeCount,
	       collect(DISTINCT coalesce(subjectDeclaration, subject).stableId) AS elementStableIdList
	ORDER BY toId, relation`;

// W-D-8: compareCodesets says whether the build judged option values at all; the verdict is read from the graph
const COMPARE_CODESETS_VERDICT_LIST = Object.freeze(['judged', 'valuesNotJudgedInThisBuild']);
const COMPARE_CODESETS_ROW_CAP = 100;
const VALUE_TIER_JUDGMENT_COUNT_CYPHER = "MATCH (:ForgedNode {role: 'DmeOptionValue'})-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference) RETURN count(m) AS valueTierJudgmentCount";

// W-D-10: a filtered search over-fetches from the vector index, then pages
const SEARCH_PAGE_SIZE = 20;
const SEARCH_OVER_FETCH_FACTOR = 50;
const SEARCH_OVER_FETCH_CAP = 1000;

// W-D-11 / W-D-12: explore answers ONE entry per node, keyed by stableId; a name lookup is exact unless asked otherwise,
// and an exact lookup always reports its case-variant siblings
const EXPLORE_ENTRY_IDENTITY_FIELD = 'stableId';
const EXPLORE_EDGE_CAP = 200;
const NAME_MATCH_MODE_LIST = Object.freeze(['exact', 'caseInsensitive']);

// A14 (ruled 2026-10-06): dme_calculate — arithmetic over numbers the model already holds, so no number it states is its
// own sum. The operations it knows, and how many numbers each needs.
const CALCULATE_OPERATION_ARITY_BY_NAME = Object.freeze({
	count: Object.freeze({ minimumNumberCount: 0 }),
	sum: Object.freeze({ minimumNumberCount: 1 }),
	average: Object.freeze({ minimumNumberCount: 1 }),
	minimum: Object.freeze({ minimumNumberCount: 1 }),
	maximum: Object.freeze({ minimumNumberCount: 1 }),
	difference: Object.freeze({ exactNumberCount: 2 }),
	ratio: Object.freeze({ exactNumberCount: 2 }),
	percent: Object.freeze({ exactNumberCount: 2 }),
});

// W-E-1 / W-E-2: the Slack element card
const SLACK_ELEMENT_CARD_TUPLE_FIELD_LIST = Object.freeze(['mappingType', 'confidence', 'mappingKind', 'mappingSource', 'hubName', 'hubKey', 'cedsDomain', 'cedsProperty', 'cedsRange', 'carriedBy', 'instanceGroupList', 'instanceCount']);
const SLACK_CARD_CARRIED_BY_LIST = Object.freeze(['own', 'instance']); // 'own' = edge on the carded node; 'instance' = on a HAS_INSTANCE child
const SLACK_LOOKUP_LIMITS = Object.freeze({ searchPageSize: 8, cardLimit: 3, tupleLinesShown: 4, peerLinesShown: 6 });
const SLACK_LOOKUP_SEARCH_ROW_FIELD_LIST = Object.freeze(['stableId', 'name', 'source', 'role', 'description']);
const SLACK_CARDABLE_ROLE_LIST = Object.freeze(['DmeProperty', 'DmeClass', 'DmeOptionSet', 'DmeOptionValue']); // declarations, never instances (DmeInstance since campaign P3)

// W-E-3: askMilo's single-call JSON report (formatters/json.js writes it; the Slack relay refuses a report lacking any of
// these). Why the model stopped is open-ended (the API's stop_reason, or askMilo's own maxToolIterations); which stops
// make an answer CUT OFF is askMilo's lib/stopReason.js table.
const ASK_MILO_SINGLE_CALL_REPORT_FIELD_LIST = Object.freeze(['mode', 'promptName', 'prompt', 'response', 'stopReason', 'answerCutOff', 'cost', 'model', 'elapsedSeconds']);

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

// listEnvelopeFor — the §14 list payload: { <rowListFieldName>: rows, totalRowCount, returnedRowCount, truncatedRowCount }.
// totalRowCount must come from the verb's own counting Cypher; a total smaller than the rows shown is a programming error.
const listEnvelopeFor = (verbName, rowList, totalRowCount) => {
	const verbRow = VERB_PAYLOAD_CONTRACT[verbName];
	if (!verbRow || !verbRow.rowListFieldName) {
		throw new Error(`toolPayloadContract.listEnvelopeFor: '${verbName}' declares no row list`);
	}
	if (!Number.isInteger(totalRowCount) || totalRowCount < rowList.length) {
		throw new Error(`toolPayloadContract.listEnvelopeFor: ${verbName} totalRowCount ${totalRowCount} is not an integer >= the ${rowList.length} rows returned`);
	}
	// ⟪campaign P4a, Q1⟫ every envelope says what its rows ARE, so a total is never read as a count of something else
	if (typeof verbRow.rowUnitText !== 'string' || verbRow.rowUnitText === '') {
		throw new Error(`toolPayloadContract.listEnvelopeFor: '${verbName}' declares no rowUnitText — a total must say what it counts`);
	}
	return { [verbRow.rowListFieldName]: rowList, totalRowCount, returnedRowCount: rowList.length, truncatedRowCount: totalRowCount - rowList.length, rowUnit: verbRow.rowUnitText };
};

module.exports = Object.freeze({
	REFUSAL_FIELD_LIST,
	LIST_ENVELOPE_FIELD_LIST,
	REFUSAL_CHANNEL,
	ERROR_CHANNEL,
	LIVE_SOURCE_LIST_CYPHER,
	VERB_PAYLOAD_CONTRACT,
	VERB_INPUT_CONTRACT,
	VERB_FLAG_DEFAULT_BY_VERB,
	STANDARD_FILTER_FAMILY_RULE,
	STANDARD_FILTER_FAMILY_RULE_LIST,
	STANDARD_FAMILY_LIST_CYPHER,
	HUB_STANDARD_SOURCE_CYPHER,
	UNMAPPED_HUB_POLICY,
	HUB_DECOMPOSITION_SLOT_LIST,
	hubDecompositionEdgeTypeList,
	TRAVERSAL_MAPPING_LIST_NAME_LIST,
	OPTION_SET_EDGE_TYPE_LIST,
	INTRA_STANDARD_REFERENCE_EDGE_TYPE_LIST,
	FIND_MAPPINGS_IDENTIFIER_FIELD_LIST,
	FIND_MAPPINGS_ROW_IDENTITY_FIELD_LIST,
	FIND_MAPPINGS_COUNT_UNIT_BY_FIELD,
	INSTANCE_CONTEXT_PATH_RULE_LIST,
	MATCHED_INSTANCE_GROUP_LIST_CAP,
	HUB_TUPLE_SUMMARY_CAP,
	HUB_TUPLE_SUMMARY_CYPHER,
	COMPARE_CODESETS_VERDICT_LIST,
	COMPARE_CODESETS_ROW_CAP,
	VALUE_TIER_JUDGMENT_COUNT_CYPHER,
	SEARCH_PAGE_SIZE,
	SEARCH_OVER_FETCH_FACTOR,
	SEARCH_OVER_FETCH_CAP,
	EXPLORE_ENTRY_IDENTITY_FIELD,
	EXPLORE_EDGE_CAP,
	NAME_MATCH_MODE_LIST,
	CALCULATE_OPERATION_ARITY_BY_NAME,
	SLACK_ELEMENT_CARD_TUPLE_FIELD_LIST,
	SLACK_CARD_CARRIED_BY_LIST,
	SLACK_LOOKUP_LIMITS,
	SLACK_LOOKUP_SEARCH_ROW_FIELD_LIST,
	SLACK_CARDABLE_ROLE_LIST,
	ASK_MILO_SINGLE_CALL_REPORT_FIELD_LIST,
	listEnvelopeFor,
	refusalFor,
});
