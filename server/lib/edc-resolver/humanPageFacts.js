'use strict';

// humanPageFacts — what an /edc human page shows that its JSON answer does not hold, read from the live golden graph (WORKORDER-edcHumanPages-110926). Read for the
// html form only: the JSON answer is never changed by it.
//
//   humanPageFactsFor({ kind, partByName, edcIri, withReadSession, runCypher, uriForElementInRelease, storeIsOpen, xLog }, done) → done(humanPageFacts), never an error
//     kind: 'element' | 'meaning' (humanPageRules.humanPageKindList); partByName: the parsed URI's parts; edcIri: the URI with no query
//     withReadSession: the golden handle's, or null when this instance has none; uriForElementInRelease({ standardName, standardVersion }) → uriForNode (uriMinter's)
//     element → { usedOnList: [part], usedOnCount, elementMeaningFacts, meaningCardRowListBySectionName: { propertyMeanings, namingMeanings, ownTerm, mappedTo: [cardRow] } }
//       ⟪meaningsClarity, Addendum A⟫ elementMeaningFacts is THE one reader's (elementMeaningFacts.js), the same facts the explorer shows for the element; each section's
//       listed cards are its first humanPageRules.listCap
//     meaning → { tuple, tupleBracketText, rangeIsIdentity } | { tupleAbsentName, tupleBracketText }
//     either  → { factsAbsentName } when the graph cannot say: every way of not knowing is named (a failed read's text goes to the log, not the page)
//     part: { label, uri | uriAbsentReason }   cardRow: { uri, hubName, hubVersion, label, referenceTier, tupleBracketText, slotNameList? | relationType, matchBasis, mappingConfidence }
//
// The graph holds ONE release of each standard, so an element URI naming another release reads nothing here: 'graphHoldsAnotherRelease', never the wrong release's facts.
// A card's tuple is read the way hubCardTuple reads one (its pure cardTupleFactsOf, its bracket), for every listed card in one query.

const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { cardTupleFactsOf, tupleBracketTextOf } = require('../standards-query/hubCardTuple');
const hubCardTupleRules = require('../standards-query/hubCardTupleRules.json');
const { NATIVE_IDENTIFIER_DECLARATION_CYPHER, nativeIdentifierDeclarationVerdictFor, nativeIdentifierCypherTextFor } = require('../../../cli/lib.d/data-model-explorer/lib/nativeIdentifier');
const { HUB_ALL_SLOT_LIST } = require('../../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');
const humanPageRules = require('./humanPageRules.json');
const { elementMeaningFactsFor } = require('./elementMeaningFacts');
// the walk's mapper: its named queries are what the one meaning-facts reader runs, here as in the explorer
const standardsNeighbourhoodMapper = require('../../data-model/data-mapping/mappers/standards-neighbourhood.js')({});

const FACTS_ABSENT_NAME_LIST = Object.freeze(['noLiveGraph', 'storeUnreadable', 'elementNotInLiveGraph', 'graphHoldsAnotherRelease', 'cardNotInLiveGraph', 'factsUnreadable']);

const factsAbsentOf = (absentName) => {
	if (!FACTS_ABSENT_NAME_LIST.includes(absentName)) {
		throw new Error(`humanPageFacts: '${absentName}' is not a declared facts absent name (${FACTS_ABSENT_NAME_LIST.join(', ')})`);
	}
	return { factsAbsentName: absentName };
};

// a count from the driver is a neo4j Integer unless the session asks for plain numbers
const countOf = (countRead) => (typeof countRead === 'number' ? countRead : countRead.toNumber());


// ================================================================================
// CYPHER (every value a parameter; a card's slot edges are named from its own hubName, as toolPayloadContract.cardHubSlotEdgeTypeTextFor does)

const CARD_SLOT_EDGE_TEXT = "[slotName IN $edgeSlotNameList | 'HAS_' + toUpper(card.hubName) + '_' + slotName]";

const ELEMENT_PRESENCE_CYPHER = `OPTIONAL MATCH (standard:StandardDefinition { sourceKey: $standardName })
WITH collect(DISTINCT standard.version) AS graphStandardVersionList
OPTIONAL MATCH (element:ForgedNode { stableId: $elementStableId }) WHERE element._source = $standardName
RETURN graphStandardVersionList, count(element) AS elementCount`;

const USED_ON_CYPHER = `MATCH (element:ForgedNode { stableId: $elementStableId })<-[ownerEdge]-(owner:ForgedNode)
WHERE element._source = $standardName AND owner._source = $standardName AND type(ownerEdge) IN $ownerEdgeTypeList
WITH DISTINCT owner ORDER BY owner.name, owner.stableId
WITH collect(owner.stableId) AS ownerStableIdList, collect(owner.name) AS ownerLabelList
RETURN size(ownerStableIdList) AS ownerCount, ownerStableIdList[0..toInteger($listCap)] AS ownerStableIdList, ownerLabelList[0..toInteger($listCap)] AS ownerLabelList`;

// hubCardTuple's card read (cardCypherFor), for a list of cards in one query, with each card's own hub, release, name and tier. The card is matched as a
// ForgedNode: the stableId index is on that label, and a match on :HubReference alone scans every card (measured: 54 cards took 5 s that way)
const cardListCypherFor = (declarationList) => `UNWIND $cardStableIdList AS cardStableId
MATCH (card:ForgedNode { stableId: cardStableId }) WHERE card:HubReference
OPTIONAL MATCH (hub:HubDefinition { hubName: card.hubName })
WITH card, head(collect(hub.slotProfile)) AS slotProfileText
OPTIONAL MATCH (card)-[slotEdge]->(element:ForgedNode) WHERE type(slotEdge) IN ${CARD_SLOT_EDGE_TEXT}
RETURN card.stableId AS cardStableId, card.hubName AS hubName, card.hubVersion AS hubVersion, card.name AS cardLabel, card.referenceTier AS referenceTier, slotProfileText,
	[datatypeFieldName IN $datatypeFieldNameList | { fieldName: datatypeFieldName, written: card[datatypeFieldName] }] AS datatypeFieldList,
	collect(CASE WHEN element IS NULL THEN null ELSE { edgeType: type(slotEdge), graphLabelList: labels(element), stableId: element.stableId, standardName: element._source, label: element.name,
		nativeIdentifier: ${declarationList ? nativeIdentifierCypherTextFor('element', declarationList) : 'null'} } END) AS slotRowList`;

// ================================================================================
// PURE: rows → facts (exported, so a gate drives them with no graph)

// one listed part, its uri minted at the element's own release
const ownerPartListOf = ({ ownerStableIdList, ownerLabelList, uriForNode, standardName }) => ownerStableIdList.map((ownerStableId, ownerIndex) => {
	const minted = uriForNode({ stableId: ownerStableId, standardName });
	return { label: ownerLabelList[ownerIndex], ...(minted.uri === undefined ? { uriAbsentReason: minted.absentReason } : { uri: minted.uri }) };
});

// a card's identity and tuple bracket, from the card list read; a card that read no row says so in its bracket
const cardDescriptionByStableIdOf = ({ cardReadRowList, declarationVerdict, uriForElementInRelease }) => cardReadRowList.reduce((soFar, cardReadRow) => {
	const { cardStableId, hubName, hubVersion, cardLabel, referenceTier, slotProfileText, datatypeFieldList, slotRowList } = cardReadRow;
	const cardTupleFacts = cardTupleFactsOf({ cardRowList: [{ slotProfileText, datatypeFieldList, slotRowList }], declarationVerdict, uriForElement: uriForElementInRelease({ standardName: hubName, standardVersion: hubVersion }) });
	return { ...soFar, [cardStableId]: { uri: cardStableId, hubName, hubVersion, label: cardLabel, referenceTier, cardTupleFacts, tupleBracketText: tupleBracketTextOf(cardTupleFacts) } };
}, {});

// a listed card, described: its tuple bracket, and what lists it here (the slots it names the element in, or its match edge's relation)
const cardRowListOf = ({ listedCardRowList, cardDescriptionByStableId }) => listedCardRowList.map(({ cardStableId, ...edgeFields }) => {
	const { cardTupleFacts, ...cardDescription } = cardDescriptionByStableId[cardStableId] || { uri: cardStableId, tupleBracketText: tupleBracketTextOf({ tupleAbsentName: 'hubCardNotFound' }) };
	return { ...cardDescription, ...edgeFields };
});

// ================================================================================
// READS

const declarationVerdictFor = ({ runCypher, session }, next) => runCypher(session, NATIVE_IDENTIFIER_DECLARATION_CYPHER, {}, (declarationError, declarationResult) => {
	if (declarationError) {
		next(`the native identifier declarations would not read: ${declarationError}`);
		return;
	}
	next('', nativeIdentifierDeclarationVerdictFor(declarationResult.records.map((oneRecord) => ({ sourceKey: oneRecord.get('sourceKey'), nativeIdentifierPropertyName: oneRecord.get('nativeIdentifierPropertyName') }))));
});

const cardReadRowListFor = ({ runCypher, session, declarationVerdict, cardStableIdList }, next) => {
	const cardParameters = { cardStableIdList, edgeSlotNameList: HUB_ALL_SLOT_LIST, datatypeFieldNameList: hubCardTupleRules.datatypeRangeFieldNameList };
	runCypher(session, cardListCypherFor(declarationVerdict.declarationList), cardParameters, (cardError, cardResult) => {
		if (cardError) {
			next(`the cards would not read: ${cardError}`);
			return;
		}
		next('', cardResult.records.map((oneRecord) => ['cardStableId', 'hubName', 'hubVersion', 'cardLabel', 'referenceTier', 'slotProfileText', 'datatypeFieldList', 'slotRowList'].reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: oneRecord.get(fieldName) }), {})));
	});
};

// one listing query: { count, rowList } from its count column and its list column
const listingFor = ({ runCypher, session, cypherText, cypherParameters, countFieldName, listFieldNameList }, next) => runCypher(session, cypherText, cypherParameters, (listingError, listingResult) => {
	if (listingError) {
		next(listingError);
		return;
	}
	const [oneRecord] = listingResult.records;
	next('', oneRecord === undefined
		? { count: 0, ...listFieldNameList.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: [] }), {}) }
		: { count: countOf(oneRecord.get(countFieldName)), ...listFieldNameList.reduce((soFar, fieldName) => ({ ...soFar, [fieldName]: oneRecord.get(fieldName) }), {}) });
});

// the reader's plain rows, from a driver session's records
const runRowsFor = ({ runCypher, session }) => (cypherText, cypherParameters, done) => runCypher(session, cypherText, cypherParameters, (queryError, queryResult) => {
	if (queryError) {
		done(queryError);
		return;
	}
	done('', queryResult.records.map((oneRecord) => Object.fromEntries(oneRecord.keys.map((fieldName) => [fieldName, oneRecord.get(fieldName)]))));
});

// PURE: the cards each meaning section lists on the page (its first listCap), as { cardStableId, ...what lists it }
const listedCardRowListBySectionNameOf = (meaningRowsBySectionName) => ({
	propertyMeanings: meaningRowsBySectionName.propertyMeanings.slice(0, humanPageRules.listCap).map((meaningRow) => ({ cardStableId: meaningRow.cardStableId })),
	namingMeanings: meaningRowsBySectionName.namingMeanings.itemList.slice(0, humanPageRules.listCap).map((incomingRow) => ({
		cardStableId: incomingRow.meaningRow.cardStableId,
		slotNameList: incomingRow.slotEdgeTypeList.map((slotEdgeType) => standardsNeighbourhoodMapper.slotNameOfEdgeTypeFor({ hubName: incomingRow.meaningRow.hubName, slotEdgeType })),
	})),
	ownTerm: meaningRowsBySectionName.ownTerm.slice(0, humanPageRules.listCap).map((meaningRow) => ({ cardStableId: meaningRow.cardStableId })),
	mappedTo: meaningRowsBySectionName.mappedTo.itemList.slice(0, humanPageRules.listCap),
});

const elementFactsWork = ({ runCypher, partByName, uriForElementInRelease }) => (session, sessionDone) => {
	const { standardName, standardVersion, elementStableId } = partByName;
	const elementParameters = { standardName, elementStableId, listCap: humanPageRules.listCap };
	const taskList = new taskListPlus();

	taskList.push((args, next) => runCypher(session, ELEMENT_PRESENCE_CYPHER, elementParameters, (presenceError, presenceResult) => {
		if (presenceError) {
			next(presenceError);
			return;
		}
		const [oneRecord] = presenceResult.records;
		if (!oneRecord.get('graphStandardVersionList').includes(standardVersion)) {
			next('skipRestOfPipe', { ...args, humanPageFacts: factsAbsentOf('graphHoldsAnotherRelease') });
			return;
		}
		if (countOf(oneRecord.get('elementCount')) === 0) {
			next('skipRestOfPipe', { ...args, humanPageFacts: factsAbsentOf('elementNotInLiveGraph') });
			return;
		}
		next('', args);
	}));

	taskList.push((args, next) => listingFor({ runCypher, session, cypherText: USED_ON_CYPHER, cypherParameters: { ...elementParameters, ownerEdgeTypeList: humanPageRules.ownerEdgeTypeList }, countFieldName: 'ownerCount', listFieldNameList: ['ownerStableIdList', 'ownerLabelList'] }, (listingError, usedOnListing) => next(listingError, { ...args, usedOnListing })));
	// ⟪meaningsClarity, Addendum A⟫ the meanings it takes part in: THE one reader, the explorer's own
	taskList.push((args, next) => elementMeaningFactsFor({ mapper: standardsNeighbourhoodMapper, runRows: runRowsFor({ runCypher, session }), elementStableId, readsInParallel: false }, (factsError, factsAnswer) => next(factsError, { ...args, factsAnswer })));
	taskList.push((args, next) => declarationVerdictFor({ runCypher, session }, (declarationError, declarationVerdict) => next(declarationError, { ...args, declarationVerdict })));

	// each section's listed cards (its first listCap), read for their tuple brackets in one query
	taskList.push((args, next) => {
		const listedCardRowListBySectionName = listedCardRowListBySectionNameOf(args.factsAnswer.meaningRowsBySectionName);
		const cardStableIdList = Array.from(new Set(Object.values(listedCardRowListBySectionName).flat().map((cardRow) => cardRow.cardStableId)));
		cardReadRowListFor({ runCypher, session, declarationVerdict: args.declarationVerdict, cardStableIdList }, (cardError, cardReadRowList) => next(cardError, { ...args, listedCardRowListBySectionName, cardReadRowList }));
	});

	taskList.push((args, next) => {
		const { usedOnListing, factsAnswer, listedCardRowListBySectionName, declarationVerdict, cardReadRowList } = args;
		const cardDescriptionByStableId = cardDescriptionByStableIdOf({ cardReadRowList, declarationVerdict, uriForElementInRelease });
		next('', {
			...args,
			humanPageFacts: {
				usedOnList: ownerPartListOf({ ...usedOnListing, uriForNode: uriForElementInRelease({ standardName, standardVersion }), standardName }),
				usedOnCount: usedOnListing.count,
				elementMeaningFacts: factsAnswer.elementMeaningFacts,
				meaningCardRowListBySectionName: Object.fromEntries(Object.entries(listedCardRowListBySectionName).map(([sectionName, listedCardRowList]) => [sectionName, cardRowListOf({ listedCardRowList, cardDescriptionByStableId })])),
			},
		});
	});

	pipeRunner(taskList.getList(), {}, (pipeError, args) => {
		if (pipeError && pipeError !== 'skipRestOfPipe') {
			sessionDone(pipeError);
			return;
		}
		sessionDone('', args.humanPageFacts);
	});
};

const meaningFactsWork = ({ runCypher, edcIri, uriForElementInRelease }) => (session, sessionDone) => {
	declarationVerdictFor({ runCypher, session }, (declarationError, declarationVerdict) => {
		if (declarationError) {
			sessionDone(declarationError);
			return;
		}
		cardReadRowListFor({ runCypher, session, declarationVerdict, cardStableIdList: [edcIri] }, (cardError, cardReadRowList) => {
			if (cardError) {
				sessionDone(cardError);
				return;
			}
			if (cardReadRowList.length === 0) {
				sessionDone('', factsAbsentOf('cardNotInLiveGraph'));
				return;
			}
			const { cardTupleFacts, tupleBracketText } = cardDescriptionByStableIdOf({ cardReadRowList, declarationVerdict, uriForElementInRelease })[edcIri];
			sessionDone('', { ...(cardTupleFacts.tuple ? { tuple: cardTupleFacts.tuple } : { tupleAbsentName: cardTupleFacts.tupleAbsentName }), rangeIsIdentity: cardTupleFacts.rangeIsIdentity, tupleBracketText });
		});
	});
};

const FACTS_WORK_BY_KIND = Object.freeze({ element: elementFactsWork, meaning: meaningFactsWork });

const humanPageFactsFor = ({ kind, partByName, edcIri, withReadSession, runCypher, uriForElementInRelease, storeIsOpen, xLog }, done) => {
	const factsWorkFor = FACTS_WORK_BY_KIND[kind];
	if (factsWorkFor === undefined) {
		throw new Error(`humanPageFacts: '${kind}' has no human page facts (${Object.keys(FACTS_WORK_BY_KIND).join(', ')})`);
	}
	if (!withReadSession) {
		done(factsAbsentOf('noLiveGraph'));
		return;
	}
	if (!storeIsOpen) {
		done(factsAbsentOf('storeUnreadable'));
		return;
	}
	withReadSession(factsWorkFor({ runCypher, partByName, edcIri, uriForElementInRelease }), (factsError, humanPageFacts) => {
		if (factsError) {
			xLog.error(`humanPageFacts: the ${kind} page facts for ${edcIri} would not read: ${factsError}`);
			done(factsAbsentOf('factsUnreadable'));
			return;
		}
		done(humanPageFacts);
	});
};

module.exports = { humanPageFactsFor, factsAbsentOf, ownerPartListOf, cardDescriptionByStableIdOf, cardRowListOf, FACTS_ABSENT_NAME_LIST };
