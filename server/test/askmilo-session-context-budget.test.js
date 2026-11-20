'use strict';
// askmilo-session-context-budget.test.js — askMilo's sessionManager.buildSessionContext with a character budget
// (second review S2-3: a rebuild was capped once, then askMilo replayed the rebuilt text, uncapped, on every later turn).
// With no budget (the askMilo CLI) the context must be exactly what it always was. Pure: writes no session.
// Run: node server/test/askmilo-session-context-budget.test.js

const sessionManager = require('../data-model/lib/ask-milo-multitool/lib/sessionManager');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const turnOf = (turnNumber, responseText) => ({ turnNumber, prompt: `question ${turnNumber}`, turnType: 'singleCall', response: responseText });
const plainSession = { sessionName: 'amber_arch', turns: [turnOf(1, 'one'), turnOf(2, 'two')] };
const expectedPlainText = '=== PRIOR RESEARCH SESSION: amber_arch ===\n\n--- Turn 1 ---\nPROMPT: question 1\n\nRESPONSE: one\n\n--- Turn 2 ---\nPROMPT: question 2\n\nRESPONSE: two\n';
check('no budget (the CLI): the context is exactly the old layout', sessionManager.buildSessionContext(plainSession) === expectedPlainText, JSON.stringify(sessionManager.buildSessionContext(plainSession)));
check('a budget larger than everything changes nothing', sessionManager.buildSessionContext(plainSession, { characterBudget: 100000 }) === expectedPlainText);

// a session a DME rebuild started: 400k-style prior context, then turns of its own
const rebuiltSession = { sessionName: 'dme_session_000000000000000000000001', priorContextText: `OLDEST ${'p'.repeat(5000)} NEWEST-PRIOR`, turns: [turnOf(1, 'r'.repeat(300)), turnOf(2, 's'.repeat(300))] };
const budgetedText = sessionManager.buildSessionContext(rebuiltSession, { characterBudget: 2000 });
check('S2-3: with a budget, the replayed context stays within it', budgetedText.length <= 2000, `${budgetedText.length}`);
check('S2-3: every turn of its own that fits is kept, newest included', budgetedText.includes('s'.repeat(300)) && budgetedText.includes('r'.repeat(300)));
check('S2-3: the prior context keeps its NEWEST end and says the rest was left out', budgetedText.includes('NEWEST-PRIOR') && !budgetedText.includes('OLDEST') && budgetedText.includes('[earlier context left out to fit]'));

const crowdedSession = { sessionName: 'dme_session_000000000000000000000002', priorContextText: 'PRIOR', turns: Array.from({ length: 12 }, (unused, turnIndex) => turnOf(turnIndex + 1, 'x'.repeat(400))) };
const crowdedText = sessionManager.buildSessionContext(crowdedSession, { characterBudget: 2500 });
check('S2-3: when even its own turns do not fit, the oldest are left out (and said so), and the prior context with them', crowdedText.length <= 2500 && crowdedText.includes('--- Turn 12 ---') && !crowdedText.includes('--- Turn 1 ---') && /\[\d+ earlier turn\(s\) left out to fit\]/.test(crowdedText) && !crowdedText.includes('PRIOR\n'), crowdedText.slice(0, 160));

// review 3 N3-2 and N3-3
check('N3-2: a session with NO turns lays out exactly as before ("===\\n", not "===\\n\\n")', sessionManager.buildSessionContext({ sessionName: 'amber_arch', turns: [] }) === '=== PRIOR RESEARCH SESSION: amber_arch ===\n' && sessionManager.buildSessionContext({ sessionName: 'amber_arch' }) === '=== PRIOR RESEARCH SESSION: amber_arch ===\n');
check('N3-3: a budget smaller than the title and note is still never exceeded', sessionManager.buildSessionContext(crowdedSession, { characterBudget: 52 }).length <= 52);

const failedCount = resultList.filter((passed) => !passed).length;
console.log(`askmilo-session-context-budget: ${resultList.length - failedCount} passed, ${failedCount} failed`);
process.exit(failedCount ? 1 : 0);
