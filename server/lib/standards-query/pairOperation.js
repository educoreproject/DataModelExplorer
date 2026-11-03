'use strict';

// pairOperation — what a manifest holds between an element and a standard, or between two standards (A8, ruled; design section 1.4). A pair nobody has judged is a normal
// answer, HTTP 200, never a refusal and never an empty list. No element-to-element judgment exists in any manifest, every judged edge targets a card, so nothing here says
// 'judged': a row is a standard's own published statement (declaredCorrespondence) or a computed suggestion through one shared card with both hops shown (computedViaHub).
//
//   runPair({ session, facts, input, pageNumber, pageSize, runCypher, storeReads, dmeSearchModule, namedUriList }, callback('', answer | refusal))

const path = require('path');
const neo4j = require('neo4j-driver');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { resolveStandardFilter, resolveHubList } = require(path.join(__dirname, '..', '..', '..', 'cli', 'lib.d', 'data-model-explorer', 'lib', 'liveInventory'));
const { mappingStatusByHubFor, nameUri, setUriFields } = require('./answerSteps');

const PAIR_OPERATION_NAME = 'pair';
const ROW_UNIT_TEXT = 'a pair of elements: one row per (this element, other element, relation path). A computedViaHub row is a suggestion read through one hub card, never a judgment between the two; a declaredCorrespondence row is one standard\'s own published statement';
const MATCH_EDGE_TEXT = 'EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH';

const refusalFor = (refusalName, reason, validValueList) => ({ refusedByName: PAIR_OPERATION_NAME, refusalName, reason, ...(validValueList ? { validValueList } : {}) });

// a side is a node list (element form) or a standard's node set (two-standards form): the same query, opened on either
const FOCUS_MATCH_BY_FORM = Object.freeze({
	element: 'UNWIND $focusStableIdList AS focusStableId MATCH (focus:ForgedNode {stableId: focusStableId})',
	standards: 'MATCH (focus:ForgedNode) WHERE focus._source IN $focusSourceList',
});

const pairRowsCypherFor = (formName) => `
	CALL {
		${FOCUS_MATCH_BY_FORM[formName]}
		MATCH (focus)-[declared:DECLARED_CORRESPONDENCE]-(other:ForgedNode) WHERE other._source IN $otherSourceList
		RETURN 'declaredCorrespondence' AS pairStatus, focus.stableId AS thisStableId, focus.name AS thisName, focus._source AS thisStandard,
		       other.stableId AS otherStableId, other.name AS otherName, other._source AS otherStandard,
		       declared.sourcePredicate AS sourcePredicate, startNode(declared).stableId AS statedByStableId,
		       null AS cardUri, null AS cardName, null AS hubName, null AS hopList
		UNION ALL
		${FOCUS_MATCH_BY_FORM[formName]}
		MATCH (focus)-[:HAS_INSTANCE*0..1]->(near:ForgedNode)-[nearEdge:${MATCH_EDGE_TEXT}]->(card:HubReference)<-[farEdge:${MATCH_EDGE_TEXT}]-(far:ForgedNode)
		WHERE far._source IN $otherSourceList AND far.stableId <> near.stableId
		OPTIONAL MATCH (farDeclaration:ForgedNode)-[:HAS_INSTANCE]->(far)
		WITH focus, near, nearEdge, card, far, farEdge, coalesce(farDeclaration, far) AS other
		RETURN 'computedViaHub' AS pairStatus, focus.stableId AS thisStableId, focus.name AS thisName, focus._source AS thisStandard,
		       other.stableId AS otherStableId, other.name AS otherName, other._source AS otherStandard,
		       null AS sourcePredicate, null AS statedByStableId,
		       card.stableId AS cardUri, card.name AS cardName, card.hubName AS hubName,
		       [{ fromStableId: near.stableId, relation: type(nearEdge), confidence: nearEdge.mappingConfidence, assertion: nearEdge.assertionId },
		        { fromStableId: far.stableId, relation: type(farEdge), confidence: farEdge.mappingConfidence, assertion: farEdge.assertionId }] AS hopList
	}
	WITH DISTINCT pairStatus, thisStableId, thisName, thisStandard, otherStableId, otherName, otherStandard, sourcePredicate, statedByStableId, cardUri, cardName, hubName, hopList
	ORDER BY pairStatus DESC, thisStandard, thisName, thisStableId, otherStandard, otherName, otherStableId, cardUri
	WITH collect({ pairStatus: pairStatus, thisStableId: thisStableId, thisName: thisName, thisStandard: thisStandard, otherStableId: otherStableId, otherName: otherName, otherStandard: otherStandard,
	               sourcePredicate: sourcePredicate, statedByStableId: statedByStableId, cardUri: cardUri, cardName: cardName, hubName: hubName, hopList: hopList }) AS rowList
	RETURN rowList[$rowOffset..($rowOffset + $pageSize)] AS pageRowList, size(rowList) AS totalRowCount,
	       size([oneRow IN rowList WHERE oneRow.pairStatus = 'declaredCorrespondence']) AS declaredRowCount`;

const MAPPED_ELEMENT_COUNT_CYPHER = `MATCH (subject:ForgedNode)-[:${MATCH_EDGE_TEXT}]->(card:HubReference) WHERE subject._source IN $sourceList RETURN card.hubName AS hubName, count(DISTINCT subject) AS mappedElementCount`;

const elementOf = ({ facts, stableId, elementName, standardName, namedUriList }) => {
	const namedElement = { stableId, name: elementName, standard: standardName };
	nameUri(facts.uriMinter, namedElement, 'uri', stableId, standardName, namedUriList);
	return namedElement;
};

const answerRowOf = ({ row, facts, namedUriList }) => {
	const answerRow = {
		pairStatus: row.pairStatus,
		targetKind: 'element',
		thisElement: elementOf({ facts, stableId: row.thisStableId, elementName: row.thisName, standardName: row.thisStandard, namedUriList }),
		otherElement: elementOf({ facts, stableId: row.otherStableId, elementName: row.otherName, standardName: row.otherStandard, namedUriList }),
	};
	if (row.pairStatus === 'declaredCorrespondence') {
		answerRow.sourcePredicate = row.sourcePredicate;
		answerRow.statedByStableId = row.statedByStableId;
		return answerRow;
	}
	namedUriList.push(row.cardUri, ...row.hopList.map((oneHop) => oneHop.assertion).filter(Boolean));
	const card = { name: row.cardName, hubName: row.hubName };
	setUriFields(card, 'uri', row.cardUri, false);
	return { ...answerRow, claimKind: 'computed', card, hopList: row.hopList };
};

// a whole standard as a side of a pair: its hub answers, read the same three ways as an element's
const standardSideOf = ({ session, sourceList, hubList, facts, runCypher, storeReads }, callback) => {
	runCypher(session, MAPPED_ELEMENT_COUNT_CYPHER, { sourceList }, (countError, countResult) => {
		if (countError) {
			callback(countError);
			return;
		}
		const mappedElementCountByHub = {};
		countResult.records.forEach((oneRecord) => {
			mappedElementCountByHub[oneRecord.get('hubName')] = neo4j.integer.toNumber(oneRecord.get('mappedElementCount'));
		});
		const abstained = storeReads.abstainedHubNameSetOfStandards({ sourceList, decisionBlockHashListByStandard: facts.decisionBlockHashListByStandard });
		if (abstained.error) {
			callback(abstained.error);
			return;
		}
		const mappingStatusByHub = {};
		hubList.forEach(({ hubName, hubSource }) => {
			if (sourceList.every((sourceName) => sourceName === hubSource)) {
				mappingStatusByHub[hubName] = 'notApplicable';
				return;
			}
			if (mappedElementCountByHub[hubName] > 0) {
				mappingStatusByHub[hubName] = 'mapped';
				return;
			}
			mappingStatusByHub[hubName] = abstained.hubNameSet.has(hubName) ? 'judgedAbstained' : 'neverOffered';
		});
		callback('', { standardList: sourceList, mappingStatusByHub, mappedElementCountByHub });
	});
};

const runPair = ({ session, facts, input, pageNumber, pageSize, runCypher, storeReads, dmeSearchModule, namedUriList }, callback) => {
	const { element, standard, otherStandard } = input;
	const formName = element !== undefined && otherStandard === undefined ? 'element' : 'standards';
	if (standard === undefined || (element !== undefined && otherStandard !== undefined) || (element === undefined && otherStandard === undefined)) {
		callback('', refusalFor('pairInputInvalid', 'pair takes (element, standard) or (standard, otherStandard), and page'));
		return;
	}
	const taskList = new taskListPlus();

	const resolveStandardInto = (standardText, resultName) => (args, next) => resolveStandardFilter(session, 'unmappedFields', standardText, (filterError, standardFilter) => {
		if (filterError) {
			next(filterError, args);
			return;
		}
		if (standardFilter.refusal) {
			next('skipRestOfPipe', { ...args, refusal: { ...standardFilter.refusal, refusedByName: PAIR_OPERATION_NAME } });
			return;
		}
		next('', { ...args, [resultName]: standardFilter.sourceList });
	});

	taskList.push(resolveStandardInto(standard, 'firstSourceList'));
	if (otherStandard !== undefined) {
		taskList.push(resolveStandardInto(otherStandard, 'secondSourceList'));
	}
	taskList.push((args, next) => resolveHubList(session, (hubError, hubInventory) => (hubError ? next(hubError, args) : next('', { ...args, hubList: hubInventory.hubList }))));

	if (formName === 'element') {
		taskList.push((args, next) => dmeSearchModule.findMappingsMatchedNodeList(session, element, (nodeError, matchedNodeList) => {
			if (nodeError) {
				next(nodeError, args);
				return;
			}
			if (matchedNodeList.length === 0) {
				next('skipRestOfPipe', { ...args, refusal: refusalFor('nothingMatched', `no element in this graph is named or identified by '${element}'`) });
				return;
			}
			next('', { ...args, matchedNodeList });
		}));
	}

	taskList.push((args, next) => runCypher(session, pairRowsCypherFor(formName), {
		focusStableIdList: (args.matchedNodeList || []).map((oneNode) => oneNode.stableId),
		focusSourceList: args.secondSourceList ? args.firstSourceList : [],
		otherSourceList: args.secondSourceList || args.firstSourceList,
		rowOffset: neo4j.int((pageNumber - 1) * pageSize),
		pageSize: neo4j.int(pageSize),
	}, (rowError, rowResult) => {
		if (rowError) {
			next(rowError, args);
			return;
		}
		const rowRecord = rowResult.records[0];
		next('', { ...args, pageRowList: rowRecord.get('pageRowList'), totalRowCount: neo4j.integer.toNumber(rowRecord.get('totalRowCount')), declaredRowCount: neo4j.integer.toNumber(rowRecord.get('declaredRowCount')) });
	}));

	// the sides are read only when they are the answer: a judged pair's rows already say what the manifest holds
	taskList.push((args, next) => {
		if (args.totalRowCount > 0) {
			next('', args);
			return;
		}
		const readOtherSide = (thisSide) => standardSideOf({ session, sourceList: args.secondSourceList || args.firstSourceList, hubList: args.hubList, facts, runCypher, storeReads }, (sideError, otherSide) => (sideError ? next(sideError, args) : next('', { ...args, thisSide, otherSide })));
		if (args.secondSourceList) {
			standardSideOf({ session, sourceList: args.firstSourceList, hubList: args.hubList, facts, runCypher, storeReads }, (sideError, thisSide) => (sideError ? next(sideError, args) : readOtherSide(thisSide)));
			return;
		}
		mappingStatusByHubFor({ session, facts, runCypher, storeReads, matchedNodeList: args.matchedNodeList, hubList: args.hubList }, (statusError, mappingStatusByHub) => {
			if (statusError) {
				next(statusError, args);
				return;
			}
			readOtherSide({ elementList: args.matchedNodeList.map((oneNode) => elementOf({ facts, stableId: oneNode.stableId, elementName: oneNode.elementName, standardName: oneNode.standardName, namedUriList })), mappingStatusByHub });
		});
	});

	pipeRunner(taskList.getList(), {}, (pipeError, args) => {
		if (pipeError && pipeError !== 'skipRestOfPipe') {
			callback(pipeError);
			return;
		}
		if (args.refusal) {
			callback('', args.refusal);
			return;
		}
		const rowList = args.pageRowList.map((row) => answerRowOf({ row, facts, namedUriList }));
		const sharedFields = { rowList, totalRowCount: args.totalRowCount, returnedRowCount: rowList.length, truncatedRowCount: args.totalRowCount - rowList.length, rowUnit: ROW_UNIT_TEXT, pageNumber, pageSize };
		if (args.totalRowCount === 0) {
			const thisSideText = element !== undefined ? element : standard;
			const otherSideText = otherStandard !== undefined ? otherStandard : standard;
			callback('', { pairStatus: 'notJudged', notJudgedNote: `no judgment between ${thisSideText} and ${otherSideText} has been made in manifest ${facts.manifestLabel}; the hubs' answers for each side are in thisSide and otherSide`, thisSide: args.thisSide, otherSide: args.otherSide, ...sharedFields });
			return;
		}
		callback('', { pairStatus: args.declaredRowCount > 0 ? 'declaredCorrespondence' : 'computedViaHub', ...sharedFields });
	});
};

module.exports = { runPair };
