'use strict';

// buildSample.js — the -buildSample action: frames → kinds → exclusions → draw → split → deal → sample.json + report.
//
//   buildSample({ raterToolConfig, outputDirPath, readConfigJson }, callback(errText, resultText))

const fs = require('fs');
const path = require('path');
const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
const { openRaterGraph } = require('../../../../server/data-model/lib/rater-tool/rater-graph');
const { FRAME_READER_BY_STANDARD, GROUP_SIGNATURE_BY_STANDARD, FRAME_RULE_LIST } = require('./frameReaders');
const { groupFrame, classifyKind, applyExclusions, drawStandard, splitDevSealed, dealSurveys } = require('./sampleBuilder');
const { writeSampleReport } = require('./sampleReport');

// the fields sample.json carries per element; the build-time match fields stay out
const SAMPLE_ELEMENT_FIELD_LIST = Object.freeze(['elementStableId', 'surveyName', 'standard', 'subStandardName', 'kind', 'splitHalf', 'name', 'definition', 'definitionAbsentReason', 'dataTypeText', 'optionSetName', 'optionValueSampleList', 'ownerName', 'ownerDefinition', 'ownerDefinitionAbsentReason', 'path', 'documentationUrl', 'memberCount', 'memberPathList', 'isMappedInGold', 'memberStableIdList']);

const byText = (textA, textB) => (textA < textB ? -1 : textA > textB ? 1 : 0);

const buildSample = ({ raterToolConfig, outputDirPath, readConfigJson }, callback) => {
	const drawConfig = readConfigJson('raterDraw.json');
	const { exclusionList } = readConfigJson('sampleExclusionList.json');
	const kindRuleRegistry = readConfigJson('kindRuleRegistry.json');
	const taskList = new taskListPlus();

	taskList.push((args, next) => {
		openRaterGraph({ goldenContainerName: raterToolConfig.goldenContainerName, queryTimeoutMs: parseInt(raterToolConfig.queryTimeoutMs, 10) }, (openError, openResult) => {
			if (openError) {
				next(openError, args);
				return;
			}
			if (openResult.refusal) {
				next(`${openResult.refusal.refusalName}: ${openResult.refusal.refusalText}`, args);
				return;
			}
			next('', { ...args, raterGraph: openResult.raterGraph });
		});
	});

	drawConfig.standardNameList.forEach((standardName) => {
		taskList.push((args, next) => {
			FRAME_READER_BY_STANDARD[standardName]({ raterGraph: args.raterGraph, drawConfig }, (frameError, memberRowList) => {
				if (frameError) {
					next(frameError, args);
					return;
				}
				const groupSignatureOf = GROUP_SIGNATURE_BY_STANDARD[standardName];
				const elementCountBefore = groupFrame({ standardName, memberRowList, groupSignatureOf }).length;
				// revision 2 frame rules, applied to member rows in order; each rule's removals are counted for the report
				const ruleReportList = [];
				const keptMemberRowList = FRAME_RULE_LIST.filter((frameRule) => frameRule.appliesTo(standardName)).reduce((rowsSoFar, frameRule) => {
					const keptRowList = rowsSoFar.filter((memberRow) => !frameRule.excludes(memberRow));
					ruleReportList.push({ ruleName: frameRule.ruleName, removedMemberCount: rowsSoFar.length - keptRowList.length });
					return keptRowList;
				}, memberRowList);
				const elementList = groupFrame({ standardName, memberRowList: keptMemberRowList, groupSignatureOf })
					.map((element) => ({ ...element, kind: classifyKind({ standardName, element, kindRuleRegistry }) }));
				next('', { ...args, frameByStandard: { ...args.frameByStandard, [standardName]: { memberRowCount: memberRowList.length, keptMemberRowCount: keptMemberRowList.length, elementCountBefore, ruleReportList, elementList } } });
			});
		});
	});

	taskList.push((args, next) => {
		args.raterGraph.close();
		const exclusionReportListByStandard = {};
		const drawReportByStandard = {};
		const drawnElementListByStandard = drawConfig.standardNameList.reduce((soFar, standardName) => {
			const { keptElementList, exclusionReportList } = applyExclusions({ elementList: args.frameByStandard[standardName].elementList, exclusionList: exclusionList.filter((exclusion) => exclusion.standard === standardName) });
			exclusionReportListByStandard[standardName] = exclusionReportList;
			const { drawnElementList, partReportByName } = drawStandard({ standardName, elementList: keptElementList, drawConfig });
			drawReportByStandard[standardName] = { keptCount: keptElementList.length, partReportByName };
			return { ...soFar, [standardName]: splitDevSealed({ standardName, drawnElementList, drawConfig }) };
		}, {});
		const dealtElementListByStandard = dealSurveys({ drawnElementListByStandard, drawConfig });
		const sampleElementList = drawConfig.standardNameList
			.reduce((soFar, standardName) => soFar.concat(dealtElementListByStandard[standardName]), [])
			.map((element) => SAMPLE_ELEMENT_FIELD_LIST.reduce((fieldsSoFar, fieldName) => ({ ...fieldsSoFar, [fieldName]: element[fieldName] }), {}))
			.sort((elementA, elementB) => byText(elementA.surveyName, elementB.surveyName) || byText(elementA.standard, elementB.standard) || byText(elementA.elementStableId, elementB.elementStableId));
		const sampleDocument = {
			sampleFormatVersion: 2,
			goldenContainerName: raterToolConfig.goldenContainerName,
			sampleSeedText: drawConfig.sampleSeedText,
			perStandardDrawCount: drawConfig.perStandardDrawCount,
			surveyNameList: drawConfig.surveyNameList,
			// the populations the draw came from, for re-weighting scores: per standard, mapped / unmapped frame sizes
			frameMappedCountByStandard: drawConfig.standardNameList.reduce((soFar, standardName) => ({ ...soFar, [standardName]: { mapped: drawReportByStandard[standardName].partReportByName.mapped.frameCount, unmapped: drawReportByStandard[standardName].partReportByName.unmapped.frameCount } }), {}),
			frameKindCountByStandardAndPart: drawConfig.standardNameList.reduce((soFar, standardName) => ({ ...soFar, [standardName]: { mapped: drawReportByStandard[standardName].partReportByName.mapped.kindCountByName, unmapped: drawReportByStandard[standardName].partReportByName.unmapped.kindCountByName } }), {}),
			drawCountByPart: drawConfig.drawCountByPart,
			elementCount: sampleElementList.length,
			elementList: sampleElementList,
		};
		const sampleFilePath = path.join(outputDirPath, 'sample.json');
		fs.writeFileSync(sampleFilePath, `${JSON.stringify(sampleDocument, null, '\t')}\n`);
		const reportFilePath = path.join(outputDirPath, 'sample-report.md');
		writeSampleReport({ reportFilePath, drawConfig, kindRuleRegistry, frameByStandard: args.frameByStandard, exclusionReportListByStandard, drawReportByStandard, sampleDocument });
		next('', { ...args, resultText: `wrote ${sampleFilePath} (${sampleElementList.length} elements) and ${reportFilePath}` });
	});

	pipeRunner(taskList.getList(), { frameByStandard: {} }, (err, args) => {
		if (err) {
			if (args && args.raterGraph) {
				args.raterGraph.close();
			}
			callback(err);
			return;
		}
		callback('', args.resultText);
	});
};

module.exports = buildSample;
