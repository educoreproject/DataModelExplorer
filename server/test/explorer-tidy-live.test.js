'use strict';
// explorer-tidy-live.test.js — WORKORDER-explorerTidy-111126 gate 1 on the LIVE golden, the access points built as the server builds them (lib/explorerLiveHarness.js),
// nothing stubbed but the usage table:
//   1. A ROW OPENS ONLY TO ROWS (item 2): on every sampled level, each row's hasChildren equals "drilling it lists at least one row" (the rows the store draws: the
//      level's mappings, then its unfolded groups' items). Sampled: the values of Has Accessibility Feature Application Type and of Has Accessibility Feature Type
//      (P000385 in C200159), the domains Accessibility Feature (C200012) and C200159, a sample of the CEDS hub's domains, the P000385 element, and ⟪review S2⟫ SIF's
//      root (a single-occurrence property folds its one instance away, so it opens only with a mapping), Ed-Fi, CTDL and CLR levels
//   2. THE PROSE (item 1): Accessibility Feature (36 meanings, 3 incoming) and C200159 read in the short shape, one sentence per fact, naming no other domain and
//      listing no property, never "this domain as"; every number in it is one of the level's counts, and every count that is not 0 is said
//   3. NO PROGRAM NAMES (item 5): no camelCase token in the visible text of the C200159 and P600144 URI pages, C200159's own term's meaning page, P000385's meaning
//      page and one of its value meanings' pages (visible: outside the page's scripts, its styles, its JSON block and its raw Properties listing, which by design
//      shows the node as the graph stores it)
// Needs the local golden and the qbook config. SUBJECT_SERVER_PATH=<another tree's server dir> runs it there (the base, to watch it fail).
// Run: /Users/tqwhite/.local/node/bin/node server/test/explorer-tidy-live.test.js

const path = require('path');
const { pathToFileURL } = require('url');
const { goldenHandle, branchLibrary, resolveUriText, GATE_WAIT_MILLISECONDS, GATE_WAIT_LIMIT } = require('./lib/explorerLiveHarness');

const subjectServerPath = process.env.SUBJECT_SERVER_PATH || path.join(__dirname, '..');
const vocabularyFileUrl = pathToFileURL(path.join(subjectServerPath, '..', 'html', 'components', 'standardsExplorer', 'explorerVocabulary.js')).href;

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${String(detailText).slice(0, 900)}` : ''}`);
};
const finish = () => {
	console.log(`\nexplorer-tidy-live: ${passed} passed, ${failed} failed`);
	process.exit(failed ? 1 : 0);
};

const CEDS_TERMS = 'https://w3id.org/CEDStandards/terms/';
const C200012 = `${CEDS_TERMS}C200012`;
const C200159 = `${CEDS_TERMS}C200159`;
const P000385 = `${CEDS_TERMS}P000385`;
const APPLICATION_TYPE_MEANING_NAME = 'Has Accessibility Feature Application Type';
const FEATURE_TYPE_MEANING_NAME = 'Has Accessibility Feature Type';
const CEDS_HUB_SAMPLE_SIZE = 5;
// ⟪review S2⟫ the Standards Explorer across its families: SIF's root (790 rows, among them single-occurrence properties whose one instance folds away), Ed-Fi, CTDL, CLR
const STANDARDS_SAMPLE_LEVEL_LIST = Object.freeze(['sif260928:root', 'edfi:common/AcademicHonor', 'edfi:domainEntity/AcademicWeek', 'ceterms:AcademicCertificate', 'ceterms:AccreditAction', 'clr:Address']);
const CAMEL_CASE_PATTERN = /\b[a-z]+[A-Z][A-Za-z0-9]*\b/g;

const nodeOf = (stableId, callback) => branchLibrary['standards-neighbourhood']({ action: 'node', stableId }, callback);
// the rows a level draws, as the store's levelRowList builds them: its mapping rows (rowOfMapping: the hub element, always openable), then every unfolded group's items, each with its group's relationshipType
const rowListOf = (level) => [
	...(level.mappingList || []).map((oneMapping) => ({ stableId: oneMapping.anchor.stableId, name: oneMapping.anchor.name, hasChildren: true, relationshipType: 'MAPS_TO_HUB' })),
	...(level.childGroupList || []).filter((oneGroup) => !oneGroup.folded).flatMap((oneGroup) => oneGroup.itemList.map((oneItem) => ({ ...oneItem, relationshipType: oneGroup.relationshipType }))),
];
// a row's drill goes where its Open goes: an incoming meaning to its own place in the walk, any other row one step below
const drillStableIdOf = (oneRow) => (oneRow.meaningsWalkPathStableIdList ? oneRow.meaningsWalkPathStableIdList[oneRow.meaningsWalkPathStableIdList.length - 1] : oneRow.stableId);

// the page's visible text: no script, style, JSON block or raw Properties listing, no tags
const visibleTextOf = (pageText) => pageText
	.replace(/<script[\s\S]*?<\/script>/g, ' ')
	.replace(/<style[\s\S]*?<\/style>/g, ' ')
	.replace(/<details>\s*<summary>JSON[\s\S]*?<\/details>/g, ' ')
	.replace(/<details>\s*<summary>Properties[\s\S]*?<\/details>/g, ' ')
	.replace(/<pre[\s\S]*?<\/pre>/g, ' ')
	.replace(/<[^>]*>/g, ' ')
	.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
	.replace(/\s+/g, ' ');

const levelByStableId = {};
const stepList = [];
stepList.push((done) => {
	const waitConnected = (tryCount) => {
		if (goldenHandle.graphStateOf().graphState === 'connected') { done(); return; }
		if (tryCount >= GATE_WAIT_LIMIT) { ok('the golden handle connects within the wait', false, JSON.stringify(goldenHandle.graphStateOf())); finish(); return; }
		setTimeout(() => waitConnected(tryCount + 1), GATE_WAIT_MILLISECONDS);
	};
	waitConnected(0);
});
// the named levels, read once
[`meaningDomain:${C200012}`, `meaningDomain:${C200159}`, 'meaningHub:CEDS', ...STANDARDS_SAMPLE_LEVEL_LIST, P000385].forEach((stableId) => stepList.push((done) => nodeOf(stableId, (nodeError, level) => {
	if (nodeError) { ok(`${stableId} answers`, false, nodeError); finish(); return; }
	levelByStableId[stableId] = level;
	done();
})));
// the two value levels, reached from their domains' rows
stepList.push((done) => {
	const meaningRowOf = (domainStableId, meaningName) => rowListOf(levelByStableId[`meaningDomain:${domainStableId}`]).find((oneRow) => oneRow.relationshipType === 'HAS_MEANING' && oneRow.name === meaningName);
	const applicationTypeRow = meaningRowOf(C200012, APPLICATION_TYPE_MEANING_NAME);
	const featureTypeRow = meaningRowOf(C200159, FEATURE_TYPE_MEANING_NAME);
	if (!applicationTypeRow || !featureTypeRow) { ok('the two value holders are listed in their domains', false, JSON.stringify({ applicationTypeRow: Boolean(applicationTypeRow), featureTypeRow: Boolean(featureTypeRow) })); finish(); return; }
	nodeOf(applicationTypeRow.stableId, (firstError, applicationTypeLevel) => nodeOf(featureTypeRow.stableId, (secondError, featureTypeLevel) => {
		if (firstError || secondError) { ok('the two value levels answer', false, firstError || secondError); finish(); return; }
		levelByStableId.applicationTypeValues = applicationTypeLevel;
		levelByStableId.featureTypeValues = featureTypeLevel;
		done();
	}));
});

// 1. every row of a level: hasChildren against what its drill lists
const surveyLevel = (levelName, rowList) => (done) => {
	const mismatchList = [];
	const drillOne = (rowIndex) => {
		if (rowIndex >= rowList.length) {
			ok(`${levelName}: all ${rowList.length} rows open exactly when their drill lists a row`, rowList.length > 0 && mismatchList.length === 0, mismatchList.slice(0, 8).join(' | '));
			done();
			return;
		}
		const oneRow = rowList[rowIndex];
		nodeOf(drillStableIdOf(oneRow), (drillError, drilled) => {
			const drillRowCount = drillError ? 0 : rowListOf(drilled).length;
			if (Boolean(oneRow.hasChildren) !== drillRowCount > 0) mismatchList.push(`${oneRow.relationshipType} '${oneRow.name}' hasChildren=${oneRow.hasChildren} drill=${drillError ? `refused (${String(drillError).slice(0, 80)})` : drillRowCount}`);
			drillOne(rowIndex + 1);
		});
	};
	drillOne(0);
};
stepList.push((done) => { console.log('\n=== 1. a row opens only to rows ==='); done(); });
stepList.push((done) => surveyLevel(`${APPLICATION_TYPE_MEANING_NAME}'s values`, rowListOf(levelByStableId.applicationTypeValues))(done));
stepList.push((done) => surveyLevel(`${FEATURE_TYPE_MEANING_NAME}'s 48 values (P000385 in C200159)`, rowListOf(levelByStableId.featureTypeValues))(done));
stepList.push((done) => surveyLevel('Accessibility Feature (C200012): its meanings, own term and incoming meanings', rowListOf(levelByStableId[`meaningDomain:${C200012}`]))(done));
stepList.push((done) => surveyLevel('C200159: its meanings, own term and incoming meaning', rowListOf(levelByStableId[`meaningDomain:${C200159}`]))(done));
stepList.push((done) => {
	const hubRowList = rowListOf(levelByStableId['meaningHub:CEDS']);
	const middleIndex = Math.floor(hubRowList.length / 2);
	surveyLevel('the CEDS hub: its first, middle and last domains', [...hubRowList.slice(0, CEDS_HUB_SAMPLE_SIZE), ...hubRowList.slice(middleIndex, middleIndex + CEDS_HUB_SAMPLE_SIZE), ...hubRowList.slice(-CEDS_HUB_SAMPLE_SIZE)])(done);
});
STANDARDS_SAMPLE_LEVEL_LIST.forEach((levelStableId) => stepList.push((done) => surveyLevel(`the Standards Explorer: ${levelStableId}`, rowListOf(levelByStableId[levelStableId]))(done)));
stepList.push((done) => surveyLevel('the Standards Explorer: the P000385 element', rowListOf(levelByStableId[P000385]))(done));
stepList.push((done) => {
	const valueRowList = rowListOf(levelByStableId.featureTypeValues);
	ok('the values level has no Open: no value row opens', valueRowList.length === 48 && valueRowList.every((oneRow) => oneRow.hasChildren === false), JSON.stringify(valueRowList.filter((oneRow) => oneRow.hasChildren).map((oneRow) => oneRow.name).slice(0, 5)));
	done();
});

// 2. the prose, from the live levels
let vocabulary = null;
stepList.push((done) => import(vocabularyFileUrl).then((loaded) => { vocabulary = loaded; done(); }).catch((importError) => { ok('the vocabulary loads', false, importError && importError.stack); finish(); }));
const proseCheckOf = ({ domainStableId, domainName, expectedCountByName }) => (done) => {
	const level = levelByStableId[`meaningDomain:${domainStableId}`];
	const rowList = rowListOf(level);
	const focusNode = level.node;
	const countList = [focusNode.meaningCount, focusNode.mappedMeaningCount, focusNode.incomingMeaningCount].filter(Boolean);
	ok(`${domainName}: its level counts ${JSON.stringify(expectedCountByName)}`, Object.entries(expectedCountByName).every(([countName, countValue]) => focusNode[countName] === countValue), JSON.stringify({ meaningCount: focusNode.meaningCount, mappedMeaningCount: focusNode.mappedMeaningCount, incomingMeaningCount: focusNode.incomingMeaningCount }));
	['diagram', 'table'].forEach((effectiveViewMode) => {
		const proseText = vocabulary.levelProseOf({ focusNode, levelRowList: rowList, filterText: '', filterUnmatchedRowCount: 0, effectiveViewMode }).sentenceList.join(' ');
		console.log(`    ${domainName} (${effectiveViewMode}): ${proseText}`);
		const numberList = (proseText.match(/\d[\d,]*/g) || []).map((numberText) => Number(numberText.replace(/,/g, '')));
		ok(`${domainName} (${effectiveViewMode}): every number is a count, and every count that is not 0 is said`, JSON.stringify(numberList) === JSON.stringify(countList), `${JSON.stringify(numberList)} vs ${JSON.stringify(countList)}`);
		ok(`${domainName} (${effectiveViewMode}): never "this domain as"`, !/this domain as/i.test(proseText));
		const otherDomainNameList = Array.from(new Set(rowList.map((oneRow) => oneRow.hubDomainName).filter((oneName) => oneName && oneName !== level.node.name)));
		const namedOtherList = otherDomainNameList.filter((oneName) => proseText.includes(oneName));
		ok(`${domainName} (${effectiveViewMode}): names no other domain (of ${otherDomainNameList.length})`, namedOtherList.length === 0, namedOtherList.join(', '));
		const listedPropertyList = rowList.filter((oneRow) => oneRow.relationshipType === 'HAS_MEANING' && proseText.includes(oneRow.name)).map((oneRow) => oneRow.name);
		ok(`${domainName} (${effectiveViewMode}): lists no property`, listedPropertyList.length === 0, listedPropertyList.join(', '));
		ok(`${domainName} (${effectiveViewMode}): one sentence per fact, at most 4`, vocabulary.levelProseOf({ focusNode, levelRowList: rowList, filterText: '', filterUnmatchedRowCount: 0, effectiveViewMode }).sentenceList.length <= 4);
	});
	done();
};
stepList.push((done) => { console.log('\n=== 2. the prose ==='); done(); });
stepList.push((done) => proseCheckOf({ domainStableId: C200012, domainName: 'Accessibility Feature', expectedCountByName: { meaningCount: 36, incomingMeaningCount: 3 } })(done));
stepList.push((done) => proseCheckOf({ domainStableId: C200159, domainName: 'Individualized Program Accessibility Feature', expectedCountByName: { meaningCount: 4, incomingMeaningCount: 1 } })(done));
stepList.push((done) => {
	const proseText = vocabulary.levelProseOf({ focusNode: levelByStableId[`meaningDomain:${C200012}`].node, levelRowList: rowListOf(levelByStableId[`meaningDomain:${C200012}`]), filterText: '', filterUnmatchedRowCount: 0, effectiveViewMode: 'diagram' }).sentenceList.join(' ');
	ok('Accessibility Feature reads as TQ approved it', proseText === 'This domain contributes to 36 meanings (solid hexagons). 2 meanings have elements of other standards mapped to them (marked "N elements map here"). 3 meanings in other domains name it as their range (outlined hexagons, dashed arrow). A › means the meaning holds values; open it to see them.', proseText);
	done();
});

// 3. the URI pages' visible words
stepList.push((done) => { console.log('\n=== 3. no camelCase on the URI pages ==='); done(); });
stepList.push((done) => {
	const c200159Level = levelByStableId[`meaningDomain:${C200159}`];
	const ownTermRow = rowListOf(c200159Level).find((oneRow) => oneRow.relationshipType === 'HAS_TERM_MEANING');
	const featureTypeLevel = levelByStableId.featureTypeValues;
	const valueRow = rowListOf(featureTypeLevel)[0];
	// a meaning's card stableId is its URI (the access point's rows carry no uri; the endpoint mints it): the walk id after its 'meaning:' prefix
	const meaningUriOf = (meaningItem) => (meaningItem && meaningItem.stableId.startsWith('meaning:') ? meaningItem.stableId.slice('meaning:'.length) : '');
	const pageList = [
		{ pageName: 'the C200159 element page', uriText: c200159Level.node.uri || 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:C200159' },
		{ pageName: 'the P600144 element page', uriText: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P600144' },
		{ pageName: "C200159's own term's meaning page", uriText: meaningUriOf(ownTermRow) },
		{ pageName: "P000385's meaning page (Has Accessibility Feature Type)", uriText: meaningUriOf(featureTypeLevel.node) },
		{ pageName: `a value meaning's page (${valueRow && valueRow.name})`, uriText: meaningUriOf(valueRow) },
	];
	const checkOne = (pageIndex) => {
		if (pageIndex >= pageList.length) { done(); return; }
		const onePage = pageList[pageIndex];
		if (!onePage.uriText) { ok(`${onePage.pageName}: has a URI`, false); checkOne(pageIndex + 1); return; }
		resolveUriText({ uriText: onePage.uriText, answerFormat: 'html' }, (resolved) => {
			const visibleText = resolved.bodyText ? visibleTextOf(resolved.bodyText) : '';
			const camelCaseList = Array.from(new Set(visibleText.match(CAMEL_CASE_PATTERN) || []));
			ok(`${onePage.pageName}: answers a page`, resolved.httpStatus === 200 && visibleText.length > 200, resolved.errorText || resolved.httpStatus);
			ok(`${onePage.pageName}: no camelCase in its visible text`, camelCaseList.length === 0, camelCaseList.join(', '));
			if (/meaning page/.test(onePage.pageName) && /What this meaning names/.test(visibleText)) {
				ok(`${onePage.pageName}: its parts say "CEDS id", as the explorer panel does`, /CEDS id [A-Z]+\d+/.test(visibleText) && !/cedsId/.test(visibleText));
			}
			checkOne(pageIndex + 1);
		});
	};
	checkOne(0);
});

const runStep = (stepIndex) => {
	if (stepIndex >= stepList.length) { finish(); return; }
	stepList[stepIndex](() => runStep(stepIndex + 1));
};
runStep(0);
