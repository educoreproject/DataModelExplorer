'use strict';
// explorer-tidy.test.js — WORKORDER-explorerTidy-111126 gate 1, the parts that need no graph. The browser modules run here as they are (explorerVocabulary.js,
// rosettaReportBlocks.js, imported from their own files); the mapper is the server's own.
//   1. THE PROSE (item 1): no level template says "this domain as", names another domain or lists a property's values; every count's sentence has a one and an
//      other form, and a count of 0 says no sentence
//   2. A LEAF HAS NO OPEN (item 2): a meaning row opens only when its next level would list a row: a property meaning holding values. A value, a term, a property
//      meaning with no values do not; a property meaning read without its count is refused by name; an incoming meaning carries its own count
//   3. THE EMPTY LEVEL (item 3): the table says "nothing is beneath this" with no filter, and "nothing matches" with the filter and its Clear, from the vocabulary
//   4. NO BARE WORDS (item 4): every word between the explorer components' tags, and in their literal word-bearing attributes, comes from the vocabulary
//   5. NO PROGRAM NAMES (item 5): the Rosetta report's cautions are the page's own words, never the API's notes; its blocks say no camelCase name; every tuple and
//      range absent name the server declares has words; the /edc meaning page's part rows use the panel's words
// EXPLORER_TIDY_CODE_PATH=<another tree's code dir> runs the same gates there (the pinned base, to watch them fail).
// Run: /Users/tqwhite/.local/node/bin/node server/test/explorer-tidy.test.js

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const codePath = process.env.EXPLORER_TIDY_CODE_PATH || path.join(__dirname, '..', '..');
const explorerDirPath = path.join(codePath, 'html', 'components', 'standardsExplorer');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${String(detailText).slice(0, 700)}` : ''}`);
};
const finish = () => {
	console.log(`\nexplorer-tidy: ${passedCount} passed, ${failedCount} failed`);
	process.exit(failedCount === 0 ? 0 : 1);
};
const refusalTextOf = (work) => {
	try { work(); return ''; } catch (refusal) { return refusal.message; }
};
const sourceOf = (relativePath) => fs.readFileSync(path.join(codePath, relativePath), 'utf8');

// a camelCase program name: a lower-case run then an upper-case letter inside one word ("cedsId", "judgesRationale"); "EDUcore" and "iPhone"-like brand words start
// otherwise and are not program names
const CAMEL_CASE_PATTERN = /\b[a-z]+[A-Z][A-Za-z0-9]*\b/g;
const camelCaseTokenListOf = (visibleText) => String(visibleText).match(CAMEL_CASE_PATTERN) || [];

// the words between a template's tags once every interpolation, comment and tag is gone (the rosetta-page test's rule): what is left must be no word at all
const bareWordListOf = (templateText) => templateText.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ').split(/\s+/).filter((oneWord) => /[A-Za-z]/.test(oneWord));
// a literal (unbound) attribute a reader sees or hears, with a word in it: aria-label="Open", title="…", label="…"
const literalWordAttributeListOf = (templateText) => Array.from(templateText.matchAll(/(?<![:@\w-])(aria-label|title|label|placeholder|alt|no-data-text|loading-text|hint)="([^"]*[A-Za-z][^"]*)"/g)).map((attributeMatch) => `${attributeMatch[1]}="${attributeMatch[2]}"`);
// ⟪review S3⟫ a bound attribute a reader sees or hears whose expression holds its own words: :aria-label="`Open ${…}`", :title="'compared with'"
const boundWordAttributeListOf = (templateText) => Array.from(templateText.matchAll(/:(aria-label|title|label|placeholder|alt|hint)="([^"]*)"/g))
	.filter((attributeMatch) => /`[^`]*`|'[^']*'/.test(attributeMatch[2]) && /[A-Za-z]{2,}/.test((attributeMatch[2].match(/`[^`]*`|'[^']*'/g) || []).join(' ').replace(/\$\{[^}]*\}/g, ' ').replace(/[`']/g, '')))
	.map((attributeMatch) => attributeMatch[0]);
// ⟪review S3⟫ words built in a component's script: a template or quoted literal holding two or more words. A thrown Error's message is for a programmer, and a CSS
// value (a font list, a border) is no word, so neither is counted
const SCRIPT_LITERAL_EXEMPT_PATTERN_LIST = Object.freeze([/^\d+(\.\d+)?px (solid|dashed)/, /sans-serif$/]);
const scriptWordLiteralListOf = (componentText) => {
	const scriptText = ((componentText.match(/<script[^>]*>([\s\S]*?)<\/script>/) || [])[1] || '')
		.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\s\/\/ .*$/gm, ' ')
		.replace(/new Error\(`[^`]*`\)/g, ' ');
	const literalList = [...Array.from(scriptText.matchAll(/`([^`]*)`/g)).map((literalMatch) => literalMatch[1].replace(/\$\{[^}]*\}/g, ' ')), ...Array.from(scriptText.matchAll(/'([^'\n]*)'/g)).map((literalMatch) => literalMatch[1])];
	return literalList.filter((literalText) => /[A-Za-z]{2,} [A-Za-z]{2,}/.test(literalText) && !SCRIPT_LITERAL_EXEMPT_PATTERN_LIST.some((exemptPattern) => exemptPattern.test(literalText.trim())));
};
const templateSectionOf = (componentText) => {
	const openIndex = componentText.indexOf('<template>');
	const closeIndex = componentText.lastIndexOf('</template>');
	return openIndex === -1 || closeIndex === -1 ? '' : componentText.slice(openIndex + '<template>'.length, closeIndex);
};

Promise.all([
	import(pathToFileURL(path.join(explorerDirPath, 'explorerVocabulary.js')).href),
	import(pathToFileURL(path.join(codePath, 'html', 'components', 'rosetta', 'rosettaReportBlocks.js')).href),
	import(pathToFileURL(path.join(codePath, 'html', 'components', 'rosetta', 'rosettaVocabulary.js')).href),
])
	.then(([vocabulary, reportBlocks, rosettaVocabulary]) => {
		console.log('\n=== 1. the level prose is short ===');
		const templateSetByViewMode = vocabulary.meaningsVocabulary.levelProse.templateSetByViewMode;
		const templateTextList = Object.values(templateSetByViewMode).flatMap((oneSet) => Object.values(oneSet).flatMap((oneTemplate) => (typeof oneTemplate === 'string' ? [oneTemplate] : Object.values(oneTemplate))));
		ok('no prose template says "this domain as"', templateTextList.every((oneTemplate) => !/this domain as/i.test(oneTemplate)), templateTextList.filter((oneTemplate) => /this domain as/i.test(oneTemplate)).join(' | '));
		ok('no prose template names other domains or lists properties with values', templateTextList.every((oneTemplate) => !/\{(domainNameText|valueHolderText|domainName)\}/.test(oneTemplate)), templateTextList.filter((oneTemplate) => /\{(domainNameText|valueHolderText|domainName)\}/.test(oneTemplate)).join(' | '));
		const countedTemplateNameList = ['domainMeaningsTemplate', 'domainMappedTemplate', 'domainIncomingTemplate', 'valuesTemplate', 'valuesMappedTemplate'];
		ok('every count\'s sentence has a one form and an other form, in both views', Object.values(templateSetByViewMode).every((oneSet) => countedTemplateNameList.every((templateName) => oneSet[templateName] && oneSet[templateName].one && oneSet[templateName].other)));
		const domainNode = { kind: 'meaningDomain', name: 'Accessibility Feature', hubName: 'CEDS', meaningCount: 36, mappedMeaningCount: 2, termMeaningCount: 1, incomingMeaningCount: 3 };
		const domainRowList = [
			{ relationshipType: 'HAS_MEANING', name: 'Has Accessibility Feature Application Type', valueMeaningCount: 4 },
			...['one', 'two', 'three'].map((rowName) => ({ relationshipType: 'HAS_INCOMING_MEANING', name: rowName, hubDomainName: 'Assessment Registration', incomingSlotNameList: ['range'] })),
		];
		const proseTextOf = (proseArgs) => vocabulary.levelProseOf({ filterText: '', filterUnmatchedRowCount: 0, effectiveViewMode: 'diagram', ...proseArgs }).sentenceList.join(' ');
		const domainProseText = proseTextOf({ focusNode: domainNode, levelRowList: domainRowList });
		console.log(`    ${domainProseText}`);
		ok('the domain prose is the approved shape, one sentence per fact', domainProseText === 'This domain contributes to 36 meanings (solid hexagons). 2 meanings have elements of other standards mapped to them (marked "N elements map here"). 3 meanings in other domains name it as their range (outlined hexagons, dashed arrow). A › means the meaning holds values; open it to see them.', domainProseText);
		ok('it names no other domain and lists no property', !/Assessment Registration|Application Type|holds 4/.test(domainProseText));
		const quietProseText = proseTextOf({ focusNode: { ...domainNode, mappedMeaningCount: 0, incomingMeaningCount: 0 }, levelRowList: [] });
		ok('a count of 0 says no sentence (nothing mapped, nothing incoming, no value holder)', quietProseText === 'This domain contributes to 36 meanings (solid hexagons).', quietProseText);
		ok('review N2: a domain holding only its own term says so, without counting it a meaning', proseTextOf({ focusNode: { ...domainNode, meaningCount: 0, mappedMeaningCount: 0, incomingMeaningCount: 0 }, levelRowList: [] }) === 'It holds only its own term (dashed hexagon).');
		ok('review N1: a › on an incoming meaning is explained too', /A › means the meaning holds values/.test(proseTextOf({ focusNode: { ...domainNode, meaningCount: 1, mappedMeaningCount: 0, incomingMeaningCount: 1 }, levelRowList: [{ relationshipType: 'HAS_INCOMING_MEANING', name: 'x', valueMeaningCount: 3, incomingSlotNameList: ['range'] }] })));
		ok('one meaning and one incoming are said in the one form', /contributes to 1 meaning \(solid hexagon\)\. 1 meaning has elements .* mapped to it .* 1 meaning in another domain names it as its range \(outlined hexagon, dashed arrow\)\./.test(proseTextOf({ focusNode: { ...domainNode, meaningCount: 1, mappedMeaningCount: 1, incomingMeaningCount: 1 }, levelRowList: domainRowList.slice(0, 2) })));

		console.log('\n=== 2. a meaning row opens only to rows ===');
		const mapper = require(path.join(codePath, 'server', 'data-model', 'data-mapping', 'mappers', 'standards-neighbourhood.js'))({});
		const meaningRowOf = (rowFields) => ({ cardStableId: 'https://example.org/card', name: 'A meaning', hubName: 'CEDS', mappedElementCount: 0, ...rowFields });
		ok('a value meaning does not open', mapper.mapMeaningItem(meaningRowOf({ referenceTier: 'value' }), 'CEDS').hasChildren === false);
		ok('a term meaning does not open', mapper.mapMeaningItem(meaningRowOf({ referenceTier: 'term' }), 'CEDS').hasChildren === false);
		ok('a property meaning holding no values does not open', mapper.mapMeaningItem(meaningRowOf({ referenceTier: 'property', valueMeaningCount: 0, valueElementCount: 0 }), 'CEDS').hasChildren === false);
		ok('a property meaning holding values opens', mapper.mapMeaningItem(meaningRowOf({ referenceTier: 'property', valueMeaningCount: 4, valueElementCount: 0 }), 'CEDS').hasChildren === true);
		ok('a property meaning read without its value count is refused by name', /was read without its valueMeaningCount/.test(refusalTextOf(() => mapper.mapMeaningItem(meaningRowOf({ referenceTier: 'property' }), 'CEDS'))));
		const incomingItemOf = (valueMeaningCount) => mapper.mapIncomingMeaningItem({ incomingRecord: { meaningRow: meaningRowOf({ referenceTier: 'property', domainName: 'Other' }), valueMeaningCount, slotEdgeTypeList: ['HAS_CEDS_RANGE'], ownDomainStableId: 'https://example.org/other' }, standardFamily: 'CEDS' });
		ok('an incoming meaning opens by its own value count', incomingItemOf(3).hasChildren === true && incomingItemOf(0).hasChildren === false);
		ok('the incoming meanings query counts each one\'s values for a domain level', /valueMeaningCount: CASE WHEN card\.referenceTier = \$propertyTier THEN COUNT \{/.test(mapper.getCypher('incomingMeaningsByElementStableId', { elementStableId: 'x', withIncomingValueCount: true }).cypher));
		// ⟪review S1⟫ the element's meaning facts (the panel, the /edc page) do not pay for a count they do not use
		ok('and not for an element\'s meaning facts', !/valueMeaningCount|incomingValueCard/.test(mapper.getCypher('incomingMeaningsByElementStableId', { elementStableId: 'x', withIncomingValueCount: false }).cypher));
		ok('a query asked without saying which is refused by name', /needs withIncomingValueCount true or false/.test(refusalTextOf(() => mapper.getCypher('incomingMeaningsByElementStableId', { elementStableId: 'x' }))));
		ok('review N3: a property meaning without its count is refused through the access point\'s callback, by name', /was read without its valueMeaningCount/.test(mapper.meaningCountAbsentRefusalOf([meaningRowOf({ referenceTier: 'property' })])) && mapper.meaningCountAbsentRefusalOf([meaningRowOf({ referenceTier: 'property', valueMeaningCount: 0 }), meaningRowOf({ referenceTier: 'value' })]) === '');
		// ⟪review S2⟫ a property opens only with a mapping or a child that is not an instance (its instances fold away when they all map the same way, eg none)
		const propertyChildOf = (childFields) => mapper.mapChildItem({ stableId: 'sif:question/x', name: '@Codeset', labelList: ['ForgedNode', 'DmeProperty'], description: '', hasStructuralChildren: true, mappingList: [], occurrenceCount: 1, ...childFields });
		ok('review S2: a property whose only children are instances, with no mapping, does not open', propertyChildOf({ hasNonInstanceStructuralChildren: false }).hasChildren === false);
		ok('review S2: a property with a child that is not an instance opens', propertyChildOf({ hasNonInstanceStructuralChildren: true }).hasChildren === true);
		ok('review S2: a property read without the instance distinction is refused by name', /was read without hasNonInstanceStructuralChildren/.test(refusalTextOf(() => propertyChildOf({}))));

		console.log('\n=== 3. the empty level ===');
		const tableText = sourceOf('html/components/standardsExplorer/Table.vue');
		const tableWords = vocabulary.walkEmptyLevelVocabulary || {};
		ok('the vocabulary has the two empty-level wordings', tableWords.emptyLevelText === 'Nothing is beneath this.' && /\{filterText\}/.test(tableWords.emptyFilteredTemplate || ''));
		ok('the old double wording is gone', !/matches the filter, or nothing is beneath/.test(tableText));
		// ⟪review N4⟫ the choice as behaviour (emptyLevelOf), and the table and the diagram drawing what it says
		const emptyOf = vocabulary.emptyLevelOf || (() => ({}));
		ok('with no filter an empty level says nothing is beneath it', JSON.stringify(emptyOf({ levelRowCount: 0, filterText: '' })) === JSON.stringify({ isEmptiedByFilter: false, emptyText: 'Nothing is beneath this.' }));
		ok('a filter typed on a level with nothing beneath it still says nothing is beneath it', emptyOf({ levelRowCount: 0, filterText: 'abc' }).isEmptiedByFilter === false);
		ok('a filter that hides every row says nothing matches it', JSON.stringify(emptyOf({ levelRowCount: 4, filterText: ' zzz ' })) === JSON.stringify({ isEmptiedByFilter: true, emptyText: "Nothing on this level matches 'zzz'." }));
		ok('the table draws the choice, with Clear beside the filter\'s words', /<div v-if="emptyLevel\.isEmptiedByFilter"[^>]*data-testid="table-empty-filtered">\s*<span>\{\{ emptyLevel\.emptyText \}\}<\/span>\s*<v-btn[^>]*@click="store\.setFilterText\(''\)">\{\{ walkFilterVocabulary\.clearText \}\}<\/v-btn>/.test(tableText) && /data-testid="table-empty-level">\{\{ emptyLevel\.emptyText \}\}<\/div>/.test(tableText));
		ok('the diagram says an empty level the same way', /data-testid="diagram-empty">\{\{ walkEmptyLevelVocabulary\.emptyLevelText \}\}<\/p>/.test(sourceOf('html/components/standardsExplorer/Diagram.vue')));
		ok('the filtered wording names the filter', vocabulary.wordingOf(tableWords.emptyFilteredTemplate || '{filterText}', { filterText: 'zzz' }) === "Nothing on this level matches 'zzz'.");

		console.log('\n=== 4. no bare words in the explorer components ===');
		// ⟪explorerTidy⟫ components not yet swept, named here so the gate says so rather than passing silently; the list only ever shrinks
		const UNSWEPT_COMPONENT_LIST = [];
		const componentFileNameList = fs.readdirSync(explorerDirPath).filter((fileName) => fileName.endsWith('.vue'));
		const wordingByComponent = componentFileNameList.map((fileName) => {
			const componentText = fs.readFileSync(path.join(explorerDirPath, fileName), 'utf8');
			const templateText = templateSectionOf(componentText);
			return { fileName, bareWordList: bareWordListOf(templateText), attributeList: [...literalWordAttributeListOf(templateText), ...boundWordAttributeListOf(templateText)], scriptWordList: scriptWordLiteralListOf(componentText) };
		});
		wordingByComponent.filter((oneComponent) => !UNSWEPT_COMPONENT_LIST.includes(oneComponent.fileName)).forEach((oneComponent) => {
			ok(`${oneComponent.fileName}: no bare word between its tags`, oneComponent.bareWordList.length === 0, oneComponent.bareWordList.slice(0, 12).join(' '));
			ok(`${oneComponent.fileName}: no literal words in its labels, bound or not`, oneComponent.attributeList.length === 0, oneComponent.attributeList.slice(0, 6).join(' '));
			ok(`${oneComponent.fileName}: no words built in its script`, oneComponent.scriptWordList.length === 0, oneComponent.scriptWordList.slice(0, 6).join(' | '));
		});
		if (UNSWEPT_COMPONENT_LIST.length) console.log(`  NOTE: not yet swept: ${UNSWEPT_COMPONENT_LIST.join(', ')}`);
		ok('Table.vue says Open, its screen-reader Open and its Open label from the vocabulary', /\{\{ walkTableVocabulary\.openText \}\}/.test(tableText) && /\{\{ walkTableVocabulary\.openColumnLabelText \}\}/.test(tableText) && /:aria-label="openLabelOf\(item\)"/.test(tableText) && !/`Open \$\{item\.displayName\}`/.test(tableText));

		console.log('\n=== 5. no program names on the page ===');
		const rosettaPageText = sourceOf('html/pages/explore/rosetta.vue');
		ok('the Report tab\'s cautions are the page\'s words, never the API\'s notes', !/store\.report\.rationaleNote|store\.report\.partialNote/.test(rosettaPageText) && /rosettaPageWords\.reportRationaleCautionText/.test(rosettaPageText) && /rosettaPageWords\.reportPartialText/.test(rosettaPageText));
		const cautionWordList = [rosettaVocabulary.rosettaPageWords.reportRationaleCautionText, rosettaVocabulary.rosettaPageWords.reportPartialText];
		ok('the caution line says "The judge\'s words may quote your text", with no camelCase', /^The judge's words may quote your text/.test(cautionWordList[0] || '') && cautionWordList.every((oneText) => oneText && camelCaseTokenListOf(oneText).length === 0), JSON.stringify(cautionWordList));
		const reportFixture = {
			status: 'stopped',
			job: { hubList: ['CEDS'], stopReasonName: 'dailySpendCeilingReached', stopReasonText: 'The daily spend ceiling was reached.' },
			fieldList: [
				{ requestName: 'accommodationType', requestDefinition: 'the accommodation', resultList: [{ hub: 'CEDS', status: 'judged', judgesRationale: 'quotes accommodationType', proposal: { uri: 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/abc', label: 'Has Accessibility Feature Type', category: 'strong', predicate: 'exactMatch', tuple: { domain: { kind: 'class', label: 'Individualized Program Accessibility Feature', nativeId: { cedsId: 'C200159' }, uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:C200159' }, range: { kind: 'optionSet', label: 'Accessibility Feature Type', nativeIdAbsentName: 'hubElementCarriesNoNativeIdentifier', uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:C000385' } } } }] },
				{ requestName: 'lostField', resultList: [{ hub: 'CEDS', status: 'judged', proposal: { uri: 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/def', label: 'Old', category: 'moderate', predicate: 'closeMatch', tupleAbsentName: 'judgedBeforeTupleRecorded' } }] },
				{ requestName: 'stoppedField', resultList: [{ hub: 'CEDS', status: 'notJudged', notJudgedReason: 'dailySpendCeilingReached' }] },
			],
		};
		const blockTextList = reportBlocks.fieldBlockListOf({ report: reportFixture, expressionByMeaningUri: {} }).flatMap((oneField) => oneField.hubBlockList.flatMap((oneBlock) => [
			oneBlock.hubHeadingText, oneBlock.hubIdsText, oneBlock.tupleAbsentText, oneBlock.relationText, oneBlock.strengthWords, oneBlock.statusText, oneBlock.whyText, oneBlock.expressedText,
			...(oneBlock.slotList || []).flatMap((oneSlot) => [oneSlot.slotLabel, oneSlot.detailText, oneSlot.uriAbsentText]),
		])).filter(Boolean);
		ok('the report\'s own words in every block (headings, ids, slot details, why there is none) say no camelCase name', blockTextList.every((oneText) => camelCaseTokenListOf(oneText).length === 0), blockTextList.filter((oneText) => camelCaseTokenListOf(oneText).length).join(' | '));
		ok('a slot says its id as "CEDS id C200159", never its program name', blockTextList.includes('class · CEDS id C200159'), JSON.stringify(blockTextList));
		const { TUPLE_ABSENT_NAME_LIST } = require(path.join(codePath, 'server', 'lib', 'standards-query', 'hubCardTuple.js'));
		const { RANGE_LIST_ABSENT_NAME_LIST } = require(path.join(codePath, 'server', 'lib', 'edc-resolver', 'meaningRangeList.js'));
		const declaredAbsentNameList = [...TUPLE_ABSENT_NAME_LIST, ...RANGE_LIST_ABSENT_NAME_LIST];
		const absentTextOf = (absentName) => (vocabulary.absentReasonTextOf ? refusalTextOf(() => vocabulary.absentReasonTextOf(absentName)) || vocabulary.absentReasonTextOf(absentName) : 'no absentReasonTextOf');
		const wordlessAbsentNameList = declaredAbsentNameList.filter((absentName) => !vocabulary.absentReasonTextOf || refusalTextOf(() => vocabulary.absentReasonTextOf(absentName)));
		ok(`every tuple and range absent name the server declares has words (${declaredAbsentNameList.length})`, wordlessAbsentNameList.length === 0, wordlessAbsentNameList.join(', '));
		ok('and those words say no camelCase name', declaredAbsentNameList.every((absentName) => camelCaseTokenListOf(absentTextOf(absentName)).length === 0));
		ok('a name with no words is refused by name', Boolean(vocabulary.absentReasonTextOf) && /no words for the absent name 'notAName'/.test(refusalTextOf(() => vocabulary.absentReasonTextOf('notAName'))));
		const humanPageText = sourceOf('server/lib/edc-resolver/humanPage.js');
		ok('the /edc meaning page\'s part rows use the panel\'s words, not the graph\'s id names', /tuplePartDetailTextOf\(\{ slotPart: part, hubName \}\)/.test(humanPageText) && !/`\$\{idName\} \$\{idText\}`/.test(humanPageText) && !/no native identifier: \$\{part\.nativeIdAbsentName\}/.test(humanPageText));
		ok('and say why a tuple or a range list is absent in words', /tupleAbsentTextOf\(humanPageFacts\.tupleAbsentName\)/.test(humanPageText) && /rangeListAbsentTextOf\(answerBody\.rangeListAbsentName\)/.test(humanPageText));

		console.log('\n=== 6. review S4, N5, N7: every way of not knowing is said in words on the /edc pages ===');
		const { answerTextFor } = require(path.join(codePath, 'server', 'lib', 'edc-resolver', 'htmlAnswer.js'));
		const { FACTS_ABSENT_NAME_LIST } = require(path.join(codePath, 'server', 'lib', 'edc-resolver', 'humanPageFacts.js'));
		const humanPageRules = require(path.join(codePath, 'server', 'lib', 'edc-resolver', 'humanPageRules.json'));
		const { caseList } = require(path.join(codePath, 'server', 'test', 'fixtures', 'edcHumanPages', 'humanPageCases.json'));
		const pageTextOf = ({ casePath, httpStatus, answerBody, humanPageFacts }) => answerTextFor({ answerFormat: 'html', httpStatus, answerBody, humanPageFacts, edcIri: `https://w3id.org/EDUcore/${casePath.slice(1)}`, requestPath: casePath, publicPathPrefix: '/edc/', baseIri: 'https://w3id.org/EDUcore/' });
		// the page a reader sees: no script, style, JSON block or raw Properties listing, no tags, no attributes
		const pageVisibleTextOf = (pageText) => pageText.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<details>\s*<summary>JSON[\s\S]*?<\/details>/g, ' ')
			.replace(/<details>\s*<summary>Properties[\s\S]*?<\/details>/g, ' ').replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
		const meaningCase = caseList.find((oneCase) => oneCase.casePath.startsWith('/CEDStandards/hub/14.0.0.0/ab39'));
		const firstSlotName = Object.keys(meaningCase.humanPageFacts.tuple)[0];
		const { uri: unusedUri, ...uriLessPart } = meaningCase.humanPageFacts.tuple[firstSlotName];
		const uriLessPage = pageTextOf({ ...meaningCase, humanPageFacts: { ...meaningCase.humanPageFacts, tuple: { ...meaningCase.humanPageFacts.tuple, [firstSlotName]: { ...uriLessPart, uriAbsentReason: 'notInManifestStore' } } } });
		ok('N5: a part with no URI says why in words, the server name kept only in a data attribute', /\(no URI: not in a published EDUcore release yet\)/.test(uriLessPage) && /data-uri-absent-reason="notInManifestStore"/.test(uriLessPage) && !/notInManifestStore/.test(pageVisibleTextOf(uriLessPage)));
		const unmintablePage = pageTextOf({ ...meaningCase, humanPageFacts: { ...meaningCase.humanPageFacts, tuple: { ...meaningCase.humanPageFacts.tuple, [firstSlotName]: { ...uriLessPart, uriAbsentReason: 'notMintable: standardSourceName missing' } } } });
		ok('a reason the minter gave with its own error is said plainly', /\(no URI: its URI could not be made\)/.test(unmintablePage) && camelCaseTokenListOf(pageVisibleTextOf(unmintablePage).replace(/[a-z]+:[A-Za-z]+/g, ' ')).every((oneToken) => !/^(notMintable|standardSourceName)$/.test(oneToken)));
		const factsAbsentPage = pageTextOf({ ...meaningCase, humanPageFacts: { factsAbsentName: 'noLiveGraph' } });
		const factsAbsentVisibleText = pageVisibleTextOf(factsAbsentPage);
		ok('S4: a page made without the live graph says so in words, the tuple bracket too', /The live graph was not read for this page\. This page was made without the live graph\./.test(factsAbsentVisibleText) && !/noLiveGraph/.test(factsAbsentVisibleText) && /data-facts-absent-name="noLiveGraph"/.test(factsAbsentPage), factsAbsentVisibleText.slice(0, 400));
		const wordlessFactsNameList = FACTS_ABSENT_NAME_LIST.filter((absentName) => refusalTextOf(() => vocabulary.absentReasonTextOf(absentName)));
		ok(`S4: every facts absent name an /edc page declares has words (${FACTS_ABSENT_NAME_LIST.length})`, wordlessFactsNameList.length === 0, wordlessFactsNameList.join(', '));
		ok('N7: every SKOS match edge an /edc page lists has words', humanPageRules.matchEdgeTypeList.every((matchEdgeType) => vocabulary.relationTextOf(matchEdgeType) !== matchEdgeType && camelCaseTokenListOf(vocabulary.relationTextOf(matchEdgeType)).length === 0));
		const rosettaUriLessText = reportBlocks.fieldBlockListOf({ report: { ...reportFixture, fieldList: [{ requestName: 'x', resultList: [{ hub: 'CEDS', status: 'judged', proposal: { uri: 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/abc', label: 'L', category: 'strong', predicate: 'exactMatch', tuple: { property: { kind: 'property', label: 'P', uriAbsentReason: 'notInManifestStore' } } } }] }] }, expressionByMeaningUri: {} })[0].hubBlockList[0].slotList[0].uriAbsentText;
		ok('S4: the Rosetta report says a slot\'s missing URI in words', rosettaUriLessText === 'no URI (not in a published EDUcore release yet)', rosettaUriLessText);
		finish();
	})
	.catch((error) => {
		ok('the modules load and run', false, error && error.stack);
		finish();
	});
