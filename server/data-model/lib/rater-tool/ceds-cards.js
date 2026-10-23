'use strict';

// ceds-cards.js — the CEDS Rater's reads of CEDS cards from the named gold, shared by the build scripts (suggested.json)
// and the server (search, browse, card lookup), so a card read at build time and one read live are the same card.
//
// A CARD is one property-tier :HubReference tuple: Class → Property (Qualifier). Value-tier tuples (code values) are not
// cards. Every read answers callback(errText, result) and takes a raterGraph from rater-graph.js.
//
//   readCardsByTupleIdList({ raterGraph, cedsTupleIdList }, cb)  -> cardList, in the order asked, unknown ids left out
//   readCardsByCedsId({ raterGraph, cedsId }, cb)                 -> cardList (every tuple of that P-id)
//   readCardsOfClass({ raterGraph, classCedsId }, cb)              -> cardList (every tuple whose class is that C-id)
//   readClassInfo({ raterGraph, classCedsId }, cb)                 -> { classCedsId, className, classDefinition, conceptName } | null
//   readConceptList({ raterGraph }, cb)                            -> [{ conceptName, conceptDefinition, classCount }] + classTotal
//   readClassesOfConcept({ raterGraph, conceptName }, cb)          -> [{ classCedsId, className, classDefinition, cardCount }]
//   resolveSearchIndexNames({ raterGraph }, cb)                    -> { fulltextIndexName, vectorIndexName }
//   searchByWords({ raterGraph, fulltextIndexName, queryText, wordJoinName, windowSize }, cb) -> ranked cedsTupleIdList
//   searchByMeaning({ raterGraph, vectorIndexName, embedding, windowSize }, cb)                -> ranked cedsTupleIdList
//   cardSignatureOf(card) -> the text that makes two cards identical (class + property + qualifiers)
//
// searchByWords — BM25 over the gold's ONE fulltext index (:ForgedNode(name, description)), held to CEDS property nodes
//   (name = the property name, description = its definition); each property hit, best first, expands to its card tuples
//   (class name, then qualifier order). HubReference nodes carry no description, so searching them directly would match
//   property names only. Words are escaped by the DME's own escapeLuceneQueryText; wordJoinName 'and' is the DME's rule
//   (every word, keywordQueryTextFor), 'or' is Lucene's default (any word, more matching words rank higher).
// searchByMeaning — the DME's vector index (:ForgedNode(embedding)), held to property-tier HubReference nodes OF THE CEDS
//   HUB, whose embedding is of class · property · definition · class definition · qualifier. ⟪lane zbE, E4⟫ on a graph with
//   a second hub the index also holds CTDL property-tier cards; unfiltered, 2 of an element's 15 meaning hits were CTDL
//   cards on GOLD_EVAL_261023_zeroBacklog (measured), which this CEDS-only tool would have shown as broken CEDS cards.

const { escapeLuceneQueryText, keywordQueryTextFor } = require('../../../../cli/lib.d/data-model-explorer/lib/hybridRetrieval');

const OPTION_VALUE_LIST_CAP = 40;
const CEDS_ELEMENT_URL_PREFIX = 'https://ceds.ed.gov/element/';

// the card fields, read from a bound property-tier tuple `tuple`
const CARD_RETURN_TEXT = `
	OPTIONAL MATCH (tuple)-[:HAS_CEDS_DOMAIN]->(cardClass:CedsClass)
	OPTIONAL MATCH (tuple)-[:HAS_CEDS_PROPERTY]->(cardProperty:CedsProperty)
	OPTIONAL MATCH (cardProperty)-[:HAS_OPTION_SET]->(optionSet:CedsOptionSet)
	OPTIONAL MATCH (optionSet)-[:HAS_VALUE]->(optionValue)
	WITH tuple, cardClass, cardProperty, optionSet, optionValue ORDER BY optionValue.name
	WITH tuple, cardClass, cardProperty, optionSet, collect(optionValue.name) AS optionValueNameList
	RETURN tuple.stableId AS cedsTupleId, coalesce(cardClass.name, tuple.domainName) AS className, coalesce(cardClass.cedsId, tuple.domainId) AS classCedsId,
	       coalesce(cardClass.definition, tuple.domainDefinition) AS classDefinition, tuple.propertyName AS propertyName,
	       coalesce(tuple.qualifierNames, []) AS qualifierNameList, coalesce(cardProperty.cedsId, tuple.propertyKey) AS cedsId,
	       coalesce(tuple.propertyDefinition, cardProperty.definition) AS definition, optionSet.name AS optionSetName,
	       optionValueNameList[0..${OPTION_VALUE_LIST_CAP}] AS optionValueList, size(optionValueNameList) AS optionValueCount`;

// a lookup by stableId goes through :ForgedNode, whose stableId is the indexed unique (forgedNodeStableIdUnique); the same
// MATCH on :HubReference scans all ~94,600 tuples per id
const PROPERTY_TUPLE_TEXT = "tuple:HubReference {referenceTier: 'property'}";

const CYPHER_BY_READ = Object.freeze({
	byTupleIdList: `UNWIND range(0, size($cedsTupleIdList) - 1) AS askedPosition
		MATCH (tuple:ForgedNode {stableId: $cedsTupleIdList[askedPosition]}) WHERE tuple:HubReference AND tuple.referenceTier = 'property'
		WITH tuple, askedPosition ORDER BY askedPosition ${CARD_RETURN_TEXT}`,
	byCedsId: `MATCH (${PROPERTY_TUPLE_TEXT}) WHERE tuple.propertyKey = $cedsId
		WITH tuple ORDER BY tuple.domainName, coalesce(tuple.qualifierNames, []) ${CARD_RETURN_TEXT}`,
	ofClass: `MATCH (${PROPERTY_TUPLE_TEXT})-[:HAS_CEDS_DOMAIN]->(:CedsClass {cedsId: $classCedsId})
		WITH tuple ORDER BY tuple.propertyName, coalesce(tuple.qualifierNames, []) ${CARD_RETURN_TEXT}`,
	conceptList: `MATCH (concept:CedsConceptualConcept)
		OPTIONAL MATCH (cedsClass:CedsClass)-[:HAS_PRIMARY_CONCEPT]->(concept)
		RETURN concept.name AS conceptName, concept.definition AS conceptDefinition, concept.conceptOrdinal AS conceptOrdinal, count(cedsClass) AS classCount
		ORDER BY conceptOrdinal`,
	classTotal: "MATCH (cedsClass:CedsClass) WHERE NOT cedsClass:StandardLayer RETURN count(cedsClass) AS classTotal, sum(CASE WHEN (cedsClass)-[:HAS_PRIMARY_CONCEPT]->() THEN 1 ELSE 0 END) AS classWithConceptTotal",
	classesOfConcept: `MATCH (concept:CedsConceptualConcept {name: $conceptName})
		OPTIONAL MATCH (cedsClass:CedsClass)-[:HAS_PRIMARY_CONCEPT]->(concept)
		OPTIONAL MATCH (tuple:HubReference {referenceTier: 'property'})-[:HAS_CEDS_DOMAIN]->(cedsClass)
		WITH concept, cedsClass, count(tuple) AS cardCount
		RETURN concept.name AS conceptName, collect(CASE WHEN cedsClass IS NULL THEN null ELSE { classCedsId: cedsClass.cedsId, className: cedsClass.name, classDefinition: cedsClass.definition, cardCount: cardCount } END) AS classList`,
	classInfo: `MATCH (cedsClass:CedsClass {cedsId: $classCedsId}) WHERE NOT cedsClass:StandardLayer
		OPTIONAL MATCH (cedsClass)-[:HAS_PRIMARY_CONCEPT]->(concept:CedsConceptualConcept)
		RETURN cedsClass.cedsId AS classCedsId, cedsClass.name AS className, cedsClass.definition AS classDefinition, concept.name AS conceptName LIMIT 1`,
	searchIndexList: "SHOW INDEXES YIELD name, type, labelsOrTypes, properties WHERE type IN ['FULLTEXT', 'VECTOR'] RETURN name, type, labelsOrTypes, properties",
	byWords: `CALL db.index.fulltext.queryNodes($fulltextIndexName, $luceneQueryText) YIELD node, score
		WHERE node:CedsProperty AND node._source = 'CEDS' AND NOT node:StandardLayer
		WITH node, score ORDER BY score DESC, node.stableId LIMIT $propertyWindowSize
		WITH collect(node) AS propertyList
		UNWIND range(0, size(propertyList) - 1) AS propertyRank
		WITH propertyList[propertyRank] AS cedsProperty, propertyRank
		MATCH (tuple:HubReference {referenceTier: 'property'})-[:HAS_CEDS_PROPERTY]->(cedsProperty)
		WITH tuple, propertyRank ORDER BY propertyRank, tuple.domainName, coalesce(tuple.qualifierNames, []), tuple.stableId
		RETURN collect(tuple.stableId)[0..$windowSize] AS cedsTupleIdList`,
	byMeaning: `CALL db.index.vector.queryNodes($vectorIndexName, $vectorCandidateCount, $embedding) YIELD node, score
		WHERE node:HubReference AND node.referenceTier = 'property' AND node.hubName = 'CEDS'
		WITH node, score ORDER BY score DESC, node.stableId LIMIT $windowSize
		RETURN collect(node.stableId) AS cedsTupleIdList`,
});

// how many property hits the words search expands, and how deep the vector index is asked, to fill a window of tuples:
// property-tier tuples are 2,777 of the ~94,600 HubReference nodes, so the vector index is asked far past the window
const WORDS_PROPERTY_WINDOW_FACTOR = 2;
const MEANING_VECTOR_CANDIDATE_FACTOR = 400;
const WORD_JOIN_TEXT_BY_NAME = Object.freeze({
	and: (queryText) => keywordQueryTextFor(queryText),
	or: (queryText) =>
		`${queryText}`
			.split(/\s+/)
			.filter((oneWord) => oneWord !== '')
			.map((oneWord) => (/^(AND|OR|NOT)$/.test(oneWord) ? oneWord.toLowerCase() : escapeLuceneQueryText(oneWord)))
			.join(' OR '),
});

const toCard = (row) => ({
	cedsTupleId: row.cedsTupleId,
	className: row.className,
	classCedsId: row.classCedsId,
	classDefinition: row.classDefinition,
	propertyName: row.propertyName,
	qualifierNameList: row.qualifierNameList || [],
	cedsId: row.cedsId || null,
	definition: row.definition,
	optionSetName: row.optionSetName || null,
	optionValueList: row.optionValueList || [],
	optionValueCount: row.optionValueCount || 0,
	cedsUrl: row.cedsId && /^P\d+$/.test(row.cedsId) ? `${CEDS_ELEMENT_URL_PREFIX}${row.cedsId.slice(1)}` : null,
});

const cardSignatureOf = (card) => JSON.stringify([card.className, card.propertyName, card.qualifierNameList.slice().sort()]);

const readCardList = (raterGraph, cypherText, parameterObject, callback) => {
	raterGraph.runQuery(cypherText, parameterObject, (queryError, rowList) => (queryError ? callback(`reading CEDS cards failed: ${queryError}`) : callback('', rowList.map(toCard))));
};

const readCardsByTupleIdList = ({ raterGraph, cedsTupleIdList }, callback) => {
	if (!Array.isArray(cedsTupleIdList) || cedsTupleIdList.length === 0) {
		callback('', []);
		return;
	}
	readCardList(raterGraph, CYPHER_BY_READ.byTupleIdList, { cedsTupleIdList }, callback);
};
const readCardsByCedsId = ({ raterGraph, cedsId }, callback) => readCardList(raterGraph, CYPHER_BY_READ.byCedsId, { cedsId }, callback);
const readCardsOfClass = ({ raterGraph, classCedsId }, callback) => readCardList(raterGraph, CYPHER_BY_READ.ofClass, { classCedsId }, callback);

// readClassInfo — one class by C-id, with its primary Conceptual Model concept (for Browse's breadcrumb); null when none
const readClassInfo = ({ raterGraph, classCedsId }, callback) => {
	raterGraph.runQuery(CYPHER_BY_READ.classInfo, { classCedsId }, (queryError, rowList) => (queryError ? callback(`reading the class '${classCedsId}' failed: ${queryError}`) : callback('', rowList[0] || null)));
};

const readConceptList = ({ raterGraph }, callback) => {
	raterGraph.runQuery(CYPHER_BY_READ.conceptList, {}, (conceptError, conceptRowList) => {
		if (conceptError) {
			callback(`reading the CEDS concepts failed: ${conceptError}`);
			return;
		}
		raterGraph.runQuery(CYPHER_BY_READ.classTotal, {}, (totalError, totalRowList) => {
			if (totalError) {
				callback(`counting the CEDS classes failed: ${totalError}`);
				return;
			}
			callback('', {
				conceptList: conceptRowList.map((row) => ({ conceptName: row.conceptName, conceptDefinition: row.conceptDefinition, classCount: row.classCount })),
				classTotal: totalRowList[0].classTotal,
				classWithConceptTotal: totalRowList[0].classWithConceptTotal,
			});
		});
	});
};

const readClassesOfConcept = ({ raterGraph, conceptName }, callback) => {
	raterGraph.runQuery(CYPHER_BY_READ.classesOfConcept, { conceptName }, (queryError, rowList) => {
		if (queryError) {
			callback(`reading the classes of '${conceptName}' failed: ${queryError}`);
			return;
		}
		if (rowList.length === 0) {
			callback('', { refusal: { refusalName: 'unknownConcept', refusalText: `CEDS has no Conceptual Model concept named '${conceptName}'.` } });
			return;
		}
		const classList = rowList[0].classList.filter(Boolean).sort((classA, classB) => (classA.className < classB.className ? -1 : classA.className > classB.className ? 1 : 0));
		callback('', { conceptName, classList });
	});
};

// the fulltext and vector index the DME searches: exactly one fulltext index and one vector index on :ForgedNode(embedding)
const resolveSearchIndexNames = ({ raterGraph }, callback) => {
	raterGraph.runQuery(CYPHER_BY_READ.searchIndexList, {}, (queryError, rowList) => {
		if (queryError) {
			callback(`listing the gold's search indexes failed: ${queryError}`);
			return;
		}
		const fulltextRowList = rowList.filter((row) => row.type === 'FULLTEXT' && (row.labelsOrTypes || []).indexOf('ForgedNode') !== -1);
		const vectorRowList = rowList.filter((row) => row.type === 'VECTOR' && (row.labelsOrTypes || []).indexOf('ForgedNode') !== -1 && (row.properties || []).indexOf('embedding') !== -1);
		if (fulltextRowList.length !== 1 || vectorRowList.length !== 1) {
			callback('', { refusal: { refusalName: 'searchIndexAbsent', refusalText: `the gold carries ${fulltextRowList.length} fulltext and ${vectorRowList.length} vector indexes on :ForgedNode; the search needs exactly one of each.` } });
			return;
		}
		callback('', { fulltextIndexName: fulltextRowList[0].name, vectorIndexName: vectorRowList[0].name });
	});
};

const searchByWords = ({ raterGraph, fulltextIndexName, queryText, wordJoinName, windowSize }, callback) => {
	const wordJoinText = WORD_JOIN_TEXT_BY_NAME[wordJoinName];
	if (!wordJoinText) {
		callback(`ceds-cards.searchByWords: wordJoinName must be one of ${Object.keys(WORD_JOIN_TEXT_BY_NAME).join(', ')}; got '${wordJoinName}'`);
		return;
	}
	const luceneQueryText = wordJoinText(queryText);
	if (luceneQueryText === '') {
		callback('', []);
		return;
	}
	raterGraph.runQuery(
		CYPHER_BY_READ.byWords,
		{ fulltextIndexName, luceneQueryText, windowSize: neo4jInteger(windowSize), propertyWindowSize: neo4jInteger(windowSize * WORDS_PROPERTY_WINDOW_FACTOR) },
		(queryError, rowList) => (queryError ? callback(`the words search failed: ${queryError}`) : callback('', rowList.length > 0 ? rowList[0].cedsTupleIdList : [])),
	);
};

const searchByMeaning = ({ raterGraph, vectorIndexName, embedding, windowSize }, callback) => {
	raterGraph.runQuery(
		CYPHER_BY_READ.byMeaning,
		{ vectorIndexName, embedding, windowSize: neo4jInteger(windowSize), vectorCandidateCount: neo4jInteger(windowSize * MEANING_VECTOR_CANDIDATE_FACTOR) },
		(queryError, rowList) => (queryError ? callback(`the meaning search failed: ${queryError}`) : callback('', rowList.length > 0 ? rowList[0].cedsTupleIdList : [])),
	);
};

// LIMIT and the vector index's k need Cypher integers, not JS floats
const neo4jInteger = (countNumber) => require('neo4j-driver').int(Math.floor(countNumber));

module.exports = {
	readCardsByTupleIdList,
	readCardsByCedsId,
	readCardsOfClass,
	readClassInfo,
	readConceptList,
	readClassesOfConcept,
	resolveSearchIndexNames,
	searchByWords,
	searchByMeaning,
	cardSignatureOf,
	CEDS_ELEMENT_URL_PREFIX,
};
