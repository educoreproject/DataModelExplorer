#!/usr/bin/env node
'use strict';

// rater-results.test.js — revision 4 gates for the admin Results page (WORKORDER-RATER4).
//   R4.1 aggregation, pure (rater-results.js) on a hand-made fixture: exact rows, counts, answered of assigned, order and
//        CSV bytes; a moved rater's kept answer is not counted; an unreadable answer is refused by name, never dropped
//   R4.2 aggregation through the real server (harness, scratch store, the named gold): four raters on survey A — split
//        Best, No match, Unsure, a Same-only card, a rater-added card, a rater who answered nothing, one finished and
//        one in-progress rater (both count), an answer edited three times (only the current one counts)
//   R4.3 access: a rater token and an anonymous call are refused
//   R4.4 forbidden content: no rater name, who-text, note, history, foundBy, gold or mapping field in the payload or CSV
// Revision 13 (WORKORDER-RATER13): agreement by property as well as by card, admin only
//   R13.1 pure fixture: same card (agrees at both levels); same property in a different class (card no, property yes);
//         different property, and same property with other qualifiers (neither); No match with No match (both); a
//         card with no CEDS property id is refused by name; the R4.1 figures above are unchanged
//   R13.2 through the server: every target's property figures are at least its card figures; the summary CSV carries
//         both columns; a rater's item payload has exactly the card fields it had before
//
//   /usr/local/bin/node server/test/rater-results.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootRaterServer, httpPost } = require('./lib/raterServerHarness');
const { buildRaterResults, resultsCsvTextOf } = require('../data-model/lib/rater-tool/rater-results');

const CODE_PATH = path.join(__dirname, '..', '..');
const FROZEN_INPUT_DIR_PATH = path.join(CODE_PATH, 'cli', 'lib.d', 'rater-tool', 'frozenInputs');
const configFileProcessor = require(require.resolve('qtools-config-file-processor', { paths: [path.join(__dirname, '..')] }));
const realRaterToolConfig = configFileProcessor.getConfig('raterTool.ini', path.join(CODE_PATH, '..', 'configs', 'instanceSpecific', 'qbook') + '/', { resolve: true }).raterTool;
// ⟪lane zbE, E4⟫ the rater reads the DME's gold (the golden pointer; GOLDEN_CONTAINER overrides), not a gold of its own
const DME_GOLDEN_CONTAINER_NAME = require('./lib/goldenContainerName').readGoldenContainerName();

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

// ---------------------------------------------------------------- R4.1 pure fixture
console.log('R4.1 aggregation on a fixture (pure)');
const fixtureCardOf = (cedsTupleId, className, propertyName, qualifierNameList, cedsId) => ({ cedsTupleId, cedsTupleIdList: [cedsTupleId], className, propertyName, qualifierNameList, cedsId });
const fixtureElementList = [
	{ elementStableId: 'E1', standard: 'SIF', surveyName: 'A', ownerName: 'StaffPersonal', name: 'BargainingUnit' },
	{ elementStableId: 'E2', standard: 'Ed-Fi', surveyName: 'A', ownerName: 'Student', name: 'BirthDate' },
	{ elementStableId: 'E3', standard: 'PESC', surveyName: 'B', ownerName: '', name: 'Lonely' },
];
const fixtureSuggestedDocument = {
	suggestedByElementStableId: {
		E1: { cardList: [fixtureCardOf('t1', 'Employment', 'Union Membership Name', [], 'P1001'), fixtureCardOf('t2', 'Staff Evaluation', 'Score, "or" Rating', [], 'P1002'), fixtureCardOf('t3', 'Person Identification', 'Person Identifier', ['Staff Member Identifier'], 'P1003')] },
		E2: { cardList: [fixtureCardOf('t4', 'Person', 'Birthdate', [], 'P1004')] },
		E3: { cardList: [] },
	},
};
const fixtureRaterList = [{ raterUserName: 'ra', surveyName: 'A' }, { raterUserName: 'rb', surveyName: 'A' }, { raterUserName: 'rc', surveyName: 'A' }, { raterUserName: 'moved', surveyName: 'B' }];
const cardsAnswer = (bestCedsTupleId, sameCedsTupleIdList, addedCardList) => ({ answerKind: 'cards', bestCedsTupleId, sameCedsTupleIdList, addedCardList: addedCardList || [], note: 'a private note' });
const fixtureAnswerList = [
	{ raterUserName: 'ra', elementStableId: 'E1', answer: cardsAnswer('t1', ['t2']) },
	{ raterUserName: 'rb', elementStableId: 'E1', answer: cardsAnswer('t1', ['t2']) },
	{ raterUserName: 'rc', elementStableId: 'E1', answer: { answerKind: 'noMatch', bestCedsTupleId: null, sameCedsTupleIdList: [], addedCardList: [], note: '' } },
	{ raterUserName: 'moved', elementStableId: 'E1', answer: cardsAnswer('t3', []) },
	{ raterUserName: 'ra', elementStableId: 'E2', answer: cardsAnswer('x9', [], [{ cedsTupleId: 'x9', className: 'Person', propertyName: 'Birth Place', qualifierNameList: [], cedsId: 'P1009', foundBy: 'search' }]) },
	{ raterUserName: 'rb', elementStableId: 'E2', answer: { answerKind: 'unsure', bestCedsTupleId: null, sameCedsTupleIdList: [], addedCardList: [], note: 'not sure' } },
];
const fixtureResults = buildRaterResults({ elementList: fixtureElementList, suggestedDocument: fixtureSuggestedDocument, raterList: fixtureRaterList, answerList: fixtureAnswerList });
const fixtureTargetByStableId = (fixtureResults.targetList || []).reduce((soFar, target) => ({ ...soFar, [target.targetStableId]: target }), {});
const e1 = fixtureTargetByStableId.E1 || { rowList: [] };
check('E1: answered 3 of 3 (the moved rater is not assigned to survey A and is not counted)', e1.answeredCount === 3 && e1.assignedCount === 3, JSON.stringify(e1));
check('E1 rows in order: t1 Best 2 Same 0; No match Best 1 Same –; t2 Best 0 Same 2 (Same-only card); t3 absent', JSON.stringify(e1.rowList.map((row) => [row.rowKind, row.cedsTupleId, row.bestCount, row.sameCount])) === JSON.stringify([['card', 't1', 2, 0], ['noMatch', null, 1, null], ['card', 't2', 0, 2]]), JSON.stringify(e1.rowList));
const e2 = fixtureTargetByStableId.E2 || { rowList: [] };
check('E2: the rater-added card is marked added, titled as the raters saw it; Unsure is its own row', e2.answeredCount === 2 && JSON.stringify(e2.rowList.map((row) => [row.candidateTitle, row.isAdded, row.bestCount, row.sameCount])) === JSON.stringify([['Person → Birth Place', true, 1, 0], ['Unsure', false, 1, null]]), JSON.stringify(e2.rowList));
const e3 = fixtureTargetByStableId.E3 || { rowList: [] };
check('E3 (survey B, only the moved rater): listed with no rows, 0 of 1', e3.answeredCount === 0 && e3.assignedCount === 1 && e3.rowList.length === 0, JSON.stringify(e3));
check('default order: the disagreement (E2: two distinct Best answers; E1 also two) first by label, then the rest', JSON.stringify(fixtureResults.targetList.map((target) => target.targetStableId)) === JSON.stringify(['E2', 'E1', 'E3']), JSON.stringify(fixtureResults.targetList.map((target) => [target.targetLabel, target.distinctBestCount])));
const expectedCsvText = [
	'standard,survey,targetStableId,targetName,answered,assigned,candidateTupleId,candidateTitle,added,best,same,sameCard,sameProperty',
	'Ed-Fi,A,E2,Student/BirthDate,2,3,x9,Person → Birth Place,added,1,0,1,1',
	'Ed-Fi,A,E2,Student/BirthDate,2,3,,Unsure,,1,,1,1',
	'SIF,A,E1,StaffPersonal/BargainingUnit,3,3,t1,Employment → Union Membership Name,,2,0,2,2',
	'SIF,A,E1,StaffPersonal/BargainingUnit,3,3,,No match in CEDS,,1,,2,2',
	'SIF,A,E1,StaffPersonal/BargainingUnit,3,3,t2,"Staff Evaluation → Score, ""or"" Rating",,0,2,2,2',
	'PESC,B,E3,Lonely,0,1,,,,,,,',
	'',
].join('\n');
const fixtureCsvText = fixtureResults.targetList ? resultsCsvTextOf(fixtureResults.targetList) : '';
check('the summary CSV, byte for byte', fixtureCsvText === expectedCsvText, JSON.stringify(fixtureCsvText));
check('no note, rater name or foundBy anywhere in the fixture result or CSV', !/private note|not sure|"ra"|"rb"|moved|foundBy|search/.test(JSON.stringify(fixtureResults) + fixtureCsvText));
const unreadable = buildRaterResults({ elementList: fixtureElementList, suggestedDocument: fixtureSuggestedDocument, raterList: fixtureRaterList, answerList: [{ raterUserName: 'ra', elementStableId: 'E1', answer: cardsAnswer('nowhere', []) }] });
const noSuggestedEntry = buildRaterResults({ elementList: fixtureElementList.concat([{ elementStableId: 'E4', standard: 'SIF', surveyName: 'A', ownerName: 'X', name: 'Y' }]), suggestedDocument: fixtureSuggestedDocument, raterList: fixtureRaterList, answerList: [] });
check('a target with no suggested list in suggested.json is refused by name (its cards would all read as added)', !noSuggestedEntry.targetList && /E4/.test(noSuggestedEntry.problemText || ''), JSON.stringify(noSuggestedEntry).slice(0, 160));
check('an answer naming a card that is neither suggested nor added is refused by name, not dropped', !unreadable.targetList && /cannot be counted/.test(unreadable.problemText || ''), JSON.stringify(unreadable).slice(0, 200));

// ---------------------------------------------------------------- R13.1 property-level agreement, pure fixture
console.log('R13.1 agreement by card and by property (pure)');
const propertyElementList = ['F1', 'F2', 'F3', 'F4'].map((elementStableId) => ({ elementStableId, standard: 'SIF', surveyName: 'A', ownerName: 'Owner', name: elementStableId }));
// P2001 in two classes, and again with a qualifier; P2002 a different property
const propertyCardList = [fixtureCardOf('k1', 'Course Section', 'Number of Credits Earned', [], 'P2001'), fixtureCardOf('k2', 'Student Course Section', 'Number of Credits Earned', [], 'P2001'), fixtureCardOf('k3', 'Course Section', 'Number of Credits Earned', ['Transfer'], 'P2001'), fixtureCardOf('k4', 'Course Section', 'Credit Value', [], 'P2002')];
const propertySuggestedDocument = { suggestedByElementStableId: propertyElementList.reduce((soFar, element) => ({ ...soFar, [element.elementStableId]: { cardList: propertyCardList } }), {}) };
const noMatchAnswer = { answerKind: 'noMatch', bestCedsTupleId: null, sameCedsTupleIdList: [], addedCardList: [], note: '' };
const propertyAnswerList = [
	// F1 same card: both k1
	{ raterUserName: 'ra', elementStableId: 'F1', answer: cardsAnswer('k1', []) },
	{ raterUserName: 'rb', elementStableId: 'F1', answer: cardsAnswer('k1', ['k4']) },
	// F2 same property, different class: k1 and k2
	{ raterUserName: 'ra', elementStableId: 'F2', answer: cardsAnswer('k1', []) },
	{ raterUserName: 'rb', elementStableId: 'F2', answer: cardsAnswer('k2', []) },
	// F3 different property (k1, k4) and the same property with another qualifier (k3): neither level agrees
	{ raterUserName: 'ra', elementStableId: 'F3', answer: cardsAnswer('k1', []) },
	{ raterUserName: 'rb', elementStableId: 'F3', answer: cardsAnswer('k4', []) },
	{ raterUserName: 'rc', elementStableId: 'F3', answer: cardsAnswer('k3', []) },
	// F4 No match with No match, and one card
	{ raterUserName: 'ra', elementStableId: 'F4', answer: noMatchAnswer },
	{ raterUserName: 'rb', elementStableId: 'F4', answer: noMatchAnswer },
	{ raterUserName: 'rc', elementStableId: 'F4', answer: cardsAnswer('k2', []) },
];
const propertyResults = buildRaterResults({ elementList: propertyElementList, suggestedDocument: propertySuggestedDocument, raterList: fixtureRaterList, answerList: propertyAnswerList });
const propertyTargetByStableId = (propertyResults.targetList || []).reduce((soFar, target) => ({ ...soFar, [target.targetStableId]: target }), {});
const agreementOf = (targetStableId) => {
	const target = propertyTargetByStableId[targetStableId] || {};
	return [target.answeredCount, target.sameCardCount, target.samePropertyCount, target.distinctBestCount, target.distinctBestPropertyCount];
};
check('F1 same card: agrees at both levels (Same card 2 of 2, Same property 2 of 2)', JSON.stringify(agreementOf('F1')) === '[2,2,2,1,1]', JSON.stringify(agreementOf('F1')));
check('F2 same property, different class: Same card 1 of 2, Same property 2 of 2', JSON.stringify(agreementOf('F2')) === '[2,1,2,2,1]', JSON.stringify(agreementOf('F2')));
check('F3 different property, and other qualifiers: Same card 1 of 3, Same property 1 of 3', JSON.stringify(agreementOf('F3')) === '[3,1,1,3,3]', JSON.stringify(agreementOf('F3')));
check('F4 No match agrees with No match at both levels: 2 of 3, 2 of 3', JSON.stringify(agreementOf('F4')) === '[3,2,2,2,2]', JSON.stringify(agreementOf('F4')));
check('the card rows are untouched by the property figures (F2: k1 Best 1, k2 Best 1)', JSON.stringify(((propertyTargetByStableId.F2 || {}).rowList || []).map((row) => [row.cedsTupleId, row.bestCount])) === '[["k1",1],["k2",1]]', JSON.stringify((propertyTargetByStableId.F2 || {}).rowList));
check('the default order is still by card agreement (F2, F3, F4 split by card first; F1 last)', JSON.stringify((propertyResults.targetList || []).map((target) => target.targetStableId)) === '["F2","F3","F4","F1"]', JSON.stringify((propertyResults.targetList || []).map((target) => target.targetStableId)));
const unansweredTarget = (fixtureResults.targetList || []).find((target) => target.targetStableId === 'E3') || {};
check('an unanswered target has no agreement figures (null), not a quiet zero', unansweredTarget.sameCardCount === null && unansweredTarget.samePropertyCount === null, JSON.stringify(unansweredTarget));
const noPropertyIdResults = buildRaterResults({ elementList: propertyElementList.slice(0, 1), suggestedDocument: { suggestedByElementStableId: { F1: { cardList: [{ ...propertyCardList[0], cedsId: null }] } } }, raterList: fixtureRaterList, answerList: propertyAnswerList.slice(0, 1) });
check('a chosen card with no CEDS property id is refused by name, never scored', !noPropertyIdResults.targetList && /no CEDS property id/.test(noPropertyIdResults.problemText || ''), JSON.stringify(noPropertyIdResults).slice(0, 200));
const propertyCsvLineList = propertyResults.targetList ? resultsCsvTextOf(propertyResults.targetList).split('\n') : [];
check('the summary CSV carries both columns (F2 lines end ,1,2)', propertyCsvLineList[0].endsWith(',best,same,sameCard,sameProperty') && propertyCsvLineList.filter((lineText) => lineText.includes(',F2,')).every((lineText) => lineText.endsWith(',1,2')) && propertyCsvLineList.filter((lineText) => lineText.includes(',F2,')).length === 2, propertyCsvLineList.slice(0, 3).join(' | '));

// ---------------------------------------------------------------- R4.2–R4.4 through the real server
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raterResultsTest-'));
const ADMIN_PASSWORD = 'harbor lantern quietly 4471';
const RATER_PASSWORD_BY_NAME = { 'res-a': 'amber meadow falcon 2210', 'res-b': 'cobalt river thistle 9081', 'res-c': 'saffron glacier pivot 5532', 'res-d': 'violet canyon ember 7714' };
const WHO_TEXT = 'Results Test Person, Example University';
const NOTE_TEXT = 'an unmistakable note 4417';
const raterToolConfig = { storeFilePath: path.join(scratchDirPath, 'rater.sqlite3'), frozenInputDirPath: FROZEN_INPUT_DIR_PATH, queryTimeoutMs: realRaterToolConfig.queryTimeoutMs, voyageApiKey: realRaterToolConfig.voyageApiKey };

const postAs = (state, routePath, requestBody, authtoken, callback) => httpPost({ baseUrl: state.baseUrl, routePath, requestBody, authtoken }, (postError, response) => callback(postError ? { statusCode: 0, bodyText: postError, bodyJson: null } : response));

// a tiny sequential runner, as in rater-tool-server.test.js: each step is (state, next(nextState))
const runSteps = (stepList, state, finalStep) => (stepList.length === 0 ? finalStep(state) : stepList[0](state, (nextState) => runSteps(stepList.slice(1), nextState, finalStep)));
// one POST whose response is kept on state under responseName (and, when given, its status pushed to saveCodeList)
const postStep = (routePathOf, bodyOf, tokenOf, responseName, isSave) => (state, next) =>
	postAs(state, routePathOf(state), bodyOf(state), tokenOf(state), (response) => next({ ...state, [responseName]: response, saveCodeList: isSave ? state.saveCodeList.concat([response.statusCode]) : state.saveCodeList }));
const saveStep = (raterUserName, bodyOf) => postStep(() => '/api/raterAnswerSave', bodyOf, (state) => state.tokenByRater[raterUserName], 'lastSaveResponse', true);

const titleOf = (card) => `${card.className} → ${card.propertyName}${card.qualifierNameList.length ? ` (${card.qualifierNameList.join(', ')})` : ''}`;

const serverStepList = [
	(state, next) => state.harness.accessPointByName['admin-create-user']({ username: 'test-admin', password: ADMIN_PASSWORD, first: 'Test', last: 'Admin', emailAdr: 'test-admin@example.org', role: 'admin' }, () => next(state)),
	(state, next) => postAs(state, '/api/login', { username: 'test-admin', password: ADMIN_PASSWORD }, null, (response) => next({ ...state, adminToken: response.authtoken })),
	...Object.keys(RATER_PASSWORD_BY_NAME).map((raterUserName) => (state, next) =>
		postAs(state, '/api/raterAdmin', { adminAction: 'add', raterUserName, whoText: WHO_TEXT, password: RATER_PASSWORD_BY_NAME[raterUserName], surveyName: 'A' }, state.adminToken, () =>
			postAs(state, '/api/login', { username: raterUserName, password: RATER_PASSWORD_BY_NAME[raterUserName] }, null, (response) => next({ ...state, tokenByRater: { ...state.tokenByRater, [raterUserName]: response.authtoken } })))),
	(state, next) => {
		const surveyElementList = state.harness.raterToolAccess.elementListBySurvey.A.slice().sort((elementA, elementB) => (elementA.elementStableId < elementB.elementStableId ? -1 : 1));
		const cardListOf = (element) => state.harness.raterToolAccess.suggestedDocument.suggestedByElementStableId[element.elementStableId].cardList.slice().sort((cardA, cardB) => (cardA.cedsTupleId < cardB.cedsTupleId ? -1 : 1));
		const [t1, t2, t3] = surveyElementList;
		const [c1, c2, c3] = cardListOf(t1);
		next({ ...state, surveyElementList, cardListOf, t1, t2, t3, c1, c2, c3 });
	},
	// t1: split Best (a: c1, b: c3), both tick c2 Same; c answers No match in its full run below
	saveStep('res-a', (state) => ({ elementStableId: state.t1.elementStableId, answerKind: 'cards', bestCedsTupleId: state.c1.cedsTupleId, sameCedsTupleIdList: [state.c2.cedsTupleId] })),
	saveStep('res-b', (state) => ({ elementStableId: state.t1.elementStableId, answerKind: 'cards', bestCedsTupleId: state.c3.cedsTupleId, sameCedsTupleIdList: [state.c2.cedsTupleId] })),
	// t2: a edits three times (No match, a card, then Unsure: only Unsure counts); b chooses a card it added by ID search
	saveStep('res-a', (state) => ({ elementStableId: state.t2.elementStableId, answerKind: 'noMatch' })),
	saveStep('res-a', (state) => ({ elementStableId: state.t2.elementStableId, answerKind: 'cards', bestCedsTupleId: state.cardListOf(state.t2)[0].cedsTupleId })),
	saveStep('res-a', (state) => ({ elementStableId: state.t2.elementStableId, answerKind: 'unsure', note: NOTE_TEXT })),
	postStep(() => '/api/raterSearch', (state) => ({ elementStableId: state.t2.elementStableId, searchMode: 'cedsId', queryText: 'P001572' }), (state) => state.tokenByRater['res-b'], 'searchResponse', false),
	(state, next) => {
		const t2TupleIdSet = new Set(state.cardListOf(state.t2).map((card) => card.cedsTupleId));
		const addedCard = ((state.searchResponse.bodyJson || [{}])[0].cardList || []).find((card) => !t2TupleIdSet.has(card.cedsTupleId));
		check('an ID search gives a card not on t2\'s list, to add', !!addedCard, state.searchResponse.bodyText.slice(0, 120));
		next({ ...state, addedCard: addedCard || { cedsTupleId: 'none' } });
	},
	saveStep('res-b', (state) => ({ elementStableId: state.t2.elementStableId, answerKind: 'cards', bestCedsTupleId: state.addedCard.cedsTupleId, addedCardList: [{ cedsTupleId: state.addedCard.cedsTupleId, foundBy: 'search' }], note: NOTE_TEXT })),
	// c: No match on all 50, then Finish (a finished rater); a and b stay in progress; d answers nothing
	(state, next) => runSteps(state.surveyElementList.map((element) => saveStep('res-c', () => ({ elementStableId: element.elementStableId, answerKind: 'noMatch', note: NOTE_TEXT }))), state, next),
	postStep(() => '/api/raterFinish', () => ({}), (state) => state.tokenByRater['res-c'], 'finishResponse', false),
	(state, next) => {
		check('fixture saves all accepted (56) and res-c finished', state.saveCodeList.length === 56 && state.saveCodeList.every((statusCode) => statusCode === 200) && state.finishResponse.statusCode === 200, `${state.saveCodeList.filter((statusCode) => statusCode !== 200).length} refused; finish ${state.finishResponse.statusCode}`);
		next(state);
	},
	postStep(() => '/api/raterAdmin', () => ({ adminAction: 'results', resultsFormat: 'json' }), (state) => state.adminToken, 'resultsResponse', false),
	postStep(() => '/api/raterAdmin', () => ({ adminAction: 'results', resultsFormat: 'csv' }), (state) => state.adminToken, 'csvResponse', false),
	postStep(() => '/api/raterAdmin', () => ({ adminAction: 'results' }), (state) => state.adminToken, 'badFormatResponse', false),
	postStep(() => '/api/raterAdmin', () => ({ adminAction: 'results', resultsFormat: 'json' }), (state) => state.tokenByRater['res-a'], 'raterResponse', false),
	postStep(() => '/api/raterAdmin', () => ({ adminAction: 'results', resultsFormat: 'json' }), () => null, 'anonymousResponse', false),
	postStep(() => '/api/raterItemGet', () => ({ itemNumber: 1 }), (state) => state.tokenByRater['res-d'], 'raterItemResponse', false),
	(state, next) => {
		const { t1, t2, t3, c1, c2, c3, addedCard, cardListOf, resultsResponse, csvResponse, badFormatResponse, raterResponse, anonymousResponse, raterItemResponse } = state;
		console.log('R4.2 aggregation through the server');
		const targetList = ((resultsResponse.bodyJson || [{}])[0] || {}).targetList || [];
		const targetOf = (element) => targetList.find((target) => target.targetStableId === element.elementStableId) || { rowList: [] };
		check('all 150 targets listed, answered or not', resultsResponse.statusCode === 200 && targetList.length === 150, `${resultsResponse.statusCode} ${targetList.length}`);
		const r1 = targetOf(t1);
		check('t1: 3 of 4 answered (res-d assigned, unanswered)', r1.answeredCount === 3 && r1.assignedCount === 4, `${r1.answeredCount} of ${r1.assignedCount}`);
		const r1Actual = r1.rowList.map((row) => [row.cedsTupleId, row.bestCount, row.sameCount]);
		const r1ExpectedList = [[c1.cedsTupleId, 1, 0], [c3.cedsTupleId, 1, 0], [null, 1, null], [c2.cedsTupleId, 0, 2]];
		check('t1 rows: c1 Best 1, c3 Best 1, No match Best 1 (Same –), c2 Same-only (Best 0, Same 2) last', r1Actual.length === 4 && r1ExpectedList.every((expectedRow) => r1Actual.some((actualRow) => JSON.stringify(actualRow) === JSON.stringify(expectedRow))) && r1Actual[3][0] === c2.cedsTupleId && r1Actual[2][0] === null, JSON.stringify(r1Actual));
		check('t1 card titles are what the raters saw (Class → Property (qualifiers))', r1.rowList.filter((row) => row.rowKind === 'card').every((row) => row.candidateTitle === titleOf([c1, c2, c3].find((card) => card.cedsTupleId === row.cedsTupleId))));
		const r2 = targetOf(t2);
		const rowOfKind = (target, rowKind) => target.rowList.find((row) => row.rowKind === rowKind) || {};
		check('t2: the edited answer counts once, as its current value (Unsure), never as the No match or card saved before', r2.answeredCount === 3 && rowOfKind(r2, 'unsure').bestCount === 1 && rowOfKind(r2, 'noMatch').bestCount === 1 && !r2.rowList.some((row) => row.cedsTupleId === cardListOf(t2)[0].cedsTupleId), JSON.stringify(r2.rowList));
		const addedRow = r2.rowList.find((row) => row.cedsTupleId === addedCard.cedsTupleId) || {};
		check('t2: the rater-added card carries the added mark; suggested cards do not', addedRow.isAdded === true && addedRow.bestCount === 1 && r1.rowList.every((row) => row.isAdded === false), JSON.stringify(addedRow));
		const r3 = targetOf(t3);
		check('t3: the finished rater counts (1 of 4, No match)', r3.answeredCount === 1 && r3.assignedCount === 4 && JSON.stringify(r3.rowList.map((row) => [row.rowKind, row.bestCount])) === '[["noMatch",1]]', JSON.stringify(r3));
		check('in-progress raters count: res-a and res-b are in t1 though neither pressed Finish', (r1.rowList.find((row) => row.cedsTupleId === c1.cedsTupleId) || {}).bestCount === 1 && (r1.rowList.find((row) => row.cedsTupleId === c3.cedsTupleId) || {}).bestCount === 1);
		const surveyBTarget = targetList.find((target) => target.surveyName === 'B') || {};
		check('a survey with no raters shows 0 of 0', surveyBTarget.answeredCount === 0 && surveyBTarget.assignedCount === 0 && (surveyBTarget.rowList || [1]).length === 0);
		const disagreementPositionList = targetList.map((target, position) => (target.distinctBestCount > 1 ? position : null)).filter((position) => position !== null);
		check('default order: the two disagreements (t1, t2) first', JSON.stringify(disagreementPositionList) === '[0,1]' && targetList.slice(0, 2).map((target) => target.targetStableId).sort().join() === [t1.elementStableId, t2.elementStableId].sort().join(), JSON.stringify(disagreementPositionList));
		const csvAnswer = (csvResponse.bodyJson || [{}])[0] || {};
		check('the summary CSV is exactly resultsCsvTextOf(the JSON targets)', csvResponse.statusCode === 200 && csvAnswer.contentType === 'text/csv' && /^cedsRaterResults-.*\.csv$/.test(csvAnswer.fileName) && csvAnswer.contentText === resultsCsvTextOf(targetList));
		check('the CSV has one line per row, plus one per unanswered target, plus the header', (csvAnswer.contentText || '').split('\n').length - 2 === targetList.reduce((soFar, target) => soFar + Math.max(1, target.rowList.length), 0));
		check('results without a resultsFormat is refused by name', badFormatResponse.statusCode === 400 && /^resultsFormatInvalid/.test(badFormatResponse.bodyText), badFormatResponse.bodyText);

		console.log('R4.3 access');
		check('a rater token is refused', raterResponse.statusCode === 401 && !/targetList/.test(raterResponse.bodyText), `${raterResponse.statusCode} ${raterResponse.bodyText.slice(0, 80)}`);
		check('an anonymous call is refused', anonymousResponse.statusCode === 401 && !/targetList/.test(anonymousResponse.bodyText), `${anonymousResponse.statusCode} ${anonymousResponse.bodyText.slice(0, 80)}`);

		console.log('R4.4 forbidden content');
		const everyText = resultsResponse.bodyText + (csvAnswer.contentText || '');
		const forbiddenFoundList = [...Object.keys(RATER_PASSWORD_BY_NAME), WHO_TEXT, NOTE_TEXT, 'test-admin', 'foundBy', 'history', 'goldTupleIdList', 'goldInjectedTupleIdList', 'isMappedInGold', 'memberStableIdList', 'splitHalf', 'raterSeed', 'search'].filter((forbiddenText) => everyText.includes(forbiddenText));
		check('no rater name, who-text, note, history, foundBy, gold, mapping or split field in the payload or the CSV', forbiddenFoundList.length === 0, forbiddenFoundList.join(', '));

		console.log('R13.2 agreement by property, through the server');
		const answeredTargetList = targetList.filter((target) => target.answeredCount > 0);
		check('every answered target: Same property >= Same card, and no more distinct Best properties than Best cards', answeredTargetList.length === 50 && answeredTargetList.every((target) => target.samePropertyCount >= target.sameCardCount && target.sameCardCount >= 1 && target.distinctBestPropertyCount <= target.distinctBestCount && target.samePropertyCount <= target.answeredCount), JSON.stringify(answeredTargetList.filter((target) => !(target.samePropertyCount >= target.sameCardCount)).slice(0, 2)));
		check('t3 (one No match): Same card 1 of 1, Same property 1 of 1; unanswered targets have none', r3.sameCardCount === 1 && r3.samePropertyCount === 1 && targetList.filter((target) => target.answeredCount === 0).every((target) => target.sameCardCount === null && target.samePropertyCount === null), JSON.stringify([r3.sameCardCount, r3.samePropertyCount]));
		const csvLineList = (csvAnswer.contentText || '').split('\n');
		check('the summary CSV header ends with both agreement columns', csvLineList[0] === 'standard,survey,targetStableId,targetName,answered,assigned,candidateTupleId,candidateTitle,added,best,same,sameCard,sameProperty', csvLineList[0]);
		const itemJson = ((raterItemResponse.bodyJson || [{}])[0]) || {};
		const itemCardKeyListText = JSON.stringify(((itemJson.cardList || [{}])[0] ? Object.keys(itemJson.cardList[0]) : []).sort());
		const RATER_CARD_KEY_LIST_BEFORE = ['cedsTupleId', 'className', 'classCedsId', 'classDefinition', 'propertyName', 'qualifierNameList', 'cedsId', 'definition', 'optionSetName', 'optionValueList', 'cedsUrl'];
		check('a rater\'s item payload: its cards carry exactly the fields they carried before revision 13', raterItemResponse.statusCode === 200 && itemCardKeyListText === JSON.stringify(RATER_CARD_KEY_LIST_BEFORE.slice().sort()), `${raterItemResponse.statusCode} ${itemCardKeyListText}`);
		check('a rater\'s item payload names no agreement figure', !/sameCard|sameProperty|distinctBest|propertyIdentity/.test(raterItemResponse.bodyText), raterItemResponse.bodyText.slice(0, 120));
		next(state);
	},
];

bootRaterServer({ goldenContainerName: DME_GOLDEN_CONTAINER_NAME, scratchDirPath, raterToolConfig }, (bootError, harness) => {
	if (bootError) {
		check('the harness boots', false, bootError);
		finish(null);
		return;
	}
	runSteps(serverStepList, { harness, baseUrl: harness.baseUrl, tokenByRater: {}, saveCodeList: [] }, () => finish(harness));
});

const finish = (harness) => {
	if (harness) {
		harness.close();
	}
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	console.log(`\n=== rater-results (revisions 4 and 13) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
};
