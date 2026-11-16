'use strict';

// consistencySignals.js — automatic signals about the mappings that need no human, cheap enough to run on every build.
// None of them is accuracy; each says what it is in the report.
//
//   instanceAgreement  A SIF Question or PESC element declaration appears in many places (SIF objects, PESC sections), and
//                      the judge was asked about each place on its own. Where two or more of a declaration's instances are
//                      mapped onto one hub, did they all get the SAME card? the same hub PROPERTY (class ignored)? A
//                      different card in a different place can be right (the class follows the context), so the property
//                      figure is the fairer one. Per standard and hub.
//   triangulation      Where an element maps to a card on hub A and a card on hub B, and hub A's own published
//                      correspondences (DECLARED_CORRESPONDENCE, quoted from the standard) relate the element under A's card
//                      to an element of hub B, does B's card sit on that element? Counted per ordered hub pair: the
//                      correspondences hub A declares to hub B, how many sit under a card any element is mapped to, and
//                      how many element pairs could therefore be checked and agree.
//
//   readConsistencySignals({ session, hubList, rules }, callback(errText, { instanceAgreementRowList, triangulationRowList }))

const path = require('path');
const { pipeRunner, taskListPlus, mergeArgs } = new (require('qtools-asynchronous-pipe-plus'))();
const { runCypherQuery } = require(path.join(__dirname, '..', '..', 'data-model-explorer', 'lib', 'runCypherQuery'));

const plainNumberOf = (storedNumber) => (storedNumber !== null && typeof storedNumber === 'object' && typeof storedNumber.toNumber === 'function' ? storedNumber.toNumber() : storedNumber);
const plainRowListOf = (queryResult) => queryResult.records.map((oneRecord) => Object.fromEntries(oneRecord.keys.map((fieldName) => [fieldName, plainNumberOf(oneRecord.get(fieldName))])));

const instanceAgreementCypherFor = (edgeTypeText) => `
	MATCH (declaration:ForgedNode)-[:HAS_INSTANCE]->(instance:ForgedNode)-[:${edgeTypeText}]->(card:HubReference)
	WITH declaration, card.hubName AS hubName, count(DISTINCT instance) AS mappedInstanceCount,
	     count(DISTINCT card) AS distinctCardCount, count(DISTINCT [card.propertyKey] + coalesce(card.qualifierKeys, [])) AS distinctPropertyCount
	WHERE mappedInstanceCount >= 2
	RETURN declaration._source AS standardSource, hubName, count(declaration) AS declarationCount,
	       count(CASE WHEN distinctCardCount = 1 THEN 1 END) AS oneCardDeclarationCount,
	       count(CASE WHEN distinctPropertyCount = 1 THEN 1 END) AS onePropertyDeclarationCount,
	       sum(mappedInstanceCount) AS mappedInstanceCount
	ORDER BY standardSource, hubName`;

// a card reaches its hub's elements through its slot edges, HAS_<HUBNAME>_<SLOT> (toolPayloadContract.js W-D-5)
const triangulationCypherFor = (edgeTypeText) => `
	MATCH (fromElement:ForgedNode {_source: $fromHubName})-[declared:DECLARED_CORRESPONDENCE]->(toElement:ForgedNode {_source: $toHubName})
	WITH collect(DISTINCT [fromElement, toElement]) AS declaredPairList, count(declared) AS declaredCorrespondenceCount
	CALL {
		WITH declaredPairList
		UNWIND declaredPairList AS declaredPair
		WITH declaredPair[0] AS fromElement, declaredPair[1] AS toElement
		MATCH (fromCard:HubReference {hubName: $fromHubName})-[fromSlot]->(fromElement) WHERE type(fromSlot) STARTS WITH $fromSlotPrefix
		OPTIONAL MATCH (sourceElement:ForgedNode)-[:${edgeTypeText}]->(fromCard)
		OPTIONAL MATCH (sourceElement)-[:${edgeTypeText}]->(toCard:HubReference {hubName: $toHubName})
		OPTIONAL MATCH (toCard)-[toSlot]->(toElement) WHERE type(toSlot) STARTS WITH $toSlotPrefix
		RETURN count(DISTINCT CASE WHEN sourceElement IS NOT NULL THEN fromCard END) AS mappedFromCardCount,
		       count(DISTINCT CASE WHEN toCard IS NOT NULL THEN [sourceElement, toCard] END) AS checkablePairCount,
		       count(DISTINCT CASE WHEN toSlot IS NOT NULL THEN [sourceElement, toCard] END) AS agreeingPairCount
	}
	RETURN declaredCorrespondenceCount, mappedFromCardCount, checkablePairCount, agreeingPairCount`;

// elements mapped onto both hubs: the population a hub-to-hub check would cover
const bothHubCypherFor = (edgeTypeText) => `
	MATCH (sourceElement:ForgedNode)-[:${edgeTypeText}]->(fromCard:HubReference {hubName: $fromHubName})
	WITH DISTINCT sourceElement WHERE (sourceElement)-[:${edgeTypeText}]->(:HubReference {hubName: $toHubName})
	RETURN count(sourceElement) AS bothHubElementCount`;

const readConsistencySignals = ({ session, hubList, rules }, callback) => {
	const edgeTypeText = rules.relationList.map((oneRelation) => oneRelation.edgeTypeName).join('|');
	const orderedHubPairList = hubList.reduce((soFar, fromHub) => soFar.concat(hubList.filter((toHub) => toHub.hubName !== fromHub.hubName).map((toHub) => ({ fromHubName: fromHub.hubName, toHubName: toHub.hubName }))), []);
	const taskList = new taskListPlus();
	taskList.push((args, next) => runCypherQuery(session, instanceAgreementCypherFor(edgeTypeText), {}, mergeArgs(args, next, 'instanceResult')));
	orderedHubPairList.forEach((hubPair, pairIndex) => {
		const parameterObject = { ...hubPair, fromSlotPrefix: `HAS_${hubPair.fromHubName.toUpperCase()}_`, toSlotPrefix: `HAS_${hubPair.toHubName.toUpperCase()}_` };
		taskList.push((args, next) => runCypherQuery(session, triangulationCypherFor(edgeTypeText), parameterObject, mergeArgs(args, next, `triangulationResult${pairIndex}`)));
		taskList.push((args, next) => runCypherQuery(session, bothHubCypherFor(edgeTypeText), parameterObject, mergeArgs(args, next, `bothHubResult${pairIndex}`)));
	});
	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(`consistencySignals: ${err}`);
			return;
		}
		const triangulationRowList = orderedHubPairList.map((hubPair, pairIndex) => ({ ...hubPair, ...plainRowListOf(args[`triangulationResult${pairIndex}`])[0], ...plainRowListOf(args[`bothHubResult${pairIndex}`])[0] }));
		callback('', { instanceAgreementRowList: plainRowListOf(args.instanceResult), triangulationRowList });
	});
};

module.exports = { readConsistencySignals };
