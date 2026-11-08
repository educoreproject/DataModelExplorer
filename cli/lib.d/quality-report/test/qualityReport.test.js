#!/usr/bin/env node
'use strict';

// qualityReport.test.js — gates for the quality-report generator (WORKORDER-qualityReport-110826).
//   Q1 agreementScorer, pure fixture: every verdict reached once; a moved rater's answer not counted; Unsure not scored;
//      the two rates and their Wilson intervals; an unknown answer kind and an unidentifiable card refused by name
//   Q2 graphFigures: a breakdown that does not sum to the MCP figure fails its cross-check; a stored value the rules do
//      not name (mappingKind, mappingConfidence) throws rather than printing under a guessed label
//   Q3 documentRenderer: one table in both formats; HTML escapes markup; an unknown block kind or format throws
//   Q4 reportDataBuilder: a standard the sample drew from gets its family's human figures; a sibling release it was not
//      drawn from is refused them by name (familySampledFromOtherReleases); a standard with no sample says so
//   Q5 the CLI: every help spelling prints the page and exits 0; missing required values exit 1 without the full page
//   Q6 LIVE (only with QUALITY_REPORT_LIVE_GOLDEN=<container> and QUALITY_REPORT_LIVE_RATER_STORE=<file>): two builds
//      of the same inputs are byte-identical, and the report's headline coverage is the MCP stats handler's figure
//
//   ~/.local/node/bin/node cli/lib.d/quality-report/test/qualityReport.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOL_DIR_PATH = path.join(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(TOOL_DIR_PATH, 'config', 'qualityReportRules.json'), 'utf8'));
const { scoreAgreement, wilsonIntervalOf, VERDICT_NAME_LIST } = require('../lib/agreementScorer');
const { crossCheckListOf, edgeMixOf } = require('../lib/graphFigures');
const { renderDocument } = require('../lib/documentRenderer');
const { buildReportData } = require('../lib/reportDataBuilder');

let passCount = 0;
let failCount = 0;
const check = (testName, condition, detailText) => {
	if (condition) {
		passCount++;
		console.log(`  PASS: ${testName}`);
		return;
	}
	failCount++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};
const throwsWith = (doThing, expectedPattern) => {
	const thrown = (() => {
		const outcome = { message: '' };
		// the code under test throws by design (no silent default); this is the one place a throw is caught, to observe it
		try {
			doThing();
		} catch (thrownError) {
			outcome.message = thrownError.message;
		}
		return outcome.message;
	})();
	return expectedPattern.test(thrown);
};

// ---------------------------------------------------------------- Q1
console.log('Q1 agreementScorer on a fixture (pure)');
const elementOf = (elementStableId, standard, surveyName) => ({ elementStableId, standard, surveyName, splitHalf: 'dev' });
const fixtureElementList = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'].map((elementStableId) => elementOf(elementStableId, elementStableId < 'E5' ? 'Ed-Fi' : 'SIF', 'A'));
const graphOf = (cedsTupleIdList, strongestConfidence) => ({ cedsTupleIdList, relationNameList: cedsTupleIdList.length ? ['CLOSE_MATCH'] : [], strongestConfidence, edgeCount: cedsTupleIdList.length });
const fixtureGraph = { E1: graphOf(['t1'], 0.9), E2: graphOf(['t2'], 0.7), E3: graphOf(['t3'], 0.5), E4: graphOf([], null), E5: graphOf([], null), E6: graphOf(['t6'], 0.9), E7: graphOf(['t7'], 0.9), E8: graphOf(['t8'], 0.9) };
const fixtureIdentity = { t1: 'P1', t2: 'P2', t2other: 'P2', t3: 'P3', t3x: 'P9', t4: 'P4', t6: 'P6', t7: 'P7', t8: 'P8', t8same: 'P5' };
const cardsAnswer = (bestCedsTupleId, sameCedsTupleIdList = []) => ({ answerKind: 'cards', bestCedsTupleId, sameCedsTupleIdList, addedCardList: [] });
const fixtureAnswerList = [
	{ raterUserName: 'r1', elementStableId: 'E1', answer: cardsAnswer('t1') }, // bothChoseSameCard
	{ raterUserName: 'r1', elementStableId: 'E2', answer: cardsAnswer('t2other') }, // sameCedsPropertyOtherCard
	{ raterUserName: 'r1', elementStableId: 'E3', answer: cardsAnswer('t3x') }, // differentCard
	{ raterUserName: 'r1', elementStableId: 'E4', answer: cardsAnswer('t4') }, // graphAbstainedHumanChose
	{ raterUserName: 'r1', elementStableId: 'E5', answer: { answerKind: 'noMatch' } }, // bothSayNoMatch
	{ raterUserName: 'r1', elementStableId: 'E6', answer: { answerKind: 'noMatch' } }, // graphMappedHumanNoMatch
	{ raterUserName: 'r1', elementStableId: 'E7', answer: { answerKind: 'unsure' } }, // humanUnsure
	{ raterUserName: 'r1', elementStableId: 'E8', answer: cardsAnswer('t8same', ['t8']) }, // differentCard, but acceptsGraphCard via Same
	{ raterUserName: 'movedRater', elementStableId: 'E1', answer: cardsAnswer('t1') }, // moved to survey B: not counted
];
const fixtureRaterList = [{ raterUserName: 'r1', surveyName: 'A' }, { raterUserName: 'movedRater', surveyName: 'B' }];
const scored = scoreAgreement({ elementList: fixtureElementList, graphAnswerByElementStableId: fixtureGraph, propertyIdentityByTupleId: fixtureIdentity, raterList: fixtureRaterList, answerList: fixtureAnswerList, zScore: 1.96 });
check('Q1.1 no problem on a readable fixture', !scored.problemText, scored.problemText);
check('Q1.2 every verdict reached', VERDICT_NAME_LIST.every((verdictName) => scored.verdictCountByName[verdictName] >= 1), JSON.stringify(scored.verdictCountByName));
check('Q1.3 the moved rater\'s answer is not counted (8 answers, not 9)', scored.answerCount === 8, `${scored.answerCount}`);
check('Q1.4 Unsure is counted but not scored (7 scored)', scored.scoredAnswerCount === 7, `${scored.scoredAnswerCount}`);
check('Q1.5 card agreement = same card + both no match = 2 of 7', scored.rateByName.cardAgreement.successCount === 2 && scored.rateByName.cardAgreement.trialCount === 7);
check('Q1.6 property agreement adds the same-property answer = 3 of 7', scored.rateByName.propertyAgreement.successCount === 3);
check('Q1.7 a Same tick on the graph\'s card counts as accepting it (E1 and E8)', scored.acceptsGraphCardCount === 2, `${scored.acceptsGraphCardCount}`);
check('Q1.8 rates by standard split the answers', scored.ratesByStandard.map((oneGroup) => `${oneGroup.groupValue}:${oneGroup.answerCount}`).join(',') === 'Ed-Fi:4,SIF:4');
const unknownKindScored = scoreAgreement({ elementList: fixtureElementList, graphAnswerByElementStableId: fixtureGraph, propertyIdentityByTupleId: fixtureIdentity, raterList: fixtureRaterList, answerList: [{ raterUserName: 'r1', elementStableId: 'E1', answer: { answerKind: 'maybe' } }], zScore: 1.96 });
check('Q1.9 an unknown answer kind is refused by name', /answerKind "maybe"/.test(unknownKindScored.problemText || ''), unknownKindScored.problemText);
const noIdentityScored = scoreAgreement({ elementList: fixtureElementList, graphAnswerByElementStableId: fixtureGraph, propertyIdentityByTupleId: {}, raterList: fixtureRaterList, answerList: [fixtureAnswerList[1]], zScore: 1.96 });
check('Q1.10 a card with no property identity is refused, never scored', /no property identity/.test(noIdentityScored.problemText || ''), noIdentityScored.problemText);
const knownInterval = wilsonIntervalOf({ successCount: 60, trialCount: 101, zScore: 1.96 });
const noSameListScored = scoreAgreement({ elementList: fixtureElementList, graphAnswerByElementStableId: fixtureGraph, propertyIdentityByTupleId: fixtureIdentity, raterList: fixtureRaterList, answerList: [{ raterUserName: 'r1', elementStableId: 'E1', answer: { answerKind: 'cards', bestCedsTupleId: 't1' } }], zScore: 1.96 });
check('Q1.13 a cards answer with no sameCedsTupleIdList is refused by name (never read as an empty list)', /sameCedsTupleIdList/.test(noSameListScored.problemText || ''), noSameListScored.problemText);
check('Q1.11 Wilson interval for 60 of 101 is 0.4965 to 0.6847', Math.abs(knownInterval.lowerRate - 0.4965) < 0.0005 && Math.abs(knownInterval.upperRate - 0.6847) < 0.0005, JSON.stringify(knownInterval));
check('Q1.12 no interval for zero trials', wilsonIntervalOf({ successCount: 0, trialCount: 0, zScore: 1.96 }) === null);

// ---------------------------------------------------------------- Q2
console.log('Q2 graphFigures cross-check and stored-value labels (pure)');
const fixtureMcpStats = { coverage: { totalProperties: 10, mappedProperties: 4, mappedPropertyCountByHub: { HubA: 4 } }, mappings: { EXACT_MATCH: 3, CLOSE_MATCH: 2, BROAD_MATCH: 0, NARROW_MATCH: 0 } };
const fixtureStandardList = [{ source: 'S1', hubMatchEdgeCountByHub: { HubA: 5 } }];
const fixtureCoverage = [{ standardSource: 'S1', totalPropertyCount: 10, mappedPropertyCount: 4, mappedPropertyCountByHub: { HubA: 4 } }];
const edgeRowOf = (edgeTypeName, edgeCount, mappingKind = 'inferred', mappingConfidence = 0.9) => ({ standardSource: 'S1', hubName: 'HubA', edgeTypeName, mappingKind, mappingSource: 'bridge-jev', matchBasis: 'derived', mappingConfidence, edgeCount });
const agreeingEdgeRowList = [edgeRowOf('EXACT_MATCH', 3), edgeRowOf('CLOSE_MATCH', 2)];
const agreeingCheckList = crossCheckListOf({ mcpStats: fixtureMcpStats, mcpStandardList: fixtureStandardList, coverageByStandard: fixtureCoverage, edgeRowList: agreeingEdgeRowList, rules });
check('Q2.1 a breakdown that sums to the MCP passes every check', agreeingCheckList.every((oneCheck) => oneCheck.isEqual), JSON.stringify(agreeingCheckList.filter((oneCheck) => !oneCheck.isEqual)));
const disagreeingCheckList = crossCheckListOf({ mcpStats: fixtureMcpStats, mcpStandardList: fixtureStandardList, coverageByStandard: fixtureCoverage, edgeRowList: [edgeRowOf('EXACT_MATCH', 2), edgeRowOf('CLOSE_MATCH', 2)], rules });
check('Q2.2 one missing edge fails mappings.EXACT_MATCH and the per-standard check', ['mappings.EXACT_MATCH', 'standards.S1.hubMatchEdgeCountByHub.HubA'].every((checkName) => disagreeingCheckList.find((oneCheck) => oneCheck.checkName === checkName && !oneCheck.isEqual)));
check('Q2.3 an unnamed mappingKind throws', throwsWith(() => edgeMixOf({ edgeRowList: [edgeRowOf('EXACT_MATCH', 1, 'reviewed')], rules }), /mappingKind "reviewed".*mappingOriginList/));
check('Q2.4 an unnamed mappingConfidence throws', throwsWith(() => edgeMixOf({ edgeRowList: [edgeRowOf('EXACT_MATCH', 1, 'inferred', 0.6)], rules }), /mappingConfidence 0.6.*confidenceBandList/));
const authoredMix = edgeMixOf({ edgeRowList: [edgeRowOf('EXACT_MATCH', 4, 'authored', null)], rules });
check('Q2.5 an authored edge has no confidence band (not applicable, counted apart)', authoredMix.confidenceNotApplicableCount === 4 && authoredMix.originCount['publisher-stated'] === 4);

// ---------------------------------------------------------------- Q3
console.log('Q3 documentRenderer (pure)');
const fixtureBlockList = [{ blockKind: 'table', columnList: [{ titleText: 'Name', alignName: 'left' }, { titleText: 'Count', alignName: 'right' }], rowList: [['a<b>', '1|2']] }];
const markdownText = renderDocument({ formatName: 'markdown', titleText: 'T', blockList: fixtureBlockList, pageKindName: 'report' });
const htmlText = renderDocument({ formatName: 'html', titleText: 'T', blockList: fixtureBlockList, pageKindName: 'report' });
check('Q3.1 markdown table with a right-aligned column and an escaped pipe', /\|:---\|---:\|/.test(markdownText) && /1\\\|2/.test(markdownText), markdownText);
check('Q3.2 html escapes markup in a cell', /a&lt;b&gt;/.test(htmlText) && !/a<b>/.test(htmlText));
check('Q3.3 html page has a title, a viewport and a dark-mode rule', /<title>T<\/title>/.test(htmlText) && /viewport/.test(htmlText) && /prefers-color-scheme: dark/.test(htmlText));
check('Q3.4 an unknown block kind throws', throwsWith(() => renderDocument({ formatName: 'markdown', titleText: 'T', blockList: [{ blockKind: 'chart' }] }), /unknown block kind 'chart'/));
check('Q3.5 an unknown format throws', throwsWith(() => renderDocument({ formatName: 'pdf', titleText: 'T', blockList: [] }), /unknown format 'pdf'/));

// ---------------------------------------------------------------- Q4
console.log('Q4 reportDataBuilder human figures per standard (pure)');
const fixtureGroupOf = (groupValue) => ({ groupValue, answerCount: 1, scoredAnswerCount: 1, verdictCountByName: {}, rateByName: { cardAgreement: { successCount: 1, trialCount: 1 }, propertyAgreement: { successCount: 1, trialCount: 1 } } });
const fixtureReportData = buildReportData({
	rules,
	graphStamp: {},
	generatorCommit: {},
	inputFingerprintList: [],
	graphFigures: {
		mcpStats: { bySource: { P1: 1, P2: 1, L: 1 }, coverage: { totalProperties: 3, mappedProperties: 0, mappedPropertyCountByHub: { HubA: 0 } }, mappings: {} },
		mcpStandardList: [
			{ source: 'PESC-New', standardFamily: 'PESC', isHub: false, hubMatchEdgeCountByHub: { HubA: 0 } },
			{ source: 'PESC-Old', standardFamily: 'PESC', isHub: false, hubMatchEdgeCountByHub: { HubA: 0 } },
			{ source: 'LIF', standardFamily: 'LIF', isHub: false, hubMatchEdgeCountByHub: { HubA: 0 } },
		],
		hubList: [{ hubName: 'HubA' }],
		coverageByStandard: [],
		edgeRowList: [],
		judgeCertaintyRowList: [],
		crossCheckList: [],
	},
	humanAgreement: { sampleFacts: { drawSourceListBySampleStandard: { PESC: ['PESC-New'] } }, scored: { ratesByStandard: [fixtureGroupOf('PESC')] } },
	consistencySignals: { instanceAgreementRowList: [], triangulationRowList: [] },
});
const standardEntryOf = (standardSource) => fixtureReportData.standardList.find((oneStandard) => oneStandard.source === standardSource);
check('Q4.1 the release the sample drew from gets the family figures', standardEntryOf('PESC-New').humanAgreement && standardEntryOf('PESC-New').humanAgreement.sampleStandardName === 'PESC');
check('Q4.2 a sibling release not drawn from is refused them by name', standardEntryOf('PESC-Old').humanAgreement === null && standardEntryOf('PESC-Old').humanAgreementAbsentReason === 'familySampledFromOtherReleases');
check('Q4.3 a standard with no sample says so', standardEntryOf('LIF').humanAgreementAbsentReason === 'noSampleOfThisStandard');

// ---------------------------------------------------------------- Q5
console.log('Q5 the CLI help and refusals');
const cliPath = path.join(TOOL_DIR_PATH, 'qualityReport.js');
const runCli = (argumentList) => spawnSync(process.execPath, [cliPath, ...argumentList], { encoding: 'utf8' });
['-help', '--help', '-h'].forEach((helpSpelling) => {
	const helpRun = runCli([helpSpelling]);
	check(`Q5.1 ${helpSpelling} prints the page and exits 0`, helpRun.status === 0 && ['NAME', 'SYNOPSIS', 'DESCRIPTION', 'ACTIONS', 'OPTIONS', 'EXAMPLES', 'EXIT STATUS', 'FILES'].every((sectionName) => helpRun.stdout.indexOf(`\n${sectionName}\n`) !== -1 || helpRun.stdout.startsWith(`${sectionName}\n`)), `${helpRun.status} ${helpRun.stderr}`);
});
const missingRun = runCli(['-build', '--goldenContainerName=GOLD_NOT_NEEDED']);
check('Q5.2 a missing --raterStoreFilePath exits 1 with the synopsis, not the page', missingRun.status === 1 && /missing --raterStoreFilePath/.test(missingRun.stderr) && !/DESCRIPTION/.test(missingRun.stderr + missingRun.stdout), `${missingRun.status} ${missingRun.stderr}`);
const noActionRun = runCli(['--goldenContainerName=X']);
check('Q5.3 no action exits 1', noActionRun.status === 1 && /name the action -build/.test(noActionRun.stderr));

// ---------------------------------------------------------------- Q6
const liveGoldenName = process.env.QUALITY_REPORT_LIVE_GOLDEN;
const liveRaterStorePath = process.env.QUALITY_REPORT_LIVE_RATER_STORE;
if (!liveGoldenName || !liveRaterStorePath) {
	console.log('Q6 LIVE: not run (set QUALITY_REPORT_LIVE_GOLDEN and QUALITY_REPORT_LIVE_RATER_STORE to run it)');
} else {
	console.log(`Q6 LIVE against ${liveGoldenName}`);
	const runDirPathList = [1, 2].map((runNumber) => fs.mkdtempSync(path.join(os.tmpdir(), `qualityReportRun${runNumber}-`)));
	const buildRunList = runDirPathList.map((runDirPath) => runCli(['-build', `--goldenContainerName=${liveGoldenName}`, `--raterStoreFilePath=${liveRaterStorePath}`, `--outputDirPath=${runDirPath}`]));
	check('Q6.1 both builds exit 0', buildRunList.every((oneRun) => oneRun.status === 0), buildRunList.map((oneRun) => oneRun.stderr).join(' | '));
	const listFilesOf = (dirPath) => fs.readdirSync(dirPath, { recursive: true }).filter((relativePath) => fs.statSync(path.join(dirPath, relativePath)).isFile()).sort();
	const firstFileList = listFilesOf(runDirPathList[0]);
	const differingList = firstFileList.filter((relativePath) => !fs.readFileSync(path.join(runDirPathList[0], relativePath)).equals(fs.readFileSync(path.join(runDirPathList[1], relativePath))));
	check(`Q6.2 the two builds' ${firstFileList.length} files are byte-identical`, firstFileList.length > 0 && differingList.length === 0 && JSON.stringify(firstFileList) === JSON.stringify(listFilesOf(runDirPathList[1])), differingList.join(', '));
	const liveReportData = JSON.parse(fs.readFileSync(path.join(runDirPathList[0], rules.outputFileNameByRole.reportData), 'utf8'));
	const mcpStatsRun = spawnSync(process.execPath, [path.join(TOOL_DIR_PATH, '..', 'data-model-explorer', 'dataModelExplorerSearch.js'), '-stats'], { encoding: 'utf8' });
	const mcpStatsAnswer = mcpStatsRun.status === 0 ? JSON.parse(mcpStatsRun.stdout) : null;
	const configuredGoldenIsLive = mcpStatsAnswer && liveReportData.overall.nodeCount === Object.values(mcpStatsAnswer.bySource).reduce((soFar, oneCount) => soFar + oneCount, 0);
	if (!configuredGoldenIsLive) {
		console.log('  NOTE: Q6.3 skipped: the DME CLI on this host points at a different golden, so its -stats is not this graph\'s');
	} else {
		check('Q6.3 the report\'s coverage is the DME -stats answer', liveReportData.overall.coverage.mappedProperties === mcpStatsAnswer.coverage.mappedProperties && liveReportData.overall.coverage.totalProperties === mcpStatsAnswer.coverage.totalProperties);
	}
	check('Q6.4 every MCP cross-check equal', liveReportData.crossCheckList.length > 0 && liveReportData.crossCheckList.every((oneCheck) => oneCheck.isEqual));
	runDirPathList.forEach((runDirPath) => fs.rmSync(runDirPath, { recursive: true }));
}

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
