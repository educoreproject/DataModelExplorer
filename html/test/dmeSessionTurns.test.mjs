// dmeSessionTurns.test.mjs — how a reopened DME session decides what askMilo conversation to continue
// (BRIEF-dmeSessionFixes-111926, defect 1), and what a save sends. Pure functions from html/stores/dmeSessionTurns.js.
// The fixture has the SHAPE of John Lovell's saved session as it was on 2026-11-19 (sizes and log lines taken from it,
// text invented: his conversation stays out of the repo): turn 1 answered by noble_cedar, and the follow-ups after he
// reopened it answered by a NEW session, opal_valley, because loadSession restored no name.
// Run: node html/test/dmeSessionTurns.test.mjs

import { askMiloSessionNameOfTurn, resumePlanOf, savedTurnListOf, priorTurnListOf } from '../stores/dmeSessionTurns.js';

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

// [askMilo session, stdout bytes, stderr bytes, controlHtml bytes] per turn, as saved in sessionData Iy0vEN3iRm9Vz0OkpDKm
const turnShapeList = [['noble_cedar', 13381, 1647, 3633], ['opal_valley', 5823, 1062, 1789], ['opal_valley', 12783, 1574, 9631], ['opal_valley', 12230, 1134, 10393]];
const johnTurnList = turnShapeList.map(([askMiloSessionName, stdoutBytes, stderrBytes, controlHtmlBytes], turnIndex) => ({
	prompt: `question ${turnIndex + 1}`,
	stdout: 'a'.repeat(stdoutBytes),
	stderr: `[ws-graphinator] working\nSession saved: ${askMiloSessionName}\n${'l'.repeat(stderrBytes)}`,
	controlHtml: 'c'.repeat(controlHtmlBytes),
	timestamp: 1763584718000 + turnIndex,
}));

check('an old turn names its askMilo session from its stderr log', askMiloSessionNameOfTurn(johnTurnList[0]) === 'noble_cedar', askMiloSessionNameOfTurn(johnTurnList[0]));
check('a new turn names it in askMiloSessionName, which wins over the log', askMiloSessionNameOfTurn({ askMiloSessionName: 'amber_arch', stderr: 'Session saved: opal_valley' }) === 'amber_arch');
check('a turn with neither names none', askMiloSessionNameOfTurn({ stderr: 'nothing here' }) === '');

const firstTurnOnly = resumePlanOf(johnTurnList.slice(0, 1));
check('a session answered by one askMilo session resumes it (the 11/19 failure: it resumed nothing)', firstTurnOnly.resumeSessionName === 'noble_cedar' && firstTurnOnly.isRebuildNeeded === false, JSON.stringify(firstTurnOnly));

const damaged = resumePlanOf(johnTurnList);
check("John's damaged session (noble_cedar then opal_valley) resumes neither and asks for a rebuild from all turns", damaged.resumeSessionName === '' && damaged.isRebuildNeeded === true, JSON.stringify(damaged));

check('a session with no named turn asks for a rebuild', resumePlanOf([{ prompt: 'q', stdout: 'a', stderr: '' }]).isRebuildNeeded === true);

const savedTurnList = savedTurnListOf(johnTurnList);
check('a save leaves controlHtml out of every turn and keeps the rest', savedTurnList.every((turn) => !('controlHtml' in turn) && 'stdout' in turn && 'prompt' in turn));
check('a save does not change the turns on screen', johnTurnList.every((turn) => 'controlHtml' in turn));
const fullBytes = JSON.stringify(johnTurnList).length;
const savedBytes = JSON.stringify(savedTurnList).length;
check(`leaving controlHtml out shrinks John's 4 turns (${fullBytes} -> ${savedBytes} bytes)`, savedBytes < fullBytes * 0.8, `${savedBytes} of ${fullBytes}`);

const priorTurnList = priorTurnListOf(johnTurnList);
check('the turns sent for a rebuild carry only prompt and stdout', priorTurnList.length === 4 && priorTurnList.every((turn) => Object.keys(turn).join(',') === 'prompt,stdout'));

const failedCount = resultList.filter((passed) => !passed).length;
console.log(`dmeSessionTurns: ${resultList.length - failedCount} passed, ${failedCount} failed`);
process.exit(failedCount ? 1 : 0);
