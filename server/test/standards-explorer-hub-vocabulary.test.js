'use strict';
// standards-explorer-hub-vocabulary.test.js — lane R6 (hub-neutral DME) (educoreForge WORKORDER-R6-dmeDeCeds-102126, census clusters 7–10,
// 17). The standards explorer names a hub's anchors, properties and domains by the hub the data names, never by one hub's
// literal. No graph:
//   1. the vocabulary (html/components/standardsExplorer/explorerVocabulary.js, an ES module, imported from a temporary
//      .mjs copy): hub kinds and hub relationships read the hub's name from the row; a row naming no hub says 'hub';
//   2. RENAME COMPLETENESS: the explorer's server mapper and access point, its store and its components hold none of
//      the retired one-hub kind, relationship or field names (a reader left on an old name would silently show nothing);
//   3. RED TWIN: a vocabulary whose hub kind label is a fixed literal fails assertion 1.
//
// Run: /usr/local/bin/node server/test/standards-explorer-hub-vocabulary.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const codeRootPath = path.join(__dirname, '..', '..');
const vocabularyFilePath = path.join(codeRootPath, 'html', 'components', 'standardsExplorer', 'explorerVocabulary.js');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

// the module source, optionally mutated, written as .mjs so node imports it as an ES module
const importVocabularyFrom = (sourceText, fileTag) => {
	const temporaryFilePath = path.join(os.tmpdir(), `explorerVocabulary-${process.pid}-${fileTag}.mjs`);
	fs.writeFileSync(temporaryFilePath, sourceText);
	return import(temporaryFilePath).then((vocabularyModule) => {
		fs.unlinkSync(temporaryFilePath);
		return vocabularyModule;
	});
};

const vocabularyAssertionList = (vocabulary) => {
	const resultList = [];
	const check = (testName, condition, detailText) => resultList.push({ testName, condition, detailText });
	const ctdlRow = { kind: 'hubAnchor', hubName: 'CTDL' };
	check('a hub anchor, property and domain are named by the row\'s hub', vocabulary.kindDisplayNameOf('hubAnchor', 'CTDL') === 'CTDL element' && vocabulary.kindDisplayNameOf('hubProperty', 'CEDS') === 'CEDS property' && vocabulary.kindDisplayNameOf('hubDomain', 'CTDL') === 'CTDL domain', `${vocabulary.kindDisplayNameOf('hubAnchor', 'CTDL')} / ${vocabulary.kindDisplayNameOf('hubProperty', 'CEDS')}`);
	check('a hub kind on a row naming no hub says \'hub\', never a stand-in hub name', vocabulary.kindDisplayNameOf('hubAnchor', null) === 'hub element', vocabulary.kindDisplayNameOf('hubAnchor', null));
	check('plurals follow the hub', vocabulary.pluralKindNameOf('hubAnchor', 'CTDL') === 'CTDL elements' && vocabulary.pluralKindNameOf('hubProperty', 'CEDS') === 'CEDS properties', vocabulary.pluralKindNameOf('hubAnchor', 'CTDL'));
	check('a non-hub kind is unchanged by a hub name', vocabulary.kindDisplayNameOf('property', 'CTDL') === 'Property' && vocabulary.kindDisplayNameOf('class') === 'Class');
	check('the mapping and hub-element groups name the hub', vocabulary.relationshipDisplayNameOf('MAPS_TO_HUB', 'CTDL') === 'Maps to CTDL' && vocabulary.relationshipDisplayNameOf('USED_BY_HUB_ELEMENT', 'CEDS') === 'CEDS elements', `${vocabulary.relationshipDisplayNameOf('MAPS_TO_HUB', 'CTDL')} / ${vocabulary.relationshipDisplayNameOf('USED_BY_HUB_ELEMENT', 'CEDS')}`);
	check('a hub anchor\'s context groups (HAS_<HUB>_PROPERTY / _DOMAIN) are named for any hub, and are secondary', vocabulary.relationshipDisplayNameOf('HAS_CTDL_PROPERTY', 'CTDL') === 'CTDL property' && vocabulary.relationshipDisplayNameOf('HAS_CEDS_DOMAIN', 'CEDS') === 'CEDS domain' && vocabulary.isSecondaryRelationshipType('HAS_CTDL_DOMAIN') && !vocabulary.isSecondaryRelationshipType('HAS_PROPERTY') && !vocabulary.isSecondaryRelationshipType('HAS_OPTION_SET'), vocabulary.relationshipDisplayNameOf('HAS_CTDL_PROPERTY', 'CTDL'));
	check('a match kind\'s description names the hub', vocabulary.matchDescriptionOf('broad', 'CTDL') === 'CTDL is broader than the element' && vocabulary.matchDescriptionOf('narrow', 'CEDS') === 'CEDS is narrower than the element' && vocabulary.matchDescriptionOf('exact', 'CTDL') === 'same meaning', vocabulary.matchDescriptionOf('broad', 'CTDL'));
	check('the mapped-text helper is named for hubs (hubMappedTextOf)', typeof vocabulary.hubMappedTextOf === 'function' && vocabulary.hubMappedTextOf({ ...ctdlRow, elementCount: 3 }) === '3 elements map here' && !('cedsMappedTextOf' in vocabulary));
	return resultList;
};

// ---- 2. rename completeness
const RETIRED_NAME_PATTERN = /cedsAnchor|'cedsProperty'|'cedsDomain'|cedsProperty:|cedsDomain:|USED_BY_CEDS_ELEMENT|MAPS_TO_CEDS|cedsElementCount|cedsDomainName|cedsPropertyList|cedsDomainList|cedsMappedTextOf|cedsElementsByCedsPropertyStableId|mapCedsElementGroupRecord|standardFamily: 'CEDS'/;
const EXPLORER_FILE_PATH_LIST = [
	'server/data-model/data-mapping/mappers/standards-neighbourhood.js',
	'server/data-model/access-points-dot-d/accessPoints.d/standards-neighbourhood.js',
	'html/stores/standardsNeighbourhoodStore.js',
	...fs.readdirSync(path.join(codeRootPath, 'html', 'components', 'standardsExplorer')).map((fileName) => `html/components/standardsExplorer/${fileName}`),
];

console.log('\n=== lane R6 (hub-neutral DME): the standards explorer names hubs from the data ===\n');
const vocabularySourceText = fs.readFileSync(vocabularyFilePath, 'utf8');
importVocabularyFrom(vocabularySourceText, 'real')
	.then((vocabulary) => {
		console.log('- 1. the vocabulary');
		vocabularyAssertionList(vocabulary).forEach(({ testName, condition, detailText }) => ok(testName, condition, detailText));

		console.log('- 2. rename completeness');
		const offenderList = EXPLORER_FILE_PATH_LIST.reduce((soFar, relativeFilePath) => {
			const lineList = fs.readFileSync(path.join(codeRootPath, relativeFilePath), 'utf8').split('\n');
			return soFar.concat(lineList.map((lineText, lineIndex) => ({ relativeFilePath, lineNumber: lineIndex + 1, lineText })).filter(({ lineText }) => RETIRED_NAME_PATTERN.test(lineText)));
		}, []);
		ok(`no retired one-hub kind, relationship or field name in the ${EXPLORER_FILE_PATH_LIST.length} explorer files`, offenderList.length === 0, offenderList.slice(0, 5).map(({ relativeFilePath, lineNumber }) => `${relativeFilePath}:${lineNumber}`).join(', '));
		// ⟪lane R6⟫ the legend's version badges are the page's own comparison (SCARLET_ARROW, 2026-10-21: a CTDL anchor page showed
		// 'Different in 1.8 / New in 1.8', a PESC example fixed in the template)
		const legendSourceText = fs.readFileSync(path.join(codeRootPath, 'html/components/standardsExplorer/Legend.vue'), 'utf8');
		ok('the legend carries no fixed version number; its version badges come from the page\'s versionComparison', !/in \d+\.\d+</.test(legendSourceText) && /versionComparison/.test(legendSourceText), (legendSourceText.match(/[^\n]*in \d+\.\d+<[^\n]*/) || [''])[0].trim().slice(0, 140));

		console.log('- 3. red twin');
		const fixedLabelSourceText = vocabularySourceText.replace(/export const kindDisplayNameOf = [^\n]*\n/, "export const kindDisplayNameOf = (nodeKind) => ({ hubAnchor: 'CEDS element' })[nodeKind] || kindDisplayNameByKind[nodeKind] || nodeKind;\n");
		if (fixedLabelSourceText === vocabularySourceText) {
			ok('red twin: the mutation applied (kindDisplayNameOf is one line)', false, 'the twin found nothing to mutate');
			return null;
		}
		return importVocabularyFrom(fixedLabelSourceText, 'twin').then((twinVocabulary) => {
			const twinResultList = vocabularyAssertionList(twinVocabulary);
			ok('red twin (a hub kind label fixed to one hub): the hub-naming assertion fails', twinResultList.some((oneResult) => !oneResult.condition));
		});
	})
	.catch((importError) => ok('the vocabulary module imports', false, importError.message))
	.then(() => {
		console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
		process.exit(failed > 0 ? 1 : 0);
	});
