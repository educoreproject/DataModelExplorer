#!/usr/bin/env node
'use strict';

// raterSample.test.js — Phase 1 gates for `raterTool.js -buildSample` (lane RATER), against the live named gold.
//   T1.1 determinism: two runs with the same seed write byte-identical sample.json
//   T1.2 counts: 50 per standard, 150 in all, 50 per survey, each survey's per-standard count in {16, 17}
//   T1.3 exclusions: none of the 13 excluded elements appears (checked against the gold by this test's own Cypher)
//   T1.4 no duplicates: no elementStableId twice; no two SIF/PESC elements share name + definition + type
//   T1.5 strata: every kind with >= 4 in a standard's frame has >= 4 drawn, or all of it when fewer
//   T1.6 completeness: name, definition (or null with a reason), type, path and owner name on every element
//   T1.7 split: 25 dev / 25 sealed per standard
//
//   /usr/local/bin/node cli/lib.d/rater-tool/test/raterSample.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RATER_TOOL_PATH = path.join(__dirname, '..', 'raterTool.js');
const exclusionList = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'sampleExclusionList.json'), 'utf8')).exclusionList;
const drawConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'raterDraw.json'), 'utf8'));

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

const runBuild = (outputDirPath) => execFileSync(process.execPath, [RATER_TOOL_PATH, '-buildSample', `--outputDirPath=${outputDirPath}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raterSampleTest-'));
const firstRunDirPath = path.join(scratchDirPath, 'run1');
const secondRunDirPath = path.join(scratchDirPath, 'run2');
runBuild(firstRunDirPath);
runBuild(secondRunDirPath);
const firstText = fs.readFileSync(path.join(firstRunDirPath, 'sample.json'), 'utf8');
const secondText = fs.readFileSync(path.join(secondRunDirPath, 'sample.json'), 'utf8');
const sampleDocument = JSON.parse(firstText);
const elementList = sampleDocument.elementList;

console.log('T1.1 determinism');
check('two runs with the same seed give byte-identical sample.json', firstText === secondText && firstText.length > 1000, `lengths ${firstText.length} / ${secondText.length}`);

console.log('T1.2 counts');
check('150 elements in all', elementList.length === 150, `${elementList.length}`);
drawConfig.standardNameList.forEach((standardName) => {
	const standardCount = elementList.filter((element) => element.standard === standardName).length;
	check(`${standardName}: exactly 50`, standardCount === 50, `${standardCount}`);
});
drawConfig.surveyNameList.forEach((surveyName) => {
	const surveyElementList = elementList.filter((element) => element.surveyName === surveyName);
	check(`survey ${surveyName}: exactly 50`, surveyElementList.length === 50, `${surveyElementList.length}`);
	drawConfig.standardNameList.forEach((standardName) => {
		const cellCount = surveyElementList.filter((element) => element.standard === standardName).length;
		check(`survey ${surveyName} ${standardName}: count in {16, 17}`, cellCount === 16 || cellCount === 17, `${cellCount}`);
	});
});

console.log('T1.4 no duplicates');
const stableIdList = elementList.map((element) => element.elementStableId);
check('no elementStableId appears twice', new Set(stableIdList).size === stableIdList.length);
const contentSignatureList = elementList.filter((element) => element.standard !== 'Ed-Fi').map((element) => JSON.stringify([element.standard, element.name, element.definition, element.dataTypeText]));
check('no two SIF/PESC elements share name + definition + type', new Set(contentSignatureList).size === contentSignatureList.length);

console.log('T1.5 strata');
drawConfig.standardNameList.forEach((standardName) => {
	const frameKindCountByName = sampleDocument.frameKindCountByStandard[standardName];
	drawConfig.kindNameList.forEach((kindName) => {
		const frameCount = frameKindCountByName[kindName] || 0;
		const drawnCount = elementList.filter((element) => element.standard === standardName && element.kind === kindName).length;
		const requiredCount = Math.min(drawConfig.minimumPerKindCount, frameCount);
		check(`${standardName} ${kindName}: drawn ${drawnCount} >= ${requiredCount} (frame ${frameCount})`, drawnCount >= requiredCount);
	});
});

console.log('T1.6 completeness');
const incompleteList = elementList.filter((element) =>
	!element.name || !element.dataTypeText || !element.path || !element.ownerName ||
	!((typeof element.definition === 'string' && element.definition !== '') || (element.definition === null && /^No definition published by /.test(element.definitionAbsentReason))));
check('every element has name, definition (or null + reason), type, path, owner name', incompleteList.length === 0, incompleteList.map((element) => element.elementStableId).join(', '));

console.log('T1.7 split');
drawConfig.standardNameList.forEach((standardName) => {
	const devCount = elementList.filter((element) => element.standard === standardName && element.splitHalf === 'dev').length;
	const sealedCount = elementList.filter((element) => element.standard === standardName && element.splitHalf === 'sealed').length;
	check(`${standardName}: 25 dev / 25 sealed`, devCount === 25 && sealedCount === 25, `${devCount}/${sealedCount}`);
});

// T1.3 needs the gold: the excluded elements' own texts, read by this test's Cypher, never found in the sample
console.log('T1.3 exclusions (against the gold)');
process.global = { xLog: { status: () => {}, error: () => {}, verbose: () => {} } };
const configFileProcessor = require('qtools-config-file-processor');
const raterToolConfig = configFileProcessor.getConfig('raterTool.ini', path.join(__dirname, '..', '..', '..', '..', '..', 'configs', 'instanceSpecific', 'qbook') + '/', { resolve: true }).raterTool;
const { openRaterGraph } = require('../../../../server/data-model/lib/rater-tool/rater-graph');
const EXCLUSION_TEXT_CYPHER_BY_STANDARD = {
	'Ed-Fi': 'MATCH (p:EdfiProperty {path: $edFiPath}) RETURN p.name AS name, p.description AS definition',
	SIF: 'MATCH (f:Sif260928Field {xpath: $sifXpath}) RETURN f.name AS name, f.description AS definition, f.type AS typeName',
	PESC: 'MATCH (e:DmeProperty {_source: $pescSourceName, name: $elementName}) WHERE e.effectiveDocumentation = $definition RETURN e.name AS name, e.effectiveDocumentation AS definition',
};
openRaterGraph({ goldenContainerName: raterToolConfig.goldenContainerName, queryTimeoutMs: 30000 }, (openError, openResult) => {
	if (openError || openResult.refusal) {
		check('the named gold opens', false, openError || openResult.refusal.refusalText);
		finish();
		return;
	}
	const { raterGraph } = openResult;
	let remainingCount = exclusionList.length;
	exclusionList.forEach((exclusion) => {
		raterGraph.runQuery(EXCLUSION_TEXT_CYPHER_BY_STANDARD[exclusion.standard], exclusion, (queryError, rowList) => {
			const label = exclusion.edFiPath || exclusion.sifXpath || `${exclusion.pescSourceName} ${exclusion.elementName}`;
			const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
			const foundListIn = (candidateElementList) => (rowList || []).filter((goldRow) => candidateElementList.some((element) =>
				element.standard === exclusion.standard && element.name === goldRow.name && normalize(element.definition) === normalize(goldRow.definition) &&
				(exclusion.standard !== 'Ed-Fi' || element.path === exclusion.edFiPath)));
			const foundList = foundListIn(elementList);
			check(`${exclusion.standard} ${label}: in the gold (${(rowList || []).length} rows) and absent from the sample`, !queryError && rowList.length > 0 && foundList.length === 0, queryError || `found ${foundList.length}`);
			// RED TWIN: the same check over the sample with this excluded element planted in it must see it
			const plantedElement = rowList && rowList[0] ? { standard: exclusion.standard, name: rowList[0].name, definition: normalize(rowList[0].definition), path: exclusion.edFiPath || exclusion.sifXpath || '' } : null;
			check(`${exclusion.standard} ${label}: red twin — planted in the sample, the check finds it`, plantedElement !== null && foundListIn(elementList.concat([plantedElement])).length > 0);
			remainingCount -= 1;
			if (remainingCount === 0) {
				raterGraph.close();
				finish();
			}
		});
	});
});

const finish = () => {
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	console.log(`\n=== raterSample (Phase 1) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
};
