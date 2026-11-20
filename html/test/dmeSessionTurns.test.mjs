// dmeSessionTurns.test.mjs — how a reopened DME session decides what askMilo conversation to continue
// (BRIEF-dmeSessionFixes-111926, defect 1), and what a save sends. Pure functions from html/stores/dmeSessionTurns.js.
// The fixture has the SHAPE of John Lovell's saved session as it was on 2026-11-19 (sizes and log lines taken from it,
// text invented: his conversation stays out of the repo): turn 1 answered by noble_cedar, and the follow-ups after he
// reopened it answered by a NEW session, opal_valley, because loadSession restored no name.
// Run: node html/test/dmeSessionTurns.test.mjs

import fs from 'fs';
import { askMiloSessionNameOfTurn, resumePlanOf, savedTurnListOf, priorTurnListOf, controlStringOf, turnIndexListNeedingControlHtmlOf, messageByteLengthOf, SAVED_TURN_CHARACTER_LIMIT, SAVED_TURN_COUNT_LIMIT, WEB_SOCKET_MAX_PAYLOAD_BYTES } from '../stores/dmeSessionTurns.js';

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
check('a turn saved before resume proofs existed is rebuilt, not resumed by bare name (P-1)', firstTurnOnly.resumeSessionName === '' && firstTurnOnly.isRebuildNeeded === true, JSON.stringify(firstTurnOnly));

const provenTurnList = [
	{ prompt: 'q1', stdout: 'a1', stderr: '', askMiloSessionName: 'ivory_tide', askMiloResumeProof: 'a'.repeat(64) },
	{ prompt: 'q2', stdout: 'a2', stderr: '', askMiloSessionName: 'ivory_tide', askMiloResumeProof: 'b'.repeat(64) },
];
const provenPlan = resumePlanOf(provenTurnList);
check('one askMilo session behind every turn, with its proof: resumed with the NEWEST proof (the 11/19 failure: it resumed nothing)', provenPlan.resumeSessionName === 'ivory_tide' && provenPlan.resumeProof === 'b'.repeat(64) && provenPlan.isRebuildNeeded === false, JSON.stringify(provenPlan));

const damaged = resumePlanOf(johnTurnList);
check("John's damaged session (noble_cedar then opal_valley) resumes neither and asks for a rebuild from all turns", damaged.resumeSessionName === '' && damaged.isRebuildNeeded === true, JSON.stringify(damaged));

const afterRebuildPlan = resumePlanOf([provenTurnList[0], { ...provenTurnList[1], askMiloSessionName: 'dme_session_000000000000000000000001' }]);
check('N2-3: two askMilo sessions behind the turns (a rebuild happened): the NEWEST proven one is resumed, not rebuilt again', afterRebuildPlan.isRebuildNeeded === false && afterRebuildPlan.resumeSessionName === 'dme_session_000000000000000000000001' && afterRebuildPlan.resumeProof === 'b'.repeat(64), JSON.stringify(afterRebuildPlan));
const newestUnproven = resumePlanOf([provenTurnList[0], { prompt: 'q', stdout: 'a', stderr: 'Session saved: opal_valley' }]);
check('the newest named turn has no proof (legacy): rebuild, even if an older one had a proof', newestUnproven.isRebuildNeeded === true && newestUnproven.resumeSessionName === '');

check('a session with no named turn asks for a rebuild', resumePlanOf([{ prompt: 'q', stdout: 'a', stderr: '' }]).isRebuildNeeded === true);

const savedTurnList = savedTurnListOf(johnTurnList);
check('a save leaves controlHtml out of every turn and keeps the rest', savedTurnList.every((turn) => !('controlHtml' in turn) && 'stdout' in turn && 'prompt' in turn));
check('a save does not change the turns on screen', johnTurnList.every((turn) => 'controlHtml' in turn));
const fullBytes = JSON.stringify(johnTurnList).length;
const savedBytes = JSON.stringify(savedTurnList).length;
check(`leaving controlHtml out shrinks John's 4 turns (${fullBytes} -> ${savedBytes} bytes)`, savedBytes < fullBytes * 0.8, `${savedBytes} of ${fullBytes}`);

const priorTurnList = priorTurnListOf(johnTurnList);
check('the turns sent for a rebuild carry prompt, stdout and the askMilo session that answered each', priorTurnList.length === 4 && priorTurnList.every((turn) => Object.keys(turn).join(',') === 'prompt,stdout,askMiloSessionName') && priorTurnList[0].askMiloSessionName === 'noble_cedar');

const serverLimitByName = JSON.parse(fs.readFileSync(new URL('../../server/lib/dme-resume-limits.json', import.meta.url), 'utf8'));
check('the browser caps equal the server caps (server/lib/dme-resume-limits.json: characters, turns, message bytes)', SAVED_TURN_CHARACTER_LIMIT === serverLimitByName.savedTurnCharacterLimit && SAVED_TURN_COUNT_LIMIT === serverLimitByName.savedTurnCountLimit && WEB_SOCKET_MAX_PAYLOAD_BYTES === serverLimitByName.webSocketMaxPayloadBytes, JSON.stringify(serverLimitByName));
const manyTurnList = Array.from({ length: SAVED_TURN_COUNT_LIMIT + 5 }, (unused, turnIndex) => ({ prompt: `q${turnIndex + 1}`, stdout: 'a', askMiloSessionName: 'amber_arch' }));
check('N3-6: a session of more turns than the server allows sends only the newest SAVED_TURN_COUNT_LIMIT', priorTurnListOf(manyTurnList).length === SAVED_TURN_COUNT_LIMIT && priorTurnListOf(manyTurnList)[SAVED_TURN_COUNT_LIMIT - 1].prompt === `q${SAVED_TURN_COUNT_LIMIT + 5}`);
const oneHugeTurnList = [{ prompt: 'older', stdout: 'small', askMiloSessionName: 'amber_arch' }, { prompt: 'newest', stdout: `${'w'.repeat(900000)}THE-END`, askMiloSessionName: 'amber_arch' }];
const oneHugePriorList = priorTurnListOf(oneHugeTurnList);
const oneHugeCharacterCount = oneHugePriorList.reduce((soFar, turn) => soFar + turn.prompt.length + turn.stdout.length + turn.askMiloSessionName.length, 0);
check('N3-1: a newest turn alone over the cap is sent cut to its newest end (it used to become an empty placeholder)', oneHugeCharacterCount <= SAVED_TURN_CHARACTER_LIMIT && oneHugePriorList[1].stdout.endsWith('THE-END') && oneHugePriorList[1].prompt === 'newest' && oneHugePriorList[0].stdout === '', `${oneHugeCharacterCount}`);
check('messageByteLengthOf counts UTF-8 bytes, as the server does', messageByteLengthOf('aé漢') === 6);
const hugeTurnList = Array.from({ length: 6 }, (unused, turnIndex) => ({ prompt: `q${turnIndex + 1}`, stdout: 'z'.repeat(200000), askMiloSessionName: 'amber_arch' }));
const cappedPriorList = priorTurnListOf(hugeTurnList);
const sentCharacterCount = cappedPriorList.reduce((soFar, turn) => soFar + turn.prompt.length + turn.stdout.length + turn.askMiloSessionName.length, 0);
check('B2-2: a 1.2-million-character session is sent within the cap: newest turns whole, older ones as placeholders, every turn still counted', sentCharacterCount <= SAVED_TURN_CHARACTER_LIMIT && cappedPriorList.length === 6 && cappedPriorList[5].stdout.length === 200000 && cappedPriorList[0].stdout === '' && cappedPriorList[0].askMiloSessionName === 'amber_arch', `${sentCharacterCount}`);

// S-6: Save All after a load must draw the panels of turns never viewed
check('controlStringOf joins control blocks as the panel splits them', controlStringOf('a<control>X</control>b<control type="y">Y</control>') === '\x00X\x00Y');
const loadedTurnList = [{ stdout: '<control>P1</control>' }, { stdout: 'no panel' }, { stdout: '<control>P3</control>', controlHtml: '<div>drawn</div>' }, { stdout: '<control>P4</control>' }];
check('S-6: the turns needing their panel drawn for Save All are those with control blocks and no controlHtml (1 and 4)', JSON.stringify(turnIndexListNeedingControlHtmlOf(loadedTurnList)) === '[0,3]', JSON.stringify(turnIndexListNeedingControlHtmlOf(loadedTurnList)));

const failedCount = resultList.filter((passed) => !passed).length;
console.log(`dmeSessionTurns: ${resultList.length - failedCount} passed, ${failedCount} failed`);
process.exit(failedCount ? 1 : 0);
