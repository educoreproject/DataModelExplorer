'use strict';
// edc-human-pages.test.js — the /edc human pages (WORKORDER-edcHumanPages-110926), with no server, graph or store: real answers and real graph facts captured from
// GOLD_261030_useCases into fixtures/edcHumanPages/humanPageCases.json (runs/edcHumanPages/captureFixture.js), and hostile stubs.
//   1. the json form is the body's bytes whatever facts are handed in (gate 1's hermetic half; runs/edcHumanPages/byteCompare.js is the live half)
//   2. ?format= is taken out of the path, other query parts kept verbatim; a bad, empty, encoded or doubled value is refused by name (gate 2)
//   3. every html page, human or plain, carries the JSON link and the alternate link, to its own path with format=json
//   4. each captured element and meaning renders its human page with the sections the work order lists; a refusal or another kind keeps the plain page
//   5. the page's JSON section, its tags taken off and its entities read back, is exactly JSON.stringify(body, null, 2)
//   6. a hostile label, value, URI and facts row reach the page escaped: no <script> but the copy button's (gate 4)
//   7. parent shows only for a single owner; CTDL properties are split by the forge walk's lists; domainCount is never listed; a standard with no split says unsplit
// Run: node server/test/edc-human-pages.test.js

const path = require('path');
const { answerTextFor, HUMAN_PAGE_KIND_LIST } = require('../lib/edc-resolver/htmlAnswer');
const { jsonHtmlOf } = require('../lib/edc-resolver/humanPage');
const { formatOverrideOf } = require('../lib/edc-resolver/formatOverride');
const { factsAbsentOf } = require('../lib/edc-resolver/humanPageFacts');
const { caseList } = require('./fixtures/edcHumanPages/humanPageCases.json');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount++; console.log(`  PASS: ${testName}`); return; }
	failedCount++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const BASE_IRI = 'https://w3id.org/EDUcore/';
const PUBLIC_PATH_PREFIX = '/edc/';
const ANSWER_FORMAT_LIST = ['json', 'html'];
const pageOf = ({ casePath, httpStatus, answerBody, humanPageFacts }) => answerTextFor({ answerFormat: 'html', httpStatus, answerBody, humanPageFacts, edcIri: `${BASE_IRI}${casePath.split('?')[0].slice(1)}`, requestPath: casePath, publicPathPrefix: PUBLIC_PATH_PREFIX, baseIri: BASE_IRI });
const caseFor = (casePathStart) => caseList.find((oneCase) => oneCase.casePath.startsWith(casePathStart));
const ENTITY_BY_TEXT = Object.freeze({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" });
const textOfHtml = (htmlText) => htmlText.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (entityText) => ENTITY_BY_TEXT[entityText]);
const scriptTagCountOf = (pageText) => (pageText.match(/<script/gi) || []).length;
const sectionSummaryListOf = (pageText) => Array.from(pageText.matchAll(/<summary>([^<]*)/g)).map((summaryMatch) => summaryMatch[1].trim());

console.log('\n=== edc human pages ===\n');

// 1 ---------------------------------------------------------------------------
caseList.forEach((oneCase) => {
	const jsonText = answerTextFor({ answerFormat: 'json', httpStatus: oneCase.httpStatus, answerBody: oneCase.answerBody, humanPageFacts: oneCase.humanPageFacts, requestPath: oneCase.casePath, publicPathPrefix: PUBLIC_PATH_PREFIX, baseIri: BASE_IRI });
	ok(`1. json is the body's bytes, facts or none: ${oneCase.casePath.slice(0, 60)}`, jsonText === `${JSON.stringify(oneCase.answerBody, null, 2)}\n`);
});

// 2 ---------------------------------------------------------------------------
const FORMAT_CASE_LIST = [
	{ caseName: 'no query', edcRequestPath: '/CEDS/14.0.0.0/ceds:P002040', expected: { edcRequestPath: '/CEDS/14.0.0.0/ceds:P002040' } },
	{ caseName: 'a query with no format is kept verbatim', edcRequestPath: '/x/hub/1/ab?page=2&q=a%20b', expected: { edcRequestPath: '/x/hub/1/ab?page=2&q=a%20b' } },
	{ caseName: 'format=json alone', edcRequestPath: '/a/b?format=json', expected: { edcRequestPath: '/a/b', overrideFormat: 'json' } },
	{ caseName: 'format=html among others, the rest kept in order', edcRequestPath: '/a/b?page=2&format=html&q=x%26y', expected: { edcRequestPath: '/a/b?page=2&q=x%26y', overrideFormat: 'html' } },
	{ caseName: 'a path segment named format is not the parameter', edcRequestPath: '/a/format=json', expected: { edcRequestPath: '/a/format=json' } },
	{ caseName: 'a parameter merely beginning with format is kept', edcRequestPath: '/a?formatted=1', expected: { edcRequestPath: '/a?formatted=1' } },
];
FORMAT_CASE_LIST.forEach(({ caseName, edcRequestPath, expected }) => {
	const formatOverride = formatOverrideOf({ edcRequestPath, answerFormatList: ANSWER_FORMAT_LIST });
	ok(`2. ${caseName}`, JSON.stringify(formatOverride) === JSON.stringify(expected), JSON.stringify(formatOverride));
});
const FORMAT_REFUSAL_LIST = [
	{ caseName: 'an unknown value', edcRequestPath: '/a?format=xml', refusalPattern: /format='xml' is not a form .* json, html/ },
	{ caseName: 'an empty value', edcRequestPath: '/a?format=', refusalPattern: /format='' is not a form/ },
	{ caseName: 'no value', edcRequestPath: '/a?format', refusalPattern: /format='' is not a form/ },
	{ caseName: 'an encoded value is not decoded', edcRequestPath: '/a?format=%6Ason', refusalPattern: /format='%6Ason' is not a form/ },
	{ caseName: 'the wrong case', edcRequestPath: '/a?format=JSON', refusalPattern: /format='JSON' is not a form/ },
	{ caseName: 'given twice', edcRequestPath: '/a?format=json&format=html', refusalPattern: /format is given 2 times/ },
];
FORMAT_REFUSAL_LIST.forEach(({ caseName, edcRequestPath, refusalPattern }) => {
	const formatOverride = formatOverrideOf({ edcRequestPath, answerFormatList: ANSWER_FORMAT_LIST });
	ok(`2. refused by name: ${caseName}`, refusalPattern.test(formatOverride.refusalText || '') && formatOverride.edcRequestPath === undefined, JSON.stringify(formatOverride));
});

// 3 ---------------------------------------------------------------------------
const meaningCase = caseFor('/CEDStandards/hub/14.0.0.0/ab39');
const pagedMeaningPage = pageOf({ ...meaningCase, casePath: `${meaningCase.casePath}?page=2` });
ok('3. a human page links its JSON, its query kept', pagedMeaningPage.includes(`<a href="/edc${meaningCase.casePath}?page=2&amp;format=json">JSON</a>`));
ok('3. a human page carries the alternate link', pagedMeaningPage.includes(`<link rel="alternate" type="application/json" href="/edc${meaningCase.casePath}?page=2&amp;format=json">`));
const plainPage = answerTextFor({ answerFormat: 'html', httpStatus: 200, answerBody: { kind: 'layer', layerKey: 'jev' }, edcIri: `${BASE_IRI}layer/jev`, requestPath: '/layer/jev', publicPathPrefix: PUBLIC_PATH_PREFIX, baseIri: BASE_IRI, humanPageFacts: null });
ok('3. a plain page links its JSON', plainPage.includes('<a href="/edc/layer/jev?format=json">JSON</a>'));
ok('3. a plain page carries the alternate link', plainPage.includes('<link rel="alternate" type="application/json" href="/edc/layer/jev?format=json">'));
const wholeUriPage = answerTextFor({ answerFormat: 'html', httpStatus: 200, answerBody: { kind: 'layer' }, requestPath: `${BASE_IRI}layer/jev?page=2`, publicPathPrefix: PUBLIC_PATH_PREFIX, baseIri: BASE_IRI, humanPageFacts: null });
ok('3. a request given as a whole URI (as the resolver accepts it) links its JSON by path', wholeUriPage.includes('<a href="/edc/layer/jev?page=2&amp;format=json">JSON</a>'));
let missingPathText = '';
try { answerTextFor({ answerFormat: 'html', httpStatus: 200, answerBody: { kind: 'layer' }, publicPathPrefix: PUBLIC_PATH_PREFIX, baseIri: BASE_IRI }); } catch (refusal) { missingPathText = refusal.message; }
ok('3. an html page with no request path is refused by name, never a page with no JSON link', /needs the request path/.test(missingPathText), missingPathText);

// 4 ---------------------------------------------------------------------------
const ELEMENT_SECTION_LIST = ['Used on', 'Meanings it takes part in', 'JSON'];
const MEANING_SECTION_LIST = ['Ranges', 'Elements mapped to this meaning', 'JSON'];
caseList.forEach((oneCase) => {
	const pageText = pageOf(oneCase);
	const summaryList = sectionSummaryListOf(pageText);
	const sectionList = oneCase.answerBody.kind === 'element' ? ELEMENT_SECTION_LIST : MEANING_SECTION_LIST;
	ok(`4. ${oneCase.answerBody.kind} page has its sections: ${oneCase.casePath.slice(0, 60)}`, sectionList.every((sectionName) => summaryList.includes(sectionName)), summaryList.join(' | '));
	ok(`4. it cites its own URI with a copy button: ${oneCase.casePath.slice(0, 60)}`, pageText.includes(`data-copy="${oneCase.answerBody.element || oneCase.answerBody.meaning}"`));
	ok(`4. it is in the site's chrome: ${oneCase.casePath.slice(0, 60)}`, pageText.includes('class="site-header"') && pageText.includes('educore-logo.png') && pageText.includes('class="site-footer"'));
	ok(`4. it links no EDUcore URI off this host: ${oneCase.casePath.slice(0, 60)}`, !/<a href="https:\/\/w3id\.org\/EDUcore\/[^"]*">(?!https)/.test(pageText.split('<pre class="json">')[0]));
});
const hasProxyCase = caseFor('/CTDL/Release');
const hasProxyPage = pageOf(hasProxyCase);
ok('4. CTDL Has Proxy is used on the 53 classes the graph holds, every one listed', hasProxyCase.humanPageFacts.usedOnCount === 53 && (hasProxyPage.split('Used on <span class="count">53</span>')[1] || '').split('</details>')[0].split('<li>').length - 1 === 53);
ok('4. CTDL Has Proxy shows no incompleteness note', !/incomplete|investigation/i.test(hasProxyPage));
const meaningPage = pageOf(meaningCase);
ok('4. the Military Discharge Date card shows its bracket', meaningPage.includes('[C200296 · P002040]'));
ok('4. its tuple parts link their element pages', meaningPage.includes('href="/edc/CEDS/14.0.0.0/ceds:C200296"') && meaningPage.includes('href="/edc/CEDS/14.0.0.0/ceds:P002040"'));
const valueCardPage = pageOf(caseFor('/CEDStandards/hub/14.0.0.0/0000'));
ok('4. the CEDS value card shows its four-part bracket and its option set range', valueCardPage.includes('[C200010 · P001637 · OS001637 · OV001637175776]') && valueCardPage.includes('ISO 639-3 Language Code'));
const ctdlCardPage = pageOf(caseFor('/CTDL/hub/'));
ok('4. the CTDL card says its ranges are described, not named', /describes its ranges/.test(ctdlCardPage));
const edfiPage = pageOf(caseFor('/EdFi/'));
ok('4. the Ed-Fi element lists the cards it is mapped to, each hub named', edfiPage.includes('EXACT_MATCH') && edfiPage.includes('CEDS 14.0.0.0') && edfiPage.includes('CTDL Release 20260927'));
ok('4. the Ed-Fi element shows what maps here, by layer', sectionSummaryListOf(edfiPage).includes('What maps here'));
const notFoundPage = pageOf({ ...meaningCase, httpStatus: 404, answerBody: { kind: 'meaning', error: 'no such card' } });
ok('4. a refused meaning keeps the plain page', notFoundPage.includes('HTTP 404') && !notFoundPage.includes('site-header'));
const nullFactsPage = pageOf({ ...meaningCase, humanPageFacts: null });
ok('4. an answer with no facts read (null) keeps the plain page', !nullFactsPage.includes('site-header'));
const absentFactsPage = pageOf({ ...meaningCase, humanPageFacts: factsAbsentOf('noLiveGraph') });
ok('4. facts absent by name still give the human page, saying why', absentFactsPage.includes('site-header') && absentFactsPage.includes('noLiveGraph'));
ok('4. humanPageRules names exactly element and meaning', JSON.stringify(HUMAN_PAGE_KIND_LIST) === '["element","meaning"]');

// 5 ---------------------------------------------------------------------------
caseList.forEach((oneCase) => {
	const jsonSectionHtml = jsonHtmlOf(oneCase.answerBody);
	ok(`5. the JSON section reads back as the answer's own text: ${oneCase.casePath.slice(0, 60)}`, textOfHtml(jsonSectionHtml) === JSON.stringify(oneCase.answerBody, null, 2));
});
ok('5. every URI in the JSON section is a link opening a new tab', (jsonHtmlOf(meaningCase.answerBody).match(/<a href="https:/g) || []).length === (JSON.stringify(meaningCase.answerBody).match(/"https:\/\/[^"]*"/g) || []).length && !/<a href="[^"]*">/.test(jsonHtmlOf(meaningCase.answerBody).replace(/ target="_blank" rel="noopener"/g, 'X').replace(/<a href="[^"]*"X>/g, '')));

// 6 ---------------------------------------------------------------------------
const HOSTILE_TEXT = '<script>alert("x")</script>';
const HOSTILE_URI = 'https://w3id.org/EDUcore/a"><script>alert(1)</script>';
const hostileMeaningBody = { ...meaningCase.answerBody, label: HOSTILE_TEXT, definition: HOSTILE_TEXT, hubName: HOSTILE_TEXT, meaning: HOSTILE_URI, mappedElementList: [{ element: HOSTILE_URI, name: HOSTILE_TEXT, standardName: HOSTILE_TEXT, relationType: HOSTILE_TEXT, layerVersion: HOSTILE_URI }], rangeDatatypeList: [HOSTILE_TEXT] };
const hostileMeaningFacts = { tuple: { domain: { kind: HOSTILE_TEXT, nativeId: { [HOSTILE_TEXT]: HOSTILE_TEXT }, label: HOSTILE_TEXT, uri: HOSTILE_URI } }, tupleBracketText: HOSTILE_TEXT, rangeIsIdentity: false };
const elementCase = caseFor('/CEDS/14.0.0.0/ceds:P002040');
const hostileElementBody = { ...elementCase.answerBody, definitionText: HOSTILE_TEXT, parent: HOSTILE_URI, interpretationList: [{ layerKey: HOSTILE_TEXT, versionTag: HOSTILE_TEXT, registrationStatus: HOSTILE_TEXT, pinned: HOSTILE_URI, floating: HOSTILE_URI }], node: { ...elementCase.answerBody.node, stableId: HOSTILE_TEXT, labels: [HOSTILE_TEXT], properties: { name: [HOSTILE_TEXT], [HOSTILE_TEXT]: [HOSTILE_TEXT, HOSTILE_URI], uri: [HOSTILE_URI] } } };
const hostileElementFacts = { usedOnList: [{ label: HOSTILE_TEXT, uri: HOSTILE_URI }], usedOnCount: 1, meaningAsPartList: [{ uri: HOSTILE_URI, hubName: HOSTILE_TEXT, label: HOSTILE_TEXT, referenceTier: HOSTILE_TEXT, tupleBracketText: HOSTILE_TEXT, slotName: HOSTILE_TEXT }], meaningAsPartCount: 1, meaningMappedList: [{ uri: HOSTILE_URI, label: HOSTILE_TEXT, tupleBracketText: HOSTILE_TEXT, relationType: HOSTILE_TEXT, matchBasis: HOSTILE_TEXT, mappingConfidence: HOSTILE_TEXT }], meaningMappedCount: 1 };
const hostilePageList = [
	{ pageName: 'meaning', pageText: pageOf({ casePath: `${meaningCase.casePath}?q=<script>`, httpStatus: 200, answerBody: hostileMeaningBody, humanPageFacts: hostileMeaningFacts }) },
	{ pageName: 'element', pageText: pageOf({ casePath: elementCase.casePath, httpStatus: 200, answerBody: hostileElementBody, humanPageFacts: hostileElementFacts }) },
	{ pageName: 'plain', pageText: answerTextFor({ answerFormat: 'html', httpStatus: 451, answerBody: { kind: HOSTILE_TEXT, error: HOSTILE_TEXT, link: HOSTILE_URI }, edcIri: HOSTILE_URI, requestPath: '/a<script>', publicPathPrefix: PUBLIC_PATH_PREFIX, baseIri: BASE_IRI, humanPageFacts: null }) },
];
hostilePageList.forEach(({ pageName, pageText }) => {
	const allowedScriptCount = pageName === 'plain' ? 0 : 1;
	ok(`6. hostile ${pageName} page: no <script> but the copy button's`, scriptTagCountOf(pageText) === allowedScriptCount, `${scriptTagCountOf(pageText)} script tags`);
	ok(`6. hostile ${pageName} page: the hostile text is shown, escaped`, pageText.includes('&lt;script&gt;alert('));
	ok(`6. hostile ${pageName} page: no attribute broken open`, !/"><script/.test(pageText));
});

// 7 ---------------------------------------------------------------------------
const cedsElementPage = pageOf(elementCase);
ok('7. CEDS P002040, held by its one class, shows that class as parent, by name', /<dt>Parent<\/dt><dd><a href="\/edc\/CEDS\/14.0.0.0\/ceds:C200296">Person Military<\/a>/.test(cedsElementPage));
ok('7. CTDL Has Proxy, held by 53 classes, shows no parent', !hasProxyPage.includes('<dt>Parent</dt>'));
ok('7. CTDL is split: From the standard and Added by EDUcore', sectionSummaryListOf(hasProxyPage).includes('From the standard') && sectionSummaryListOf(hasProxyPage).includes('Added by EDUcore'));
const addedSectionHtml = (hasProxyPage.split('<summary>Added by EDUcore')[1] || '').split('</details>')[0];
const sourceSectionHtml = (hasProxyPage.split('<summary>From the standard')[1] || '').split('</details>')[0];
ok('7. CTDL status and changeHistoryUrl are the standard\'s; path and searchText are EDUcore\'s', sourceSectionHtml.includes('<dt>status</dt>') && sourceSectionHtml.includes('<dt>changeHistoryUrl</dt>') && addedSectionHtml.includes('<dt>path</dt>') && addedSectionHtml.includes('<dt>searchText</dt>'));
ok('7. domainCount is never listed', !hasProxyPage.split('<pre class="json">')[0].includes('domainCount'));
ok('7. CTDL Has Proxy shows its purl IRI and status', hasProxyPage.includes('https://purl.org/ctdl/terms/hasProxy') && hasProxyPage.includes('<dt>Standard&#39;s status</dt><dd>unstable</dd>'));
ok('7. Ed-Fi, with no split derived, says unsplit by name', sectionSummaryListOf(edfiPage).includes('Properties (unsplit)') && edfiPage.includes('not recorded for EdFi'));

console.log(`\n=== Results: ${passedCount} passed, ${failedCount} failed ===\n`);
process.exit(failedCount ? 1 : 0);
