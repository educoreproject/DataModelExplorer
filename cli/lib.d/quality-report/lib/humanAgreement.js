'use strict';

// humanAgreement.js — the human half of the quality report: the CEDS Rater's judgments, read from a SNAPSHOT of its store,
// compared with the graph's answer for the same elements. Everything it reads it reads by the rater tool's own code, so the
// report and the rater tool cannot mean different things by "the graph's card" or "the same property":
//   the sample and candidate lists   cli/lib.d/rater-tool/frozenInputs sample.json, suggested.json (the files raters saw)
//   the graph's cards for an element goldTupleReader.readGoldTupleList, with suggestRules.json's member rule per standard
//   a card's property identity       ceds-cards.readCardsByTupleIdList + card-property-identity.propertyIdentityOf
//   rater-to-rater agreement         rater-results.buildRaterResults (the admin Results page's aggregation)
// The store is opened read-only and never written. Rater names, notes and display names are never read into the report.
//
//   readHumanAgreement({ session, raterStoreFilePath, frozenInputDirPath, rules }, callback(errText, humanAgreement))

const fs = require('fs');
const path = require('path');
const { pipeRunner, taskListPlus, mergeArgs } = new (require('qtools-asynchronous-pipe-plus'))();

const CODE_DIR_PATH = path.join(__dirname, '..', '..', '..', '..');
const RATER_TOOL_DIR_PATH = path.join(CODE_DIR_PATH, 'cli', 'lib.d', 'rater-tool');
const RATER_SERVER_LIB_DIR_PATH = path.join(CODE_DIR_PATH, 'server', 'data-model', 'lib', 'rater-tool');
const { readGoldTupleList } = require(path.join(RATER_TOOL_DIR_PATH, 'lib', 'goldTupleReader'));
const { readCardsByTupleIdList } = require(path.join(RATER_SERVER_LIB_DIR_PATH, 'ceds-cards'));
const { propertyIdentityOf } = require(path.join(RATER_SERVER_LIB_DIR_PATH, 'card-property-identity'));
const { buildRaterResults } = require(path.join(RATER_SERVER_LIB_DIR_PATH, 'rater-results'));
const { runCypherQuery } = require(path.join(CODE_DIR_PATH, 'cli', 'lib.d', 'data-model-explorer', 'lib', 'runCypherQuery'));
const { scoreAgreement } = require('./agreementScorer');

const STORE_READ_TEXT_BY_NAME = Object.freeze({
	raterList: 'SELECT raterUserName, surveyName, finishedAt FROM raters ORDER BY raterUserName',
	answerList: 'SELECT raterUserName, elementStableId, answerJson, savedAt FROM answers ORDER BY raterUserName, elementStableId',
	historyCount: 'SELECT count(*) AS historyRowCount FROM answerHistory',
});

// the edges behind the graph's cards, by the same member rules goldTupleReader names (relation and confidence only)
const RELATION_CYPHER_BY_MEMBER_RULE_NAME = Object.freeze({
	memberCarriesEdge: (edgeTypeText) => `UNWIND $memberStableIdList AS memberStableId
		MATCH (member:ForgedNode {stableId: memberStableId})-[m:${edgeTypeText}]->(tuple:HubReference {hubName: $hubName})
		RETURN type(m) AS edgeTypeName, m.mappingConfidence AS mappingConfidence`,
	occurrencesCarryEdge: (edgeTypeText) => `UNWIND $memberStableIdList AS memberStableId
		MATCH (occurrence:ForgedNode) WHERE occurrence.stableId STARTS WITH memberStableId + '/at/'
		MATCH (occurrence)-[m:${edgeTypeText}]->(tuple:HubReference {hubName: $hubName})
		RETURN type(m) AS edgeTypeName, m.mappingConfidence AS mappingConfidence`,
});

const plainValueOf = (storedValue) => (storedValue !== null && typeof storedValue === 'object' && typeof storedValue.toNumber === 'function' ? storedValue.toNumber() : storedValue);

// the rater tool's graph interface (rater-graph.js: runQuery(cypher, params, callback(errText, rowList))) over this session
const raterGraphOver = (session) => ({
	runQuery: (cypherText, parameterObject, callback) => runCypherQuery(session, cypherText, parameterObject, (queryError, queryResult) =>
		(queryError ? callback(queryError) : callback('', queryResult.records.map((oneRecord) => Object.fromEntries(oneRecord.keys.map((fieldName) => [fieldName, plainValueOf(oneRecord.get(fieldName))])))))),
});

const readStoreSnapshot = (raterStoreFilePath) => {
	const Database = require('better-sqlite3');
	const storeHandle = new Database(raterStoreFilePath, { readonly: true, fileMustExist: true });
	const raterRowList = storeHandle.prepare(STORE_READ_TEXT_BY_NAME.raterList).all();
	const answerRowList = storeHandle.prepare(STORE_READ_TEXT_BY_NAME.answerList).all();
	const { historyRowCount } = storeHandle.prepare(STORE_READ_TEXT_BY_NAME.historyCount).get();
	storeHandle.close();
	return { raterRowList, answerRowList, historyRowCount };
};

// one element's graph answer: its cards (goldTupleReader) and the relations and confidences of the edges behind them
const readGraphAnswer = ({ raterGraph, element, suggestRules, hubName, edgeTypeNameList }, callback) => {
	const memberRuleName = suggestRules.goldInjection.memberRuleNameByStandard[element.standard];
	if (!memberRuleName || !RELATION_CYPHER_BY_MEMBER_RULE_NAME[memberRuleName]) {
		callback(`humanAgreement: no member rule for standard ${JSON.stringify(element.standard)} (suggestRules.json goldInjection.memberRuleNameByStandard names ${JSON.stringify(memberRuleName)})`);
		return;
	}
	readGoldTupleList({ raterGraph, memberRuleName, mappingEdgeTypeList: edgeTypeNameList, memberStableIdList: element.memberStableIdList }, (tupleError, goldTupleList) => {
		if (tupleError) {
			callback(tupleError);
			return;
		}
		raterGraph.runQuery(RELATION_CYPHER_BY_MEMBER_RULE_NAME[memberRuleName](edgeTypeNameList.join('|')), { memberStableIdList: element.memberStableIdList, hubName }, (relationError, relationRowList) => {
			if (relationError) {
				callback(`humanAgreement: the relation read for ${element.elementStableId} failed: ${relationError}`);
				return;
			}
			const confidenceList = relationRowList.map((oneRow) => oneRow.mappingConfidence).filter((oneConfidence) => oneConfidence !== null && oneConfidence !== undefined);
			callback('', {
				cedsTupleIdList: goldTupleList.map((oneTuple) => oneTuple.cedsTupleId),
				relationNameList: [...new Set(relationRowList.map((oneRow) => oneRow.edgeTypeName))].sort(),
				strongestConfidence: confidenceList.length === 0 ? null : Math.max(...confidenceList),
				edgeCount: relationRowList.length,
			});
		});
	});
};

const readGraphAnswerByElement = ({ raterGraph, elementList, suggestRules, hubName, edgeTypeNameList }, callback) => {
	const graphAnswerByElementStableId = {};
	const readNext = (elementIndex) => {
		if (elementIndex >= elementList.length) {
			callback('', graphAnswerByElementStableId);
			return;
		}
		readGraphAnswer({ raterGraph, element: elementList[elementIndex], suggestRules, hubName, edgeTypeNameList }, (answerError, graphAnswer) => {
			if (answerError) {
				callback(answerError);
				return;
			}
			graphAnswerByElementStableId[elementList[elementIndex].elementStableId] = graphAnswer;
			readNext(elementIndex + 1);
		});
	};
	readNext(0);
};

const readJsonFile = (filePath) => {
	if (!fs.existsSync(filePath)) {
		return { refusalText: `humanAgreement: ${filePath} is absent` };
	}
	return { parsedDocument: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
};

const readHumanAgreement = ({ session, raterStoreFilePath, frozenInputDirPath, rules }, callback) => {
	const humanRules = rules.humanJudgment;
	const edgeTypeNameList = rules.relationList.map((oneRelation) => oneRelation.edgeTypeName);
	const readList = [path.join(frozenInputDirPath, 'sample.json'), path.join(frozenInputDirPath, 'suggested.json'), path.join(RATER_TOOL_DIR_PATH, 'config', humanRules.suggestRulesFileName), path.join(RATER_TOOL_DIR_PATH, 'config', 'raterDraw.json')].map(readJsonFile);
	const refusedRead = readList.find((oneRead) => oneRead.refusalText);
	if (refusedRead) {
		callback(refusedRead.refusalText);
		return;
	}
	const [sampleDocument, suggestedDocument, suggestRules, raterDraw] = readList.map((oneRead) => oneRead.parsedDocument);
	// the graph sources each sample standard was drawn from (raterDraw.json); null = every source of the standard's family
	const drawSourceListBySampleStandard = Object.fromEntries(raterDraw.standardNameList.map((sampleStandardName) => {
		const drawFieldName = humanRules.drawSourceFieldBySampleStandard[sampleStandardName];
		if (!drawFieldName) {
			return [sampleStandardName, null];
		}
		const drawSourceValue = raterDraw[drawFieldName];
		return [sampleStandardName, Array.isArray(drawSourceValue) ? drawSourceValue.map((oneRelease) => oneRelease.sourceName) : [drawSourceValue]];
	}));
	if (!fs.existsSync(raterStoreFilePath)) {
		callback(`humanAgreement: the rater store snapshot is absent at ${raterStoreFilePath}`);
		return;
	}
	const storeSnapshot = readStoreSnapshot(raterStoreFilePath);
	const raterList = storeSnapshot.raterRowList.filter((oneRater) => humanRules.excludedRaterUserNameList.indexOf(oneRater.raterUserName) === -1);
	const answerList = storeSnapshot.answerRowList
		.filter((oneRow) => humanRules.excludedRaterUserNameList.indexOf(oneRow.raterUserName) === -1)
		.map((oneRow) => ({ raterUserName: oneRow.raterUserName, elementStableId: oneRow.elementStableId, savedAt: oneRow.savedAt, answer: JSON.parse(oneRow.answerJson) }));
	const unknownKindAnswer = answerList.find((oneAnswer) => humanRules.answerKindList.indexOf(oneAnswer.answer.answerKind) === -1);
	if (unknownKindAnswer) {
		callback(`humanAgreement: a stored answer has answerKind ${JSON.stringify(unknownKindAnswer.answer.answerKind)}, not one of ${humanRules.answerKindList.join(', ')}`);
		return;
	}
	const sameListAbsentAnswer = answerList.find((oneAnswer) => oneAnswer.answer.answerKind === 'cards' && !Array.isArray(oneAnswer.answer.sameCedsTupleIdList));
	if (sameListAbsentAnswer) {
		callback(`humanAgreement: a cards answer for ${sameListAbsentAnswer.elementStableId} has no sameCedsTupleIdList; it is not read as an empty list`);
		return;
	}
	const elementList = sampleDocument.elementList;
	const raterGraph = raterGraphOver(session);

	const taskList = new taskListPlus();
	taskList.push((args, next) => readGraphAnswerByElement({ raterGraph, elementList, suggestRules, hubName: humanRules.hubName, edgeTypeNameList }, mergeArgs(args, next, 'graphAnswerByElementStableId')));
	taskList.push((args, next) => {
		const pickedTupleIdList = answerList.filter((oneAnswer) => oneAnswer.answer.answerKind === 'cards').reduce((soFar, oneAnswer) => soFar.concat([oneAnswer.answer.bestCedsTupleId], oneAnswer.answer.sameCedsTupleIdList), []);
		const graphTupleIdList = Object.values(args.graphAnswerByElementStableId).reduce((soFar, graphAnswer) => soFar.concat(graphAnswer.cedsTupleIdList), []);
		readCardsByTupleIdList({ raterGraph, cedsTupleIdList: [...new Set(pickedTupleIdList.concat(graphTupleIdList))] }, mergeArgs(args, next, 'cardList'));
	});
	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(`humanAgreement: ${err}`);
			return;
		}
		const propertyIdentityByTupleId = Object.fromEntries(args.cardList.map((oneCard) => [oneCard.cedsTupleId, propertyIdentityOf(oneCard)]));
		const scored = scoreAgreement({ elementList, graphAnswerByElementStableId: args.graphAnswerByElementStableId, propertyIdentityByTupleId, raterList, answerList, zScore: rules.agreementIntervalZScore });
		if (scored.problemText) {
			callback(scored.problemText);
			return;
		}
		const raterResults = buildRaterResults({ elementList, suggestedDocument, raterList, answerList });
		if (raterResults.problemText) {
			callback(`humanAgreement: ${raterResults.problemText}`);
			return;
		}
		const multiRatedTargetList = raterResults.targetList.filter((oneTarget) => oneTarget.answeredCount >= 2);
		// was the graph's card on the list the rater saw? (the lists were built from the sample's gold, not necessarily this graph)
		const answeredElementStableIdList = [...new Set(scored.answerVerdictList.map((oneVerdict) => oneVerdict.elementStableId))];
		const graphMappedAnsweredStableIdList = answeredElementStableIdList.filter((elementStableId) => args.graphAnswerByElementStableId[elementStableId].cedsTupleIdList.length > 0);
		const graphCardOffListStableIdList = graphMappedAnsweredStableIdList.filter((elementStableId) => {
			const suggestedEntry = suggestedDocument.suggestedByElementStableId[elementStableId];
			const listedTupleIdList = suggestedEntry.cardList.reduce((soFar, oneCard) => soFar.concat(oneCard.cedsTupleIdList || [oneCard.cedsTupleId]), []);
			return args.graphAnswerByElementStableId[elementStableId].cedsTupleIdList.some((cedsTupleId) => listedTupleIdList.indexOf(cedsTupleId) === -1);
		});
		const countedRaterNameList = [...new Set(answerList.filter((oneAnswer) => answeredElementStableIdList.indexOf(oneAnswer.elementStableId) !== -1).map((oneAnswer) => oneAnswer.raterUserName))];
		const savedAtList = answerList.map((oneAnswer) => oneAnswer.savedAt).filter(Boolean).sort();
		callback('', {
			hubName: humanRules.hubName,
			sampleFacts: {
				sampleGoldenContainerName: sampleDocument.goldenContainerName,
				sampleSeedText: sampleDocument.sampleSeedText,
				sampleElementCount: sampleDocument.elementCount,
				perStandardDrawCount: sampleDocument.perStandardDrawCount,
				drawCountByPart: sampleDocument.drawCountByPart,
				surveyNameList: sampleDocument.surveyNameList,
				standardList: [...new Set(elementList.map((oneElement) => oneElement.standard))].sort(),
				drawSourceListBySampleStandard,
			},
			storeFacts: {
				raterAccountCount: raterList.length,
				raterWithCountedAnswerCount: countedRaterNameList.length,
				finishedRaterCount: raterList.filter((oneRater) => oneRater.finishedAt).length,
				storedAnswerCount: answerList.length,
				historyRowCount: storeSnapshot.historyRowCount,
				firstSavedAt: savedAtList[0] || null,
				lastSavedAt: savedAtList[savedAtList.length - 1] || null,
				answeredSurveyNameList: [...new Set(answerList.map((oneAnswer) => (raterList.find((oneRater) => oneRater.raterUserName === oneAnswer.raterUserName) || {}).surveyName))].filter(Boolean).sort(),
			},
			scored: { ...scored, answerVerdictList: undefined },
			answerVerdictList: scored.answerVerdictList,
			interRater: {
				multiRatedElementCount: multiRatedTargetList.length,
				sameCardElementCount: multiRatedTargetList.filter((oneTarget) => oneTarget.sameCardCount === oneTarget.answeredCount).length,
				samePropertyElementCount: multiRatedTargetList.filter((oneTarget) => oneTarget.samePropertyCount === oneTarget.answeredCount).length,
			},
			graphCardListing: { graphMappedAnsweredElementCount: graphMappedAnsweredStableIdList.length, graphCardOffListElementCount: graphCardOffListStableIdList.length },
			sampleGraphMappingCount: {
				mappedInSampleGold: elementList.filter((oneElement) => oneElement.isMappedInGold).length,
				mappedInThisGraph: elementList.filter((oneElement) => args.graphAnswerByElementStableId[oneElement.elementStableId].cedsTupleIdList.length > 0).length,
				mappedInBoth: elementList.filter((oneElement) => oneElement.isMappedInGold && args.graphAnswerByElementStableId[oneElement.elementStableId].cedsTupleIdList.length > 0).length,
			},
		});
	});
};

module.exports = { readHumanAgreement };
