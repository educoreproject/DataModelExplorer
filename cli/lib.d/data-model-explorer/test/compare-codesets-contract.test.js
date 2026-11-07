#!/usr/bin/env node
'use strict';

// compare-codesets-contract.test.js — W-D-8 (campaign P1, 2026-10-06; DME half of G9, V2-C12), scoped by P7
// (WORKORDER-P7-apiAnswerFixes-110726, fix 2). The verdict and valueTierJudgmentCount describe the MATCHED OPTION SETS of
// this answer, never the whole graph: production answered Race 'judged' with every row null because the count was the
// graph's (140, all in PESC course and award sets). Three states: 'judged' (a value of the matched sets has a judgment),
// 'noValueJudgments' (the sets matched, none of their values is judged, the graph holds judgments elsewhere) and
// 'valuesNotJudgedInThisBuild' (the graph holds none). graphWideValueTierJudgmentCount carries the graph's figure, labelled.
// The rows read the SAME cards the count counts: a value card is a value-tier tuple card or a term card whose termKind is
// 'value' (every value judgment in GOLD_261030 / GOLD_261106 lands on a CEDS term card, measured 2026-11-07), so a judged
// set shows its judgments in its rows. Expectations come from the test's own Cypher, never hard-coded.
//
//   node cli/lib.d/data-model-explorer/test/compare-codesets-contract.test.js [pathToDataModelExplorerSearch.js]

const harness = require('./lib/liveGraphHarness')({ gateTitle: 'W-D-8 / P7 compareCodesets: scoped verdict, rows, totals, refusal' });
const { assert, runQuery, runVerb, finish, taskListPlus, pipeRunner } = harness;
const cliFilePath = process.argv[2];

// the test's own reading of "a value card", written here and not imported, so the verb cannot agree with itself
const ORACLE_VALUE_CARD_TEXT = "(card.referenceTier = 'value' OR (card.referenceTier = 'term' AND card.termKind = 'value'))";
const oracleCypherFor = (nameText) => `
	MATCH (:ForgedNode {role: 'DmeOptionValue'})-[gm:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(card:HubReference) WHERE ${ORACLE_VALUE_CARD_TEXT}
	WITH count(gm) AS graphWideCount
	MATCH (h:HubDefinition) WITH graphWideCount, collect(h._source) AS hubSourceList
	MATCH (os:ForgedNode {role: 'DmeOptionSet'}) WHERE toLower(os.name) CONTAINS '${nameText}' AND NOT os._source IN hubSourceList
	MATCH (os)-[:HAS_VALUE]->(v:ForgedNode {role: 'DmeOptionValue'})
	OPTIONAL MATCH (v)-[m:EXACT_MATCH|CLOSE_MATCH|BROAD_MATCH|NARROW_MATCH]->(card:HubReference) WHERE ${ORACLE_VALUE_CARD_TEXT}
	RETURN graphWideCount, count(DISTINCT os) AS matchedOptionSetCount, count(*) AS expectedRowCount, count(m) AS scopedCount,
	       collect(DISTINCT type(m)) AS matchTypeList`;
const expectedVerdictOf = ({ scopedCount, graphWideCount }) => {
	if (scopedCount > 0) return 'judged';
	return graphWideCount > 0 ? 'noValueJudgments' : 'valuesNotJudgedInThisBuild';
};

const verdictGateFor = ({ verbName, oracleName }) => (args, next) => runQuery(oracleCypherFor(oracleName), {}, (queryError, rowList) => {
	if (queryError) { next(queryError, args); return; }
	const expected = rowList[0];
	runVerb(['-compareCodesets', verbName], (err, outcome) => {
		const payload = outcome.parsedStdout || {};
		const expectedVerdict = expectedVerdictOf(expected);
		assert(`${verbName}: verdict '${expectedVerdict}', valueTierJudgmentCount ${expected.scopedCount} (the matched sets), graphWideValueTierJudgmentCount ${expected.graphWideCount}`,
			payload.verdict === expectedVerdict && payload.valueTierJudgmentCount === expected.scopedCount && payload.graphWideValueTierJudgmentCount === expected.graphWideCount,
			JSON.stringify({ verdict: payload.verdict, valueTierJudgmentCount: payload.valueTierJudgmentCount, graphWideValueTierJudgmentCount: payload.graphWideValueTierJudgmentCount }));
		assert(`  totalRowCount === ${expected.expectedRowCount} and matchedOptionSetCount === ${expected.matchedOptionSetCount}`, payload.totalRowCount === expected.expectedRowCount && payload.matchedOptionSetCount === expected.matchedOptionSetCount, JSON.stringify({ totalRowCount: payload.totalRowCount, matchedOptionSetCount: payload.matchedOptionSetCount }));
		const valueRowList = payload.valueRowList || [];
		assert('  envelope: returnedRowCount === rows, truncatedRowCount === total − returned', Array.isArray(payload.valueRowList) && payload.returnedRowCount === valueRowList.length && payload.truncatedRowCount === payload.totalRowCount - valueRowList.length);
		assert('  verdict is one of the contract\'s states', ['judged', 'noValueJudgments', 'valuesNotJudgedInThisBuild'].includes(payload.verdict), payload.verdict);
		if (expectedVerdict === 'judged') {
			const judgedRowList = valueRowList.filter((oneRow) => oneRow.matchType !== null);
			assert(`  judged: the rows show the set's judgments (${judgedRowList.length} rows carry a matchType; each names its hub, hubValue and hubValueKey)`,
				judgedRowList.length === Math.min(expected.scopedCount, valueRowList.length) && judgedRowList.every((oneRow) => expected.matchTypeList.includes(oneRow.matchType) && oneRow.hubName && oneRow.hubValue && oneRow.hubValueKey),
				JSON.stringify(valueRowList.slice(0, 2)));
			assert('  judged: no verdictText (a null on a judged set shows non-alignment)', !('verdictText' in payload), payload.verdictText);
		} else {
			assert('  not judged: every row is null, and verdictText says null means NOT JUDGED', valueRowList.every((oneRow) => oneRow.matchType === null) && /NOT JUDGED/.test(payload.verdictText || ''), payload.verdictText);
		}
		next('', { ...args, [`expected_${verbName}`]: expected, [`payload_${verbName}`]: payload });
	}, cliFilePath);
});

const taskList = new taskListPlus();
// ⟪lane R6⟫ EVERY hub's option sets are excluded, as compareCodesets excludes them
taskList.push(verdictGateFor({ verbName: 'Sex', oracleName: 'sex' }));
// P7: the production finding: Race matched sets whose values no build has judged
taskList.push(verdictGateFor({ verbName: 'Race', oracleName: 'race' }));
taskList.push((args, next) => {
	const expected = args.expected_Race;
	assert(`Race: the gate means something here (this graph holds ${expected.graphWideCount} value judgments, none in Race's ${expected.matchedOptionSetCount} sets), so the verdict is noValueJudgments`, expected.graphWideCount > 0 && expected.scopedCount === 0 && args.payload_Race.verdict === 'noValueJudgments', JSON.stringify(expected));
	next('', args);
});
// P7: a set that DOES hold value judgments (PESC 'Has Course Level Type') says judged, with its judgments in its rows
taskList.push(verdictGateFor({ verbName: 'Course Level', oracleName: 'course level' }));
taskList.push((args, next) => {
	const expected = args['expected_Course Level'];
	const payload = args['payload_Course Level'];
	const exactRowList = (payload.valueRowList || []).filter((oneRow) => oneRow.matchType === 'EXACT_MATCH' && oneRow.hubValue);
	assert(`Course Level: judged, and its ${expected.scopedCount} judged values come back as EXACT_MATCH rows with a hubValue (supervisor's gate: 19 on GOLD_261030 / GOLD_261106)`, payload.verdict === 'judged' && expected.scopedCount > 0 && exactRowList.length === expected.scopedCount, JSON.stringify({ scopedCount: expected.scopedCount, exactRowCount: exactRowList.length }));
	next('', args);
});
taskList.push((args, next) => runVerb(['-compareCodesets', 'zzznosuchcodeset'], (err, outcome) => {
	const payload = outcome.parsedStdout || {};
	assert('zzznosuchcodeset: refusedByName compareCodesets, refusalName noOptionSetMatched', outcome.status === 0 && payload.refusedByName === 'compareCodesets' && payload.refusalName === 'noOptionSetMatched', JSON.stringify(payload).slice(0, 160));
	next('', args);
}, cliFilePath));
pipeRunner(taskList.getList(), {}, (err) => finish(err));
