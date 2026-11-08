'use strict';

// graphFigures.js — the graph half of the quality report: coverage, relation mix, confidence and mapping origin, overall
// and per standard, each named by its hub.
//
// THE REPORT AND THE MCP CANNOT DISAGREE. The overall figures are not recomputed here: they are the answers of the DME's
// own stats and listStandards handlers (dataModelExplorerSearch.js QUERY_HANDLER_BY_QUERY_TYPE), the same code that
// answers standards_stats and standards_standards. The per-standard breakdowns are new queries, written to the same
// rules (the coverage rule is getStats' isMapped, the hub policy is its excludeHub), and every breakdown is summed and
// checked against the handler's total before it is used. A breakdown that does not sum to the MCP's figure is refused
// by name (breakdownDisagreesWithMcp): the report is not written rather than printing two numbers for one thing.
//
//   readGraphFigures({ session, rules }, callback(errText, graphFigures))
//     graphFigures = { mcpStats, mcpStandardList, hubList, coverageByStandard, edgeRowList, judgeCertaintyRowList,
//                      crossCheckList }
//   (pure) summarizeEdgeRowList({ edgeRowList, rules }) -> { relationCountByHub, originCountByHub, confidenceCountByHub, ... }
//
// Units: a PROPERTY is a DmeProperty node (a SIF Question or PESC element declaration counts once, mapped when it or one of
// its HAS_INSTANCE instances carries the edge, as getStats counts it); an EDGE is one match edge in the graph (SIF and PESC
// carry theirs on instances, so one property can own many edges).

const path = require('path');
const { pipeRunner, taskListPlus, mergeArgs } = new (require('qtools-asynchronous-pipe-plus'))();

const DME_DIR_PATH = path.join(__dirname, '..', '..', 'data-model-explorer');
const { QUERY_HANDLER_BY_QUERY_TYPE } = require(path.join(DME_DIR_PATH, 'dataModelExplorerSearch'));
const { runCypherQuery } = require(path.join(DME_DIR_PATH, 'lib', 'runCypherQuery'));

const plainNumberOf = (storedNumber) => (storedNumber !== null && typeof storedNumber === 'object' && typeof storedNumber.toNumber === 'function' ? storedNumber.toNumber() : storedNumber);
const plainRowListOf = (queryResult) => queryResult.records.map((oneRecord) => Object.fromEntries(oneRecord.keys.map((fieldName) => [fieldName, plainNumberOf(oneRecord.get(fieldName))])));

const edgeTypeNameListOf = (rules) => rules.relationList.map((oneRelation) => oneRelation.edgeTypeName);

// getStats' coverage rule, grouped by standard: mapped = the property, or one of its instances, has an edge into a hub card
const COVERAGE_BY_STANDARD_CYPHER = `
	MATCH (f:ForgedNode {role: 'DmeProperty'}) WHERE NOT f._source IN $hubSourceList
	WITH f, ((f)-->(:HubReference) OR (f)-[:HAS_INSTANCE]->(:ForgedNode)-->(:HubReference)) AS isMapped
	RETURN f._source AS standardSource, count(f) AS totalPropertyCount, count(CASE WHEN isMapped THEN 1 END) AS mappedPropertyCount
	ORDER BY standardSource`;

// getStats' mappedPropertyCountByHub rule, grouped by standard
const MAPPED_BY_STANDARD_AND_HUB_CYPHER = `
	MATCH (f:ForgedNode {role: 'DmeProperty'}) WHERE NOT f._source IN $hubSourceList
	MATCH (f)-[:HAS_INSTANCE*0..1]->(:ForgedNode)-->(card:HubReference)
	RETURN f._source AS standardSource, card.hubName AS hubName, count(DISTINCT f) AS mappedPropertyCount`;

const edgeRowCypherFor = (edgeTypeNameList) => `
	MATCH (owner:ForgedNode)-[m:${edgeTypeNameList.join('|')}]->(card:HubReference)
	RETURN owner._source AS standardSource, card.hubName AS hubName, type(m) AS edgeTypeName, m.mappingKind AS mappingKind,
	       m.mappingSource AS mappingSource, m.matchBasis AS matchBasis, m.mappingConfidence AS mappingConfidence, count(m) AS edgeCount`;

const judgeCertaintyCypherFor = (edgeTypeNameList) => `
	MATCH ()-[m:${edgeTypeNameList.join('|')}]->(card:HubReference) WHERE m.judgeTopProbability IS NOT NULL
	RETURN card.hubName AS hubName, toInteger(floor(m.judgeTopProbability / $bucketWidth)) AS bucketIndex,
	       count(m) AS edgeCount, count(CASE WHEN m.judgeRunnerUpMargin < $bucketWidth THEN 1 END) AS closeCallEdgeCount`;

const runHandler = (handlerName, session, callback) => QUERY_HANDLER_BY_QUERY_TYPE[handlerName](session, {}, {}, callback);

const sumOf = (numberList) => numberList.reduce((soFar, oneNumber) => soFar + oneNumber, 0);

// every breakdown checked against the MCP's own total; a mismatch is the refusal breakdownDisagreesWithMcp
const crossCheckListOf = ({ mcpStats, mcpStandardList, coverageByStandard, edgeRowList, rules }) => {
	const checkList = [];
	const check = (checkName, mcpFigure, breakdownFigure) => checkList.push({ checkName, mcpFigure, breakdownFigure, isEqual: mcpFigure === breakdownFigure });
	check('coverage.totalProperties', mcpStats.coverage.totalProperties, sumOf(coverageByStandard.map((oneRow) => oneRow.totalPropertyCount)));
	check('coverage.mappedProperties', mcpStats.coverage.mappedProperties, sumOf(coverageByStandard.map((oneRow) => oneRow.mappedPropertyCount)));
	Object.keys(mcpStats.coverage.mappedPropertyCountByHub).forEach((hubName) => {
		check(`coverage.mappedPropertyCountByHub.${hubName}`, mcpStats.coverage.mappedPropertyCountByHub[hubName], sumOf(coverageByStandard.map((oneRow) => oneRow.mappedPropertyCountByHub[hubName] || 0)));
	});
	edgeTypeNameListOf(rules).forEach((edgeTypeName) => {
		check(`mappings.${edgeTypeName}`, mcpStats.mappings[edgeTypeName] || 0, sumOf(edgeRowList.filter((oneRow) => oneRow.edgeTypeName === edgeTypeName).map((oneRow) => oneRow.edgeCount)));
	});
	mcpStandardList.forEach((standardRow) => {
		Object.keys(standardRow.hubMatchEdgeCountByHub).forEach((hubName) => {
			check(`standards.${standardRow.source}.hubMatchEdgeCountByHub.${hubName}`, standardRow.hubMatchEdgeCountByHub[hubName], sumOf(edgeRowList.filter((oneRow) => oneRow.standardSource === standardRow.source && oneRow.hubName === hubName).map((oneRow) => oneRow.edgeCount)));
		});
	});
	return checkList;
};

const readGraphFigures = ({ session, rules }, callback) => {
	const edgeTypeNameList = edgeTypeNameListOf(rules);
	const taskList = new taskListPlus();
	taskList.push((args, next) => runHandler('stats', session, mergeArgs(args, next, 'mcpStats')));
	taskList.push((args, next) => runHandler('listStandards', session, mergeArgs(args, next, 'mcpStandardsAnswer')));
	taskList.push((args, next) => runCypherQuery(session, COVERAGE_BY_STANDARD_CYPHER, { hubSourceList: args.mcpStats.coverage.hubStandardList }, mergeArgs(args, next, 'coverageResult')));
	taskList.push((args, next) => runCypherQuery(session, MAPPED_BY_STANDARD_AND_HUB_CYPHER, { hubSourceList: args.mcpStats.coverage.hubStandardList }, mergeArgs(args, next, 'mappedByHubResult')));
	taskList.push((args, next) => runCypherQuery(session, edgeRowCypherFor(edgeTypeNameList), {}, mergeArgs(args, next, 'edgeResult')));
	taskList.push((args, next) => runCypherQuery(session, judgeCertaintyCypherFor(edgeTypeNameList), { bucketWidth: rules.judgeCertaintyBucketWidth }, mergeArgs(args, next, 'judgeCertaintyResult')));

	pipeRunner(taskList.getList(), {}, (err, args) => {
		if (err) {
			callback(`graphFigures: ${err}`);
			return;
		}
		const { mcpStats, mcpStandardsAnswer } = args;
		if (!mcpStandardsAnswer || !Array.isArray(mcpStandardsAnswer.standards)) {
			callback(`graphFigures: the listStandards handler answered without a standards list: ${JSON.stringify(mcpStandardsAnswer).slice(0, 300)}`);
			return;
		}
		const mcpStandardList = mcpStandardsAnswer.standards;
		const mappedByHubRowList = plainRowListOf(args.mappedByHubResult);
		const coverageByStandard = plainRowListOf(args.coverageResult).map((oneRow) => ({
			...oneRow,
			mappedPropertyCountByHub: Object.fromEntries(mappedByHubRowList.filter((hubRow) => hubRow.standardSource === oneRow.standardSource).map((hubRow) => [hubRow.hubName, hubRow.mappedPropertyCount])),
		}));
		const edgeRowList = plainRowListOf(args.edgeResult);
		const judgeCertaintyRowList = plainRowListOf(args.judgeCertaintyResult);
		const crossCheckList = crossCheckListOf({ mcpStats, mcpStandardList, coverageByStandard, edgeRowList, rules });
		const failedCheckList = crossCheckList.filter((oneCheck) => !oneCheck.isEqual);
		if (failedCheckList.length > 0) {
			callback(`graphFigures: breakdownDisagreesWithMcp: ${failedCheckList.map((oneCheck) => `${oneCheck.checkName} MCP ${oneCheck.mcpFigure} vs breakdown ${oneCheck.breakdownFigure}`).join('; ')}`);
			return;
		}
		// a hub's name is its standard's source (getStats lists hubStandardList by source and mappedPropertyCountByHub by hubName)
		const hubNameList = Object.keys(mcpStats.coverage.mappedPropertyCountByHub);
		const hubList = mcpStandardList.filter((standardRow) => standardRow.isHub).map((standardRow) => ({ hubName: standardRow.source, hubDisplayName: standardRow.name, hubVersion: standardRow.version }));
		const unnamedHub = hubList.find((oneHub) => hubNameList.indexOf(oneHub.hubName) === -1);
		if (unnamedHub || hubList.length !== hubNameList.length) {
			callback(`graphFigures: hubNameMismatch: hub standards ${JSON.stringify(hubList.map((oneHub) => oneHub.hubName))} are not the hubs coverage names ${JSON.stringify(hubNameList)}`);
			return;
		}
		callback('', { mcpStats, mcpStandardList, hubList, coverageByStandard, edgeRowList, judgeCertaintyRowList, crossCheckList });
	});
};

// ---------------------------------------------------------------- pure summaries

const labelOf = ({ rowList, matchFieldName, labelFieldName, storedValue, listName }) => {
	const matchedRow = rowList.find((oneRow) => oneRow[matchFieldName] === storedValue);
	if (!matchedRow) {
		throw new Error(`graphFigures: the graph holds ${matchFieldName} ${JSON.stringify(storedValue)}, which qualityReportRules.json ${listName} does not name; add it there before reporting`);
	}
	return matchedRow[labelFieldName];
};

// edge rows filtered by a predicate, counted by relation, origin and confidence band; every stored value must be named in the rules
const edgeMixOf = ({ edgeRowList, rules }) => {
	const relationCount = Object.fromEntries(rules.relationList.map((oneRelation) => [oneRelation.relationLabel, 0]));
	const originCount = Object.fromEntries(rules.mappingOriginList.map((oneOrigin) => [oneOrigin.originLabel, 0]));
	const confidenceCount = Object.fromEntries(rules.confidenceBandList.map((oneBand) => [oneBand.bandLabel, 0]));
	let confidenceNotApplicableCount = 0;
	const mappingSourceCount = {};
	edgeRowList.forEach((oneRow) => {
		relationCount[labelOf({ rowList: rules.relationList, matchFieldName: 'edgeTypeName', labelFieldName: 'relationLabel', storedValue: oneRow.edgeTypeName, listName: 'relationList' })] += oneRow.edgeCount;
		originCount[labelOf({ rowList: rules.mappingOriginList, matchFieldName: 'mappingKind', labelFieldName: 'originLabel', storedValue: oneRow.mappingKind, listName: 'mappingOriginList' })] += oneRow.edgeCount;
		if (oneRow.mappingConfidence === null || oneRow.mappingConfidence === undefined) {
			confidenceNotApplicableCount += oneRow.edgeCount;
		} else {
			confidenceCount[labelOf({ rowList: rules.confidenceBandList, matchFieldName: 'mappingConfidence', labelFieldName: 'bandLabel', storedValue: oneRow.mappingConfidence, listName: 'confidenceBandList' })] += oneRow.edgeCount;
		}
		mappingSourceCount[oneRow.mappingSource] = (mappingSourceCount[oneRow.mappingSource] || 0) + oneRow.edgeCount;
	});
	return { edgeCount: sumOf(edgeRowList.map((oneRow) => oneRow.edgeCount)), relationCount, originCount, confidenceCount, confidenceNotApplicableCount, mappingSourceCount };
};

const judgeCertaintyByHubOf = ({ judgeCertaintyRowList, rules }) => {
	const bucketCount = Math.round(1 / rules.judgeCertaintyBucketWidth);
	return judgeCertaintyRowList.reduce((soFar, oneRow) => {
		const hubCertainty = soFar[oneRow.hubName] || { edgeCountByBucket: new Array(bucketCount).fill(0), closeCallEdgeCount: 0, edgeCount: 0 };
		// a top probability of exactly 1.0 falls in the last bucket, not in a bucket of its own
		hubCertainty.edgeCountByBucket[Math.min(oneRow.bucketIndex, bucketCount - 1)] += oneRow.edgeCount;
		hubCertainty.closeCallEdgeCount += oneRow.closeCallEdgeCount;
		hubCertainty.edgeCount += oneRow.edgeCount;
		return { ...soFar, [oneRow.hubName]: hubCertainty };
	}, {});
};

module.exports = { readGraphFigures, edgeMixOf, judgeCertaintyByHubOf, crossCheckListOf, sumOf };
