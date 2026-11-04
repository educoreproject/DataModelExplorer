'use strict';
// use-case-diagram.test.js — the Overview diagram of a forged use case (render-use-case-diagram, and the forged-use-cases
// access point's caseDiagram action). Needs no graph: the renderer is pure, and the access point runs against a fake
// neo4jDb that answers each named query of the forged-use-cases mapper with the rows of useCaseDiagramFixture.
//   1. the renderer draws every step, actor and datum once, links each step to the data it reads or writes, styles
//      what is not established fact (variant steps, gaps, elements the graph does not hold) dashed, and puts the
//      case's data no step names in the footer
//   2. every text from the graph is escaped; the SVG is well formed and names itself (title, desc, role=img)
//   3. a case with no steps still draws; a case without its id is refused by name
//   4. the access point's caseDiagram answers { caseStableId, svgText, width, height, summary } from the mapper's queries,
//      including caseStepDataLinkList, and refuses an absent caseStableId by name
//
// Run: node server/test/use-case-diagram.test.js

const path = require('path');

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const { renderUseCaseDiagram } = require('../data-model/lib/use-case-diagram/render-use-case-diagram');
const fixture = require('./fixtures/useCaseDiagramFixture');

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

// a small well-formedness check: every element that opens closes, in order (no XML parser is a dependency here)
const isWellFormed = (svgText) => {
	const openTagStack = [];
	const tagPattern = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
	let tagMatch;
	while ((tagMatch = tagPattern.exec(svgText.replace(/<!--[\s\S]*?-->/g, '')))) {
		const [, isClosing, tagName, , isSelfClosing] = tagMatch;
		if (isSelfClosing) continue;
		if (!isClosing) { openTagStack.push(tagName); continue; }
		if (openTagStack.pop() !== tagName) return false;
	}
	return openTagStack.length === 0;
};
const countOf = (svgText, pattern) => (svgText.match(pattern) || []).length;

// ================================================================================
console.log('\n1. the renderer on the transcript-exchange fixture');
const diagram = renderUseCaseDiagram(fixture);
const { svgText, summary } = diagram;
ok('every step is drawn, numbered by its coded notation', fixture.stepList.every((oneStep) => svgText.includes(`${oneStep.codedNotation} · `)));
ok('every actor is drawn once, the primary marked', summary.actorCount === 4 && countOf(svgText, />primary actor</g) === 1);
ok('each datum a step reaches is one box (11), the step\'s non-reference data included', summary.stepDataCount === 11 && svgText.includes('Manual match note'));
ok('one line per step, datum and edge type (19)', summary.linkCount === 19);
ok('writes are drawn in the writes colour, one per PRODUCES link', countOf(svgText, /stroke="#D85A30"[^>]*marker-end="url\(#m-write\)"/g) === fixture.stepDataLinkList.filter((oneRow) => oneRow.dataEdgeType === 'PRODUCES').length);
ok('data reached through a part is dashed (3 lines from step 3)', countOf(svgText, /<line [^>]*stroke-dasharray="5 4" marker-end="url\(#m-write\)"/g) === 3);
ok('CEDS elements are green and name their identifier', svgText.includes('CEDS P001572') && countOf(svgText, /fill="#E1F5EE"/g) === 6 + 1);
ok('another standard\'s element is drawn apart from CEDS', svgText.includes('PESC AcademicRecord') && countOf(svgText, /fill="#E6F1FB"/g) === 1 + 1);
ok('a confirmed gap is dashed and says so', svgText.includes('PESC · standards gap'));
ok('an element the graph does not hold says so', svgText.includes('CEDS P009999 · not in the graph'));
ok('extension and exception steps are dashed and named', countOf(svgText, /stroke="#B4B2A9" stroke-width="1" stroke-dasharray="4 3"/g) === 2 && svgText.includes('extension · ') && svgText.includes('exception · '));
ok('data the case requires as a whole is in the footer', summary.caseOnlyDataCount === 1 && svgText.includes('FERPA directory information') && svgText.includes('Data the case requires as a whole'));
ok('the header carries the case, its guarantees, its stakeholders and the case it invokes', ['Send a transcript to another institution', 'Success:', 'Minimal guarantee:', 'Receiving institution', 'related case (INVOKES)', 'value driver (ALIGNS_WITH)'].every((oneText) => svgText.includes(oneText)));
ok('the legend is drawn', svgText.includes('CEDS element') && svgText.includes('through a part'));
ok('the summary counts resolved data and gaps', summary.resolvedDataCount === 7 && summary.gapDataCount === 1 && /^6 steps performed by 4 actors/.test(summary.summaryText));

console.log('\n2. safe and well formed');
ok('a name carrying markup is escaped', svgText.includes('No student match &lt;manual&gt;') && !svgText.includes('<manual>'));
ok('the SVG is well formed', isWellFormed(svgText));
ok('it names itself: role=img, title and desc', /^<svg [^>]*role="img"[^>]*aria-labelledby="uc-diagram-title uc-diagram-desc"/.test(svgText) && svgText.includes('<title id="uc-diagram-title">Use case: Send a transcript to another institution</title>') && svgText.includes('<desc id="uc-diagram-desc">Generated from the EDUcore graph.'));
ok('nothing is drawn past the canvas width', [...svgText.matchAll(/ x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].every((rectMatch) => Number(rectMatch[1]) + Number(rectMatch[2]) <= diagram.width));

console.log('\n3. edges');
const emptyDiagram = renderUseCaseDiagram({ useCase: fixture.useCase });
ok('a case with no steps still draws, and says so', isWellFormed(emptyDiagram.svgText) && emptyDiagram.svgText.includes('The graph holds no steps for this case.') && emptyDiagram.summary.stepCount === 0);
let refusalText = '';
try { renderUseCaseDiagram({ useCase: {} }); } catch (error) { refusalText = error.message; }
ok('a case without its id is refused by name', /caseStableId/.test(refusalText), refusalText);

// ================================================================================
console.log('\n4. the access point\'s caseDiagram action');
const mapper = require('../data-model/data-mapping/mappers/forged-use-cases')({});
// the fake graph answers each named query by the text only it carries
const rowListByQueryMarker = [
	['CALL db.labels()', () => mapper.requiredLabelList.map((label) => ({ label }))],
	['useCase.formatVersion', () => [fixture.useCase]],
	['partWalk', () => fixture.stepDataLinkList],
	['story.intention', () => fixture.stepList.map((oneStep) => ({ ...oneStep, dataList: [] }))],
	['citation.sourcePredicate', () => fixture.citationList.map(({ citationState, citationStateLabel, ...rawRow }) => ({ ...rawRow, citedStableId: citationState === 'resolved' ? `cited:${rawRow.referenceStableId}` : null, referenceKind: rawRow.referenceKind || null, resolutionAnchor: rawRow.resolutionAnchor || null }))],
	['contextEdgeTypeList', () => Object.entries({ HAS_PRIMARY_ACTOR: 'primaryActor', HAS_INTERESTED_PARTY: 'interestedParty', ALIGNS_WITH: 'valueDriver', HAS_SUBJECT: 'subject', TRIGGERED_BY: 'trigger', ASSUMES: 'precondition', GUARANTEES: 'guarantee', INVOKES: 'relatedCase' }).flatMap(([edgeType, sectionName]) => (fixture.contextBySection[sectionName] || []).filter((oneRow) => sectionName !== 'relatedCase' || oneRow.edgeType === edgeType).map((oneRow) => ({ ...oneRow, edgeType })))],
	['HubReference', () => []],
];
const askedQueryList = [];
const fakeNeo4jDb = {
	runQuery: (cypherText, queryParams, callback) => {
		const answer = rowListByQueryMarker.find(([queryMarker]) => cypherText.includes(queryMarker));
		askedQueryList.push(answer ? answer[0] : cypherText.slice(0, 60));
		setImmediate(() => (answer ? callback('', answer[1]()) : callback(`fake graph: no rows for ${cypherText.slice(0, 80)}`)));
	},
};
const accessPointByName = {};
require(path.join(__dirname, '../data-model/access-points-dot-d/accessPoints.d/forged-use-cases.js'))({
	dotD: { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } },
	passThroughParameters: { neo4jDb: fakeNeo4jDb, dataMapping: { 'forged-use-cases': mapper }, accessPointsDotD: {} },
});
const forgedUseCases = accessPointByName['forged-use-cases'];

forgedUseCases({ action: 'caseDiagram', caseStableId: fixture.useCase.caseStableId }, (diagramError, diagramResult) => {
	ok('caseDiagram answers', !diagramError, diagramError);
	ok('it answers the case id, the SVG, its size and its summary', diagramResult && diagramResult.caseStableId === fixture.useCase.caseStableId && /^<svg /.test(diagramResult.svgText) && diagramResult.width === 1100 && diagramResult.height > 600 && diagramResult.summary);
	ok('it read the steps\' data links (caseStepDataLinkList)', askedQueryList.includes('partWalk'));
	ok('the citation states came through the mapper (CEDS green, a gap, one not in the graph)', diagramResult && diagramResult.svgText.includes('CEDS P001572') && diagramResult.svgText.includes('standards gap') && diagramResult.svgText.includes('not in the graph'));
	ok('the drawing matches the renderer\'s on the same rows', diagramResult && diagramResult.summary.linkCount === summary.linkCount && diagramResult.summary.stepDataCount === summary.stepDataCount);

	forgedUseCases({ action: 'caseDiagram' }, (refusalError) => {
		ok('an absent caseStableId is refused by name', /caseStableId/.test(String(refusalError)), String(refusalError));
		console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
		process.exit(failed ? 1 : 0);
	});
});
