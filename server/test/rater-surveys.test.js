#!/usr/bin/env node
'use strict';

// rater-surveys.test.js — revision 5 gates for the admin screen's Surveys section (WORKORDER-RATER5).
//   S5.1 the summary, pure (rater-surveys.js) on a hand-made fixture: counts by standard, the assigned list with
//        progress, coverage colours at the named thresholds, the next survey to fill (and its tie rule), the next free
//        rater-NN, and the items list (order, fields, an unknown survey refused)
//   S5.2 through the real server (harness, scratch store, the named gold): raters on A (three: one finished, one in
//        progress, one with no answers), on B (two) and on C (none): the surveys payload, the View items payload (exactly
//        the survey's targets, in order, none of the forbidden fields), Assign a person (add with the survey preset),
//        a move of a rater without answers, and a move of a rater with saved answers refused by name
//   S5.3 access: a rater token and an anonymous call are refused on every new action
//
//   /usr/local/bin/node server/test/rater-surveys.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootRaterServer, httpPost } = require('./lib/raterServerHarness');
const { buildSurveySummary, surveyItemListOf, coverageColourOf, nextRaterUserNameOf, SURVEY_COVERAGE_AMBER_MINIMUM_RATER_COUNT, SURVEY_COVERAGE_GREEN_MINIMUM_RATER_COUNT, SURVEY_ITEM_FIELD_LIST } = require('../data-model/lib/rater-tool/rater-surveys');

const CODE_PATH = path.join(__dirname, '..', '..');
const FROZEN_INPUT_DIR_PATH = path.join(CODE_PATH, 'cli', 'lib.d', 'rater-tool', 'frozenInputs');
const configFileProcessor = require(require.resolve('qtools-config-file-processor', { paths: [path.join(__dirname, '..')] }));
const realRaterToolConfig = configFileProcessor.getConfig('raterTool.ini', path.join(CODE_PATH, '..', 'configs', 'instanceSpecific', 'qbook') + '/', { resolve: true }).raterTool;

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

// the forbidden content of a View items payload: candidates, the gold, mapping and machine fields
const ITEM_FORBIDDEN_TEXT_LIST = Object.freeze(['cardList', 'cedsTupleId', 'isMappedInGold', 'memberStableIdList', 'memberPathList', 'goldTupleIdList', 'goldInjectedTupleIdList', 'foundByMethod', 'splitHalf', '"kind"', '"suggested', '"score', '"rank']);

// ---------------------------------------------------------------- S5.1 pure fixture
console.log('S5.1 the summary on a fixture (pure)');
const fixtureElementOf = (elementStableId, standard, surveyName) => ({ elementStableId, standard, surveyName, ownerName: `Owner${elementStableId}`, name: `Name${elementStableId}`, definition: `Definition of ${elementStableId}`, definitionAbsentReason: null, isMappedInGold: true, kind: 'code', splitHalf: 'dev', memberStableIdList: ['m'] });
const fixtureElementListBySurvey = {
	A: [fixtureElementOf('E1', 'Ed-Fi', 'A'), fixtureElementOf('E2', 'SIF', 'A'), fixtureElementOf('E3', 'SIF', 'A')],
	B: [fixtureElementOf('E4', 'PESC', 'B'), fixtureElementOf('E5', 'Ed-Fi', 'B')],
	C: [fixtureElementOf('E6', 'Ed-Fi', 'C')],
};
const fixtureRaterList = [
	{ raterUserName: 'rater-03', surveyName: 'A', display: { whoText: 'Finished Person' }, finishedAt: '2026-10-15T10:00:00.000Z' },
	{ raterUserName: 'rater-11', surveyName: 'A', display: { whoText: 'In Progress Person' }, finishedAt: null },
	{ raterUserName: 'tqtest', surveyName: 'A', display: { whoText: '' }, finishedAt: null },
	{ raterUserName: 'rb1', surveyName: 'B', display: {}, finishedAt: null },
	{ raterUserName: 'rb2', surveyName: 'B', display: { whoText: 'Second B' }, finishedAt: null },
];
const answerOf = (raterUserName, elementStableId) => ({ raterUserName, elementStableId, answer: { answerKind: 'noMatch' } });
// rater-11 has one answer kept from survey C (a forced move): it counts for the move rule, not for progress on A
const fixtureAnswerList = [answerOf('rater-03', 'E1'), answerOf('rater-03', 'E2'), answerOf('rater-03', 'E3'), answerOf('rater-11', 'E2'), answerOf('rater-11', 'E6')];
const moveRefusalOf = ({ rater, answerCount }) => (answerCount > 0 ? { refusalName: 'surveyChangeWithAnswers', refusalText: `${rater.raterUserName} has ${answerCount}` } : null);
const fixtureSummary = buildSurveySummary({ surveyNameList: ['A', 'B', 'C'], elementListBySurvey: fixtureElementListBySurvey, raterList: fixtureRaterList, answerList: fixtureAnswerList, moveRefusalOf });
const fixtureSurveyOf = (surveyName) => fixtureSummary.surveyList.find((survey) => survey.surveyName === surveyName) || { raterList: [], itemCountByStandardList: [] };
check('one card per survey, in the sample\'s survey order', JSON.stringify(fixtureSummary.surveyList.map((survey) => survey.surveyName)) === '["A","B","C"]');
check('item counts and the split by standard, in order of first appearance', JSON.stringify(fixtureSummary.surveyList.map((survey) => [survey.itemCount, survey.itemCountByStandardList.map((entry) => `${entry.standard} ${entry.itemCount}`)])) === JSON.stringify([[3, ['Ed-Fi 1', 'SIF 2']], [2, ['PESC 1', 'Ed-Fi 1']], [1, ['Ed-Fi 1']]]), JSON.stringify(fixtureSummary.surveyList.map((survey) => survey.itemCountByStandardList)));
const fixtureA = fixtureSurveyOf('A');
check('survey A: three raters, with who-text, progress on A only, and finished', JSON.stringify(fixtureA.raterList.map((rater) => [rater.raterUserName, rater.whoText, rater.savedCount, rater.itemCount, !!rater.finishedAt])) === JSON.stringify([['rater-03', 'Finished Person', 3, 3, true], ['rater-11', 'In Progress Person', 1, 3, false], ['tqtest', '', 0, 3, false]]), JSON.stringify(fixtureA.raterList));
check('the move rule reads every answer row (rater-11: 2, one kept from C); a rater with none may move', JSON.stringify(fixtureA.raterList.map((rater) => [rater.answerCount, rater.moveRefusal ? rater.moveRefusal.refusalName : null])) === JSON.stringify([[3, 'surveyChangeWithAnswers'], [2, 'surveyChangeWithAnswers'], [0, null]]), JSON.stringify(fixtureA.raterList));
check('coverage: A (3) green, B (2) amber, C (0) red', JSON.stringify(fixtureSummary.surveyList.map((survey) => [survey.raterCount, survey.coverageColour])) === JSON.stringify([[3, 'green'], [2, 'amber'], [0, 'red']]), JSON.stringify(fixtureSummary.surveyList.map((survey) => [survey.raterCount, survey.coverageColour])));
check('the thresholds are the named constants (amber 2, green 3); 1 is red, 7 green', SURVEY_COVERAGE_AMBER_MINIMUM_RATER_COUNT === 2 && SURVEY_COVERAGE_GREEN_MINIMUM_RATER_COUNT === 3 && JSON.stringify([0, 1, 2, 3, 7].map(coverageColourOf)) === '["red","red","amber","green","green"]');
check('next survey to fill: C (fewest raters)', fixtureSummary.nextSurveyName === 'C', fixtureSummary.nextSurveyName);
const nextOf = (surveyNameList) => buildSurveySummary({ surveyNameList: ['A', 'B', 'C'], elementListBySurvey: fixtureElementListBySurvey, raterList: surveyNameList.map((surveyName, position) => ({ raterUserName: `t${position}`, surveyName, display: {} })), answerList: [], moveRefusalOf }).nextSurveyName;
check('the tie rule: none anywhere → A; A 1 → B; A 1, B 1 → C; one each → A; B 2, A 1, C 1 → A', JSON.stringify([nextOf([]), nextOf(['A']), nextOf(['A', 'B']), nextOf(['A', 'B', 'C']), nextOf(['B', 'B', 'A', 'C'])]) === '["A","B","C","A","A"]', JSON.stringify([nextOf([]), nextOf(['A']), nextOf(['A', 'B']), nextOf(['A', 'B', 'C']), nextOf(['B', 'B', 'A', 'C'])]));
check('the next free sign-in name: one past the highest rater-NN (rater-12 here); rater-01 with none', fixtureSummary.nextRaterUserName === 'rater-12' && nextRaterUserNameOf([]) === 'rater-01' && nextRaterUserNameOf([{ raterUserName: 'tqtest' }, { raterUserName: 'rater-ui-1' }]) === 'rater-01', `${fixtureSummary.nextRaterUserName} ${nextRaterUserNameOf([])}`);
const unknownSurveySummary = buildSurveySummary({ surveyNameList: ['A', 'D'], elementListBySurvey: fixtureElementListBySurvey, raterList: [], answerList: [], moveRefusalOf });
check('a survey name the sample has no elements for is refused by name, not guessed', !unknownSurveySummary.surveyList && /survey 'D'/.test(unknownSurveySummary.problemText || ''), JSON.stringify(unknownSurveySummary).slice(0, 160));
const fixtureItems = surveyItemListOf({ surveyName: 'A', elementListBySurvey: fixtureElementListBySurvey });
check('items: the survey\'s targets in its frozen order, numbered, with only the rater-visible fields', JSON.stringify((fixtureItems.itemList || []).map((item) => [item.itemNumber, item.elementStableId])) === '[[1,"E1"],[2,"E2"],[3,"E3"]]' && (fixtureItems.itemList || [{}]).every((item) => JSON.stringify(Object.keys(item).sort()) === JSON.stringify(['itemNumber', ...SURVEY_ITEM_FIELD_LIST].sort())), JSON.stringify(fixtureItems).slice(0, 200));
check('items: an unknown survey is refused by name', !surveyItemListOf({ surveyName: 'Z', elementListBySurvey: fixtureElementListBySurvey }).itemList && /no survey 'Z'/.test(surveyItemListOf({ surveyName: 'Z', elementListBySurvey: fixtureElementListBySurvey }).problemText || ''));

// ---------------------------------------------------------------- S5.2–S5.3 through the real server
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raterSurveysTest-'));
const ADMIN_PASSWORD = 'harbor lantern quietly 4471';
const RATER_SURVEY_BY_NAME = { 'sv-a1': 'A', 'sv-a2': 'A', 'sv-a3': 'A', 'sv-b1': 'B', 'sv-b2': 'B' };
const RATER_PASSWORD_BY_NAME = { 'sv-a1': 'amber meadow falcon 2210', 'sv-a2': 'cobalt river thistle 9081', 'sv-a3': 'saffron glacier pivot 5532', 'sv-b1': 'violet canyon ember 7714', 'sv-b2': 'linen harbor quartz 3307' };
const WHO_TEXT_OF = (raterUserName) => `Surveys Test ${raterUserName}`;
const raterToolConfig = { goldenContainerName: realRaterToolConfig.goldenContainerName, storeFilePath: path.join(scratchDirPath, 'rater.sqlite3'), frozenInputDirPath: FROZEN_INPUT_DIR_PATH, queryTimeoutMs: realRaterToolConfig.queryTimeoutMs, voyageApiKey: realRaterToolConfig.voyageApiKey };

const postAs = (state, routePath, requestBody, authtoken, callback) => httpPost({ baseUrl: state.baseUrl, routePath, requestBody, authtoken }, (postError, response) => callback(postError ? { statusCode: 0, bodyText: postError, bodyJson: null } : response));
// a tiny sequential runner, as in rater-results.test.js: each step is (state, next(nextState))
const runSteps = (stepList, state, finalStep) => (stepList.length === 0 ? finalStep(state) : stepList[0](state, (nextState) => runSteps(stepList.slice(1), nextState, finalStep)));
const postStep = (routePathOf, bodyOf, tokenOf, responseName) => (state, next) => postAs(state, routePathOf(state), bodyOf(state), tokenOf(state), (response) => next({ ...state, [responseName]: response }));
const adminStep = (bodyOf, responseName) => postStep(() => '/api/raterAdmin', bodyOf, (state) => state.adminToken, responseName);
const saveStep = (raterUserName, elementStableIdOf) => (state, next) => postAs(state, '/api/raterAnswerSave', { elementStableId: elementStableIdOf(state), answerKind: 'noMatch' }, state.tokenByRater[raterUserName], (response) => next({ ...state, saveCodeList: state.saveCodeList.concat([response.statusCode]) }));
const bodyOf = (response) => ((response.bodyJson || [{}])[0] || {});
const surveyOf = (summary, surveyName) => (summary.surveyList || []).find((survey) => survey.surveyName === surveyName) || { raterList: [], itemCountByStandardList: [] };

const serverStepList = [
	(state, next) => state.harness.accessPointByName['admin-create-user']({ username: 'test-admin', password: ADMIN_PASSWORD, first: 'Test', last: 'Admin', emailAdr: 'test-admin@example.org', role: 'admin' }, () => next(state)),
	(state, next) => postAs(state, '/api/login', { username: 'test-admin', password: ADMIN_PASSWORD }, null, (response) => next({ ...state, adminToken: response.authtoken })),
	...Object.keys(RATER_SURVEY_BY_NAME).map((raterUserName) => (state, next) =>
		postAs(state, '/api/raterAdmin', { adminAction: 'add', raterUserName, whoText: WHO_TEXT_OF(raterUserName), password: RATER_PASSWORD_BY_NAME[raterUserName], surveyName: RATER_SURVEY_BY_NAME[raterUserName] }, state.adminToken, () =>
			postAs(state, '/api/login', { username: raterUserName, password: RATER_PASSWORD_BY_NAME[raterUserName] }, null, (response) => next({ ...state, tokenByRater: { ...state.tokenByRater, [raterUserName]: response.authtoken } })))),
	// sv-a1 answers all 50 and finishes; sv-a2 answers three; sv-a3, sv-b1, sv-b2 answer nothing
	(state, next) => runSteps(state.harness.raterToolAccess.elementListBySurvey.A.map((element) => saveStep('sv-a1', () => element.elementStableId)), state, next),
	postStep(() => '/api/raterFinish', () => ({}), (state) => state.tokenByRater['sv-a1'], 'finishResponse'),
	(state, next) => runSteps(state.harness.raterToolAccess.elementListBySurvey.A.slice(0, 3).map((element) => saveStep('sv-a2', () => element.elementStableId)), state, next),
	(state, next) => {
		check('fixture: 53 saves accepted and sv-a1 finished', state.saveCodeList.length === 53 && state.saveCodeList.every((statusCode) => statusCode === 200) && state.finishResponse.statusCode === 200, `${state.saveCodeList.filter((statusCode) => statusCode !== 200).length} refused; finish ${state.finishResponse.statusCode}`);
		next(state);
	},
	adminStep(() => ({ adminAction: 'surveys' }), 'summaryResponse'),
	adminStep(() => ({ adminAction: 'surveyItems', surveyName: 'C' }), 'itemsResponse'),
	adminStep(() => ({ adminAction: 'surveyItems', surveyName: 'Z' }), 'badItemsResponse'),
	adminStep(() => ({ adminAction: 'surveyItems' }), 'noSurveyItemsResponse'),
	// Assign a person: the add action with the next free name and the survey preset (C, the emptiest)
	adminStep((state) => ({ adminAction: 'add', raterUserName: bodyOf(state.summaryResponse).nextRaterUserName, whoText: 'Assigned Person, Example University', emailAdr: '', surveyName: bodyOf(state.summaryResponse).nextSurveyName }), 'assignResponse'),
	adminStep(() => ({ adminAction: 'surveys' }), 'afterAssignResponse'),
	// move a rater here: sv-a3 (no answers) to C is allowed; sv-a2 (three answers) to C is refused by name
	adminStep(() => ({ adminAction: 'surveyChange', raterUserName: 'sv-a3', surveyName: 'C' }), 'moveFreeResponse'),
	adminStep(() => ({ adminAction: 'surveyChange', raterUserName: 'sv-a2', surveyName: 'C' }), 'moveRefusedResponse'),
	adminStep(() => ({ adminAction: 'surveys' }), 'afterMoveResponse'),
	// S5.3 access
	...['surveys', 'surveyItems'].reduce((soFar, adminAction) => soFar.concat([
		postStep(() => '/api/raterAdmin', () => ({ adminAction, surveyName: 'A' }), (state) => state.tokenByRater['sv-b1'], `raterCall_${adminAction}`),
		postStep(() => '/api/raterAdmin', () => ({ adminAction, surveyName: 'A' }), () => null, `anonymousCall_${adminAction}`),
	]), []),
	(state, next) => {
		const raterToolAccess = state.harness.raterToolAccess;
		console.log('S5.2 the surveys payload through the server');
		const summary = bodyOf(state.summaryResponse);
		check('surveys answers 200 with one card per survey (A, B, C)', state.summaryResponse.statusCode === 200 && JSON.stringify((summary.surveyList || []).map((survey) => survey.surveyName)) === '["A","B","C"]', `${state.summaryResponse.statusCode} ${state.summaryResponse.bodyText.slice(0, 160)}`);
		const expectedSplitOf = (surveyName) => raterToolAccess.elementListBySurvey[surveyName].reduce((soFar, element) => ({ ...soFar, [element.standard]: (soFar[element.standard] || 0) + 1 }), {});
		check('each card\'s split by standard matches the frozen sample and adds up to 50', (summary.surveyList || []).every((survey) => survey.itemCount === 50 && survey.itemCountByStandardList.reduce((soFar, entry) => soFar + entry.itemCount, 0) === 50 && JSON.stringify(survey.itemCountByStandardList.reduce((soFar, entry) => ({ ...soFar, [entry.standard]: entry.itemCount }), {})) === JSON.stringify(expectedSplitOf(survey.surveyName))), JSON.stringify((summary.surveyList || []).map((survey) => survey.itemCountByStandardList)));
		const cardA = surveyOf(summary, 'A');
		check('A lists its three raters with who-text: sv-a1 50 of 50 finished, sv-a2 3 of 50, sv-a3 0 of 50', JSON.stringify(cardA.raterList.map((rater) => [rater.raterUserName, rater.whoText, rater.savedCount, rater.itemCount, !!rater.finishedAt])) === JSON.stringify([['sv-a1', WHO_TEXT_OF('sv-a1'), 50, 50, true], ['sv-a2', WHO_TEXT_OF('sv-a2'), 3, 50, false], ['sv-a3', WHO_TEXT_OF('sv-a3'), 0, 50, false]]), JSON.stringify(cardA.raterList));
		check('B lists sv-b1 and sv-b2; C lists nobody', JSON.stringify(surveyOf(summary, 'B').raterList.map((rater) => rater.raterUserName)) === '["sv-b1","sv-b2"]' && surveyOf(summary, 'C').raterList.length === 0);
		check('coverage colours: A green (3), B amber (2), C red (0)', JSON.stringify((summary.surveyList || []).map((survey) => [survey.raterCount, survey.coverageColour])) === JSON.stringify([[3, 'green'], [2, 'amber'], [0, 'red']]), JSON.stringify((summary.surveyList || []).map((survey) => survey.coverageColour)));
		check('next survey to fill is C; the next free sign-in name is rater-01', summary.nextSurveyName === 'C' && summary.nextRaterUserName === 'rater-01', `${summary.nextSurveyName} ${summary.nextRaterUserName}`);
		check('the move picker carries the server\'s own refusal for raters with answers (sv-a1, sv-a2), none for the others', JSON.stringify([...cardA.raterList, ...surveyOf(summary, 'B').raterList].map((rater) => [rater.raterUserName, rater.moveRefusal ? rater.moveRefusal.refusalName : null])) === JSON.stringify([['sv-a1', 'surveyChangeWithAnswers'], ['sv-a2', 'surveyChangeWithAnswers'], ['sv-a3', null], ['sv-b1', null], ['sv-b2', null]]) && /sv-a2 has 3 saved answers on survey A/.test((cardA.raterList[1] || { moveRefusal: {} }).moveRefusal.refusalText || ''), JSON.stringify(cardA.raterList.map((rater) => rater.moveRefusal)));

		console.log('S5.2 the View items payload');
		const itemList = bodyOf(state.itemsResponse).itemList || [];
		check('survey C: exactly its 50 targets, in the survey\'s frozen order, numbered 1–50', state.itemsResponse.statusCode === 200 && JSON.stringify(itemList.map((item) => item.elementStableId)) === JSON.stringify(raterToolAccess.elementListBySurvey.C.map((element) => element.elementStableId)) && itemList.every((item, position) => item.itemNumber === position + 1), `${state.itemsResponse.statusCode} ${itemList.length}`);
		check('each item carries standard, owner, name and the element\'s own definition, as the sample has them', itemList.length === 50 && itemList.every((item) => { const element = raterToolAccess.elementByStableId[item.elementStableId]; return item.standard === element.standard && item.ownerName === element.ownerName && item.name === element.name && item.definition === element.definition; }));
		const forbiddenFoundList = ITEM_FORBIDDEN_TEXT_LIST.filter((forbiddenText) => state.itemsResponse.bodyText.includes(forbiddenText));
		check('no candidates, gold pick, isMappedInGold or machine field in the items payload', forbiddenFoundList.length === 0 && itemList.every((item) => JSON.stringify(Object.keys(item).sort()) === JSON.stringify(['itemNumber', ...SURVEY_ITEM_FIELD_LIST].sort())), forbiddenFoundList.join(', '));
		check('an unknown survey and a missing survey are refused by name', state.badItemsResponse.statusCode === 400 && /^surveyNameInvalid/.test(state.badItemsResponse.bodyText) && state.noSurveyItemsResponse.statusCode === 400 && /^surveyNameInvalid/.test(state.noSurveyItemsResponse.bodyText), `${state.badItemsResponse.bodyText.slice(0, 80)} | ${state.noSurveyItemsResponse.bodyText.slice(0, 80)}`);

		console.log('S5.2 Assign a person and move a rater');
		const assigned = bodyOf(state.assignResponse);
		check('Assign creates rater-01 on the preset survey C and issues a password once', state.assignResponse.statusCode === 200 && assigned.raterUserName === 'rater-01' && assigned.surveyName === 'C' && /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/.test(assigned.issuedPassword || ''), state.assignResponse.bodyText.slice(0, 160));
		const afterAssign = bodyOf(state.afterAssignResponse);
		const assignedOnC = surveyOf(afterAssign, 'C').raterList;
		check('the new rater is on C\'s card at 0 of 50, with its who-text; C is still red (1); the next name is rater-02', JSON.stringify(assignedOnC.map((rater) => [rater.raterUserName, rater.whoText, rater.savedCount, rater.itemCount])) === JSON.stringify([['rater-01', 'Assigned Person, Example University', 0, 50]]) && surveyOf(afterAssign, 'C').coverageColour === 'red' && afterAssign.nextRaterUserName === 'rater-02', JSON.stringify(assignedOnC));
		check('moving sv-a3 (no answers) to C is accepted', state.moveFreeResponse.statusCode === 200 && bodyOf(state.moveFreeResponse).surveyName === 'C', state.moveFreeResponse.bodyText.slice(0, 120));
		check('moving sv-a2 (saved answers) is refused by name: surveyChangeWithAnswers', state.moveRefusedResponse.statusCode === 400 && /^surveyChangeWithAnswers: sv-a2 has 3 saved answers/.test(state.moveRefusedResponse.bodyText), state.moveRefusedResponse.bodyText.slice(0, 120));
		const afterMove = bodyOf(state.afterMoveResponse);
		check('after the move: A 2, B 2, C 2, all amber, and the tie sends the next survey to A', JSON.stringify((afterMove.surveyList || []).map((survey) => [survey.raterCount, survey.coverageColour])) === JSON.stringify([[2, 'amber'], [2, 'amber'], [2, 'amber']]) && afterMove.nextSurveyName === 'A' && surveyOf(afterMove, 'A').raterList.some((rater) => rater.raterUserName === 'sv-a2'), JSON.stringify([(afterMove.surveyList || []).map((survey) => survey.raterCount), afterMove.nextSurveyName]));

		console.log('S5.3 access');
		['surveys', 'surveyItems'].forEach((adminAction) => {
			const raterCall = state[`raterCall_${adminAction}`];
			const anonymousCall = state[`anonymousCall_${adminAction}`];
			check(`${adminAction}: a rater token is refused`, raterCall.statusCode === 401 && !/surveyList|itemList/.test(raterCall.bodyText), `${raterCall.statusCode} ${raterCall.bodyText.slice(0, 80)}`);
			check(`${adminAction}: an anonymous call is refused`, anonymousCall.statusCode === 401 && !/surveyList|itemList/.test(anonymousCall.bodyText), `${anonymousCall.statusCode} ${anonymousCall.bodyText.slice(0, 80)}`);
		});
		next(state);
	},
];

bootRaterServer({ scratchDirPath, raterToolConfig }, (bootError, harness) => {
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
	console.log(`\n=== rater-surveys (revision 5) — Results: ${passCount} passed, ${failCount} failed ===`);
	process.exit(failCount === 0 ? 0 : 1);
};
