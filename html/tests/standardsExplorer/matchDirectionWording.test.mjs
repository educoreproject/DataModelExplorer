#!/usr/bin/env node
// matchDirectionWording.test.mjs — pins every wording of a BROAD or NARROW match's DIRECTION to the judge's definition.
//
// The edges were written by the forge judge (educoreForge configs/instanceSpecific/qbook/jevJudge.ini), which is asked
// how the chosenCandidate (the hub concept) relates to the sourceElement:
//   broadMatch  — "The chosenCandidate is broader: it covers everything the sourceElement covers, and more."
//   narrowMatch — "The chosenCandidate is narrower: it covers only part of what the sourceElement covers."
// So BROAD_MATCH says the HUB is broader, NARROW_MATCH says the HUB is narrower. Before dmeMatchDirection the site's
// legend said the opposite and the DME's answers flipped between the two; this test holds every layer to the judge.
//
//   node html/tests/standardsExplorer/matchDirectionWording.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchDescriptionOf } from '../../components/standardsExplorer/explorerVocabulary.js';

const testDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const codeDirectoryPath = path.resolve(testDirectoryPath, '../../..');
const globalPromptsDirectoryPath = path.resolve(codeDirectoryPath, '../configs/instanceSpecific/_globalPrompts');

const hubDirectionByMatchKind = Object.freeze({ broad: 'broader', narrow: 'narrower' });
const reverseDirectionOf = (hubDirectionText) => (hubDirectionText === 'broader' ? 'narrower' : 'broader');

const resultList = [];
const check = (checkName, checkFunction) => {
	const failureText = (() => {
		try {
			checkFunction();
			return '';
		} catch (error) {
			return error.message;
		}
	})();
	resultList.push({ checkName, failureText });
	console.log(`${failureText ? 'FAIL' : 'PASS'} ${checkName}${failureText ? `\n     ${failureText}` : ''}`);
};

// the site's legend, the companion page's tier chip and the CEDS concept pane all say it through matchDescriptionOf
Object.entries(hubDirectionByMatchKind).forEach(([matchKind, hubDirectionText]) => {
	check(`explorerVocabulary: ${matchKind} says the hub is ${hubDirectionText} than the element`, () => {
		assert.equal(matchDescriptionOf(matchKind, 'CEDS'), `CEDS is ${hubDirectionText} than the element`);
		assert.equal(matchDescriptionOf(matchKind, null), `the hub is ${hubDirectionText} than the element`);
	});
});

// CedsConcepts.vue builds its chip titles from matchDescriptionOf and must list BOTH directional relations
check('CedsConcepts.vue: BROAD_MATCH and NARROW_MATCH chips take their titles from matchDescriptionOf', () => {
	const componentText = fs.readFileSync(path.resolve(codeDirectoryPath, 'html/components/CedsConcepts.vue'), 'utf8');
	assert.ok(/BROAD_MATCH: \{[^}]*matchDescriptionOf\('broad', 'this CEDS concept'\)/.test(componentText), 'the BROAD_MATCH entry does not take its title from matchDescriptionOf');
	assert.ok(/NARROW_MATCH: \{[^}]*matchDescriptionOf\('narrow', 'this CEDS concept'\)/.test(componentText), 'the NARROW_MATCH entry does not take its title from matchDescriptionOf');
	assert.ok(!componentText.includes('subset of this CEDS concept'), 'the inverted title "a subset of this CEDS concept" is still present');
});

// the DME's system prompts: the definition, and the one sentence form an answer must use
['DataModelExplorer.ini', 'DataModelExplorerSlack.ini'].forEach((promptFileName) => {
	const promptText = fs.readFileSync(path.resolve(globalPromptsDirectoryPath, promptFileName), 'utf8');
	Object.entries(hubDirectionByMatchKind).forEach(([matchKind, hubDirectionText]) => {
		const edgeTypeText = `${matchKind.toUpperCase()}_MATCH`;
		check(`${promptFileName}: ${edgeTypeText} defined as the hub concept ${hubDirectionText.toUpperCase()}`, () => {
			assert.ok(promptText.includes(`- ${edgeTypeText} — the hub concept is ${hubDirectionText.toUpperCase()} than the source element`), `no definition line for ${edgeTypeText}`);
			assert.ok(!promptText.includes(`${edgeTypeText} — the hub concept is ${reverseDirectionOf(hubDirectionText).toUpperCase()}`), `a reversed definition of ${edgeTypeText} is present`);
		});
		check(`${promptFileName}: ${edgeTypeText} answer form is hub-first '${hubDirectionText}'`, () => {
			assert.ok(promptText.includes(`for ${edgeTypeText}: '<hub> <hub term> is ${hubDirectionText} than <standard> <element>'`), `no hub-first sentence form for ${edgeTypeText}`);
		});
	});
});

// the getSchema text (MCP and dme_user_schema) says the same
check('schema-provider.js: BROAD_MATCH asserts the hub tuple BROADER, NARROW_MATCH the hub tuple NARROWER', () => {
	const providerText = fs.readFileSync(path.resolve(codeDirectoryPath, 'server/lib/schema-provider.js'), 'utf8');
	assert.ok(/edgeType: 'BROAD_MATCH',[^}]*assertion: 'the hub tuple is BROADER than the element'/s.test(providerText), 'BROAD_MATCH assertion is not "the hub tuple is BROADER than the element"');
	assert.ok(/edgeType: 'NARROW_MATCH',[^}]*assertion: 'the hub tuple is NARROWER than the element'/s.test(providerText), 'NARROW_MATCH assertion is not "the hub tuple is NARROWER than the element"');
});

const failureCount = resultList.filter(({ failureText }) => failureText).length;
console.log(`\n${resultList.length - failureCount}/${resultList.length} passed`);
process.exit(failureCount ? 1 : 0);
