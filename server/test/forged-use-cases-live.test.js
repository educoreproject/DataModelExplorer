'use strict';
// forged-use-cases-live.test.js — the forged-use-cases mapper against the live gold (use-case forge Phase 5, 2026-10-30;
// PLAN-useCaseDme-103026 Phase C). The pages show what these queries return, so the gate is on the queries.
// PROVES, every number from the test's OWN Cypher:
//   (a) caseList lists every UcUseCase, each with its HAS_STEP count
//   (b) caseStepList returns a case's steps in reading order: position ascending, then codedNotation ('7' before '7a')
//   (c) caseCitationList returns every data reference the case reaches by the citation walk, each resolved one with the
//       stableId its DECLARED_CORRESPONDENCE edge reaches, and every citation carries a state from the mapper's rule table
//   (e) caseContextList puts each of the case's context edges in its page section (HAS_ACTOR count = the test's), and
//       caseImplementationGuide lists exactly the standards whose elements are match-edged to the cited elements' hub cards
//   (d) caseListByCitedStandard (the Topics page, Phase C2) names every citedStandard the references carry, each with exactly
//       the cases that reach such a reference
// RED BEFORE: with the step ORDER BY removed from the mapper (a twin), (b) fails on uc:ler-issuance.
//
// Run: node server/test/forged-use-cases-live.test.js   (needs the gold dataModelExplorerSearch.ini names to hold use cases)

const path = require('path');
const harness = require(path.join(__dirname, '..', '..', 'cli', 'lib.d', 'data-model-explorer', 'test', 'lib', 'liveGraphHarness'))({ gateTitle: 'forged-use-cases mapper: case list, steps in reading order, citations with their state' });
const { assert, runQuery, finish, taskListPlus, pipeRunner } = harness;
const mapper = require(path.join(__dirname, '..', 'data-model', 'data-mapping', 'mappers', 'forged-use-cases.js'))({ baseMappingProcess: () => ({}) });
const CASE_STABLE_ID = 'uc:ler-issuance';

const runNamedQuery = (queryName, queryParams, callback) => {
	const queryBundle = mapper.getCypher(queryName, queryParams);
	runQuery(queryBundle.cypher, queryBundle.params, callback);
};
const compareStepOrder = (leftStep, rightStep) => (leftStep.position - rightStep.position) || (leftStep.codedNotation < rightStep.codedNotation ? -1 : leftStep.codedNotation > rightStep.codedNotation ? 1 : 0);

const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(`MATCH (uc:UcUseCase) OPTIONAL MATCH (uc)-[s:HAS_STEP]->() RETURN uc.stableId AS caseStableId, count(s) AS stepCount`, {}, (err, rowList) => {
	if (err) { next(err, args); return; }
	assert('the graph holds use cases (this gate needs a use-case graph)', rowList.length > 0, JSON.stringify(rowList.length));
	next(rowList.length ? '' : 'stopped: no use cases', { ...args, expectedStepCountByCase: Object.fromEntries(rowList.map((oneRow) => [oneRow.caseStableId, oneRow.stepCount])) });
}));
taskList.push((args, next) => runNamedQuery('caseList', {}, (err, caseRowList) => {
	if (err) { next(err, args); return; }
	const disagreeingList = caseRowList.filter((oneRow) => args.expectedStepCountByCase[oneRow.caseStableId] !== oneRow.stepCount);
	assert(`(a) caseList lists all ${Object.keys(args.expectedStepCountByCase).length} cases with their step counts`, caseRowList.length === Object.keys(args.expectedStepCountByCase).length && disagreeingList.length === 0, JSON.stringify(disagreeingList));
	next('', args);
}));
taskList.push((args, next) => runNamedQuery('caseStepList', { caseStableId: CASE_STABLE_ID }, (err, stepRowList) => {
	if (err) { next(err, args); return; }
	const readingOrderText = JSON.stringify(stepRowList.slice().sort(compareStepOrder).map((oneStep) => oneStep.codedNotation));
	const returnedOrderText = JSON.stringify(stepRowList.map((oneStep) => oneStep.codedNotation));
	assert(`(b) ${CASE_STABLE_ID}: ${args.expectedStepCountByCase[CASE_STABLE_ID]} steps, returned in reading order`, stepRowList.length === args.expectedStepCountByCase[CASE_STABLE_ID] && returnedOrderText === readingOrderText, `${returnedOrderText} vs ${readingOrderText}`);
	assert('(b) every step names its actor and its action', stepRowList.every((oneStep) => oneStep.actorName && oneStep.action), JSON.stringify(stepRowList.filter((oneStep) => !oneStep.actorName || !oneStep.action)));
	next('', args);
}));
taskList.push((args, next) => runQuery(`MATCH (:UcUseCase {stableId: $caseStableId})-[:${mapper.citationWalkEdgeTypeList.join('|')}*1..3]->(ref:UcDataReference)
	WITH DISTINCT ref OPTIONAL MATCH (ref)-[:DECLARED_CORRESPONDENCE]->(cited) RETURN ref.stableId AS referenceStableId, cited.stableId AS citedStableId`, { caseStableId: CASE_STABLE_ID }, (err, expectedRowList) => {
	if (err) { next(err, args); return; }
	runNamedQuery('caseCitationList', { caseStableId: CASE_STABLE_ID }, (queryError, citationRowList) => {
		if (queryError) { next(queryError, args); return; }
		const citationList = mapper.mapCitationRecordList(citationRowList);
		const citedByReference = Object.fromEntries(expectedRowList.map((oneRow) => [oneRow.referenceStableId, oneRow.citedStableId]));
		const disagreeingList = citationList.filter((oneCitation) => citedByReference[oneCitation.referenceStableId] !== oneCitation.citedStableId);
		assert(`(c) ${CASE_STABLE_ID}: all ${expectedRowList.length} references, each with the element its citation reaches`, citationList.length === expectedRowList.length && disagreeingList.length === 0, JSON.stringify(disagreeingList).slice(0, 300));
		const knownStateList = mapper.citationStateRuleList.map((oneRule) => oneRule.citationState).filter((stateName) => stateName !== 'unclassified');
		assert('(c) every citation has a state the rule table names (none unclassified); resolved = has a cited element', citationList.every((oneCitation) => knownStateList.indexOf(oneCitation.citationState) !== -1 && ((oneCitation.citationState === 'resolved') === Boolean(oneCitation.citedStableId))), JSON.stringify(citationList.map((oneCitation) => oneCitation.citationState)));
		next('', args);
	});
}));
taskList.push((args, next) => runQuery(`MATCH (uc:UcUseCase)-[:${mapper.citationWalkEdgeTypeList.join('|')}*1..3]->(ref:UcDataReference) WHERE ref.citedStandard IS NOT NULL
	WITH ref.citedStandard AS citedStandard, collect(DISTINCT uc.stableId) AS caseIdList RETURN citedStandard, caseIdList`, {}, (err, expectedRowList) => {
	if (err) { next(err, args); return; }
	runNamedQuery('caseListByCitedStandard', {}, (queryError, standardRowList) => {
		if (queryError) { next(queryError, args); return; }
		const caseIdTextOf = (idList) => JSON.stringify(idList.slice().sort());
		const expectedByStandard = Object.fromEntries(expectedRowList.map((oneRow) => [oneRow.citedStandard, caseIdTextOf(oneRow.caseIdList)]));
		const disagreeingList = standardRowList.filter((oneRow) => expectedByStandard[oneRow.citedStandard] !== caseIdTextOf(oneRow.caseList.map((oneCase) => oneCase.caseStableId)));
		assert(`(d) caseListByCitedStandard: all ${expectedRowList.length} cited standards, each with exactly its citing cases`, expectedRowList.length > 0 && standardRowList.length === expectedRowList.length && disagreeingList.length === 0, JSON.stringify(disagreeingList).slice(0, 300));
		next('', args);
	});
}));
taskList.push((args, next) => runQuery(`MATCH (:UcUseCase {stableId: $caseStableId})-[actorEdge:HAS_ACTOR]->() RETURN count(actorEdge) AS actorCount`, { caseStableId: CASE_STABLE_ID }, (err, actorRowList) => {
	if (err) { next(err, args); return; }
	runNamedQuery('caseContextList', { caseStableId: CASE_STABLE_ID }, (queryError, contextRowList) => {
		if (queryError) { next(queryError, args); return; }
		const contextBySection = mapper.mapContextRecordList(contextRowList);
		assert(`(e) ${CASE_STABLE_ID}: context section 'actor' holds its ${actorRowList[0].actorCount} HAS_ACTOR edges; every section the table names is present`, contextBySection.actor.length === actorRowList[0].actorCount && mapper.caseContextSectionList.every((oneSection) => Array.isArray(contextBySection[oneSection.sectionName])), JSON.stringify(Object.keys(contextBySection)));
		next('', args);
	});
}));
taskList.push((args, next) => runQuery(`MATCH (:UcUseCase {stableId: $caseStableId})-[:${mapper.citationWalkEdgeTypeList.join('|')}*1..3]->(:UcDataReference)-[:DECLARED_CORRESPONDENCE]->(cited)
	WITH DISTINCT cited MATCH (hub:HubReference)-[slot]->(cited) WHERE type(slot) IN ['HAS_' + toUpper(hub.hubName) + '_DOMAIN', 'HAS_' + toUpper(hub.hubName) + '_PROPERTY', 'HAS_' + toUpper(hub.hubName) + '_VALUE']
	MATCH (element:ForgedNode)-[:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(hub) RETURN collect(DISTINCT element._source) AS standardList`, { caseStableId: CASE_STABLE_ID }, (err, expectedRowList) => {
	if (err) { next(err, args); return; }
	runNamedQuery('caseImplementationGuide', { caseStableId: CASE_STABLE_ID }, (queryError, guideRowList) => {
		if (queryError) { next(queryError, args); return; }
		const guide = mapper.mapImplementationGuideRecordList(guideRowList);
		const expectedText = JSON.stringify(expectedRowList[0].standardList.slice().sort());
		const actualText = JSON.stringify(guide.standardList.map((oneStandard) => oneStandard.standard).sort());
		assert(`(e) ${CASE_STABLE_ID}: the guide lists exactly the ${expectedRowList[0].standardList.length} standards mapped to its cited elements`, expectedRowList[0].standardList.length > 0 && expectedText === actualText, `${actualText} vs ${expectedText}`);
		next('', args);
	});
}));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
