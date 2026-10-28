'use strict';
// companion-focus-rule-shared.test.js — gate G2.2 (SPEC-companionPages-102826, Phase 2). The Companion pages section
// takes its standard from the same focus rule as the Downloads section, by shared code, not a copy. No graph, no server:
//   1. BEHAVIOUR KEPT: the shared rule (html/components/standardsExplorer/focusStandardKeyList.js, an ES module imported
//      from a temporary .mjs copy) answers exactly as the rule written inline in DownloadsSection.vue at dd256ba, over
//      every kind of focus. The reference below is that inline rule, adapted only to take its inputs as arguments; the
//      test first proves the reference's lines are the ones dd256ba holds (git show), so it is not a paraphrase.
//   2. SHARED, NOT COPIED: DownloadsSection.vue and CompanionPagesSection.vue both import standardKeyListOfFocus from that
//      module and call it, and neither holds the rule's own text.
//   3. RED TWINS: a rule whose family branch is loosened fails 1; a component holding a copy of the rule fails 2.
//
// Run: /usr/local/bin/node server/test/companion-focus-rule-shared.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const codeRootPath = path.join(__dirname, '..', '..');
const explorerDirPath = path.join(codeRootPath, 'html', 'components', 'standardsExplorer');
const ruleFilePath = path.join(explorerDirPath, 'focusStandardKeyList.js');
const downloadsSectionFilePath = path.join(explorerDirPath, 'DownloadsSection.vue');
const companionSectionFilePath = path.join(explorerDirPath, 'CompanionPagesSection.vue');
const BEFORE_EXTRACTION_COMMIT = 'dd256ba';

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

// ================================================================================
// THE REFERENCE: DownloadsSection.vue's inline rule at dd256ba

// these lines, verbatim, are what dd256ba's DownloadsSection.vue held; the reference below uses them unchanged except
// that the stores and computed values arrive as arguments
const BEFORE_EXTRACTION_LINE_LIST = [
	"const isCatalog = computed(() => focusNode.value?.kind === 'familyCatalog');",
	"const standardFamily = computed(() => focusNode.value?.standardFamily || '');",
	'const familyStandardKeyList = downloadsStore.standardKeyListOfFamily(standardFamily.value);',
	'return familyStandardKeyList.length === 1 ? familyStandardKeyList : [];',
	"release: () => [...new Set(neighbourhoodStore.levelRowList.filter((oneRow) => oneRow.kind === 'standard' && oneRow.standardKey).map((oneRow) => oneRow.standardKey))],",
	'if (!focusNode.value || isCatalog.value) return [];',
	'const listOfKind = standardKeyListByKind[focusNode.value.kind];',
	'if (listOfKind) return listOfKind();',
	'return focusNode.value.standardKey ? [focusNode.value.standardKey] : [];',
];

const referenceStandardKeyListOf = ({ focusNode, levelRowList, standardKeyListOfFamily }) => {
	const isCatalog = focusNode?.kind === 'familyCatalog';
	const standardFamily = focusNode?.standardFamily || '';
	const standardKeyListByKind = {
		family: () => {
			const familyStandardKeyList = standardKeyListOfFamily(standardFamily);
			return familyStandardKeyList.length === 1 ? familyStandardKeyList : [];
		},
		release: () => [...new Set(levelRowList.filter((oneRow) => oneRow.kind === 'standard' && oneRow.standardKey).map((oneRow) => oneRow.standardKey))],
	};
	if (!focusNode || isCatalog) return [];
	const listOfKind = standardKeyListByKind[focusNode.kind];
	if (listOfKind) return listOfKind();
	return focusNode.standardKey ? [focusNode.standardKey] : [];
};

// ================================================================================
// THE FOCUS MATRIX: every branch of the rule, and its edges

const standardKeyListByFamily = { JEDx: ['jedx'], CEDS: ['ceds'], EdFi: ['edfi5', 'edfi6'], CASE: [] };
const standardKeyListOfFamily = (standardFamily) => standardKeyListByFamily[standardFamily] || [];
const releaseRowList = [
	{ kind: 'standard', standardKey: 'edfi5' },
	{ kind: 'standard', standardKey: 'edfi6' },
	{ kind: 'standard', standardKey: 'edfi6' },
	{ kind: 'standard', standardKey: '' },
	{ kind: 'class', standardKey: 'edfi5' },
];

const focusCaseList = [
	{ caseName: 'no focus', focusNode: null, levelRowList: [] },
	{ caseName: 'no focus (undefined)', focusNode: undefined, levelRowList: [] },
	{ caseName: 'the families catalog', focusNode: { kind: 'familyCatalog', stableId: 'families:all', standardKey: null }, levelRowList: [] },
	{ caseName: 'a family of one standard', focusNode: { kind: 'family', standardFamily: 'JEDx', standardKey: null }, levelRowList: [] },
	{ caseName: 'a family of two standards', focusNode: { kind: 'family', standardFamily: 'EdFi', standardKey: null }, levelRowList: [] },
	{ caseName: 'a family of none', focusNode: { kind: 'family', standardFamily: 'CASE', standardKey: null }, levelRowList: [] },
	{ caseName: 'a family the manifest lacks', focusNode: { kind: 'family', standardFamily: 'Unknown', standardKey: null }, levelRowList: [] },
	{ caseName: 'a family node without a standardFamily', focusNode: { kind: 'family', standardKey: null }, levelRowList: [] },
	{ caseName: 'a family holding a standardKey of its own', focusNode: { kind: 'family', standardFamily: 'EdFi', standardKey: 'edfi5' }, levelRowList: [] },
	{ caseName: 'a release', focusNode: { kind: 'release', standardFamily: 'EdFi', standardKey: null }, levelRowList: releaseRowList },
	{ caseName: 'a release with no rows', focusNode: { kind: 'release', standardFamily: 'EdFi', standardKey: null }, levelRowList: [] },
	{ caseName: 'a standard root', focusNode: { kind: 'standard', stableId: 'jedx:root', standardFamily: 'JEDx', standardKey: 'jedx' }, levelRowList: [] },
	{ caseName: 'a class', focusNode: { kind: 'class', standardFamily: 'CEDS', standardKey: 'ceds' }, levelRowList: releaseRowList },
	{ caseName: 'a field', focusNode: { kind: 'property', standardFamily: 'CEDS', standardKey: 'ceds' }, levelRowList: [] },
	{ caseName: 'a hub element', focusNode: { kind: 'hubAnchor', standardKey: 'ceds' }, levelRowList: [] },
	{ caseName: 'a node with no standardKey', focusNode: { kind: 'class', standardKey: null }, levelRowList: [] },
	{ caseName: 'a node with an empty standardKey', focusNode: { kind: 'group', standardKey: '' }, levelRowList: [] },
];

// ================================================================================

const importRuleFrom = (sourceText, fileTag) => {
	const temporaryFilePath = path.join(os.tmpdir(), `focusStandardKeyList-${process.pid}-${fileTag}.mjs`);
	fs.writeFileSync(temporaryFilePath, sourceText);
	return import(temporaryFilePath).then((ruleModule) => {
		fs.unlinkSync(temporaryFilePath);
		return ruleModule;
	});
};

const behaviourMismatchListOf = (standardKeyListOfFocus) =>
	focusCaseList
		.map(({ caseName, focusNode, levelRowList }) => {
			const sharedAnswer = JSON.stringify(standardKeyListOfFocus({ focusNode, levelRowList, standardKeyListOfFamily }));
			const referenceAnswer = JSON.stringify(referenceStandardKeyListOf({ focusNode, levelRowList, standardKeyListOfFamily }));
			return sharedAnswer === referenceAnswer ? '' : `${caseName}: shared ${sharedAnswer}, reference ${referenceAnswer}`;
		})
		.filter(Boolean);

// the rule's own text, which no component may hold once it is shared
const RULE_TEXT_PATTERN_LIST = [/standardKeyListByKind/, /familyStandardKeyList\.length === 1/, /oneRow\.kind === 'standard'/, /focusNode\.value\.standardKey \?/];

const sharingFaultListOf = (componentText, componentName) => {
	const faultList = [];
	if (!/import \{ standardKeyListOfFocus \} from '@\/components\/standardsExplorer\/focusStandardKeyList';/.test(componentText)) faultList.push(`${componentName} does not import standardKeyListOfFocus`);
	if (!/standardKeyListOfFocus\(\{ focusNode: focusNode\.value, levelRowList: neighbourhoodStore\.levelRowList, standardKeyListOfFamily: downloadsStore\.standardKeyListOfFamily \}\)/.test(componentText)) faultList.push(`${componentName} does not call it with the focus, the level rows and the manifest's family getter`);
	RULE_TEXT_PATTERN_LIST.forEach((rulePattern) => {
		if (rulePattern.test(componentText)) faultList.push(`${componentName} holds the rule's own text (${rulePattern})`);
	});
	return faultList;
};

const runTests = async () => {
	console.log('\n1. Behaviour kept');
	const beforeExtractionText = execFileSync('git', ['show', `${BEFORE_EXTRACTION_COMMIT}:html/components/standardsExplorer/DownloadsSection.vue`], { cwd: codeRootPath, encoding: 'utf8' });
	const missingLineList = BEFORE_EXTRACTION_LINE_LIST.filter((oneLine) => !beforeExtractionText.includes(oneLine));
	ok(`the reference's lines are dd256ba's DownloadsSection.vue lines (${BEFORE_EXTRACTION_LINE_LIST.length})`, missingLineList.length === 0, missingLineList.join(' | '));

	const ruleSourceText = fs.readFileSync(ruleFilePath, 'utf8');
	const { standardKeyListOfFocus } = await importRuleFrom(ruleSourceText, 'real');
	const mismatchList = behaviourMismatchListOf(standardKeyListOfFocus);
	ok(`the shared rule answers as the inline rule did, on all ${focusCaseList.length} focus cases`, mismatchList.length === 0, mismatchList.join('; '));
	const nonEmptyCaseNameList = focusCaseList.filter(({ focusNode, levelRowList }) => referenceStandardKeyListOf({ focusNode, levelRowList, standardKeyListOfFamily }).length > 0).map(({ caseName }) => caseName);
	ok('sanity: the family, release and own-standardKey branches all give answers in the matrix', ['a family of one standard', 'a release', 'a standard root'].every((caseName) => nonEmptyCaseNameList.includes(caseName)), nonEmptyCaseNameList.join(', '));

	console.log('\n2. Shared, not copied');
	[[downloadsSectionFilePath, 'DownloadsSection.vue'], [companionSectionFilePath, 'CompanionPagesSection.vue']].forEach(([componentFilePath, componentName]) => {
		const faultList = sharingFaultListOf(fs.readFileSync(componentFilePath, 'utf8'), componentName);
		ok(`${componentName} calls the shared rule and holds no copy of it`, faultList.length === 0, faultList.join('; '));
	});

	console.log('\n3. Red twins');
	const loosenedSourceText = ruleSourceText.replace('familyStandardKeyList.length === 1 ? familyStandardKeyList : []', 'familyStandardKeyList');
	ok('twin setup: the family branch was loosened', loosenedSourceText !== ruleSourceText);
	const loosenedRule = await importRuleFrom(loosenedSourceText, 'loosened');
	const loosenedMismatchList = behaviourMismatchListOf(loosenedRule.standardKeyListOfFocus);
	ok('RED TWIN: a loosened family branch fails assertion 1', loosenedMismatchList.length > 0 && loosenedMismatchList.some((mismatchText) => mismatchText.startsWith('a family of two standards')), loosenedMismatchList.join('; '));

	const copiedComponentText = fs
		.readFileSync(companionSectionFilePath, 'utf8')
		.concat("\nconst standardKeyListByKind = { family: () => (familyStandardKeyList.length === 1 ? familyStandardKeyList : []) };\n");
	ok('RED TWIN: a component holding a copy of the rule fails assertion 2', sharingFaultListOf(copiedComponentText, 'twin').length > 0);

	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
	process.exit(failed ? 1 : 0);
};

runTests();
