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

console.log('T1.5 strata (revision 2: per part, mapped 40 / unmapped 10)');
drawConfig.standardNameList.forEach((standardName) => {
	['mapped', 'unmapped'].forEach((partName) => {
		const partElementList = elementList.filter((element) => element.standard === standardName && (partName === 'mapped') === element.isMappedInGold);
		check(`${standardName} ${partName}: exactly ${drawConfig.drawCountByPart[partName]}`, partElementList.length === drawConfig.drawCountByPart[partName], `${partElementList.length}`);
		const frameKindCountByName = sampleDocument.frameKindCountByStandardAndPart[standardName][partName];
		drawConfig.kindNameList.forEach((kindName) => {
			const frameCount = frameKindCountByName[kindName] || 0;
			const drawnCount = partElementList.filter((element) => element.kind === kindName).length;
			const requiredCount = Math.min(drawConfig.minimumPerKindCountByPart[partName], frameCount);
			check(`${standardName} ${partName} ${kindName}: drawn ${drawnCount} >= ${requiredCount} (frame ${frameCount})`, drawnCount >= requiredCount && drawnCount <= frameCount);
		});
	});
	const populationCount = sampleDocument.frameMappedCountByStandard[standardName];
	check(`${standardName}: population counts recorded (mapped ${populationCount && populationCount.mapped}, unmapped ${populationCount && populationCount.unmapped})`, populationCount && populationCount.mapped >= 40 && populationCount.unmapped >= 10);
});

console.log('revision 2 frame rules');
const attributeNameList = elementList.filter((element) => element.name.startsWith('@')).map((element) => element.elementStableId);
check('no element name begins with @', attributeNameList.length === 0, attributeNameList.join(', '));
check('every element lists its member stable ids', elementList.every((element) => Array.isArray(element.memberStableIdList) && element.memberStableIdList.length === element.memberCount));

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
// ⟪lane zbE, E4⟫ the rater reads the DME's gold (the golden pointer; GOLDEN_CONTAINER overrides), as raterTool.js does
const DME_GOLDEN_CONTAINER_NAME = require(path.join(__dirname, '..', '..', '..', '..', 'server', 'test', 'lib', 'goldenContainerName')).readGoldenContainerName();
const { openRaterGraph } = require('../../../../server/data-model/lib/rater-tool/rater-graph');
const EXCLUSION_TEXT_CYPHER_BY_STANDARD = {
	'Ed-Fi': 'MATCH (p:EdfiProperty {path: $edFiPath}) RETURN p.name AS name, p.description AS definition',
	SIF: 'MATCH (f:Sif260928Field {xpath: $sifXpath}) RETURN f.name AS name, f.description AS definition, f.type AS typeName',
	PESC: 'MATCH (e:DmeProperty {_source: $pescSourceName, name: $elementName}) WHERE e.effectiveDocumentation = $definition RETURN e.name AS name, e.effectiveDocumentation AS definition',
};
openRaterGraph({ goldenContainerName: DME_GOLDEN_CONTAINER_NAME, queryTimeoutMs: 30000 }, (openError, openResult) => {
	if (openError || openResult.refusal) {
		check('the named gold opens', false, openError || openResult.refusal.refusalText);
		finish();
		return;
	}
	const { raterGraph } = openResult;
	// revision 2, against the gold with this test's own Cypher: every member's data-type marker and its mapping
	const MEMBER_TRUTH_CYPHER = `UNWIND $memberStableIdList AS memberStableId
		MATCH (member:ForgedNode {stableId: memberStableId})
		OPTIONAL MATCH (occurrence:ForgedNode) WHERE occurrence.stableId STARTS WITH member.stableId + '/at/' AND (occurrence)-[:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference {hubName: 'CEDS'})
		WITH member, count(occurrence) AS mappedOccurrenceCount
		RETURN member.stableId AS memberStableId, member.sharedBlock AS sharedBlock, member.reachableFromRoot AS reachableFromRoot,
		       EXISTS { (member)-[:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(:HubReference {hubName: 'CEDS'}) } OR mappedOccurrenceCount > 0 AS isMapped`;
	// red twins: a SIF field in the shared SIF_Metadata block and an unreachable PESC declaration, planted below
	const PLANTED_SIF_SHARED_MEMBER = 'sif260928:field/AccountingPeriods/AccountingPeriod/SIF_Metadata/EducationFilter/BloomsTaxonomyLevels/BloomsTaxonomyLevel';
	const PLANTED_PESC_UNREACHABLE_MEMBER = 'pesccollegetranscript1v8v0:group/urn:org:pesc:core:CoreMain:v1.19.0#OrganizationIDGroup/el/10:CSIS';
	const allMemberStableIdList = elementList.reduce((soFar, element) => soFar.concat(element.memberStableIdList), []).concat([PLANTED_SIF_SHARED_MEMBER, PLANTED_PESC_UNREACHABLE_MEMBER]);
	raterGraph.runQuery(MEMBER_TRUTH_CYPHER, { memberStableIdList: allMemberStableIdList }, (truthError, truthRowList) => {
		const truthByStableId = (truthRowList || []).reduce((soFar, truthRow) => ({ ...soFar, [truthRow.memberStableId]: truthRow }), {});
		check(`every member (${allMemberStableIdList.length}, two planted) is in the gold`, !truthError && allMemberStableIdList.every((memberStableId) => truthByStableId[memberStableId]), truthError || allMemberStableIdList.filter((memberStableId) => !truthByStableId[memberStableId]).join(', '));
		const sifSharedOf = (candidateList) => candidateList.filter((element) => element.standard === 'SIF' && element.memberStableIdList.some((memberStableId) => (truthByStableId[memberStableId] || {}).sharedBlock !== 'model'));
		const pescUnreachableOf = (candidateList) => candidateList.filter((element) => element.standard === 'PESC' && element.memberStableIdList.some((memberStableId) => (truthByStableId[memberStableId] || {}).reachableFromRoot !== true));
		check('red twin: a planted SIF_Metadata field is seen by the shared-block check', sifSharedOf([{ standard: 'SIF', memberStableIdList: [PLANTED_SIF_SHARED_MEMBER] }]).length === 1);
		check('red twin: a planted unreachable PESC declaration is seen by the reachability check', pescUnreachableOf([{ standard: 'PESC', memberStableIdList: [PLANTED_PESC_UNREACHABLE_MEMBER] }]).length === 1);
		const sifSharedList = elementList.filter((element) => element.standard === 'SIF' && element.memberStableIdList.some((memberStableId) => (truthByStableId[memberStableId] || {}).sharedBlock !== 'model'));
		check('no SIF element has a member in a shared data-type block (sharedBlock other than model)', sifSharedList.length === 0, sifSharedList.map((element) => element.elementStableId).join(', '));
		const pescUnreachableList = elementList.filter((element) => element.standard === 'PESC' && element.memberStableIdList.some((memberStableId) => (truthByStableId[memberStableId] || {}).reachableFromRoot !== true));
		check('no PESC element has a member unreachable from the message root', pescUnreachableList.length === 0, pescUnreachableList.map((element) => element.elementStableId).join(', '));
		const wrongFlagList = elementList.filter((element) => element.isMappedInGold !== element.memberStableIdList.some((memberStableId) => (truthByStableId[memberStableId] || {}).isMapped === true));
		check('isMappedInGold equals the gold for every element (any member, PESC through its occurrences)', wrongFlagList.length === 0, wrongFlagList.map((element) => element.elementStableId).slice(0, 5).join(', '));
		runExclusionChecks(raterGraph);
	});
});

const runExclusionChecks = (raterGraph) => {
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
};

const finish = () => {
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	console.log(`\n=== raterSample (Phase 1) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
};
