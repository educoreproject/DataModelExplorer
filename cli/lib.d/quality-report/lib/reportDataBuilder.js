'use strict';

// reportDataBuilder.js — gathers what the readers found into ONE plain object, qualityReportData.json, from which the report
// and every certificate are rendered. Pure: it computes shares and groupings, reads nothing and keeps no clock, so the same
// inputs give byte-identical output (the stamp names the inputs; there is deliberately no "generated at" time).
//
//   buildReportData({ rules, graphStamp, generatorCommit, inputFingerprintList, graphFigures, humanAgreement, consistencySignals })
//     -> reportData (see the returned object; every count says its unit in the builders that print it)

const { edgeMixOf, judgeCertaintyByHubOf, sumOf } = require('./graphFigures');

const shareOf = (partCount, wholeCount) => (wholeCount === 0 ? null : partCount / wholeCount);

const buildReportData = ({ rules, graphStamp, generatorCommit, inputFingerprintList, graphFigures, humanAgreement, consistencySignals }) => {
	const { mcpStats, mcpStandardList, hubList, coverageByStandard, edgeRowList, judgeCertaintyRowList, crossCheckList } = graphFigures;
	const hubNameList = hubList.map((oneHub) => oneHub.hubName);
	const edgeMixByHubOf = (rowList) => Object.fromEntries(hubNameList.map((hubName) => [hubName, edgeMixOf({ edgeRowList: rowList.filter((oneRow) => oneRow.hubName === hubName), rules })]));

	const familyBySampleStandard = rules.humanJudgment.graphFamilyBySampleStandard;
	const { drawSourceListBySampleStandard } = humanAgreement.sampleFacts;
	const humanRatesByFamily = Object.fromEntries(humanAgreement.scored.ratesByStandard.map((oneGroup) => [familyBySampleStandard[oneGroup.groupValue], { sampleStandardName: oneGroup.groupValue, drawSourceList: drawSourceListBySampleStandard[oneGroup.groupValue], ...oneGroup }]));
	// a standard gets its family's human figures only when the sample was drawn from it; a sibling release it was not drawn
	// from says so (humanAgreementAbsentReason) rather than borrowing the family's numbers
	const humanAgreementFieldsFor = (standardRow) => {
		const familyEntry = humanRatesByFamily[standardRow.standardFamily];
		if (!familyEntry) {
			return { humanAgreement: null, humanAgreementAbsentReason: 'noSampleOfThisStandard' };
		}
		if (familyEntry.drawSourceList && familyEntry.drawSourceList.indexOf(standardRow.source) === -1) {
			return { humanAgreement: null, humanAgreementAbsentReason: 'familySampledFromOtherReleases', familyDrawSourceList: familyEntry.drawSourceList };
		}
		return { humanAgreement: familyEntry, humanAgreementAbsentReason: null };
	};

	const standardList = mcpStandardList.map((standardRow) => {
		const coverageRow = coverageByStandard.find((oneRow) => oneRow.standardSource === standardRow.source);
		const standardEdgeRowList = edgeRowList.filter((oneRow) => oneRow.standardSource === standardRow.source);
		return {
			source: standardRow.source,
			name: standardRow.name,
			standardName: standardRow.standardName,
			version: standardRow.version,
			standardFamily: standardRow.standardFamily,
			standardKind: standardRow.standardKind,
			isHub: standardRow.isHub,
			nodeCount: standardRow.nodeCount,
			coverage: coverageRow
				? { totalPropertyCount: coverageRow.totalPropertyCount, mappedPropertyCount: coverageRow.mappedPropertyCount, mappedShare: shareOf(coverageRow.mappedPropertyCount, coverageRow.totalPropertyCount), mappedPropertyCountByHub: Object.fromEntries(hubNameList.map((hubName) => [hubName, coverageRow.mappedPropertyCountByHub[hubName] || 0])) }
				: null,
			edgeCount: sumOf(standardEdgeRowList.map((oneRow) => oneRow.edgeCount)),
			edgeMixByHub: edgeMixByHubOf(standardEdgeRowList),
			...humanAgreementFieldsFor(standardRow),
		};
	});

	const instanceAgreementTotal = consistencySignals.instanceAgreementRowList.reduce(
		(soFar, oneRow) => ({ declarationCount: soFar.declarationCount + oneRow.declarationCount, oneCardDeclarationCount: soFar.oneCardDeclarationCount + oneRow.oneCardDeclarationCount, onePropertyDeclarationCount: soFar.onePropertyDeclarationCount + oneRow.onePropertyDeclarationCount }),
		{ declarationCount: 0, oneCardDeclarationCount: 0, onePropertyDeclarationCount: 0 },
	);

	return {
		reportFormatVersion: rules.reportFormatVersion,
		graphStamp,
		generatorCommit,
		inputFingerprintList,
		overall: {
			nodeCount: sumOf(Object.values(mcpStats.bySource)),
			standardCount: mcpStandardList.length,
			hubList,
			coverage: { ...mcpStats.coverage, mappedShare: shareOf(mcpStats.coverage.mappedProperties, mcpStats.coverage.totalProperties) },
			mcpMappingEdgeCountByType: Object.fromEntries(rules.relationList.map((oneRelation) => [oneRelation.edgeTypeName, mcpStats.mappings[oneRelation.edgeTypeName] || 0])),
			edgeMixAll: edgeMixOf({ edgeRowList, rules }),
			edgeMixByHub: edgeMixByHubOf(edgeRowList),
			judgeCertaintyByHub: judgeCertaintyByHubOf({ judgeCertaintyRowList, rules }),
		},
		standardList,
		humanAgreement: { ...humanAgreement, answerVerdictList: undefined },
		consistency: { ...consistencySignals, instanceAgreementTotal },
		crossCheckList,
		priorMeasurementList: rules.priorMeasurementList,
	};
};

module.exports = { buildReportData, shareOf };
