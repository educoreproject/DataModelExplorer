'use strict';
// dme-resume-context.test.js — lib/dme-resume-context.js decides which askMilo conversation a DME prompt continues
// (BRIEF-dmeSessionFixes-111926 defect 1, and the 2026-11-19 adversarial review: B-1 validation, S-4 size cap, P-1
// proof, P-2 names, N-1 unusable name with saved turns, N-3 a resumed session holding other turns). The directory
// contract writes ONE probe session through askMilo's own sessionManager and deletes it again. Calls no model.
// Run: node server/test/dme-resume-context.test.js

const dmeResumeContextGen = require('../lib/dme-resume-context');
const sessionManager = require('../data-model/lib/ask-milo-multitool/lib/sessionManager');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};

const limitByName = { rebuiltContextCharacterBudget: 2000, savedTurnCountLimit: 50 };
const resumeContext = dmeResumeContextGen({ resumeProofSecret: 'resume-context-test-secret', limitByName });
const { resumeProofOf, resumeDecisionOf, askMiloSessionTurnCountOf } = resumeContext;
const { isAskMiloSessionName, askMiloSessionNameOfLogLine, answerTextOf } = dmeResumeContextGen;

const savedTurnList = [
	{ prompt: "John's first question", stdout: 'An answer.<control>{"diagram":1}</control> More answer.' },
	{ prompt: 'a follow-up', stdout: 'Second answer.' },
];
const turnCountOf = (turnCountByName) => (askMiloSessionName) => (askMiloSessionName in turnCountByName ? turnCountByName[askMiloSessionName] : null);
const decide = (overrideByName) => resumeDecisionOf({ promptText: 'next?', requestedSessionName: '', resumeProof: '', savedTurnList: undefined, askMiloSessionTurnCountOf: turnCountOf({}), ...overrideByName });

// --- construction refuses absent configuration by name
const constructionErrorOf = (constructionArgs) => {
	let errorText = '';
	try {
		dmeResumeContextGen(constructionArgs);
	} catch (constructionError) {
		errorText = constructionError.message;
	}
	return errorText;
};
check('no secret: refused by name at construction', /resumeProofSecret is required/.test(constructionErrorOf({ limitByName })));
check('no limits: refused by name at construction', /limitByName needs/.test(constructionErrorOf({ resumeProofSecret: 'x' })));

// --- the directory contract: what sessionManager writes, askMiloSessionTurnCountOf reads
const probeSessionName = `zztest_probe_${process.pid}`;
sessionManager.saveSession({ sessionName: probeSessionName, turns: [{}, {}, {}] });
check("askMiloSessionTurnCountOf reads a session askMilo's sessionManager just wrote (same directory): 3 turns", askMiloSessionTurnCountOf(probeSessionName) === 3);
sessionManager.deleteSession(probeSessionName);
check('and reads no session once it is deleted', askMiloSessionTurnCountOf(probeSessionName) === null);

// --- names (P-2)
check('a path-like name is not a session name and never reaches the filesystem', !isAskMiloSessionName('../../etc/passwd') && askMiloSessionTurnCountOf('../../etc/passwd') === null);
check('askMilo names are session names (noble_cedar, amber_arch_1763584718000); a non-string is not', isAskMiloSessionName('noble_cedar') && isAskMiloSessionName('amber_arch_1763584718000') && !isAskMiloSessionName(['noble_cedar']));
check('askMilo\'s "Session saved:" log line yields its name; a truncated or other line yields none', askMiloSessionNameOfLogLine('[x] Session saved: ivory_tide') === 'ivory_tide' && askMiloSessionNameOfLogLine('Session saved: ../x') === '' && askMiloSessionNameOfLogLine('nothing') === '');

// --- B-1: validation
check('B-1: savedTurnList [null] is refused by name', /saved turn 1 is not a \{prompt, stdout\} record/.test(decide({ savedTurnList: [null] }).refusalText));
check('B-1: a non-list, an array turn, and a numeric stdout are refused', [{ notList: true }, [[1]], [{ prompt: 'a', stdout: 5 }]].every((badList) => decide({ savedTurnList: badList }).refusalText));
check('B-1: more turns than the limit is refused by name', /more than the 50 allowed/.test(decide({ savedTurnList: new Array(51).fill({ prompt: 'p', stdout: 's' }) }).refusalText));

// --- P-1: the proof
const noProof = decide({ requestedSessionName: 'noble_cedar' });
check('P-1: a name with no proof and no saved turns is refused, nothing resumed', noProof.refusalText && !noProof.resumeSessionName);
check("P-1: a proof for another name does not unlock this one", decide({ requestedSessionName: 'noble_cedar', resumeProof: resumeProofOf('amber_arch') }).refusalText);
check('P-1: a proof made with another secret does not unlock it', decide({ requestedSessionName: 'noble_cedar', resumeProof: dmeResumeContextGen({ resumeProofSecret: 'other', limitByName }).resumeProofOf('noble_cedar') }).refusalText);
const proven = decide({ requestedSessionName: 'noble_cedar', resumeProof: resumeProofOf('noble_cedar') });
check('P-1: the proven name, no saved turns (an ordinary follow-up): resumed, prompt as typed', proven.resumeSessionName === 'noble_cedar' && proven.promptText === 'next?' && !proven.refusalText);

// --- reopened sessions
const intact = decide({ requestedSessionName: 'noble_cedar', resumeProof: resumeProofOf('noble_cedar'), savedTurnList, askMiloSessionTurnCountOf: turnCountOf({ noble_cedar: 2 }) });
check('askMilo holds exactly these 2 turns: resumed as is, no notice', intact.resumeSessionName === 'noble_cedar' && intact.promptText === 'next?' && !intact.noticeText);

const gone = decide({ requestedSessionName: 'noble_cedar', resumeProof: resumeProofOf('noble_cedar'), savedTurnList });
check('askMilo no longer has it: both turns prepended, new question last, same name kept (askMilo recreates it)', gone.resumeSessionName === 'noble_cedar' && gone.rebuiltTurnCount === 2 && gone.promptText.includes("PROMPT: John's first question") && gone.promptText.endsWith('=== NEW QUESTION ===\nnext?'), gone.promptText);
check('the rebuilt context leaves out the <control> panel blocks', !gone.promptText.includes('diagram') && gone.promptText.includes('An answer. More answer.'));
check('and the user is told, naming the lost conversation', /noble_cedar\) was no longer on the server/.test(gone.noticeText) && /rebuilt from its 2 saved turns/.test(gone.noticeText), gone.noticeText);

const contaminated = decide({ requestedSessionName: 'noble_cedar', resumeProof: resumeProofOf('noble_cedar'), savedTurnList, askMiloSessionTurnCountOf: turnCountOf({ noble_cedar: 7 }) });
check('N-3: askMilo holds 7 turns, the session 2: NOT resumed, rebuilt into a new session, and said so', contaminated.resumeSessionName === '' && contaminated.rebuiltTurnCount === 2 && /holds 7 turns, not this session's 2/.test(contaminated.noticeText), contaminated.noticeText);

const unnamed = decide({ savedTurnList });
check('no name (a session saved before proofs, or damaged): rebuilt into a new session, and said so', unnamed.resumeSessionName === '' && unnamed.rebuiltTurnCount === 2 && /could not be resumed directly/.test(unnamed.noticeText));

const unusableWithTurns = decide({ requestedSessionName: 'x; rm -rf /', savedTurnList });
check('N-1/P-2: an unusable name WITH saved turns is not refused: rebuilt into a new session', unusableWithTurns.resumeSessionName === '' && unusableWithTurns.rebuiltTurnCount === 2 && !unusableWithTurns.refusalText);

// --- S-4: the size cap
const bigTurnList = Array.from({ length: 10 }, (unused, turnIndex) => ({ prompt: `question ${turnIndex + 1}`, stdout: 'a'.repeat(500) }));
const capped = decide({ savedTurnList: bigTurnList });
check('S-4: the rebuilt context stays within its character budget', capped.promptText.length < limitByName.rebuiltContextCharacterBudget + 200, `${capped.promptText.length}`);
check('S-4: the NEWEST turns are kept, the oldest left out', capped.promptText.includes('PROMPT: question 10') && !capped.promptText.includes('PROMPT: question 1\n'), capped.promptText.slice(0, 120));
check('S-4: the user is told how many were left out', capped.omittedTurnCount > 0 && new RegExp(`The ${capped.omittedTurnCount} oldest turns were left out`).test(capped.noticeText), capped.noticeText);

check('the notice cannot be mistaken for askMilo\'s own "Session saved:" line', !/Session saved:/.test(gone.noticeText + capped.noticeText));
check('answerTextOf strips a control block with attributes, as EdunatorPanel splits it', answerTextOf('a<control type="x">b</control>c') === 'ac');

const failedCount = resultList.filter((passed) => !passed).length;
console.log(`dme-resume-context: ${resultList.length - failedCount} passed, ${failedCount} failed`);
process.exit(failedCount ? 1 : 0);
