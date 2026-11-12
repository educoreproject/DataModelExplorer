'use strict';
// meanings-clarity.test.js — WORKORDER-meaningsClarity-111126 gate 1, the parts that need no graph. The browser modules run here as they are:
// html/components/standardsExplorer/explorerVocabulary.js imported from its own file, and html/stores/standardsNeighbourhoodStore.js in the real Pinia with its imports
// pointed at doubles (axios answers from fixtures/meaningsClarity/C200159-walk.json, the branch's own answers captured from GOLD_261030_useCases).
//   1. THE FILTER RIDES IN ITS LEVEL'S URL: a link to another level (a drill, a crumb, an Open) carries no filter, so moving clears it; a level's URL carries its own
//      text, which is what Back restores; the text is read back from the URL as it was written; a doubled parameter is refused by name
//   2. THE NOTICE: while the filter dims anything the store counts it, and the notice's words say it ("Filtered by 'accessibility' · 2 dimmed")
//   3. THE KEY: the meanings walk has a diagram key with every mark the work order lists, each one the legend can draw; the standards walk keeps its own legend
//   4. INCOMING MEANINGS: C200159's level lists the meaning of another domain apart, counted apart ("+ 1 from another domain"), named as its range, and opening it goes to
//      that meaning in its own domain, not one step below this level
//   5. VALUES: the P000385 meaning's row says it holds 48 values; a meaning nothing maps to whose values are mapped says so
//   6. COUNTS MATCH THE NEXT LEVEL: C200159's row in the CEDS hub says what its level lists (4 meanings, its own term, 1 from another domain), in the same words
//   7. ⟪Addendum B⟫ THE PROSE: C200159's level and its value holder's level are explained in sentences whose every number equals the diagram's or the table's count;
//      a sentence about something absent is not said; a meaning's panel is titled "Meaning: <name>" with what it is underneath
//   8. ⟪Addendum C⟫ #6 a slot's URI is visible text; #11 a long Open label wraps and the table's Open column stays in view; #12 a deep link to a meaning is given
//      its hub and domain; #15 the explainer's words are visible beside its icon
//  10. ⟪explorerTidy review S5⟫ a selected leaf meaning (a value, a property holding no values) is read once with the drill's request and shows its tuple and Expressed-in
//   9. ⟪supervisor's rulings 3 and 4⟫ ONE shared module (sharedWording.js, beside meaningFactsWording.json) fills every template and picks a meaning's subtitle by tier,
//      for the explorer and the /edc page both: no other file carries that lookup or a wording function of its own; and a level shown as a table is described as the
//      table, never as a diagram that is not on screen
// MEANINGS_CLARITY_HTML_PATH=<another tree's html dir> runs the same gates there (the pinned base, to watch them fail).
// Run: /Users/tqwhite/.local/node/bin/node server/test/meanings-clarity.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const htmlPath = process.env.MEANINGS_CLARITY_HTML_PATH || path.join(__dirname, '..', '..', 'html');
const explorerDirPath = path.join(htmlPath, 'components', 'standardsExplorer');
const storeFilePath = path.join(htmlPath, 'stores', 'standardsNeighbourhoodStore.js');
const walkFixture = require('./fixtures/meaningsClarity/C200159-walk.json');
const C200159 = 'https://w3id.org/CEDStandards/terms/C200159';
const NEIGHBOURHOOD_URL = '/api/standards-neighbourhood';

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${String(detailText).slice(0, 600)}` : ''}`);
};
const finish = () => {
	console.log(`\nmeanings-clarity: ${passedCount} passed, ${failedCount} failed`);
	process.exit(failedCount === 0 ? 0 : 1);
};
const refusalTextOf = (work) => {
	try { work(); return ''; } catch (refusal) { return refusal.message; }
};

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'meaningsClarity-'));
const writeModule = (fileName, sourceText) => {
	const filePath = path.join(scratchDirPath, fileName);
	fs.writeFileSync(filePath, sourceText);
	return pathToFileURL(filePath).href;
};
const rewriteOnce = (sourceText, findText, replaceText) => {
	const matchCount = sourceText.split(findText).length - 1;
	if (matchCount !== 1) throw new Error(`meanings-clarity.test: '${findText}' occurs ${matchCount} times in the store; the test rewrites it exactly once`);
	return sourceText.replace(findText, () => replaceText);
};

const vocabularyUrl = pathToFileURL(path.join(explorerDirPath, 'explorerVocabulary.js')).href;
const piniaUrl = pathToFileURL(path.join(htmlPath, 'node_modules', 'pinia', 'dist', 'pinia.mjs')).href;
const axiosDoubleUrl = writeModule('axiosDouble.mjs', 'export default { post: (url, body) => globalThis.clarityAxiosDouble.answer(url, body) };\n');
const loginDoubleUrl = writeModule('loginStoreDouble.mjs', 'export const useLoginStore = () => ({ getAuthTokenProperty: {} });\n');
const storeUrl = (() => {
	let storeText = fs.readFileSync(storeFilePath, 'utf8');
	storeText = rewriteOnce(storeText, "import axios from 'axios';", `import { defineStore } from '${piniaUrl}';\nimport axios from '${axiosDoubleUrl}';`);
	storeText = rewriteOnce(storeText, "from '@/stores/loginStore';", `from '${loginDoubleUrl}';`);
	storeText = rewriteOnce(storeText, "from '@/components/standardsExplorer/explorerVocabulary';", `from '${vocabularyUrl}';`);
	return writeModule('standardsNeighbourhoodStore.mjs', storeText);
})();

// the double answers a node request from the fixture by its stableId; a path summary names nothing new
globalThis.clarityAxiosDouble = {
	answer(url, body) {
		if (url !== NEIGHBOURHOOD_URL) return Promise.reject(new Error(`the double has no answer for ${url}`));
		if (body.action === 'pathSummary') return Promise.resolve({ data: [{ nodeSummaryList: [] }] });
		const levelByStableId = { [`meaningDomain:${C200159}`]: walkFixture.domainLevel, 'meaningHub:CEDS': walkFixture.hubLevelCut };
		const level = levelByStableId[body.stableId];
		// ⟪explorerTidy review S5⟫ a selected leaf meaning's own node, counted per stableId; one stableId fails on its first request only
		const leafAnswer = globalThis.clarityAxiosDouble.leafNodeByStableId && globalThis.clarityAxiosDouble.leafNodeByStableId[body.stableId];
		if (leafAnswer) {
			const requestCountByStableId = globalThis.clarityAxiosDouble.leafRequestCountByStableId;
			requestCountByStableId[body.stableId] = (requestCountByStableId[body.stableId] || 0) + 1;
			if (body.stableId === globalThis.clarityAxiosDouble.failOnceStableId && requestCountByStableId[body.stableId] === 1) return Promise.reject(new Error('the double fails this read once'));
			return Promise.resolve({ data: [{ node: leafAnswer, childGroupList: [], mappingList: [] }] });
		}
		return level ? Promise.resolve({ data: [level] }) : Promise.reject(new Error(`the double has no level ${body.stableId}`));
	},
};

Promise.all([import(vocabularyUrl), import(piniaUrl), import(storeUrl)])
	.then(async ([vocabulary, pinia, storeModule]) => {
		pinia.setActivePinia(pinia.createPinia());
		const store = storeModule.useStandardsNeighbourhoodStore();
		store.setWalkProfileName('meanings');

		console.log('\n=== 1. the filter rides in its level\'s URL ===');
		const { walkLinkOf, walkRouteQueryOf, walkFilterTextOfRouteQuery, walkFilterVocabulary } = vocabulary;
		ok('the vocabulary names the filter\'s URL parameter', Boolean(walkFilterVocabulary && walkFilterVocabulary.walkFilterQueryName));
		ok('the vocabulary makes and reads a walk URL\'s filter (walkRouteQueryOf, walkFilterTextOfRouteQuery)', Boolean(walkRouteQueryOf && walkFilterTextOfRouteQuery));
		if (!walkRouteQueryOf || !walkFilterTextOfRouteQuery || !walkFilterVocabulary) { finish(); return; }
		const filterQueryName = walkFilterVocabulary.walkFilterQueryName;
		const domainPath = ['meanings:all', 'meaningHub:CEDS', `meaningDomain:${C200159}`];
		const filteredQuery = walkRouteQueryOf({ pathStableIdList: domainPath.slice(0, 2), filterText: 'accessibility' });
		ok('a level\'s own URL carries its filter text', filteredQuery[filterQueryName] === 'accessibility', JSON.stringify(filteredQuery));
		ok('and reads it back as written (what Back restores)', walkFilterTextOfRouteQuery(filteredQuery) === 'accessibility');
		ok('a link to another level (drill, crumb, Open) carries no filter: moving clears it', !(filterQueryName in walkLinkOf('meanings', domainPath).query) && !(filterQueryName in walkLinkOf('standards', ['families:all']).query), JSON.stringify(walkLinkOf('meanings', domainPath)));
		ok('a URL with no filter reads as no filter', walkFilterTextOfRouteQuery({ path: 'meanings:all' }) === '');
		ok('an empty filter writes no parameter', !(filterQueryName in walkRouteQueryOf({ pathStableIdList: domainPath, filterText: '' })));
		// ⟪review S2⟫ a hand-edited or mangled link must never take the page down: a repeated filter reads as its first text, anything else not text as no filter
		ok('review S2: a repeated filter parameter reads as its first text, never a page error', refusalTextOf(() => walkFilterTextOfRouteQuery({ [filterQueryName]: ['a', 'b'] })) === '' && walkFilterTextOfRouteQuery({ [filterQueryName]: ['a', 'b'] }) === 'a');
		ok('review S2: a filter parameter that is not text reads as no filter', walkFilterTextOfRouteQuery({ [filterQueryName]: [null] }) === '' && walkFilterTextOfRouteQuery({ [filterQueryName]: {} }) === '');

		console.log('\n=== 2. the filtered notice ===');
		await store.loadPath(domainPath);
		ok('the store counts how many rows the filter leaves unmatched', store.filterUnmatchedRowCount === 0, String(store.filterUnmatchedRowCount));
		store.setFilterText('accessibility');
		const unmatchedCount = store.levelRowList.filter((oneRow) => !`${oneRow.displayName} ${oneRow.name}`.toLowerCase().includes('accessibility')).length;
		ok(`while "accessibility" dims ${unmatchedCount} of C200159's ${store.levelRowList.length} rows, the store says ${unmatchedCount}`, unmatchedCount > 0 && store.filterUnmatchedRowCount === unmatchedCount, String(store.filterUnmatchedRowCount));
		const noticeText = [vocabulary.wordingOf(walkFilterVocabulary.noticeTemplate, { filterText: 'accessibility' }), vocabulary.wordingOf(walkFilterVocabulary.unmatchedTemplateByViewMode.diagram, { unmatchedCountText: unmatchedCount })].join(walkFilterVocabulary.noticeDivider);
		ok('the notice\'s words say the filter and what it dims', noticeText === `Filtered by 'accessibility' · ${unmatchedCount} dimmed`, noticeText);
		ok('the notice says "hidden" for the table, which leaves rows out', walkFilterVocabulary.unmatchedTemplateByViewMode.table.includes('hidden'));
		const noticeSourceText = fs.readFileSync(path.join(explorerDirPath, 'WalkView.vue'), 'utf8');
		ok('the walk shows the notice whenever the filter leaves anything unmatched', /<StandardsExplorerFilterNotice v-if="store\.filterUnmatchedRowCount > 0/.test(noticeSourceText));
		store.setFilterText('');

		console.log('\n=== 3. the key ===');
		const meaningsProfile = vocabulary.walkProfileOf('meanings');
		const markNameList = ((meaningsProfile.diagramKey || {}).entryList || []).map((oneEntry) => oneEntry.markName);
		ok('the meanings walk has a key with the seven marks (square, hexagon, dashed hexagon, incoming, ›, "N elements map here", dimmed)',
			JSON.stringify(markNameList) === JSON.stringify(['domainSquare', 'meaningHexagon', 'ownTermHexagon', 'incomingMeaning', 'moreInside', 'expressedCount', 'dimmed']), JSON.stringify(markNameList));
		const legendSourceText = fs.readFileSync(path.join(explorerDirPath, 'Legend.vue'), 'utf8');
		const drawableMarkText = (legendSourceText.match(/const markIsDrawnByName = \{([\s\S]*?)\n\};/) || [])[1] || '';
		ok('the legend draws every mark the key names', markNameList.length > 0 && markNameList.every((markName) => new RegExp(`\\b${markName}: \\(\\) =>`).test(drawableMarkText)), drawableMarkText.slice(0, 200));
		ok('review N8: the key shows only while the diagram is on screen, and only the marks this level draws', /store\.walkProfile\.diagramKey && store\.effectiveViewMode === 'diagram'/.test(legendSourceText) && /\.filter\(\(oneEntry\) =>/.test(legendSourceText));
		ok('the standards walk shows no meanings key and keeps its match columns', vocabulary.walkProfileOf('standards').diagramKey === null && vocabulary.walkProfileOf('standards').legendShowsMatchColumns === true);

		console.log('\n=== 4. incoming meanings ===');
		const incomingRowList = store.levelRowList.filter((oneRow) => oneRow.relationshipType === 'HAS_INCOMING_MEANING');
		ok('C200159\'s level lists one meaning of another domain', incomingRowList.length === 1 && store.focusNode.incomingMeaningCount === 1, JSON.stringify(incomingRowList.map((oneRow) => oneRow.name)));
		const incomingRow = incomingRowList[0] || {};
		ok('it is Has Individualized Program Accessibility Feature, naming C200159 as its range', incomingRow.name === 'Has Individualized Program Accessibility Feature' && JSON.stringify(incomingRow.incomingSlotNameList) === '["range"]');
		ok('its line says where it lives and how it names this domain', vocabulary.meaningInfoTextOf(incomingRow) === 'in Individualized Program · names this as its range', vocabulary.meaningInfoTextOf(incomingRow));
		const incomingDrillPath = store.drillPathOf(incomingRow.stableId);
		ok('opening it goes to that meaning in its own domain (C200157), not below C200159', JSON.stringify(incomingDrillPath) === JSON.stringify(['meanings:all', 'meaningHub:CEDS', 'meaningDomain:https://w3id.org/CEDStandards/terms/C200157', incomingRow.stableId]), JSON.stringify(incomingDrillPath));
		const ownRow = store.levelRowList.find((oneRow) => oneRow.relationshipType === 'HAS_MEANING');
		ok('opening one of its own meanings goes one step below this level', JSON.stringify(store.drillPathOf(ownRow.stableId)) === JSON.stringify([...domainPath, ownRow.stableId]));
		ok('the level says one number, the meanings it lists: 4 of its own, its own term, 1 from another domain (TQ 2026-11-12)', vocabulary.meaningCountTextOf(store.focusNode) === '6 meanings', vocabulary.meaningCountTextOf(store.focusNode));

		console.log('\n=== 5. values ===');
		const valueHolderRow = store.levelRowList.find((oneRow) => oneRow.name === 'Has Accessibility Feature Type');
		ok('the P000385 meaning\'s row holds 48 values', Boolean(valueHolderRow) && valueHolderRow.valueMeaningCount === 48, valueHolderRow && valueHolderRow.valueMeaningCount);
		ok('and says so under its bubble and in the table', /48 values inside/.test(vocabulary.meaningRowSubTextOf(valueHolderRow || {})) && /48 values inside/.test(vocabulary.meaningInfoTextOf(valueHolderRow || {})), vocabulary.meaningRowSubTextOf(valueHolderRow || {}));
		ok('a meaning nothing maps to whose values are mapped says so', vocabulary.meaningExpressionTextOf({ elementCount: 0, valueMeaningCount: 48, valueElementCount: 12 }) === 'nothing maps here directly; 12 elements map to its values');
		ok('a meaning with no values says nothing of values', vocabulary.meaningValuesTextOf({ valueMeaningCount: 0 }) === '');

		console.log('\n=== 6. the counts match the next level ===');
		await store.loadPath(domainPath.slice(0, 2));
		const domainRow = store.levelRowList.find((oneRow) => oneRow.stableId === `meaningDomain:${C200159}`);
		const domainLevel = walkFixture.domainLevel;
		const groupCountOf = (relationshipType) => (domainLevel.childGroupList.find((oneGroup) => oneGroup.relationshipType === relationshipType) || { count: 0 }).count;
		ok('C200159\'s row in the hub counts what its level lists: 4 meanings, its own term, 1 from another domain', Boolean(domainRow) && domainRow.meaningCount === groupCountOf('HAS_MEANING') && domainRow.termMeaningCount === groupCountOf('HAS_TERM_MEANING') && domainRow.incomingMeaningCount === groupCountOf('HAS_INCOMING_MEANING')
			&& domainRow.meaningCount === 4 && domainRow.incomingMeaningCount === 1, JSON.stringify(domainRow && { meaningCount: domainRow.meaningCount, termMeaningCount: domainRow.termMeaningCount, incomingMeaningCount: domainRow.incomingMeaningCount }));
		ok('and in the same words as the level says them', vocabulary.meaningCountTextOf(domainRow || {}) === vocabulary.meaningCountTextOf(domainLevel.node), vocabulary.meaningCountTextOf(domainRow || {}));
		ok('the level\'s value meanings, 48, are the meaning facts\' too', domainLevel.node.meaningFacts && domainLevel.node.meaningFacts.sectionList.find((oneSection) => oneSection.sectionName === 'valueMeanings').meaningCount === 48);

		console.log('\n=== 7. Addendum B: the prose and the title ===');
		const numbersOf = (proseText) => (proseText.match(/\d[\d,]*/g) || []).map((numberText) => Number(numberText.replace(/,/g, '')));
		await store.loadPath(domainPath);
		const domainProse = vocabulary.levelProseOf({ focusNode: store.focusNode, levelRowList: store.levelRowList, filterText: '', filterUnmatchedRowCount: 0, effectiveViewMode: 'diagram' });
		const domainProseText = domainProse.sentenceList.join(' ');
		console.log(`    C200159: ${domainProseText}`);
		const ownRowList = store.levelRowList.filter((oneRow) => oneRow.relationshipType === 'HAS_MEANING');
		// ⟪explorerTidy⟫ the prose says the level's counts (meanings, mapped meanings, incoming meanings) and lists no property's values
		const diagramCountList = [ownRowList.length, ownRowList.filter((oneRow) => oneRow.elementCount > 0).length, store.levelRowList.filter((oneRow) => oneRow.relationshipType === 'HAS_INCOMING_MEANING').length].filter(Boolean);
		ok(`C200159: every number in its prose (${JSON.stringify(numbersOf(domainProseText))}) is one the diagram and table count (${JSON.stringify(diagramCountList)}), and every count is said`,
			JSON.stringify([...numbersOf(domainProseText)].sort((left, right) => left - right)) === JSON.stringify([...diagramCountList].sort((left, right) => left - right)), domainProseText);
		// ⟪explorerTidy, TQ: "too long and too much detail"⟫ one sentence per fact; no other domain named, no property with values listed, never "this domain as"
		ok('C200159: the short shape: its meanings, the incoming one as its range, the › hint; no other domain, no property listed, never "this domain as"', /^This domain contributes to 4 meanings \(solid hexagons\)\./.test(domainProseText)
			&& /1 meaning in another domain names it as its range/.test(domainProseText) && /A › means the meaning holds values/.test(domainProseText)
			&& !/Individualized Program,|Has Accessibility Feature Type|holds 48|this domain as/.test(domainProseText), domainProseText);
		ok('C200159: no sentence about dimming while nothing is dimmed', !/dims/.test(domainProseText));
		store.setFilterText('accessibility');
		const dimmedProseText = vocabulary.levelProseOf({ focusNode: store.focusNode, levelRowList: store.levelRowList, filterText: store.filterText, filterUnmatchedRowCount: store.filterUnmatchedRowCount, effectiveViewMode: 'diagram' }).sentenceList.join(' ');
		ok('a sentence about dimming, with the count dimmed, while the filter dims', dimmedProseText.endsWith(`The filter 'accessibility' dims ${store.filterUnmatchedRowCount} of them.`), dimmedProseText);
		store.setFilterText('');
		const valueLevel = walkFixture.valueLevel;
		const valueRowList = valueLevel.childGroupList.flatMap((oneGroup) => oneGroup.itemList);
		const valueProseText = vocabulary.levelProseOf({ focusNode: valueLevel.node, levelRowList: valueRowList, filterText: '', filterUnmatchedRowCount: 0, effectiveViewMode: 'diagram' }).sentenceList.join(' ');
		console.log(`    Has Accessibility Feature Type: ${valueProseText}`);
		// ⟪explorerTidy⟫ a count of 0 says no sentence, so the numbers said are the level's counts that are not 0
		ok(`the value level: every number in its prose (${JSON.stringify(numbersOf(valueProseText))}) is its table's (${valueLevel.childGroupList[0].count} values, ${valueRowList.filter((oneRow) => oneRow.elementCount > 0).length} mapped)`,
			JSON.stringify(numbersOf(valueProseText)) === JSON.stringify([valueLevel.childGroupList[0].count, valueRowList.filter((oneRow) => oneRow.elementCount > 0).length].filter(Boolean)), valueProseText);
		const meaningFactsWording = JSON.parse(fs.readFileSync(path.join(explorerDirPath, 'meaningFactsWording.json'), 'utf8'));
		ok('a meaning\'s panel is titled as one', vocabulary.meaningTitleOf({ meaningNode: valueLevel.node, meaningFactsWording }) === 'Meaning: Has Accessibility Feature Type');
		ok('with what it is underneath, in words', vocabulary.meaningSubtitleOf({ meaningNode: valueLevel.node, meaningFactsWording }) === 'a property in the CEDS domain Individualized Program Accessibility Feature', vocabulary.meaningSubtitleOf({ meaningNode: valueLevel.node, meaningFactsWording }));
		const detailPanelText = fs.readFileSync(path.join(explorerDirPath, 'DetailPanel.vue'), 'utf8');
		ok('the panel shows the title and subtitle for a meaning', /meaningTitleOf\(\{ meaningNode: shownNode, meaningFactsWording \}\)/.test(detailPanelText) && /data-testid="detail-meaning-subtitle"/.test(detailPanelText));
		ok('the walk shows the prose above the level\'s view, for the meanings walk only', /<StandardsExplorerLevelProse v-if="store\.walkProfile\.showsLevelProse/.test(noticeSourceText) && meaningsProfile.showsLevelProse === true && vocabulary.walkProfileOf('standards').showsLevelProse === false);

		console.log('\n=== 8. Addendum C ===');
		ok('#6: a slot\'s URI is shown as text', /data-testid="meaning-slot-uri">\{\{ oneSlot\.uri \}\}/.test(fs.readFileSync(path.join(explorerDirPath, 'MeaningSection.vue'), 'utf8')));
		ok('#11: a long Open label wraps inside its button', /\.detail-open :deep\(\.v-btn__content\) \{\s*white-space: normal;/.test(detailPanelText));
		ok('#11: the table\'s Open column stays in view', /:deep\(tbody td:last-child\)[\s\S]*position: sticky !important;\s*right: 0;/.test(fs.readFileSync(path.join(explorerDirPath, 'Table.vue'), 'utf8')));
		const deepPath = ['meanings:all', valueLevel.node.stableId];
		ok('#12: a deep link to a meaning is given its hub and domain', JSON.stringify(vocabulary.meaningFullPathOf({ pathStableIdList: deepPath, focusNode: valueLevel.node })) === JSON.stringify(['meanings:all', 'meaningHub:CEDS', `meaningDomain:${C200159}`, valueLevel.node.stableId]),
			JSON.stringify(vocabulary.meaningFullPathOf({ pathStableIdList: deepPath, focusNode: valueLevel.node })));
		ok('#12: a whole path is left as it is', vocabulary.meaningFullPathOf({ pathStableIdList: ['meanings:all', 'meaningHub:CEDS', `meaningDomain:${C200159}`, valueLevel.node.stableId], focusNode: valueLevel.node }) === null);
		console.log('\n=== 9. one shared wording module; the prose describes the view on screen ===');
		const sharedWordingFilePath = path.join(explorerDirPath, 'sharedWording.js');
		ok('the shared wording module sits beside meaningFactsWording.json', fs.existsSync(sharedWordingFilePath));
		const codeRootPath = path.join(htmlPath, '..');
		const lookupHolderList = ['html/components/standardsExplorer/explorerVocabulary.js', 'html/components/standardsExplorer/DetailPanel.vue', 'server/lib/edc-resolver/humanPage.js', 'server/lib/edc-resolver/elementMeaningFacts.js']
			.filter((relativePath) => /meaningSubtitleTemplateByTier|templateText\.replace\(/.test(fs.readFileSync(path.join(codeRootPath, relativePath), 'utf8')));
		ok('no file but the shared module picks a subtitle by tier or fills a template itself', lookupHolderList.length === 0, JSON.stringify(lookupHolderList));
		ok('review N4: the /edc page links into the walk with the explorer\'s own codec and route, defined once', !/'\/explore\/meanings'/.test(fs.readFileSync(path.join(codeRootPath, 'server/lib/edc-resolver/humanPage.js'), 'utf8')) && !/export const pathTextOf = /.test(fs.readFileSync(path.join(explorerDirPath, 'explorerVocabulary.js'), 'utf8')) && fs.existsSync(path.join(explorerDirPath, 'sharedWalkPath.js')));
		ok('review N1: a slot is said by its one name, with no second word map', !/incomingSlotWordByName/.test(fs.readFileSync(path.join(explorerDirPath, 'explorerVocabulary.js'), 'utf8')) && !/namingSlotWordByName/.test(fs.readFileSync(path.join(explorerDirPath, 'meaningFactsWording.json'), 'utf8')));
		ok('review N3: the prose says the slot the incoming meanings name the domain in', /names it as its range/.test(domainProseText) && !/\{slotText\}/.test(domainProseText));
		ok('the /edc page and the explorer both take their meaning words from it', /require\('\.\.\/\.\.\/\.\.\/html\/components\/standardsExplorer\/sharedWording\.js'\)/.test(fs.readFileSync(path.join(codeRootPath, 'server/lib/edc-resolver/humanPage.js'), 'utf8'))
			&& /from '\.\/sharedWording\.js'/.test(fs.readFileSync(path.join(explorerDirPath, 'explorerVocabulary.js'), 'utf8')));
		await store.loadPath(domainPath);
		const proseOfView = (effectiveViewMode, filterUnmatchedRowCount) => vocabulary.levelProseOf({ focusNode: store.focusNode, levelRowList: store.levelRowList, filterText: 'accessibility', filterUnmatchedRowCount, effectiveViewMode }).sentenceList.join(' ');
		const tableProseText = proseOfView('table', 2);
		console.log(`    C200159 as a table: ${tableProseText}`);
		ok('a level shown as a table is described as the table, with no shape the diagram draws', /table/.test(tableProseText) && !/hexagon|square|circle|arrow|›/.test(tableProseText), tableProseText);
		ok('and says the same numbers the table counts', JSON.stringify(numbersOf(tableProseText).slice(0, diagramCountList.length).sort((left, right) => left - right)) === JSON.stringify([...diagramCountList].sort((left, right) => left - right)), tableProseText);
		ok('a filter on a table hides, and the prose says so', /hides 2 of them/.test(tableProseText), tableProseText);
		ok('the same level as a diagram is described as the diagram', /solid hexagons/.test(proseOfView('diagram', 0)));
		const valueTableProseText = vocabulary.levelProseOf({ focusNode: valueLevel.node, levelRowList: valueRowList, filterText: '', filterUnmatchedRowCount: 0, effectiveViewMode: 'table' }).sentenceList.join(' ');
		ok('the 48 values, opened as a table, are described as the table\'s 48 rows', /table/.test(valueTableProseText) && !/hexagon/.test(valueTableProseText) && numbersOf(valueTableProseText)[0] === 48, valueTableProseText);
		ok('a view the prose has no words for is refused by name', /no level prose for the view 'schema'/.test(refusalTextOf(() => vocabulary.levelProseOf({ focusNode: store.focusNode, levelRowList: store.levelRowList, filterText: '', filterUnmatchedRowCount: 0, effectiveViewMode: 'schema' }))));
		console.log('\n=== 10. ⟪explorerTidy review S5⟫ a selected leaf meaning shows its tuple and Expressed-in ===');
		if (!store.loadLeafMeaning || !vocabulary.selectedLeafNodeOf) {
			ok('the store reads a selected leaf meaning\'s own node (loadLeafMeaning) and the vocabulary merges it (selectedLeafNodeOf)', false);
		} else {
			// the fixture was captured before the hasChildren fix; the server now sends hasChildren false on these rows
			const valueRow = { ...valueRowList[0], hasChildren: false };
			const valuelessRow = { ...store.levelRowList.find((oneRow) => oneRow.relationshipType === 'HAS_MEANING' && !oneRow.valueMeaningCount), hasChildren: false };
			const leafNodeOf = (oneRow) => ({ stableId: oneRow.stableId, kind: 'meaning', name: oneRow.name, hubName: 'CEDS', referenceTier: oneRow.referenceTier, tuple: { domain: { kind: 'class', label: 'Individualized Program Accessibility Feature', nativeId: { cedsId: 'C200159' }, uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:C200159' } }, expressedInGroupList: [], expressionCount: 0, hasChildren: false });
			globalThis.clarityAxiosDouble.leafNodeByStableId = { [valueRow.stableId]: leafNodeOf(valueRow), [valuelessRow.stableId]: leafNodeOf(valuelessRow) };
			globalThis.clarityAxiosDouble.leafRequestCountByStableId = {};
			globalThis.clarityAxiosDouble.failOnceStableId = valuelessRow.stableId;
			ok('a value row and a value-less property row are leaves; a property holding values is not', vocabulary.isLeafMeaningRow(valueRow) && vocabulary.isLeafMeaningRow(valuelessRow) && !vocabulary.isLeafMeaningRow({ kind: 'meaning', hasChildren: true }));
			const loadingPromise = store.loadLeafMeaning(valueRow.stableId);
			ok('while its node is read the panel says it is reading', vocabulary.leafFactsStateNameOf(store.leafMeaningStateByStableId[valueRow.stableId]) === 'loading');
			await loadingPromise;
			await store.loadLeafMeaning(valueRow.stableId);
			ok('the value row\'s node is asked for once, with the drill\'s own request', globalThis.clarityAxiosDouble.leafRequestCountByStableId[valueRow.stableId] === 1, JSON.stringify(globalThis.clarityAxiosDouble.leafRequestCountByStableId));
			const valueShownNode = vocabulary.selectedLeafNodeOf({ selectedRow: valueRow, leafMeaningState: store.leafMeaningStateByStableId[valueRow.stableId] });
			ok('its tuple and Expressed-in reach the panel, under the row\'s own fields', Boolean(valueShownNode && valueShownNode.tuple && valueShownNode.tuple.domain && Array.isArray(valueShownNode.expressedInGroupList) && valueShownNode.relationshipType === valueRow.relationshipType) && vocabulary.leafFactsStateNameOf(store.leafMeaningStateByStableId[valueRow.stableId]) === 'read');
			await store.loadLeafMeaning(valuelessRow.stableId);
			ok('a failed read is kept, and the panel says so', vocabulary.leafFactsStateNameOf(store.leafMeaningStateByStableId[valuelessRow.stableId]) === 'failed' && vocabulary.selectedLeafNodeOf({ selectedRow: valuelessRow, leafMeaningState: store.leafMeaningStateByStableId[valuelessRow.stableId] }) === null);
			await store.loadLeafMeaning(valuelessRow.stableId);
			const valuelessShownNode = vocabulary.selectedLeafNodeOf({ selectedRow: valuelessRow, leafMeaningState: store.leafMeaningStateByStableId[valuelessRow.stableId] });
			ok('selected again after a failure it is asked again, and the value-less property shows its tuple and Expressed-in', globalThis.clarityAxiosDouble.leafRequestCountByStableId[valuelessRow.stableId] === 2 && Boolean(valuelessShownNode && valuelessShownNode.tuple && valuelessShownNode.expressedInGroupList));
			const detailPanelSourceText = fs.readFileSync(path.join(explorerDirPath, 'DetailPanel.vue'), 'utf8');
			ok('the panel reads them: a selected leaf is loaded, merged and shown with its full facts', /isMeaningRow\(store\.selectedRow\)/.test(detailPanelSourceText) && /store\.loadLeafMeaning\(leafStableId\)/.test(detailPanelSourceText) && /selectedLeafNodeOf\(\{ selectedRow: store\.selectedRow/.test(detailPanelSourceText) && /:shows-full-facts="isFocus \|\| Boolean\(leafMeaningState && leafMeaningState\.meaningNode\)"/.test(detailPanelSourceText));
		}
		ok('#15: the explainer\'s words are visible beside its icon', /data-testid="meaning-explainer-label">\{\{ explainerWords\.openButtonLabel \}\}/.test(fs.readFileSync(path.join(explorerDirPath, 'MeaningExplainer.vue'), 'utf8')));
		finish();
	})
	.catch((error) => {
		ok('the browser modules load and run', false, error && error.stack);
		finish();
	});
